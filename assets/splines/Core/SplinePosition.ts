/** A positional coordinate on a spline. The default preserves v0.5 serialized progress. */
export enum SplinePositionMode {
    /** 0..1 fraction of the full ARC LENGTH (old Progress behavior). */
    NormalizedDistance=0,
    /** Absolute distance in SplineContainer local units. */
    Distance=1,
    /** 0..1 uniform cubic PARAMETER (segments weighted equally, not by length). */
    SplineT=2,
}
export interface PositionSpline {
    readonly length:number;
    distanceAtT(t:number):number;
}
export const clampPosition01=(value:number):number=>
    Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
export const clampPositionDistance=(value:number,total:number):number=>
    Math.max(0,Math.min(Math.max(0,total),Number.isFinite(value)?value:0));
/** Convert any coordinate to normalized distance for runtime movement and marker crossing.
 * All callers use the CURRENT path length; distance never gets serialized as an old ratio.
 */
export function toNormalizedDistance(spline:PositionSpline,mode:SplinePositionMode,progress:number,distance:number):number {
    const length=Math.max(0,Number.isFinite(spline.length)?spline.length:0);
    if(mode===SplinePositionMode.Distance)return length>1e-8?clampPositionDistance(distance,length)/length:0;
    if(mode===SplinePositionMode.SplineT)return length>1e-8?clampPositionDistance(spline.distanceAtT(clampPosition01(progress)),length)/length:0;
    return clampPosition01(progress);
}
/** Returns ordered arc-length fractions. For reversed input return an empty interval. */
export function toNormalizedRange(spline:PositionSpline,mode:SplinePositionMode,start:number,end:number,startDistance:number,endDistance:number):[number,number] {
    return [toNormalizedDistance(spline,mode,start,startDistance),toNormalizedDistance(spline,mode,end,endDistance)];
}
