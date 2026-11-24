'use strict';
/** Non-destructive Junction Join: transforms two resolved cubic chains to
 * the anchor spline's local space and fuses ONE coincident endpoint.
 * Sources are never mutated; output is fresh Broken-mode spline geometry.
 */
const {transformFrame}=require('./SplineKnotEditMath');
const AXES=['x','y','z'];
const valid=v=>!!v&&AXES.every(k=>Number.isFinite(v[k]));
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const neg=v=>({x:-v.x,y:-v.y,z:-v.z});
const len=v=>Math.hypot(v.x,v.y,v.z);
function descriptor(source){
 if(!source||!Array.isArray(source.knots)||source.knots.length<2||
    source.knots.length>128||!Array.isArray(source.matrix)||
    ![0,1,2].includes(source.dimension)||typeof source.reversed!=='boolean'||
    (source.progress!==0&&source.progress!==1)||
    source.knots.some(k=>!valid(k?.position)||!valid(k?.tangentIn)||!valid(k?.tangentOut)))
    throw Error('Join requires valid open spline endpoint geometry.');
 const frame=transformFrame(source.matrix);
 const linear=source.matrix.slice();linear[12]=linear[13]=linear[14]=0;
 const vector=transformFrame(linear);
 return {source,frame,vector};
}
/** Source path A runs TOWARD the Junction; target path B runs AWAY.
 * A link at progress=0 reverses the A path, a link at progress=1
 * reverses B. Reversed SplineContainers are already traversed backward.
 */
function planJunctionJoin(anchor,target,tolerance=1e-5){
 if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>0.1)
    throw Error('Invalid Join endpoint tolerance.');
 const a=descriptor(anchor),b=descriptor(target);
 if(anchor.dimension!==target.dimension)
    throw Error('Both joined splines must use the same 2D/3D dimension.');
 const anchorVector=a.vector,anchorFrame=a.frame;
 function converted(source,reverse){
   const {frame,vector}=source;
   const prepared=source.source.knots.map(k=>{
     const world=frame.toWorld(k.position);
     const local=anchorFrame.toLocal(world);
     const tangentIn=anchorVector.toLocal(vector.toWorld(k.tangentIn));
     const tangentOut=anchorVector.toLocal(vector.toWorld(k.tangentOut));
     if(!valid(local)||!valid(tangentIn)||!valid(tangentOut)||
        len(local)>1e7||len(tangentIn)>1e7||len(tangentOut)>1e7)
        throw Error('Join produced unbounded transformed knot geometry.');
     // 2D source splines must share the SAME projected plane as anchor.
     const excluded=anchor.dimension===1?'z':anchor.dimension===2?'y':null;
     if(excluded&&(Math.abs(local[excluded])>1e-5||
        Math.abs(tangentIn[excluded])>1e-5||
        Math.abs(tangentOut[excluded])>1e-5))
        throw Error('Joined 2D spline planes do not align.');
     return {position:local,tangentIn,tangentOut,mode:4};
   });
   return reverse?prepared.reverse().map(k=>({
     position:k.position,tangentIn:neg(k.tangentOut),
     tangentOut:neg(k.tangentIn),mode:4,
   })):prepared;
 }
 // Natural knots are in physical child order, regardless of evaluated reverse.
 const first=converted(a,anchor.reversed!== (anchor.progress===0));
 const second=converted(b,target.reversed!== (target.progress===1));
 const end=first[first.length-1],start=second[0];
 const gap=len(sub(end.position,start.position));
 if(gap>tolerance)
    throw Error('Junction link endpoints are separated by '+
        gap.toFixed(6)+' local units; Snap Target Endpoint before Join.');
 const count=first.length+second.length-1;
 if(count>128)throw Error('Join would exceed the 128-Knot safety limit.');
 // Exactly one seam Knot retains A's incoming derivative and B's
 // outgoing derivative. C0 is guaranteed within tolerance; G1/C1 is
 // only achieved if source curves already have aligned controls.
 const seam={position:{...end.position},tangentIn:{...end.tangentIn},
     tangentOut:{...start.tangentOut},mode:4};
 const knots=[...first.slice(0,-1),seam,...second.slice(1)];
 if(knots.some(k=>!valid(k.position)||!valid(k.tangentIn)||!valid(k.tangentOut)))
    throw Error('Join generated invalid knots.');
 const inVec=neg(seam.tangentIn),outVec=seam.tangentOut;
 const aLength=len(inVec),bLength=len(outVec);
 const dotAngle=aLength>1e-9&&bLength>1e-9?
     Math.min(1,Math.max(-1,dot(inVec,outVec)/(aLength*bLength))):null;
 const angleDeg=dotAngle===null?null:Math.acos(dotAngle)*180/Math.PI;
 return {knots,count,closed:false,reversed:false,
     dimension:anchor.dimension,
     gap,angleDeg,continuousC1:
       gap<=1e-7&&aLength>1e-9&&Math.abs(aLength-bLength)<=1e-5&&
       angleDeg!==null&&angleDeg<=.01,
     sourceCounts:[first.length,second.length]};
}
module.exports={planJunctionJoin};
