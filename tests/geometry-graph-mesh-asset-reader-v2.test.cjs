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
  ATTR_NORMAL:'a_normal'},Format:{RGB32F:1,RG32F:2}};
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
  assert.throws(()=>readGraphSourceMeshAsset({...mesh,
   struct:{primitives:[{},{}]}}),/one submesh/);
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
  console.log('GRAPH MESH ASSET READER V2 PASS: Cocos native formats, no source writes, content fingerprint, format/safety guards.');
 }finally{Module._load=original;}
}finally{fs.rmSync(dir,{recursive:true,force:true});}
