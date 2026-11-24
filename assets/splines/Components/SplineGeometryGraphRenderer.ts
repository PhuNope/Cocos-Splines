import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {_decorator,Component,MeshRenderer,Mesh,Material,Vec3,Mat4,utils} from 'cc';
import {SplineContainer} from '../Core/SplineContainer';
import {RoadFrame} from '../Core/SplineRoadMath';
import {createWorldFrameField} from '../Core/SplineWorldFrames';
import {buildMeshGizmoLines,MeshGizmoLines} from '../Core/SplineMeshGizmos';
import {DEFAULT_GEOMETRY_GRAPH,GeometryGraphRunner,parseGeometryGraph}
    from '../Core/SplineGeometryGraph';
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
    @property({multiline:true,tooltip:'Versioned typed node graph JSON v1. Supported: spline, offset, width, ribbon, output.'})
    graphJson=DEFAULT_GEOMETRY_GRAPH;
    /** Editor canvas coordinates only. Kept separate from graphJson so dragging
     * cards never invalidates the geometry/frame cache. Serialized with Scene.
     */
    @property({tooltip:'Visual Graph layout only (positions JSON); does not change generated geometry.'})
    graphLayoutJson='{}';
    @property({min:2,max:64,step:1,tooltip:'Sample resolution per Bezier segment. Full graph is evaluated on Rebuild.'})
    samplesPerCurve=12;
    @property({type:Material,tooltip:'Optional shared material; otherwise respects a manually assigned MeshRenderer material.'})
    material:Material|null=null;
    @property({tooltip:'Rebuild when graph, spline geometry, or output transform changes.'})
    rebuildOnChange=true;
    @property({tooltip:'Selected-only wireframe of generated mesh through Cocos-Gizmos v3.'})
    showMeshGizmos=false;
    @property({min:24,max:1200,step:1})
    gizmoEdgeLimit=300;

    private _mesh:Mesh|null=null;
    private _gizmo:MeshGizmoLines|null=null;
    private _fallback:Material|null=null;
    private _boundMaterial:Material|null=null;
    private _revision='';
    private _lastAttempt='';
    private _runner=new GeometryGraphRunner();
    private _frameRevision='';
    private _frameCache:RoadFrame[]|null=null;
    public getMeshGizmoGeometry():MeshGizmoLines|null{return this._gizmo;}
    public getGraphMetrics():{computed:number;reused:number;nodes:number}{
        return this._runner.metrics;
    }
    private source():SplineContainer|null{
        return this.spline||this.getComponent(SplineContainer);
    }
    private frameSignature():string {
        const source=this.source();
        const matrix=(m:Mat4|undefined)=>m?[
            m.m00,m.m01,m.m02,m.m04,m.m05,m.m06,
            m.m08,m.m09,m.m10,m.m12,m.m13,m.m14,
        ]:null;
        return JSON.stringify([
            source?.node?.uuid,source?.getRevision(),matrix(source?.node.worldMatrix),
            matrix(this.node?.worldMatrix),this.samplesPerCurve,
        ]);
    }
    private signature():string {
        return JSON.stringify([this.frameSignature(),this.graphJson,this.gizmoEdgeLimit]);
    }
    private syncMaterial(renderer:MeshRenderer|null):void {
        if(!renderer)return;
        const current=renderer.getSharedMaterial(0);
        if(this.material){
            if(current!==this.material)renderer.setSharedMaterial(this.material,0);
            this._boundMaterial=this.material;
        }else{
            if(!current||(this._boundMaterial&&current===this._boundMaterial)){
                if(!this._fallback){
                    this._fallback=new Material();
                    this._fallback.initialize({effectName:'builtin-unlit'});
                }
                if(current!==this._fallback)renderer.setSharedMaterial(this._fallback,0);
            }
            this._boundMaterial=null;
        }
    }
    onEnable():void {
        if(this.source()?.count && this.source()!.count>=2){
            try{this.rebuild();}
            catch(error){if(EDITOR_NOT_IN_PREVIEW)console.warn('[SplineGeometryGraph] Rebuild failed:',error);}
        }
    }
    update():void {
        this.syncMaterial(this.getComponent(MeshRenderer));
        const source=this.source();
        if(!this.rebuildOnChange||!source||source.count<2)return;
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
        const source=this.source(),renderer=this.getComponent(MeshRenderer);
        if(!source||source.count<2||source.segmentCount<1||!renderer)
            throw Error('Geometry Graph requires an active SplineContainer (2+ knots) and MeshRenderer.');
        const plan=parseGeometryGraph(this.graphJson);
        const frameRevision=this.frameSignature();
        let frames:RoadFrame[];
        if(this._frameCache&&this._frameRevision===frameRevision){
            frames=this._frameCache;
        }else{
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
            frames=[];
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
        }
        const signature=this.signature();
        const geometry=this._runner.evaluate(plan,{
            frames,closed:source.closed,revision:frameRevision,
        });
        const wire=buildMeshGizmoLines(geometry.positions,geometry.indices,this.gizmoEdgeLimit);
        const mesh=utils.createMesh({
            positions:geometry.positions,normals:geometry.normals,
            uvs:geometry.uvs,indices:geometry.indices,
        });
        // A failing renderer assignment must not destroy the previously bound
        // generated Mesh or a manually assigned external Mesh asset.
        const previousMesh=this._mesh;
        try{renderer.mesh=mesh;}
        catch(error){mesh.destroy();throw error;}
        this._mesh=mesh;this._gizmo=wire;
        this._frameCache=frames;this._frameRevision=frameRevision;
        this._revision=signature;this._lastAttempt='';
        if(previousMesh&&previousMesh!==mesh)previousMesh.destroy();
        this.syncMaterial(renderer);
    }
    onDestroy():void{
        const renderer=this.getComponent(MeshRenderer);
        if(this._mesh&&renderer?.mesh===this._mesh)renderer.mesh=null;
        this._mesh?.destroy();this._mesh=null;this._gizmo=null;
        if(renderer&&this._fallback&&renderer.getSharedMaterial(0)===this._fallback)
            renderer.setSharedMaterial(null,0);
        this._fallback?.destroy();this._fallback=null;this._boundMaterial=null;
        this._runner.clear();this._frameCache=null;this._frameRevision='';
    }
}
