import {buildSplineFramesV2,frameAtDistanceV2} from '../core/SplineFrames';
import {type SplineCacheV2} from '../core/SplineCache';
import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';
import {buildRoadCornerSectionsV2,roadCornerPositionV2,type RoadCornerOptionsV2} from './RoadCorners';
export interface RoadStripOptionsV2 extends RoadCornerOptionsV2 {
    /** Total asphalt width in spline-local units. */
    readonly width:number;
    /** Longitudinal metres per UV repetition. */
    readonly uvMetersPerRepeat?:number;
    /** UV0 coordinate that repeats along road; default v. */
    readonly uvLongitudinalAxis?:'u'|'v';
    readonly step?:number;
    readonly materialSlot?:number;
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
    // UV2 is a deterministic secondary channel, not a lightmap atlas unwrap.
    for(let i=0;i<count;i++){
        const f=table.frames[i];
        for(const side of [-1,1]){
            const half=width*.5*side;
            positions.push(roadCornerPositionV2(f,corners[i],half,0));
            normals.push({...f.up});
            const across=(side+1)/2,along=f.distance/uvMeters;
            uv0.push(axis==='u'?{x:along,y:across}:{x:across,y:along});
            uv2.push({x:(side+1)/2,y:f.distance/cache.length});
        }
    }
    const indices:number[]=[];
    for(let i=0;i<count-1;i++){
        const a=2*i,b=a+1,c=a+2,d=a+3;
        indices.push(a,c,b,b,c,d);
    }
    return buildMeshV2({positions,normals,uv0,uv2,submeshes:[{materialSlot,indices}]});
}
