import {buildSplineFramesV2,frameAtDistanceV2} from '../core/SplineFrames';
import {type SplineCacheV2} from '../core/SplineCache';
import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';
import {buildRoadCornerSectionsV2,roadCornerPositionV2,appendRoadQuadV2,type RoadCornerOptionsV2} from './RoadCorners';
import {resolveRoadOverlapV2,type RoadOverlapReportV2} from './RoadOverlapClip';
import {buildRoadContinuousSectionsV2,roadContinuousProfileX_V2,type RoadContinuousOptionsV2,type RoadContinuousReportV2} from './RoadContinuous';
import {buildRoadMarkingsV2,appendRoadMarkingsV2,type RoadMarkingOptionsV2} from './RoadMarkings';
import {buildRoadFilletCacheV2,type RoadFilletOptionsV2,type RoadFilletReportV2} from './RoadFillet';
import {trimmedRoadFramesV2,type RoadJunctionTrimV2} from './RoadJunctionTrim';
export interface RoadStripOptionsV2 extends RoadCornerOptionsV2, RoadContinuousOptionsV2, RoadFilletOptionsV2, RoadJunctionTrimV2 {
    /** Total asphalt width in spline-local units. */
    readonly width:number;
    /** Longitudinal metres per UV repetition. */
    readonly uvMetersPerRepeat?:number;
    /** UV0 coordinate that repeats along road; default v. */
    readonly uvLongitudinalAxis?:'u'|'v';
    readonly step?:number;
    readonly materialSlot?:number;
    /** Remove near-coplanar duplicate Road surfaces; enabled for JoinAndTrim by default. */
    readonly resolvePlanarOverlaps?:boolean;
    /** Match UV0 phase on coplanar cut edges (Repeat sampler). */
    readonly stitchCutUV?:boolean;
    readonly onOverlapReport?:(report:RoadOverlapReportV2)=>void;
    /** Continuous Road strip with smooth width adaptation; no UV/mesh clipping. */
    readonly surfaceMode?:'clip'|'continuous'|'fillet';
    readonly onFilletReport?:(report:RoadFilletReportV2)=>void;
    readonly onContinuousReport?:(report:RoadContinuousReportV2)=>void;
    readonly adaptiveSampling?:boolean;
    readonly maxTurnAngleDegrees?:number;
    readonly maxChordError?:number;
    /** Legacy keeps paint at cross UV0 0..1. Physical preserves texel density at narrowed bends. */
    readonly uvCrossMode?:'legacy'|'physical';
    readonly generateMarkings?:boolean;
    readonly markingOptions?:RoadMarkingOptionsV2;
}
/**
 * Minimal v2 road geometry generator. Uses the same stable frames as followers,
 * and Mesh Pipeline 2 to preserve UV0, UV2, normal and tangent channels.
 * Applies local miter-and-inside-trim by default; full junction CSG is separate.
 */
export function buildRoadStripV2(cache:SplineCacheV2,options:RoadStripOptionsV2):MeshDataV2 {
    const width=options.width,uvMeters=options.uvMetersPerRepeat??5,step=options.step??.5,materialSlot=options.materialSlot??0;
    if(!Number.isFinite(width)||width<=0)throw new Error('Road width must be positive');
    if(!Number.isFinite(uvMeters)||uvMeters<=0)throw new Error('uvMetersPerRepeat must be positive');
    if(!Number.isFinite(step)||step<=0)throw new Error('Road sampling step must be positive');
    const axis=options.uvLongitudinalAxis??'v';
    if(axis!=='u'&&axis!=='v')throw new Error('Road UV axis must be u or v');
    if(!Number.isSafeInteger(materialSlot)||materialSlot<0||materialSlot>0xffffffff)
        throw new Error('Road material slot is invalid');
    if(cache.length<=1e-9)throw new Error('Road requires positive spline length');
    if(options.uvCrossMode!==undefined&&options.uvCrossMode!=='legacy'&&options.uvCrossMode!=='physical')
        throw new Error('Unknown road UV cross mode');
    const mode=options.surfaceMode??'clip';
    if(mode!=='clip'&&mode!=='continuous'&&mode!=='fillet')throw new Error('Unknown Road surface mode');
    if(mode!=='fillet'&&((options.junctionStartTrim??0)>0||(options.junctionEndTrim??0)>0))
        throw new Error('Junction trim needs ConstantWidth Road mode');
    const fillet=mode==='fillet'?buildRoadFilletCacheV2(cache,width*.5,{...options,maxArcStep:step}):null;
    if(fillet)options.onFilletReport?.(fillet.report);
    const workingCache=fillet?.cache??cache;
    const table=buildSplineFramesV2(workingCache,{maxStep:step,
        rollSource:cache.spline,
        ...(options.adaptiveSampling&&mode!=='fillet'?{
            maxAngleDegrees:options.maxTurnAngleDegrees??6,maxChordError:options.maxChordError??.03
        }:{})});
    const frames=trimmedRoadFramesV2(workingCache,table,options);
    const positions:Vec3MeshV2[]=[],normals:Vec3MeshV2[]=[],uv0:Vec2MeshV2[]=[],uv2:Vec2MeshV2[]=[];
    const count=frames.length;
    // Fillet computes a tangent rounded centreline before sweeping. Re-applying
    // JoinAndTrim would change width and move the painted UV isolines.
    const corners=buildRoadCornerSectionsV2(frames,width*.5,
        mode==='fillet'?{cornerMode:'legacy'}:options,workingCache.spline.closed);
    const continuous=mode==='continuous'?buildRoadContinuousSectionsV2(frames,width*.5,{...options,cornerSections:corners,closed:workingCache.spline.closed}):null;
    if(continuous)options.onContinuousReport?.(continuous.report);
    // UV2 is a deterministic secondary channel, not a lightmap atlas unwrap.
    for(let i=0;i<count;i++){
        const f=frames[i];
        // The centre UV must stay on the real spline centreline even when the
        // inside shoulder narrows. Two endpoints would shift lane markings.
        for(const side of (mode==='continuous'||mode==='fillet'?[-1,0,1]:[-1,1])){
            const half=width*.5*side;
            const renderX=continuous?roadContinuousProfileX_V2(half,width*.5,continuous.sections[i]):half;
            const point=roadCornerPositionV2(f,corners[i],renderX,0);
            positions.push(point);
            normals.push({...f.up});
            const actualAcross=(point.x-f.position.x)*f.right.x+
                (point.y-f.position.y)*f.right.y+(point.z-f.position.z)*f.right.z;
            const across=options.uvCrossMode==='physical'?.5+actualAcross/width:(side+1)/2;
            const along=f.distance/uvMeters;
            uv0.push(axis==='u'?{x:along,y:across}:{x:across,y:along});
            uv2.push({x:(side+1)/2,y:f.distance/workingCache.length});
        }
    }
    const indices:number[]=[];
    const vertsPerRing=mode==='continuous'||mode==='fillet'?3:2;
    for(let i=0;i<count-1;i++)for(let lane=0;lane<vertsPerRing-1;lane++){
        const a=i*vertsPerRing+lane,b=a+1,c=a+vertsPerRing,d=c+1;
        appendRoadQuadV2(positions,normals,a,b,c,d,indices);
    }
    const mesh=buildMeshV2({positions,normals,uv0,uv2,submeshes:[{materialSlot,indices}]});
    if(mode==='continuous'||mode==='fillet'){
        if(!options.generateMarkings)return mesh;
        const fullWidthSections=continuous??{
            sections:frames.map(()=>({left:width*.5,right:width*.5})),
            report:{constrainedSections:0,curvatureConstrainedSections:0,effectiveWidthSlope:0,
                slopeSafetyCapped:false,minimumWidthRatio:1,impossibleCrossings:0,hitSafetyLimit:false}
        };
        const markings=buildRoadMarkingsV2(frames,corners,fullWidthSections,width*.5,width*.5,{...options.markingOptions,
            uvMetersPerRepeat:uvMeters,uvLongitudinalAxis:axis});
        return appendRoadMarkingsV2(mesh,markings);
    }
    if(options.generateMarkings)throw new Error('Separate Road markings require Continuous or Constant Width mode');
    if(!(options.resolvePlanarOverlaps??options.cornerMode!=='legacy'))return mesh;
    const result=resolveRoadOverlapV2(mesh,{roadWidth:width,stitchCutUV:options.stitchCutUV});
    options.onOverlapReport?.(result.report);
    return result.mesh;
}
