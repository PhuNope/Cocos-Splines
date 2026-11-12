'use strict';
/** Standalone 3/4-way asphalt-independent stop bars, zebra and turn guides. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'v2-junction-paint-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
  '--rootDir',path.join(root,'src-v2'),'--outDir',tmp,
  path.join(root,'src-v2/geometry/JunctionMarkingsV2.ts'),
  path.join(root,'src-v2/geometry/JunctionPatchV2.ts'),
  path.join(root,'src-v2/geometry/RoadMarkings.ts'),
  path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildJunctionMarkingsV2}=require(path.join(tmp,'geometry/JunctionMarkingsV2.js'));
 const {buildJunctionPatchV2}=require(path.join(tmp,'geometry/JunctionPatchV2.js'));
 const {appendRoadMarkingsV2}=require(path.join(tmp,'geometry/RoadMarkings.js'));
 const {exportMeshGltfV2}=require(path.join(tmp,'geometry/GltfExporter.js'));
 const {fingerprintMeshV2}=require(path.join(tmp,'geometry/MeshBuildPlan.js'));
 const r=(a,b)=>({position:a,uv0:b});
 const arms=n=>Array.from({length:n},(_,i)=>{
  const angle=i*2*Math.PI/n,forward={x:Math.sin(angle),y:0,z:Math.cos(angle)};
  const right={x:Math.cos(angle),y:0,z:-Math.sin(angle)},setback=3;
  const p=(side)=>({x:forward.x*setback+side*2*right.x,y:0,
     z:forward.z*setback+side*2*right.z});
  return {endpoint:{x:0,y:0,z:0},
   left:r(p(-1),{x:.1+i,y:.6}),
   middle:r(p(0),{x:.5+i,y:.6}),
   right:r(p(1),{x:.9+i,y:.6})};
 });
 for(const n of [3,4]){
  const branches=arms(n),base=buildJunctionPatchV2(branches).mesh;
  const opts={stopBars:true,crosswalks:true,guideRoutes:[{fromBranch:0,toBranch:1}]};
  const {mesh:paint,report}=buildJunctionMarkingsV2(branches,opts);
  assert.equal(report.stopBars,n);assert.equal(report.zebraStripes,n*3);
  assert.equal(report.guideRoutes,1);assert.equal(report.whiteTriangles,8*n);
  assert.equal(report.guideTriangles,48);
  assert.deepEqual(paint.submeshes.map(g=>g.materialSlot),[3,4]);
  assert.equal(paint.triangleCount,8*n+48);
  assert(paint.uv0.length===paint.uv2.length&&paint.positions.every(Number.isFinite));
  for(const sub of paint.submeshes)for(let k=0;k<sub.indices.length;k+=3){
   const [a,b,c]=[...sub.indices.slice(k,k+3)].map(i=>3*i),v=paint.positions;
   const y=(v[b+2]-v[a+2])*(v[c]-v[a])-(v[b]-v[a])*(v[c+2]-v[a+2]);
   assert(y>1e-8,'Junction paint triangle must face upward');
  }
  for(let i=1;i<paint.vertexCount;i++)
    assert(Math.abs(paint.positions[i*3+1]-.015)<1e-6,'All paint raised to avoid Z-fighting');
  const merged=appendRoadMarkingsV2(base,paint);
  assert.deepEqual(merged.submeshes.map(g=>g.materialSlot),[0,3,4]);
  assert.equal(merged.triangleCount,base.triangleCount+paint.triangleCount);
  assert.deepEqual(Array.from(merged.positions.slice(0,base.positions.length)),Array.from(base.positions),
    'Appending marks must not mutate/move the asphalt junction');
  assert.deepEqual(Array.from(merged.uv0.slice(0,base.uv0.length)),Array.from(base.uv0),
    'Appending marks must not change the junction asphalt UV phase');
  const gltf=JSON.parse(exportMeshGltfV2(merged).json);
  assert.deepEqual(gltf.extras.cocosSplinesV2.materialSlots,[0,3,4]);
  assert.equal(gltf.meshes[0].primitives.length,3);
  assert(gltf.meshes[0].primitives.every(x=>x.attributes.TEXCOORD_1!==undefined));
  const noGuide=buildJunctionMarkingsV2(branches,{stopBars:true,crosswalks:false,stopBarBranches:branches.map((_,i)=>i===1)});
  assert.equal(noGuide.report.stopBars,1);assert.equal(noGuide.report.zebraStripes,0);
  assert.equal(noGuide.mesh.triangleCount,2);
  const shifted=buildJunctionMarkingsV2(branches,{...opts,stopBarSetback:.30}).mesh;
  assert.notEqual(fingerprintMeshV2(paint),fingerprintMeshV2(shifted));
  assert.throws(()=>buildJunctionMarkingsV2(branches,{...opts,zebraStripeCount:20}),/does not fit/);
  assert.throws(()=>buildJunctionMarkingsV2(branches,{...opts,paintHeight:0}),/Invalid Junction Markings/);
  assert.throws(()=>buildJunctionMarkingsV2(branches,{...opts,guideRoutes:[{fromBranch:0,toBranch:0}]}),/invalid branch/);
  assert.throws(()=>buildJunctionMarkingsV2(branches,{...opts,guideRoutes:[{fromBranch:0,toBranch:4}]}),/invalid branch/);
  assert.throws(()=>buildJunctionMarkingsV2(branches,{stopBars:false,crosswalks:false}),/no enabled paint/);
  assert.throws(()=>buildJunctionMarkingsV2(branches,{stopBars:true,stopBarBranches:branches.map(()=>false)}),/generated no paint/);
 }
 console.log('JUNCTION MARKINGS V2 PASS: three/four-arm stop bars, zebra, opt-in guides, UV2, upward paint, material slots, unchanged asphalt UV and glTF.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
