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
