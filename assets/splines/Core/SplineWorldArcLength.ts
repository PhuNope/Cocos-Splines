/** World-space arc-length approximation for normalized LOCAL arc progress.
 * Explicitly samples world positions, therefore handles non-uniform scale and
 * rotated parents without assuming a single scale factor. Pure math module.
 */
export interface WorldArcSample {progress:number;distance:number}
export type WorldPosition={x:number;y:number;z:number};
const valid=(p:WorldPosition)=>!!p&&Number.isFinite(p.x)&&
    Number.isFinite(p.y)&&Number.isFinite(p.z);
const distance=(a:WorldPosition,b:WorldPosition)=>Math.hypot(
    a.x-b.x,a.y-b.y,a.z-b.z);
/** Arc-length integral using bounded polyline samples (approximate, not exact).
 * More samples are used for splines with more cubic segments. SplineContainer
 * evaluates each progress using its own LOCAL arc-length LUT.
 */
export function buildWorldArcLength(
    evaluate:(progress:number)=>WorldPosition,segmentCount:number,
    samplesPerCurve=32,
):WorldArcSample[]{
    if(typeof evaluate!=='function'||!Number.isFinite(segmentCount)||
       segmentCount<1||segmentCount>65536||!Number.isFinite(samplesPerCurve)||
       samplesPerCurve<1||samplesPerCurve>4096)
        throw Error('Invalid world arc sampling configuration.');
    const sampleCount=Math.min(4096,Math.max(64,
        Math.ceil(segmentCount)*Math.min(64,Math.ceil(samplesPerCurve))));
    const result:WorldArcSample[]=[{progress:0,distance:0}];
    let previous=evaluate(0),length=0;
    if(!valid(previous))throw Error('Invalid spline world position at progress 0.');
    for(let i=1;i<=sampleCount;i++){
        const progress=i/sampleCount;
        const point=evaluate(progress);
        if(!valid(point))throw Error('Nonfinite world position while sampling spline.');
        const step=distance(previous,point);
        if(!Number.isFinite(step))throw Error('Nonfinite world arc length.');
        length+=step;
        if(!Number.isFinite(length))throw Error('Nonfinite world arc length.');
        result.push({progress,distance:length});
        previous=point;
    }
    if(length<=1e-9)throw Error('World-space spline has zero length.');
    return result;
}
/** Interpolate cumulative world arc distance at LOCAL normalized progress.
 * Monotonic table is validated once by NetworkGraph before Dijkstra.
 */
export function worldArcDistanceAt(
    arc:readonly WorldArcSample[],progress:number,
):number{
    if(!Number.isFinite(progress)||progress<0||progress>1||
       !Array.isArray(arc)||arc.length<2)
        throw Error('Invalid world arc lookup.');
    if(progress===0)return arc[0].distance;
    if(progress===1)return arc[arc.length-1].distance;
    let lo=0,hi=arc.length-1;
    while(lo+1<hi){
        const mid=(lo+hi)>>1;
        if(arc[mid].progress<progress)lo=mid;
        else hi=mid;
    }
    const a=arc[lo],b=arc[hi];
    const t=(progress-a.progress)/(b.progress-a.progress);
    return a.distance+(b.distance-a.distance)*t;
}
