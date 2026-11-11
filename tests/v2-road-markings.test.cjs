'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'v2-road-markings-'));
try{
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict','--rootDir',path.join(root,'src-v2'),'--outDir',temp,path.join(root,'src-v2/geometry/RoadStrip.ts'),path.join(root,'src-v2/geometry/ProfileSweep.ts'),path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildSplineCacheV2}=require(path.join(temp,'core/SplineCache.js'));
 const {buildRoadStripV2}=require(path.join(temp,'geometry/RoadStrip.js'));
 const {buildRoadProfileV2}=require(path.join(temp,'geometry/ProfileSweep.js'));
 const {exportMeshGltfV2}=require(path.join(temp,'geometry/GltfExporter.js'));
 const p=(x,y,z)=>({position:{x,y,z}});
 const knots=[p(-1.701,0,-7.206),p(-3.869,0,3.72),p(5.82,0,4.347)];
 const cache=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:false,knots});
 const opts={width:4,step:.25,uvLongitudinalAxis:'u',surfaceMode:'continuous',cornerMode:'join-trim',adaptiveSampling:true,maxTurnAngleDegrees:6,maxChordError:.03};
 const without=buildRoadStripV2(cache,opts);
 const withMarks=buildRoadStripV2(cache,{...opts,generateMarkings:true});
 assert.deepEqual(withMarks.submeshes.map(s=>s.materialSlot),[0,3,4]);
 assert.equal(withMarks.submeshes[0].indices.length,without.submeshes[0].indices.length);
 assert.equal(withMarks.uv0.length,withMarks.uv2.length);
 assert(withMarks.triangleCount>without.triangleCount);
 assert(withMarks.positions.every(Number.isFinite));
 assert(withMarks.tangents.every(Number.isFinite));
 const whiteTriangles=withMarks.submeshes.find(s=>s.materialSlot===3).indices.length/3;
 const yellowTriangles=withMarks.submeshes.find(s=>s.materialSlot===4).indices.length/3;
 assert(yellowTriangles>whiteTriangles,'Edge lines are continuous but centre is dashed');
 const bake=JSON.parse(exportMeshGltfV2(withMarks).json);
 assert.deepEqual(bake.extras.cocosSplinesV2.materialSlots,[0,3,4]);
 assert.equal(bake.meshes[0].primitives.length,3);
 const prof=buildRoadProfileV2(cache,{...opts,generateMarkings:true,shoulderWidth:1,curbWidth:.2,curbHeight:.1});
 assert.deepEqual(prof.submeshes.map(s=>s.materialSlot),[0,1,2,3,4]);
 assert(prof.vertexCount>withMarks.vertexCount);
 for(const invalid of [{lineWidth:4},{dashGap:-1},{dashLength:0},{heightOffset:-.01}])
   assert.throws(()=>buildRoadStripV2(cache,{...opts,generateMarkings:true,markingOptions:invalid}),/Invalid Road marking/);
 assert.throws(()=>buildRoadStripV2(cache,{...opts,surfaceMode:'clip',generateMarkings:true}),/require Continuous/);
 console.log('ROAD MARKINGS PASS: continuous edge lines, dashed center, same spline UV, multi-material and Bake glTF');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
