'use strict';
/**
 * Scene-only orchestration for SplineJunction diagnostics and endpoint snap.
 * All Cocos calls go through an injected adapter; geometry remains pure.
 */
const {worldTangent,analyzeConnections,planEndpointSnap}=require('./SplineConnectionMath');
const {worldVector,endpointSide,planJunctionTangent}=require('./SplineJunctionTangentMath');
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
 function fingerprint(junction,targetKnotUuid,ignore='position'){
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
       const selected=n.uuid===targetKnotUuid;
       return [n.uuid,n.parent.uuid,selected&&ignore==='position'?null:[p.x,p.y,p.z],
         [q.x,q.y,q.z,q.w],k.mode,k.tension,k.tangentsInKnotSpace,
         selected&&ignore==='in'?null:[k.tangentIn.x,k.tangentIn.y,k.tangentIn.z],
         selected&&ignore==='out'?null:[k.tangentOut.x,k.tangentOut.y,k.tangentOut.z],
         ...[k.tangentInHandle,k.tangentOutHandle].map((h,i)=>h?[
            h.uuid,h.parent?.uuid||null,
            ...(selected&&ignore===(i===0?'in':'out')?[null]:[
                h.position?.x,h.position?.y,h.position?.z])]:null)];
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
 
 function readTangentField(knot,side){
   const n=knot.node;
   if(!n||n.isValid===false||!n.parent)
      throw Error('Target Knot missing from Scene.');
   if(knot.mode!==4)throw Error('G1/C1 requires a Broken target Knot (mode 4).');
   const handle=side==='in'?knot.tangentInHandle:knot.tangentOutHandle;
   if(handle&&(handle.isValid===false||handle.parent!==n))
      throw Error('Tangent handle must be a valid direct child of target Knot.');
   const source=handle?handle.position:side==='in'?knot.tangentIn:knot.tangentOut;
   const value={x:source?.x,y:source?.y,z:source?.z};
   if(!['x','y','z'].every(a=>Number.isFinite(value[a])))
      throw Error('Target tangent contains nonfinite values.');
   const idx=n.components.findIndex(c=>classOf(c)==='Splines.SplineKnot');
   if(idx<0)throw Error('Target Knot component missing.');
   return {value,uuid:handle?handle.uuid:n.uuid,
      path:handle?'position':'__comps__.'+idx+'.tangent'+(side==='in'?'In':'Out'),
      source:'cc.Vec3',handle:!!handle};
 }
 function naturalEndpointControl(entry){
   const spline=entry.spline;
   if(spline.closed||Math.min(entry.progress,1-entry.progress)>1e-8)
      throw Error('G1/C1 requires an endpoint link on an open spline.');
   if(typeof spline.getNaturalResolvedKnots!=='function')
      throw Error('SplineContainer scripts must support resolved tangent math.');
   const sorted=spline.knots;
   const index=entry.progress<.5?0:sorted.length-1;
   const knot=sorted[index],natural=spline.getNaturalResolvedKnots();
   const rawIndex=spline.reversed?sorted.length-1-index:index;
   const side=endpointSide(entry.progress,spline.reversed).side;
   const raw=natural[rawIndex]?.[side==='in'?'tangentIn':'tangentOut'];
   if(!raw||!['x','y','z'].every(a=>Number.isFinite(raw[a])))
      throw Error('Cannot resolve source endpoint tangent.');
   return {knot,side,worldLength:Math.hypot(...Object.values(worldVector(raw,entry.worldMatrix)))};
 }
 function queryJunctionTangentPlan(uuid,anchorIndex,targetIndex,mode='g1',orientation='same'){
   try{
     const junction=junctionAt(uuid);
     if(!junction||!Number.isInteger(anchorIndex)||!Number.isInteger(targetIndex)||
        anchorIndex===targetIndex||anchorIndex<0||targetIndex<0||
        !['g1','c1'].includes(mode)||!['same','opposed'].includes(orientation))
       throw Error('Select two different valid Junction links and G1/C1 mode.');
     const entries=samples(junction);
     const anchor=entries.find(e=>e.index===anchorIndex);
     const target=entries.find(e=>e.index===targetIndex);
     if(!anchor||!target||anchor.spline===target.spline)
       throw Error('Anchor/target must be endpoints on distinct active splines.');
     const gap=Math.hypot(anchor.position.x-target.position.x,
       anchor.position.y-target.position.y,anchor.position.z-target.position.z);
     if(gap>.1)
       throw Error('Connector endpoints must be within 0.1 world units; Snap Target Endpoint first.');
     const src=naturalEndpointControl(anchor),dst=naturalEndpointControl(target);
     const knot=dst.knot;
     if(knot.mode!==4)
       throw Error('G1/C1 requires target Knot mode = Broken; change it explicitly in Inspector.');
     const stored=readTangentField(knot,dst.side);
     const aligned=planJunctionTangent({
       anchorForward:anchor.tangent,anchorWorldLength:src.worldLength,
       targetWorldLength:dst.worldLength,matrix:target.worldMatrix,
       knotRotation:{x:knot.node.rotation.x,y:knot.node.rotation.y,
         z:knot.node.rotation.z,w:knot.node.rotation.w},
       handle:stored.handle,tangentsInKnotSpace:!!knot.tangentsInKnotSpace,
       progress:target.progress,reversed:!!target.spline.reversed,
       dimension:target.spline.dimension,mode,orientation,before:stored.value,
     });
     const guard=fingerprint(junction,knot.node.uuid,dst.side);
     return {ok:true,guard,junctionUuid:junction.node.uuid,
       targetSplineUuid:target.spline.node.uuid,targetKnotUuid:knot.node.uuid,
       writeUuid:stored.uuid,writePath:stored.path,
       anchorIndex,targetIndex,side:dst.side,mode,orientation,gap,
       before:stored.value,after:aligned.after,changed:aligned.changed,
       sourceWorldLength:src.worldLength,targetWorldLength:aligned.targetWorldLength};
   }catch(e){return {ok:false,error:String(e?.message||e)};}
 }
 function queryJunctionTangentState(uuid,guard,targetKnotUuid,side){
   try{
     const junction=junctionAt(uuid);
     if(!junction||!['in','out'].includes(side)||
        typeof guard!=='string'||!guard||typeof targetKnotUuid!=='string'||
        fingerprint(junction,targetKnotUuid,side)!==guard)
       throw Error('Junction/Scene geometry changed during G1/C1 alignment.');
     const node=resolve(targetKnotUuid);
     if(!node||node.isValid===false)throw Error('Target Knot no longer exists.');
     const knot=node.components.find(c=>classOf(c)==='Splines.SplineKnot');
     if(!knot)throw Error('Missing target SplineKnot component.');
     const current=readTangentField(knot,side);
     return {ok:true,value:current.value,uuid:current.uuid,path:current.path};
   }catch(e){return {ok:false,error:String(e?.message||e)};}
 }
 return {queryJunctionConnections,queryJunctionSnapPlan,queryJunctionSnapValid,
    queryJunctionTangentPlan,queryJunctionTangentState};
}
module.exports={createJunctionScene};
