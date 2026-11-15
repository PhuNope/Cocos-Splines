'use strict';
/** Pure extension-boundary test: simulated AssetDB import, scene serialization & reload. */
const assert=require('node:assert/strict'),path=require('node:path');
const {discoverMeshSubasset,bindImportedMesh,bindWhenImported}=require(path.resolve(__dirname,'../src/v2/EditorAssetBind.js'));
const nodeUuid='scene-node-v2',assetUrl='db://assets/SplineV2_a_0123456789abcdef.gltf';
const fp='0123456789abcdef',meshUuid='11223344-5566-7788-9900-001122334455';
const meshInfo={uuid:'model-uuid',imported:true,subAssets:{
 '.material':{type:'cc.Material',uuid:'material-uuid'},
 '.mesh':{type:'cc.Mesh',uuid:meshUuid,url:assetUrl+'/mesh'}
}};
assert.equal(discoverMeshSubasset(null).ok,false);
assert.equal(discoverMeshSubasset({subAssets:{}}).ok,false);
assert.equal(discoverMeshSubasset({...meshInfo,subAssets:{
 a:{type:'cc.Mesh',uuid:'one'},b:{type:'cc.Mesh',uuid:'two'}}}).ok,false);
assert.equal(discoverMeshSubasset(meshInfo).uuid,meshUuid);
const comp=(type='Spline.Road',pendingSlots='[0,3,4]')=>({type,value:{
 bakedMesh:{value:{uuid:'old-mesh'}},bakedSourceUrl:{value:''},
 bakedSourceFingerprint:{value:''},pendingBakeUrl:{value:assetUrl},
 pendingBakeFingerprint:{value:fp},
 bakedMaterialSlots:{value:'[9]'},pendingBakeMaterialSlots:{value:pendingSlots},
 meshMode:{value:1}
}});
let scene={__comps__:[comp()]},calls=[],assetResponses=[meshInfo];
function makeEditor(){
 return {Message:{request:async(channel,method,payload)=>{
   calls.push({channel,method,payload});
   if(channel==='asset-db'&&method==='query-asset-info')
      return assetResponses.length>1?assetResponses.shift():assetResponses[0];
   if(channel==='scene'&&method==='query-node')return scene;
   if(channel==='scene'&&method==='set-property'){
     const match=/^__comps__\.(\d+)\.([a-zA-Z]+)$/.exec(payload.path);
     if(!match)throw Error('Invalid property '+payload.path);
     scene.__comps__[Number(match[1])].value[match[2]]={value:payload.dump.value};
     return true;
   }
   throw Error('Unexpected '+channel+':'+method);
 }}};
}
(async()=>{
 let editor=makeEditor();
 let result=await bindImportedMesh(editor,{nodeUuid,componentIndex:0,
  assetUrl,fingerprint:fp,materialSlots:'[0,3,4]'});
 assert(result.ok);assert.equal(result.uuid,meshUuid);
 const fields=scene.__comps__[0].value;
 assert.equal(fields.bakedMesh.value.uuid,meshUuid);
 assert.equal(fields.meshMode.value,2);
 assert.equal(fields.bakedSourceFingerprint.value,fp);
 assert.equal(fields.bakedSourceUrl.value,assetUrl);
 assert.equal(fields.pendingBakeUrl.value,'');
 assert.equal(fields.pendingBakeFingerprint.value,'');
 assert.equal(fields.bakedMaterialSlots.value,'[0,3,4]');
 assert.equal(fields.pendingBakeMaterialSlots.value,'');
 assert.equal(calls.filter(x=>x.method==='set-property').length,8);
 // Save/restore the serialized dump; UUID survives without rebuilding geometry.
 const persisted=JSON.stringify(scene);scene=JSON.parse(persisted);
 assert.equal(scene.__comps__[0].value.bakedMesh.value.uuid,meshUuid);
 assert.equal(scene.__comps__[0].value.bakedMaterialSlots.value,'[0,3,4]',
  'Saved/reopened Scene retains exact original primitive material slots');
 calls=[];scene={__comps__:[comp('Spline.Extrude','')]};
 assetResponses=[{uuid:'model-importing',subAssets:{}},meshInfo];
 result=await bindWhenImported(makeEditor(),{nodeUuid,componentIndex:0,assetUrl,fingerprint:fp},
   {attempts:2,delayMs:0});
 assert(result.ok);
 assert.equal(scene.__comps__[0].value.bakedMesh.value.uuid,meshUuid);
 assert.equal(scene.__comps__[0].value.bakedMaterialSlots.value,'',
  'Binding a legacy Bake must clear a previous sparse slot map');
 assert.equal(calls.filter(x=>x.method==='set-property').length,8,
  'No mutation during import wait');
 for(const kind of ['Spline.MeshDeform','Spline.Junction']){
   calls=[];scene={__comps__:[comp(kind,'')]};assetResponses=[meshInfo];
   result=await bindImportedMesh(makeEditor(),{nodeUuid,componentIndex:0,assetUrl,fingerprint:fp});
   assert.equal(result.ok,true,kind+' must bind saved glTF Mesh');
   assert.equal(scene.__comps__[0].value.bakedMesh.value.uuid,meshUuid);
   assert.equal(calls.filter(x=>x.method==='set-property').length,8);
 }

 // Existing mesh remains untouched if no unique import can be proven.
 scene={__comps__:[comp()]};calls=[];assetResponses=[{subAssets:{
  one:{type:'cc.Mesh',uuid:'one'},two:{type:'cc.Mesh',uuid:'two'}}}];
 result=await bindWhenImported(makeEditor(),{nodeUuid,componentIndex:0,assetUrl,fingerprint:fp},
   {attempts:1,delayMs:0});
 assert.equal(result.ok,false);
 assert.equal(scene.__comps__[0].value.bakedMesh.value.uuid,'old-mesh');
 assert.equal(calls.filter(x=>x.method==='set-property').length,0);
 await assert.rejects(()=>bindImportedMesh(makeEditor(),{nodeUuid,componentIndex:0,assetUrl:'db://internal/x.gltf',fingerprint:fp}),/project glTF/);
 calls=[];scene={__comps__:[comp()]};assetResponses=[meshInfo];
 for(const bad of ['[0,-1,4]','[0,1.5,4]','[0,4294967296]','[0,null,4]','{bad json}']){
  await assert.rejects(()=>bindImportedMesh(makeEditor(),{
   nodeUuid,componentIndex:0,assetUrl,fingerprint:fp,materialSlots:bad
  }),/material slot map/);
 }
 assert.equal(calls.length,0,'Invalid material metadata may not touch AssetDB or Scene');
 scene.__comps__[0].value.pendingBakeMaterialSlots.value='[3,3,4]';
 const repeated=await bindImportedMesh(makeEditor(),{
  nodeUuid,componentIndex:0,assetUrl,fingerprint:fp,materialSlots:'[3,3,4]'
 });
 assert.equal(repeated.ok,true);
 assert.equal(scene.__comps__[0].value.bakedMaterialSlots.value,'[3,3,4]',
  'Chunked primitives may repeat the same authored material slot');
 // A late AssetDB completion cannot attach a superseded pending Bake.
 for(const change of [
  {name:'pendingBakeFingerprint',value:'fedcba9876543210'},
  {name:'pendingBakeUrl',value:'db://assets/a-newer-bake.gltf'},
  {name:'pendingBakeMaterialSlots',value:'[0,4,3]'}
 ]){
  scene={__comps__:[comp()]};calls=[];assetResponses=[meshInfo];
  scene.__comps__[0].value[change.name].value=change.value;
  const denied=await bindImportedMesh(makeEditor(),{
   nodeUuid,componentIndex:0,assetUrl,fingerprint:fp,materialSlots:'[0,3,4]'
  });
  assert.equal(denied.ok,false,change.name);
  assert.equal(denied.pending,false,'Superseded import must not request retries');
  assert.match(denied.reason,/newer Bake/);
  assert.equal(scene.__comps__[0].value.bakedMesh.value.uuid,'old-mesh');
  assert.equal(scene.__comps__[0].value.bakedMaterialSlots.value,'[9]');
  assert.equal(calls.filter(c=>c.method==='set-property').length,0);
 }
 // A source edit during the importer retry must be detected by the fresh
 // read-only Scene fingerprint check immediately before mutation.
 scene={__comps__:[comp()]};calls=[];
 assetResponses=[{uuid:'loading',subAssets:{}},meshInfo];
 let verifyCount=0;
 let verified=await bindWhenImported(makeEditor(),{
  nodeUuid,componentIndex:0,assetUrl,fingerprint:fp,materialSlots:'[0,3,4]',
  verifyCurrent:async()=>{
   verifyCount++;
   return {ok:true,componentIndex:0,fingerprint:'fedcba9876543210',
    pendingUrl:assetUrl,pendingFingerprint:fp,pendingMaterialSlots:'[0,3,4]'};
  }
 },{attempts:2,delayMs:0});
 assert.equal(verified.ok,false);assert.equal(verified.pending,false);
 assert.match(verified.reason,/Spline or pending Bake changed/);
 assert.equal(verifyCount,1,'Only check source after AssetDB has imported a Mesh');
 assert.equal(calls.filter(c=>c.method==='query-asset-info').length,2);
 assert.equal(calls.filter(c=>c.method==='set-property').length,0);
 assert.equal(scene.__comps__[0].value.bakedMesh.value.uuid,'old-mesh');
 // A matching, up-to-date status is still allowed to bind normally.
 scene={__comps__:[comp()]};calls=[];assetResponses=[meshInfo];
 verified=await bindImportedMesh(makeEditor(),{
  nodeUuid,componentIndex:0,assetUrl,fingerprint:fp,materialSlots:'[0,3,4]',
  verifyCurrent:async()=>({ok:true,componentIndex:0,fingerprint:fp,
   pendingUrl:assetUrl,pendingFingerprint:fp,pendingMaterialSlots:'[0,3,4]'})
 });
 assert.equal(verified.ok,true);
 assert.equal(scene.__comps__[0].value.bakedMaterialSlots.value,'[0,3,4]');
 assert.equal(calls.filter(c=>c.method==='set-property').length,8);
 scene={__comps__:[comp('Other.Component')]};assetResponses=[meshInfo];
 await assert.rejects(()=>bindImportedMesh(makeEditor(),{nodeUuid,componentIndex:0,assetUrl,fingerprint:fp}),/Component changed/);
 console.log('V2 BAKE BIND PASS: cc.Mesh UUID, sparse slot persistence, import retries, superseded pending Bake/source guard, and Scene serialization.');
})().catch(e=>{console.error(e);process.exitCode=1;});
