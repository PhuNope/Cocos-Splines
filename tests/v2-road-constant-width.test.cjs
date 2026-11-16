'use strict';
/** Real 3 Knot fillet regression, preserving constant road width and uncut UVs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-road-constant-'));
try{
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict',
 '--rootDir',path.join(root,'src-v2'),'--outDir',dir,
 path.join(root,'src-v2/geometry/RoadStrip.ts'),
 path.join(root,'src-v2/geometry/ProfileSweep.ts'),
 path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildSplineCacheV2}=require(path.join(dir,'core/SplineCache.js'));
 const {buildSplineFramesV2}=require(path.join(dir,'core/SplineFrames.js'));
 const {buildRoadFilletCacheV2}=require(path.join(dir,'geometry/RoadFillet.js'));
 const {buildRoadStripV2}=require(path.join(dir,'geometry/RoadStrip.js'));
 const {buildRoadProfileV2}=require(path.join(dir,'geometry/ProfileSweep.js'));
 const {exportMeshGltfV2}=require(path.join(dir,'geometry/GltfExporter.js'));
 const {fingerprintMeshV2}=require(path.join(dir,'geometry/MeshBuildPlan.js'));
 const knot=(x,y,z)=>({position:{x,y,z}});
 const near=(a,b,t=2e-5)=>assert(Math.abs(a-b)<t,a+' not '+b);
 const source=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:false,
  knots:[knot(-1.701,0,-7.206),knot(-3.869,0,3.72),knot(5.82,0,4.347)]});
 const fillet=buildRoadFilletCacheV2(source,2,{maxArcStep:.25});
 assert.equal(fillet.report.filletedCorners,1);
 near(fillet.report.minimumRadius,2.7);
 assert(fillet.report.maxKnotDeviation>.5);
 assert.equal(fillet.cache.spline.type,'bezier');
 const opts={width:4,step:.25,surfaceMode:'fillet',adaptiveSampling:true,uvMetersPerRepeat:5,
  followSourceCurveInConstantWidth:false};
 for(const axis of ['u','v']){
  let report=null;
  const mesh=buildRoadStripV2(source,{...opts,uvLongitudinalAxis:axis,onFilletReport:x=>report=x});
  assert.equal(report.filletedCorners,1);
  const frames=buildSplineFramesV2(fillet.cache,{maxStep:.25}).frames;
  assert.equal(mesh.vertexCount,frames.length*3);
  assert.equal(mesh.triangleCount,(frames.length-1)*4,'Fillet must not cull inner quad triangles');
  for(let i=0;i<frames.length;i++){
    const f=frames[i],p=mesh.positions,get=(k,h)=>p[3*(3*i+k)+h];
    const w=Math.hypot(...[0,1,2].map(h=>get(2,h)-get(0,h)));
    near(w,4);
    for(let h=0;h<3;h++)near(get(1,h),f.position[['x','y','z'][h]]);
    for(let j=0;j<3;j++){
     const ix=2*(3*i+j);
     near(mesh.uv0[ix+(axis==='u'?0:1)],f.distance/5);
     near(mesh.uv0[ix+(axis==='u'?1:0)],j/2);
     near(mesh.uv2[ix],j/2);
     near(mesh.uv2[ix+1],f.distance/fillet.cache.length);
    }
  }
  const m=mesh.positions,inds=mesh.submeshes[0].indices;
  for(let k=0;k<inds.length;k+=3){
   const [a,b,c]=[inds[k],inds[k+1],inds[k+2]].map(i=>3*i);
   const abx=m[b]-m[a],abz=m[b+2]-m[a+2],acx=m[c]-m[a],acz=m[c+2]-m[a+2];
   assert((abz*acx-abx*acz)*mesh.normals[a+1]>0,'Inverted road triangle at '+k/3);
  }
  const gltf=JSON.parse(exportMeshGltfV2(mesh).json);
  assert.equal(gltf.meshes[0].primitives.length,1);
  assert(gltf.meshes[0].primitives[0].attributes.TEXCOORD_0!==undefined);
  assert(gltf.meshes[0].primitives[0].attributes.TEXCOORD_1!==undefined);
  const fitted=buildRoadStripV2(source,{...opts,surfaceMode:'continuous',uvLongitudinalAxis:axis});
  assert.notEqual(fingerprintMeshV2(mesh),fingerprintMeshV2(fitted));
 }
 // By default Constant Width must follow the author's true
 // Centripetal centreline (including its middle Knot), not Knot chords.
 for(const axis of ['u','v']){
  const settings={width:4,step:.25,surfaceMode:'fillet',adaptiveSampling:true,
   maxTurnAngleDegrees:6,maxChordError:.03,uvMetersPerRepeat:5,
   uvLongitudinalAxis:axis};
  const frames=buildSplineFramesV2(source,{maxStep:.25,
   maxAngleDegrees:6,maxChordError:.03}).frames;
  const road=buildRoadStripV2(source,settings);
  assert.equal(road.vertexCount,frames.length*3);
  assert.equal(road.triangleCount,4*(frames.length-1));
  const longitudinal=axis==='u'?0:1;
  for(let i=0;i<frames.length;i++){
   const f=frames[i],centre=3*(3*i+1),left=3*(3*i),right=3*(3*i+2);
   for(let k=0;k<3;k++)near(road.positions[centre+k],
    f.position[['x','y','z'][k]],4e-5);
   near(Math.hypot(...[0,1,2].map(k=>road.positions[right+k]-road.positions[left+k])),4,4e-5);
   near(road.uv0[2*(3*i+1)+longitudinal],f.distance/5,4e-5);
   near(road.uv2[2*(3*i+1)+1],f.distance/source.length,4e-5);
  }
  const oldMesh=buildRoadStripV2(source,{...settings,followSourceCurveInConstantWidth:false});
  assert.notDeepEqual(Array.from(road.positions),Array.from(oldMesh.positions));
  const decorated=buildRoadProfileV2(source,{...settings,shoulderWidth:1,
   curbWidth:.3,curbHeight:.2,generateMarkings:true});
  assert.deepEqual(decorated.submeshes.map(x=>x.materialSlot),[0,1,2,3,4]);
  assert.equal(JSON.parse(exportMeshGltfV2(decorated).json).meshes[0].primitives.length,5);
  assert(decorated.uv2.every(Number.isFinite));
 }
 const profile=buildRoadProfileV2(source,{...opts,shoulderWidth:1,curbWidth:.3,
  curbHeight:.2,generateMarkings:true});
 assert.deepEqual(profile.submeshes.map(s=>s.materialSlot),[0,1,2,3,4]);
 assert(profile.vertexCount>0&&profile.triangleCount>0);
 assert.equal(JSON.parse(exportMeshGltfV2(profile).json).meshes[0].primitives.length,5);
 const tooShort=buildSplineCacheV2({type:'linear',closed:false,
  knots:[knot(0,0,0),knot(0,0,1),knot(1,0,1)]});
 assert.throws(()=>buildRoadStripV2(tooShort,opts),/too short for radius/);
 assert.throws(()=>buildRoadProfileV2(tooShort,{...opts,shoulderWidth:1}),/too short for radius/);
 const square=buildSplineCacheV2({type:'linear',closed:true,
  knots:[knot(0,0,0),knot(12,0,0),knot(12,0,12),knot(0,0,12)]});
 assert.equal(buildRoadFilletCacheV2(square,2,{maxArcStep:.4}).report.filletedCorners,4);
 assert(buildRoadStripV2(square,{...opts,step:.4}).triangleCount>0);
 // Profile/markings use the filleted centreline length, NOT guide knots.
 for(const axis of ['u','v']){
  const settings={...opts,step:.4,shoulderWidth:1,curbWidth:.3,curbHeight:.2,
   generateMarkings:true,uvLongitudinalAxis:axis};
  const base=buildRoadProfileV2(square,settings);
  const fitted=buildRoadProfileV2(square,{...settings,closedLoopUVRepeat:true});
  const fillet=buildRoadFilletCacheV2(square,3.3,{maxArcStep:.4});
  const tiles=Math.max(1,Math.round(fillet.cache.length/5));
  const frames=buildSplineFramesV2(fillet.cache,{maxStep:.4}).frames;
  const lng=axis==='u'?0:1,lastRingVertex=2*(frames.length-1);
  assert(Math.abs(fitted.uv0[2*lastRingVertex+lng]-tiles)<2e-5);
  assert(Math.abs(base.uv0[2*lastRingVertex+lng]-fillet.cache.length/5)<2e-5);
  assert.deepEqual(Array.from(fitted.positions),Array.from(base.positions));
  assert.deepEqual(Array.from(fitted.uv2),Array.from(base.uv2));
  assert.deepEqual(fitted.submeshes.map(s=>s.materialSlot),[0,1,2,3,4]);
  const edges=fitted.submeshes.find(s=>s.materialSlot===4);
  assert(edges&&edges.indices.length>0);
  let maxMark=-Infinity;
  for(const ix of edges.indices)maxMark=Math.max(maxMark,fitted.uv0[2*ix+lng]);
  assert(Math.abs(maxMark-tiles)<2e-5,'Markings must share fitted UV0 repeat');
  assert.equal(JSON.parse(exportMeshGltfV2(fitted).json).meshes[0].primitives.length,5);
 }
 const grade=buildSplineCacheV2({type:'linear',closed:false,
  knots:[knot(0,0,0),knot(0,1,12),knot(12,3,12)]});
 assert(buildRoadStripV2(grade,opts).positions.every(Number.isFinite));
 const bezier=buildSplineCacheV2({type:'bezier',closed:false,knots:[knot(0,0,0),knot(12,0,0)]});
 assert.throws(()=>buildRoadStripV2(bezier,opts),/Bezier handles/);
 const bezierRoad=buildRoadStripV2(bezier,{width:4,step:.25,
  surfaceMode:'fillet',adaptiveSampling:true});
 assert(bezierRoad.vertexCount>0);
 assert(bezierRoad.uv0.every(Number.isFinite));
 console.log('V2 CONSTANT WIDTH PASS: authored curved centreline, fixed 4m width, legacy fillet opt-out, U/V UVs, profiles, Bezier and Bake');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
