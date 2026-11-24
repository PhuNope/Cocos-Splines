'use strict';
const assert=require('node:assert/strict');
const {costRoute}=require('../dist/SplineJunctionRouteCost');
const {planMultiJunctionGeometry}=require('../dist/SplineJunctionRouteMath');
const {validateMultiJunctionPlan}=require('../dist/SplineJunctionRouteEditor');
const v=(x=0,y=0,z=0)=>({x,y,z}),q={x:0,y:0,z:0,w:1};
const mat=x=>[1,0,0,0,0,1,0,0,0,0,1,0,x,0,0,1];
const L=(junctionId,linkIndex,splineId,progress,x,worldArc,worldTotal)=>({
 junctionId,linkIndex,splineId,progress,world:v(x),worldArc,worldTotal,
});
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
const anchor={junctionId:'j1',linkIndex:0};
const descriptors={
 a:{start:0,delta:10},b:{start:10,delta:10},
 c:{start:10,delta:2},e:{start:12,delta:2},
 d:{start:20,delta:-6},
};
function plan(mode='switches',penalty=10){
 const c=costRoute(links,anchor,'d',{mode,penalty});
 const parts=c.path.map(step=>{
   const {start,delta}=descriptors[step.splineId];
   return {matrix:mat(start),dimension:0,reversed:false,
     progress:step.progress,knots:[0,delta/2,delta].map((x,i)=>({
       position:v(x),mode:4,
       tangentIn:v(-delta/6),tangentOut:v(delta/6),
     }))};
 });
 const geometry=planMultiJunctionGeometry(c.path,parts,'preserve');
 return {ok:true,...geometry,junctionUuid:'j1',anchorIndex:0,
   goalSplineUuid:'d',routeMode:'full',startSide:0,goalSide:1,
   routeCostMode:mode,junctionPenalty:penalty,
   estimatedWorldDistance:mode==='switches'?null:c.estimatedWorldDistance,
   estimatedRouteCost:mode==='switches'?null:c.estimatedRouteCost,
   parentUuid:'scene',sourceName:'A',rootTransform:{
     position:v(),rotation:{...q},scale:v(1,1,1)},
   samplesPerCurve:32,containerAppearance:{showGizmos:true,gizmoSteps:12},
   chain:c.path,guard:'lease',
 };
}
validateMultiJunctionPlan(plan('distance',10),0,'d','preserve','full',0,1,
 'distance',10);
assert.throws(()=>validateMultiJunctionPlan({...plan('distance'),
 estimatedWorldDistance:100},0,'d','preserve','full',0,1,'distance',10),
 /sampled world costs/);
assert.throws(()=>validateMultiJunctionPlan(plan('distance'),0,'d',
 'preserve','full',0,1,'balanced',10),/plan/);
assert.throws(()=>validateMultiJunctionPlan(plan('balanced',10),0,'d',
 'preserve','full',0,1,'balanced',12),/plan/);
let selected=['j1'],serial=0,snapshots=0,created=[],removed=[],
 writes=[],guard=true,failWrite=false,badResponse=false,invocations=[];
const nodes=new Map([
 ['a',Object.freeze({uuid:'a',source:true})],
 ['b',Object.freeze({uuid:'b',source:true})],
 ['c',Object.freeze({uuid:'c',source:true})],
 ['d',Object.freeze({uuid:'d',source:true})],
 ['e',Object.freeze({uuid:'e',source:true})],
]);
const sources=JSON.stringify([...nodes.entries()]);
const request=async(channel,method,arg)=>{
 assert.equal(channel,'scene');
 if(method==='query-component-has-script')return true;
 if(method==='execute-scene-script'){
   if(arg.method==='queryMultiJunctionJoinPlan'){
     invocations.push(arg.args);
     const mode=arg.args[7]||'switches',penalty=arg.args[8]??10,
       policy=arg.args[9]||'ignore',admission=arg.args[10]||'ignore',
       followers=arg.args[11]??1;
     const output={...plan(mode,penalty),routePolicy:policy,
       admissionMode:admission,requiredFollowers:followers,
       capacitySource:'scene-configuration'};
     return badResponse?{...output,estimatedWorldDistance:-3}:output;
   }
   if(arg.method==='queryMultiJunctionJoinValid')
     return guard?{ok:true}:{ok:false,error:'Scene changed'};
   if(arg.method==='refreshPreview')return {ok:true};
   throw Error('Unexpected Scene method '+arg.method);
 }
 if(method==='create-node'){
   const id='new-'+(++serial),node={uuid:id,name:arg.name,
     parent:arg.parent,components:[]};
   created.push(node);nodes.set(id,node);return id;
 }
 if(method==='create-component'){
   const node=nodes.get(arg.uuid);assert(node);
   node.components.push(arg.component);return true;
 }
 if(method==='query-node'){
   const node=nodes.get(arg);assert(node,'Missing created Node');
   return {__comps__:node.components.map(type=>({type,value:
    type==='Splines.SplineKnot'?{
     mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},
     tangentOut:{type:'cc.Vec3'},
    }:{} }))};
 }
 if(method==='set-property'){
   assert.equal(arg.record,false,'Only one final Scene snapshot allowed');
   assert(nodes.has(arg.uuid),'Never write to original source nodes');
   if(failWrite&&arg.path.endsWith('tangentOut'))return false;
   nodes.get(arg.uuid)[arg.path]=arg.dump.value;
   writes.push({uuid:arg.uuid,path:arg.path,value:arg.dump.value});
   return true;
 }
 if(method==='snapshot'){snapshots++;return true;}
 if(method==='remove-node'){
   assert.equal(arg.snapshot,false);
   removed.push(arg.uuid);nodes.delete(arg.uuid);return true;
 }
 throw Error('Unknown Editor message '+method);
};
global.Editor={
 Selection:{getSelected:()=>selected.slice(),clear:()=>selected=[],
   select:(_,id)=>selected.push(id)},
 Message:{request},
};
const {methods}=require('../dist/main.js');
(async()=>{
 let result=await methods.joinMultiJunctionRoute(0,'d','preserve',
 'full',0,1,'distance',10);
 assert(result.ok,result.error);
 assert.equal(result.routeCostMode,'distance');
 assert.equal(result.sourceCount,4);
 assert.equal(result.count,9);
 assert.equal(result.estimatedWorldDistance,20);
 assert.equal(result.estimatedRouteCost,20);
 assert.deepEqual(invocations.at(-1),['j1',0,'d','preserve',
   'full',0,1,'distance',10]);
 assert.deepEqual(selected,[result.root]);
 assert.equal(created.filter(x=>x.parent===result.root).length,9);
 assert.equal(snapshots,1);
 assert(writes.every(x=>!['a','b','c','d','e'].includes(x.uuid)));
 selected=['j1'];
 result=await methods.joinMultiJunctionRoute(0,'d','preserve',
 'full',0,1,'balanced',10);
 assert(result.ok,result.error);
 assert.equal(result.sourceCount,3);
 assert.equal(result.estimatedWorldDistance,26);
 assert.equal(result.estimatedRouteCost,46);
 assert.equal(snapshots,2);
 selected=['j1'];
 result=await methods.joinMultiJunctionRoute(0,'d');
 assert(result.ok,result.error);
 assert.deepEqual(invocations.at(-1),
 ['j1',0,'d','preserve','full',0,1],
 'Default workflow must keep legacy 7-argument Scene IPC contract');
 assert.equal(result.routeCostMode,'switches');
 assert.equal(result.estimatedWorldDistance,null);
 assert.equal(snapshots,3);
 selected=['j1'];
 result=await methods.joinMultiJunctionRoute(0,'d','preserve',
 'full',0,1,'distance',10,'direction-green');
 assert(result.ok,result.error);
 assert.equal(result.routePolicy,'direction-green');
 assert.equal(snapshots,4);
 assert.deepEqual(invocations.at(-1),
 ['j1',0,'d','preserve','full',0,1,'distance',10,'direction-green']);
 selected=['j1'];
 result=await methods.joinMultiJunctionRoute(0,'d','preserve',
 'full',0,1,'switches',10,'ignore','capacity',2);
 assert(result.ok,result.error);
 assert.equal(result.admissionMode,'capacity');
 assert.equal(result.requiredFollowers,2);
 assert.equal(snapshots,5);
 assert.deepEqual(invocations.at(-1),
 ['j1',0,'d','preserve','full',0,1,'switches',10,'ignore','capacity',2]);
 const count=created.length,oldSnapshots=snapshots;
 selected=['j1'];badResponse=true;
 result=await methods.joinMultiJunctionRoute(0,'d','preserve',
 'full',0,1,'distance',10);
 assert(!result.ok&&/costs/.test(result.error));
 assert.equal(created.length,count);
 assert.equal(snapshots,oldSnapshots);
 badResponse=false;guard=false;
 result=await methods.joinMultiJunctionRoute(0,'d','preserve',
 'full',0,1,'distance',10);
 assert(!result.ok&&/changed/.test(result.error));
 assert.equal(created.length,count);
 guard=true;failWrite=true;
 const removedBefore=removed.length;
 result=await methods.joinMultiJunctionRoute(0,'d','preserve',
 'full',0,1,'balanced',10);
 assert(!result.ok&&/tangentOut/.test(result.error));
 assert.equal(removed.length,removedBefore+1);
 assert.equal(snapshots,oldSnapshots);
 failWrite=false;
 result=await methods.joinMultiJunctionRoute(0,'d','preserve',
 'full',0,1,'balanced',-1);
 assert(!result.ok&&/switch penalty/.test(result.error));
 assert.equal(created.length,count+2,'Rejected cost values create no new nodes');
 result=await methods.joinMultiJunctionRoute(0,'d','preserve',
 'full',0,1,'distance',10,'bad-policy');
 assert(!result.ok&&/route policy/.test(result.error));
 assert.equal(created.length,count+2);
 result=await methods.joinMultiJunctionRoute(0,'d','preserve',
 'full',0,1,'distance',10,'ignore','capacity',0);
 assert(!result.ok&&/Required follower/.test(result.error));
 assert.equal(created.length,count+2);
 assert.deepEqual([...nodes.entries()].filter(([id])=>
   ['a','b','c','d','e'].includes(id)),JSON.parse(sources));
 const inspector=require('../dist/contributions/inspector/Junction');
 assert(inspector.template.includes('spl-route-cost-mode'));
 assert(inspector.template.includes('value="switches"'));
 assert(inspector.template.includes('value="distance"'));
 assert(inspector.template.includes('value="balanced"'));
 assert(inspector.template.includes('spl-route-switch-penalty'));
 assert(inspector.template.includes('spl-route-admission'));
 assert(inspector.template.includes('spl-route-required-followers'));
 assert(inspector.template.includes('value="capacity"'));
 assert(inspector.template.includes('value="capacity-phases"'));
 assert(inspector.template.includes('spl-route-policy'));
 assert(inspector.template.includes('value="ignore"'));
 assert(inspector.template.includes('value="direction"'));
 assert(inspector.template.includes('value="direction-green"'));
 console.log('JUNCTION COST EDITOR PASS: legacy IPC, distance/balanced modes, cost validation, one snapshot, source isolation, stale lease and rollback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
