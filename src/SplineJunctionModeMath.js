'use strict';
/** Pure mode conversion for explicit Junction endpoint workflows.
 * Convert the currently resolved local curve to serialized Broken tangents.
 * It NEVER edits the source spline, node or handle objects.
 */
const {inverseRotate}=require('./SplineTopologyCopyMath');
const finite=p=>!!p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
function planJunctionBrokenConversion({mode,resolvedIn,resolvedOut,storedIn,storedOut,
 knotRotation,handleIn=false,handleOut=false,tangentsInKnotSpace=false,
 dimension=0}){
 if(!Number.isInteger(mode)||mode<0||mode>4||
   ![0,1,2].includes(dimension)||!finite(resolvedIn)||!finite(resolvedOut)||
   !finite(storedIn)||!finite(storedOut)||typeof handleIn!=='boolean'||
   typeof handleOut!=='boolean'||typeof tangentsInKnotSpace!=='boolean')
   throw Error('Invalid Junction Broken tangent conversion input.');
 const hidden=dimension===1?'z':dimension===2?'y':null;
 const convert=(v,previous,handle)=>{
   const after=(handle||tangentsInKnotSpace)?
     inverseRotate(knotRotation,v):{...v};
   // Runtime projects the excluded 2D axis; retain serialized hidden values.
   if(hidden)after[hidden]=previous[hidden];
   if(!finite(after)||Math.hypot(after.x,after.y,after.z)>1e7)
     throw Error('Junction conversion tangents exceed safe local coordinates.');
   return after;
 };
 if(mode===4)return {beforeMode:4,afterMode:4,changed:false,
   beforeIn:{...storedIn},beforeOut:{...storedOut},
   afterIn:{...storedIn},afterOut:{...storedOut}};
 return {beforeMode:mode,afterMode:4,changed:true,
   beforeIn:{...storedIn},beforeOut:{...storedOut},
   afterIn:convert(resolvedIn,storedIn,handleIn),
   afterOut:convert(resolvedOut,storedOut,handleOut)};
}
module.exports={planJunctionBrokenConversion};
