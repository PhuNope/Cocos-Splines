'use strict';
/** Opt-in cost-aware route search over live Junction link snapshots.
 * Lengths are sampled in world space; they are estimates (chord sums),
 * not certified physical/geodesic distances. Runtime traffic signals,
 * capacity and direction constraints are intentionally not consulted.
 * Legacy minimum-switch BFS remains the default in SplineJunctionRouteMath.
 */
const MODES=Object.freeze(['switches','distance','balanced']);
const POLICIES=Object.freeze(['ignore','direction','direction-green']);
function validateRoutePolicy(policy='ignore'){
 if(!POLICIES.includes(policy))throw Error('Invalid Join route policy.');
 return policy;
}
/** Match SplineAnimate.commitJunctionSwitch: Preserve uses incoming
 * normalized-progress direction; Forward/Backward override to ±1.
 * Never infer traffic admission from this read-only Editor check.
 */
function exitPermits(target,incomingDirection,nextDirection,policy){
 if(policy==='ignore')return true;
 if(![0,1,2].includes(target.exitDirection))
   throw Error('Invalid Junction exitDirection in route snapshot.');
 if(policy==='direction-green'&&target.trafficSignal!==0)return false;
 const selected=target.exitDirection===1?1:
   target.exitDirection===2?-1:incomingDirection;
 return selected===nextDirection;
}
const finite=p=>!!p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function validateRouteCost(mode='switches',penalty=10){
 if(!MODES.includes(mode))
   throw Error('Invalid Join route cost mode (switches/distance/balanced).');
 if(!Number.isFinite(penalty)||penalty<0||penalty>100000)
   throw Error('Junction switch penalty must be between 0 and 100000 world units.');
 return {mode,penalty};
}
/** Build a sampled world-arc lookup for a Cocos SplineContainer.
 * tAtProgress is used because Junction progress is local normalized ARC,
 * while evaluateWorldPositionAtT is geometric Bezier t. Both methods
 * operate in the evaluated/reversed spline direction.
 */
function measureSplineWorldArc(spline){
 const count=spline?.knots?.length;
 if(!Number.isInteger(count)||count<2||count>128||
    typeof spline?.evaluateWorldPositionAtT!=='function'||
    typeof spline?.tAtProgress!=='function')
   throw Error('World route cost requires an open sampled SplineContainer.');
 const samples=Math.min(2048,Math.max(64,24*(count-1)));
 let previous=spline.evaluateWorldPositionAtT(0);
 if(!finite(previous))throw Error('World route cost sampled invalid position.');
 const cumulative=[0];
 for(let i=1;i<=samples;i++){
   const next=spline.evaluateWorldPositionAtT(i/samples);
   if(!finite(next))throw Error('World route cost sampled invalid position.');
   const step=distance(previous,next);
   if(!Number.isFinite(step))throw Error('World route distance overflow.');
   cumulative.push(cumulative[i-1]+step);
   previous=next;
 }
 const total=cumulative[samples];
 if(!Number.isFinite(total)||total<=1e-6||total>1e9)
   throw Error('World route cost requires a finite positive length.');
 function at(progress){
   if(!Number.isFinite(progress)||progress<0||progress>1)
     throw Error('Invalid Junction normalized arc progress for route cost.');
   if(progress===0)return 0;
   if(progress===1)return total;
   const t=spline.tAtProgress(progress);
   if(!Number.isFinite(t)||t<0||t>1)
     throw Error('Spline tAtProgress returned invalid geometric t.');
   const index=t*samples,lo=Math.floor(index);
   if(lo>=samples)return total;
   return cumulative[lo]+(cumulative[lo+1]-cumulative[lo])*(index-lo);
 }
 return {total,at,samples};
}
function score(mode,penalty,distanceWorld,switches){
 return mode==='switches'?switches:
   mode==='distance'?distanceWorld:distanceWorld+switches*penalty;
}
const compareLink=(a,b)=>a.junctionId.localeCompare(b.junctionId)||
 a.linkIndex-b.linkIndex||a.splineId.localeCompare(b.splineId);
function costRoute(links,anchor,goalSplineId,options={}){
 const {mode='distance',penalty=10,routeMode='full',
   startSide=0,goalSide=1,maxGap=1e-5,policy='ignore'}=options;
 validateRoutePolicy(policy);
 validateRouteCost(mode,penalty);
 if(!['full','partial'].includes(routeMode)||
    ![0,1].includes(startSide)||![0,1].includes(goalSide)||
    !Number.isFinite(maxGap)||maxGap<=0||maxGap>0.1||
    !Array.isArray(links)||links.length>1024||
    !anchor||typeof anchor.junctionId!=='string'||!anchor.junctionId||
    !Number.isInteger(anchor.linkIndex)||anchor.linkIndex<0||
    !goalSplineId||typeof goalSplineId!=='string'||goalSplineId.length>128)
   throw Error('Invalid cost-aware Junction route request.');
 const junctions=new Map(),splines=new Map(),seen=new Set();
 for(const l of links){
   if(!l||typeof l.junctionId!=='string'||!l.junctionId||
      typeof l.splineId!=='string'||!l.splineId||
      !Number.isInteger(l.linkIndex)||l.linkIndex<0||l.linkIndex>63||
      !Number.isFinite(l.progress)||l.progress<0||l.progress>1||
      !finite(l.world)||!Number.isFinite(l.worldArc)||
      !Number.isFinite(l.worldTotal)||l.worldTotal<=1e-6||
      l.worldTotal>1e9||l.worldArc<0||
      l.worldArc>l.worldTotal+1e-5||
      (policy!=='ignore'&&![0,1,2].includes(l.exitDirection))||
      (policy==='direction-green'&&![0,1,2].includes(l.trafficSignal)))
     throw Error('Cost-aware routes require finite sampled world arc lengths for all links.');
   const key=JSON.stringify([l.junctionId,l.linkIndex]);
   if(seen.has(key))throw Error('Duplicate Junction link index.');
   seen.add(key);
   // Values for the same spline must use the SAME sampled world metric.
   const previous=splines.get(l.splineId);
   if(previous&&Math.abs(previous[0].worldTotal-l.worldTotal)>1e-5)
     throw Error('Inconsistent sampled world length for source spline.');
   if(!junctions.has(l.junctionId))junctions.set(l.junctionId,[]);
   if(!splines.has(l.splineId))splines.set(l.splineId,[]);
   junctions.get(l.junctionId).push(l);
   splines.get(l.splineId).push(l);
 }
 for(const set of [...junctions.values(),...splines.values()])
   set.sort(compareLink);
 const start=(junctions.get(anchor.junctionId)||[]).find(l=>
   l.linkIndex===anchor.linkIndex);
 if(!start)throw Error('Cost route Anchor Junction link not found.');
 if(start.splineId===goalSplineId)
   throw Error('Destination must differ from Anchor spline.');
 if(routeMode==='partial'&&Math.abs(start.progress-startSide)<1e-5)
   throw Error('Partial cost route Anchor span is too short.');
 if(routeMode==='full'&&![0,1].includes(start.progress))
   throw Error('Full cost-aware route requires exact-endpoint links.');
 const firstLength=routeMode==='full'?start.worldTotal:
   Math.abs(start.worldArc-(startSide===0?0:start.worldTotal));
 if(firstLength<=1e-6)
   throw Error('Route Anchor segment must have positive sampled world length.');
 const first={splineId:start.splineId,progress:start.progress,
   junctionId:start.junctionId,linkIndex:start.linkIndex};
 if(routeMode==='partial'){
   first.fromProgress=startSide;
   first.toProgress=start.progress;
 }
 const keyFor=path=>path.map(p=>p.splineId+':'+p.junctionId+':'+
   p.linkIndex+':'+(p.toProgress??'')).join('|');
 const queue=[{exit:start,path:[first],worldDistance:firstLength,
    score:score(mode,penalty,firstLength,0),finished:false,
    travelDirection:routeMode==='full'?(start.progress===1?1:-1):
      (start.progress>startSide?1:-1),
    routeKey:keyFor([first])}];
 function order(a,b){
   const d=a.score-b.score;
   if(Math.abs(d)>1e-8)return d;
   const e=a.worldDistance-b.worldDistance;
   if(Math.abs(e)>1e-8)return e;
   if(a.path.length!==b.path.length)return a.path.length-b.path.length;
   return a.routeKey.localeCompare(b.routeKey);
 }
 let expanded=0;
 while(queue.length){
   queue.sort(order);
   const state=queue.shift();
   if(state.finished){
     const path=state.path;
     return {path,sourceCount:path.length,
       switchCount:path.length-1,
       junctionIds:path.slice(1).map(p=>p.junctionId),
       ...(routeMode==='partial'?{routeMode:'partial',startSide,goalSide}:{}),
       costMode:mode,switchPenalty:penalty,routePolicy:policy,
       estimatedWorldDistance:state.worldDistance,
       estimatedRouteCost:state.score};
   }
   if(++expanded>8192)
     throw Error('Cost route exceeded 8192 explored states. Simplify the Junction network.');
   const endpoints=junctions.get(state.exit.junctionId)||[];
   for(const target of endpoints){
     if(target.splineId===state.exit.splineId||
        state.path.some(p=>p.splineId===target.splineId)||
        distance(target.world,state.exit.world)>maxGap||
        (routeMode==='full'&&![0,1].includes(target.progress)))continue;
     const base={splineId:target.splineId,progress:target.progress,
       junctionId:target.junctionId,linkIndex:target.linkIndex};
     if(routeMode==='partial')base.fromProgress=target.progress;
     const available=[];
     if(target.splineId===goalSplineId){
       if(routeMode==='partial'&&Math.abs(target.progress-goalSide)<1e-5)
         continue;
       const leg=routeMode==='full'?target.worldTotal:
         Math.abs(target.worldArc-(goalSide===0?0:target.worldTotal));
       const nextDirection=routeMode==='full'?(target.progress===0?1:-1):
         (goalSide>target.progress?1:-1);
       if(leg>1e-6&&exitPermits(target,state.travelDirection,
          nextDirection,policy))available.push({
         finished:true,exit:target,length:leg,direction:nextDirection,
         step:routeMode==='partial'?{...base,toProgress:goalSide}:base,
       });
     }else if(state.path.length<7){
       for(const exit of splines.get(target.splineId)||[]){
         if(routeMode==='full'){
           if(exit.progress!==1-target.progress)continue;
         }else if(exit.junctionId===target.junctionId||
            Math.abs(exit.progress-target.progress)<1e-5)continue;
         const leg=routeMode==='full'?target.worldTotal:
           Math.abs(exit.worldArc-target.worldArc);
         const nextDirection=routeMode==='full'?(target.progress===0?1:-1):
           (exit.progress>target.progress?1:-1);
         if(leg<=1e-6||!exitPermits(target,state.travelDirection,
           nextDirection,policy))continue;
         available.push({finished:false,exit,length:leg,
           direction:nextDirection,
           step:routeMode==='partial'?
             {...base,toProgress:exit.progress}:base});
       }
     }
     for(const next of available){
       const path=[...state.path,next.step];
       if(next.finished&&(path.length<3||
          new Set(path.slice(1).map(p=>p.junctionId)).size<2))
         continue;
       const length=state.worldDistance+next.length;
       const switches=path.length-1;
       if(!Number.isFinite(length)||length>1e10)continue;
       queue.push({exit:next.exit,path,finished:next.finished,
         travelDirection:next.direction,
         worldDistance:length,score:score(mode,penalty,length,switches),
         routeKey:keyFor(path)});
       if(queue.length>16384)
         throw Error('Cost route frontier exceeded 16384 candidates.');
     }
   }
 }
 throw Error('No cost-aware Junction route found. Check snapped links, open splines and destination.');
}
module.exports={validateRouteCost,validateRoutePolicy,
  exitPermits,measureSplineWorldArc,costRoute};
