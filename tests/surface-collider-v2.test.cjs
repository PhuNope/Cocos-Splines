'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');
const {snapColliderOrigins,upwardNormal}=require('../src/SplineColliderSnapMath');
const targetCollider={kind:'cc.TerrainCollider',enabled:true};
const anotherCollider={kind:'cc.BoxCollider',enabled:true};
const hit=(collider,y,startY,normal={x:0,y:1,z:0},x=0,z=0)=>({
 collider,hitPoint:{x,y,z},hitNormal:normal,distance:startY-y,
});
function mockResults(origin){
 return [
  hit(anotherCollider,4,origin.y,undefined,origin.x,origin.z),
  hit(targetCollider,2,origin.y,{x:0,y:-1,z:0},origin.x,origin.z),
 ];
}
const entries=[{uuid:'a',position:{x:0,y:6,z:0}},
 {uuid:'b',position:{x:3,y:7,z:2}}];
let rayCount=0;
let result=snapColliderOrigins(entries,[targetCollider],{height:1,maxDrop:10},
 (origin,depth)=>{rayCount++;assert.equal(depth,10);return mockResults(origin);});
assert.equal(rayCount,2);
assert.deepEqual(result.map(x=>x.position.y),[2,2],
 'An unrelated, closer Collider must never win');
assert(result.every(x=>!('normal' in x)),'Default collider snap only changes position');
result=snapColliderOrigins(entries,[targetCollider],{height:1,maxDrop:10,alignNormal:true},
 origin=>mockResults(origin));
assert.deepEqual(result[0].normal,{x:0,y:1,z:0},'Downward hit normal flips upward');
assert.deepEqual(upwardNormal({x:0,y:2,z:0}),{x:0,y:1,z:0});
assert.throws(()=>upwardNormal({x:1,y:0,z:0}),/steep/);
assert.throws(()=>upwardNormal({x:NaN,y:1,z:0}),/valid/);
assert.throws(()=>snapColliderOrigins(entries,[targetCollider],{
 alignNormal:true,smoothNormal:true},origin=>mockResults(origin)),/Smooth Normal/);
assert.throws(()=>snapColliderOrigins(entries,[targetCollider],{maxDrop:0},
 origin=>mockResults(origin)),/depth/);
assert.throws(()=>snapColliderOrigins(entries,[targetCollider],{},
 origin=>[hit(anotherCollider,2,origin.y)]),/No hit on the selected Collider/);
assert.throws(()=>snapColliderOrigins(entries,[targetCollider],{},origin=>{
 if(origin.x===3)return [];
 return mockResults(origin);
}),/Knot b/,'Any missing Knot hit aborts the entire batch');
assert.throws(()=>snapColliderOrigins(entries,[targetCollider],{alignNormal:true},origin=>[
 hit(targetCollider,2,origin.y,{x:0,y:0,z:0},origin.x,origin.z),
]),/zero hit normal/);
assert.throws(()=>snapColliderOrigins(entries,[targetCollider],{},origin=>[
 hit(targetCollider,2,origin.y,undefined,origin.x+3,origin.z),
]),/No hit/,'Reject ray hits whose X/Z mismatch the emitted ray');

function node(uuid,name){
 return {uuid,name,components:[],children:[],parent:null,worldMatrix:{
  m00:1,m01:0,m02:0,m03:0,m04:0,m05:1,m06:0,m07:0,
  m08:0,m09:0,m10:1,m11:0,m12:0,m13:0,m14:0,m15:1},
  rotation:{x:0,y:0,z:0,w:1},worldRotation:{x:0,y:0,z:0,w:1}};
}
const attach=(parent,child)=>{child.parent=parent;parent.children.push(child);return child;};
const scene= node('scene','Scene');
const spline=attach(scene,node('root','SplineContainer'));
spline.components.push({kind:'Splines.SplineContainer'});
const knotA=attach(spline,node('a','Knot A')),knotB=attach(spline,node('b','Knot B'));
knotA.components.push({kind:'Splines.SplineKnot'});
knotB.components.push({kind:'Splines.SplineKnot'});
const target=attach(scene,node('terrain','Terrain Ground'));
targetCollider.node=target;
target.components.push(targetCollider);
const other=attach(scene,node('interfering','Other Collider'));anotherCollider.node=other;
other.components.push(anotherCollider);
const owned=attach(spline,node('owned','Road collider'));
owned.components.push({kind:'cc.MeshCollider',enabled:true,node:owned});
const meshNode=attach(scene,node('both','Mesh + Collider'));
const meshPositions=new Float32Array([-5,2,-5,5,2,-5,-5,2,5]);
meshNode.components.push({kind:'cc.MeshRenderer',mesh:{
 allowDataAccess:true,isValid:true,struct:{primitives:[{}]},
 readAttribute(){return meshPositions;},readIndices(){return new Uint16Array([0,2,1]);},
 readAttributeFormat(){return {name:'RGB32F'};},
}});
const box={kind:'cc.BoxCollider',enabled:true,node:meshNode};
meshNode.components.push(box);
class Ray {
 constructor(x,y,z,dx,dy,dz){Object.assign(this,{x,y,z,dx,dy,dz});}
}
let physicsEnabled=true,physicsCalls=0;
const physics={
 raycast(ray,mask,depth,queryTrigger){
  assert.equal(mask,0xffffffff);assert.equal(queryTrigger,false);
  assert.equal(ray.dy,-1);assert.equal(ray.dx,0);assert.equal(ray.dz,0);
  physicsCalls++;
  if(!physicsEnabled)return false;
  this.raycastResults=[
    hit(anotherCollider,4,ray.y,undefined,ray.x,ray.z),
    hit(targetCollider,2,ray.y,{x:0,y:1,z:0},ray.x,ray.z),
  ];
  return true;
 },raycastResults:[],
};
const cc={director:{getScene:()=>scene},js:{getClassName:c=>c.kind},
 gfx:{AttributeName:{ATTR_POSITION:'a_position'}},
 PhysicsSystem:{instance:physics},geometry:{Ray},
};
const original=Module._load;
Module._load=function(name,parent,isMain){
 if(name==='cc')return cc;
 return original.apply(this,arguments);
};
try {
 const methods=require('../src/scene.js').methods;
 let targets=methods.listSurfaceTargets('root');
 assert(targets.ok,targets.error);
 assert.deepEqual(targets.targets.map(x=>[x.uuid,x.kind]),
  [['terrain','collider'],['interfering','collider'],['both','mesh'],['both','collider']],
  'Return explicit Mesh and Collider choices, exclude owned road collider');
 assert(!methods.listSurfaceTargets('unknown').ok);
 let snap=methods.snapToSurfaceTarget('root','terrain',entries,
  {kind:'collider',height:1,maxDrop:10,alignNormal:true});
 assert(snap.ok,snap.error);
 assert.equal(snap.source,'collider');
 assert.equal(physicsCalls,2);
 assert.deepEqual(snap.hits.map(x=>x.position.y),[2,2]);
 assert.deepEqual(snap.hits[0].normal,{x:0,y:1,z:0});
 snap=methods.snapToSurfaceTarget('root','terrain',entries,
  {kind:'collider',height:1,maxDrop:10,alignNormal:true,smoothNormal:true});
 assert(!snap.ok);assert.match(snap.error,/Smooth Normal/);
 snap=methods.snapToSurfaceTarget('root','owned',entries,{kind:'collider'});
 assert(!snap.ok,'Cannot raycast own procedural spline mesh');
 snap=methods.snapToSurfaceTarget('root','terrain',entries,{kind:'mesh'});
 assert(!snap.ok,'No implicit switch to Collider when MeshRenderer is absent');
 snap=methods.snapToSurfaceTarget('root','both',entries,{kind:'collider'});
 assert(!snap.ok,'Explicitly chosen BoxCollider must not hit unrelated Terrain');
 snap=methods.snapToSurfaceTarget('root','terrain',entries,{kind:'unknown'});
 assert(!snap.ok,'Unknown kind must be rejected');
 physicsEnabled=false;
 snap=methods.snapToSurfaceTarget('root','terrain',entries,{kind:'collider'});
 assert(!snap.ok&&/No hit/.test(snap.error),'Physics raycast without hits must fail closed');
 physicsEnabled=true;
 const old=cc.PhysicsSystem;
 cc.PhysicsSystem=null;
 snap=methods.snapToSurfaceTarget('root','terrain',entries,{kind:'collider'});
 assert(!snap.ok&&/Physics/.test(snap.error));
 cc.PhysicsSystem=old;
 console.log('COLLIDER SCENE CONTRACT PASS: TerrainCollider, mesh/collider choice, exact target filtering and fail-closed.');
} finally {Module._load=original;}

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const records=[{uuid:'a',position:{x:0,y:6,z:0}},
 {uuid:'b',position:{x:3,y:7,z:2}}];
let writes=0,snapshots=0,lastOptions=null,rollbacks=0,fail=null;
global.Editor={
 Selection:{getSelected:()=>['root']},
 Message:{request:async(channel,method,payload)=>{
  assert.equal(channel,'scene');
  if(method==='execute-scene-script'){
   if(payload.method==='querySpline')return {found:true,rootUuid:'root',dimension:0,
    knots:records.map(x=>({uuid:x.uuid,position:{...x.position}}))};
   if(payload.method==='queryKnotEditFrame')return {ok:true,matrix:identity};
   if(payload.method==='snapToSurfaceTarget'){
    lastOptions=payload.args[3];
    try {
     return {ok:true,hits:snapColliderOrigins(payload.args[2],[targetCollider],
      lastOptions,origin=>mockResults(origin))};
    }catch(error){return {ok:false,error:error.message};}
   }
   if(payload.method==='refreshPreview')return {ok:true};
   throw Error('Unexpected Scene method '+payload.method);
  }
  if(method==='set-property'){
   assert.equal(payload.record,false);assert.equal(payload.path,'position');
   writes++;
   if(payload.uuid===fail){fail=null;return false;}
   const x=records.find(r=>r.uuid===payload.uuid);
   if(x.position.y===2)rollbacks++;
   x.position={...payload.dump.value};
   return true;
  }
  if(method==='snapshot'){snapshots++;return true;}
  throw Error('Unexpected Editor method '+method);
 }},
};
const main=require(path.join(__dirname,'../dist/main.js')).methods;
(async()=>{
 let r=await main.snapSelectedToSurface(['a','b'],'terrain',1,10,false,false,60,'collider');
 assert(r.ok,r.error);assert.equal(writes,2);assert.equal(snapshots,1);
 assert.equal(lastOptions.kind,'collider');
 assert.deepEqual(records.map(k=>k.position.y),[2,2]);
 r=await main.snapSelectedToSurface(['a','b'],'terrain',1,10,true,true,60,'collider');
 assert(!r.ok);assert.equal(writes,2);assert.equal(snapshots,1);
 records[0].position.y=6;records[1].position.y=7;
 fail='b';const before=records.map(x=>({...x.position}));
 r=await main.snapSelectedToSurface(['a','b'],'terrain',1,10,false,false,60,'collider');
 assert(!r.ok);assert.equal(snapshots,1);
 assert.deepEqual(records.map(k=>k.position),before,'Partial writes restore all positions');
 const inspector=require('../dist/contributions/inspector/Container.js');
 assert(inspector.template.includes('spl-surface-target'));
 const inspectorSource=require('node:fs').readFileSync(
  path.join(__dirname,'../src/contributions/inspector/Container.js'),'utf8');
 assert(inspectorSource.includes("startsWith('collider:')"),
  'Target kind detection must live in the Inspector controller');
 const packageInfo=require('../package.json');
 assert(packageInfo.contributions.messages['list-surface-targets']);
 assert(!packageInfo.contributions.messages['list-surface-meshes']);
 console.log('COLLIDER EDITOR PASS: target kind selection, atomic batch, smoothing guard and rollback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
