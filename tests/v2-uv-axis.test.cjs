'use strict';
/**
 * V2 UV axis regression: axis V is the backward-compatible default;
 * selecting U rotates the longitudinal repeat direction without affecting
 * UV2, mesh topology, shared materials or glTF export.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-v2-uv-axis-'));
try {
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict',
  '--rootDir',path.join(root,'src-v2'),'--outDir',dir,
  path.join(root,'src-v2/geometry/RoadStrip.ts'),
  path.join(root,'src-v2/geometry/ProfileSweep.ts'),
  path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildSplineCacheV2}=require(path.join(dir,'core/SplineCache.js'));
 const {buildRoadStripV2}=require(path.join(dir,'geometry/RoadStrip.js'));
 const {buildRoadProfileV2,buildTubeV2}=require(path.join(dir,'geometry/ProfileSweep.js'));
 const {exportMeshGltfV2}=require(path.join(dir,'geometry/GltfExporter.js'));
 const {fingerprintMeshV2}=require(path.join(dir,'geometry/MeshBuildPlan.js'));
 const near=(actual,expected,t=.0001)=>assert(Math.abs(actual-expected)<=t,`${actual} != ${expected}`);
 const knots=[{position:{x:0,y:0,z:0}},{position:{x:0,y:0,z:10}}];
 const cache=buildSplineCacheV2({type:'linear',closed:false,knots});
 const assertSwap=(v,u)=>{
  assert.equal(v.positions.length,u.positions.length);
  assert.deepEqual(Array.from(v.positions),Array.from(u.positions),'Do not alter geometry');
  assert.deepEqual(Array.from(v.uv2),Array.from(u.uv2),'UV2 must stay unchanged');
  assert.deepEqual(v.submeshes.map(x=>x.materialSlot),u.submeshes.map(x=>x.materialSlot));
  assert.deepEqual(v.submeshes.map(x=>Array.from(x.indices)),u.submeshes.map(x=>Array.from(x.indices)));
  assert.equal(v.uv0.length,u.uv0.length);
  for(let i=0;i<v.uv0.length;i+=2){
   near(u.uv0[i],v.uv0[i+1]);
   near(u.uv0[i+1],v.uv0[i]);
  }
  assert.notEqual(fingerprintMeshV2(v),fingerprintMeshV2(u),'Changing texture orientation invalidates baked mesh');
  for(const a of [u.normals,u.tangents,v.normals,v.tangents])assert(Array.from(a).every(Number.isFinite));
 };
 const stripV=buildRoadStripV2(cache,{width:4,step:2,uvMetersPerRepeat:5});
 const stripU=buildRoadStripV2(cache,{width:4,step:2,uvMetersPerRepeat:5,uvLongitudinalAxis:'u'});
 const stripVExplicit=buildRoadStripV2(cache,{width:4,step:2,uvMetersPerRepeat:5,uvLongitudinalAxis:'v'});
 assert.deepEqual(Array.from(stripV.uv0),Array.from(stripVExplicit.uv0));
 assertSwap(stripV,stripU);
 near(stripV.uv0[2],1);near(stripV.uv0[3],0);
 near(stripV.uv0[5],.4);near(stripU.uv0[4],.4);near(stripU.uv0[5],0);
 near(stripU.uv0.at(-4),2);near(stripV.uv0.at(-3),2);
 assert.throws(()=>buildRoadStripV2(cache,{width:4,uvLongitudinalAxis:'x'}),/axis/);

 const roadOptions={width:4,step:2,uvMetersPerRepeat:5,shoulderWidth:1,curbWidth:.25,curbHeight:.2};
 const bandV=buildRoadProfileV2(cache,roadOptions);
 const bandU=buildRoadProfileV2(cache,{...roadOptions,uvLongitudinalAxis:'u'});
 assertSwap(bandV,bandU);
 assert.deepEqual(bandU.submeshes.map(s=>s.materialSlot),[0,1,2]);
 const tubeOpts={radius:1,sides:12,step:2,uvMetersPerRepeat:5,capEnds:false};
 const tubeV=buildTubeV2(cache,tubeOpts);
 const tubeU=buildTubeV2(cache,{...tubeOpts,uvLongitudinalAxis:'u'});
 assertSwap(tubeV,tubeU);

 // Decode exported glTF UV0 to prove the baked texture repeats along U.
 function exportUV0(mesh){
  const gltf=JSON.parse(exportMeshGltfV2(mesh).json);
  const prim=gltf.meshes[0].primitives[0],accessor=gltf.accessors[prim.attributes.TEXCOORD_0];
  const bufferView=gltf.bufferViews[accessor.bufferView];
  const data=Buffer.from(gltf.buffers[0].uri.split(',')[1],'base64');
  return Array.from({length:accessor.count*2},(_,i)=>data.readFloatLE(bufferView.byteOffset+4*i));
 }
 const bakedV=exportUV0(stripV),bakedU=exportUV0(stripU);
 assert.equal(bakedU.length,bakedV.length);
 for(let i=0;i<bakedV.length;i+=2){
  near(bakedU[i],bakedV[i+1]);near(bakedU[i+1],bakedV[i]);
 }
 const inspector=require(path.join(root,'src/contributions/inspector/RoadV2.js'));
 const extrudeInspector=require(path.join(root,'src/contributions/inspector/ExtrudeV2.js'));
 assert(inspector.template.includes('spl-v2-uvLongitudinalAxis'));
 assert(extrudeInspector.template.includes('spl-v2-uvLongitudinalAxis'));
 console.log('V2 UV AXIS PASS: Road/shoulder/curb/tube U↔V longitudinal mapping, unchanged UV2, glTF Bake, Inspector and fingerprint');
}finally{fs.rmSync(dir,{force:true,recursive:true});}
