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
const comp=(type='SplinesV2.SplineRoad')=>({type,value:{
 bakedMesh:{value:{uuid:'old-mesh'}},bakedSourceUrl:{value:''},
 bakedSourceFingerprint:{value:''},pendingBakeUrl:{value:assetUrl},
 pendingBakeFingerprint:{value:fp},meshMode:{value:1}
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
 let result=await bindImportedMesh(editor,{nodeUuid,componentIndex:0,assetUrl,fingerprint:fp});
 assert(result.ok);assert.equal(result.uuid,meshUuid);
 const fields=scene.__comps__[0].value;
 assert.equal(fields.bakedMesh.value.uuid,meshUuid);
 assert.equal(fields.meshMode.value,2);
 assert.equal(fields.bakedSourceFingerprint.value,fp);
 assert.equal(fields.bakedSourceUrl.value,assetUrl);
 assert.equal(fields.pendingBakeUrl.value,'');
 assert.equal(fields.pendingBakeFingerprint.value,'');
 assert.equal(calls.filter(x=>x.method==='set-property').length,6);
 // Save/restore the serialized dump; UUID survives without rebuilding geometry.
 const persisted=JSON.stringify(scene);scene=JSON.parse(persisted);
 assert.equal(scene.__comps__[0].value.bakedMesh.value.uuid,meshUuid);
 calls=[];scene={__comps__:[comp('SplinesV2.SplineExtrude')]};
 assetResponses=[{uuid:'model-importing',subAssets:{}},meshInfo];
 result=await bindWhenImported(makeEditor(),{nodeUuid,componentIndex:0,assetUrl,fingerprint:fp},
   {attempts:2,delayMs:0});
 assert(result.ok);
 assert.equal(scene.__comps__[0].value.bakedMesh.value.uuid,meshUuid);
 assert.equal(calls.filter(x=>x.method==='set-property').length,6,'No mutation during import wait');
 // Existing mesh remains untouched if no unique import can be proven.
 scene={__comps__:[comp()]};calls=[];assetResponses=[{subAssets:{
  one:{type:'cc.Mesh',uuid:'one'},two:{type:'cc.Mesh',uuid:'two'}}}];
 result=await bindWhenImported(makeEditor(),{nodeUuid,componentIndex:0,assetUrl,fingerprint:fp},
   {attempts:1,delayMs:0});
 assert.equal(result.ok,false);
 assert.equal(scene.__comps__[0].value.bakedMesh.value.uuid,'old-mesh');
 assert.equal(calls.filter(x=>x.method==='set-property').length,0);
 await assert.rejects(()=>bindImportedMesh(makeEditor(),{nodeUuid,componentIndex:0,assetUrl:'db://internal/x.gltf',fingerprint:fp}),/project glTF/);
 scene={__comps__:[comp('Other.Component')]};assetResponses=[meshInfo];
 await assert.rejects(()=>bindImportedMesh(makeEditor(),{nodeUuid,componentIndex:0,assetUrl,fingerprint:fp}),/Component changed/);
 console.log('V2 BAKE BIND PASS: exact cc.Mesh UUID, no premature mutation, importer retry, scene serialization and ambiguous subassets.');
})().catch(e=>{console.error(e);process.exitCode=1;});
