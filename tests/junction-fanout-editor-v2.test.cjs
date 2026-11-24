'use strict';
const assert=require('node:assert/strict');
const {parseFanoutTargets,validateFanoutPlan,commitJunctionFanout}=
 require('../dist/SplineJunctionFanoutEditor');
const {planJunctionFanout}=require('../dist/SplineJunctionFanoutMath');
const v=(x=0,y=0,z=0)=>({x,y,z}),q={x:0,y:0,z:0,w:1};
const m=tx=>[1,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const source=(tx,progress)=>({dimension:0,matrix:m(tx),reversed:false,progress,
 knots:[0,5,10].map(x=>({position:v(x),tangentIn:v(-1),tangentOut:v(1)}))});
const geometry=planJunctionFanout(source(0,1),[
 {index:1,source:source(10,0)},{index:2,source:source(10,0)}]);
const plan=()=>({ok:true,...geometry,
 junctionUuid:'junction',anchorIndex:0,targetIndices:[1,2],
 anchorSplineUuid:'s-a',targetSplineUuids:['s-b','s-c'],
 parentUuid:'scene',sourceName:'Spline Source',
 rootTransform:{position:v(),rotation:{...q},scale:v(1,1,1)},
 samplesPerCurve:32,
 containerAppearance:{showGizmos:true,gizmoSteps:12},
 guard:'revision-A',
});
assert.deepEqual(parseFanoutTargets('1, 2, 3'),[1,2,3]);
assert.deepEqual(parseFanoutTargets(' 0,2 '),[0,2]);
for(const input of ['1','1,1','1,2,','1;2','-1,2','1,2e3',
 '1,64','1,2,3,4,5,6,7,8,9',new Array(80).fill('1').join('')]){
 assert.throws(()=>parseFanoutTargets(input),/targets|unique|indices/i);
}
validateFanoutPlan(plan(),0,[1,2]);
assert.throws(()=>validateFanoutPlan({...plan(),totalKnotCount:9},0,[1,2]),/count/);
assert.throws(()=>validateFanoutPlan({...plan(),routeCount:1},0,[1,2]),/plan/);
assert.throws(()=>validateFanoutPlan(plan(),0,[2,1]),/plan/);
assert.throws(()=>validateFanoutPlan({...plan(),targetSplineUuids:['s-b','s-b']},0,[1,2]),/plan/);
let selection=['junction'],serial=0,snapshots=0,valid=true,
 failure='',created=[],removed=[],writes=[];
const nodes=new Map([
 ['s-a',Object.freeze({uuid:'s-a',untouched:true})],
 ['s-b',Object.freeze({uuid:'s-b',untouched:true})],
 ['s-c',Object.freeze({uuid:'s-c',untouched:true})],
]);
const before=JSON.stringify([...nodes.entries()]);
const request=async(channel,method,arg)=>{
 assert.equal(channel,'scene');
 if(method==='query-component-has-script')return true;
 if(method==='execute-scene-script'){
   if(arg.method==='queryJunctionFanoutPlan')return plan();
   if(arg.method==='queryJunctionJoinValid')
     return valid?{ok:true}:{ok:false,error:'Junction source changed'};
   if(arg.method==='refreshPreview')return {ok:true};
   throw Error('Unexpected scene method '+arg.method);
 }
 if(method==='create-node'){
   const uuid='new-'+(++serial),n={uuid,parent:arg.parent,name:arg.name,components:[]};
   nodes.set(uuid,n);created.push(n);return uuid;
 }
 if(method==='create-component'){
   const n=nodes.get(arg.uuid);assert(n,'Missing new node');
   n.components.push(arg.component);return true;
 }
 if(method==='query-node'){
   const n=nodes.get(arg);assert(n,'Missing query-node');
   return {__comps__:n.components.map(type=>({
     type,value:type==='Splines.SplineKnot'?{
       mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},
       tangentOut:{type:'cc.Vec3'},
     }:{} }))};
 }
 if(method==='set-property'){
   assert.equal(arg.record,false,'Use silent writes and one final snapshot');
   assert(!['s-a','s-b','s-c'].includes(arg.uuid),'Do not mutate source Nodes');
   const n=nodes.get(arg.uuid);assert(n,'Unknown generated uuid');
   writes.push({uuid:arg.uuid,path:arg.path,value:arg.dump.value});
   if(failure==='write'&&arg.path.endsWith('tangentOut'))return false;
   n[arg.path]=arg.dump.value;return true;
 }
 if(method==='snapshot'){
   snapshots++;return failure==='snapshot'?false:true;
 }
 if(method==='remove-node'){
   assert.equal(arg.snapshot,false);
   removed.push(arg.uuid);nodes.delete(arg.uuid);return true;
 }
 throw Error('Unexpected IPC '+method);
};
global.Editor={
 Selection:{getSelected:()=>selection.slice(),
   clear:()=>selection=[],select:(_,uuid)=>selection.push(uuid)},
 Message:{request},
};
const methods=require('../dist/main.js').methods;
(async()=>{
 let result=await methods.joinJunctionFanout(0,'1,2');
 assert(result.ok,result.error);
 assert.equal(result.routeCount,2);
 assert.equal(result.totalKnotCount,10);
 assert.equal(result.roots.length,2);
 assert.equal(snapshots,1,'One snapshot for entire grouped fan-out');
 assert.deepEqual(selection,[result.group],'Select the group, not a route');
 const group=created.find(x=>x.uuid===result.group);
 assert.equal(group.parent,'scene');
 const roots=created.filter(x=>x.parent===group.uuid);
 assert.equal(roots.length,2,'One independent SplineContainer per target');
 assert.deepEqual(roots.map(r=>r.name),['Joined Exit 1','Joined Exit 2']);
 const knotGroups=roots.map(r=>created.filter(n=>n.parent===r.uuid));
 assert.deepEqual(knotGroups.map(x=>x.length),[5,5]);
 for(const groupKnots of knotGroups){
   assert.deepEqual(groupKnots.map(x=>nodes.get(x.uuid).position.x),
     [0,5,10,15,20]);
 }
 assert.equal(writes.filter(w=>w.path.endsWith('.mode')&&w.value===4).length,10);
 assert.equal(writes.filter(w=>w.path.endsWith('tangentIn')).length,10);
 assert.equal(writes.filter(w=>w.path.endsWith('tangentOut')).length,10);
 assert.deepEqual([...nodes.entries()].filter(([key])=>key.startsWith('s-')),
   JSON.parse(before));
 const initial=created.length,snap=snapshots;
 result=await methods.joinJunctionFanout(0,'1,1');
 assert(!result.ok);assert.equal(created.length,initial);
 result=await methods.joinJunctionFanout(1,'1,2');
 assert(!result.ok);assert.equal(created.length,initial);
 valid=false;result=await methods.joinJunctionFanout(0,'1,2');
 assert(!result.ok&&/changed/.test(result.error));
 assert.equal(created.length,initial,'Stale source should abort before group');
 valid=true;failure='write';
 const removedBefore=removed.length;
 result=await methods.joinJunctionFanout(0,'1,2');
 assert(!result.ok&&/tangentOut/.test(result.error));
 assert.equal(removed.length,removedBefore+1);
 assert.equal(snapshots,snap,'No snapshot on failed write');
 valid=true;failure='snapshot';
 result=await methods.joinJunctionFanout(0,'1,2');
 assert(!result.ok&&/snapshot/.test(result.error));
 assert.equal(removed.length,removedBefore+2);
 assert.equal(snapshots,snap+1);
 assert.deepEqual([...nodes.entries()].filter(([key])=>key.startsWith('s-')),
   JSON.parse(before),'Source Node snapshot remains unchanged');
 const inspector=require('../dist/contributions/inspector/Junction');
 assert(inspector.template.includes('spl-join-fanout'));
 assert(inspector.template.includes('spl-fanout-targets'));
 const manifest=require('../package.json').contributions.messages;
 assert.deepEqual(manifest['join-junction-fanout'].methods,['joinJunctionFanout']);
 console.log('JUNCTION FAN-OUT EDITOR PASS: one group, branch copies, source isolation, one snapshot, validation, safe cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
