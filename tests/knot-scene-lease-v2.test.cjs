'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-scene-lease-'));
(async()=>{
try {
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
  '--noEmit','false','--outDir',dir]);
 const {captureSceneLease}=require(path.join(dir,'Editor/SplineGizmoSceneLease.js'));
 const {commitGroupPositions}=require(path.join(dir,'Editor/SplineGizmoGroupHistory.js'));
 const {commitKnotSerializedGesture}=require(path.join(dir,'Editor/SplineGizmoKnotHistory.js'));
 const scene=()=>({uuid:'shared-scene',parent:null,isValid:true});
 const make=()=>{
  const sceneNode=scene();
  const prefabRoot={uuid:'prefab-root',parent:sceneNode,isValid:true};
  const spline={uuid:'spline',parent:prefabRoot,isValid:true};
  const knotNode={uuid:'knot',parent:spline,isValid:true,
   position:{x:10,y:2,z:3},rotation:{x:0,y:0,z:0,w:1}};
  const Q={x:0,y:0,z:0,w:1},Q90={x:0,y:Math.SQRT1_2,z:0,w:Math.SQRT1_2};
  const target={node:knotNode,isValid:true,mode:4,
   tangentIn:{x:-1,y:0,z:0},tangentOut:{x:2,y:0,z:0},
   tangentInHandle:null,tangentOutHandle:null};
  const before={parent:spline,mode:0,inTangent:{x:-1,y:0,z:0},
   outTangent:{x:1,y:0,z:0},inHandle:null,outHandle:null,
   inHandleNode:null,outHandleNode:null,inHandleParent:null,outHandleParent:null,
   localRotation:{...Q}};
  const after={...before,mode:4,outTangent:{x:2,y:0,z:0}};
  const lease=captureSceneLease(spline);
  return {sceneNode,prefabRoot,spline,knotNode,target,before,after,
   lease,Q,Q90};
 };
 // The lease captures object identity, not an ambiguously reused UUID.
 let h=make();assert(h.lease.isCurrent());
 h.prefabRoot.__prefab={asset:'prefab-a',overrides:['position']};
 assert(h.lease.isCurrent(),'Prefab override metadata is never interpreted/mutated');
 const oldScene=h.sceneNode;
 h.prefabRoot.parent={uuid:'shared-scene',parent:null,isValid:true};
 assert(!h.lease.isCurrent(),'Replacing an ancestor invalidates old Scene even with same UUID');
 h.prefabRoot.parent=oldScene;assert(h.lease.isCurrent());
 oldScene.isValid=false;assert(!h.lease.isCurrent(),'Unloaded Scene invalidates the gesture');
 assert.throws(()=>captureSceneLease({parent:null,isValid:false}),/Invalid/);
 const cycle={parent:null,isValid:true};cycle.parent=cycle;
 assert.throws(()=>captureSceneLease(cycle),/cyclic/i);

 // Query-node resolves after a nested Prefab editing root was replaced:
 // no serializer set-property, no snapshot, no cross-Scene rollback.
 h=make();
 let completeQuery;const calls=[];
 const request=(channel,method,payload)=>{
  assert.equal(channel,'scene');
  calls.push(method);
  if(method==='query-node')
   return new Promise(resolve=>{completeQuery=resolve;});
  throw Error('Stale transaction may not call '+method);
 };
 const tangent=commitKnotSerializedGesture('editorTangentOut',
  h.target,h.before,h.after,request,()=>h.lease.isCurrent());
 assert.equal(calls[0],'query-node');
 h.prefabRoot.parent=scene();
 completeQuery({__comps__:[{type:'Splines.SplineKnot',value:{
  mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},tangentOut:{type:'cc.Vec3'},
 }}]});
 await assert.rejects(tangent,/Scene lease expired/i);
 assert.deepEqual(calls,['query-node']);

 // Scene is unloaded while the first set-property is pending. It must not
 // issue the next property, snapshot, or rollback against the new Scene.
 h=make();calls.length=0;
 let resumeWrite;
 const serialized=(channel,method,payload)=>{
  assert.equal(channel,'scene');calls.push(method);
  if(method==='set-property')
   return new Promise(resolve=>{resumeWrite=resolve;});
  throw Error('Late IPC must never send '+method);
 };
 const edits=[{node:h.knotNode,parent:h.spline,
  before:{x:0,y:2,z:3},after:{x:10,y:2,z:3}}];
 const inFlight=commitGroupPositions(edits,serialized,()=>h.lease.isCurrent());
 assert.deepEqual(calls,['set-property']);
 h.sceneNode.isValid=false;
 resumeWrite(true);
 await assert.rejects(inFlight,/lease expired/i);
 assert.deepEqual(calls,['set-property']);
 assert.equal(h.knotNode.position.x,10,'Do not restore old unloaded Scene Node');

 // Same protection for a simple Knot rotation, with an in-flight IPC.
 h=make();calls.length=0;
 h.knotNode.rotation={...h.Q90};
 const rotateAfter={...h.before,localRotation:{...h.Q90}};
 let resumeRotation;
 const writeRotation=(channel,method,payload)=>{
  assert.equal(channel,'scene');calls.push(method);
  if(method==='set-property')return new Promise(resolve=>{resumeRotation=resolve;});
  throw Error('No snapshot after Scene reload');
 };
 const rotate=commitKnotSerializedGesture('editorWorldEuler',
  h.target,h.before,rotateAfter,writeRotation,()=>h.lease.isCurrent());
 assert.deepEqual(calls,['set-property']);
 h.prefabRoot.parent=scene();
 resumeRotation(true);
 await assert.rejects(rotate,/lease expired/i);
 assert.deepEqual(calls,['set-property']);

 // The first write completes but the Scene is replaced while snapshot IPC
 // is outstanding: the request was sent to the ORIGINAL Scene only. When
 // its response arrives, no rollback may be sent to the newly open Scene.
 h=make();calls.length=0;
 let resolveSnapshot;
 const snapshotRequest=(channel,method,payload)=>{
  assert.equal(channel,'scene');calls.push(method);
  if(method==='set-property')return true;
  assert.equal(method,'snapshot');
  return new Promise(resolve=>{resolveSnapshot=resolve;});
 };
 const pending=commitGroupPositions([{
  node:h.knotNode,parent:h.spline,before:{x:1,y:2,z:3},
  after:{x:10,y:2,z:3},
 }],snapshotRequest,()=>h.lease.isCurrent());
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,['set-property','snapshot']);
 h.sceneNode.isValid=false;
 resolveSnapshot(true);
 await assert.rejects(pending,/lease expired/i);
 assert.deepEqual(calls,['set-property','snapshot'],
  'No serialized rollback after unloading the original Scene');

 // Valid native context retains previous snapshot/rollback semantics.
 h=make();calls.length=0;
 const good=(channel,method,payload)=>{
  assert.equal(channel,'scene');calls.push(method);
  if(method==='set-property'){
   h.knotNode.position={...payload.dump.value};
   return true;
  }
  assert.equal(method,'snapshot');return true;
 };
 await commitGroupPositions([{
  node:h.knotNode,parent:h.spline,before:{x:1,y:2,z:3},
  after:{x:10,y:2,z:3},
 }],good,()=>h.lease.isCurrent());
 assert.deepEqual(calls,['set-property','snapshot']);
 assert(h.lease.isCurrent());
 console.log('SCENE LEASE PASS: Scene replacement, nested prefab ancestor, delayed query/write/snapshot, no cross-Scene rollback.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
