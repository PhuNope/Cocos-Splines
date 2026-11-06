/** Independent traversal helpers: markers use normalized *arc distance* on each spline.
 * All crossings are start-exclusive, end-inclusive so standing on a marker does not
 * cause duplicate event delivery on the next frame.
 */
export type Direction = 1 | -1;
export const EPSILON = 1e-8;
export function clamp01(value:number):number {
    return Number.isFinite(value) ? Math.min(1,Math.max(0,value)) : 0;
}
export function crosses(from:number,to:number,mark:number,direction:Direction):boolean {
    if(!Number.isFinite(mark))return false;
    const p=clamp01(mark);
    return direction===1 ? p>from+EPSILON&&p<=to+EPSILON : p<from-EPSILON&&p>=to-EPSILON;
}
export function easing(t:number,mode:number):number {
    const x=clamp01(t);
    switch(mode){
        case 1:return x*x*(3-2*x);
        case 2:return x*x;
        case 3:return 1-(1-x)*(1-x);
        case 4:return x*x*x*(x*(x*6-15)+10);
        default:return x;
    }
}
/** Binary search works for every monotone easing curve exposed in the Inspector. */
export function inverseEasing(value:number,mode:number):number {
    const x=clamp01(value);
    if(mode===0||x===0||x===1)return x;
    let lo=0,hi=1;
    for(let i=0;i<30;i++){
        const mid=(lo+hi)*0.5;
        if(easing(mid,mode)<x)lo=mid;
        else hi=mid;
    }
    return (lo+hi)*0.5;
}
export interface Crossing<T>{ progress:number; priority:number; payload:T }
export function orderCrossings<T>(items:Crossing<T>[],direction:Direction):Crossing<T>[] {
    return items.sort((a,b)=>direction*(a.progress-b.progress)||a.priority-b.priority);
}

/** Cumulative world-space arc length for a path whose positions are sampled
 * at normalized spline progress (not the original Bezier t). The input point
 * may include spline-frame offsets and modifier animation.
 */
export interface OffsetArcLUT { distances:number[]; length:number; steps:number }
export interface Point3Like {x:number;y:number;z:number}
export function buildOffsetArcLUT(sample:(progress:number)=>Point3Like,steps=256):OffsetArcLUT {
    const n=Math.max(2,Math.min(4096,Math.floor(steps)||256));
    const distances=[0];let prev=sample(0),total=0;
    for(let i=1;i<=n;i++){
        const next=sample(i/n);
        const segment=Math.hypot(next.x-prev.x,next.y-prev.y,next.z-prev.z);
        total+=Number.isFinite(segment)?segment:0;
        distances.push(total);prev=next;
    }
    return {distances,length:total,steps:n};
}
/** Map the centerline progress to a normalized fraction of the offset distance. */
export function offsetProgressToDistanceFraction(lut:OffsetArcLUT,progress:number):number {
    const x=clamp01(progress)*lut.steps,i=Math.min(lut.steps-1,Math.floor(x));
    const a=lut.distances[i],b=lut.distances[i+1];
    return lut.length>EPSILON?(a+(b-a)*(x-i))/lut.length:clamp01(progress);
}
/** Map normalized offset distance back to normalized *centerline* progress. */
export function offsetDistanceFractionToProgress(lut:OffsetArcLUT,fraction:number):number {
    const value=clamp01(fraction);
    if(value===0||value===1||lut.length<=EPSILON)return value;
    const distance=value*lut.length,d=lut.distances;
    let lo=0,hi=lut.steps;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(d[mid]<distance)lo=mid;else hi=mid;}
    const size=d[hi]-d[lo],u=size>EPSILON?(distance-d[lo])/size:0;
    return clamp01((lo+u)/lut.steps);
}
