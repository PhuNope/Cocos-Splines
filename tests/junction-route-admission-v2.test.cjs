'use strict';
const assert=require('node:assert/strict');
const {validateRouteAdmission,configuredExitAvailable,
 compileControllerEligibility}=require('../dist/SplineRouteAdmission');
const {costRoute}=require('../dist/SplineJunctionRouteCost');
const v=x=>({x,y:0,z:0});
const L=(junctionId,linkIndex,splineId,progress,x,arc,total)=>({
 junctionId,linkIndex,splineId,progress,world:v(x),worldArc:arc,
 worldTotal:total,exitDirection:0,trafficSignal:0,maxFollowers:0,
 phaseEligible:true,
});
assert.deepEqual(validateRouteAdmission(),{mode:'ignore',followers:1});
assert.deepEqual(validateRouteAdmission('capacity-phases',12),
 {mode:'capacity-phases',followers:12});
for(const mode of ['foo','live','capacity-queue',null])
 assert.throws(()=>validateRouteAdmission(mode,1),/route admission mode/);
for(const count of [0,4097,1.2,NaN,Infinity,'2'])
 assert.throws(()=>validateRouteAdmission('capacity',count),/Required follower/);
assert(configuredExitAvailable({maxFollowers:0},'capacity',4096));
assert(configuredExitAvailable({maxFollowers:3},'capacity',3));
assert(!configuredExitAvailable({maxFollowers:2},'capacity',3));
assert(configuredExitAvailable({maxFollowers:2,phaseEligible:true},'capacity-phases',2));
assert(!configuredExitAvailable({maxFollowers:2,phaseEligible:false},'capacity-phases',2));
assert(configuredExitAvailable({},'ignore',1),'Legacy mode ignores capacity fields');
assert.throws(()=>configuredExitAvailable({maxFollowers:-1},'capacity',2),/maxFollowers/);
assert.throws(()=>configuredExitAvailable({maxFollowers:2},'capacity-phases',2),/phase eligibility/);
const ctrl=()=>({
 allRedSeconds:1,adaptiveTraffic:false,
 phases:[{greenExits:[1,2],greenSeconds:8,yellowSeconds:2},
         {greenExits:[3],greenSeconds:6,yellowSeconds:0}],
 conflicts:[{firstExit:1,secondExit:3}],
});
const green=compileControllerEligibility(ctrl(),5);
assert.deepEqual([...green].sort((a,b)=>a-b),[1,2,3]);
assert(!green.has(4),'An exit absent from any Green phase is not admitted');
assert.throws(()=>compileControllerEligibility({...ctrl(),
 phases:[{greenExits:[1,3],greenSeconds:8,yellowSeconds:2}]},5),
 /conflict/i);
assert.throws(()=>compileControllerEligibility({...ctrl(),
 phases:[{greenExits:[1,1],greenSeconds:8,yellowSeconds:2}]},5),
 /duplicate/i);
assert.throws(()=>compileControllerEligibility({...ctrl(),
 allRedSeconds:0},5),/clearance/);
assert.throws(()=>compileControllerEligibility({...ctrl(),
 phases:[]},5),/phases/);
assert.throws(()=>compileControllerEligibility({...ctrl(),
 phases:[{greenExits:[5],greenSeconds:8,yellowSeconds:2}]},5),
 /exit index/);
assert.throws(()=>compileControllerEligibility({...ctrl(),
 adaptiveTraffic:true,minGreenSeconds:4,maxGreenSeconds:2,maxDemandWaitSeconds:30},5),
 /adaptive/i);
assert.deepEqual([...compileControllerEligibility({...ctrl(),
 adaptiveTraffic:true,minGreenSeconds:2,maxGreenSeconds:5,maxDemandWaitSeconds:30},5)], 
 [1,2,3]);
const links=[
 L('j1',0,'a',1,10,10,10),
 L('j1',1,'b',0,10,0,10),
 L('j2',0,'b',1,20,10,10),
 L('j2',1,'d',0,20,0,6),
 L('j1',2,'c',0,10,0,2),
 L('j3',0,'c',1,12,2,2),
 L('j3',1,'e',0,12,0,2),
 L('j4',0,'e',1,14,2,2),
 L('j4',1,'d',1,14,6,6),
];
const before=JSON.stringify(links);
const anchor={junctionId:'j1',linkIndex:0};
const route=(admissionMode='ignore',requiredFollowers=1,mode='switches')=>
 costRoute(links,anchor,'d',{mode,admissionMode,requiredFollowers});
const ids=r=>r.path.map(p=>p.splineId);
assert.deepEqual(ids(route()),['a','b','d']);
links[1].maxFollowers=1;
assert.deepEqual(ids(route('capacity',2)),['a','c','e','d']);
assert.deepEqual(ids(route('capacity',1)),['a','b','d']);
links[4].maxFollowers=1;
assert.throws(()=>route('capacity',2),/No cost-aware/);
links[4].maxFollowers=0;
links[1].maxFollowers=0;
links[1].phaseEligible=false;
assert.deepEqual(ids(route('capacity-phases',2)),['a','c','e','d']);
links[4].phaseEligible=false;
assert.throws(()=>route('capacity-phases',2),/No cost-aware/);
links[1].phaseEligible=true;
assert.deepEqual(ids(route('capacity-phases',2)),['a','b','d']);
links[1].phaseEligible=false;
links[4].phaseEligible=true;
assert.deepEqual(ids(route('capacity-phases',2,'distance')),
 ['a','c','e','d']);
links[4].phaseEligible='yes';
assert.throws(()=>route('capacity-phases',2),/sampled world arc/);
links[4].phaseEligible=true;
links[1].maxFollowers=-3;
assert.throws(()=>route('capacity',2),/sampled world arc/);
links[1].maxFollowers=0;
assert.deepEqual(ids(route('ignore',1)),['a','b','d']);
links[1].phaseEligible=true;
assert.equal(JSON.stringify(links),before,'No source snapshot mutation after restoring test settings');
console.log('ROUTE ADMISSION MATH PASS: configured demand, unlimited exits, phase candidates, conflicts, invalid controllers, multi-route selection.');
