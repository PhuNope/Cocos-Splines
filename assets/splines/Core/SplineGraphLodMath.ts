/** Runtime visual LOD for sampled paths. Full-resolution context remains
 * authoritative for bake and collision. No vertex decimation or resampling
 * of spline assets, and no engine dependencies in the pure policy.
 */
import type {GeometryGraphSplineSource} from './SplineGeometryGraph';
import type {V3} from './SplineRoadMath';
export type GraphLodLevel=0|1|2;
export function selectGraphLod(distance:number,near:number,far:number,previous:GraphLodLevel):GraphLodLevel{
    if(!Number.isFinite(distance)||distance<0||!Number.isFinite(near)||!Number.isFinite(far)||
       near<1||far<near*1.25||far>100000)
        throw Error('Graph LOD requires finite distances: near >= 1, far >= 1.25 * near, far <= 100000.');
    let level=previous;
    // Hysteresis: ten percent either side of each boundary.
    while(level<2&&distance>=(level===0?near:far)*1.1)level=(level+1) as GraphLodLevel;
    while(level>0&&distance<(level===1?near:far)*.9)level=(level-1) as GraphLodLevel;
    return level;
}
export function reduceGraphLodSource(source:GeometryGraphSplineSource,level:GraphLodLevel):GeometryGraphSplineSource{
    if(level===0)return source;
    const frames=source.frames,segments=frames.length-1;
    const minimum=source.closed?4:2;
    const count=Math.min(segments,Math.max(minimum,Math.ceil(segments/(level===1?2:4))));
    if(count===segments)return source;
    // Select original frames instead of altering their position/basis or arc
    // distance. Preserve open endpoints and duplicate closed seam frame.
    const reduced=Array.from({length:count+1},(_,i)=>frames[Math.round(i*segments/count)]);
    return {frames:reduced,closed:source.closed,revision:source.revision+'|visualLOD:'+level};
}
export function graphLodPathDistance(camera:V3,sources:ReadonlyArray<GeometryGraphSplineSource>,
    toWorld:(p:V3)=>V3):number{
    let best=Infinity;
    if(![camera.x,camera.y,camera.z].every(Number.isFinite))return Infinity;
    for(const source of sources){
        if(source.frames.length<2)continue;
        let a=toWorld(source.frames[0].position);
        for(let i=1;i<source.frames.length;i++){
            const b=toWorld(source.frames[i].position),dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
            const x=camera.x-a.x,y=camera.y-a.y,z=camera.z-a.z;
            const denominator=dx*dx+dy*dy+dz*dz;
            const t=denominator>0?Math.max(0,Math.min(1,(x*dx+y*dy+z*dz)/denominator)):0;
            best=Math.min(best,Math.hypot(x-t*dx,y-t*dy,z-t*dz));a=b;
        }
    }
    return best;
}
/** Conservative allowlist: path operations that can change their semantics
 * when sample density changes (e.g. Conform, Noise, Clip, Resample, Merge
 * Path, Mesh Deform) stay at full resolution in this first LOD slice. */
const SUPPORTED=new Set(['spline','offset','width','reverse','ribbon','tube','extrude','mergeMesh','output']);
export function supportsGraphLod(nodes:ReadonlyArray<{type:string}>):boolean{
    return nodes.every(n=>SUPPORTED.has(n.type));
}
