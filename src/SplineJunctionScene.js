'use strict';
/**
 * Scene-only orchestration for SplineJunction diagnostics and endpoint snap.
 * All Cocos calls go through an injected adapter; geometry remains pure.
 */
const {worldTangent,analyzeConnections,planEndpointSnap}=require('./SplineConnectionMath');
const {worldVector,endpointSide,planJunctionTangent}=require('./SplineJunctionTangentMath');
const {planJunctionBrokenConversion}=require('./SplineJunctionModeMath');
const {planJunctionJoin}=require('./SplineJunctionJoinMath');
const {captureContainerAppearance}=require('./SplineTopologyCopyPolicy');
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
         [q.x,q.y,q.z,q.w],selected&&ignore==='conversion'?null:k.mode,k.tension,k.tangentsInKnotSpace,
         selected&&['in','conversion'].includes(ignore)?null:[k.tangentIn.x,k.tangentIn.y,k.tangentIn.z],
         selected&&['out','conversion'].includes(ignore)?null:[k.tangentOut.x,k.tangentOut.y,k.tangentOut.z],
         ...[k.tangentInHandle,k.tangentOutHandle].map((h,i)=>h?[
            h.uuid,h.parent?.uuid||null,
            ...(selected&&(ignore==='conversion'||ignore===(i===0?'in':'out'))?[null]:[
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
 /** Read-only Join planner. Produces independent sibling spline geometry
  * with no source Knot, SplineJunction, prefab or component writes. */
 function queryJunctionJoinPlan(uuid,anchorIndex,targetIndex){
   try{
     const junction=junctionAt(uuid);
     if(!junction||!Number.isInteger(anchorIndex)||!Number.isInteger(targetIndex)||
        anchorIndex===targetIndex||anchorIndex<0||targetIndex<0||
        anchorIndex>=junction.connections.length||
        targetIndex>=junction.connections.length)
       throw Error('Choose two different valid Junction link indices.');
     const entries=samples(junction);
     const anchor=entries.find(e=>e.index===anchorIndex),
       target=entries.find(e=>e.index===targetIndex);
     if(!anchor||!target||anchor.spline===target.spline)
       throw Error('Join requires two distinct active spline links.');
     for(const entry of [anchor,target]){
       if(entry.spline.closed||![0,1].includes(entry.progress))
         throw Error('Join requires exact endpoints on open splines.');
       const spline=entry.spline,knots=spline.knots;
       if(knots.length<2||knots.length>128||
          knots.some(k=>!k?.node||k.node.isValid===false||
             k.node.parent!==spline.node))
         throw Error('Join requires direct-child Knot geometry.');
       if(typeof spline.getNaturalResolvedKnots!=='function')
         throw Error('Spline resolved tangent calculation unavailable.');
     }
     const root=anchor.spline.node;
     if(!root.parent||root.parent.isValid===false||
        !root.position||!root.rotation||!root.scale)
       throw Error('Cannot copy anchor spline root transform.');
     const source=(entry)=>({
       progress:entry.progress,reversed:!!entry.spline.reversed,
       dimension:entry.spline.dimension,matrix:entry.worldMatrix,
       knots:entry.spline.getNaturalResolvedKnots(),
     });
     const joined=planJunctionJoin(source(anchor),source(target));
     const rootTransform={
       position:{x:root.position.x,y:root.position.y,z:root.position.z},
       rotation:{x:root.rotation.x,y:root.rotation.y,
          z:root.rotation.z,w:root.rotation.w},
       scale:{x:root.scale.x,y:root.scale.y,z:root.scale.z},
     };
     const values=[...Object.values(rootTransform.position),
       ...Object.values(rootTransform.rotation),...Object.values(rootTransform.scale)];
     if(values.some(x=>!Number.isFinite(x)))
       throw Error('Invalid anchor spline root transform.');
     return {ok:true,...joined,parentUuid:root.parent.uuid,
       sourceName:String(root.name||'Spline').slice(0,60),rootTransform,
       samplesPerCurve:Math.max(anchor.spline.samplesPerCurve,target.spline.samplesPerCurve),
       containerAppearance:captureContainerAppearance(anchor.spline),
       junctionUuid:junction.node.uuid,anchorIndex,targetIndex,
       anchorSplineUuid:root.uuid,targetSplineUuid:target.spline.node.uuid,
       guard:fingerprint(junction,null,'join'),
     };
   }catch(error){return {ok:false,error:String(error?.message||error)};}
 }
 function queryJunctionJoinValid(uuid,guard){
   try{
     const junction=junctionAt(uuid);
     if(!junction||typeof guard!=='string'||!guard||
        fingerprint(junction,null,'join')!==guard)
       throw Error('Junction source spline or active Scene changed during Join.');
     return {ok:true};
   }catch(error){return {ok:false,error:String(error?.message||error)};}
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
 function conversionBindings(knot){
   const node=knot?.node;
   if(!node||node.isValid===false||!node.parent)
     throw Error('Conversion target Knot is invalid.');
   const idx=node.components.findIndex(c=>classOf(c)==='Splines.SplineKnot');
   if(idx<0)throw Error('Conversion target is missing SplineKnot component.');
   const field=(side)=>{
     const isIn=side==='in',handle=isIn?knot.tangentInHandle:knot.tangentOutHandle;
     if(handle&&(handle.isValid===false||handle.parent!==node))
       throw Error('Tangent handle must remain a direct child of target Knot.');
     const value=handle?handle.position:isIn?knot.tangentIn:knot.tangentOut;
     if(!value||!['x','y','z'].every(k=>Number.isFinite(value[k])))
       throw Error('Invalid conversion tangent value.');
     return {uuid:handle?handle.uuid:node.uuid,
       path:handle?'position':'__comps__.'+idx+'.tangent'+(isIn?'In':'Out'),
       type:'cc.Vec3',value:{x:value.x,y:value.y,z:value.z},handle:!!handle};
   };
   return {in:field('in'),out:field('out'),mode:{
     uuid:node.uuid,path:'__comps__.'+idx+'.mode',type:'Enum',
     value:knot.mode}};
 }
 function queryJunctionConversionPlan(uuid,targetIndex){
   try{
     const junction=junctionAt(uuid);
     if(!junction||!Number.isInteger(targetIndex)||targetIndex<0||
        targetIndex>=junction.connections.length)
       throw Error('Select an active Junction target link index.');
     const target=samples(junction).find(e=>e.index===targetIndex);
     if(!target)throw Error('Target link must be an active spline.');
     const spline=target.spline;
     if(spline.closed||Math.min(target.progress,1-target.progress)>1e-8)
       throw Error('Mode conversion requires an exact open-spline endpoint.');
     const knots=spline.knots;
     const index=target.progress<.5?0:knots.length-1,knot=knots[index];
     if(!knot?.node||knot.node.isValid===false||knot.node.parent!==spline.node)
       throw Error('Conversion target Knot must be a direct spline child.');
     if(!Number.isInteger(knot.mode)||knot.mode<0||knot.mode>4)
       throw Error('Target Knot tangent mode is invalid.');
     const fields=conversionBindings(knot);
     if(knot.mode===4)return {ok:true,changed:false,
       targetSplineUuid:spline.node.uuid,targetKnotUuid:knot.node.uuid,
       targetIndex,message:'Target is already Broken; no edits needed.'};
     if(typeof spline.getNaturalResolvedKnots!=='function')
       throw Error('Spline lacks resolved tangent geometry.');
     const natural=spline.getNaturalResolvedKnots();
     const rawIndex=spline.reversed?knots.length-1-index:index;
     const resolved=natural[rawIndex];
     if(!resolved)throw Error('Cannot resolve natural endpoint tangents.');
     const plan=planJunctionBrokenConversion({mode:knot.mode,
       resolvedIn:resolved.tangentIn,resolvedOut:resolved.tangentOut,
       storedIn:fields.in.value,storedOut:fields.out.value,
       knotRotation:{x:knot.node.rotation.x,y:knot.node.rotation.y,
         z:knot.node.rotation.z,w:knot.node.rotation.w},
       handleIn:fields.in.handle,handleOut:fields.out.handle,
       tangentsInKnotSpace:!!knot.tangentsInKnotSpace,
       dimension:spline.dimension});
     const writes=[
       {...fields.in,before:plan.beforeIn,after:plan.afterIn},
       {...fields.out,before:plan.beforeOut,after:plan.afterOut},
       {...fields.mode,before:plan.beforeMode,after:plan.afterMode},
     ].map(({uuid,path,type,before,after})=>({uuid,path,type,before,after}));
     return {ok:true,changed:true,guard:fingerprint(junction,knot.node.uuid,'conversion'),
       junctionUuid:junction.node.uuid,targetSplineUuid:spline.node.uuid,
       targetKnotUuid:knot.node.uuid,targetIndex,beforeMode:knot.mode,
       writes,sourceMode:knot.mode,afterMode:4};
   }catch(error){return {ok:false,error:String(error?.message||error)};}
 }
 function queryJunctionConversionState(uuid,guard,targetKnotUuid){
   try{
     const junction=junctionAt(uuid);
     if(!junction||typeof guard!=='string'||!guard||
       typeof targetKnotUuid!=='string'||!targetKnotUuid||
       fingerprint(junction,targetKnotUuid,'conversion')!==guard)
       throw Error('Junction geometry or Scene changed during mode conversion.');
     const node=resolve(targetKnotUuid);
     if(!node||node.isValid===false)
       throw Error('Conversion Knot no longer exists.');
     const knot=node.components.find(c=>classOf(c)==='Splines.SplineKnot');
     if(!knot)throw Error('Conversion Knot component is missing.');
     const fields=conversionBindings(knot);
     return {ok:true,writes:[fields.in,fields.out,fields.mode].map(
       ({uuid,path,type,value})=>({uuid,path,type,value}))};
   }catch(error){return {ok:false,error:String(error?.message||error)};}
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
    queryJunctionTangentPlan,queryJunctionTangentState,
    queryJunctionConversionPlan,queryJunctionConversionState,
    queryJunctionJoinPlan,queryJunctionJoinValid};
}
module.exports={createJunctionScene};
