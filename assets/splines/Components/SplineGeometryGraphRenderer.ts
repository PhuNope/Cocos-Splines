import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {_decorator,Component,MeshRenderer,Mesh,Material,JsonAsset,Vec3,Mat4,utils,Collider,PhysicsSystem,geometry} from 'cc';
import {SplineContainer} from '../Core/SplineContainer';
import {RoadFrame} from '../Core/SplineRoadMath';
import {createWorldFrameField} from '../Core/SplineWorldFrames';
import {buildMeshGizmoLines,MeshGizmoLines} from '../Core/SplineMeshGizmos';
import {DEFAULT_GEOMETRY_GRAPH,GeometryGraphRunner,parseGeometryGraph,GeometryGraphProfile,GeometryGraphPlan,GeometryGraphContext,GeometryGraphSplineSource,graphProfileSlots}
    from '../Core/SplineGeometryGraph';
import {parseGraphProfileAsset} from '../Core/SplineProfileExtrudeMath';
import {readGraphSourceMeshAsset,graphMeshDataFingerprint}
    from '../Core/SplineGraphMeshAssetReader';
import {createGraphMultiOutputMesh,graphMultiMeshGizmoGeometry,resolveGraphOutputOrder,graphOutputMeshSourceSlots}
    from '../Core/SplineGeometryGraphMultiMesh';
import {registerGizmos} from 'db://cocos-gizmos/RegisterGizmos';
import {SplineGeometryGraphGizmos} from '../Editor/SplineMeshDrawers';

const {ccclass,property,menu,executeInEditMode,requireComponent}=_decorator;
/** First procedural graph consumer (Phase 4.1). One explicit Spline source,
 * typed path operations and a Ribbon mesh output. No source asset mutation,
 * no unsandboxed graph scripts and no manual MeshRenderer mesh overwrite
 * except for instances owned by this component.
 */
@ccclass('Splines.SplineGeometryGraphRenderer')
@registerGizmos(SplineGeometryGraphGizmos)
@menu('Splines/Procedural Geometry Graph')
@executeInEditMode(true)
@requireComponent(MeshRenderer)
export class SplineGeometryGraphRenderer extends Component {
    @property({type:SplineContainer,tooltip:'Source spline. Never modified by graph execution.'})
    spline:SplineContainer|null=null;
    @property({type:SplineContainer,tooltip:'Optional independent Spline source slot B (1).'})
    splineB:SplineContainer|null=null;
    @property({type:SplineContainer,tooltip:'Optional independent Spline source slot C (2).'})
    splineC:SplineContainer|null=null;
    @property({multiline:true,tooltip:'Versioned typed graph JSON v1/v2 (multi-output).'})
    graphJson=DEFAULT_GEOMETRY_GRAPH;
    /** Editor canvas coordinates only. Kept separate from graphJson so dragging
     * cards never invalidates the geometry/frame cache. Serialized with Scene.
     */
    @property({tooltip:'Visual Graph layout only (positions JSON); does not change generated geometry.'})
    graphLayoutJson='{}';
    @property({tooltip:'Opt-in: use a shared Cocos JsonAsset graph instead of local graphJson.'})
    useGraphAsset=false;
    @property({type:JsonAsset,tooltip:'Drag a .json graph from Assets. Shared and read-only for all referencing renderers.'})
    graphAsset:JsonAsset|null=null;
    /** V2: select an Output Node by ID. Empty means the graph's default
     * `output`. A renderer owns one MeshRenderer; use multiple renderers
     * referencing the same JsonAsset to display multiple branches.
     */
    @property({tooltip:'V2 graph: optional Output Node ID (e.g. outputBranch). Empty uses graph default.'})
    outputId='';
    /** Opt-in: each V2 Output Node becomes one material primitive in this
     * same MeshRenderer. No children/components are created.
     * Material order defaults to lexicographically sorted Output IDs.
     * A renderer-local Output Order override can change the mapping.
     */
    @property({tooltip:'V2 only: render all 2–4 graph outputs as material submeshes in one MeshRenderer.'})
    renderAllOutputs=false;
    /** Optional per-renderer permutation; never writes shared JsonAsset. */
    @property({tooltip:'Render All Outputs: comma-separated Output Node IDs in Material A/B/C/D slot order.'})
    outputOrder='';
    /** Input slot for optional typed graph meshAsset nodes. This is a native
     * project Mesh reference, never raw vertex data in graph JSON.
     */
    @property({type:Mesh,tooltip:'Readable Mesh Asset for slot A.'})
    sourceMesh:Mesh|null=null;
    @property({type:Mesh,tooltip:'Mesh Asset slot 1, for meshAsset node with Slot B (1).'})
    sourceMeshB:Mesh|null=null;
    @property({type:Mesh,tooltip:'Mesh Asset slot 2, for meshAsset node with Slot C (2).'})
    sourceMeshC:Mesh|null=null;
    /** Opt-in submesh selectors for readable imported models with 1–4 submeshes.
     * Each source slot still creates one mesh output per renderer; no changes to
     * Cocos Material slots or child Nodes are made automatically.
     */
    @property({min:0,max:3,step:1,tooltip:'Source Mesh A: imported submesh index 0–3. Requires Allow Data Access. 0 keeps legacy behavior.'})
    sourceSubMesh=0;
    @property({min:0,max:3,step:1,tooltip:'Source Mesh B: imported submesh index 0–3. Must exist in the assigned Mesh.'})
    sourceSubMeshB=0;
    @property({min:0,max:3,step:1,tooltip:'Source Mesh C: imported submesh index 0–3. Must exist in the assigned Mesh.'})
    sourceSubMeshC=0;
    /** Optional data-only JsonAsset profiles; Extrude nodes opt in with
     * profileSlot 0/1/2. Existing preset graphs do not read these assets.
     */
    @property({type:JsonAsset,tooltip:'Extrude Profile Slot A: cocos-splines/profile v1 polygon JsonAsset.'})
    profileAssetA:JsonAsset|null=null;
    @property({type:JsonAsset,tooltip:'Extrude Profile Slot B: independent authored polygon JsonAsset.'})
    profileAssetB:JsonAsset|null=null;
    @property({type:JsonAsset,tooltip:'Extrude Profile Slot C: independent authored polygon JsonAsset.'})
    profileAssetC:JsonAsset|null=null;
    /** Imported FBX/glTF Materials are on the model MeshRenderer, not the
     * Mesh geometry asset. These are read-only source renderer references.
     */
    @property({tooltip:'Render All Outputs only: read matching submesh Materials from imported model MeshRenderer(s).'})
    autoBindImportedMaterials=false;
    @property({type:MeshRenderer,tooltip:'Mesh slot A: imported model MeshRenderer using the SAME Source Mesh A.'})
    materialSourceRenderer:MeshRenderer|null=null;
    @property({type:MeshRenderer,tooltip:'Mesh slot B: imported model MeshRenderer using the SAME Source Mesh B.'})
    materialSourceRendererB:MeshRenderer|null=null;
    @property({type:MeshRenderer,tooltip:'Mesh slot C: imported model MeshRenderer using the SAME Source Mesh C.'})
    materialSourceRendererC:MeshRenderer|null=null;
    /** Active V1/V2 graph text for read-only export and rebuilding.
     * Serializing the asset is a content-based revision: updating its JSON
     * changes dependent renderers even when the asset UUID stays the same.
     */
    public activeGraphJson():string{
        if(!this.useGraphAsset)return this.graphJson;
        if(!this.graphAsset||!this.graphAsset.json)
            throw Error('Geometry Graph asset mode needs an assigned JsonAsset.');
        const payload=JSON.stringify(this.graphAsset.json);
        if(typeof payload!=='string'||payload.length<2||payload.length>16384)
            throw Error('Geometry Graph JsonAsset exceeds the supported 16 KiB JSON limit.');
        return payload;
    }
    @property({min:2,max:64,step:1,tooltip:'Sample resolution per Bezier segment. Full graph is evaluated on Rebuild.'})
    samplesPerCurve=12;
    @property({type:Material,tooltip:'Optional shared material; otherwise respects a manually assigned MeshRenderer material.'})
    material:Material|null=null;
    @property({type:Material,tooltip:'All Outputs: material slot 1 (second sorted Output ID). Empty respects MeshRenderer material.'})
    materialB:Material|null=null;
    @property({type:Material,tooltip:'All Outputs: material slot 2 (third sorted Output ID). Empty respects MeshRenderer material.'})
    materialC:Material|null=null;
    @property({type:Material,tooltip:'All Outputs: material slot 3 (fourth sorted Output ID). Empty respects MeshRenderer material.'})
    materialD:Material|null=null;
    @property({tooltip:'Rebuild when graph, spline geometry, or output transform changes.'})
    rebuildOnChange=true;
    @property({tooltip:'Selected-only wireframe of generated mesh through Cocos-Gizmos v3.'})
    showMeshGizmos=false;
    @property({min:24,max:1200,step:1})
    gizmoEdgeLimit=300;

    private _mesh:Mesh|null=null;
    private _gizmo:MeshGizmoLines|null=null;
    private _fallback:Material|null=null;
    private _boundMaterials:(Material|null)[]=[];
    private _lastMaterialWarning='';
    private _subMeshCount=1;
    private _autoSourceSlots:(number|null)[]=[];
    private _renderedOutputIds:string[]=[];
    private _revision='';
    private _lastAttempt='';
    @property({type:[Collider],tooltip:'Explicit Conform Path targets (1–64 active 3D Colliders).'})
    conformColliders:Collider[]=[];
    private _conformRevision=0;
    private _conformTargetIds=new WeakMap<Collider,number>();
    private _nextConformTargetId=0;
    private conformTargetId(c:Collider):number|null{
        if(!c)return null;
        let id=this._conformTargetIds.get(c);
        if(id===undefined){id=++this._nextConformTargetId;this._conformTargetIds.set(c,id);}
        return id;
    }
    private _runner=new GeometryGraphRunner();
    private _splineFrameCache=new Map<number,GeometryGraphSplineSource>();
    private _splineIds=new WeakMap<SplineContainer,number>();
    private _nextSplineId=0;
    public getMeshGizmoGeometry():MeshGizmoLines|null{return this._gizmo;}
    /** Material slot order for the currently committed generated Mesh only. */
    public getRenderedOutputIds():string[]{return this._renderedOutputIds.slice();}
    public getGraphMetrics():{computed:number;reused:number;nodes:number}{
        return this._runner.metrics;
    }
    /** Explicit cold/warm diagnostic without adding serialized Scene properties.
     * The isolated profiling runner never changes the live graph cache or
     * owned MeshRenderer; a stale spline frame cache is refreshed through the
     * regular atomic rebuild first.
     */
    public profileGraph():{
        cold:GeometryGraphProfile;warm:GeometryGraphProfile;
        graphVersion:number;outputId:string;sampledFrames:number;
    }{
        const plan=parseGeometryGraph(this.activeGraphJson());
        const slots=this.splineSlots(plan);
        if(slots.some(slot=>this._splineFrameCache.get(slot)?.revision!==this.frameSignature(slot)))
            this.rebuild();
        const frameContext=this.splineFrameContext(plan,this._splineFrameCache);
        const selected=this.renderAllOutputs?'':
            (typeof this.outputId==='string'?this.outputId.trim():'');
        const runner=new GeometryGraphRunner();
        runner.setProfilingEnabled(true);
        const context={...frameContext,
            worldUvLinear:this.worldUvLinear(),
            ...this.graphMeshContext(plan),...this.graphProfileContext(plan),...this.graphConformContext(plan)};
        runner.evaluate(plan,context,selected||undefined);
        const cold=runner.profile!;
        runner.evaluate(plan,context,selected||undefined);
        const warm=runner.profile!;
        return {
            cold,warm,graphVersion:plan.version??1,
            outputId:selected||plan.output,
            sampledFrames:context.frames.length,
        };
    }
    private source():SplineContainer|null{
        return this.spline||this.getComponent(SplineContainer);
    }
    private splineSlot(slot:number):SplineContainer|null{
        return slot===0?this.source():slot===1?this.splineB:this.splineC;
    }
    private splineSlots(plan:GeometryGraphPlan):number[]{
        return plan.nodes.filter(n=>n.type==='spline').map(n=>n.slot??0).sort((a,b)=>a-b);
    }
    private splineIdentity(source:SplineContainer|null):number|null{
        if(!source)return null;
        let id=this._splineIds.get(source);
        if(id===undefined){id=++this._nextSplineId;this._splineIds.set(source,id);}
        return id;
    }
    private frameSignature(slot:number):string {
        const source=this.splineSlot(slot);
        const matrix=(m:Mat4|undefined)=>m?[
            m.m00,m.m01,m.m02,m.m04,m.m05,m.m06,
            m.m08,m.m09,m.m10,m.m12,m.m13,m.m14,
        ]:null;
        return JSON.stringify([
            this.splineIdentity(source),source?.node?.uuid,source?.getRevision(),source?.closed,
            source?.enabled,source?.node?.isValid,source?.node?.activeInHierarchy,matrix(source?.node.worldMatrix),
            matrix(this.node?.worldMatrix),this.samplesPerCurve,
        ]);
    }
    /** Prepare only referenced sources. Cache entries are committed with the mesh. */
    private prepareSplineFrames(plan:GeometryGraphPlan):Map<number,GeometryGraphSplineSource>{
        const next=new Map<number,GeometryGraphSplineSource>();
        for(const slot of this.splineSlots(plan)){
            const source=this.splineSlot(slot);
            if(!source||source.count<2||source.segmentCount<1||source.enabled===false||
               source.node?.isValid===false||source.node?.activeInHierarchy===false)
                throw Error('Geometry Graph requires an active SplineContainer (2+ knots) in slot '+slot+'.');
            const revision=this.frameSignature(slot),cached=this._splineFrameCache.get(slot);
            if(cached?.revision===revision){next.set(slot,cached);continue;}
            const samples=Math.max(2,Math.min(64,Math.floor(this.samplesPerCurve)));
            const count=Math.min(1024,Math.max(2,source.segmentCount*samples));
            const inverse=Mat4.invert(new Mat4(),this.node.worldMatrix);
            // Use Road's stable World frames and convert POSITION + BASIS to this
            // renderer's local space before passing any data to the pure graph.
            const worldFrames=createWorldFrameField(source,0,1,count);
            const basisToLocal=(world:Vec3,v:Vec3,local:Vec3):Vec3=>{
                const tip=Vec3.add(new Vec3(),world,v);
                Vec3.transformMat4(tip,tip,inverse);
                return Vec3.subtract(new Vec3(),tip,local);
            };
            const frames:RoadFrame[]=[];
            let previous:Vec3|null=null,distance=0;
            for(const f of worldFrames.frames){
                const world=new Vec3(f.position.x,f.position.y,f.position.z);
                const local=Vec3.transformMat4(new Vec3(),world,inverse);
                if(previous)distance+=Vec3.subtract(new Vec3(),world,previous).length();
                previous=world;
                frames.push({
                    position:{x:local.x,y:local.y,z:local.z},
                    forward:basisToLocal(world,new Vec3(f.tangent.x,f.tangent.y,f.tangent.z),local),
                    right:basisToLocal(world,new Vec3(f.right.x,f.right.y,f.right.z),local),
                    up:basisToLocal(world,new Vec3(f.up.x,f.up.y,f.up.z),local),
                    distance,
                });
            }
            next.set(slot,{frames,closed:source.closed,revision});
        }
        return next;
    }
    private splineFrameContext(plan:GeometryGraphPlan,cache:Map<number,GeometryGraphSplineSource>):
        Pick<GeometryGraphContext,'frames'|'closed'|'revision'|'splineSources'>{
        const slots=this.splineSlots(plan);
        const splineSources:Array<GeometryGraphSplineSource|undefined>=[];
        for(const slot of slots){
            const frame=cache.get(slot);
            if(!frame)throw Error('Missing sampled Spline source slot '+slot+'.');
            splineSources[slot]=frame;
        }
        // Preserve legacy required fields and existing profile sampledFrames
        // report (first active slot), while Core consumes the explicit slots.
        const primary=splineSources[slots[0]]!;
        return {...primary,splineSources};
    }
    /** Renderer local->world linear basis (column-major), no translation.
     * Used only by Profile UV opted into uWorldSpace; frame distances are
     * already physical world arc lengths and MUST NOT be scaled again.
     */
    private worldUvLinear():number[]{
        const m=this.node.worldMatrix;
        return [m.m00,m.m01,m.m02,m.m04,m.m05,m.m06,m.m08,m.m09,m.m10];
    }
    private slotMesh(slot:number):Mesh|null{
        return slot===0?this.sourceMesh:slot===1?this.sourceMeshB:this.sourceMeshC;
    }
    private slotSubMesh(slot:number):number{
        return slot===0?this.sourceSubMesh:
            slot===1?this.sourceSubMeshB:this.sourceSubMeshC;
    }
    private profileAsset(slot:number):JsonAsset|null{
        return slot===0?this.profileAssetA:
            slot===1?this.profileAssetB:this.profileAssetC;
    }
    /** Validate a fresh copy; modified asset content changes per-slot
     * revisions without changing shared Graph JSON or Spline samples.
     */
    private graphProfileContext(plan:GeometryGraphPlan):
        Pick<GeometryGraphContext,'profileSources'|'profileUVs'|'profileHoles'|'profileOuterContours'|'profileOuterHoles'|'profileRevisions'>{
        const slots=[...new Set(plan.nodes.flatMap(graphProfileSlots))];
        if(slots.length===0)return {};
        const sources:NonNullable<GeometryGraphContext['profileSources']>[number][]=[];
        const uvs:NonNullable<GeometryGraphContext['profileUVs']>[number][]=[];
        const holes:NonNullable<GeometryGraphContext['profileHoles']>[number][]=[];
        const outerContours:NonNullable<GeometryGraphContext['profileOuterContours']>[number][]=[];
        const outerHoles:NonNullable<GeometryGraphContext['profileOuterHoles']>[number][]=[];
        const revisions:(string|undefined)[]=[];
        for(const slot of slots){
            const asset=this.profileAsset(slot);
            if(!asset||!asset.json)
                throw Error('Graph Profile Asset slot '+slot+' requires an assigned JsonAsset.');
            const profile=parseGraphProfileAsset(asset.json);
            sources[slot]=profile.points;
            uvs[slot]=profile.uv;
            holes[slot]=profile.holes;
            outerContours[slot]=profile.outerContours;
            outerHoles[slot]=profile.outerHoles;
            revisions[slot]=JSON.stringify(profile);
        }
        return {profileSources:sources,profileUVs:uvs,profileHoles:holes,profileOuterContours:outerContours,profileOuterHoles:outerHoles,profileRevisions:revisions};
    }
    private sourceMaterialRenderer(slot:number):MeshRenderer|null{
        return slot===0?this.materialSourceRenderer:
            slot===1?this.materialSourceRendererB:this.materialSourceRendererC;
    }
    /** Resolve ALL imported materials before writing any output slot. Missing
     * or mismatched FBX model references never partially change the renderer.
     */
    private importedMaterials(
        slots:ReadonlyArray<number|null>,overrides:ReadonlyArray<Material|null>,
        outputRenderer:MeshRenderer,
    ):(Material|null)[]{
        if(!this.renderAllOutputs||!this.autoBindImportedMaterials)
            return slots.map(()=>null);
        return slots.map((slot,index)=>{
            if(slot===null||overrides[index])return null;
            const source=this.sourceMaterialRenderer(slot);
            if(!source||source===outputRenderer)
                throw Error('Imported Material Source Renderer '+String(slot)+
                    ' must reference a separate FBX/glTF model MeshRenderer.');
            if(!this.slotMesh(slot)||source.mesh!==this.slotMesh(slot))
                throw Error('Imported Material Source Renderer '+String(slot)+
                    ' Mesh does not match Source Mesh slot.');
            const submesh=this.slotSubMesh(slot);
            const material=source.getSharedMaterial(submesh);
            if(!material)
                throw Error('Imported Material Source Renderer '+String(slot)+
                    ' is missing Material for Source Submesh '+String(submesh)+'.');
            return material;
        });
    }
    /** No scene scans; capture only explicit active targets. */
    private graphConformTargets():Collider[]{
        const refs=this.conformColliders;
        if(!Array.isArray(refs)||refs.length<1||refs.length>64||new Set(refs).size!==refs.length)
            throw Error('Conform Path requires 1–64 unique explicit 3D Colliders.');
        const root=(n:typeof this.node)=>{
            let depth=0;
            while(n.parent){if(++depth>128)throw Error('Invalid Conform Scene hierarchy.');n=n.parent;}
            return n;
        };
        const scene=root(this.node);
        for(const c of refs)
            if(!c?.node||c.node.isValid===false||c.node.activeInHierarchy===false||
               c.enabled===false||root(c.node)!==scene||c.node===this.node)
                throw Error('Conform targets must be active in the same Scene and not on the output Node.');
        return refs.slice();
    }
    private graphConformSignature(plan:GeometryGraphPlan):unknown{
        if(!plan.nodes.some(n=>n.type==='conform'))return null;
        // Keep invalid reference states observable so fixing assignments retries.
        return (Array.isArray(this.conformColliders)?this.conformColliders:[]).map(c=>{
            const m=c?.node?.worldMatrix,b=c?.worldBounds;
            return [this.conformTargetId(c),c?.node?.uuid,c?.enabled,c?.node?.activeInHierarchy,c?.node?.isValid,
                m?[m.m00,m.m01,m.m02,m.m04,m.m05,m.m06,m.m08,m.m09,m.m10,m.m12,m.m13,m.m14]:null,
                b?[b.center.x,b.center.y,b.center.z,b.halfExtents.x,b.halfExtents.y,b.halfExtents.z]:null];
        });
    }
    private graphConformContext(plan:GeometryGraphPlan):Pick<GeometryGraphContext,'conformSurface'>{
        if(!plan.nodes.some(n=>n.type==='conform'))return {};
        const targets=this.graphConformTargets(),physics=PhysicsSystem?.instance;
        if(!physics||typeof physics.raycast!=='function'||typeof geometry?.Ray!=='function')
            throw Error('Conform Path requires working 3D Physics raycasts.');
        const m=this.node.worldMatrix;
        return {conformSurface:{
            revision:String(++this._conformRevision),targetCount:targets.length,
            origin:{x:m.m12,y:m.m13,z:m.m14},
            raycast:(origin,length)=>{
                const ray=new geometry.Ray(origin.x,origin.y,origin.z,0,-1,0);
                if(!physics.raycast(ray,0xffffffff,length,false))return [];
                const hits=physics.raycastResults;
                if(!Array.isArray(hits)||hits.length>2048)throw Error('Invalid Conform Physics hits.');
                return hits.map(hit=>({
                    targetIndex:targets.indexOf(hit.collider),distance:hit.distance,
                    point:{x:hit.hitPoint?.x??NaN,y:hit.hitPoint?.y??NaN,z:hit.hitPoint?.z??NaN},
                    normal:{x:hit.hitNormal?.x??NaN,y:hit.hitNormal?.y??NaN,z:hit.hitNormal?.z??NaN},
                }));
            },
        }};
    }
    private signature():string {
        const json=this.activeGraphJson();
        const slots=json.includes('"meshAsset"')?
            [...new Set(parseGeometryGraph(json).nodes.filter(n=>n.type==='meshAsset')
                .map(n=>n.slot??0))].sort((a,b)=>a-b):[];
        const assets=slots.map(slot=>[slot,this.slotSubMesh(slot),graphMeshDataFingerprint(this.slotMesh(slot))]);
        const plan=parseGeometryGraph(json);
        const profiles=this.graphProfileContext(plan);
        const activeProfileRevisions=Object.entries(profiles.profileRevisions||{});
        return JSON.stringify([this.splineSlots(plan).map(slot=>[slot,this.frameSignature(slot)]),json,this.renderAllOutputs?null:this.outputId,this.renderAllOutputs,
            this.renderAllOutputs?this.outputOrder:null,
            this.renderAllOutputs?this.autoBindImportedMaterials:null,
            assets,activeProfileRevisions,this.gizmoEdgeLimit,this.graphConformSignature(plan)]);
    }
    private graphMeshContext(plan:GeometryGraphPlan):
        Pick<GeometryGraphContext,'meshSource'|'meshRevision'|'meshSources'|'meshRevisions'>{
        const slots=[...new Set(plan.nodes.filter(n=>n.type==='meshAsset')
            .map(n=>n.slot??0))];
        if(slots.length===0)return {};
        const meshSources:NonNullable<GeometryGraphContext['meshSources']>[number][]=[];
        const meshRevisions:(string|undefined)[]=[];
        for(const slot of slots){
            const data=readGraphSourceMeshAsset(this.slotMesh(slot),this.slotSubMesh(slot));
            meshSources[slot]=data.geometry;
            meshRevisions[slot]=data.revision;
        }
        return {meshSources,meshRevisions,
            meshSource:meshSources[0],meshRevision:meshRevisions[0]};
    }
    private syncMaterial(renderer:MeshRenderer|null):void {
        if(!renderer)return;
        const overrides=[this.material,this.materialB,this.materialC,this.materialD];
        const imported=this.importedMaterials(this._autoSourceSlots,overrides,renderer);
        for(let i=0;i<this._subMeshCount;i++){
            const current=renderer.getSharedMaterial(i);
            const selected=overrides[i]||imported[i]||null;
            if(selected){
                if(current!==selected)renderer.setSharedMaterial(selected,i);
                this._boundMaterials[i]=selected;
            }else{
                const bound=this._boundMaterials[i];
                if(!current||(bound&&current===bound)){
                    if(!this._fallback){
                        this._fallback=new Material();
                        this._fallback.initialize({effectName:'builtin-unlit'});
                    }
                    if(current!==this._fallback)renderer.setSharedMaterial(this._fallback,i);
                }
                this._boundMaterials[i]=null;
            }
        }
    }
    onEnable():void {
        if([this.source(),this.splineB,this.splineC].some(s=>s&&s.count>=2)){
            try{this.rebuild();}
            catch(error){if(EDITOR_NOT_IN_PREVIEW)console.warn('[SplineGeometryGraph] Rebuild failed:',error);}
        }
    }
    update():void {
        try{this.syncMaterial(this.getComponent(MeshRenderer));}
        catch(error){
            // Invalid imported references cannot partially change output slots.
            if(EDITOR_NOT_IN_PREVIEW&&String(error)!==this._lastMaterialWarning){
                console.warn('[SplineGeometryGraph] Material binding failed:',error);
                this._lastMaterialWarning=String(error);
            }
        }
        if(!this.rebuildOnChange)return;
        let signature:string;
        try{signature=this.signature();}
        catch(error){return;}
        if(signature===this._revision||signature===this._lastAttempt)return;
        this._lastAttempt=signature;
        try{this.rebuild();}
        catch(error){if(EDITOR_NOT_IN_PREVIEW)console.warn('[SplineGeometryGraph] Rebuild failed:',error);}
    }
    /** Two-phase mesh commit: a parse, evaluator or createMesh failure keeps
     * the previously rendered mesh and its wireframe intact.
     */
    public rebuild():void{
        const renderer=this.getComponent(MeshRenderer);
        if(!renderer)throw Error('Geometry Graph requires a MeshRenderer.');
        const plan=parseGeometryGraph(this.activeGraphJson());
        const nextFrames=this.prepareSplineFrames(plan);
        const signature=this.signature();
        const selection=typeof this.outputId==='string'?this.outputId.trim():'';
        const context={...this.splineFrameContext(plan,nextFrames),
            worldUvLinear:this.worldUvLinear(),
            ...this.graphMeshContext(plan),...this.graphProfileContext(plan),...this.graphConformContext(plan)};
        let mesh:Mesh,wire:MeshGizmoLines,outputIds:string[];
        let nextMaterialSlots:(number|null)[]=[];
        if(this.renderAllOutputs){
            if(plan.version!==2||!plan.outputs||
                plan.outputs.length<2||plan.outputs.length>4)
                throw Error('Render All Outputs requires a V2 graph with 2–4 Output Nodes.');
            // Each output is evaluated atomically by the typed runner and
            // converted to a distinct vertex bundle / index buffer / material
            // primitive. The resolved per-renderer order defines material slots.
            const outputs=this._runner.evaluateOutputs(plan,context);
            const orderedIds=resolveGraphOutputOrder(plan.outputs,this.outputOrder);
            nextMaterialSlots=graphOutputMeshSourceSlots(plan,orderedIds);
            // Validate imported MeshRenderer/Material references BEFORE
            // creating a transient Mesh or committing a new output.
            this.importedMaterials(nextMaterialSlots,
                [this.material,this.materialB,this.materialC,this.materialD],renderer);
            const chunks=orderedIds.map(outputId=>({
                outputId,geometry:outputs[outputId],
            }));
            const wireGeometry=graphMultiMeshGizmoGeometry(chunks);
            wire=buildMeshGizmoLines(
                wireGeometry.positions,wireGeometry.indices,this.gizmoEdgeLimit);
            mesh=createGraphMultiOutputMesh(chunks).mesh;
            outputIds=orderedIds;
        }else{
            const geometry=this._runner.evaluate(plan,context,selection||undefined);
            wire=buildMeshGizmoLines(
                geometry.positions,geometry.indices,this.gizmoEdgeLimit);
            mesh=utils.createMesh({
                positions:geometry.positions,normals:geometry.normals,
                uvs:geometry.uvs,indices:geometry.indices,
            });
            outputIds=[selection||plan.output];
        }
        // A failing renderer assignment must not destroy the previously bound
        // generated Mesh or a manually assigned external Mesh asset.
        const previousMesh=this._mesh,previousBoundMesh=renderer.mesh;
        const oldSlots=this._autoSourceSlots,oldCount=this._subMeshCount;
        const oldBoundMaterials=this._boundMaterials.slice();
        const oldRendererMaterials=[0,1,2,3].map(i=>renderer.getSharedMaterial(i));
        try{
            renderer.mesh=mesh;
            this._autoSourceSlots=nextMaterialSlots;
            this._subMeshCount=outputIds.length;
            this.syncMaterial(renderer);
        }catch(error){
            // Best-effort native rollback; never destroy a previously owned
            // successful Mesh on a failed Mesh/material commit.
            try{if(renderer.mesh===mesh)renderer.mesh=previousBoundMesh;}catch{}
            for(let i=0;i<4;i++){
                try{
                    if(renderer.getSharedMaterial(i)!==oldRendererMaterials[i])
                        renderer.setSharedMaterial(oldRendererMaterials[i],i);
                }catch{}
            }
            this._autoSourceSlots=oldSlots;
            this._subMeshCount=oldCount;
            this._boundMaterials=oldBoundMaterials;
            mesh.destroy();
            throw error;
        }
        this._mesh=mesh;this._gizmo=wire;
        this._renderedOutputIds=outputIds;
        this._splineFrameCache=nextFrames;
        this._revision=signature;this._lastAttempt='';this._lastMaterialWarning='';
        if(previousMesh&&previousMesh!==mesh)previousMesh.destroy();
    }
    onDestroy():void{
        const renderer=this.getComponent(MeshRenderer);
        if(this._mesh&&renderer?.mesh===this._mesh)renderer.mesh=null;
        this._mesh?.destroy();this._mesh=null;this._gizmo=null;
        if(renderer&&this._fallback){
            for(let i=0;i<4;i++){
                if(renderer.getSharedMaterial(i)===this._fallback)
                    renderer.setSharedMaterial(null,i);
            }
        }
        this._fallback?.destroy();this._fallback=null;
        this._boundMaterials=[];this._subMeshCount=1;
        this._autoSourceSlots=[];this._renderedOutputIds=[];this._lastMaterialWarning='';
        this._runner.clear();this._splineFrameCache.clear();
    }
}
