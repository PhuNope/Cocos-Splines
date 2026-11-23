'use strict';
const assert=require('node:assert/strict');
const before={x:0,y:2,z:0},after={x:2,y:0,z:0};
let current={...before},snapshotCount=0,writes=0,behavior='',guardOK=true;
const calls=[],selection=['junction'];
const makePlan=()=>({ok:true,junctionUuid:'junction',targetKnotUuid:'knot',
 targetSplineUuid:'target-spline',writeUuid:'knot',
 writePath:'__comps__.0.tangentOut',side:'out',mode:'g1',orientation:'same',
 anchorIndex:0,targetIndex:1,before:{...before},after:{...after},
 guard:'revision-one',changed:true,gap:0,targetWorldLength:2});
global.Editor={
 Selection:{getSelected:()=>selection,clear(){selection.length=0;},select(_,v){selection.push(v);}},
 Message:{request:async(channel,method,arg)=>{
   assert.equal(channel,'scene');
   if(method==='execute-scene-script'){
     calls.push(arg.method);
     if(arg.method==='queryJunctionTangentPlan'){
       if(behavior==='noop')return {...makePlan(),before:{...before},after:{...before},changed:false};
       if(behavior==='invalid')return {...makePlan(),writePath:'__proto__.position'};
       return makePlan();
     }
     if(arg.method==='queryJunctionTangentState'){
       if(!guardOK)return {ok:false,error:'scene changed'};
       return {ok:true,uuid:'knot',path:'__comps__.0.tangentOut',value:{...current}};
     }
     if(arg.method==='refreshPreview')return {ok:true};
     throw Error('Unknown method: '+arg.method);
   }
   if(method==='set-property'){
     assert.equal(arg.uuid,'knot');
     assert.equal(arg.path,'__comps__.0.tangentOut');
     assert.equal(arg.dump.type,'cc.Vec3');
     assert.equal(arg.record,false);
     writes++;
     current={...arg.dump.value};
     if(behavior==='mutated-rejected'&&current.x===2)return false;
     return true;
   }
   if(method==='snapshot'){
     snapshotCount++;
     if(behavior==='snapshot-reject')return false;
     return true;
   }
   throw Error('Unknown Editor request '+method);
 }},
};
const {methods}=require('../dist/main.js');
(async()=>{
 let r=await methods.alignJunctionTangent(0,1,'g1','same');
 assert(r.ok,r.error);
 assert.equal(current.x,2);
 assert.equal(snapshotCount,1);
 assert.equal(writes,1);
 assert(calls.includes('queryJunctionTangentState'));
 current={...before};behavior='noop';
 const s=snapshotCount,w=writes;
 r=await methods.alignJunctionTangent(0,1,'g1','same');
 assert(r.ok&&!r.changed);assert.equal(snapshotCount,s);assert.equal(writes,w);
 behavior='mutated-rejected';
 r=await methods.alignJunctionTangent(0,1,'g1','same');
 assert(!r.ok);
 assert.deepEqual(current,before,'Rollback after rejected-but-mutating Editor write');
 assert.equal(snapshotCount,s);
 behavior='snapshot-reject';
 r=await methods.alignJunctionTangent(0,1,'g1','same');
 assert(!r.ok);
 assert.deepEqual(current,before);
 assert.equal(snapshotCount,s+1,'single rejected snapshot, no additional snapshots');
 behavior='invalid';
 const writesBefore=writes;
 r=await methods.alignJunctionTangent(0,1,'g1','same');
 assert(!r.ok);assert.equal(writes,writesBefore,'Reject foreign serialized path');
 behavior='';guardOK=false;
 r=await methods.alignJunctionTangent(0,1,'g1','same');
 assert(!r.ok);assert.equal(writes,writesBefore);
 guardOK=true;
 const junction=require('../dist/contributions/inspector/Junction.js');
 for(const selector of ['spl-align-connector','spl-tangent-mode','spl-tangent-direction'])
   assert(junction.template.includes(selector),'Missing Inspector control '+selector);
 const messages=require('../package.json').contributions.messages;
 assert(messages['align-junction-tangent']);
 console.log('JUNCTION TANGENT EDITOR PASS: single snapshot, serialized path whitelist, no-op, rollback and stale guards.');
})().catch(e=>{console.error(e);process.exitCode=1;});
