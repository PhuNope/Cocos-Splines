'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {prepareSurface,snapOrigins,triangleUpNormal}=require('../src/SplineSurfaceSnapMath');
const {alignLocalRotationToNormal,quaternionChanged,planSurfaceKnotPositions}=
    require('../src/SplineKnotEditMath');
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const Q={x:0,y:0,z:0,w:1};
const plane=prepareSurface([0,0,0,10,0,0,0,0,10],[0,1,2],I);
const flat=snapOrigins(plane,[{uuid:'flat',position:{x:2,y:4,z:2}}],
 {height:0,maxDrop:10,alignNormal:true})[0];
assert.deepEqual(flat.normal,{x:0,y:1,z:0},'Ignore inverted triangle winding');
assert(!quaternionChanged(alignLocalRotationToNormal(Q,Q,flat.normal),Q));
const slope=prepareSurface([0,0,0,10,0,0,0,10,10],[0,1,2],I);
const hits=snapOrigins(slope,[{uuid:'a',position:{x:2,y:2,z:2}},
 {uuid:'b',position:{x:4,y:5,z:2}}],{height:1,maxDrop:30,alignNormal:true});
const almost=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' != '+b);
const eqVec=(a,b)=>{for(const axis of ['x','y','z'])almost(a[axis],b[axis]);};
function rotate(q,v){
 const u={x:q.x,y:q.y,z:q.z};
 const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
 const a=cross(u,v),b=cross(u,a);
 return {x:v.x+2*(q.w*a.x+b.x),y:v.y+2*(q.w*a.y+b.y),z:v.z+2*(q.w*a.z+b.z)};
}
const aligned=alignLocalRotationToNormal(Q,Q,hits[0].normal);
eqVec(rotate(aligned,{x:0,y:1,z:0}),hits[0].normal);
assert(rotate(aligned,{x:0,y:0,z:1}).z>0,'Preserve heading in surface plane');
const yaw={x:0,y:Math.sin(Math.PI/4),z:0,w:Math.cos(Math.PI/4)};
const localAligned=alignLocalRotationToNormal(Q,yaw,hits[0].normal);
const multiply=(a,b)=>({
 x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
 y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
 z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,
 w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z,
});
eqVec(rotate(multiply(yaw,localAligned),{x:0,y:1,z:0}),hits[0].normal);
assert(!quaternionChanged(Q,{x:0,y:0,z:0,w:-1}),'Quaternion sign is equivalent');
assert.throws(()=>alignLocalRotationToNormal(Q,Q,{x:1,y:0,z:0}),/steep/);
assert.throws(()=>alignLocalRotationToNormal(Q,Q,{x:NaN,y:1,z:0}),/finite/);
assert.throws(()=>alignLocalRotationToNormal({x:0,y:0,z:0,w:0},Q,{x:0,y:1,z:0}),/zero quaternion/);
const normals=snapOrigins(slope,[{uuid:'a',position:{x:2,y:2,z:2}}],
 {alignNormal:true})[0];
assert(normals.normal.y>0,'Slope normal is upward');
const knot=[{uuid:'a',position:{x:2,y:2,z:2},rotation:Q},
 {uuid:'b',position:{x:4,y:5,z:2},rotation:Q}];
const moves=planSurfaceKnotPositions(knot,['b','a'],hits,I,true,Q);
assert.deepEqual(moves.map(e=>e.uuid),['a','b']);
assert.equal(moves[0].positionChanged,false);
assert.equal(moves[0].rotationChanged,true,'Normal-only edits are not discarded');
assert.equal(moves[1].positionChanged,true);
assert.equal(moves[1].rotationChanged,true);
assert.deepEqual(planSurfaceKnotPositions(knot,['a'],hits.slice(0,1),I)
    .map(e=>e.uuid),[],'Default behavior remains unchanged when normal alignment is off');
assert.throws(()=>planSurfaceKnotPositions(knot,['a'],[{uuid:'a',position:hits[0].position}],
 I,true,Q),/missing a finite normal/);

const state=knot.map(k=>({uuid:k.uuid,position:{...k.position},rotation:{...Q}}));
let snapshots=0,positionWrites=0,rotationWrites=0,failed=null;
global.Editor={
 Selection:{getSelected:()=>['root']},
 Message:{request:async (channel,method,payload)=>{
  assert.equal(channel,'scene');
  if(method==='execute-scene-script'){
   if(payload.method==='querySpline')return {found:true,rootUuid:'root',dimension:0,
    knots:state.map(k=>({uuid:k.uuid,position:{...k.position}}))};
   if(payload.method==='queryKnotEditFrame')return {ok:true,matrix:I};
   if(payload.method==='queryKnotOrientations')return {ok:true,parentRotation:Q,
    rotations:state.map(k=>({uuid:k.uuid,rotation:{...k.rotation}}))};
   if(payload.method==='snapToSurfaceTarget'){
     try{return {ok:true,hits:snapOrigins(slope,payload.args[2],payload.args[3])};}
     catch(e){return {ok:false,error:e.message};}
   }
   if(payload.method==='refreshPreview')return {ok:true};
   throw Error('Unexpected Scene method: '+payload.method);
  }
  if(method==='set-property'){
   assert.equal(payload.record,false);
   if(payload.path==='rotation'){rotationWrites++;assert.equal(payload.dump.type,'cc.Quat');}
   else {positionWrites++;assert.equal(payload.path,'position');}
   if(payload.uuid===failed&&payload.path==='rotation'){failed=null;return false;}
   const target=state.find(x=>x.uuid===payload.uuid);
   target[payload.path]={...payload.dump.value};
   return true;
  }
  if(method==='snapshot'){snapshots++;return true;}
  throw Error('Unexpected Editor request: '+method);
 }},
};
const methods=require(path.join(__dirname,'../dist/main.js')).methods;
(async()=>{
 let r=await methods.snapSelectedToSurface(['a','b'],'mesh',1,30,true);
 assert(r.ok,r.error);assert.equal(r.count,2);
 assert.equal(positionWrites,1,'Only actual position edits are written');
 assert.equal(rotationWrites,2,'Both normals cause rotation edits');
 assert.equal(snapshots,1,'One snapshot for combined position/rotation batch');
 eqVec(state[0].position,{x:2,y:2,z:2});
 eqVec(rotate(state[0].rotation,{x:0,y:1,z:0}),hits[0].normal);
 eqVec(state[1].position,{x:4,y:2,z:2});
 r=await methods.snapSelectedToSurface(['a','b'],'mesh',1,30,true);
 assert(r.ok,r.error);assert.equal(r.changed,false);
 assert.equal(snapshots,1,'No-op does not snapshot');
 // Reset to tilted original before inducing partial write failure.
 state[0].rotation={...Q};
 state[1].rotation={...Q};
 state[1].position={x:4,y:5,z:2};
 const original=state.map(k=>({position:{...k.position},rotation:{...k.rotation}}));
 failed='b';
 r=await methods.snapSelectedToSurface(['a','b'],'mesh',1,30,true);
 assert(!r.ok,'Second Knot rotation failure propagates');
 assert.equal(snapshots,1,'Failed batch must not snapshot');
 state.forEach((k,i)=>{
  assert.deepEqual(k.position,original[i].position,'Position rollback');
  assert.deepEqual(k.rotation,original[i].rotation,'Rotation rollback');
 });
 const writes=rotationWrites;
 r=await methods.snapSelectedToSurface(['a'],'mesh',1,30,false);
 assert(r.ok);
 assert.equal(rotationWrites,writes,'Default Snap must never touch Knot rotation');
 const inspector=require('../dist/contributions/inspector/Container.js');
 assert(inspector.template.includes('spl-surface-align-normal'));
 console.log('SURFACE NORMAL V2 PASS: normal/up orientation, world parent heading, rotation-only batch, rollback.');
})().catch(err=>{console.error(err);process.exitCode=1;});
