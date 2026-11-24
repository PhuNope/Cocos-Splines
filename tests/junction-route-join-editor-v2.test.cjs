'use strict';
const assert=require('node:assert/strict');
const {planEndpointJunctionChain,planMultiJunctionGeometry}=
 require('../dist/SplineJunctionRouteMath');
const {validateMultiJunctionPlan,commitMultiJunctionRoute}=
 require('../dist/SplineJunctionRouteEditor');
const v=(x=0,y=0,z=0)=>({x,y,z}),q={x:0,y:0,z:0,w:1};
const m=tx=>[1,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const source=(tx,progress)=>({matrix:m(tx),dimension:0,
 reversed:false,progress,
 knots:[0,5,10].map(x=>({position:v(x),
   tangentIn:v(-1),tangentOut:v(1)}))});
const links=[
 {junctionId:'j1',linkIndex:0,splineId:'a',progress:1,world:v(10)},
 {junctionId:'j1',linkIndex:1,splineId:'b',progress:0,world:v(10)},
 {junctionId:'j2',linkIndex:0,splineId:'b',progress:1,world:v(20)},
 {junctionId:'j2',linkIndex:1,splineId:'c',progress:0,world:v(20)},
];
const chain=planEndpointJunctionChain(links,
 {junctionId:'j1',linkIndex:0},'c');
const geometry=planMultiJunctionGeometry(chain.path,
 [source(0,1),source(10,0),source(20,0)]);
const plan=()=>({ok:true,...geometry,
 junctionUuid:'j1',anchorIndex:0,goalSplineUuid:'c',
 parentUuid:'scene',rootTransform:{position:v(),rotation:{...q},
 scale:v(1,1,1)},sourceName:'A',samplesPerCurve:32,
 containerAppearance:{showGizmos:true,gizmoSteps:12},
 chain:chain.path,guard:'fingerprint-123',
});
validateMultiJunctionPlan(plan(),0,'c');
assert.throws(()=>validateMultiJunctionPlan(plan(),0,'b'),/plan/);
assert.throws(()=>validateMultiJunctionPlan({...plan(),count:9},0,'c'),/plan/);
assert.throws(()=>validateMultiJunctionPlan({...plan(),switchCount:1},0,'c'),/plan/);
assert.throws(()=>validateMultiJunctionPlan({...plan(),seams:[
  {...geometry.seams[0],atKnot:4},geometry.seams[1],
]},0,'c'),/seam/);
let selected=['j1'],serial=0,snapshots=0,checks=0,
 sourceValid=true,reject='',created=[],removed=[],writes=[];
const nodes=new Map([
 ['a',Object.freeze({uuid:'a',source:true})],
 ['b',Object.freeze({uuid:'b',source:true})],
 ['c',Object.freeze({uuid:'c',source:true})],
]);
const sourceBefore=JSON.stringify([...nodes.entries()]);
const request=async(channel,method,arg)=>{
 assert.equal(channel,'scene');
 if(method==='query-component-has-script')return true;
 if(method==='execute-scene-script'){
   if(arg.method==='queryMultiJunctionJoinPlan')return plan();
   if(arg.method==='queryMultiJunctionJoinValid'){
     checks++;
     return sourceValid?{ok:true}:{ok:false,error:'Multi-Junction route source changed'};
   }
   if(arg.method==='refreshPreview')return {ok:true};
   throw Error('Unexpected scene script '+arg.method);
 }
 if(method==='create-node'){
   const id='created-'+(++serial),node={uuid:id,name:arg.name,
     parent:arg.parent,components:[]};
   created.push(node);nodes.set(id,node);return id;
 }
 if(method==='create-component'){
   const node=nodes.get(arg.uuid);assert(node);
   node.components.push(arg.component);return true;
 }
 if(method==='query-node'){
   const node=nodes.get(arg);assert(node);
   return {__comps__:node.components.map(type=>({
     type,value:type==='Splines.SplineKnot'?{
       mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},
       tangentOut:{type:'cc.Vec3'},
     }:{} }))};
 }
 if(method==='set-property'){
   assert.equal(arg.record,false,'One final snapshot, no per-field recording');
   assert(!['a','b','c'].includes(arg.uuid),'No source knot writes');
   const node=nodes.get(arg.uuid);assert(node);
   writes.push({uuid:arg.uuid,path:arg.path,value:arg.dump.value});
   if(reject==='write'&&arg.path.endsWith('tangentOut'))return false;
   node[arg.path]=arg.dump.value;return true;
 }
 if(method==='snapshot'){
   snapshots++;return reject==='snapshot'?false:true;
 }
 if(method==='remove-node'){
   assert.equal(arg.snapshot,false);
   removed.push(arg.uuid);
   nodes.delete(arg.uuid);return true;
 }
 throw Error('Unexpected Editor message '+method);
};
global.Editor={
 Selection:{getSelected:()=>selected.slice(),clear:()=>selected=[],
 select:(_,id)=>selected.push(id)},
 Message:{request},
};
const methods=require('../dist/main.js').methods;
(async()=>{
 let result=await methods.joinMultiJunctionRoute(0,'c');
 assert(result.ok,result.error);
 assert.equal(result.count,7);
 assert.equal(result.switchCount,2);
 assert.equal(snapshots,1);
 assert.deepEqual(selected,[result.root]);
 const root=created.find(x=>x.uuid===result.root);
 assert.equal(root.parent,'scene');
 assert.equal(root.name,'A (Route Joined)');
 const knots=created.filter(x=>x.parent===result.root);
 assert.equal(knots.length,7);
 assert.deepEqual(knots.map(k=>nodes.get(k.uuid).position.x),
 [0,5,10,15,20,25,30]);
 assert.equal(writes.filter(x=>x.path.endsWith('.mode')&&x.value===4).length,7);
 assert.equal(writes.filter(x=>x.path.endsWith('tangentIn')).length,7);
 assert.equal(writes.filter(x=>x.path.endsWith('tangentOut')).length,7);
 assert.deepEqual([...nodes.entries()].filter(([key])=>['a','b','c'].includes(key)),
 JSON.parse(sourceBefore));
 const made=created.length,originalSnapshots=snapshots;
 selected=['j1'];
 result=await methods.joinMultiJunctionRoute(0,'');
 assert(!result.ok);assert.equal(created.length,made);
 sourceValid=false;
 result=await methods.joinMultiJunctionRoute(0,'c');
 assert(!result.ok&&/changed/.test(result.error));
 assert.equal(created.length,made,'Stale guard aborts before writing');
 sourceValid=true;reject='write';
 const beforeRemove=removed.length;
 result=await methods.joinMultiJunctionRoute(0,'c');
 assert(!result.ok&&/tangentOut/.test(result.error));
 assert.equal(removed.length,beforeRemove+1,'Only new output removed');
 assert.equal(snapshots,originalSnapshots,'No snapshot on failed write');
 reject='snapshot';
 result=await methods.joinMultiJunctionRoute(0,'c');
 assert(!result.ok&&/snapshot/.test(result.error));
 assert.equal(removed.length,beforeRemove+2);
 assert.equal(snapshots,originalSnapshots+1);
 assert.deepEqual([...nodes.entries()].filter(([key])=>['a','b','c'].includes(key)),
 JSON.parse(sourceBefore));
 const inspector=require('../dist/contributions/inspector/Junction');
 assert(inspector.template.includes('spl-join-route'));
 assert(inspector.template.includes('spl-route-destination'));
 const manifest=require('../package.json').contributions.messages;
 assert.deepEqual(manifest['join-multi-junction-route'].methods,
 ['joinMultiJunctionRoute']);
 assert(checks>=4,'Guard checked before and during Editor transaction');
 console.log('MULTI-JUNCTION ROUTE EDITOR PASS: one spline, 2 seams, source isolation, rollback, one snapshot, menu action.');
})().catch(e=>{console.error(e);process.exitCode=1;});
