'use strict';
/** Single-route Editor authoring transaction, fully isolated from source
 * Components. One snapshot after all knots are written. */
const finite=v=>!!v&&['x','y','z'].every(k=>Number.isFinite(v[k]));
function validateMultiJunctionPlan(plan,anchorIndex,goalSplineUuid,
    seamMode='preserve',routeMode='full',startSide=0,goalSide=1,
    routeCostMode='switches',junctionPenalty=10){
 const {validateSeamMode}=require('./SplineJunctionSeamMath');
 const {validateRouteCost}=require('./SplineJunctionRouteCost');
 validateSeamMode(seamMode);
 validateRouteCost(routeCostMode,junctionPenalty);
 if(!['full','partial'].includes(routeMode)||![0,1].includes(startSide)||
    ![0,1].includes(goalSide))throw Error('Invalid route mode / sides.');
 if(!plan?.ok||plan.seamMode!==seamMode||
    (plan.routeCostMode??'switches')!==routeCostMode||
    (plan.junctionPenalty??10)!==junctionPenalty||
    (plan.routeMode??'full')!==routeMode||
    (routeMode==='partial'&&(plan.startSide!==startSide||
       plan.goalSide!==goalSide))||
    plan.anchorIndex!==anchorIndex||
    plan.goalSplineUuid!==goalSplineUuid||
    typeof plan.junctionUuid!=='string'||!plan.junctionUuid||
    typeof plan.guard!=='string'||!plan.guard||
    typeof plan.parentUuid!=='string'||!plan.parentUuid||
    !finite(plan.rootTransform?.position)||!finite(plan.rootTransform?.scale)||
    !finite(plan.rootTransform?.rotation)||
    !Number.isFinite(plan.rootTransform.rotation.w)||
    ![0,1,2].includes(plan.dimension)||plan.closed!==false||
    plan.reversed!==false||!Number.isInteger(plan.count)||plan.count<4||
    plan.count>128||!Array.isArray(plan.knots)||
    plan.knots.length!==plan.count||
    !Number.isInteger(plan.samplesPerCurve)||
    plan.samplesPerCurve<4||plan.samplesPerCurve>256||
    !Array.isArray(plan.chain)||plan.chain.length<3||
    plan.chain.length>8||plan.sourceCount!==plan.chain.length||
    plan.switchCount!==plan.chain.length-1||
    !Array.isArray(plan.seams)||
    plan.seams.length!==plan.switchCount||
    new Set(plan.chain.map(p=>p.splineId)).size!==plan.chain.length||
    plan.chain[plan.chain.length-1]?.splineId!==goalSplineUuid||
    plan.knots.some(k=>k?.mode!==4||!finite(k.position)||
      !finite(k.tangentIn)||!finite(k.tangentOut)))
   throw Error('Invalid multi-Junction route Join plan.');
 if(routeCostMode!=='switches'){
   const length=plan.estimatedWorldDistance,cost=plan.estimatedRouteCost;
   const expected=routeCostMode==='balanced'?
       length+plan.switchCount*junctionPenalty:length;
   if(!Number.isFinite(length)||length<=0||length>1e10||
      !Number.isFinite(cost)||cost<0||cost>1e11||
      Math.abs(expected-cost)>Math.max(1e-5,cost*1e-8))
     throw Error('Cost-aware route returned inconsistent sampled world costs.');
 }
 if(routeMode==='partial'){
   for(let i=0;i<plan.chain.length;i++){
     const step=plan.chain[i];
     const linkProgress=i===0?step.toProgress:step.fromProgress;
     if(!Number.isFinite(step.fromProgress)||
        !Number.isFinite(step.toProgress)||
        step.progress!==linkProgress||
        step.fromProgress<0||step.fromProgress>1||
        step.toProgress<0||step.toProgress>1||
        Math.abs(step.fromProgress-step.toProgress)<1e-5)
       throw Error('Partial Join route segment has invalid source distance bounds.');
   }
   if(plan.chain[0].fromProgress!==startSide||
      plan.chain[plan.chain.length-1].toProgress!==goalSide)
     throw Error('Partial Join route start/end side mismatch.');
 }
 const junctions=new Set();
 let lastAt=-1;
 for(let i=0;i<plan.seams.length;i++){
   const seam=plan.seams[i],step=plan.chain[i+1];
   if(!step||typeof step.junctionId!=='string'||!step.junctionId||
      !Number.isInteger(step.linkIndex)||step.linkIndex<0||
      (routeMode==='full'?![0,1].includes(step.progress):
         (!Number.isFinite(step.progress)||step.progress<0||step.progress>1))||
      !Number.isInteger(seam.atKnot)||seam.atKnot<=lastAt||
      seam.atKnot<=0||seam.atKnot>=plan.count-1||
      seam.junctionId!==step.junctionId||seam.seamMode!==seamMode||
      !Number.isFinite(seam.gap)||seam.gap<0||seam.gap>1e-5||
      (seam.angleDeg!==null&&(!Number.isFinite(seam.angleDeg)||
       seam.angleDeg<0||seam.angleDeg>180)))
     throw Error('Invalid multi-Junction route seam geometry.');
   junctions.add(step.junctionId);lastAt=seam.atKnot;
 }
 if(junctions.size<2)
   throw Error('Multi-Junction route requires at least two different Junctions.');
 return plan;
}
async function commitMultiJunctionRoute(plan,actions){
 const names=['check','createNode','component','nodeProperty',
   'containerProperty','appearanceWrites','position','setKnot','snapshot',
   'removeNode','select','refresh'];
 if(!actions||names.some(key=>typeof actions[key]!=='function'))
   throw Error('Invalid multi-Junction Editor adapter.');
 const a=actions,appearance=a.appearanceWrites(plan.containerAppearance||{});
 let root=null,committed=false;
 try{
   await a.check();
   root=await a.createNode(plan.parentUuid,
     String(plan.sourceName||'Spline').slice(0,60)+' (Route Joined)');
   await a.component(root,'Splines.SplineContainer');
   await a.nodeProperty(root,'position','cc.Vec3',plan.rootTransform.position);
   await a.nodeProperty(root,'rotation','cc.Quat',plan.rootTransform.rotation);
   await a.nodeProperty(root,'scale','cc.Vec3',plan.rootTransform.scale);
   await a.containerProperty(root,0,'closed',false,'Boolean',false);
   await a.containerProperty(root,0,'reversed',false,'Boolean',false);
   await a.containerProperty(root,0,'dimension',plan.dimension,'Enum',false);
   await a.containerProperty(root,0,'samplesPerCurve',plan.samplesPerCurve,'Integer',false);
   for(const field of appearance)
     await a.containerProperty(root,0,field.key,field.value,field.type,false);
   for(let i=0;i<plan.knots.length;i++){
     if(i%8===0)await a.check();
     const k=plan.knots[i];
     const child=await a.createNode(root,'Knot '+String(i).padStart(3,'0'));
     await a.component(child,'Splines.SplineKnot');
     await a.position(child,[k.position.x,k.position.y,k.position.z]);
     await a.setKnot(child,'mode',4,'Enum');
     await a.setKnot(child,'tangentIn',k.tangentIn,'cc.Vec3');
     await a.setKnot(child,'tangentOut',k.tangentOut,'cc.Vec3');
   }
   await a.check();
   await a.snapshot();
   committed=true;
   try{await a.select(root);}catch(e){
     console.warn('[Cocos Splines] Multi-Junction Join selection failed:',e);
   }
   try{await a.refresh(root);}catch(e){
     console.warn('[Cocos Splines] Multi-Junction Join preview refresh failed:',e);
   }
   return {ok:true,root,count:plan.count,
     sourceCount:plan.sourceCount,switchCount:plan.switchCount,
     seams:plan.seams,
     routeCostMode:plan.routeCostMode||'switches',
     estimatedWorldDistance:plan.estimatedWorldDistance??null,
     estimatedRouteCost:plan.estimatedRouteCost??null,
     message:'Joined '+plan.sourceCount+' source splines across '+
       plan.switchCount+' Junction switches into one independent '+
       plan.count+'-Knot spline. Sources unchanged. Seam mode: '+plan.seamMode+
       '. Traversal: '+(plan.routeMode||'full')+
       '. Route selection: '+(plan.routeCostMode||'switches')+
       (Number.isFinite(plan.estimatedWorldDistance)?
        ', sampled world distance: '+plan.estimatedWorldDistance.toFixed(3):'')+'.'};
 }catch(error){
   let warning='';
   if(root&&!committed){
     try{
       await a.check();
       const removed=await a.removeNode(root);
       if(removed===false||(removed&&removed.ok===false))
         throw Error('Scene rejected route cleanup.');
     }catch(e){warning='; cleanup skipped/failed: '+String(e?.message||e);}
   }
   throw Error(String(error?.message||error)+warning);
 }
}
module.exports={validateMultiJunctionPlan,commitMultiJunctionRoute};
