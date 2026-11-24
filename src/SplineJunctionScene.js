'use strict';
/**
 * Scene-only orchestration for SplineJunction diagnostics and endpoint snap.
 * All Cocos calls go through an injected adapter; geometry remains pure.
 */
const {worldTangent,analyzeConnections,planEndpointSnap}=require('./SplineConnectionMath');
const {worldVector,endpointSide,planJunctionTangent}=require('./SplineJunctionTangentMath');
const {planJunctionBrokenConversion}=require('./SplineJunctionModeMath');
const {planJunctionJoin}=require('./SplineJunctionJoinMath');
const {planJunctionFanout}=require('./SplineJunctionFanoutMath');
const {validateSeamMode}=require('./SplineJunctionSeamMath');
const {planEndpointJunctionChain,planMultiJunctionGeometry,
  planPartialJunctionChain,planPartialJunctionGeometry}=require('./SplineJunctionRouteMath');
const {captureContainerAppearance}=require('./SplineTopologyCopyPolicy');
const {validateRouteAdmission,compileControllerEligibility}=
  require('./SplineRouteAdmission');
const {validateRouteCost,validateRoutePolicy,measureSplineWorldArc,costRoute}=
  require('./SplineJunctionRouteCost');
function createJunctionScene({resolve,classOf,queryKnotEditFrame,sceneId,sceneRoot}){
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
       link.exitDirection,link.trafficSignal,link.maxFollowers,e.worldMatrix,knots];
   });
   return JSON.stringify([scene,junction.node.uuid,junction.node.parent?.uuid||null,
     junction.enabled,junction.connections.length,state]);
 }
 /** Read-only Join planner. Produces independent sibling spline geometry
  * with no source Knot, SplineJunction, prefab or component writes. */
 function queryJunctionJoinPlan(uuid,anchorIndex,targetIndex,seamMode='preserve'){
   try{
     validateSeamMode(seamMode);
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
     const joined=planJunctionJoin(source(anchor),source(target),1e-5,seamMode);
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
 /** Branch-preserving multi-link Join planner: never edits sources.
  * Returns separate spline chains for each requested Junction exit.
  */
 function queryJunctionFanoutPlan(uuid,anchorIndex,targetIndices,seamMode='preserve'){
   try{
     validateSeamMode(seamMode);
     const junction=junctionAt(uuid);
     if(!junction||!Number.isInteger(anchorIndex)||anchorIndex<0||
        anchorIndex>=junction.connections.length||
        !Array.isArray(targetIndices)||targetIndices.length<2||
        targetIndices.length>8||targetIndices.some(i=>!Number.isInteger(i)||
        i<0||i>=junction.connections.length||i===anchorIndex)||
        new Set(targetIndices).size!==targetIndices.length)
       throw Error('Select one anchor and 2 to 8 distinct valid target links.');
     const entries=samples(junction);
     const anchor=entries.find(e=>e.index===anchorIndex);
     if(!anchor)throw Error('Anchor link is not active.');
     const outgoing=targetIndices.map(index=>entries.find(e=>e.index===index));
     if(outgoing.some(e=>!e))
       throw Error('All target links must be active.');
     const sourceSplines=[anchor.spline,...outgoing.map(e=>e.spline)];
     if(new Set(sourceSplines.map(s=>s.node.uuid)).size!==sourceSplines.length)
       throw Error('Fan-out Join requires distinct source SplineContainers.');
     for(const entry of [anchor,...outgoing]){
       const spline=entry.spline;
       if(spline.closed||![0,1].includes(entry.progress))
         throw Error('Fan-out requires exact endpoints on open splines.');
       const knots=spline.knots;
       if(knots.length<2||knots.length>128||
          knots.some(k=>!k?.node||k.node.isValid===false||
             k.node.parent!==spline.node))
         throw Error('Invalid direct-child Knot hierarchy for Fan-out.');
       if(typeof spline.getNaturalResolvedKnots!=='function')
         throw Error('Spline resolved tangent calculation unavailable.');
     }
     const root=anchor.spline.node;
     if(!root.parent||root.parent.isValid===false||!root.position||
        !root.rotation||!root.scale)
       throw Error('Anchor spline root transform unavailable.');
     const descriptor=(entry)=>({
       progress:entry.progress,reversed:!!entry.spline.reversed,
       dimension:entry.spline.dimension,matrix:entry.worldMatrix,
       knots:entry.spline.getNaturalResolvedKnots(),
     });
     const source=descriptor(anchor);
     const joined=planJunctionFanout(source,outgoing.map(entry=>({
       index:entry.index,source:descriptor(entry),
     })),seamMode);
     const rootTransform={
       position:{x:root.position.x,y:root.position.y,z:root.position.z},
       rotation:{x:root.rotation.x,y:root.rotation.y,
         z:root.rotation.z,w:root.rotation.w},
       scale:{x:root.scale.x,y:root.scale.y,z:root.scale.z},
     };
     if(Object.values(rootTransform).some(obj=>
        Object.values(obj).some(v=>!Number.isFinite(v))))
       throw Error('Invalid anchor Container transform.');
     const samplesPerCurve=Math.max(...sourceSplines.map(s=>s.samplesPerCurve));
     if(!Number.isInteger(samplesPerCurve)||samplesPerCurve<4||
        samplesPerCurve>256)
       throw Error('Invalid source spline sampling density.');
     return {ok:true,...joined,guard:fingerprint(junction,null,'join'),
       junctionUuid:junction.node.uuid,anchorIndex,targetIndices:[...targetIndices],
       anchorSplineUuid:root.uuid,
       targetSplineUuids:outgoing.map(e=>e.spline.node.uuid),
       parentUuid:root.parent.uuid,
       sourceName:String(root.name||'Spline').slice(0,60),
       rootTransform,samplesPerCurve,
       containerAppearance:captureContainerAppearance(anchor.spline),
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
 /** Enumerate active Junctions in the CURRENT Scene only.
  * Does not use stale runtime active registries or edit any Node.
  */
 function allSceneJunctions(){
   if(typeof sceneRoot!=='function')
     throw Error('Multi-Junction Join requires a Scene root adapter.');
   const root=sceneRoot();
   if(!root||root.isValid===false||root.uuid!==sceneId())
     throw Error('Open an active Scene before Multi-Junction Join.');
   const stack=[root],seen=new Set(),junctions=[];
   while(stack.length){
     const node=stack.pop();
     if(!node||node.isValid===false||seen.has(node))continue;
     seen.add(node);
     if(seen.size>20000)
       throw Error('Scene too large for multi-Junction snapshot.');
     if(Array.isArray(node.components)){
       for(const component of node.components){
         if(component?.isValid!==false&&component.enabled!==false&&
            classOf(component)==='Splines.SplineJunction')
           junctions.push(component);
       }
     }
     if(Array.isArray(node.children))
       for(const child of node.children)stack.push(child);
   }
   junctions.sort((a,b)=>a.node.uuid.localeCompare(b.node.uuid));
   if(junctions.length>128)throw Error('More than 128 Junctions in Scene.');
   return junctions;
 }
 /** A controller may be on the Junction Node or a separate Node with
  * an explicit Junction reference. In the Editor, onEnable is NOT run;
  * read the serialized phase configuration without touching playback state.
  * Include disabled controllers in the lease so enabling one invalidates it.
  */
 function allSceneControllerSnapshots(){
   const root=sceneRoot();
   if(!root||root.isValid===false||root.uuid!==sceneId())
     throw Error('Scene changed while inspecting traffic controllers.');
   const stack=[root],seen=new Set(),result=[];
   while(stack.length){
     const node=stack.pop();
     if(!node||node.isValid===false||seen.has(node))continue;
     seen.add(node);
     if(seen.size>20000)throw Error('Scene exceeds traffic snapshot safety limit.');
     for(const comp of Array.isArray(node.components)?node.components:[]){
       if(!comp||comp.isValid===false||
          classOf(comp)!=='Splines.SplineTrafficController')continue;
       const local=node.components.find(c=>c?.isValid!==false&&
         classOf(c)==='Splines.SplineJunction');
       const target=comp.junction||local;
       const phases=Array.isArray(comp.phases)?comp.phases.map(p=>p?{
         greenExits:Array.isArray(p.greenExits)?[...p.greenExits]:null,
         greenSeconds:p.greenSeconds,yellowSeconds:p.yellowSeconds,
       }:null):null;
       const conflicts=Array.isArray(comp.conflicts)?
         comp.conflicts.map(c=>c?{
           firstExit:c.firstExit,secondExit:c.secondExit,
         }:null):null;
       result.push({
         uuid:node.uuid,
         enabled:comp.enabled!==false,
         targetId:target?.node?.uuid??null,
         phases,conflicts,allRedSeconds:comp.allRedSeconds,
         adaptiveTraffic:!!comp.adaptiveTraffic,
         minGreenSeconds:comp.minGreenSeconds,
         maxGreenSeconds:comp.maxGreenSeconds,
         maxDemandWaitSeconds:comp.maxDemandWaitSeconds,
       });
     }
     if(Array.isArray(node.children))
       for(const child of node.children)stack.push(child);
   }
   if(result.length>128)
     throw Error('More than 128 SplineTrafficControllers in Scene.');
   result.sort((a,b)=>a.uuid.localeCompare(b.uuid)||
     String(a.targetId).localeCompare(String(b.targetId)));
   return result;
 }
 function routeControllerEligibility(junctions){
   const byId=new Map(junctions.map(j=>[j.node.uuid,j]));
   const eligible=new Map();
   for(const snapshot of allSceneControllerSnapshots()){
     if(!snapshot.enabled||!byId.has(snapshot.targetId))continue;
     if(eligible.has(snapshot.targetId))
       throw Error('Ambiguous enabled SplineTrafficControllers for one Junction.');
     const junction=byId.get(snapshot.targetId);
     eligible.set(snapshot.targetId,compileControllerEligibility(
       snapshot,junction.connections.length));
   }
   return eligible;
 }
 function multiJunctionFingerprint(junctions){
   return JSON.stringify([sceneId(),junctions.map(j=>[
     j.node.uuid,fingerprint(j,null,'join'),
   ]),allSceneControllerSnapshots()]);
 }
 function queryMultiJunctionJoinPlan(uuid,anchorIndex,goalSplineUuid,
   seamMode='preserve',routeMode='full',startSide=0,goalSide=1,
   costMode='switches',switchPenalty=10,routePolicy='ignore',
   admissionMode='ignore',requiredFollowers=1){
   try{
     validateSeamMode(seamMode);
     validateRouteCost(costMode,switchPenalty);
     validateRoutePolicy(routePolicy);
     validateRouteAdmission(admissionMode,requiredFollowers);
     if(!['full','partial'].includes(routeMode)||![0,1].includes(startSide)||
        ![0,1].includes(goalSide))
       throw Error('Invalid Join route mode or partial traversal direction.');
     if(typeof uuid!=='string'||!uuid||typeof goalSplineUuid!=='string'||
        !goalSplineUuid||goalSplineUuid.length>128||
        !Number.isInteger(anchorIndex)||anchorIndex<0||anchorIndex>63)
       throw Error('Choose an anchor Junction link and destination Spline UUID.');
     const anchorJunction=junctionAt(uuid);
     if(!anchorJunction)throw Error('Select an active SplineJunction.');
     const root=resolve(goalSplineUuid);
     const destination=root?.components?.find(c=>
       c?.isValid!==false&&classOf(c)==='Splines.SplineContainer');
     if(!destination||destination.enabled===false||
        destination.closed||destination.count<2)
       throw Error('Destination UUID must reference an open SplineContainer.');
     const junctions=allSceneJunctions();
     if(!junctions.includes(anchorJunction))
       throw Error('Selected anchor Junction is not in active Scene.');
     const links=[],bySpline=new Map();
     const phaseEligible=admissionMode==='capacity-phases'?
       routeControllerEligibility(junctions):new Map();
     for(const junction of junctions){
       for(const e of samples(junction)){
         const splineId=e.spline.node.uuid;
         const prior=bySpline.get(splineId);
         if(prior&&prior!==e.spline)
           throw Error('Duplicate SplineContainer Node UUID.');
         bySpline.set(splineId,e.spline);
         links.push({junctionId:junction.node.uuid,linkIndex:e.index,
           splineId,progress:e.progress,world:e.position,
           exitDirection:e.link.exitDirection,
           trafficSignal:e.link.trafficSignal,
           maxFollowers:e.link.maxFollowers,
           phaseEligible:phaseEligible.has(junction.node.uuid)?
             phaseEligible.get(junction.node.uuid).has(e.index):
             e.link.trafficSignal===0});
       }
     }
     if(links.length>1024)
       throw Error('More than 1024 Junction links in Scene.');
     let chain;
     if(costMode==='switches'&&routePolicy==='ignore'&&
        admissionMode==='ignore'){
       // Preserve original BFS exactly for all existing projects.
       chain=routeMode==='partial'?
         planPartialJunctionChain(links,{junctionId:uuid,linkIndex:anchorIndex},
           goalSplineUuid,startSide,goalSide):
         planEndpointJunctionChain(links,{junctionId:uuid,
           linkIndex:anchorIndex},goalSplineUuid);
     }else{
       const metrics=new Map(),costLinks=[];
       for(const link of links){
         const source=bySpline.get(link.splineId);
         if(!source||source.closed)continue;
         let arc=metrics.get(link.splineId);
         if(!arc){
           arc=measureSplineWorldArc(source);
           metrics.set(link.splineId,arc);
         }
         costLinks.push({...link,worldArc:arc.at(link.progress),
           worldTotal:arc.total});
       }
       chain=costRoute(costLinks,{junctionId:uuid,linkIndex:anchorIndex},
         goalSplineUuid,{mode:costMode,penalty:switchPenalty,
           routeMode,startSide,goalSide,policy:routePolicy,
           admissionMode,requiredFollowers});
     }
     const descriptors=chain.path.map(entry=>{
       const spline=bySpline.get(entry.splineId);
       if(!spline||spline.closed||spline.enabled===false||
          spline.node?.isValid===false)
         throw Error('Route spline is inactive or closed.');
       const knots=spline.knots;
       if(knots.length<2||knots.length>128||
          knots.some(k=>!k?.node||k.node.isValid===false||
             k.node.parent!==spline.node)||
          typeof spline.getNaturalResolvedKnots!=='function')
         throw Error('Route spline requires 2–128 direct-child Knots.');
       const frame=queryKnotEditFrame(spline.node.uuid);
       if(!frame?.ok)throw Error(frame?.error||
         'Route spline World matrix unavailable.');
       const descriptor={matrix:frame.matrix,
         knots:spline.getNaturalResolvedKnots(),
         dimension:spline.dimension,reversed:!!spline.reversed,
         progress:entry.progress};
       if(routeMode==='partial'){
         if(typeof spline.tAtProgress!=='function')
           throw Error('Partial Join requires SplineContainer.tAtProgress().');
         const naturalT=progress=>{
           const t=spline.tAtProgress(progress);
           if(!Number.isFinite(t)||t<0||t>1)
             throw Error('Spline arc distance lookup returned invalid Bezier t.');
           return spline.reversed?1-t:t;
         };
         descriptor.fromProgress=entry.fromProgress;
         descriptor.toProgress=entry.toProgress;
         descriptor.fromT=naturalT(entry.fromProgress);
         descriptor.toT=naturalT(entry.toProgress);
       }
       return descriptor;
     });
     const result=routeMode==='partial'?
       planPartialJunctionGeometry(chain.path,descriptors,seamMode):
       planMultiJunctionGeometry(chain.path,descriptors,seamMode);
     const first=bySpline.get(chain.path[0].splineId);
     const node=first.node;
     if(!node.parent||node.parent.isValid===false||
        !node.position||!node.rotation||!node.scale)
       throw Error('Route anchor Container has invalid parent or transform.');
     const rootTransform={
       position:{x:node.position.x,y:node.position.y,z:node.position.z},
       rotation:{x:node.rotation.x,y:node.rotation.y,
         z:node.rotation.z,w:node.rotation.w},
       scale:{x:node.scale.x,y:node.scale.y,z:node.scale.z},
     };
     if(Object.values(rootTransform).some(o=>
        Object.values(o).some(v=>!Number.isFinite(v))))
       throw Error('Route anchor transform has nonfinite values.');
     const samplesPerCurve=Math.max(...chain.path.map(entry=>
       bySpline.get(entry.splineId).samplesPerCurve));
     if(!Number.isInteger(samplesPerCurve)||samplesPerCurve<4||
        samplesPerCurve>256)
       throw Error('Invalid route sampling density.');
     return {ok:true,...result,routeMode,startSide,goalSide,
       routeCostMode:costMode,junctionPenalty:switchPenalty,routePolicy,
       admissionMode,requiredFollowers,capacitySource:'scene-configuration',
       estimatedWorldDistance:chain.estimatedWorldDistance??null,
       estimatedRouteCost:chain.estimatedRouteCost??null,
       junctionUuid:uuid,anchorIndex,goalSplineUuid,
       parentUuid:node.parent.uuid,rootTransform,
       sourceName:String(node.name||'Spline').slice(0,60),
       samplesPerCurve,containerAppearance:captureContainerAppearance(first),
       chain:chain.path,guard:multiJunctionFingerprint(junctions)};
   }catch(error){return {ok:false,error:String(error?.message||error)};}
 }
 function queryMultiJunctionJoinValid(uuid,guard){
   try{
     if(!junctionAt(uuid)||typeof guard!=='string'||!guard||
        multiJunctionFingerprint(allSceneJunctions())!==guard)
       throw Error('Multi-Junction route source or active Scene changed.');
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
    queryJunctionJoinPlan,queryJunctionJoinValid,
    queryJunctionFanoutPlan,
    queryMultiJunctionJoinPlan,queryMultiJunctionJoinValid};
}
module.exports={createJunctionScene};
