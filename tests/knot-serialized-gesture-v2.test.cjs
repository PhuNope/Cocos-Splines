'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'knot-serialized-v2-'));
(async()=>{
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
  '--noEmit','false','--outDir',dir]);
 const {commitKnotSerializedGesture,sameQuat}=require(
  path.join(dir,'Editor/SplineGizmoKnotHistory.js'));
 const Q={x:0,y:0,z:0,w:1},Q90={x:0,y:Math.SQRT1_2,z:0,w:Math.SQRT1_2};
 const a={x:-1,y:0,z:0},b={x:1,y:0,z:0};
 const make=(options={})=>{
  const parent={uuid:'root'};
  const knotNode={uuid:'knot',isValid:true,parent,
   position:{x:5,y:6,z:7},rotation:{...Q}};
  const handleNode={uuid:'out-handle',isValid:true,parent:knotNode,
   position:{x:1,y:0,z:0},rotation:{...Q}};
  const knot={node:knotNode,isValid:true,mode:0,tangentIn:{...a},
   tangentOut:{...b},tangentInHandle:null,tangentOutHandle:null};
  const before={parent,mode:0,inTangent:{...a},outTangent:{...b},
   inHandle:null,outHandle:null,inHandleNode:null,outHandleNode:null,
   inHandleParent:null,outHandleParent:null,localRotation:{...Q}};
  let snapshots=0,query=0,failed=false;const calls=[];
  const request=async(channel,method,payload)=>{
   assert.equal(channel,'scene');
   if(method==='query-node'){
    query++;calls.push('query');
    if(options.noComponent)return {__comps__:[]};
    if(options.queryDelay){
     await options.queryDelay();
    }
    return {__comps__:[
     {type:'cc.MeshRenderer',value:{}},
     {type:'Splines.SplineKnot',value:{
      mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},tangentOut:{type:'cc.Vec3'},
     }},
    ]};
   }
   if(method==='snapshot'){
    snapshots++;calls.push('snapshot');
    if(options.rejectSnapshot)return false;
    if(options.throwSnapshot)throw Error('snapshot IPC error');
    return undefined;
   }
   assert.equal(method,'set-property');
   assert.equal(payload.record,false);
   calls.push(payload.uuid+':'+payload.path);
   assert(['Enum','cc.Vec3','cc.Quat'].includes(payload.dump.type));
   const value=payload.dump.value;
   const node=payload.uuid==='knot'?knotNode:handleNode;
   if(payload.path==='rotation')node.rotation={...value};
   else if(payload.path==='position')node.position={...value};
   else if(payload.path.startsWith('__comps__.1.')){
    const field=payload.path.split('.').at(-1);
    knot[field==='tangentIn'?'tangentIn':field==='tangentOut'?'tangentOut':'mode']=
     typeof value==='number'?value:{...value};
   }else throw Error('Unexpected serialized field '+payload.path);
   if(options.failPath===payload.path&&!failed){
    failed=true;
    if(options.throwWrite)throw Error('set-property failed after mutation');
    return false;
   }
   return true;
  };
  const capture=()=>({
   ...before,mode:knot.mode,inTangent:{...knot.tangentIn},
   outTangent:{...knot.tangentOut},localRotation:{...knotNode.rotation},
   inHandle:knot.tangentInHandle?{...knot.tangentInHandle.position}:null,
   outHandle:knot.tangentOutHandle?{...knot.tangentOutHandle.position}:null,
   inHandleNode:knot.tangentInHandle,outHandleNode:knot.tangentOutHandle,
   inHandleParent:knot.tangentInHandle?.parent||null,
   outHandleParent:knot.tangentOutHandle?.parent||null,
  });
  return {knot,knotNode,handleNode,parent,before,request,calls,capture,
   get snapshots(){return snapshots;},get query(){return query;}};
 };
 let h=make();h.knot.mode=4;h.knot.tangentIn={x:-2,y:0,z:0};
 h.knot.tangentOut={x:4,y:1,z:0};
 let result=await commitKnotSerializedGesture('editorTangentOut',
  h.knot,h.before,h.capture(),h.request);
 assert.equal(result,undefined);
 assert.equal(h.snapshots,1);
 assert.deepEqual(h.calls,[
  'query','knot:__comps__.1.mode','knot:__comps__.1.tangentIn',
  'knot:__comps__.1.tangentOut','snapshot']);
 assert.equal(h.knot.mode,4);

 h=make();h.knot.tangentOutHandle=h.handleNode;
 h.handleNode.position={x:1,y:4,z:2};
 const handlesBefore={...h.before,
  outHandle:{...b},outHandleNode:h.handleNode,outHandleParent:h.knotNode};
 result=await commitKnotSerializedGesture('editorTangentOut',
  h.knot,handlesBefore,h.capture(),h.request);
 assert.equal(result,undefined);
 assert.equal(h.query,0,'Handle-only edits do not need component query');
 assert.deepEqual(h.calls,['out-handle:position','snapshot']);
 assert.deepEqual(h.handleNode.position,{x:1,y:4,z:2});

 h=make();
 h.knotNode.rotation={...Q90};
 result=await commitKnotSerializedGesture('editorWorldEuler',h.knot,
  h.before,h.capture(),h.request);
 assert.deepEqual(h.calls,['knot:rotation','snapshot']);
 assert.equal(h.snapshots,1,'Rotation writes exactly one Node quaternion');
 assert(sameQuat(Q,{x:0,y:0,z:0,w:-1}));
 assert(!sameQuat(Q,Q90));
 // q and -q have identical rotation; no write needed.
 h=make();h.knotNode.rotation={x:0,y:0,z:0,w:-1};
 result=await commitKnotSerializedGesture('editorWorldEuler',h.knot,
  h.before,h.capture(),h.request);
 assert.equal(result,true);assert.deepEqual(h.calls,[]);

 for(const failure of [
  {failPath:'__comps__.1.tangentOut'},
  {failPath:'__comps__.1.tangentOut',throwWrite:true},
  {rejectSnapshot:true},{throwSnapshot:true},
 ]){
  h=make(failure);h.knot.mode=4;h.knot.tangentIn={x:-2,y:0,z:0};
  h.knot.tangentOut={x:7,y:8,z:9};
  await assert.rejects(commitKnotSerializedGesture('editorTangentOut',
   h.knot,h.before,h.capture(),h.request),/rejected|failed|snapshot/i);
  assert.equal(h.knot.mode,0,'Failed commit restores TangentMode');
  assert.deepEqual(h.knot.tangentIn,a);
  assert.deepEqual(h.knot.tangentOut,b);
  assert.equal(h.snapshots,failure.rejectSnapshot||failure.throwSnapshot?1:0);
  assert.equal(h.calls.at(-1),'knot:__comps__.1.mode',
   'Serialized rollback reverses exact property write order');
 }
 h=make({noComponent:true});h.knot.mode=4;
 await assert.rejects(commitKnotSerializedGesture('editorTangentIn',
  h.knot,h.before,h.capture(),h.request),/component/i);
 assert.equal(h.snapshots,0);

 h=make();h.knotNode.rotation={...Q90};
 h.knotNode.parent={uuid:'foreign'};
 await assert.rejects(commitKnotSerializedGesture('editorWorldEuler',
  h.knot,h.before,{...h.capture(),parent:h.before.parent},h.request),/stale/i);
 assert.deepEqual(h.calls,[],'Foreign parent cannot acquire history');

 h=make();h.knot.tangentOutHandle=h.handleNode;
 const old={...h.before,
  outHandle:{...b},outHandleNode:h.handleNode,outHandleParent:h.knotNode};
 h.handleNode.position={x:3,y:0,z:1};
 h.handleNode.parent={uuid:'other'};
 await assert.rejects(commitKnotSerializedGesture('editorTangentOut',
  h.knot,old,h.capture(),h.request),/stale/i);
 assert.deepEqual(h.calls,[]);

 // Regression: query-node IPC resolves after the user changes live position.
 let resume;const release=new Promise(resolve=>{resume=resolve;});
 h=make({queryDelay:()=>release});
 h.knot.mode=4;h.knot.tangentOut={x:9,y:0,z:0};
 const promise=commitKnotSerializedGesture('editorTangentOut',h.knot,
  h.before,h.capture(),h.request);
 h.knot.tangentOut={x:12,y:0,z:0};
 resume();
 await assert.rejects(promise,/changed during serialized/i);
 assert.equal(h.snapshots,0);
 assert.deepEqual(h.calls,['query']);

 h=make();h.knotNode.rotation={...Q90};
 h.knotNode.isValid=false;
 await assert.rejects(commitKnotSerializedGesture('editorWorldEuler',
  h.knot,h.before,h.capture(),h.request),/stale/i);
 assert.deepEqual(h.calls,[]);

 console.log('KNOT SERIALIZED HISTORY PASS: mode/tangents, handle node, rotation, exact paths, rollback, no-op, async race and reparent.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
