'use strict';
/** Project-independent transactional writer for a branched Junction fan-out.
 * Only a brand-new group is ever modified; sources remain untouched.
 * One final Scene snapshot, best-effort cleanup of group on failure.
 */
const valid=v=>!!v&&['x','y','z'].every(k=>Number.isFinite(v[k]));
const quat=q=>valid(q)&&Number.isFinite(q.w);
function parseFanoutTargets(value){
 if(typeof value!=='string'||value.length>64||
    !/^\s*\d+(?:\s*,\s*\d+){1,7}\s*$/.test(value))
   throw Error('Enter 2 to 8 target link indices, e.g. 1,2,3.');
 const indices=value.split(',').map(s=>Number(s.trim()));
 if(indices.some(i=>!Number.isInteger(i)||i<0||i>63)||
    new Set(indices).size!==indices.length)
   throw Error('Target indices must be unique integers between 0 and 63.');
 return indices;
}
function validateFanoutPlan(plan,anchorIndex,targets,seamMode='preserve'){
 const {validateSeamMode}=require('./SplineJunctionSeamMath');
 validateSeamMode(seamMode);
 if(!plan?.ok||!Number.isInteger(anchorIndex)||!Array.isArray(targets)||
    plan.anchorIndex!==anchorIndex||plan.seamMode!==seamMode||
    !Array.isArray(plan.targetIndices)||
    plan.targetIndices.length!==targets.length||
    plan.targetIndices.some((i,j)=>i!==targets[j])||
    !plan.junctionUuid||!plan.anchorSplineUuid||!plan.parentUuid||
    typeof plan.guard!=='string'||!plan.guard||
    !valid(plan.rootTransform?.position)||!valid(plan.rootTransform?.scale)||
    !quat(plan.rootTransform?.rotation)||
    plan.reversed!==false||plan.closed!==false||
    ![0,1,2].includes(plan.dimension)||
    !Number.isInteger(plan.samplesPerCurve)||plan.samplesPerCurve<4||
    plan.samplesPerCurve>256||
    !Number.isInteger(plan.routeCount)||plan.routeCount!==targets.length||
    !Array.isArray(plan.routes)||plan.routes.length!==targets.length||
    !Number.isInteger(plan.totalKnotCount)||plan.totalKnotCount<6||
    plan.totalKnotCount>256||
    !Array.isArray(plan.targetSplineUuids)||
    plan.targetSplineUuids.length!==targets.length||
    new Set([plan.anchorSplineUuid,...plan.targetSplineUuids]).size!==
      targets.length+1)
   throw Error('Invalid fan-out Join plan from Scene.');
 let total=0;
 for(let i=0;i<plan.routes.length;i++){
   const r=plan.routes[i];
   if(!r||r.seamMode!==seamMode||r.targetIndex!==targets[i]||!Number.isInteger(r.count)||
      r.count<3||r.count>128||
      !Array.isArray(r.knots)||r.knots.length!==r.count||
      !Number.isFinite(r.gap)||r.gap<0||r.gap>1e-5||
      r.knots.some(k=>k?.mode!==4||!valid(k.position)||
       !valid(k.tangentIn)||!valid(k.tangentOut)))
      throw Error('Invalid fan-out Join route geometry.');
   total+=r.count;
 }
 if(total!==plan.totalKnotCount)
   throw Error('Fan-out Join Knot count mismatch.');
 return plan;
}
async function commitJunctionFanout(plan,actions){
 const keys=['check','createNode','component','nodeProperty','containerProperty',
  'appearanceWrites','position','setKnot','snapshot','removeNode','select','refresh'];
 if(!actions||keys.some(k=>typeof actions[k]!=='function'))
   throw Error('Invalid Junction fan-out Editor adapter.');
 const a=actions;
 // Appearance must be strictly preflight-validated before Scene mutation.
 const appearance=a.appearanceWrites(plan.containerAppearance||{});
 let group=null,committed=false;
 const roots=[];
 try{
   await a.check();
   group=await a.createNode(plan.parentUuid,
     String(plan.sourceName||'Spline').slice(0,60)+' (Joined Branches)');
   for(const route of plan.routes){
     await a.check();
     const root=await a.createNode(group,
       'Joined Exit '+route.targetIndex);
     roots.push(root);
     await a.component(root,'Splines.SplineContainer');
     await a.nodeProperty(root,'position','cc.Vec3',plan.rootTransform.position);
     await a.nodeProperty(root,'rotation','cc.Quat',plan.rootTransform.rotation);
     await a.nodeProperty(root,'scale','cc.Vec3',plan.rootTransform.scale);
     await a.containerProperty(root,0,'closed',false,'Boolean',false);
     await a.containerProperty(root,0,'reversed',false,'Boolean',false);
     await a.containerProperty(root,0,'dimension',plan.dimension,'Enum',false);
     await a.containerProperty(root,0,'samplesPerCurve',plan.samplesPerCurve,'Integer',false);
     for(const setting of appearance)
       await a.containerProperty(root,0,setting.key,setting.value,setting.type,false);
     for(let i=0;i<route.knots.length;i++){
       if(i%8===0)await a.check();
       const knot=route.knots[i],id=await a.createNode(root,
         'Knot '+String(i).padStart(3,'0'));
       await a.component(id,'Splines.SplineKnot');
       await a.position(id,[knot.position.x,knot.position.y,knot.position.z]);
       await a.setKnot(id,'mode',4,'Enum');
       await a.setKnot(id,'tangentIn',knot.tangentIn,'cc.Vec3');
       await a.setKnot(id,'tangentOut',knot.tangentOut,'cc.Vec3');
     }
   }
   await a.check();
   await a.snapshot();
   committed=true;
   let warning='';
   try{await a.select(group);}catch(e){warning='Selection failed: '+String(e);}
   for(const root of roots){
     try{await a.refresh(root);}catch(e){
       warning+=' Preview refresh failed: '+String(e);
     }
   }
   return {ok:true,group,roots,routeCount:roots.length,
     totalKnotCount:plan.totalKnotCount,warning,
     message:'Created '+roots.length+' independent Joined splines ('+
       plan.totalKnotCount+' Knots) in one group. Source spline branches and Junction unchanged. '+
       'One Scene snapshot. Seam mode: '+plan.seamMode+'. Source Knots not modified.'};
 }catch(error){
   let warning='';
   if(group&&!committed){
     try{
       await a.check();
       const removed=await a.removeNode(group);
       if(removed===false||(removed&&removed.ok===false))
         throw Error('Scene rejected Fan-out cleanup.');
     }catch(e){warning='; cleanup skipped/failed: '+String(e?.message||e);}
   }
   throw Error(String(error?.message||error)+warning);
 }
}
module.exports={parseFanoutTargets,validateFanoutPlan,commitJunctionFanout};
