'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const math=require('../src/SplineKnotEditMath');
const matrix=[0,2,0,0, -3,0,0,0, 0,0,4,0, 10,20,30,1];
const frame=math.transformFrame(matrix);
const approx=(a,b)=>assert(Math.abs(a-b)<1e-8,String(a)+' != '+String(b));
const eqVec=(actual,expected)=>{for(const axis of ['x','y','z'])approx(actual[axis],expected[axis]);};
eqVec(frame.toWorld({x:1,y:2,z:3}),{x:4,y:22,z:42});
eqVec(frame.toLocal({x:4,y:22,z:42}),{x:1,y:2,z:3});
eqVec(frame.toLocal(frame.toWorld({x:1.25,y:-.375,z:17})),{x:1.25,y:-.375,z:17});
const raw=[
 {uuid:'a',position:{x:1,y:0,z:0}},
 {uuid:'b',position:{x:0,y:1,z:0}},
 {uuid:'c',position:{x:1.1,y:1.12,z:3.3}},
];
const align=math.planKnotPositions(raw,['b','a'],'align',{axis:'x',space:'world'},0,matrix);
assert.deepEqual(align.map(e=>e.uuid),['b'],'World-X alignment may change local Y');
eqVec(align[0].after,{x:0,y:0,z:0});
const snap=math.planKnotPositions(raw,['c'],'snap',{step:1,space:'world'},0,matrix);
eqVec(snap[0].after,{x:1,y:1,z:3.25});
const moved=math.planKnotPositions(raw,['a'],'move',
 {delta:{x:3,y:0,z:-4},space:'world'},0,matrix);
eqVec(moved[0].after,{x:1,y:-1,z:-1});
const localMove=math.planKnotPositions(raw,['a'],'move',
 {delta:{x:2,y:-2,z:0},space:'local'},1);
eqVec(localMove[0].after,{x:3,y:-2,z:0});
assert.equal(math.planKnotPositions(raw,['a'],'move',
 {delta:{x:0,y:0,z:0},space:'local'},0).length,0);
assert.throws(()=>math.planKnotPositions(raw,['a'],'move',
 {delta:{x:0,y:0,z:1},space:'local'},1),/inactive 2D/);
assert.throws(()=>math.planKnotPositions(raw,['a'],'snap',
 {step:1,space:'world'},1,matrix),/only available for 3D/);
assert.throws(()=>math.planKnotPositions(raw,['a'],'align',
 {axis:'x',space:'global'},0,matrix),/Coordinate space/);
assert.throws(()=>math.planKnotPositions(raw,['a'],'move',
 {delta:{x:Infinity,y:0,z:0}},0),/Move delta/);
assert.throws(()=>math.transformFrame([...matrix.slice(0,12),10,20,30,0]),/Invalid affine/);
assert.throws(()=>math.transformFrame([0,0,0,0,...matrix.slice(4)]),/singular/);
assert.throws(()=>math.transformFrame([NaN,...matrix.slice(1)]),/Invalid affine/);

const state=raw.slice(0,2).map(k=>({uuid:k.uuid,position:{...k.position}}));
let current=['root'],dimension=0,snapshots=0,refreshes=0,queries=0,writes=0,fail=null;
global.Editor={
 Selection:{
  getSelected(){return [...current];},
  clear(){current=[];},
  select(_type,uuid){current.push(uuid);},
 },
 Message:{request:async (channel,method,arg)=>{
  assert.equal(channel,'scene');
  if(method==='execute-scene-script'){
   if(arg.method==='querySpline')return {found:true,rootUuid:'root',dimension,
    knots:state.map(k=>({uuid:k.uuid,position:{...k.position}}))};
   if(arg.method==='queryKnotEditFrame'){queries++;return {ok:true,matrix};}
   if(arg.method==='refreshPreview'){refreshes++;return {ok:true};}
   throw new Error('Unexpected scene method '+arg.method);
  }
  if(method==='set-property'){
   writes++;
   assert.equal(arg.path,'position');
   assert.equal(arg.record,false,'One snapshot for entire batch');
   assert.equal(arg.dump.type,'cc.Vec3');
   if(fail===arg.uuid){fail=null;return false;}
   state.find(k=>k.uuid===arg.uuid).position={...arg.dump.value};
   return true;
  }
  if(method==='snapshot'){snapshots++;return true;}
  throw new Error('Unexpected request '+method);
 }},
};
const methods=require(path.join(__dirname,'../dist/main.js')).methods;
(async()=>{
 let result=await methods.alignSelectedKnots(['b','a'],'x','world');
 assert(result.ok,result.error);
 assert.equal(result.count,1);
 assert.equal(snapshots,1);assert.equal(queries,1);
 eqVec(state[1].position,{x:0,y:0,z:0});
 result=await methods.moveSelectedKnots(['b','a'],{x:3,y:0,z:-4},'world');
 assert(result.ok,result.error);assert.equal(result.count,2);assert.equal(snapshots,2);
 eqVec(state[0].position,{x:1,y:-1,z:-1});
 eqVec(state[1].position,{x:0,y:-1,z:-1});
 result=await methods.moveSelectedKnots(['a','b'],{x:0,y:0,z:0},'world');
 assert(result.ok,result.error);assert.equal(result.changed,false);assert.equal(snapshots,2);
 const before=state.map(k=>({...k.position}));
 const saved=snapshots;fail='b';
 result=await methods.moveSelectedKnots(['a','b'],{x:2,y:0,z:0},'local');
 assert.equal(result.ok,false);assert.equal(snapshots,saved);
 state.forEach((k,i)=>eqVec(k.position,before[i]));
 const n=writes;
 result=await methods.moveSelectedKnots(['foreign'],{x:1,y:0,z:0},'local');
 assert.equal(result.ok,false);assert.equal(writes,n);
 dimension=1;
 result=await methods.snapSelectedKnots(['a'],1,'world');
 assert.equal(result.ok,false,'2D World mode must be explicitly rejected');
 const preserved=state.map(k=>({...k.position}));
 result=await methods.moveSelectedKnots(['a'],{x:0,y:0,z:1},'local');
 assert.equal(result.ok,false,'XY2D Local move cannot alter Z');
 state.forEach((k,i)=>eqVec(k.position,preserved[i]));
 result=await methods.moveSelectedKnots(['a'],{x:1,y:0,z:0},'local');
 assert(result.ok,result.error);assert.equal(state[0].position.z,preserved[0].z);
 const inspector=require(path.join(__dirname,'../dist/contributions/inspector/Container.js'));
 for(const marker of ['spl-coordinate-space','spl-move-x','spl-move-y','spl-move-z','spl-move-marked'])
  assert(inspector.template.includes(marker),'Missing UI field '+marker);
 assert(require('../package.json').contributions.messages['move-selected-knots']);
 console.log('PHASE 2.2 WORLD KNOTS PASS: nonuniform rotation, World align/snap/move, validation, rollback and 2D constraints.');
})().catch(error=>{console.error(error);process.exitCode=1;});
