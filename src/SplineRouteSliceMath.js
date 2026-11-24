'use strict';
/** Exact, source-independent cubic trimming via de Casteljau, in the
 * NATURAL Knot order used by getNaturalResolvedKnots(). Parameters from
 * Cocos SplineContainer.tAtProgress() must first be mapped from reversed
 * evaluation order back to natural geometric Bezier parameter.
 */
const v=p=>({x:p.x,y:p.y,z:p.z});
const finite=p=>!!p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const zero=()=>({x:0,y:0,z:0});
const negate=a=>({x:-a.x,y:-a.y,z:-a.z});
function split(points,t){
 const [a,b,c,d]=points,ab=lerp(a,b,t),bc=lerp(b,c,t),
   cd=lerp(c,d,t),abc=lerp(ab,bc,t),bcd=lerp(bc,cd,t),
   pivot=lerp(abc,bcd,t);
 return [[a,ab,abc,pivot],[pivot,bcd,cd,d]];
}
function partialCubic(points,lo,hi){
 if(lo===0&&hi===1)return points;
 const after=lo>0?split(points,lo)[1]:points;
 return hi<1?split(after,(hi-lo)/(1-lo))[0]:after;
}
function sliceResolvedCubicKnots(knots,fromT,toT){
 if(!Array.isArray(knots)||knots.length<2||knots.length>128||
    knots.some(k=>!finite(k?.position)||!finite(k?.tangentIn)||
      !finite(k?.tangentOut))||
    !Number.isFinite(fromT)||!Number.isFinite(toT)||
    fromT<0||fromT>1||toT<0||toT>1||
    Math.abs(fromT-toT)<1e-8)
   throw Error('Partial Join requires 2–128 finite Knots and distinct Bezier t endpoints.');
 const backward=toT<fromT,lo=Math.min(fromT,toT),hi=Math.max(fromT,toT);
 const n=knots.length-1,spans=[];
 for(let i=0;i<n;i++){
   const first=Math.max(lo*n,i),last=Math.min(hi*n,i+1);
   if(last-first<=1e-12)continue;
   const a=knots[i],b=knots[i+1],p0=a.position,p3=b.position;
   const points=[p0,add(p0,a.tangentOut),add(p3,b.tangentIn),p3];
   spans.push(partialCubic(points,first-i,last-i));
 }
 if(!spans.length||spans.length+1>128)
   throw Error('Partial Join output exceeds the 128-Knot safety limit.');
 const output=[];
 for(let i=0;i<=spans.length;i++){
   const prev=spans[i-1],next=spans[i],position=i===spans.length?prev[3]:next[0];
   output.push({position:v(position),mode:4,
     tangentIn:prev?sub(prev[2],prev[3]):zero(),
     tangentOut:next?sub(next[1],next[0]):zero()});
 }
 if(output.some(k=>!finite(k.position)||!finite(k.tangentIn)||
    !finite(k.tangentOut)))
   throw Error('Partial Join de Casteljau geometry is non-finite.');
 if(backward)return output.reverse().map(k=>({
   position:k.position,tangentIn:negate(k.tangentOut),
   tangentOut:negate(k.tangentIn),mode:4,
 }));
 return output;
}
module.exports={sliceResolvedCubicKnots};
