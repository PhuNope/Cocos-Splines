import {
    _decorator,Component,Node,Mesh,MeshRenderer,Material,Vec3,Mat4,Enum,CCObject,utils,gfx
} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {buildSplineCacheV2} from '../core/SplineCache';
import {type SplineDataV2,type CurveTypeV2} from '../core/SplineCurves';
import {buildRoadStripV2} from '../geometry/RoadStrip';
import {buildRoadProfileV2} from '../geometry/ProfileSweep';
import {buildRoadCornerSectionsV2,inspectRoadCornersV2,inspectRoadCenterlineClearanceV2,type RoadCornerReportV2} from '../geometry/RoadCorners';
import {buildSplineFramesV2} from '../core/SplineFrames';
import {type RoadOverlapReportV2} from '../geometry/RoadOverlapClip';
import {type RoadContinuousReportV2} from '../geometry/RoadContinuous';
import {createMeshBuildPlanV2} from '../geometry/MeshBuildPlan';
import {exportMeshGltfV2} from '../geometry/GltfExporter';
const {ccclass,property,requireComponent,executeInEditMode,menu}=_decorator;

export enum SplineV2MeshMode {Dynamic=0,Manual=1,Baked=2}
export enum SplineV2CurveMode {Linear=0,Bezier=1,CatmullRom=2,Centripetal=3}
export enum SplineV2UVAxis {V=0,U=1}
export enum SplineV2UVCrossMode {Legacy=0,Physical=1}
export enum SplineV2RoadCornerMode {JoinAndTrim=0,Legacy=1}
export enum SplineV2SurfaceMode {Continuous=0,ClipOverlaps=1}
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
    @property({tooltip:'Adaptive: add samples when the turn angle or spline chord error is large.'})
    adaptiveSampling=true;
    @property({min:1,max:90,step:1,tooltip:'Maximum local tangent turn (degrees) between Road rings.'})
    maxTurnAngleDegrees=6;
    @property({min:0.001,max:1,step:0.005,tooltip:'Maximum deviation from the curve to a mesh chord, in local units.'})
    maxChordError=.03;
    @property({type:Enum(SplineV2RoadCornerMode),tooltip:'JoinAndTrim prevents local inner-edge folds at sharp bends; Legacy restores old ribbon sections.'})
    cornerMode=SplineV2RoadCornerMode.JoinAndTrim;
    @property({min:0.5,max:0.98,step:0.01,tooltip:'Safety fraction of local bend radius for the inside road edge.'})
    cornerTrimSafety=.9;
    @property({min:1,max:4,step:.1,tooltip:'Limit outward miter spikes at sharp corners.'})
    cornerMiterLimit=2.5;
    @property({tooltip:'Remove overlapping near-coplanar road faces (like a wide U-turn) before rendering. Does not Boolean-union crossings at different heights.'})
    resolvePlanarOverlaps=true;
    @property({type:Enum(SplineV2SurfaceMode),tooltip:'Continuous: connected UV Road ribbon with automatic width fit. Clip Overlaps: keeps width but cuts mesh/texture at self-intersections.'})
    surfaceMode=SplineV2SurfaceMode.Continuous;
    @property({min:.05,max:.98,step:.01,tooltip:'Reduce width near nearby road arms, without cutting textures.'})
    clearanceSafety=.35;
    @property({min:.05,max:4,step:.05,tooltip:'Smooth width response near bends. Effective slope is capped at 0.25 in Continuous mode so road stripes cannot form steps.'})
    widthSlope=.25;
    @property({tooltip:'Align repeating UV0 texture phase at cut boundaries with the retained Road surface. Does not join lane markings with different directions.'})
    stitchCutUV=true;
    @property({min:0.01}) uvMetersPerRepeat=5;
    @property({tooltip:'Generate independent white centre dashes (material 3) and solid edge lines (material 4). Use plain asphalt without baked-in paint.'})
    generateMarkings=false;
    @property({min:0.01,max:1,step:0.01}) markingLineWidth=.12;
    @property({min:0.05,max:100,step:0.1}) markingDashLength=3;
    @property({min:0,max:100,step:0.1}) markingDashGap=4;
    @property({type:Enum(SplineV2UVCrossMode),tooltip:'Legacy preserves painted-edge UV positions. Physical preserves texel density when Road narrows (paint may shift). '})
    uvCrossMode=SplineV2UVCrossMode.Legacy;
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
    private _lastOverlapReport:RoadOverlapReportV2|null=null;
    private _lastContinuousReport:RoadContinuousReportV2|null=null;
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
    /** Editor-only local corner report; no warnings are printed during Play. */
    public inspectCornerRisk():RoadCornerReportV2|null {
        if(!EDITOR_NOT_IN_PREVIEW)throw new Error('Corner diagnostics are Editor-only');
        const cache=buildSplineCacheV2(this.source());
        const frameTable=buildSplineFramesV2(cache,{maxStep:this.sampleStep,
            ...(this.adaptiveSampling?{
                maxAngleDegrees:this.maxTurnAngleDegrees,maxChordError:this.maxChordError
            }:{})});
        const sections=buildRoadCornerSectionsV2(frameTable.frames,
            this.width*.5+this.shoulderWidth+this.curbWidth,this.cornerSettings(),this.closed);
        const report=inspectRoadCornersV2(sections);
        const clearance=inspectRoadCenterlineClearanceV2(frameTable.frames,
            this.width+2*this.shoulderWidth+2*this.curbWidth);
        return {...report,...clearance,overlapReport:this._lastOverlapReport??undefined,continuousReport:this._lastContinuousReport??undefined};
    }
    private cornerSettings(){
        return {cornerMode:this.cornerMode===SplineV2RoadCornerMode.Legacy?'legacy' as const:'join-trim' as const,
            cornerTrimSafety:this.cornerTrimSafety,cornerMiterLimit:this.cornerMiterLimit};
    }
    protected generate(){
        const curve=this.source();
        const cache=buildSplineCacheV2(curve);
        const uvLongitudinalAxis=this.uvLongitudinalAxis===SplineV2UVAxis.U?'u':'v';
        const uvCrossMode=this.uvCrossMode===SplineV2UVCrossMode.Physical?'physical' as const:'legacy' as const;
        const markingOptions={lineWidth:this.markingLineWidth,
            dashLength:this.markingDashLength,dashGap:this.markingDashGap};
        const roadSampling={generateMarkings:this.generateMarkings,markingOptions,
            adaptiveSampling:this.adaptiveSampling,
            maxTurnAngleDegrees:this.maxTurnAngleDegrees,maxChordError:this.maxChordError,uvCrossMode};
        const corners=this.cornerSettings();
        this._lastOverlapReport=null;
        this._lastContinuousReport=null;
        const onOverlapReport=(report:RoadOverlapReportV2):void=>{this._lastOverlapReport=report;};
        const onContinuousReport=(report:RoadContinuousReportV2):void=>{this._lastContinuousReport=report;};
        const surfaceMode=this.surfaceMode===SplineV2SurfaceMode.Continuous?'continuous' as const:'clip' as const;
        const geometry=this.shoulderWidth>0||this.curbWidth>0||this.curbHeight>0?
            buildRoadProfileV2(cache,{
                width:this.width,shoulderWidth:this.shoulderWidth,curbWidth:this.curbWidth,
                curbHeight:this.curbHeight,uvMetersPerRepeat:this.uvMetersPerRepeat,step:this.sampleStep,
                uvLongitudinalAxis,resolvePlanarOverlaps:this.resolvePlanarOverlaps,stitchCutUV:this.stitchCutUV,onOverlapReport,
                onContinuousReport,surfaceMode,clearanceSafety:this.clearanceSafety,widthSlope:this.widthSlope,...roadSampling,...corners
            }):buildRoadStripV2(cache,{
                width:this.width,uvMetersPerRepeat:this.uvMetersPerRepeat,
                step:this.sampleStep,materialSlot:0,uvLongitudinalAxis,
                resolvePlanarOverlaps:this.resolvePlanarOverlaps,stitchCutUV:this.stitchCutUV,onOverlapReport,
                onContinuousReport,surfaceMode,clearanceSafety:this.clearanceSafety,widthSlope:this.widthSlope,
                ...roadSampling,...corners
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
