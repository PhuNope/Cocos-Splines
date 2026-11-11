import {evaluateSplineV2,type V3} from './SplineCurves';
import {parameterAtCachedDistanceV2,type SplineCacheV2} from './SplineCache';
export interface SplineFrameV2 {readonly distance:number;readonly parameter:number;readonly position:V3;readonly tangent:V3;readonly right:V3;readonly up:V3;}
export interface SplineFramesV2 {readonly length:number;readonly frames:ReadonlyArray<SplineFrameV2>;readonly closed:boolean;}
export interface SplineFramesOptionsV2 {readonly maxStep?:number;readonly maxFrames?:number;readonly up?:V3;}
const v=(x:number,y:number,z:number):V3=>({x,y,z});
const add=(a:V3,b:V3):V3=>v(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a:V3,b:V3):V3=>v(a.x-b.x,a.y-b.y,a.z-b.z);
const mul=(a:V3,k:number):V3=>v(a.x*k,a.y*k,a.z*k);
const dot=(a:V3,b:V3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:V3,b:V3):V3=>v(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const length=(a:V3)=>Math.hypot(a.x,a.y,a.z);
const norm=(a:V3,otherwise:V3):V3=>{const l=length(a);return l>1e-10&&Number.isFinite(l)?mul(a,1/l):otherwise;};
const clamp=(x:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,x));
const axes=[v(1,0,0),v(0,1,0),v(0,0,1)];
function startRight(t:V3,hint:V3):V3 {
    let up=sub(hint,mul(t,dot(hint,t)));
    if(length(up)<1e-9){let best=axes[0];for(const a of axes)if(Math.abs(dot(a,t))<Math.abs(dot(best,t)))best=a;up=sub(best,mul(t,dot(best,t)));}
    return norm(cross(norm(up,v(0,1,0)),t),v(1,0,0));
}
function rotate(a:V3,axis:V3,sine:number,cosine:number):V3 {
    return add(add(mul(a,cosine),mul(cross(axis,a),sine)),mul(axis,dot(axis,a)*(1-cosine)));
}
function transport(t0:V3,t1:V3,right:V3,up:V3):V3 {
    const axis=cross(t0,t1),s=length(axis),c=clamp(dot(t0,t1),-1,1);
    const rotated=s>1e-9?rotate(right,mul(axis,1/s),s,c):c<0?rotate(right,up,0,-1):right;
    return norm(sub(rotated,mul(t1,dot(rotated,t1))),startRight(t1,up));
}
function frame(distance:number,parameter:number,position:V3,tangent:V3,right:V3):SplineFrameV2 {
    const r=norm(sub(right,mul(tangent,dot(right,tangent))),startRight(tangent,v(0,1,0)));
    return {distance,parameter,position,tangent,right:r,up:norm(cross(tangent,r),v(0,1,0))};
}
function tangentAt(cache:SplineCacheV2,t:number,fallback:V3):V3 {
    const value=evaluateSplineV2(cache.spline,t).tangent;
    if(length(value)>1e-10)return norm(value,fallback);
    const dt=Math.max(1e-6,Math.min(1e-3,1/(cache.segments.length*100)));
    const a=evaluateSplineV2(cache.spline,clamp(t-dt,0,1)).position;
    const b=evaluateSplineV2(cache.spline,clamp(t+dt,0,1)).position;
    return norm(sub(b,a),fallback);
}
/** Rotation-minimizing parallel-transport frame cache; corrects seam twist for closed loops. */
export function buildSplineFramesV2(cache:SplineCacheV2,options:SplineFramesOptionsV2={}):SplineFramesV2 {
    const total=cache.length,step=options.maxStep??(total>0?total/128:1),limit=options.maxFrames??8193;
    if(!Number.isFinite(step)||step<=0)throw new Error('maxStep must be positive');
    if(!Number.isInteger(limit)||limit<2||limit>100000)throw new Error('maxFrames must be an integer in [2,100000]');
    if(options.up&&![options.up.x,options.up.y,options.up.z].every(Number.isFinite))throw new Error('Non-finite up hint');
    const count=total>1e-12?Math.max(1,Math.ceil(total/step)):1;
    if(count+1>limit)throw new Error('Frame count exceeds maxFrames; increase maxStep');
    const frames:SplineFrameV2[]=[];
    let t0=v(0,0,1),right=v(1,0,0),up=v(0,1,0);
    for(let i=0;i<=count;i++){
        const distance=i===count?total:total*i/count;
        const parameter=parameterAtCachedDistanceV2(cache,distance);
        const sample=evaluateSplineV2(cache.spline,parameter);
        const tangent=tangentAt(cache,parameter,t0);
        right=i===0?startRight(tangent,options.up??v(0,1,0)):transport(t0,tangent,right,up);
        const f=frame(distance,parameter,sample.position,tangent,right);
        frames.push(f);t0=tangent;right=f.right;up=f.up;
    }
    if(cache.spline.closed&&total>1e-12){
        const first=frames[0],last=frames[frames.length-1];
        const correction=Math.atan2(dot(cross(last.right,first.right),first.tangent),dot(last.right,first.right));
        for(let i=1;i<frames.length;i++){
            const f=frames[i],a=correction*f.distance/total;
            frames[i]=frame(f.distance,f.parameter,f.position,f.tangent,rotate(f.right,f.tangent,Math.sin(a),Math.cos(a)));
        }
        frames[frames.length-1]={...first,distance:total,parameter:1};
    }
    return Object.freeze({length:total,closed:cache.spline.closed,frames:Object.freeze(frames.map(f=>Object.freeze(f)))});
}
/** Samples position and orthonormal orientation without reconstructing the entire frame table. */
export function frameAtDistanceV2(cache:SplineCacheV2,table:SplineFramesV2,distance:number,wrap=false):SplineFrameV2 {
    let d=Number.isFinite(distance)?distance:0;
    if(wrap&&cache.spline.closed&&cache.length>0)d=((d%cache.length)+cache.length)%cache.length;
    d=clamp(d,0,cache.length);
    const list=table.frames;
    if(list.length<2)throw new Error('Empty frame cache');
    let lo=0,hi=list.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(list[mid].distance<=d)lo=mid;else hi=mid;}
    const a=list[lo],b=list[hi];
    if(d===a.distance)return a;
    if(d===b.distance)return b;
    const ratio=(d-a.distance)/Math.max(1e-12,b.distance-a.distance);
    const parameter=parameterAtCachedDistanceV2(cache,d),sample=evaluateSplineV2(cache.spline,parameter);
    const tangent=tangentAt(cache,parameter,a.tangent);
    const bRight=dot(a.right,b.right)<-.9?transport(a.tangent,tangent,a.right,a.up):b.right;
    return frame(d,parameter,sample.position,tangent,norm(add(mul(a.right,1-ratio),mul(bRight,ratio)),a.right));
}
