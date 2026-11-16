'use strict';
/** Headless Creator bridge regression: pending glTF Bake is a 3-field tuple. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {stagePendingBake,bindImportedMesh}=require(
 path.resolve(__dirname,'../src/v2/EditorAssetBind.js'));
const uuid='pending-road-node',fp='0123456789abcdef';
const assetUrl='db://assets/SplineV2_new_0123456789abcdef.gltf';
const slots='[0,3,4]';
const oldPendingUrl='db://assets/SplineV2_previous.gltf';
const oldPendingFp='fedcba9876543210';
const oldPendingSlots='[0,4]';
const field=value=>({type:'String',value});
const newScene=()=>({__comps__:[{type:'Spline.Road',value:{
 bakedMesh:{type:'cc.Mesh',value:{uuid:'previous-mesh'}},
 bakedSourceUrl:field('db://assets/old-mesh.gltf'),
 bakedSourceFingerprint:field(oldPendingFp),
 bakedMaterialSlots:field('[0,4]'),meshMode:{type:'Enum',value:2},
 pendingBakeUrl:field(oldPendingUrl),
 pendingBakeFingerprint:field(oldPendingFp),
 pendingBakeMaterialSlots:field(oldPendingSlots)
}}]});
let scene=newScene(),calls=[],onSet=null;
function makeEditor(){
 return {Message:{request:async(channel,method,payload)=>{
  calls.push({channel,method,payload});
  if(channel==='scene'&&method==='query-node')return scene;
  if(channel==='scene'&&method==='set-property'){
   const match=/^__comps__\.(\d+)\.([a-zA-Z]+)$/.exec(payload.path);
   assert(match,'Creator set-property must address one component field');
   assert.equal(payload.record,true);
   const key=match[2],fate=onSet?.(key,payload.dump.value);
   if(fate==='before')throw Error('Injected setter failure before mutation');
   if(fate==='false')return false;
   scene.__comps__[Number(match[1])].value[key]={
    type:payload.dump.type,value:payload.dump.value};
   if(fate==='after')throw Error('Injected setter failure after mutation');
   return true;
  }
  if(channel==='asset-db'&&method==='query-asset-info')
   return {uuid:'ready-gltf',subAssets:{
    '.mesh':{type:'cc.Mesh',uuid:'new-imported-mesh'}}};
  throw Error('Unexpected '+channel+'.'+method);
 }}};
}
const sourceStatus=(fingerprint=fp)=>({
 ok:true,componentIndex:0,fingerprint});
const params=(verifyCurrent=async()=>sourceStatus())=>({
 nodeUuid:uuid,componentIndex:0,assetUrl,fingerprint:fp,materialSlots:slots,
 verifyCurrent});
const pending=()=>Object.fromEntries(
 ['pendingBakeUrl','pendingBakeFingerprint','pendingBakeMaterialSlots']
 .map(k=>[k,scene.__comps__[0].value[k]?.value]));
const baked=()=>Object.fromEntries(
 ['bakedMesh','bakedSourceUrl','bakedSourceFingerprint','bakedMaterialSlots','meshMode']
 .map(k=>[k,scene.__comps__[0].value[k]?.value]));
(async()=>{
 const editor=makeEditor();
 // Staging only changes pending metadata; it must preserve an existing
 // imported Baked Mesh (including sparse primitive slots and mode).
 const previousBaked=JSON.stringify(baked());
 let checks=0;
 let result=await stagePendingBake(editor,params(async()=>{
  checks++;return sourceStatus();
 }));
 assert.equal(result.ok,true);
 assert.equal(checks,2,'Verify source before and after pending tuple writes');
 assert.deepEqual(pending(),{
  pendingBakeUrl:assetUrl,pendingBakeFingerprint:fp,pendingBakeMaterialSlots:slots});
 assert.equal(JSON.stringify(baked()),previousBaked);
 assert.equal(calls.filter(c=>c.method==='set-property').length,3);

 // The staged tuple may subsequently be imported and bound normally.
 const bound=await bindImportedMesh(editor,{
  nodeUuid:uuid,componentIndex:0,assetUrl,fingerprint:fp,materialSlots:slots,
  verifyCurrent:async()=>({
   ...sourceStatus(),pendingUrl:assetUrl,pendingFingerprint:fp,
   pendingMaterialSlots:slots})
 });
 assert.equal(bound.ok,true);
 assert.equal(scene.__comps__[0].value.bakedMesh.value.uuid,'new-imported-mesh');
 assert.equal(scene.__comps__[0].value.bakedMaterialSlots.value,slots);
 assert.deepEqual(pending(),{
  pendingBakeUrl:'',pendingBakeFingerprint:'',pendingBakeMaterialSlots:''});

 // Fail at EVERY pending field, before and after mutation, and on a
 // rejected (false) native set-property response: restore full tuple.
 for(const kind of ['before','after','false']){
  for(let stop=1;stop<=3;stop++){
   scene=newScene();calls=[];let writeCount=0,failed=false;
   const original=JSON.stringify(scene);
   onSet=()=>{
    if(++writeCount===stop&&!failed){failed=true;return kind;}
   };
   try{result=await stagePendingBake(editor,params());}
   finally{onSet=null;}
   assert.equal(failed,true);
   assert.equal(result.ok,false);
   assert.equal(result.rolledBack,true,JSON.stringify(result));
   assert.equal(result.recoveryRequired,false);
   assert.equal(JSON.stringify(scene),original,
    'Failed staging must restore previous pending and Baked state');
  }
 }

 // Verify the source before staging: stale Path must cause zero writes.
 scene=newScene();calls=[];
 result=await stagePendingBake(editor,params(async()=>sourceStatus(oldPendingFp)));
 assert.equal(result.ok,false);
 assert.equal(result.rolledBack,true);
 assert.equal(calls.filter(c=>c.method==='set-property').length,0);

 // Verify source AFTER staging: editing Path during the 3 writes
 // invalidates the new metadata and restores the original pending Bake.
 scene=newScene();calls=[];checks=0;
 const beforeDrift=JSON.stringify(scene);
 result=await stagePendingBake(editor,params(async()=>{
  return sourceStatus(++checks===1?fp:oldPendingFp);
 }));
 assert.equal(result.ok,false);
 assert.equal(result.rolledBack,true,JSON.stringify(result));
 assert.equal(JSON.stringify(scene),beforeDrift);

 // Do not clobber a newer concurrent pending URL during compensation.
 scene=newScene();calls=[];let interrupted=false;
 onSet=(key)=>{
  if(key==='pendingBakeMaterialSlots'&&!interrupted){
   interrupted=true;
   scene.__comps__[0].value.pendingBakeUrl.value=
    'db://assets/SplineV2_newer.gltf';
   return 'after';
  }
 };
 try{result=await stagePendingBake(editor,params());}
 finally{onSet=null;}
 assert.equal(result.ok,false);
 assert.equal(result.recoveryRequired,true);
 assert.match(result.reason,/Concurrent change at pendingBakeUrl/);
 assert.equal(pending().pendingBakeUrl,'db://assets/SplineV2_newer.gltf');

 // A second native failure while restoring an old value must be explicit.
 scene=newScene();calls=[];interrupted=false;
 onSet=(key,value)=>{
  if(key==='pendingBakeMaterialSlots'&&!interrupted){
   interrupted=true;return 'before';
  }
  if(interrupted&&key==='pendingBakeUrl'&&value===oldPendingUrl)
   return 'false';
 };
 try{result=await stagePendingBake(editor,params());}
 finally{onSet=null;}
 assert.equal(result.ok,false);
 assert.equal(result.rolledBack,false);
 assert.equal(result.recoveryRequired,true);
 assert.match(result.reason,/Unrestored pendingBakeUrl/);
 assert.equal(scene.__comps__[0].value.bakedMesh.value.uuid,'previous-mesh');

 // Missing serializable metadata and malformed primitive slots must never
 // write anything or silently stage half the Bake.
 scene=newScene();calls=[];
 delete scene.__comps__[0].value.pendingBakeMaterialSlots;
 result=await stagePendingBake(editor,params());
 assert.equal(result.ok,false);assert.equal(result.recoveryRequired,false);
 assert.equal(calls.filter(c=>c.method==='set-property').length,0);
 for(const bad of ['', '[0,-1,4]', '{bad}']){
  await assert.rejects(()=>stagePendingBake(editor,{
   ...params(),materialSlots:bad}),/material slot/);
 }
 assert.equal(calls.filter(c=>c.method==='set-property').length,0);
 console.log('V2 PENDING BAKE PASS: staged tuple, stale Path, 9 setter failures, rollback conflicts, recovery and Bind handoff.');
})().catch(error=>{console.error(error);process.exitCode=1;});
