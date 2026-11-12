import {type SplineCacheV2} from '../core/SplineCache';
import {buildSplineFramesV2,frameAtDistanceV2,type SplineFramesV2,type SplineFrameV2} from '../core/SplineFrames';

export interface RoadJunctionTrimV2 {
    /** Arc distance removed from the start, starting at 0 for normal Roads. */
    readonly junctionStartTrim?:number;
    /** Arc distance removed from the end. */
    readonly junctionEndTrim?:number;
}
/** Keep UV distance in the ORIGINAL generated curve's domain. A matched
 * junction boundary must be sampled at exactly the same arc distance as the
 * clipped Road, never from an independently rebuilt spline. */
export function trimmedRoadFramesV2(cache:SplineCacheV2,table:SplineFramesV2,
    options:RoadJunctionTrimV2={}):ReadonlyArray<SplineFrameV2> {
    const start=options.junctionStartTrim??0,end=options.junctionEndTrim??0;
    if(!Number.isFinite(start)||start<0||!Number.isFinite(end)||end<0)
        throw new Error('Junction trim distances must be non-negative and finite');
    if(start<1e-9&&end<1e-9)return table.frames;
    if(cache.spline.closed)throw new Error('Junction trim does not support closed Road loops');
    if(start+end>=cache.length-.01)
        throw new Error('Junction trim distances leave no Road length; reduce start/end trim');
    const low=start,high=cache.length-end;
    const result:SplineFrameV2[]=[];
    const boundary=(d:number)=>frameAtDistanceV2(cache,table,d);
    result.push(boundary(low));
    for(const f of table.frames)if(f.distance>low+1e-6&&f.distance<high-1e-6)result.push(f);
    result.push(boundary(high));
    if(result.length<2||result.some((f,i)=>i>0&&f.distance<=result[i-1].distance+1e-7))
        throw new Error('Junction trim left invalid Road frames');
    return result;
}
