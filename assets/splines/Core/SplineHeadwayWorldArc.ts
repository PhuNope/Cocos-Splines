/** Shared sampled WORLD arc cache for same-spline follower headway.
 * Cached only when a native geometry revision and world matrix are present.
 * A missing revision always recomputes to avoid stale headway positions.
 */
import type {SplineContainer} from './SplineContainer';
import {buildWorldArcLength,type WorldArcSample} from './SplineWorldArcLength';
const FIELDS=['m00','m01','m02','m04','m05','m06',
    'm08','m09','m10','m12','m13','m14'] as const;
const cache=new WeakMap<SplineContainer,{key:string;arc:WorldArcSample[]}>();
export function headwayWorldArc(spline:SplineContainer):readonly WorldArcSample[]{
    if(!spline||spline.count<2)
        throw Error('World headway requires a valid spline with two knots.');
    const matrix=spline.node?.worldMatrix;
    const revision=typeof spline.getRevision==='function'?spline.getRevision():null;
    const key=revision!==null&&matrix?JSON.stringify([
        revision,spline.length,spline.count,spline.closed,spline.reversed,
        spline.segmentCount,spline.samplesPerCurve,
        ...FIELDS.map(f=>matrix[f]??null),
    ]):null;
    const existing=cache.get(spline);
    if(key!==null&&existing?.key===key)return existing.arc;
    const segments=Number.isFinite(spline.segmentCount)?spline.segmentCount:
        Math.max(1,spline.count-(spline.closed?0:1));
    const arc=buildWorldArcLength(p=>spline.evaluateWorldPosition(p),
        segments,Number.isFinite(spline.samplesPerCurve)?spline.samplesPerCurve:32);
    if(key!==null)cache.set(spline,{key,arc});
    return arc;
}
