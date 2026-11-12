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
 const opts={width:4,step:.25,surfaceMode:'fillet',adaptiveSampling:true,uvMetersPerRepeat:5};
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
 const grade=buildSplineCacheV2({type:'linear',closed:false,
  knots:[knot(0,0,0),knot(0,1,12),knot(12,3,12)]});
 assert(buildRoadStripV2(grade,opts).positions.every(Number.isFinite));
 const bezier=buildSplineCacheV2({type:'bezier',closed:false,knots:[knot(0,0,0),knot(12,0,0)]});
 assert.throws(()=>buildRoadStripV2(bezier,opts),/Bezier handles/);
 console.log('V2 CONSTANT WIDTH PASS: exact Knot radius, fixed 4m full width, U/V uncut UV0, UV2, no lost triangles, profile material bands, paint and glTF Bake');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
