/**
 * Cocos Splines v2 core prototype. Independent of `cc` and editor APIs.
 * Knot handles are relative vectors. This module is not yet connected to the
 * Cocos component layer; it is a tested foundation for a future rewrite.
 */
export interface V3 { readonly x:number; readonly y:number; readonly z:number; }
export interface SplineKnotV2 {
    readonly position:V3;
    /** Relative incoming Bezier handle; when absent, defaults to straight chord. */
    readonly handleIn?:V3;
    /** Relative outgoing Bezier handle; when absent, defaults to straight chord. */
    readonly handleOut?:V3;
    /** Per-knot Catmull-Rom tension, clamped to [0,1]. 0 = smooth, 1 = flat. */
    readonly tension?:number;
}
export type CurveTypeV2='linear'|'bezier'|'catmull-rom';
export interface SplineDataV2 {
    readonly knots:ReadonlyArray<SplineKnotV2>;
    readonly closed:boolean;
    readonly type:CurveTypeV2;
}
export interface SplineSampleV2 {readonly position:V3;readonly tangent:V3;}
export interface LengthPointV2 {readonly parameter:number;readonly distance:number;}
export interface LengthTableV2 {
    readonly points:ReadonlyArray<LengthPointV2>;
    readonly length:number;
    readonly segments:number;
}
const v=(x=0,y=0,z=0):V3=>({x,y,z});
const add=(a:V3,b:V3):V3=>v(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a:V3,b:V3):V3=>v(a.x-b.x,a.y-b.y,a.z-b.z);
const scale=(a:V3,k:number):V3=>v(a.x*k,a.y*k,a.z*k);
const mix=(a:V3,b:V3,t:number):V3=>add(scale(a,1-t),scale(b,t));
const length=(a:V3):number=>Math.hypot(a.x,a.y,a.z);
const clamp=(x:number,lo:number,hi:number):number=>Math.min(hi,Math.max(lo,x));
const finiteV=(a:V3):boolean=>Number.isFinite(a.x)&&Number.isFinite(a.y)&&Number.isFinite(a.z);
export const splineSegmentsV2=(s:SplineDataV2):number=>Math.max(0,s.closed?s.knots.length: s.knots.length-1);
/** Throw when a user-edited spline would introduce NaN, Infinity or a bad curve mode. */
export function validateSplineV2(s:SplineDataV2):void {
    if(!['linear','bezier','catmull-rom'].includes(s.type))throw new Error('Unknown spline type');
    if(s.knots.length<2)throw new Error('Spline requires at least two knots');
    for(const knot of s.knots){
        if(!finiteV(knot.position)|| (knot.handleIn&&!finiteV(knot.handleIn))|| (knot.handleOut&&!finiteV(knot.handleOut)) || (knot.tension!==undefined&&!Number.isFinite(knot.tension)))
            throw new Error('Non-finite spline knot data');
    }
}
function sampleSegment(s:SplineDataV2,index:number,t:number):SplineSampleV2 {
    const n=s.knots.length,i=clamp(index,0,splineSegmentsV2(s)-1),a=s.knots[i],b=s.knots[(i+1)%n];
    const p0=a.position,p1=b.position,delta=sub(p1,p0);
    if(s.type==='linear')return {position:mix(p0,p1,t),tangent:delta};
    if(s.type==='bezier'){
        const c1=add(p0,a.handleOut??scale(delta,1/3));
        const c2=add(p1,b.handleIn??scale(delta,-1/3));
        const u=1-t;
        const position=add(add(scale(p0,u*u*u),scale(c1,3*u*u*t)),add(scale(c2,3*u*t*t),scale(p1,t*t*t)));
        const tangent=add(add(scale(sub(c1,p0),3*u*u),scale(sub(c2,c1),6*u*t)),scale(sub(p1,c2),3*t*t));
        return {position,tangent};
    }
    const pPrev=s.knots[s.closed?(i-1+n)%n:Math.max(0,i-1)].position;
    const pNext=s.knots[s.closed?(i+2)%n:Math.min(n-1,i+2)].position;
    const m0=scale(sub(p1,pPrev),(1-clamp(a.tension??0,0,1))*.5);
    const m1=scale(sub(pNext,p0),(1-clamp(b.tension??0,0,1))*.5);
    const t2=t*t,t3=t2*t;
    return {
        position:add(add(scale(p0,2*t3-3*t2+1),scale(m0,t3-2*t2+t)),add(scale(p1,-2*t3+3*t2),scale(m1,t3-t2))),
        tangent:add(add(scale(p0,6*t2-6*t),scale(m0,3*t2-4*t+1)),add(scale(p1,-6*t2+6*t),scale(m1,3*t2-2*t)))
    };
}
/** t is normalized over all segments. A closed spline at t=1 wraps to knot 0. */
export function evaluateSplineV2(s:SplineDataV2,t:number):SplineSampleV2 {
    const count=splineSegmentsV2(s);
    if(count===0)return {position:s.knots[0]?.position??v(),tangent:v()};
    const norm=clamp(Number.isFinite(t)?t:0,0,1);
    if(norm===1&&!s.closed)return sampleSegment(s,count-1,1);
    const scaled=norm*count,index=Math.min(count-1,Math.floor(scaled));
    return sampleSegment(s,index,norm===1?1:scaled-index);
}
/** Adaptive arc-length table. No fixed samples per curve; no Cocos engine state. */
export function buildSplineLengthV2(s:SplineDataV2,tolerance=.001,maxDepth=12):LengthTableV2 {
    validateSplineV2(s);
    if(!Number.isFinite(tolerance)||tolerance<=0)throw new Error('Tolerance must be positive');
    if(!Number.isInteger(maxDepth)||maxDepth<1||maxDepth>20)throw new Error('maxDepth must be 1..20');
    const segments=splineSegmentsV2(s),points:LengthPointV2[]=[{parameter:0,distance:0}];
    let total=0;
    const visit=(t0:number,p0:V3,t1:number,p1:V3,depth:number):void=>{
        const tm=(t0+t1)/2,pm=evaluateSplineV2(s,tm).position;
        const chord=length(sub(p1,p0));
        const two=length(sub(pm,p0))+length(sub(p1,pm));
        if(depth>=maxDepth || two-chord<=tolerance*(t1-t0)*segments){
            // Polyline approximation includes midpoint to retain curve length.
            total+=two;
            points.push({parameter:t1,distance:total});
        }else{visit(t0,p0,tm,pm,depth+1);visit(tm,pm,t1,p1,depth+1);}
    };
    for(let i=0;i<segments;i++){
        const t0=i/segments,t1=(i+1)/segments;
        visit(t0,evaluateSplineV2(s,t0).position,t1,evaluateSplineV2(s,t1).position,0);
    }
    return {points,length:total,segments};
}
/** Find a normalized spline parameter at an arc-length distance. */
export function parameterAtDistanceV2(table:LengthTableV2,distance:number):number {
    if(table.length<=1e-12||table.points.length<2)return 0;
    const target=clamp(Number.isFinite(distance)?distance:0,0,table.length);
    if(target===table.length)return 1;
    const pts=table.points;
    let lo=0,hi=pts.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(pts[mid].distance<=target)lo=mid;else hi=mid;}
    const a=pts[lo],b=pts[hi];
    const width=b.distance-a.distance;
    return width<1e-12?a.parameter:a.parameter+(b.parameter-a.parameter)*(target-a.distance)/width;
}
