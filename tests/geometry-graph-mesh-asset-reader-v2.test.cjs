'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
 path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'splines-graph-mesh-reader-'));
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false',
  '--outDir',dir],{stdio:'pipe'});
 const original=Module._load;
 const gfx={AttributeName:{ATTR_POSITION:'a_position',ATTR_TEX_COORD:'a_texCoord',
  ATTR_NORMAL:'a_normal'},Format:{RGB32F:1,RG32F:2},
  PrimitiveMode:{TRIANGLE_LIST:4,LINE_LIST:1}};
 Module._load=function(name,parent,isMain){
  if(name==='cc')return {gfx,Mesh:class Mesh{}};
  return original.call(this,name,parent,isMain);
 };
 try{
  const {readGraphSourceMeshAsset,graphMeshDataFingerprint}=
   require(dir+'/Core/SplineGraphMeshAssetReader.js');
  const pos=new Float32Array([-1,0,0,1,0,0,-1,0,1,1,0,1]);
  const uvs=new Float32Array([0,0,1,0,0,1,1,1]);
  const indices=new Uint16Array([0,2,1,1,2,3]);
  const data=new ArrayBuffer(16);
  const bytes=new Uint8Array(data);bytes.fill(12);
  const mesh={uuid:'mesh-asset-a',allowDataAccess:true,data,
   struct:{primitives:[{vertexBundelIndices:[0]}],vertexBundles:[{
    attributes:[{name:'a_position',format:1},{name:'a_texCoord',format:2}],
   }]},
   readAttribute(_i,name){return name==='a_position'?pos:
    name==='a_texCoord'?uvs:null;},
   readAttributeFormat(_i,name){return name==='a_position'?{name:'RGB32F'}:
    name==='a_texCoord'?{name:'RG32F'}:null;},
   readIndices(){return indices;},
  };
  const source=readGraphSourceMeshAsset(mesh);
  assert.deepEqual(source.geometry.positions,Array.from(pos));
  assert.deepEqual(source.geometry.uvs,Array.from(uvs));
  assert.deepEqual(source.geometry.indices,Array.from(indices));
  assert.equal(source.geometry.normals,undefined);
  assert(source.revision.startsWith(graphMeshDataFingerprint(mesh)+':'));
  const decodedRevision=source.revision;
  pos[0]=-2;
  assert.notEqual(readGraphSourceMeshAsset(mesh).revision,decodedRevision,
   'Explicit Rebuild detects source geometry changes without raw backing byte changes');
  pos[0]=-1;
  const before=JSON.stringify(source.geometry);
  source.geometry.positions[0]=999;
  assert.equal(pos[0],-1,'Readonly adapter never returns an imported Mesh buffer');
  assert.notEqual(JSON.stringify(source.geometry),before);
  const rev=graphMeshDataFingerprint(mesh);
  bytes[3]=15;
  assert.notEqual(graphMeshDataFingerprint(mesh),rev,
   'Changed same-size raw Mesh bytes invalidate Graph cache.');
  assert.throws(()=>readGraphSourceMeshAsset(null),/Source Mesh/);
  assert.throws(()=>readGraphSourceMeshAsset({...mesh,allowDataAccess:false}),
   /Allow Data Access/);
  // A model with two submesh primitives can be read one at a time.
  const alternatePos=new Float32Array([-2,0,0,2,0,0,-2,0,2,2,0,2]);
  const alternateUV=new Float32Array([.25,0,.75,0,.25,1,.75,1]);
  const alternateIndices=new Uint16Array([0,1,2,2,1,3]);
  const multi={...mesh,struct:{
   ...mesh.struct,
   primitives:[{vertexBundelIndices:[0],primitiveMode:4},
    {vertexBundelIndices:[1],primitiveMode:4}],
   vertexBundles:[mesh.struct.vertexBundles[0],mesh.struct.vertexBundles[0]],
  },readAttribute(i,name){
   return name==='a_position'?(i===1?alternatePos:pos):
    name==='a_texCoord'?(i===1?alternateUV:uvs):null;
  },readIndices(i){return i===1?alternateIndices:indices;}};
  const selected0=readGraphSourceMeshAsset(multi,0);
  const selected1=readGraphSourceMeshAsset(multi,1);
  assert.equal(selected0.subMeshCount,2);
  assert.equal(selected1.subMeshIndex,1);
  assert.deepEqual(selected1.geometry.positions,Array.from(alternatePos));
  assert.deepEqual(selected1.geometry.uvs,Array.from(alternateUV));
  assert.deepEqual(selected1.geometry.indices,Array.from(alternateIndices));
  assert.notEqual(selected0.revision,selected1.revision,
   'Same Mesh UUID/data must be distinguishable per submesh');
  assert.equal(graphMeshDataFingerprint(multi),graphMeshDataFingerprint(mesh),
   'Selector identity is scoped to decoded geometry, not raw buffer');
  for(const bad of [-1,2,3,4,.5,Infinity,NaN]){
   assert.throws(()=>readGraphSourceMeshAsset(multi,bad),/Submesh Index/);
  }
  assert.throws(()=>readGraphSourceMeshAsset({...multi,struct:{
   ...multi.struct,primitives:new Array(5).fill({})}},0),/1–4 imported submeshes/);
  assert.throws(()=>readGraphSourceMeshAsset({...multi,struct:{
   ...multi.struct,primitives:[multi.struct.primitives[0],
    {...multi.struct.primitives[1],primitiveMode:1}]}},1),/TRIANGLE_LIST/);
  assert.throws(()=>readGraphSourceMeshAsset({...multi,
   readIndices:i=>i===1?new Uint16Array([0,1,99]):indices},1),/indices/);
  assert.throws(()=>readGraphSourceMeshAsset({...multi,
   readAttribute:(i,name)=>name==='a_position'&&i===1?
    new Float32Array(4100*3):multi.readAttribute(i,name)},1),/4096/);
  assert.throws(()=>readGraphSourceMeshAsset({...mesh,
   readIndices:()=>new Uint16Array([0,9,2])}),/indices/);
  assert.throws(()=>readGraphSourceMeshAsset({...mesh,
   readAttribute:(_i,name)=>name==='a_position'?new Float32Array(4100*3):null}),
   /4096/);
  assert.throws(()=>graphMeshDataFingerprint({...mesh,data:new ArrayBuffer(4*1024*1024+1)}),
   /4 MiB/);
  assert.equal(graphMeshDataFingerprint(null),'none');
  assert(require(root+'/package.json').scripts.test.includes(
   'geometry-graph-mesh-asset-reader-v2.test.cjs'));
  console.log('GRAPH MESH ASSET READER V2 PASS: multi-submesh selection, distinct geometry revisions, topology bounds, read-only import.');
 }finally{Module._load=original;}
}finally{fs.rmSync(dir,{recursive:true,force:true});}
