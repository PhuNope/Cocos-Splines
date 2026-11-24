'use strict';
/** Editor-only full-spline route Join over multiple Junctions.
 * Each hop traverses a COMPLETE open source spline, then switches at a
 * physically coincident endpoint. Never duplicates segments to fake a fork.
 * This route policy intentionally ignores traffic signals and runtime costs:
 * it chooses minimum number of switches with deterministic UUID tie-breaks.
 */
const {planJunctionJoin}=require('./SplineJunctionJoinMath');
const {validateSeamMode}=require('./SplineJunctionSeamMath');
const {sliceResolvedCubicKnots}=require('./SplineRouteSliceMath');
const finite=p=>!!p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const gap=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function planEndpointJunctionChain(links,anchor,goalSplineId,maxGap=1e-5){
 if(!Array.isArray(links)||links.length>1024||
    !anchor||typeof anchor.junctionId!=='string'||!anchor.junctionId||
    !Number.isInteger(anchor.linkIndex)||anchor.linkIndex<0||
    typeof goalSplineId!=='string'||!goalSplineId||goalSplineId.length>128||
    !Number.isFinite(maxGap)||maxGap<=0||maxGap>0.1)
   throw Error('Invalid multi-Junction route request.');
 const valid=[],seen=new Set();
 for(const l of links){
   if(!l||typeof l.junctionId!=='string'||!l.junctionId||
      typeof l.splineId!=='string'||!l.splineId||
      !Number.isInteger(l.linkIndex)||l.linkIndex<0||l.linkIndex>63||
      !Number.isFinite(l.progress)||l.progress<0||l.progress>1||
      !finite(l.world))
     throw Error('Invalid multi-Junction link snapshot.');
   const key=JSON.stringify([l.junctionId,l.linkIndex]);
   if(seen.has(key))throw Error('Duplicate Junction link index.');
   seen.add(key);
   if(l.progress===0||l.progress===1)valid.push(l);
 }
 const start=valid.find(l=>l.junctionId===anchor.junctionId&&
     l.linkIndex===anchor.linkIndex);
 if(!start)throw Error('Anchor must be a valid exact-endpoint Junction link.');
 if(start.splineId===goalSplineId)
   throw Error('Destination must be a different spline.');
 const groups=new Map();
 for(const link of valid){
   if(!groups.has(link.junctionId))groups.set(link.junctionId,[]);
   groups.get(link.junctionId).push(link);
 }
 const byExit=new Map();
 for(const link of valid){
   const key=JSON.stringify([link.splineId,link.progress]);
   const siblings=byExit.get(key)||[];
   siblings.push(link);byExit.set(key,siblings);
 }
 const compare=(a,b)=>a.junctionId.localeCompare(b.junctionId)||
    a.linkIndex-b.linkIndex||a.splineId.localeCompare(b.splineId);
 for(const group of groups.values())group.sort(compare);
 for(const group of byExit.values())group.sort(compare);
 const queue=[{exit:start.progress,path:[{
   splineId:start.splineId,progress:start.progress,
   junctionId:start.junctionId,linkIndex:start.linkIndex,
 }]}],visited=new Set();
 for(let cursor=0;cursor<queue.length;cursor++){
   if(cursor>4096)throw Error('Multi-Junction routing exceeded state limit.');
   const state=queue[cursor],last=state.path[state.path.length-1];
   const endpoint=JSON.stringify([last.splineId,state.exit]);
   if(visited.has(endpoint))continue;
   visited.add(endpoint);
   const matches=state.path.length===1?[start]:(byExit.get(endpoint)||[]);
   for(const link of matches){
     const targets=groups.get(link.junctionId)||[];
     for(const target of targets){
       if(target.splineId===last.splineId||
          state.path.some(s=>s.splineId===target.splineId)||
          gap(link.world,target.world)>maxGap)continue;
       const path=[...state.path,{
         splineId:target.splineId,progress:target.progress,
         junctionId:target.junctionId,linkIndex:target.linkIndex,
       }];
       if(target.splineId===goalSplineId){
         if(path.length<3||new Set(path.slice(1).map(s=>s.junctionId)).size<2)
           // Two-link/single-Junction joins use the existing Join tool.
           continue;
         return {path,sourceCount:path.length,
           switchCount:path.length-1,
           junctionIds:path.slice(1).map(s=>s.junctionId)};
       }
       if(path.length<8)queue.push({path,exit:1-target.progress});
     }
   }
 }
 throw Error('No endpoint-only route across 2+ Junctions found. Snap endpoints, verify link directions or choose another destination.');
}
/** Compose contiguous, full-curve Bezier chains with existing Join math.
 * The merged output is in the first source's local transform space;
 * a transformed intermediate spline is not modified or reparented.
 */
function planMultiJunctionGeometry(path,descriptors,seamMode='preserve'){
 validateSeamMode(seamMode);
 if(!Array.isArray(path)||path.length<3||path.length>8||
    !Array.isArray(descriptors)||descriptors.length!==path.length||
    new Set(path.map(p=>p.splineId)).size!==path.length)
   throw Error('Multi-Junction Join requires 3 to 8 unique source splines.');
 for(let i=0;i<path.length;i++)
   if(!path[i]||!descriptors[i]||
      descriptors[i].progress!==path[i].progress)
     throw Error('Multi-Junction source orientation mismatch.');
 const start=descriptors[0],seams=[];
 let result=null;
 for(let i=1;i<descriptors.length;i++){
   const prefix=i===1?start:{
     ...start,knots:result.knots,reversed:false,progress:1,
   };
   result=planJunctionJoin(prefix,descriptors[i],1e-5,seamMode);
   seams.push({atKnot:result.sourceCounts[0]-1,
     junctionId:path[i].junctionId,
     angleDeg:result.angleDeg,beforeAngleDeg:result.beforeAngleDeg,
     seamMode:result.seamMode,seamAdjusted:result.seamAdjusted,
     continuousC1:result.continuousC1,gap:result.gap});
 }
 return {...result,seams,seamMode,sourceCount:path.length,
   switchCount:path.length-1,
   sourceSplineUuids:path.map(p=>p.splineId)};
}
/** Opt-in partial-route BFS: each traversed source is one monotonic arc from
 * its arrival link to its departure link. Start/goal sides disambiguate
 * travel into/out of mid-spline endpoints without modifying source knots.
 * The graph is based on CURRENT Scene link snapshots, not runtime registry.
 */
function planPartialJunctionChain(links,anchor,goalSplineId,
    startSide=0,goalSide=1,maxGap=1e-5){
 if(!Array.isArray(links)||links.length>1024||!anchor||
    typeof anchor.junctionId!=='string'||!anchor.junctionId||
    !Number.isInteger(anchor.linkIndex)||anchor.linkIndex<0||
    typeof goalSplineId!=='string'||!goalSplineId||
    goalSplineId.length>128||![0,1].includes(startSide)||
    ![0,1].includes(goalSide)||!Number.isFinite(maxGap)||
    maxGap<=0||maxGap>0.1)
   throw Error('Invalid partial Junction route request / direction.');
 const seen=new Set(),byJunction=new Map(),bySpline=new Map();
 const compare=(a,b)=>a.junctionId.localeCompare(b.junctionId)||
   a.linkIndex-b.linkIndex||a.splineId.localeCompare(b.splineId);
 for(const l of links){
   if(!l||typeof l.junctionId!=='string'||!l.junctionId||
      typeof l.splineId!=='string'||!l.splineId||
      !Number.isInteger(l.linkIndex)||l.linkIndex<0||l.linkIndex>63||
      !Number.isFinite(l.progress)||l.progress<0||l.progress>1||
      !finite(l.world))
     throw Error('Invalid partial Junction link snapshot.');
   const id=JSON.stringify([l.junctionId,l.linkIndex]);
   if(seen.has(id))throw Error('Duplicate partial Junction link index.');
   seen.add(id);
   if(!byJunction.has(l.junctionId))byJunction.set(l.junctionId,[]);
   if(!bySpline.has(l.splineId))bySpline.set(l.splineId,[]);
   byJunction.get(l.junctionId).push(l);
   bySpline.get(l.splineId).push(l);
 }
 for(const array of [...byJunction.values(),...bySpline.values()])
   array.sort(compare);
 const start=(byJunction.get(anchor.junctionId)||[]).find(l=>
   l.linkIndex===anchor.linkIndex);
 if(!start)throw Error('Selected partial-route Anchor link not found.');
 if(start.splineId===goalSplineId)
   throw Error('Destination must differ from partial-route Anchor spline.');
 const minSpan=1e-5;
 if(Math.abs(start.progress-startSide)<minSpan)
   throw Error('Partial-route Anchor must have distance from its chosen start side.');
 const first={
   splineId:start.splineId,progress:start.progress,
   fromProgress:startSide,toProgress:start.progress,
   junctionId:start.junctionId,linkIndex:start.linkIndex,
 };
 const states=[{exit:start,path:[first]}],visited=new Set();
 for(let cursor=0;cursor<states.length;cursor++){
   if(cursor>4096)throw Error('Partial Junction route exceeded 4096 states.');
   const current=states[cursor];
   const visit=JSON.stringify([current.exit.junctionId,
     current.exit.linkIndex,current.path.map(p=>p.splineId)]);
   if(visited.has(visit))continue;
   visited.add(visit);
   const available=byJunction.get(current.exit.junctionId)||[];
   for(const target of available){
     if(target.splineId===current.exit.splineId||
        current.path.some(p=>p.splineId===target.splineId)||
        gap(current.exit.world,target.world)>maxGap)continue;
     const base={
       splineId:target.splineId,progress:target.progress,
       fromProgress:target.progress,
       junctionId:target.junctionId,linkIndex:target.linkIndex,
     };
     if(target.splineId===goalSplineId){
       if(Math.abs(target.progress-goalSide)<minSpan)continue;
       const path=[...current.path,{...base,toProgress:goalSide}];
       if(path.length<3||
          new Set(path.slice(1).map(p=>p.junctionId)).size<2)continue;
       return {path,sourceCount:path.length,
         switchCount:path.length-1,
         junctionIds:path.slice(1).map(p=>p.junctionId),
         routeMode:'partial',startSide,goalSide};
     }
     if(current.path.length>=7)continue; // 8 sources including goal.
     for(const exit of bySpline.get(target.splineId)||[]){
       if(exit.junctionId===target.junctionId||
          Math.abs(exit.progress-target.progress)<minSpan)continue;
       states.push({exit,path:[...current.path,{
         ...base,toProgress:exit.progress,
       }]});
     }
   }
 }
 throw Error('No partial route across 2+ Junctions. Check connection proximity, intermediate links, start/end sides and direction.');
}
/** Clip each source's exact cubic curve to the two LINK distances. The Scene
 * supplies natural geometric t (converted from its normalized distance
 * coordinate using SplineContainer.tAtProgress and reversed mapping).
 * No re-fitting or source changes occur. The existing endpoint Join then
 * welds successive clipped output chains at their adjacent endpoints.
 */
function planPartialJunctionGeometry(path,descriptors,seamMode='preserve'){
 validateSeamMode(seamMode);
 if(!Array.isArray(path)||path.length<3||path.length>8||
    !Array.isArray(descriptors)||descriptors.length!==path.length||
    new Set(path.map(p=>p.splineId)).size!==path.length)
   throw Error('Partial route requires 3–8 distinct source splines.');
 const pieces=[];
 for(let i=0;i<path.length;i++){
   const step=path[i],src=descriptors[i];
   if(!src||!step||src.dimension!==descriptors[0].dimension||
      !Number.isFinite(src.fromT)||!Number.isFinite(src.toT)||
      src.fromProgress!==step.fromProgress||
      src.toProgress!==step.toProgress||
      Math.abs(src.fromT-src.toT)<1e-8)
     throw Error('Partial route source t/distance orientation mismatch.');
   pieces.push({matrix:src.matrix,dimension:src.dimension,
     knots:sliceResolvedCubicKnots(src.knots,src.fromT,src.toT),
     reversed:false,progress:i===0?1:0});
 }
 let result=null;
 const seams=[];
 for(let i=1;i<pieces.length;i++){
   const prefix=i===1?pieces[0]:{
     ...pieces[0],knots:result.knots,reversed:false,progress:1,
   };
   result=planJunctionJoin(prefix,pieces[i],1e-5,seamMode);
   seams.push({atKnot:result.sourceCounts[0]-1,
     junctionId:path[i].junctionId,
     angleDeg:result.angleDeg,beforeAngleDeg:result.beforeAngleDeg,
     seamMode:result.seamMode,seamAdjusted:result.seamAdjusted,
     continuousC1:result.continuousC1,gap:result.gap});
 }
 return {...result,seams,seamMode,routeMode:'partial',
   sourceCount:path.length,switchCount:path.length-1,
   sourceSplineUuids:path.map(p=>p.splineId)};
}
module.exports={planEndpointJunctionChain,planMultiJunctionGeometry,
  planPartialJunctionChain,planPartialJunctionGeometry};
