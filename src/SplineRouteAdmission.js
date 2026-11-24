'use strict';
/** Read-only EDITOR admission eligibility, NOT runtime occupancy or
 * reservation. Actual SplineTrafficGate.count/waiting live in play mode.
 *
 * capacity: reject configured maxFollowers below requested group size;
 * capacity-phases: also require a potentially Green phase, or a Green
 * manual signal when no enabled controller manages that Junction.
 */
const MODES=Object.freeze(['ignore','capacity','capacity-phases']);
function validateRouteAdmission(mode='ignore',followers=1){
 if(!MODES.includes(mode))throw Error('Invalid route admission mode.');
 if(!Number.isInteger(followers)||followers<1||followers>4096)
   throw Error('Required follower count must be an integer from 1 to 4096.');
 return {mode,followers};
}
function configuredExitAvailable(exit,mode='ignore',followers=1){
 validateRouteAdmission(mode,followers);
 if(mode==='ignore')return true;
 const limit=exit?.maxFollowers;
 if(!Number.isInteger(limit)||limit<0||limit>4096)
   throw Error('Invalid Junction maxFollowers for configured capacity routing.');
 if(limit!==0&&limit<followers)return false;
 if(mode==='capacity-phases') {
   if(typeof exit.phaseEligible!=='boolean')
     throw Error('Missing route controller phase eligibility snapshot.');
   return exit.phaseEligible;
 }
 return true;
}
/** Mirror compileTrafficCycle + validateAdaptiveTraffic constraints used
 * by runtime. Phase eligibility is POSSIBILITY of Green over a cycle;
 * it does not predict arrival time, queues, adaptive phase selection,
 * paused controller, or an instantaneous traffic signal.
 */
function compileControllerEligibility(controller,linkCount){
 if(!Number.isInteger(linkCount)||linkCount<2||linkCount>1024||
    !controller||typeof controller!=='object'||
    !Number.isFinite(controller.allRedSeconds)||
    controller.allRedSeconds<.05||controller.allRedSeconds>300)
   throw Error('Invalid traffic controller phase configuration or clearance.');
 const phases=controller.phases,conflicts=controller.conflicts;
 if(!Array.isArray(phases)||phases.length<1||phases.length>32||
    !Array.isArray(conflicts)||conflicts.length>2048)
   throw Error('Invalid traffic controller phases or conflict configuration.');
 if(controller.adaptiveTraffic){
   const min=controller.minGreenSeconds,max=controller.maxGreenSeconds,
     wait=controller.maxDemandWaitSeconds;
   if(!Number.isFinite(min)||min<.05||min>3600||
      !Number.isFinite(max)||max<min||max>3600||
      !Number.isFinite(wait)||wait<.05||wait>3600)
     throw Error('Invalid adaptive traffic phase configuration.');
 }
 const conflictKeys=new Set();
 for(const pair of conflicts){
   const a=pair?.firstExit,b=pair?.secondExit;
   if(!Number.isInteger(a)||!Number.isInteger(b)||
      a<0||b<0||a>=linkCount||b>=linkCount||a===b)
     throw Error('Invalid traffic controller conflict pair.');
   conflictKeys.add([Math.min(a,b),Math.max(a,b)].join(':'));
 }
 let loop=0;const green=new Set();
 for(const phase of phases){
   const exits=phase?.greenExits;
   if(!Array.isArray(exits)||exits.length<1||exits.length>128||
      !Number.isFinite(phase.greenSeconds)||phase.greenSeconds<.05||
      phase.greenSeconds>3600||
      !Number.isFinite(phase.yellowSeconds)||phase.yellowSeconds<0||
      phase.yellowSeconds>300)
     throw Error('Invalid traffic controller Green/Yellow phase.');
   const indices=new Set();
   for(const index of exits){
     if(!Number.isInteger(index)||index<0||index>=linkCount||
        indices.has(index))
       throw Error('Invalid/duplicate traffic controller phase exit index.');
     indices.add(index);
   }
   for(const key of conflictKeys){
     const [a,b]=key.split(':').map(Number);
     if(indices.has(a)&&indices.has(b))
       throw Error('Traffic controller conflict exits cannot be Green together.');
   }
   for(const index of indices)green.add(index);
   loop+=phase.greenSeconds+phase.yellowSeconds+controller.allRedSeconds;
 }
 if(!Number.isFinite(loop)||loop<=0||loop>120000)
   throw Error('Traffic controller cycle duration exceeds safe limit.');
 return green;
}
module.exports={validateRouteAdmission,configuredExitAvailable,
 compileControllerEligibility};
