import {_decorator,Component,Node,Mesh,MeshRenderer,Material,Enum,CCObject,utils,gfx} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {SplinePathV2} from './SplinePathV2';
import {type SplineDataV2} from '../core/SplineCurves';
import {type MeshDataV2} from '../geometry/MeshData';
import {createMeshBuildPlanV2} from '../geometry/MeshBuildPlan';
import {exportMeshGltfV2} from '../geometry/GltfExporter';

const {ccclass,property}=_decorator;

/**
 * Mesh generator contract. Geometry subclasses own ONLY their shape options.
 * The Path is the single source for Knots, interpolation and closed.
 * The coordinator handles mesh allocation, materials, transient ownership,
 * Editor preview, Baked asset references and Editor-only diagnostics.
 *
 * No legacy SplineContainer dependency. No automatic Play rebuild in
 * Manual/Baked mode. All temp render parts are nonserialized in Editor.
 */
export enum SplineV2MeshMode {Dynamic=0,Manual=1,Baked=2}
@ccclass('SplinesV2.MeshGeneratorBase')
export abstract class SplineMeshGeneratorV2 extends Component {
    @property({type:SplinePathV2,tooltip:'Required shared spline source: Path owns Knot Nodes, interpolation and Gizmos handles.'})
    pathSource:SplinePathV2|null=null;
    @property({min:0.01,tooltip:'Maximum frame step for generated path-following geometry.'})
    sampleStep=.5;
    @property({min:0.01,tooltip:'Distance in local units per longitudinal UV repeat.'})
    uvMetersPerRepeat=5;
    @property({type:Enum(SplineV2MeshMode)})
    meshMode=SplineV2MeshMode.Manual;
    @property({type:[Material],tooltip:'Shared material indexed by geometry materialSlot.'})
    materials:Material[]=[];
    @property({type:Mesh,tooltip:'Imported glTF Mesh subasset from an explicit Bake.'})
    bakedMesh:Mesh|null=null;
    @property({visible:false}) bakedSourceFingerprint='';
    @property({visible:false}) bakedSourceUrl='';
    @property({visible:false}) pendingBakeUrl='';
    @property({visible:false}) pendingBakeFingerprint='';
    @property({tooltip:'Rebuild temporary Scene mesh on Path Gizmos updates, never auto-Bake.'})
    gizmoLiveMesh=true;
    @property({min:50,max:400,step:10,tooltip:'Minimum milliseconds between Path Gizmos preview rebuilds; End/Cancel always forces one.'})
    gizmoMeshIntervalMs=100;
    private _ownedMeshes:Mesh[]=[];
    private _ownedNodes:Node[]=[];
    private _primaryMesh:Mesh|null=null;
    protected _gizmoLastMeshAt=Number.NEGATIVE_INFINITY;
    private _registeredPath:SplinePathV2|null=null;
    private _gizmoPreviewError:unknown=null;

    /** Forget the previous Path when a generator is relinked or unlinked. */
    protected unlinkPathPreviewConsumer():void {
        this._registeredPath?.unregisterPreviewConsumer(this);
        this._registeredPath=null;
    }
    protected source():SplineDataV2 {
        if(this._registeredPath!==this.pathSource)
            this.unlinkPathPreviewConsumer();
        if(!this.pathSource)
            throw new Error('Assign a SplinePathV2 Path Source before generating geometry');
        const source=this.pathSource.getSplineDataV2(this.node);
        if(EDITOR_NOT_IN_PREVIEW){
            this.pathSource.registerPreviewConsumer(this);
            this._registeredPath=this.pathSource;
        }
        return source;
    }
    protected abstract generate():{geometry:MeshDataV2};

    public onSharedSplinePathEditBegin():void {
        this._gizmoLastMeshAt=Number.NEGATIVE_INFINITY;
    }
    public onSharedSplinePathEdited(force:boolean):void {
        this.rebuildOnGizmoEdit(force);
    }
    protected rebuildOnGizmoEdit(force:boolean):void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.gizmoLiveMesh||!this.node?.isValid)return;
        const now=Date.now();
        const interval=Number.isFinite(this.gizmoMeshIntervalMs)?
            Math.min(400,Math.max(50,this.gizmoMeshIntervalMs)):100;
        if(!force&&now-this._gizmoLastMeshAt<interval)return;
        this._gizmoLastMeshAt=now;
        try{
            this.rebuildPreview();
            this._gizmoPreviewError=null;
        }catch(error){
            this._gizmoPreviewError=error;
            if(force)console.warn('[Cocos Splines V2] Gizmo preview retained last valid mesh:',error);
        }
    }
    protected publishSplineGizmoEdit(force:boolean):void {
        this.rebuildOnGizmoEdit(force);
        this.pathSource?.notifyPreviewConsumers(this,force);
    }

    /** Only runs automatically in Dynamic mode outside the editing scene. */
    protected onEnable():void {
        if(!EDITOR_NOT_IN_PREVIEW&&this.meshMode===SplineV2MeshMode.Dynamic)
            this.rebuildDynamic();
        else this.showSavedMesh();
    }
    protected onDisable():void {
        this.unlinkPathPreviewConsumer();
        this.disposeTransient();
    }
    protected onDestroy():void {
        this.unlinkPathPreviewConsumer();
        this.disposeTransient();
    }

    private renderer():MeshRenderer {
        const r=this.getComponent(MeshRenderer);
        if(!r)throw new Error('SplineMeshGeneratorV2 requires MeshRenderer');
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

    public getCurrentFingerprint():string {
        const {geometry}=this.generate();
        return createMeshBuildPlanV2(geometry,{mode:'baked'}).fingerprint;
    }
    /**
     * Call from the Inspector only. Preview geometry is temporary, never
     * serialized; optional parts are hidden and DontSave in the Editor.
     */
    /** Inspector: switch back to the persisted Mesh, disposing temporary preview. */
    public restoreBakedPreview():void {
        if(!EDITOR_NOT_IN_PREVIEW)throw new Error('Restore saved mesh is Editor-only');
        this.showSavedMesh();
    }
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
