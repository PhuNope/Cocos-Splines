import {
    _decorator,Component,Node,Mesh,MeshRenderer,Material,Vec3,Mat4,Enum,CCObject,utils,gfx,Terrain
} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {buildSplineCacheV2} from '../core/SplineCache';
import {type SplineDataV2,type CurveTypeV2} from '../core/SplineCurves';
import {buildRoadStripV2} from '../geometry/RoadStrip';
import {buildRoadProfileV2,roadProfileLayoutV2} from '../geometry/ProfileSweep';
import {buildRoadCornerSectionsV2,inspectRoadCornersV2,inspectRoadCenterlineClearanceV2,type RoadCornerReportV2} from '../geometry/RoadCorners';
import {buildSplineFramesV2} from '../core/SplineFrames';
import {type RoadOverlapReportV2} from '../geometry/RoadOverlapClip';
import {type RoadContinuousReportV2} from '../geometry/RoadContinuous';
import {buildRoadFilletCacheV2,RoadFilletSpacingErrorV2,type RoadFilletReportV2} from '../geometry/RoadFillet';
import {type JunctionRoadBranchV2} from '../geometry/JunctionPatchV2';
import {createMeshBuildPlanV2} from '../geometry/MeshBuildPlan';
import {exportMeshGltfV2} from '../geometry/GltfExporter';
import {buildRoadSidewalkV2} from '../geometry/RoadSidewalkV2';
import {appendRoadMarkingsV2} from '../geometry/RoadMarkings';
import {trimmedRoadFramesV2} from '../geometry/RoadJunctionTrim';
import {buildRoadSceneGuideV2} from '../geometry/SceneGizmoGuideV2';
import {availableGizmoV3Backend,buildSplineKnotMoveGizmoV3,
    buildSplineKnotPointGizmosV3,drawSplineSceneGizmosV3,
    type SplineGizmoV3Handle} from './SplineGizmoV3Bridge';
const {ccclass,property,requireComponent,executeInEditMode,menu}=_decorator;

export enum SplineV2MeshMode {Dynamic=0,Manual=1,Baked=2}
export enum SplineV2CurveMode {Linear=0,Bezier=1,CatmullRom=2,Centripetal=3}
export enum SplineV2UVAxis {V=0,U=1}
export enum SplineV2UVCrossMode {Legacy=0,Physical=1}
export enum SplineV2RoadCornerMode {JoinAndTrim=0,Legacy=1}
export enum SplineV2SurfaceMode {Continuous=0,ClipOverlaps=1,ConstantWidth=2}
/** Only applies to ConstantWidth when a segment cannot fit its required fillet. */
export enum SplineV2ShortKnotMode {AutoContinuous=0,StrictConstantWidth=1}
export enum SplineV2RoadTerrainMode {FlatHeight=0,SampleTerrain=1}
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
    @property({min:0,tooltip:'ConstantWidth Road only. Distance removed from its starting junction endpoint. Match Junction V2 setback.'})
    junctionStartTrim=0;
    @property({min:0,tooltip:'ConstantWidth Road only. Distance removed from its ending junction endpoint. Match Junction V2 setback.'})
    junctionEndTrim=0;
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
    @property({type:Enum(SplineV2SurfaceMode),tooltip:'ConstantWidth: round knot corners into tangent arcs without squeezing Road or cutting UV. Continuous: old adaptive width. ClipOverlaps: old mesh clipping.'})
    surfaceMode=SplineV2SurfaceMode.ConstantWidth;
    @property({min:1.02,max:6,step:.05,tooltip:'Minimum circular turn radius = full half-width (including shoulder/curb) times this factor. Larger values need more knot spacing.'})
    filletRadiusScale=1.35;
    @property({type:Enum(SplineV2ShortKnotMode),tooltip:'Auto Continuous: preserve seamless UV by smoothly adapting width only if a ConstantWidth fillet cannot fit nearby Knots. Strict: report the spacing error. Junction Trim and Road Sidewalk never auto-fallback.'})
    shortKnotMode=SplineV2ShortKnotMode.AutoContinuous;
    @property({min:0.5,max:45,step:.5,tooltip:'Maximum angle for each tangent Bezier fillet segment in degrees.'})
    filletArcAngleDegrees=4;
    @property({min:.001,max:1,step:.005,tooltip:'Maximum sagitta/chord approximation error of rounded corners.'})
    filletChordError=.015;
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
    @property({min:0,max:6,step:.05,tooltip:'Road-length sidewalk both sides (material slot 5). Set 0 to disable. Requires open ConstantWidth Road with full curb.'})
    roadSidewalkWidth=0;
    @property({type:Enum(SplineV2RoadTerrainMode),tooltip:'Flat local height or per-vertex Cocos Terrain sampling for Road sidewalk outer edges.'})
    roadSidewalkTerrainMode=SplineV2RoadTerrainMode.FlatHeight;
    @property({type:Terrain,tooltip:'Used by Road sidewalk Sample Terrain. Heightmap is read at Rebuild/Bake or Dynamic Play; never modified.'})
    roadSidewalkTerrainSource:Terrain|null=null;
    @property({min:-2,max:2,step:.05,tooltip:'Road-local terrain Y for flat mode; height adjustment when sampling linked Terrain.'})
    roadSidewalkTerrainHeightOffset=0;
    @property({min:.02,max:1,step:.01,tooltip:'Maximum Road sidewalk cross slope between curb top and outer edge.'})
    roadSidewalkMaxCrossSlope=.35;
    @property({min:.02,max:1,step:.01,tooltip:'Maximum rise/run between adjacent Road sidewalk outer edge vertices.'})
    roadSidewalkMaxEdgeSlope=.35;
    @property({tooltip:'Show bounded spline frame, curb edge and Knot guides in Scene when selected. No mesh generation or runtime draw.'})
    showSceneGizmosV3=true;
    @property({min:8,max:192,step:1,tooltip:'Maximum path guide segments, independent of Road tessellation.'})
    gizmoV3Steps=48;
    @property({tooltip:'Show approximate full-width Road border guides around the spline.'})
    gizmoV3Edges=true;
    @property({tooltip:'Show Knot markers for the existing editable Knot Nodes.'})
    gizmoV3Knots=true;
    @property({tooltip:'Enable Cocos-Gizmos v3 XYZ/plane Move handle for ONE selected Knot Node. Optional alpha; native Node transform handles remain available.'})
    gizmoV3EditKnot=false;
    @property({min:0,max:127,step:1,tooltip:'0-based index of the Road Knot to move using the v3 handle.'})
    gizmoV3KnotIndex=0;
    @property({tooltip:'Offer camera-plane point handles for other Road Knots (same underlying Nodes). Active Knot keeps XYZ/plane Move. Optional alpha.'})
    gizmoV3MultiKnotPoints=false;
    @property({min:2,max:32,step:1,tooltip:'Maximum number of Knot point handles including active Knot. Limit keeps Editor gizmos responsive.'})
    gizmoV3PointLimit=16;
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
    private _lastFilletReport:RoadFilletReportV2|null=null;
    private _lastShortKnotFallback:string|null=null;
    /** Only reported after a successful rebuild; not serialized or shown under Inspector. */
    public getShortKnotFallback():string|null{return this._lastShortKnotFallback;}
    private canAutoContinuousShortKnot():boolean {
        return this.shortKnotMode===SplineV2ShortKnotMode.AutoContinuous&&
            this.junctionStartTrim<=0&&this.junctionEndTrim<=0&&
            this.roadSidewalkWidth<=0;
    }
    private _ownedMeshes:Mesh[]=[];
    private _ownedNodes:Node[]=[];
    private _primaryMesh:Mesh|null=null;
    // Nonserialized drag target pin. A user can change selected Knot index
    // during a drag; cancellation must restore the ORIGINAL Node, not another.
    private _gizmoDragNode:Node|null=null;
    private _gizmoDragProperty:''|'gizmoKnotPosition'|'gizmoKnotPositions'='';
    private _gizmoDragIndex=-1;

    /** Only runs automatically in Dynamic mode outside the editing scene. */
    protected onEnable():void {
        if(!EDITOR_NOT_IN_PREVIEW&&this.meshMode===SplineV2MeshMode.Dynamic)
            this.rebuildDynamic();
        else this.showSavedMesh();
    }
    protected onDisable():void {this._gizmoDragNode=null;this.disposeTransient();}
    protected onDestroy():void {this._gizmoDragNode=null;this.disposeTransient();}

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
    /**
     * Cocos-Gizmos v3 PositionHandles.readField/writeField directly access
     * target[property] and, for indexed Vec3[], target[property][index].
     * These getters/Proxy writes address the REAL Knot Nodes, never copied
     * serialized positions. SDK drag sessions provide begin/update/end/cancel.
     */
    private gizmoNode(index:number,property:'gizmoKnotPosition'|'gizmoKnotPositions'):Node|null {
        if(this._gizmoDragNode&&this._gizmoDragProperty===property)
            return (property==='gizmoKnotPosition'||this._gizmoDragIndex===index)?
                this._gizmoDragNode:null;
        return Number.isSafeInteger(index)&&index>=0?this.knots[index]??null:null;
    }
    private readGizmoKnot(index:number,property:'gizmoKnotPosition'|'gizmoKnotPositions'):Vec3 {
        const knot=this.gizmoNode(index,property);
        if(!EDITOR_NOT_IN_PREVIEW||!knot?.isValid||!this.node?.isValid)
            return new Vec3();
        const inv=Mat4.invert(new Mat4(),this.node.worldMatrix);
        return Vec3.transformMat4(new Vec3(),knot.worldPosition,inv);
    }
    private writeGizmoKnot(
        index:number,value:Vec3,property:'gizmoKnotPosition'|'gizmoKnotPositions'
    ):void {
        if(!EDITOR_NOT_IN_PREVIEW||(!this.gizmoV3EditKnot&&!this._gizmoDragNode)||
           !value||![value.x,value.y,value.z].every(Number.isFinite)||
           !this.node?.isValid)return;
        const knot=this.gizmoNode(index,property);
        if(!knot?.isValid)return;
        const world=Vec3.transformMat4(new Vec3(),value,this.node.worldMatrix);
        knot.setWorldPosition(world);
    }
    /** The 6-axis/plane Move gizmo operates on one selected Knot. */
    public get gizmoKnotPosition():Vec3 {
        return this.readGizmoKnot(this.gizmoV3KnotIndex,'gizmoKnotPosition');
    }
    public set gizmoKnotPosition(value:Vec3) {
        this.writeGizmoKnot(this.gizmoV3KnotIndex,value,'gizmoKnotPosition');
    }
    /**
     * v3 indexed Vec3[] API. Array.isArray(proxy) === true; setting
     * proxy[i] writes the authoritative Knot Node immediately. The array is
     * transient and NOT a Cocos @property or a second serialized Knot list.
     */
    public get gizmoKnotPositions():Vec3[] {
        const limit=(Number.isFinite(this.gizmoV3PointLimit)?
            Math.min(32,Math.max(2,Math.floor(this.gizmoV3PointLimit))):16);
        const count=Math.min(this.knots.length,limit);
        const values=new Array<Vec3>(count);
        const indexOf=(property:string|symbol):number=>{
            if(typeof property!=='string'||!/^(0|[1-9][0-9]*)$/.test(property))return -1;
            const index=Number(property);
            return Number.isSafeInteger(index)&&index>=0&&index<count?index:-1;
        };
        return new Proxy(values,{
            get:(target,property,receiver)=>{
                const index=indexOf(property);
                return index>=0?this.readGizmoKnot(index,'gizmoKnotPositions'):
                    Reflect.get(target,property,receiver);
            },
            set:(target,property,value,receiver)=>{
                const index=indexOf(property);
                if(index>=0){
                    this.writeGizmoKnot(index,value,'gizmoKnotPositions');
                    return true;
                }
                // No implicit array growth or silent additional Knot creation.
                if(typeof property==='string'&&/^(0|[1-9][0-9]*)$/.test(property))
                    return false;
                return Reflect.set(target,property,value,receiver);
            }
        });
    }
    /** SDK calls this after its own snapshot/rollback, including Escape. */
    public onGizmoChanged(
        property:string,phase:'begin'|'update'|'end'|'cancel',index?:number
    ):void {
        if(!EDITOR_NOT_IN_PREVIEW||
           (property!=='gizmoKnotPosition'&&property!=='gizmoKnotPositions'))return;
        if(phase==='begin'){
            // Pin the actual Node so changing Inspector index/order mid-gesture
            // cannot redirect updates or the subsequent Escape rollback.
            if(this._gizmoDragNode)return;
            const targetIndex=property==='gizmoKnotPositions'?index:this.gizmoV3KnotIndex;
            if(!Number.isSafeInteger(targetIndex)||targetIndex===undefined||
               targetIndex<0)return;
            const knot=this.knots[targetIndex];
            if(!knot?.isValid)return;
            this._gizmoDragNode=knot;
            this._gizmoDragIndex=targetIndex;
            this._gizmoDragProperty=property;
        }else if((phase==='end'||phase==='cancel')&&
                 this._gizmoDragProperty===property){
            this._gizmoDragNode=null;
            this._gizmoDragIndex=-1;
            this._gizmoDragProperty='';
        }
    }
    /** v3 discovers Component callbacks; no registration decorator needed. */
    public onGizmoHandles():SplineGizmoV3Handle[] {
        if(!EDITOR_NOT_IN_PREVIEW||!this.showSceneGizmosV3||
            !this.gizmoV3EditKnot||!this.node?.isValid||
            !Number.isSafeInteger(this.gizmoV3KnotIndex)||
            this.gizmoV3KnotIndex<0||
            !this.knots[this.gizmoV3KnotIndex]?.isValid)return [];
        const handles=buildSplineKnotMoveGizmoV3('gizmoKnotPosition');
        if(!this.gizmoV3MultiKnotPoints||!handles.length)return handles;
        const count=Math.min(this.knots.length,
            Number.isFinite(this.gizmoV3PointLimit)?
                Math.min(32,Math.max(2,Math.floor(this.gizmoV3PointLimit))):16);
        const indexes=Array.from({length:count},(_,i)=>i).filter(i=>
            i!==this.gizmoV3KnotIndex&&this.knots[i]?.isValid);
        return handles.concat(buildSplineKnotPointGizmosV3('gizmoKnotPositions',indexes));
    }
    /**
     * Native Gizmos v3 Scene HUD: select the active Knot without hunting
     * for Inspector fields, or toggle the compact handles for other Knots.
     * Controls bind only to existing serialized settings, never the Knot proxy.
     */
    public onGizmoHudControls():Array<{
        type:'slider'|'toggle';id:string;text:string;property:string;
        min?:number;max?:number;step?:number;order?:number;
    }> {
        if(!EDITOR_NOT_IN_PREVIEW||!this.showSceneGizmosV3||
            !this.gizmoV3EditKnot||!availableGizmoV3Backend()||
            this.knots.length<2)return [];
        return [{
            type:'slider',id:'spline-v2-active-knot',
            text:'Active Knot',property:'gizmoV3KnotIndex',
            min:0,max:Math.min(this.knots.length-1,127),
            step:1,order:1
        },{
            type:'toggle',id:'spline-v2-multi-points',
            text:'Other Knots',property:'gizmoV3MultiKnotPoints',order:2
        }];
    }
    /** Selection drawing uses actual global Gizmos3D, installed by Gizmos v3 scene.js. */
    public onDrawGizmosSelected():void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.showSceneGizmosV3||
            !availableGizmoV3Backend())return;
        try{
            const source=this.source();
            const cache=buildSplineCacheV2(source);
            const totalWidth=this.width*.5+this.shoulderWidth+this.curbWidth;
            let fillet:ReturnType<typeof buildRoadFilletCacheV2>|null=null;
            if(this.surfaceMode===SplineV2SurfaceMode.ConstantWidth){
                try{fillet=buildRoadFilletCacheV2(cache,totalWidth,{
                    minimumRadiusScale:this.filletRadiusScale,
                    maxArcAngleDegrees:this.filletArcAngleDegrees,
                    maxArcChordError:this.filletChordError,
                    maxArcStep:this.sampleStep
                });}
                catch(error){
                    if(!(error instanceof RoadFilletSpacingErrorV2)||
                       !this.canAutoContinuousShortKnot())throw error;
                }
            }
            const working=fillet?.cache??cache;
            const steps=Math.max(8,Math.min(192,Math.floor(this.gizmoV3Steps)));
            const frames=buildSplineFramesV2(working,{
                maxStep:Math.max(this.sampleStep,working.length/steps)
            });
            const trimmed=trimmedRoadFramesV2(working,frames,{
                junctionStartTrim:this.junctionStartTrim,
                junctionEndTrim:this.junctionEndTrim
            });
            const guide=buildRoadSceneGuideV2(trimmed,source.knots.map(k=>k.position),
                totalWidth,{maxSteps:steps,showEdges:this.gizmoV3Edges,
                    showKnots:this.gizmoV3Knots});
            drawSplineSceneGizmosV3(this.node,guide);
        }catch{
            // Gizmos are read-only Editor aids. Invalid/unfinished Roads must
            // never break selection, write serialization or spam Play logs.
        }
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
        let fillet:ReturnType<typeof buildRoadFilletCacheV2>|null=null;
        if(this.surfaceMode===SplineV2SurfaceMode.ConstantWidth){
            try{fillet=buildRoadFilletCacheV2(cache,
                this.width*.5+this.shoulderWidth+this.curbWidth,{
                    minimumRadiusScale:this.filletRadiusScale,
                    maxArcAngleDegrees:this.filletArcAngleDegrees,
                    maxArcChordError:this.filletChordError,
                    maxArcStep:this.sampleStep
                });}
            catch(error){
                if(!(error instanceof RoadFilletSpacingErrorV2)||
                   !this.canAutoContinuousShortKnot())throw error;
            }
        }
        const testedCache=fillet?.cache??cache;
        const frameTable=buildSplineFramesV2(testedCache,{maxStep:this.sampleStep,
            ...(this.adaptiveSampling&&!fillet?{
                maxAngleDegrees:this.maxTurnAngleDegrees,maxChordError:this.maxChordError
            }:{})});
        const sections=buildRoadCornerSectionsV2(frameTable.frames,
            this.width*.5+this.shoulderWidth+this.curbWidth,
            fillet?{cornerMode:'legacy'}:this.cornerSettings(),this.closed);
        const report=inspectRoadCornersV2(sections);
        const clearance=inspectRoadCenterlineClearanceV2(frameTable.frames,
            this.width+2*this.shoulderWidth+2*this.curbWidth);
        return {...report,...clearance,overlapReport:this._lastOverlapReport??undefined,
            continuousReport:this._lastContinuousReport??undefined,filletReport:fillet?.report};
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
        const roadSampling={junctionStartTrim:this.junctionStartTrim,junctionEndTrim:this.junctionEndTrim,
            generateMarkings:this.generateMarkings,markingOptions,
            adaptiveSampling:this.adaptiveSampling,
            maxTurnAngleDegrees:this.maxTurnAngleDegrees,maxChordError:this.maxChordError,uvCrossMode};
        const corners=this.cornerSettings();
        this._lastOverlapReport=null;
        this._lastContinuousReport=null;
        this._lastFilletReport=null;
        this._lastShortKnotFallback=null;
        const onOverlapReport=(report:RoadOverlapReportV2):void=>{this._lastOverlapReport=report;};
        const onContinuousReport=(report:RoadContinuousReportV2):void=>{this._lastContinuousReport=report;};
        const onFilletReport=(report:RoadFilletReportV2):void=>{this._lastFilletReport=report;};
        const filletSettings={minimumRadiusScale:this.filletRadiusScale,
            maxArcAngleDegrees:this.filletArcAngleDegrees,maxArcChordError:this.filletChordError,onFilletReport};
        const surfaceMode=this.surfaceMode===SplineV2SurfaceMode.ConstantWidth?'fillet' as const:
            this.surfaceMode===SplineV2SurfaceMode.Continuous?'continuous' as const:'clip' as const;
        const makeRoad=(mode:'fillet'|'continuous'|'clip')=>
            this.shoulderWidth>0||this.curbWidth>0||this.curbHeight>0?
            buildRoadProfileV2(cache,{
                width:this.width,shoulderWidth:this.shoulderWidth,curbWidth:this.curbWidth,
                curbHeight:this.curbHeight,uvMetersPerRepeat:this.uvMetersPerRepeat,step:this.sampleStep,
                uvLongitudinalAxis,resolvePlanarOverlaps:this.resolvePlanarOverlaps,stitchCutUV:this.stitchCutUV,onOverlapReport,
                onContinuousReport,surfaceMode:mode,clearanceSafety:this.clearanceSafety,widthSlope:this.widthSlope,
                ...roadSampling,...filletSettings,...corners
            }):buildRoadStripV2(cache,{
                width:this.width,uvMetersPerRepeat:this.uvMetersPerRepeat,
                step:this.sampleStep,materialSlot:0,uvLongitudinalAxis,
                resolvePlanarOverlaps:this.resolvePlanarOverlaps,stitchCutUV:this.stitchCutUV,onOverlapReport,
                onContinuousReport,surfaceMode:mode,clearanceSafety:this.clearanceSafety,widthSlope:this.widthSlope,
                ...roadSampling,...filletSettings,...corners
            });
        let geometry:ReturnType<typeof buildRoadStripV2>;
        try{geometry=makeRoad(surfaceMode);}
        catch(error){
            if(surfaceMode!=='fillet'||
               !(error instanceof RoadFilletSpacingErrorV2)||
               !this.canAutoContinuousShortKnot())throw error;
            // A radius smaller than the road half-width could fold the inside
            // mesh. Use the proven one-strip Continuous width solver instead.
            // No triangle clipping; UV0/UV2 remain continuous along the Road.
            this._lastFilletReport=null;
            geometry=makeRoad('continuous');
            // onContinuousReport executes inside makeRoad(). A type
            // assertion is needed because TS does not track callback side
            // effects on class fields across the synchronous builder call.
            const fitted=this._lastContinuousReport as RoadContinuousReportV2|null;
            if(fitted?.impossibleCrossings||fitted?.hitSafetyLimit)
                throw new Error('Constant Width Road auto Continuous cannot resolve this crossing safely; move Knots apart or reduce Width');
            this._lastShortKnotFallback=error.message;
        }

        if(this.roadSidewalkWidth<=0)return {geometry};
        if(this.closed||this.surfaceMode!==SplineV2SurfaceMode.ConstantWidth)
            throw new Error('Road Sidewalk V2 requires an open ConstantWidth Road');
        if(this.curbWidth<=.01||this.curbHeight<=.01)
            throw new Error('Road Sidewalk V2 requires a positive curb width and height');
        const sampleTerrain=this.roadSidewalkTerrainMode===SplineV2RoadTerrainMode.SampleTerrain;
        let terrainSampler:((x:number,z:number)=>number|null)|undefined;
        if(sampleTerrain){
            const terrain=this.roadSidewalkTerrainSource;
            if(!terrain||!terrain.node?.isValid)
                throw new Error('Road Sidewalk V2 Sample Terrain requires a linked Terrain component');
            const upright=(m:Mat4)=>m.m05>1e-6&&
                Math.hypot(m.m04,m.m06)<=m.m05*1e-4;
            if(!upright(this.node.worldMatrix)||!upright(terrain.node.worldMatrix))
                throw new Error('Road Sidewalk V2 Sample Terrain requires upright Road and Terrain nodes');
            const inverseTerrain=Mat4.invert(new Mat4(),terrain.node.worldMatrix);
            const inverseRoad=Mat4.invert(new Mat4(),this.node.worldMatrix);
            terrainSampler=(x,z)=>{
                // Cocos getHeightAt expects Terrain-LOCAL XZ. Sample in world
                // then convert Terrain-local height back to Road-local Y.
                const world=Vec3.transformMat4(new Vec3(),
                    new Vec3(x,0,z),this.node.worldMatrix);
                const terrainLocal=Vec3.transformMat4(new Vec3(),world,inverseTerrain);
                const height=terrain.getHeightAt(terrainLocal.x,terrainLocal.z);
                if(height===null||height===undefined||!Number.isFinite(height))return null;
                const onTerrain=Vec3.transformMat4(new Vec3(),
                    new Vec3(terrainLocal.x,height,terrainLocal.z),terrain.node.worldMatrix);
                const localY=Vec3.transformMat4(new Vec3(),onTerrain,inverseRoad).y;
                return Number.isFinite(localY)?localY:null;
            };
        }
        const apron=buildRoadSidewalkV2(geometry,{
            width:this.roadSidewalkWidth,roadWidth:this.width,
            shoulderWidth:this.shoulderWidth,curbWidth:this.curbWidth,
            curbHeight:this.curbHeight,uvMetersPerRepeat:this.uvMetersPerRepeat,
            uvLongitudinalAxis,terrainMode:sampleTerrain?'sample':'flat',
            terrainSampler,terrainHeightOffset:this.roadSidewalkTerrainHeightOffset,
            maxCrossSlope:this.roadSidewalkMaxCrossSlope,
            maxEdgeSlope:this.roadSidewalkMaxEdgeSlope
        });
        return {geometry:appendRoadMarkingsV2(geometry,apron.mesh)};
    }
    /**
     * Editor authoring helper: read the EXACT trimmed asphalt edge positions and
     * UV0 from this Road's own current procedural geometry. The patch never
     * guesses the UV phase and never asks a Baked mesh to regenerate in Play.
     */
    public sampleJunctionEndV2(atEnd:boolean):JunctionRoadBranchV2 {
        if(this.closed||this.surfaceMode!==SplineV2SurfaceMode.ConstantWidth)
            throw new Error('Junction V2 requires open ConstantWidth Road branches');
        if((atEnd?this.junctionEndTrim:this.junctionStartTrim)<=0)
            throw new Error('Junction V2 requires a positive Junction '+(atEnd?'End':'Start')+' Trim on each Road');
        const mesh=this.generate().geometry;
        const asphalt=mesh.submeshes.find(g=>g.materialSlot===0);
        if(!asphalt||asphalt.indices.length%12!==0)
            throw new Error('Junction V2 cannot extract the Road asphalt ring');
        const rings=asphalt.indices.length/12+1;
        if(mesh.vertexCount<rings*3)
            throw new Error('Junction V2 Road mesh is not a continuous 3-vertex strip');
        const isProfile=this.shoulderWidth>0||this.curbWidth>0||this.curbHeight>0;
        const layout=isProfile?roadProfileLayoutV2(
            this.width,this.shoulderWidth,this.curbWidth,this.curbHeight,true):null;
        const start=(atEnd?rings-1:0)*3;
        const vertex=(i:number)=>{
            const local=new Vec3(mesh.positions[3*i],mesh.positions[3*i+1],mesh.positions[3*i+2]);
            const world=Vec3.transformMat4(new Vec3(),local,this.node.worldMatrix);
            return {position:{x:world.x,y:world.y,z:world.z},
                uv0:{x:mesh.uv0[2*i],y:mesh.uv0[2*i+1]}};
        };
        const endpoint=this.knots[atEnd?this.knots.length-1:0]?.worldPosition;
        if(!endpoint)throw new Error('Junction V2 requires a valid Road endpoint Knot');
        if(!layout)return {endpoint:{x:endpoint.x,y:endpoint.y,z:endpoint.z},
            left:vertex(start),middle:vertex(start+1),right:vertex(start+2)};
        const edges=layout.edgeMaterials.length;
        if(mesh.vertexCount<edges*2*rings)
            throw new Error('Junction V2 Road profile mesh does not match sampled end-ring layout');
        // ProfileSweep stores each authored edge consecutively, 2 vertices
        // per ring. Reading the exact indexed boundary retains position and
        // UV0 even for vertical curb walls, with no synthetic UV projection.
        const boundary=(edge:number,second:boolean)=>{
            const index=edge*2*rings+2*(atEnd?rings-1:0)+(second?1:0);
            return vertex(index);
        };
        const profile=[boundary(0,false)];
        for(let edge=0;edge<edges;edge++)profile.push(boundary(edge,true));
        const match=(x:number)=>{
            const candidate=layout.points.findIndex(pt=>Math.abs(pt.x-x)<1e-6&&Math.abs(pt.y)<1e-6);
            if(candidate<0)throw new Error('Junction V2 profile is missing asphalt boundary x='+x);
            return profile[candidate];
        };
        return {endpoint:{x:endpoint.x,y:endpoint.y,z:endpoint.z},
            left:match(-this.width*.5),middle:match(0),right:match(this.width*.5),
            sidewalkStation:this.roadSidewalkWidth>0?
                (this.uvLongitudinalAxis===SplineV2UVAxis.U?profile[0].uv0.x:profile[0].uv0.y):undefined,
            profile:{vertices:profile,edgeMaterials:layout.edgeMaterials}};
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
