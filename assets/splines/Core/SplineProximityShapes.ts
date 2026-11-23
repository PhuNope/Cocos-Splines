/** Pure swept sphere vs world-axis-aligned Collider AABB narrowphase.
 * Conservative against actual rotated collider/mesh shapes: the engine AABB
 * encloses them. Computes exact first sphere-AABB contact along LINE SEGMENT,
 * including rounded corners, rather than sweeping an expanded sharp-corner box.
 */
export interface ProximityVec3 {x:number;y:number;z:number}
export interface ProximityAabb {min:ProximityVec3;max:ProximityVec3}
const finite=(n:number)=>Number.isFinite(n);
export function validProximityAabb(b:ProximityAabb|null|undefined):b is ProximityAabb {
    if(!b?.min||!b?.max)return false;
    for(const axis of ['x','y','z'] as const)
        if(!finite(b.min[axis])||!finite(b.max[axis])||
           b.min[axis]>b.max[axis])return false;
    return true;
}
export function aabbFromCenterHalfExtents(
    center:ProximityVec3,half:ProximityVec3,
):ProximityAabb|null {
    if(!center||!half||!['x','y','z'].every(k=>{
        const key=k as keyof ProximityVec3;
        return finite(center[key])&&finite(half[key])&&half[key]>=0;
    }))return null;
    const min={x:center.x-half.x,y:center.y-half.y,z:center.z-half.z};
    const max={x:center.x+half.x,y:center.y+half.y,z:center.z+half.z};
    const bounds={min,max};
    return validProximityAabb(bounds)?bounds:null;
}
function distanceSquared(p:ProximityVec3,b:ProximityAabb):number{
    let result=0;
    for(const axis of ['x','y','z'] as const){
        const delta=p[axis]<b.min[axis]?p[axis]-b.min[axis]:
            p[axis]>b.max[axis]?p[axis]-b.max[axis]:0;
        result+=delta*delta;
    }
    return result;
}
/** First contact t in [0,1], or null. Piecewise quadratic distance to AABB:
 * split the interval at every crossing of a slab plane, then minimize the
 * quadratic on each interval and bisect its FIRST crossing. 18 breakpoints max.
 */
export function sweptSphereAabbEntry(
    start:ProximityVec3,end:ProximityVec3,b:ProximityAabb,radius:number,
):number|null {
    if(!start||!end||!['x','y','z'].every(k=>{
        const a=k as keyof ProximityVec3;
        return finite(start[a])&&finite(end[a]);
    })||!validProximityAabb(b)||!finite(radius)||radius<=0||radius>100)
        throw Error('Invalid swept sphere/AABB query.');
    const delta={x:end.x-start.x,y:end.y-start.y,z:end.z-start.z};
    const r2=radius*radius,at=(t:number):ProximityVec3=>({
        x:start.x+delta.x*t,y:start.y+delta.y*t,z:start.z+delta.z*t,
    });
    const f=(t:number)=>distanceSquared(at(t),b)-r2;
    if(f(0)<=1e-12)return 0;
    const cuts=[0,1];
    for(const axis of ['x','y','z'] as const){
        const d=delta[axis];
        if(Math.abs(d)<=1e-14)continue;
        for(const plane of [b.min[axis],b.max[axis]]){
            const t=(plane-start[axis])/d;
            if(t>0&&t<1)cuts.push(t);
        }
    }
    cuts.sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){
        const lo=cuts[i-1],hi=cuts[i];
        if(hi-lo<1e-14)continue;
        if(f(lo)<=1e-12)return lo;
        const middle=(lo+hi)/2;
        let quadratic=0,linear=0;
        for(const axis of ['x','y','z'] as const){
            const test=start[axis]+delta[axis]*middle;
            const wall=test<b.min[axis]?b.min[axis]:
                test>b.max[axis]?b.max[axis]:null;
            if(wall===null)continue;
            const diff=start[axis]-wall;
            quadratic+=delta[axis]*delta[axis];
            linear+=2*diff*delta[axis];
        }
        const min=quadratic>1e-18?
            Math.max(lo,Math.min(hi,-linear/(2*quadratic))):lo;
        if(f(min)>1e-12)continue;
        let left=lo,right=min;
        for(let pass=0;pass<48;pass++){
            const mid=(left+right)/2;
            if(f(mid)<=0)right=mid;else left=mid;
        }
        return right;
    }
    return null;
}
