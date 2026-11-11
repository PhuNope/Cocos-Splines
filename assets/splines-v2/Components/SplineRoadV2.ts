import {
    _decorator,Component,Node,Mesh,MeshRenderer,Material,Vec3,Mat4,Enum,CCObject,utils,gfx
} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {buildSplineCacheV2} from '../core/SplineCache';
import {type SplineDataV2,type CurveTypeV2} from '../core/SplineCurves';
import {buildRoadStripV2} from '../geometry/RoadStrip';
import {buildRoadProfileV2} from '../geometry/ProfileSweep';
import {createMeshBuildPlanV2} from '../geometry/MeshBuildPlan';
import {exportMeshGltfV2} from '../geometry/GltfExporter';
const {ccclass,property,requireComponent,executeInEditMode,menu}=_decorator;

export enum SplineV2MeshMode {Dynamic=0,Manual=1,Baked=2}
export enum SplineV2CurveMode {Linear=0,Bezier=1,CatmullRom=2,Centripetal=3}
export enum SplineV2UVAxis {V=0,U=1}
/**
 * v2 road-strip integration prototype. Never writes editor-only warnings in
 * gameplay and NEVER builds Manual/Baked geometry at runtime.
 *
 * Render Mesh assets: import .gltf from Bake and drag its .mesh subasset into
 * bakedMesh, then choose Manual/Baked. Multi-material parts use shared materials.
 */
@ccclass('SplinesV2.SplineRoad')
@menu('Cocos Splines V2/Road')
@requireComponent(MeshRenderer)
@executeInEditMode(true)
export class SplineRoadV2 extends Component {
    @property({type:[Node],tooltip:'Ordered knot Nodes in world space. Converted into local spline coordinates.'})
    knots:Node[]=[];
    @property({type:Enum(SplineV2CurveMode)}) interpolation=SplineV2CurveMode.Centripetal;
    @property({tooltip:'Connect last knot to first knot.'}) closed=false;
    @property({min:0.01}) width=4;
    @property({min:0}) shoulderWidth=0;
    @property({min:0}) curbWidth=0;
    @property({min:0}) curbHeight=0;
    @property({min:0.01}) sampleStep=.5;
    @property({min:0.01}) uvMetersPerRepeat=5;
    @property({type:Enum(SplineV2UVAxis),tooltip:'Which UV0 texture axis repeats along the spline: V = image Y, U = image X.'})
    uvLongitudinalAxis=SplineV2UVAxis.V;
    @property({type:Enum(SplineV2MeshMode)}) meshMode=SplineV2MeshMode.Manual;
    @property({type:[Material],tooltip:'Shared materials by materialSlot (this road uses slot 0).'})
    materials:Material[]=[];
    @property({type:Mesh,tooltip:'Drag the imported Mesh subasset of the Bake .gltf here.'})
    bakedMesh:Mesh|null=null;
    @property({visible:false}) bakedSourceFingerprint='';
    @property({visible:false}) bakedSourceUrl='';
    @property({visible:false}) pendingBakeUrl='';
    @property({visible:false}) pendingBakeFingerprint='';
    private _ownedMeshes:Mesh[]=[];
    private _ownedNodes:Node[]=[];
    private _primaryMesh:Mesh|null=null;

    /** Only runs automatically in Dynamic mode outside the editing scene. */
    protected onEnable():void {
        if(!EDITOR_NOT_IN_PREVIEW&&this.meshMode===SplineV2MeshMode.Dynamic)
            this.rebuildDynamic();
        else this.showSavedMesh();
    }
    protected onDisable():void {this.disposeTransient();}
    protected onDestroy():void {this.disposeTransient();}

    private renderer():MeshRenderer {
        const r=this.getComponent(MeshRenderer);
        if(!r)throw new Error('SplineRoadV2 requires MeshRenderer');
        return r;
    }
    private applyMaterials(renderer:MeshRenderer):void {
        for(let i=0;i<this.materials.length;i++)
            if(this.materials[i])renderer.setSharedMaterial(this.materials[i],i);
    }
    /** Manual and Baked modes only read a serialized cc.Mesh reference. */
    public showSavedMesh():void {
        this.disposeTransient();
        const r=this.renderer();
        r.mesh=this.bakedMesh;
        this.applyMaterials(r);
    }
    private disposeTransient():void {
        const r=this.getComponent(MeshRenderer);
        if(r&&this._primaryMesh&&r.mesh===this._primaryMesh)r.mesh=null;
        this._primaryMesh=null;
        for(const node of this._ownedNodes)if(node.isValid)node.destroy();
        this._ownedNodes=[];
        for(const mesh of this._ownedMeshes)if(mesh.isValid)mesh.destroy();
        this._ownedMeshes=[];
    }
    /** No dependency on legacy SplineContainer or serialized UUIDs. */
    protected source():SplineDataV2 {
        if(this.knots.length<2||this.knots.some(k=>!k||!k.isValid))
            throw new Error('Assign at least two valid v2 knot Nodes');
        const inv=new Mat4();
        Mat4.invert(inv,this.node.worldMatrix);
        const data=this.knots.map(node=>{
            const local=Vec3.transformMat4(new Vec3(),node.worldPosition,inv);
            return {position:{x:local.x,y:local.y,z:local.z}};
        });
        const curve:CurveTypeV2=[
            'linear','bezier','catmull-rom','catmull-rom-centripetal'
        ][this.interpolation] as CurveTypeV2;
        return {type:curve,closed:this.closed,knots:data};
    }
    protected generate(){
        const curve=this.source();
        const cache=buildSplineCacheV2(curve);
        const uvLongitudinalAxis=this.uvLongitudinalAxis===SplineV2UVAxis.U?'u':'v';
        const geometry=this.shoulderWidth>0||this.curbWidth>0||this.curbHeight>0?
            buildRoadProfileV2(cache,{
                width:this.width,shoulderWidth:this.shoulderWidth,curbWidth:this.curbWidth,
                curbHeight:this.curbHeight,uvMetersPerRepeat:this.uvMetersPerRepeat,step:this.sampleStep,
                uvLongitudinalAxis
            }):buildRoadStripV2(cache,{
                width:this.width,uvMetersPerRepeat:this.uvMetersPerRepeat,
                step:this.sampleStep,materialSlot:0,uvLongitudinalAxis
            });
        return {geometry};
    }
    public getCurrentFingerprint():string {
        const {geometry}=this.generate();
        return createMeshBuildPlanV2(geometry,{mode:'baked'}).fingerprint;
    }
    /**
     * Call from the Inspector only. Preview geometry is temporary, never
     * serialized; optional parts are hidden and DontSave in the Editor.
     */
    public rebuildPreview():void {
        if(!EDITOR_NOT_IN_PREVIEW)throw new Error('Editor-only Rebuild is unavailable during Play');
        this.rebuildTransient();
    }
    private rebuildDynamic():void {this.rebuildTransient();}
    private rebuildTransient():void {
        const {geometry}=this.generate();
        const plan=createMeshBuildPlanV2(geometry,{mode:'dynamic'});
        // Validate geometry before deleting the old renderer mesh.
        const nextMeshes=plan.parts.map(part=>utils.createMesh({
            positions:Array.from(part.positions),normals:Array.from(part.normals),
            tangents:Array.from(part.tangents),uvs:Array.from(part.uv0),
            indices:Array.from(part.indices),
            ...(part.uv2?{customAttributes:[{
                attr:new gfx.Attribute(gfx.AttributeName.ATTR_TEX_COORD1,gfx.Format.RG32F),
                values:Array.from(part.uv2)
            }]}:{})
        }));
        const nextNodes:Node[]=[];
        try{
            this.disposeTransient();
            const primary=this.renderer();
            for(let i=0;i<plan.parts.length;i++){
                let target=primary;
                if(i){
                    const child=new Node('__SplineV2DrawPart_'+i);
                    if(EDITOR_NOT_IN_PREVIEW)
                        child.hideFlags=CCObject.Flags.DontSave|CCObject.Flags.HideInHierarchy;
                    child.setParent(this.node);
                    target=child.addComponent(MeshRenderer);
                    nextNodes.push(child);
                }
                target.mesh=nextMeshes[i];
                const material=this.materials[plan.parts[i].materialSlot];
                if(material)target.setSharedMaterial(material,0);
            }
            this._ownedMeshes=nextMeshes;
            this._ownedNodes=nextNodes;
            this._primaryMesh=nextMeshes[0]??null;
        }catch(error){
            for(const node of nextNodes)if(node.isValid)node.destroy();
            for(const mesh of nextMeshes)if(mesh.isValid)mesh.destroy();
            throw error;
        }
    }
    /** Caller must persist the generated .gltf through AssetDB (Editor main). */
    public prepareBake():{content:string;fingerprint:string;primitiveCount:number} {
        if(!EDITOR_NOT_IN_PREVIEW)throw new Error('Bake is Editor-only');
        const {geometry}=this.generate();
        const asset=exportMeshGltfV2(geometry);
        return {content:asset.json,fingerprint:asset.fingerprint,primitiveCount:asset.primitiveCount};
    }
    /** Checks source drift; does NOT rebuild or load mesh in Manual/Baked. */
    public inspectBake():{stale:boolean;hasMesh:boolean;url:string;fingerprint:string} {
        if(!EDITOR_NOT_IN_PREVIEW)throw new Error('Bake status is Editor-only');
        const fingerprint=this.getCurrentFingerprint();
        return {stale:!this.bakedSourceFingerprint||this.bakedSourceFingerprint!==fingerprint,
            hasMesh:!!this.bakedMesh,url:this.bakedSourceUrl,fingerprint};
    }
}
