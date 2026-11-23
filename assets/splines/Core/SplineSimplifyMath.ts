/** Non-destructive greedy Bezier Knot simplification.
 * Removes interior control points only when a replacement cubic stays within
 * a sampled parametric deviation tolerance. This is NOT a continuous bound.
 * Endpoints of open paths and the first anchor of closed paths are retained.
 */
import * as M from './SplineMath';
import {ResampleResult} from './SplineResampleMath';
export interface SimplifyOptions {
 tolerance:number;
 samplesPerCurve?:number;
 space?:'local'|'world';
}
type Span={start:number;end:number;p0:M.V3;p1:M.V3;p2:M.V3;p3:M.V3;error:number};
const vec=(x:number,y:number,z:number):M.V3=>({x,y,z});
const add=(a:M.V3,b:M.V3)=>vec(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a:M.V3,b:M.V3)=>vec(a.x-b.x,a.y-b.y,a.z-b.z);
const finite=(p:M.V3)=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
export function simplifySpline(source:readonly M.KnotData[],closed:boolean,
 options:SimplifyOptions,metric:(p:M.V3)=>M.V3=p=>p):ResampleResult {
 if(!Array.isArray(source)||source.length<2||source.length>128||
    (closed&&source.length<3)||source.some(k=>!k||!finite(k.position)||
      !finite(k.tangentIn)||!finite(k.tangentOut)||!Number.isFinite(k.mode)))
   throw Error('Simplify requires 2–128 finite Knots (3 minimum for closed).');
 if(!options||!Number.isFinite(options.tolerance)||options.tolerance<.0001||
    options.tolerance>10000||typeof metric!=='function'||
    (options.space!==undefined&&!['local','world'].includes(options.space)))
   throw Error('Simplify requires a tolerance between 0.0001 and 10000 and Local/World metric.');
 const steps=Math.max(32,Math.min(256,Math.floor(options.samplesPerCurve??64)));
 if(steps*(closed?source.length:source.length-1)>65536)
   throw Error('Simplify exceeds arc sample budget.');
 const original=M.resolvedKnots(source.slice(),closed);
 const lut=M.buildArcLUT(source.slice(),closed,steps,metric);
 const length=lut.total;
 if(!Number.isFinite(length)||length<=1e-6)throw Error('Cannot simplify zero-length spline.');
 const n=original.length,segments=closed?n:n-1;
 const at=(distance:number)=>M.sampleDistance(lut,Math.max(0,Math.min(length,
   distance>length?distance-length:distance))).position;
 const dist=(index:number)=>M.distanceAtParameter(lut,index/segments);
 const startDistance=(index:number)=>dist(index);
 const spanEnd=(s:number,e:number)=>e<=s?dist(e)+length:dist(e);
 const initial=(i:number):Span=>{
   const [p0,p1,p2,p3]=M.segment(original,i,closed);
   return {start:i,end:(i+1)%n,p0,p1,p2,p3,error:0};
 };
 let spans:Span[]=Array.from({length:segments},(_,i)=>initial(i));
 function fitted(start:number,end:number):Span{
   const d0=startDistance(start),d1=spanEnd(start,end);
   if(!(d1>d0+1e-9))throw Error('Degenerate merge span.');
   const p0=original[start].position,p3=original[end].position;
   let aa=0,ab=0,bb=0;const va=vec(0,0,0),vb=vec(0,0,0);
   for(let i=1;i<32;i++){
     const u=i/32,v=1-u,a=3*v*v*u,b=3*v*u*u;
     const target=at(d0+(d1-d0)*u),w0=v*v*v,w3=u*u*u;
     const r=vec(target.x-w0*p0.x-w3*p3.x,
       target.y-w0*p0.y-w3*p3.y,target.z-w0*p0.z-w3*p3.z);
     aa+=a*a;ab+=a*b;bb+=b*b;
     va.x+=a*r.x;va.y+=a*r.y;va.z+=a*r.z;
     vb.x+=b*r.x;vb.y+=b*r.y;vb.z+=b*r.z;
   }
   const determinant=aa*bb-ab*ab;
   if(!(determinant>1e-12))throw Error('Singular simplify fit.');
   const p1=vec((va.x*bb-vb.x*ab)/determinant,(va.y*bb-vb.y*ab)/determinant,
     (va.z*bb-vb.z*ab)/determinant);
   const p2=vec((vb.x*aa-va.x*ab)/determinant,(vb.y*aa-va.y*ab)/determinant,
     (vb.z*aa-va.z*ab)/determinant);
   if(!finite(p1)||!finite(p2))throw Error('Non-finite simplify controls.');
   let error=0;
   for(let j=0;j<=64;j++){
     const u=j/64;
     const expected=metric(at(d0+(d1-d0)*u));
     const candidate=metric(M.bezier(p0,p1,p2,p3,u));
     if(!finite(expected)||!finite(candidate))throw Error('Invalid simplify metric.');
     error=Math.max(error,M.distance(expected,candidate));
   }
   return {start,end,p0,p1,p2,p3,error};
 }
 const minimum=closed?3:2;
 while(spans.length>minimum-(closed?0:1)){
   let best=-1,bestSpan:Span|null=null;
   // Removing a node joins its previous and next cubic. For closed curves,
   // index 0 remains the anchor, keeping hierarchy order stable.
   for(let i=1;i<(closed?spans.length:spans.length);i++){
     if(!closed&&i===spans.length)continue;
     const prev=spans[i-1],next=spans[i%spans.length];
     if(!closed&&i>=spans.length)continue;
     if(closed&&next.end===0&&spans.length<=3)continue;
     try{
       const merged=fitted(prev.start,next.end);
       if(merged.error<=options.tolerance &&
          (!bestSpan||merged.error<bestSpan.error)){
          bestSpan=merged;best=i;
       }
     }catch(_){/* Invalid merge: leave original topology untouched. */}
   }
   if(best<0||!bestSpan)break;
   spans.splice(best-1,2,bestSpan);
 }
 const ids=spans.map(s=>s.start);
 if(!closed)ids.push(spans[spans.length-1].end);
 const knots:M.KnotData[]=ids.map((id,i)=>{
   const prev=closed?spans[(i-1+spans.length)%spans.length]:(i?spans[i-1]:null);
   const next=spans[i]||null;
   return {position:vec(original[id].position.x,original[id].position.y,original[id].position.z),
     tangentIn:prev?sub(prev.p2,prev.p3):vec(0,0,0),
     tangentOut:next?sub(next.p1,next.p0):vec(0,0,0),
     mode:4,tension:1/3};
 });
 return {knots,count:knots.length,closed,sourceLength:length,
   actualSpacing:length/spans.length,
   estimatedMaxError:Math.max(0,...spans.map(s=>s.error)),
   testSamples:spans.length*65};
}
