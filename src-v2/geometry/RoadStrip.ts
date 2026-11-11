import {buildSplineFramesV2,frameAtDistanceV2} from '../core/SplineFrames';
import {type SplineCacheV2} from '../core/SplineCache';
import {buildMeshV2,type MeshDataV2,type Vec2MeshV2,type Vec3MeshV2} from './MeshData';
export interface RoadStripOptionsV2 {
    /** Total asphalt width in spline-local units. */
    readonly width:number;
    /** Longitudinal metres per UV repetition. */
    readonly uvMetersPerRepeat?:number;
    readonly step?:number;
    readonly materialSlot?:number;
}
/**
 * Minimal v2 road geometry generator. Uses the same stable frames as followers,
 * and Mesh Pipeline 2 to preserve UV0, UV2, normal and tangent channels.
 * This strip does not yet implement corner trimming, curbs or junction welding.
 */
export function buildRoadStripV2(cache:SplineCacheV2,options:RoadStripOptionsV2):MeshDataV2 {
    const width=options.width,uvMeters=options.uvMetersPerRepeat??5,step=options.step??.5,materialSlot=options.materialSlot??0;
    if(!Number.isFinite(width)||width<=0)throw new Error('Road width must be positive');
    if(!Number.isFinite(uvMeters)||uvMeters<=0)throw new Error('uvMetersPerRepeat must be positive');
    if(!Number.isFinite(step)||step<=0)throw new Error('Road sampling step must be positive');
    if(!Number.isSafeInteger(materialSlot)||materialSlot<0||materialSlot>0xffffffff)
        throw new Error('Road material slot is invalid');
    if(cache.length<=1e-9)throw new Error('Road requires positive spline length');
    const table=buildSplineFramesV2(cache,{maxStep:step});
    const positions:Vec3MeshV2[]=[],normals:Vec3MeshV2[]=[],uv0:Vec2MeshV2[]=[],uv2:Vec2MeshV2[]=[];
    const count=table.frames.length;
    // UV2 is a deterministic secondary channel, not a lightmap atlas unwrap.
    for(let i=0;i<count;i++){
        const f=table.frames[i];
        for(const side of [-1,1]){
            const half=width*.5*side;
            positions.push({x:f.position.x+f.right.x*half,
                y:f.position.y+f.right.y*half,z:f.position.z+f.right.z*half});
            normals.push({...f.up});
            uv0.push({x:(side+1)/2,y:f.distance/uvMeters});
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
