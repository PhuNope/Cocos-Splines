import {
    _decorator,MeshRenderer,Vec3,Mat4,Enum,Terrain
} from 'cc';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
import {buildSplineCacheV2} from '../core/SplineCache';
import {SplineMeshGeneratorV2} from './SplineMeshGeneratorV2';
import {SplineV2UVAxis,SplineV2SurfaceMode} from './SplineGeometrySettingsV2';
export {SplineV2UVAxis,SplineV2SurfaceMode} from './SplineGeometrySettingsV2';
export {SplineV2MeshMode} from './SplineMeshGeneratorV2';
import {buildRoadStripV2} from '../geometry/RoadStrip';
import {buildRoadProfileV2,roadProfileLayoutV2} from '../geometry/ProfileSweep';
import {buildRoadCornerSectionsV2,inspectRoadCornersV2,inspectRoadCenterlineClearanceV2,type RoadCornerReportV2} from '../geometry/RoadCorners';
import {buildSplineFramesV2} from '../core/SplineFrames';
import {type RoadOverlapReportV2} from '../geometry/RoadOverlapClip';
import {type RoadContinuousReportV2} from '../geometry/RoadContinuous';
import {buildRoadFilletCacheV2,RoadFilletSpacingErrorV2,type RoadFilletReportV2} from '../geometry/RoadFillet';
import {type JunctionRoadBranchV2} from '../geometry/JunctionPatchV2';
import {buildRoadSidewalkV2} from '../geometry/RoadSidewalkV2';
import {appendRoadMarkingsV2} from '../geometry/RoadMarkings';
import {trimmedRoadFramesV2} from '../geometry/RoadJunctionTrim';
import {buildRoadSceneGuideV2} from '../geometry/SceneGizmoGuideV2';
import {availableGizmoBackend,drawSplineSceneGizmos} from './SplineGizmoBridge';
const {ccclass,property,requireComponent,executeInEditMode,menu}=_decorator;

export enum SplineV2UVCrossMode {Legacy=0,Physical=1}
export enum SplineV2RoadCornerMode {JoinAndTrim=0,Legacy=1}
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
export class SplineRoadV2 extends SplineMeshGeneratorV2 {
    @property({min:0.01}) width=4;
    @property({min:0}) shoulderWidth=0;
    @property({min:0}) curbWidth=0;
    @property({min:0}) curbHeight=0;

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
    showSceneGizmos=true;
    @property({min:8,max:192,step:1,tooltip:'Maximum path guide segments, independent of Road tessellation.'})
    gizmoSteps=48;
    @property({tooltip:'Show approximate full-width Road border guides around the spline.'})
    gizmoEdges=true;









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



    /** Selection drawing uses actual global Gizmos3D, installed by Gizmos scene.js. */
    public onDrawGizmosSelected():void {
        if(!EDITOR_NOT_IN_PREVIEW||!this.showSceneGizmos||
            !availableGizmoBackend())return;
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
            const steps=Math.max(8,Math.min(192,Math.floor(this.gizmoSteps)));
            const frames=buildSplineFramesV2(working,{
                maxStep:Math.max(this.sampleStep,working.length/steps),
                rollSource:source
            });
            const trimmed=trimmedRoadFramesV2(working,frames,{
                junctionStartTrim:this.junctionStartTrim,
                junctionEndTrim:this.junctionEndTrim
            });
            const guide=buildRoadSceneGuideV2(trimmed,source.knots.map(k=>k.position),
                totalWidth,{maxSteps:steps,showEdges:this.gizmoEdges,
                    showKnots:false});
            drawSplineSceneGizmos(this.node,guide);
        }catch{
            // Gizmos are read-only Editor aids. Invalid/unfinished Roads must
            // never break selection, write serialization or spam Play logs.
        }
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
            rollSource:cache.spline,
            ...(this.adaptiveSampling&&!fillet?{
                maxAngleDegrees:this.maxTurnAngleDegrees,maxChordError:this.maxChordError
            }:{})});
        const sections=buildRoadCornerSectionsV2(frameTable.frames,
            this.width*.5+this.shoulderWidth+this.curbWidth,
            fillet?{cornerMode:'legacy'}:this.cornerSettings(),this.source().closed);
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
        if(this.source().closed||this.surfaceMode!==SplineV2SurfaceMode.ConstantWidth)
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
        if(this.source().closed||this.surfaceMode!==SplineV2SurfaceMode.ConstantWidth)
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
        const sourceKnots=this.pathSource?.getKnotPositions();
        if(!this.pathSource||!sourceKnots?.length)
            throw new Error('Junction V2 requires a SplinePath with valid Vec3 Knots');
        const endpoint=this.pathSource.getKnotWorldPosition(
            atEnd?sourceKnots.length-1:0);
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
}
