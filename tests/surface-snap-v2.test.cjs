'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {prepareSurface,castDown,snapOrigins,MAX_TRIANGLES}=require('../src/SplineSurfaceSnapMath');
const {planSurfaceKnotPositions}=require('../src/SplineKnotEditMath');
const ID=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const plane=[-5,2,-5, 5,2,-5, -5,2,5, 5,2,5];
const faces=[0,2,1,1,2,3];
const surface=prepareSurface(plane,faces,ID);
assert.equal(surface.triangleCount,2);
let hit=castDown(surface,{x:0,y:3,z:0},10,50);
assert(hit);assert.equal(hit.y,2);
assert.equal(castDown(surface,{x:9,y:3,z:0}),null,'Outside projected mesh footprint');
assert.equal(castDown(surface,{x:0,y:3,z:0},0,.1),null,'Range limit prevents distant snapping');
assert.equal(castDown(surface,{x:0,y:0,z:0},0,10),null,'Downward-only cast does not hit surface above origin');
assert.equal(castDown(surface,{x:-5,y:3,z:5},10,50).y,2,'Edge inclusive');
const stacked=prepareSurface([...plane,...plane.map((x,i)=>i%3===1?x+4:x)],
 [0,2,1,1,2,3,4,6,5,5,6,7],ID);
assert.equal(castDown(stacked,{x:1,y:4,z:1},10,50).y,6,'Nearest surface below start wins');
const slope=prepareSurface([0,0,0,10,0,0,0,10,10],[0,1,2],ID);
assert.equal(castDown(slope,{x:2,y:8,z:2},0,20).y,2,'Barycentric Y follows sloped surface');
const sceneMatrix=[2,0,0,0,0,1.5,0,0,0,0,3,0,10,1,-5,1];
const transformed=prepareSurface(plane,faces,sceneMatrix);
assert.equal(castDown(transformed,{x:10,y:10,z:-5},0,20).y,4,'World transforms are applied before casting');
assert.throws(()=>prepareSurface(plane,[0,2,12],ID),/indices/);
assert.throws(()=>prepareSurface(plane,faces,[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]),/world transform/);
assert.throws(()=>prepareSurface([NaN,...plane.slice(1)],faces,ID),/Invalid/);
assert.throws(()=>prepareSurface(plane,Array(MAX_TRIANGLES*3+3).fill(0),ID),/20,000/);
assert.throws(()=>snapOrigins(surface,[{uuid:'a',position:{x:0,y:3,z:0}},
 {uuid:'b',position:{x:20,y:3,z:0}}]),/No surface directly below/);
assert.throws(()=>snapOrigins(surface,[{uuid:'a',position:{x:0,y:3,z:0}},
 {uuid:'a',position:{x:0,y:4,z:0}}]),/distinct/);
const hits=snapOrigins(surface,[{uuid:'b',position:{x:1,y:4,z:1}},
 {uuid:'a',position:{x:0,y:4,z:0}}]);
assert.deepEqual(hits.map(h=>h.uuid),['b','a']);
const knots=[{uuid:'a',position:{x:0,y:4,z:0}},{uuid:'b',position:{x:1,y:4,z:1}}];
const move=planSurfaceKnotPositions(knots,['b','a'],hits,ID);
assert.deepEqual(move.map(e=>e.uuid),['a','b']);
assert(move.every(e=>e.after.y===2));
const inverse=planSurfaceKnotPositions([{uuid:'a',position:{x:1,y:7,z:1}}],
 ['a'],[{uuid:'a',position:{x:12,y:4,z:-2}}],sceneMatrix);
assert.deepEqual(inverse[0].after,{x:1,y:2,z:1});
assert.throws(()=>planSurfaceKnotPositions(knots,['a','b'],hits.slice(0,1),ID),/exactly one/);
assert.throws(()=>planSurfaceKnotPositions(knots,['a','b'],
 [{uuid:'a',position:{x:0,y:2,z:0}},{uuid:'foreign',position:{x:1,y:2,z:1}}],ID),/match/);

const state=knots.map(k=>({uuid:k.uuid,position:{...k.position}}));
let selection=['root'],dimension=0,writeCount=0,snapshotCount=0,refreshCount=0;
let failUuid=null,sceneFail=false;
global.Editor={
 Selection:{getSelected(){return selection;},clear(){selection=[];},
  select(_t,id){selection.push(id);}},
 Message:{request:async (channel,method,payload)=>{
  assert.equal(channel,'scene');
  if(method==='execute-scene-script'){
   if(payload.method==='querySpline')return {found:true,rootUuid:'root',dimension,
      knots:state.map(k=>({uuid:k.uuid,position:{...k.position}}))};
   if(payload.method==='queryKnotEditFrame')return {ok:true,matrix:ID};
   if(payload.method==='listSurfaceTargets')return {ok:true,targets:[{uuid:'mesh',name:'Ground',kind:'mesh'}]};
   if(payload.method==='snapToSurfaceTarget'){
      assert.equal(payload.args[0],'root');
      assert.equal(payload.args[1],'mesh');
      if(sceneFail)return {ok:false,error:'No surface directly below a Knot'};
      try{return {ok:true,hits:snapOrigins(surface,payload.args[2],payload.args[3])};}
      catch(error){return {ok:false,error:error.message};}
   }
   if(payload.method==='refreshPreview'){refreshCount++;return {ok:true};}
   throw Error('Unexpected Scene method '+payload.method);
  }
  if(method==='set-property'){
   assert.equal(payload.path,'position');assert.equal(payload.record,false);
   writeCount++;
   if(payload.uuid===failUuid){failUuid=null;return false;}
   const item=state.find(k=>k.uuid===payload.uuid);item.position={...payload.dump.value};
   return true;
  }
  if(method==='snapshot'){snapshotCount++;return true;}
  throw Error('Unexpected request '+method);
 }},
};
const methods=require(path.join(__dirname,'../dist/main.js')).methods;
(async()=>{
 let result=await methods.listSurfaceTargets();
 assert(result.ok);assert.equal(result.targets[0].uuid,'mesh');
 result=await methods.snapSelectedToSurface(['b','a'],'mesh',10,50);
 assert(result.ok,result.error);assert.equal(result.count,2);
 assert.equal(snapshotCount,1);assert.equal(refreshCount,1);
 assert.deepEqual(state.map(k=>k.position.y),[2,2]);
 result=await methods.snapSelectedToSurface(['a','b'],'mesh',10,50);
 assert(result.ok);assert.equal(result.changed,false);assert.equal(snapshotCount,1);
 const before=state.map(k=>({...k.position})),beforeWrites=writeCount;
 result=await methods.snapSelectedToSurface(['a','foreign'],'mesh',10,50);
 assert(!result.ok);assert.equal(writeCount,beforeWrites);
 result=await methods.snapSelectedToSurface(['a'],'',10,50);
 assert(!result.ok);assert.equal(writeCount,beforeWrites);
 sceneFail=true;
 result=await methods.snapSelectedToSurface(['a','b'],'mesh',10,50);
 assert(!result.ok);assert.equal(writeCount,beforeWrites);
 sceneFail=false;
 state[0].position.y=6;state[1].position.y=5;
 const current=state.map(k=>({...k.position})),saved=snapshotCount;
 failUuid='b';
 result=await methods.snapSelectedToSurface(['a','b'],'mesh',10,50);
 assert(!result.ok);assert.equal(snapshotCount,saved);
 state.forEach((k,i)=>assert.deepEqual(k.position,current[i]),'Partial failure must restore every Knot');
 dimension=1;
 result=await methods.snapSelectedToSurface(['a'],'mesh',10,50);
 assert(!result.ok);assert.equal(snapshotCount,saved,'2D must reject world mesh projection');
 const inspector=require('../dist/contributions/inspector/Container.js');
 for(const marker of ['spl-surface-target','spl-surface-refresh','spl-surface-height',
  'spl-surface-drop','spl-surface-snap'])
  assert(inspector.template.includes(marker),'Missing Inspector control '+marker);
 for(const name of ['list-surface-targets','snap-selected-to-surface'])
  assert(require('../package.json').contributions.messages[name]);
 const script=require('node:fs').readFileSync(path.join(__dirname,'../src/scene.js'),'utf8');
 assert(script.includes('function listSurfaceTargets(')&&script.includes('function snapToSurfaceTarget('));
 console.log('V2 SURFACE SNAP PASS: mesh raycast, highest hit, transformed mesh, all-or-nothing and rollback.');
})().catch(err=>{console.error(err);process.exitCode=1;});
