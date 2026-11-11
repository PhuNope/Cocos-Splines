import {
    buildSplineLengthV2,evaluateSplineV2,evaluateSplineSegmentV2,parameterAtDistanceV2,
    splineSegmentsV2,validateSplineV2,
    type LengthTableV2,type SplineDataV2,type SplineSampleV2,type V3
} from './SplineCurves';

export interface SplineCacheOptionsV2 {
    /** Max absolute arc-length error in world units per original segment. */
    readonly tolerance?:number;
    readonly maxDepth?:number;
}
export interface SplineSegmentCacheV2 {
    readonly index:number;
    readonly startDistance:number;
    readonly endDistance:number;
    readonly length:number;
}
export interface SplineCacheV2 {
    /** Frozen snapshot: changing source data never silently invalidates this cache. */
    readonly spline:SplineDataV2;
    readonly table:LengthTableV2;
    readonly length:number;
    readonly segments:ReadonlyArray<SplineSegmentCacheV2>;
}
const copyV=(p:V3):V3=>Object.freeze({x:p.x,y:p.y,z:p.z});
/** Authoring explicitly calls this after edits. Playback never recomputes curve lengths. */
export function buildSplineCacheV2(source:SplineDataV2,options:SplineCacheOptionsV2={}):SplineCacheV2 {
    validateSplineV2(source);
    const spline:SplineDataV2=Object.freeze({
        type:source.type,closed:source.closed,
        knots:Object.freeze(source.knots.map(k=>Object.freeze({
            position:copyV(k.position),
            ...(k.handleIn?{handleIn:copyV(k.handleIn)}:{}),
            ...(k.handleOut?{handleOut:copyV(k.handleOut)}:{}),
            ...(k.tension===undefined?{}:{tension:k.tension})
        })))
    });
    const table=buildSplineLengthV2(spline,options.tolerance,options.maxDepth);
    const count=splineSegmentsV2(spline);
    let last=0;
    const segments:SplineSegmentCacheV2[]=[];
    let cursor=1;
    for(let i=0;i<count;i++){
        const t=(i+1)/count;
        // An adaptive table always contains exact segment-end parameters.
        while(cursor<table.points.length-1&&table.points[cursor].parameter<t-1e-14)cursor++;
        const end=table.points[cursor];
        if(Math.abs(end.parameter-t)>1e-10)throw new Error('Missing segment boundary in length table');
        segments.push(Object.freeze({index:i,startDistance:last,endDistance:end.distance,length:end.distance-last}));
        last=end.distance;
    }
    return Object.freeze({spline,table:Object.freeze({
        ...table,points:Object.freeze(table.points.map(p=>Object.freeze({...p})))
    }),length:table.length,segments:Object.freeze(segments)});
}
/** Distance is clamped; set wrap=true for repeatedly traversing a closed loop. */
export function parameterAtCachedDistanceV2(cache:SplineCacheV2,distance:number,wrap=false):number {
    let d=Number.isFinite(distance)?distance:0;
    if(wrap&&cache.spline.closed&&cache.length>0){d=((d%cache.length)+cache.length)%cache.length;}
    return parameterAtDistanceV2(cache.table,d);
}
export function sampleSplineDistanceV2(cache:SplineCacheV2,distance:number,wrap=false):SplineSampleV2 {
    return evaluateSplineV2(cache.spline,parameterAtCachedDistanceV2(cache,distance,wrap));
}
/** Exact local segment evaluation, intended for mesh LOD and editor handles. */
export function sampleCachedSegmentV2(cache:SplineCacheV2,index:number,localT:number):SplineSampleV2 {
    return evaluateSplineSegmentV2(cache.spline,index,localT);
}
