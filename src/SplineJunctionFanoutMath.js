'use strict';
/** Join one inbound Junction link to multiple outbound links as independent
 * splines. A branched graph is not representable as one cubic chain; creating
 * one spline per exit preserves exact source Bezier geometry without backtracks.
 */
const {planJunctionJoin}=require('./SplineJunctionJoinMath');
function planJunctionFanout(anchor,targets){
 if(!anchor||!Array.isArray(targets)||targets.length<2||targets.length>8)
   throw Error('Fan-out Join requires 2 to 8 distinct outgoing links.');
 const ids=new Set(),routes=[];
 let totalKnotCount=0;
 for(const entry of targets){
   if(!entry||!Number.isInteger(entry.index)||entry.index<0||entry.index>63||
      ids.has(entry.index)||!entry.source)
     throw Error('Fan-out Join target indices must be distinct valid links.');
   ids.add(entry.index);
   const plan=planJunctionJoin(anchor,entry.source);
   totalKnotCount+=plan.count;
   if(totalKnotCount>256)
     throw Error('Fan-out Join exceeds the 256-Knot total safety limit.');
   routes.push({targetIndex:entry.index,knots:plan.knots,count:plan.count,
     gap:plan.gap,angleDeg:plan.angleDeg,
     continuousC1:plan.continuousC1});
 }
 return {routes,routeCount:routes.length,totalKnotCount,
   closed:false,reversed:false,dimension:anchor.dimension};
}
module.exports={planJunctionFanout};
