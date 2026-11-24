'use strict';
/** Optional seam-only tangent correction on a NEW Joined spline.
 * Preserve: original cubic segments are identical to sources.
 * G1: align outgoing handle with incoming motion; retain outgoing length.
 * C1: same direction and same local derivative magnitude at the seam.
 * The inbound handle and all source Knot components remain unchanged.
 */
const MODES=Object.freeze(['preserve','g1','c1']);
function validateSeamMode(mode){
 if(!MODES.includes(mode))
   throw Error('Invalid Join seam mode: use preserve, g1 or c1.');
 return mode;
}
const finite=v=>!!v&&['x','y','z'].every(k=>Number.isFinite(v[k]));
const magnitude=v=>Math.hypot(v.x,v.y,v.z);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
function seamAngle(inward,outward){
 const i=magnitude(inward),o=magnitude(outward);
 if(i<=1e-9||o<=1e-9)return null;
 const cosine=Math.max(-1,Math.min(1,-dot(inward,outward)/(i*o)));
 return Math.acos(cosine)*180/Math.PI;
}
function smoothJunctionSeam(inward,outward,mode='preserve'){
 validateSeamMode(mode);
 if(!finite(inward)||!finite(outward))
   throw Error('Join seam tangents must be finite vectors.');
 const inLength=magnitude(inward),outLength=magnitude(outward);
 const beforeAngleDeg=seamAngle(inward,outward);
 if(mode==='preserve')
   return {tangentIn:{...inward},tangentOut:{...outward},
     seamMode:mode,beforeAngleDeg,angleDeg:beforeAngleDeg,
     adjusted:false,continuousC1:
       inLength>1e-9&&outLength>1e-9&&
       Math.abs(inLength-outLength)<=1e-5&&
       beforeAngleDeg!==null&&beforeAngleDeg<=.01};
 if(inLength<=1e-9||outLength<=1e-9)
   throw Error('Cannot smooth G1/C1: the Join seam has a zero-length tangent.');
 // Follow the untouched incoming curve. Only the outgoing segment on the
 // new output changes, never the original source or other output handles.
 const targetLength=mode==='c1'?inLength:outLength;
 const factor=-targetLength/inLength;
 const tangentOut={x:inward.x*factor,y:inward.y*factor,z:inward.z*factor};
 if(!finite(tangentOut)||magnitude(tangentOut)>1e7)
   throw Error('Join G1/C1 tangent correction exceeds bounds.');
 const angleDeg=seamAngle(inward,tangentOut);
 return {tangentIn:{...inward},tangentOut,
   seamMode:mode,beforeAngleDeg,angleDeg,
   adjusted:Math.hypot(tangentOut.x-outward.x,tangentOut.y-outward.y,
       tangentOut.z-outward.z)>1e-9,
   continuousC1:Math.abs(inLength-magnitude(tangentOut))<=1e-5&&
       angleDeg!==null&&angleDeg<=.01};
}
module.exports={validateSeamMode,smoothJunctionSeam};
