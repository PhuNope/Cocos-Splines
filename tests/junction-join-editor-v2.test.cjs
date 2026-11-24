'use strict';
const assert=require('node:assert/strict');
const v=(x=0,y=0,z=0)=>({x,y,z}),quat={x:0,y:0,z:0,w:1};
const {planJunctionJoin}=require('../dist/SplineJunctionJoinMath');
const m=(tx=0)=>[1,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const knots=(lo)=>[lo,lo+5,lo+10].map(x=>({
 position:v(x),tangentIn:v(-1),tangentOut:v(1)}));
const a={matrix:m(0),knots:knots(0),progress:1,reversed:false,dimension:0};
const b={matrix:m(10),knots:knots(0),progress:0,reversed:false,dimension:0};
const geo=planJunctionJoin(a,b);
const plan=()=>({ok:true,...geo,
 parentUuid:'scene',rootTransform:{position:v(0),rotation:{...quat},scale:v(1,1,1)},
 sourceName:'A',samplesPerCurve:32,
 containerAppearance:{showGizmos:true,showTangentGizmos:false,gizmoSteps:16},
 guard:'guard-1',junctionUuid:'junction',anchorSplineUuid:'source-a',
 targetSplineUuid:'source-b',anchorIndex:0,targetIndex:1,
});
const sourceState=JSON.stringify({a,b});
const nodes=new Map([['source-a',Object.freeze({name:'source-a'})],
 ['source-b',Object.freeze({name:'source-b'})]]);
let selection=['junction'],serial=0,snapshots=0,removed=[],writes=[],created=[],
 checks=0,valid=true,planErr=null,rejectPath=null,rejectSnapshot=false,
 switched=false;
const request=async(channel,method,arg)=>{
 assert.equal(channel,'scene');
 if(method==='query-component-has-script')return true;
 if(method==='execute-scene-script'){
   if(arg.method==='queryJunctionJoinPlan')return planErr?{ok:false,error:planErr}:plan();
   if(arg.method==='queryJunctionJoinValid'){
      checks++;
      return valid?{ok:true}:{ok:false,error:'Junction or Scene changed'};
   }
   if(arg.method==='refreshPreview')return {ok:true};
   throw Error('Unknown scene script '+arg.method);
 }
 if(method==='create-node'){
   const uuid='generated-'+(++serial);
   nodes.set(uuid,{uuid,name:arg.name,parent:arg.parent,components:[]});
   created.push({uuid,name:arg.name,parent:arg.parent});
   return uuid;
 }
 if(method==='create-component'){
   const node=nodes.get(arg.uuid);
   assert(node,'No generated node: '+arg.uuid);
   node.components.push(arg.component);return true;
 }
 if(method==='query-node'){
   const node=nodes.get(arg);assert(node);
   return {__comps__:node.components.map(type=>({type,
     value:type==='Splines.SplineKnot'?{
       mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},
       tangentOut:{type:'cc.Vec3'},
     }:{}}))};
 }
 if(method==='set-property'){
   assert.equal(arg.record,false);
   assert(!['source-a','source-b'].includes(arg.uuid),
     'Source prefabs/knots must never be written');
   const node=nodes.get(arg.uuid);assert(node);
   writes.push({uuid:arg.uuid,path:arg.path,type:arg.dump.type,value:arg.dump.value});
   if(rejectPath&&arg.path.endsWith(rejectPath))return false;
   node[arg.path]=arg.dump.value;return true;
 }
 if(method==='snapshot'){snapshots++;return rejectSnapshot?false:true;}
 if(method==='remove-node'){
   assert.equal(arg.snapshot,false);
   removed.push(arg.uuid);nodes.delete(arg.uuid);return true;
 }
 throw Error('Unknown IPC '+method);
};
global.Editor={
 Selection:{getSelected:()=>selection.slice(),clear:()=>selection=[],
   select:(_,id)=>selection.push(id)},
 Message:{request},
};
const {methods}=require('../dist/main.js');
const reset=()=>{selection=['junction'];valid=true;planErr=null;
 rejectPath=null;rejectSnapshot=false;checks=0;};
(async()=>{
 let result=await methods.joinJunctionLinks(0,1);
 assert(result.ok,result.error);
 assert.equal(result.count,5);
 assert.equal(snapshots,1);
 assert.deepEqual(selection,[created[0].uuid]);
 assert.equal(created.length,6,'One fresh Container and five Knots');
 const root=created[0].uuid;
 assert.equal(created[0].parent,'scene');
 assert(created.slice(1).every(x=>x.parent===root));
 assert.deepEqual(created.slice(1).map(x=>nodes.get(x.uuid).position.x),
   [0,5,10,15,20]);
 assert(writes.some(w=>w.uuid===root&&w.path==='__comps__.0.closed'&&w.value===false));
 assert(writes.some(w=>w.uuid===root&&w.path==='__comps__.0.reversed'&&w.value===false));
 assert(writes.some(w=>w.uuid===root&&w.path==='__comps__.0.showGizmos'&&w.value===true));
 assert.equal(writes.filter(w=>w.path.endsWith('tangentIn')).length,5);
 assert.equal(writes.filter(w=>w.path.endsWith('tangentOut')).length,5);
 assert.equal(writes.filter(w=>w.path.endsWith('.mode')&&w.value===4).length,5);
 assert.equal(JSON.stringify({a,b}),sourceState);
 const previous=created.length,snapBefore=snapshots;
 reset();planErr='Separated links; Snap before Join';
 result=await methods.joinJunctionLinks(0,1);
 assert(!result.ok&&/Snap/.test(result.error));
 assert.equal(created.length,previous,'Invalid planning must create no nodes');
 reset();valid=false;
 result=await methods.joinJunctionLinks(0,1);
 assert(!result.ok&&/changed/.test(result.error));
 assert.equal(created.length,previous,'Stale guard must reject before create');
 reset();rejectPath='tangentOut';
 let removedBefore=removed.length;
 result=await methods.joinJunctionLinks(0,1);
 assert(!result.ok&&/Cannot set tangentOut/.test(result.error));
 assert.equal(removed.length,removedBefore+1,'Partial source-independent Join cleanup');
 assert.equal(snapshots,snapBefore,'Rejected field must not snapshot');
 assert.equal(JSON.stringify({a,b}),sourceState);
 reset();rejectSnapshot=true;
 removedBefore=removed.length;
 result=await methods.joinJunctionLinks(0,1);
 assert(!result.ok&&/snapshot/.test(result.error));
 assert.equal(removed.length,removedBefore+1);
 assert.equal(snapshots,snapBefore+1,'Failed snapshot still attempted exactly once');
 reset();
 result=await methods.joinJunctionLinks(0,0);
 assert(!result.ok&&/different/.test(result.error));
 assert.equal(JSON.stringify({a,b}),sourceState);
 const inspector=require('../dist/contributions/inspector/Junction');
 assert(inspector.template.includes('spl-join-connector'));
 const manifest=require('../package.json').contributions.messages;
 assert.deepEqual(manifest['join-junction-links'].methods,['joinJunctionLinks']);
 console.log('JUNCTION JOIN EDITOR PASS: independent root, one seam, one snapshot, no source writes, invalid/stale guards, cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
