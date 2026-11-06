/** Pure geometry core; inspired by the Bezier representation in Unity Splines.
 * No Cocos dependency, so all arc-length logic is independently testable.
 * Controls are local offsets: P1=P0+tangentOut; P2=P3+tangentIn.
 */
export interface V3 { x: number; y: number; z: number }
export interface KnotData {
    position: V3;
    tangentIn: V3;
    tangentOut: V3;
    mode: number;
    tension?: number;
}
export interface SplinePoint { position: V3; tangent: V3; segment: number; u: number; distance: number }
export interface ArcLUT { ts: number[]; lengths: number[]; total: number; segments: number; closed: boolean; knots: KnotData[]; steps: number }
export const EPS = 1e-8;
export const v = (x=0,y=0,z=0): V3 => ({x,y,z});
export const add = (a:V3,b:V3):V3 => v(a.x+b.x,a.y+b.y,a.z+b.z);
export const sub = (a:V3,b:V3):V3 => v(a.x-b.x,a.y-b.y,a.z-b.z);
export const mul = (a:V3,s:number):V3 => v(a.x*s,a.y*s,a.z*s);
export const dot = (a:V3,b:V3):number => a.x*b.x+a.y*b.y+a.z*b.z;
export const cross = (a:V3,b:V3):V3 => v(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
export const mag = (a:V3):number => Math.sqrt(dot(a,a));
export const distance = (a:V3,b:V3):number => mag(sub(a,b));
export const norm = (a:V3,fallback:V3=v(0,0,1)):V3 => {const m=mag(a);return m>EPS?mul(a,1/m):fallback;};
export const lerp = (a:V3,b:V3,t:number):V3 => add(mul(a,1-t),mul(b,t));
export const clamp01 = (t:number):number => Math.min(1,Math.max(0,Number.isFinite(t)?t:0));
export const wrap01 = (t:number):number => ((Number.isFinite(t)?t:0)%1+1)%1;

/** 0 AutoSmooth, 1 Linear, 2 Mirrored, 3 Continuous, 4 Broken (Unity enum). */
export function resolvedKnots(input: KnotData[],closed:boolean):KnotData[] {
    const knots = input.map(k=>({position:v(k.position.x,k.position.y,k.position.z),tangentIn:v(k.tangentIn.x,k.tangentIn.y,k.tangentIn.z),tangentOut:v(k.tangentOut.x,k.tangentOut.y,k.tangentOut.z),mode:k.mode,tension:k.tension}));
    const n=knots.length;
    for(let i=0;i<n;i++) {
        const k=knots[i];
        if(k.mode===1){k.tangentIn=v();k.tangentOut=v();continue;}
        if(k.mode!==0)continue;
        const prev=knots[closed?(i+n-1)%n:Math.max(0,i-1)].position;
        const next=knots[closed?(i+1)%n:Math.min(n-1,i+1)].position;
        // Unity's default AutoSmooth tension is 1/3; on each side the
        // previous/next edge sizes affect tangent magnitudes.
        const dir=norm(sub(next,prev),v());
        const tension=Math.max(0,k.tension===undefined?1/3:k.tension);
        k.tangentIn=mul(dir,-distance(k.position,prev)*tension);
        k.tangentOut=mul(dir,distance(k.position,next)*tension);
    }
    return knots;
}
export function segmentCount(knots: KnotData[],closed:boolean):number {return knots.length<2?0:(closed?knots.length:knots.length-1);}
export function segment(knots:KnotData[],index:number,closed:boolean):[V3,V3,V3,V3] {
    const a=knots[index],b=knots[(index+1)%knots.length];
    return [a.position,add(a.position,a.tangentOut),add(b.position,b.tangentIn),b.position];
}
export function bezier(p0:V3,p1:V3,p2:V3,p3:V3,t:number):V3 {
    const s=1-t,s2=s*s,t2=t*t;
    return add(add(mul(p0,s2*s),mul(p1,3*s2*t)),add(mul(p2,3*s*t2),mul(p3,t2*t)));
}
export function bezierTangent(p0:V3,p1:V3,p2:V3,p3:V3,t:number):V3 {
    const s=1-t;
    return add(add(mul(sub(p1,p0),3*s*s),mul(sub(p2,p1),6*s*t)),mul(sub(p3,p2),3*t*t));
}
/** Uniform parameterization: t runs across segments, not physical distance. */
export function sample(knots:KnotData[],closed:boolean,t:number):SplinePoint {
    const count=segmentCount(knots,closed),nt=clamp01(t);
    if(!count)return {position:knots.length?knots[0].position:v(),tangent:v(0,0,1),segment:0,u:0,distance:0};
    const scaled=nt*count,idx=Math.min(count-1,Math.floor(scaled)),u=idx===count-1 && nt===1?1:scaled-idx;
    const c=segment(knots,idx,closed);
    let tangent=bezierTangent(...c,u);
    if(mag(tangent)<EPS)tangent=sub(c[3],c[0]);
    return {position:bezier(...c,u),tangent:norm(tangent),segment:idx,u,distance:0};
}
/** Table stores cumulative chord length at fixed parameter intervals. */
export function buildArcLUT(input:KnotData[],closed:boolean,steps=24):ArcLUT {
    const knots=resolvedKnots(input,closed),segments=segmentCount(knots,closed);
    const res=Math.max(4,Math.min(256,Math.floor(steps)||24));
    const ts=[0],lengths=[0];let total=0,previous=sample(knots,closed,0).position;
    for(let i=1;i<=segments*res;i++) {
        const t=i/(segments*res),point=sample(knots,closed,t).position;
        total+=distance(previous,point);previous=point;
        ts.push(t);lengths.push(total);
    }
    return {ts,lengths,total,segments,closed,knots,steps:res};
}
export function parameterAtDistance(lut:ArcLUT,d:number):number {
    if(lut.total<EPS||lut.lengths.length<2)return 0;
    const x=Math.max(0,Math.min(lut.total,Number.isFinite(d)?d:0));
    let lo=0,hi=lut.lengths.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(lut.lengths[mid]<x)lo=mid;else hi=mid;}
    const a=lut.lengths[lo],b=lut.lengths[hi];
    return lut.ts[lo]+(lut.ts[hi]-lut.ts[lo])*(b-a>EPS?(x-a)/(b-a):0);
}
/** Arc length at uniform cubic parameter t, using the SAME LUT as distance->t.
 * This is a monotone, piecewise-linear inverse of parameterAtDistance (including
 * closed splines with t=1 representing the full loop).
 */
export function distanceAtParameter(lut:ArcLUT,t:number):number {
    if(lut.total<EPS||lut.ts.length<2)return 0;
    const x=clamp01(t);
    let lo=0,hi=lut.ts.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(lut.ts[mid]<x)lo=mid;else hi=mid;}
    const a=lut.ts[lo],b=lut.ts[hi];
    return lut.lengths[lo]+(lut.lengths[hi]-lut.lengths[lo])*(b-a>EPS?(x-a)/(b-a):0);
}
export function sampleDistance(lut:ArcLUT,d:number):SplinePoint {
    const t=parameterAtDistance(lut,d),p=sample(lut.knots,lut.closed,t);p.distance=d;return p;
}
export function sampleNormalizedDistance(lut:ArcLUT,t:number):SplinePoint {
    return sampleDistance(lut,clamp01(t)*lut.total);
}
/** Dense sample followed by local optimization; suitable for snapping or hit tests. */
export function nearestParameter(lut:ArcLUT,point:V3):number {
    if(lut.segments===0)return 0;
    let best=0,bestD=Infinity;
    for(const t of lut.ts){const p=sample(lut.knots,lut.closed,t).position;const d=dot(sub(point,p),sub(point,p));if(d<bestD){bestD=d;best=t;}}
    let span=1/Math.max(1,lut.segments*lut.steps);
    for(let i=0;i<10;i++){
        const a=clamp01(best-span),b=clamp01(best+span);
        const da=dot(sub(sample(lut.knots,lut.closed,a).position,point),sub(sample(lut.knots,lut.closed,a).position,point));
        const db=dot(sub(sample(lut.knots,lut.closed,b).position,point),sub(sample(lut.knots,lut.closed,b).position,point));
        if(da<bestD){bestD=da;best=a;}if(db<bestD){bestD=db;best=b;}span*=0.5;
    }
    return best;
}

/** De Casteljau split of a cubic Bezier. Both resulting segments exactly
 * reproduce the original curve (within floating point precision). */
export interface SplitBezier {
    position:V3;
    leftOut:V3;
    centerIn:V3;
    centerOut:V3;
    rightIn:V3;
}
export function splitBezier(p0:V3,p1:V3,p2:V3,p3:V3,t=0.5):SplitBezier {
    const u=clamp01(t);
    const a=lerp(p0,p1,u),b=lerp(p1,p2,u),c=lerp(p2,p3,u);
    const d=lerp(a,b,u),e=lerp(b,c,u),f=lerp(d,e,u);
    return {position:f,leftOut:sub(a,p0),centerIn:sub(d,f),centerOut:sub(e,f),rightIn:sub(c,p3)};
}
/** Split a segment in NATURAL (Hierarchy) order, regardless of the
 * SplineContainer's reversed playback option. */
export function splitSegment(input:KnotData[],closed:boolean,index:number,t=0.5) {
    const knots=resolvedKnots(input,closed);
    const n=knots.length;
    if(n<2||!Number.isInteger(index)||index<0||index>=segmentCount(knots,closed))throw Error('Segment index out of range');
    const next=(index+1)%n,first=knots[index],last=knots[next];
    const split=splitBezier(...segment(knots,index,closed),t);
    return {
        index,next,
        before:{tangentIn:first.tangentIn,tangentOut:split.leftOut},
        middle:{position:split.position,tangentIn:split.centerIn,tangentOut:split.centerOut},
        after:{tangentIn:split.rightIn,tangentOut:last.tangentOut},
    };
}
