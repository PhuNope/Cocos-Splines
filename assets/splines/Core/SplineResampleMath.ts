/** Non-destructive spline topology resampling.
 *
 * A new independent spline is fitted to the original Bezier geometry using
 * uniform arc-distance samples. For each target span a cubic least-squares
 * fit minimizes deviation at points along the ORIGINAL arc. Endpoints are
 * pinned, the two control vectors are solved independently (Broken mode),
 * and sampled error is measured in the selected local/world metric.
 *
 * The computed deviation is a DENSE SAMPLE estimate, NOT a certified
 * continuous Hausdorff bound. The source remains untouched. Consumers must
 * reject errors above the caller's explicit tolerance before creating Nodes.
 */
import * as M from './SplineMath';
export interface ResampleOptions {
    mode:'count'|'spacing';
    target:number;
    tolerance:number;
    space?:'local'|'world';
    samplesPerCurve?:number;
}
export interface ResampleResult {
    knots:M.KnotData[];
    count:number;
    closed:boolean;
    sourceLength:number;
    actualSpacing:number;
    estimatedMaxError:number;
    testSamples:number;
}
const AXES=['x','y','z'] as const;
const finite=(p:M.V3):boolean=>!!p&&AXES.every(k=>Number.isFinite(p[k]));
const validKnot=(k:M.KnotData):boolean=>!!k&&finite(k.position)&&
    finite(k.tangentIn)&&finite(k.tangentOut)&&Number.isFinite(k.mode);
const point=(x=0,y=0,z=0):M.V3=>({x,y,z});
const addScaled=(v:M.V3,s:number,out:M.V3):void=>{
    out.x+=s*v.x;out.y+=s*v.y;out.z+=s*v.z;
};
const triple=(v:M.V3,w:M.V3,s:number):M.V3=>
    point(v.x+s*w.x,v.y+s*w.y,v.z+s*w.z);
const cubic=(a:M.V3,b:M.V3,c:M.V3,d:M.V3,t:number):M.V3=>
    M.bezier(a,b,c,d,t);
function solveSpan(lut:M.ArcLUT,start:number,end:number,samples:number):
    {p0:M.V3;p1:M.V3;p2:M.V3;p3:M.V3}{
    const p0=M.sampleDistance(lut,start).position;
    const p3=M.sampleDistance(lut,end).position;
    let aa=0,ab=0,bb=0;
    const va=point(),vb=point();
    for(let i=1;i<samples;i++){
        const u=i/samples,one=1-u;
        const w0=one*one*one,w1=3*one*one*u;
        const w2=3*one*u*u,w3=u*u*u;
        const desired=M.sampleDistance(lut,start+(end-start)*u).position;
        const residual=point(desired.x-w0*p0.x-w3*p3.x,
            desired.y-w0*p0.y-w3*p3.y,
            desired.z-w0*p0.z-w3*p3.z);
        aa+=w1*w1;ab+=w1*w2;bb+=w2*w2;
        addScaled(residual,w1,va);addScaled(residual,w2,vb);
    }
    const det=aa*bb-ab*ab;
    if(!(det>1e-12))throw Error('Spline resample cubic fit is singular.');
    const p1=point((va.x*bb-vb.x*ab)/det,(va.y*bb-vb.y*ab)/det,
        (va.z*bb-vb.z*ab)/det);
    const p2=point((vb.x*aa-va.x*ab)/det,(vb.y*aa-va.y*ab)/det,
        (vb.z*aa-va.z*ab)/det);
    if(![p0,p1,p2,p3].every(finite))
        throw Error('Spline resample produced non-finite control points.');
    return {p0,p1,p2,p3};
}
export function resampleSpline(
    source:readonly M.KnotData[],
    closed:boolean,
    options:ResampleOptions,
    metric:(p:M.V3)=>M.V3=p=>p,
):ResampleResult {
    if(typeof closed!=='boolean'||!Array.isArray(source)||
       source.length<2||source.length>512||source.some(k=>!validKnot(k)))
        throw Error('Resample requires 2–512 finite source Knots.');
    if(!options||!['count','spacing'].includes(options.mode)||
       !Number.isFinite(options.target)||!Number.isFinite(options.tolerance)||
       options.tolerance<0.0001||options.tolerance>10000)
        throw Error('Resample requires a mode, target and tolerance between 0.0001 and 10000.');
    if(typeof metric!=='function')
        throw Error('Invalid resample metric.');
    if(options.space!==undefined&&options.space!=='local'&&options.space!=='world')
        throw Error('Resample metric must be local or world.');
    const steps=Math.max(32,Math.min(256,Math.floor(options.samplesPerCurve??64)));
    const segments=closed?source.length:source.length-1;
    if(steps*segments>65536)
        throw Error('Spline exceeds 65536 arc samples; reduce source Knot count.');
    const lut=M.buildArcLUT(source.slice(),closed,steps,metric);
    const length=lut.total;
    if(!Number.isFinite(length)||length<=1e-6)
        throw Error('Cannot resample a zero-length or invalid spline.');
    let count:number;
    if(options.mode==='count'){
        if(!Number.isInteger(options.target))throw Error('Resample Knot count must be an integer.');
        count=options.target;
    }else{
        if(options.target<=0||options.target>1e6)
            throw Error('Resample target spacing must be between 0 and 1000000.');
        count=closed?Math.ceil(length/options.target):Math.ceil(length/options.target)+1;
    }
    if(!Number.isInteger(count)||count<(closed?3:2)||count>128)
        throw Error('Resample Knot count must be 2–128 (open) or 3–128 (closed).');
    const spanCount=closed?count:count-1;
    const distanceSpan=length/spanCount;
    const spans=[] as ReturnType<typeof solveSpan>[];
    for(let i=0;i<spanCount;i++)
        spans.push(solveSpan(lut,distanceSpan*i,distanceSpan*(i+1),24));
    const knots:M.KnotData[]=[];
    for(let i=0;i<count;i++){
        const prev=spans[(i-1+spanCount)%spanCount],next=spans[i%spanCount];
        const pos=!closed&&i===count-1?prev.p3:next.p0;
        const incoming=closed||i>0?M.sub(prev.p2,prev.p3):point();
        const outgoing=closed||i<spanCount?M.sub(next.p1,next.p0):point();
        knots.push({position:point(pos.x,pos.y,pos.z),
            tangentIn:incoming,tangentOut:outgoing,
            mode:4,tension:1/3});
    }
    let maxError=0,testSamples=0;
    // Deliberately compare corresponding equal-arc fractions. This is a
    // conservative sampled *parametric* deviation, not a proven global bound.
    for(let i=0;i<spanCount;i++){
        const seg=spans[i];
        for(let j=0;j<=48;j++){
            const u=j/48,d=distanceSpan*(i+u);
            const fitted=cubic(seg.p0,seg.p1,seg.p2,seg.p3,u);
            const original=M.sampleDistance(lut,Math.min(length,d)).position;
            const measuredA=metric(original),measuredB=metric(fitted);
            if(!finite(measuredA)||!finite(measuredB))
                throw Error('Resample error metric produced non-finite coordinates.');
            maxError=Math.max(maxError,M.distance(measuredA,measuredB));
            testSamples++;
        }
    }
    if(maxError>options.tolerance)
        throw Error('Resample deviation '+maxError.toFixed(5)+
            ' exceeds tolerance '+options.tolerance+'. Increase Knot count or tolerance.');
    return {knots,count,closed,sourceLength:length,
        actualSpacing:distanceSpan,estimatedMaxError:maxError,testSamples};
}
