'use strict';
const assert=require('node:assert/strict');
const math=require('../src/SplineKnotEditMath');
const p=(x,y,z)=>({x,y,z});
const raw=[
 {uuid:'c',position:p(10,2,9)},
 {uuid:'a',position:p(0,4,8)},
 {uuid:'b',position:p(1,6,7)},
 {uuid:'d',position:p(2,8,6)},
 {uuid:'untouched',position:p(100,100,100)},
];
const ids=['b','d','a','c'];
const plan=(knots=raw,selected=ids,axis='x',space='local',dim=0,matrix=null)=>
 math.planKnotPositions(knots,selected,'distribute',{axis,space},dim,matrix);
const local=plan();
assert.deepEqual(local.map(e=>e.uuid),['b','d']);
assert(Math.abs(local[0].after.x-10/3)<1e-8);
assert(Math.abs(local[1].after.x-20/3)<1e-8);
assert.deepEqual(local.map(e=>[e.after.y,e.after.z]),[[6,7],[8,6]]);
assert.deepEqual(plan(raw,[...ids].reverse()),local);
assert.equal(raw[2].position.x,1,'Planner never mutates input');
assert.deepEqual(plan(raw,ids,'x','local',1),local);
assert.deepEqual(plan(raw,ids,'x','local',2),local);
assert.throws(()=>plan(raw,ids,'z','local',1),/not active/);
assert.throws(()=>plan(raw,ids,'y','local',2),/not active/);
assert.throws(()=>plan(raw,ids.slice(0,2)),/at least three/);
assert.throws(()=>plan(raw,['a','a','c']),/Duplicate/);
assert.throws(()=>plan(raw,['a','b','foreign']),/belong/);
const matrix=[0,2,0,0,-3,0,0,0,0,0,4,0,10,20,30,1];
const frame=math.transformFrame(matrix);
const world=plan(raw,ids,'y','world',0,matrix);
assert.equal(world.length,2);
for(const e of world){
 const before=frame.toWorld(e.before),after=frame.toWorld(e.after);
 assert(Math.abs(before.x-after.x)<1e-8);
 assert(Math.abs(before.z-after.z)<1e-8);
 assert(Math.abs(after.y-(e.uuid==='b'?20+20/3:20+40/3))<1e-8);
}
assert.throws(()=>plan(raw,ids,'x','world',1,matrix),/only available for 3D/);
const ties=[{uuid:'a',position:p(0,0,0)},{uuid:'b',position:p(0,1,0)},{uuid:'c',position:p(9,2,0)}];
assert.deepEqual(plan(ties,['c','b','a'])[0].after,p(4.5,1,0));
assert.deepEqual(plan(ties.map(k=>({...k,position:p(2,1,0)})),['a','b','c']),[]);
const state=raw.map(k=>({uuid:k.uuid,position:{...k.position}}));
let snapshots=0,refreshes=0,writes=0,fail=null,dimension=0;
global.Editor={Selection:{getSelected:()=>['root']},Message:{request:async(channel,method,arg)=>{
 assert.equal(channel,'scene');
 if(method==='execute-scene-script'){
  if(arg.method==='querySpline')return {found:true,rootUuid:'root',dimension,knots:state.map(k=>({uuid:k.uuid,position:{...k.position}}))};
  if(arg.method==='queryKnotEditFrame')return {ok:true,matrix};
  if(arg.method==='queryKnotBatchState')return {ok:true,states:arg.args[1].map(uuid=>{
   const node=state.find(k=>k.uuid===uuid);
   return {uuid,position:{...node.position},rotation:{x:0,y:0,z:0,w:1}};
  })};
  if(arg.method==='refreshPreview'){refreshes++;return {ok:true};}
  throw Error('Unexpected Scene method '+arg.method);
 }
 if(method==='set-property'){
  writes++;assert.equal(arg.record,false);assert.equal(arg.path,'position');assert.equal(arg.dump.type,'cc.Vec3');
  if(fail===arg.uuid){fail=null;return false;}
  state.find(k=>k.uuid===arg.uuid).position={...arg.dump.value};return true;
 }
 if(method==='snapshot'){snapshots++;return true;}
 throw Error('Unexpected request '+method);
}}};
const methods=require('../dist/main.js').methods;
(async()=>{
 let result=await methods.distributeSelectedKnots(ids,'x','local');
 assert(result.ok,result.error);assert.equal(result.count,2);assert.equal(snapshots,1);assert.equal(refreshes,1);
 assert.deepEqual(state[0].position,raw[0].position);
 assert.deepEqual(state[1].position,raw[1].position);
 assert.deepEqual(state[4].position,raw[4].position);
 result=await methods.distributeSelectedKnots(ids,'x','local');
 assert(result.ok,result.error);assert.equal(result.changed,false);assert.equal(snapshots,1);
 const before=raw.map(k=>({...k.position}));state.forEach((k,i)=>k.position={...before[i]});
 fail='d';result=await methods.distributeSelectedKnots(ids,'y','world');
 assert.equal(result.ok,false);assert.equal(snapshots,1);
 assert.deepEqual(state.map(k=>k.position),before);
 const count=writes;dimension=2;
 result=await methods.distributeSelectedKnots(ids,'y','local');
 assert.equal(result.ok,false);assert.equal(writes,count);
 const inspector=require('../dist/contributions/inspector/Container.js');
 assert(inspector.template.includes('spl-distribute-marked'));
 assert(require('../package.json').contributions.messages['distribute-selected-knots']);
 console.log('DISTRIBUTE KNOTS PASS: axis spacing, fixed extremes, stable ties, Local/World, 2D locks, one snapshot and rollback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
