import {buildSplineFramesV2,frameAtDistanceV2} from '../core/SplineFrames';
import {type SplineCacheV2} from '../core/SplineCache';
import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';
import {buildRoadCornerSectionsV2,roadCornerPositionV2,appendRoadQuadV2,type RoadCornerOptionsV2} from './RoadCorners';
import {resolveRoadOverlapV2,type RoadOverlapReportV2} from './RoadOverlapClip';
import {buildRoadContinuousSectionsV2,roadContinuousProfileX_V2,type RoadContinuousOptionsV2,type RoadContinuousReportV2} from './RoadContinuous';
export interface RoadStripOptionsV2 extends RoadCornerOptionsV2, RoadContinuousOptionsV2 {
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
    readonly surfaceMode?:'clip'|'continuous';
    readonly onContinuousReport?:(report:RoadContinuousReportV2)=>void;
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
    const table=buildSplineFramesV2(cache,{maxStep:step});
    const positions:Vec3MeshV2[]=[],normals:Vec3MeshV2[]=[],uv0:Vec2MeshV2[]=[],uv2:Vec2MeshV2[]=[];
    const count=table.frames.length;
    const corners=buildRoadCornerSectionsV2(table.frames,width*.5,options,cache.spline.closed);
    const mode=options.surfaceMode??'clip';
    if(mode!=='clip'&&mode!=='continuous')throw new Error('Unknown Road surface mode');
    const continuous=mode==='continuous'?buildRoadContinuousSectionsV2(table.frames,width*.5,{...options,closed:cache.spline.closed}):null;
    if(continuous)options.onContinuousReport?.(continuous.report);
    // UV2 is a deterministic secondary channel, not a lightmap atlas unwrap.
    for(let i=0;i<count;i++){
        const f=table.frames[i];
        for(const side of [-1,1]){
            const half=width*.5*side;
            const renderX=continuous?roadContinuousProfileX_V2(half,width*.5,continuous.sections[i]):half;
            positions.push(roadCornerPositionV2(f,corners[i],renderX,0));
            normals.push({...f.up});
            const across=(side+1)/2,along=f.distance/uvMeters;
            uv0.push(axis==='u'?{x:along,y:across}:{x:across,y:along});
            uv2.push({x:(side+1)/2,y:f.distance/cache.length});
        }
    }
    const indices:number[]=[];
    for(let i=0;i<count-1;i++){
        const a=2*i,b=a+1,c=a+2,d=a+3;
        appendRoadQuadV2(positions,normals,a,b,c,d,indices);
    }
    const mesh=buildMeshV2({positions,normals,uv0,uv2,submeshes:[{materialSlot,indices}]});
    if(mode==='continuous'||!(options.resolvePlanarOverlaps??options.cornerMode!=='legacy'))return mesh;
    const result=resolveRoadOverlapV2(mesh,{roadWidth:width,stitchCutUV:options.stitchCutUV});
    options.onOverlapReport?.(result.report);
    return result.mesh;
}
