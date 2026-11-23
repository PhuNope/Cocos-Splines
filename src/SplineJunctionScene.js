'use strict';
/**
 * Scene-only orchestration for SplineJunction diagnostics and endpoint snap.
 * All Cocos calls go through an injected adapter; geometry remains pure.
 */
const {worldTangent,analyzeConnections,planEndpointSnap}=require('./SplineConnectionMath');
function createJunctionScene({resolve,classOf,queryKnotEditFrame,sceneId}){
 function junctionAt(uuid){
   const node=resolve(uuid);
   if(!node||node.isValid===false)return null;
   const c=node.components.find(x=>classOf(x)==='Splines.SplineJunction');
   return c&&c.enabled!==false?c:null;
 }
 function samples(junction){
   if(!Array.isArray(junction.connections)||junction.connections.length>64)
     throw Error('Junction must have at most 64 connections.');
   const entries=[];
   for(let index=0;index<junction.connections.length;index++){
     const link=junction.connections[index],spline=link?.spline;
     if(!spline||spline.enabled===false||spline.node?.isValid===false||
        spline.count<2)continue;
     const progress=link.getProgress();
     if(!Number.isFinite(progress)||progress<0||progress>1)
       throw Error('Invalid progress for Junction link '+index);
     const frame=queryKnotEditFrame(spline.node.uuid);
     if(!frame.ok)throw Error(frame.error||'Invalid spline world transform.');
     const position=spline.evaluateWorldPosition(progress);
     entries.push({index,link,spline,progress,worldMatrix:frame.matrix,
       position:{x:position.x,y:position.y,z:position.z},
       tangent:worldTangent(spline.evaluateTangent(progress),frame.matrix)});
   }
   return entries;
 }
 function fingerprint(junction,targetKnotUuid){
   const scene=sceneId();
   if(typeof scene!=='string'||!scene)throw Error('Scene is no longer active.');
   const entries=samples(junction);
   const state=entries.map(e=>{
     const {spline,link}=e;
     const knots=spline.knots.map(k=>{
       const n=k.node;
       if(!n||n.parent!==spline.node||n.isValid===false)
         throw Error('Invalid Knot hierarchy in Junction.');
       const p=n.position,q=n.rotation;
       return [n.uuid,n.parent.uuid,n.uuid===targetKnotUuid?null:[p.x,p.y,p.z],
         [q.x,q.y,q.z,q.w],k.mode,k.tension,k.tangentsInKnotSpace,
         [k.tangentIn.x,k.tangentIn.y,k.tangentIn.z],
         [k.tangentOut.x,k.tangentOut.y,k.tangentOut.z],
         ...[k.tangentInHandle,k.tangentOutHandle].map(h=>h?[
            h.uuid,h.parent?.uuid||null,h.position?.x,h.position?.y,h.position?.z]:null)];
     });
     return [e.index,spline.node.uuid,spline.node.parent?.uuid||null,
       spline.enabled,spline.closed,spline.reversed,spline.dimension,
       spline.samplesPerCurve,link.positionMode,link.progress,link.distance,
       link.exitDirection,e.worldMatrix,knots];
   });
   return JSON.stringify([scene,junction.node.uuid,junction.node.parent?.uuid||null,
     junction.enabled,junction.connections.length,state]);
 }
 function queryJunctionConnections(uuid,positionTolerance=.1,angleTolerance=15){
   try{
     const junction=junctionAt(uuid);
     if(!junction)throw Error('Select an active SplineJunction Node.');
     const entries=samples(junction);
     const report=analyzeConnections(entries,positionTolerance,angleTolerance);
     return {ok:true,validLinks:entries.length,totalLinks:junction.connections.length,...report};
   }catch(e){return {ok:false,error:String(e?.message||e)};}
 }
 function queryJunctionSnapPlan(uuid,anchorIndex,targetIndex){
   try{
     const junction=junctionAt(uuid);
     if(!junction||!Number.isInteger(anchorIndex)||!Number.isInteger(targetIndex)||
        anchorIndex<0||targetIndex<0||anchorIndex===targetIndex)
       throw Error('Choose a Junction and two different valid link indices.');
     const entries=samples(junction),anchor=entries.find(e=>e.index===anchorIndex),
       target=entries.find(e=>e.index===targetIndex);
     if(!anchor||!target)throw Error('Both indices must reference active spline links.');
     if(anchor.spline===target.spline)
       throw Error('Cannot snap a SplineContainer to itself.');
     const spline=target.spline;
     if(spline.closed)throw Error('Endpoint snap requires an open target spline.');
     if(Math.min(target.progress,1-target.progress)>1e-8)
       throw Error('Target link must be at exact spline progress 0 or 1.');
     const knots=spline.knots;
     const knot=target.progress===0?knots[0]:knots[knots.length-1];
     if(!knot?.node||knot.node.isValid===false||knot.node.parent!==spline.node)
       throw Error('Target endpoint Knot is no longer a direct child.');
     const p=knot.node.position;
     const snap=planEndpointSnap({anchorWorld:anchor.position,
       targetLocal:{x:p.x,y:p.y,z:p.z},worldMatrix:target.worldMatrix,
       progress:target.progress,closed:spline.closed,dimension:spline.dimension});
     return {ok:true,...snap,guard:fingerprint(junction,knot.node.uuid),
       junctionUuid:junction.node.uuid,targetSplineUuid:spline.node.uuid,
       targetKnotUuid:knot.node.uuid,anchorIndex,targetIndex,
       gapBefore:Math.hypot(anchor.position.x-target.position.x,
         anchor.position.y-target.position.y,anchor.position.z-target.position.z)};
   }catch(e){return {ok:false,error:String(e?.message||e)};}
 }
 function queryJunctionSnapValid(uuid,guard,targetKnotUuid){
   try{
     const junction=junctionAt(uuid);
     if(!junction||typeof guard!=='string'||!guard||
        typeof targetKnotUuid!=='string'||!targetKnotUuid||
        fingerprint(junction,targetKnotUuid)!==guard)
       throw Error('Junction, spline or Scene changed during endpoint snap.');
     return {ok:true};
   }catch(e){return {ok:false,error:String(e?.message||e)};}
 }
 return {queryJunctionConnections,queryJunctionSnapPlan,queryJunctionSnapValid};
}
module.exports={createJunctionScene};
