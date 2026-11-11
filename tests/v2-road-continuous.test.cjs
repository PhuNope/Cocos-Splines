'use strict';
/** Continuous Road must be a single UV strip, not Boolean-clipped fragments. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-v2-continuous-'));
try{
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict',
 '--rootDir',path.join(root,'src-v2'),'--outDir',tmp,
 path.join(root,'src-v2/geometry/RoadStrip.ts'),
 path.join(root,'src-v2/geometry/ProfileSweep.ts'),
 path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildSplineCacheV2}=require(path.join(tmp,'core/SplineCache.js'));
 const {buildSplineFramesV2}=require(path.join(tmp,'core/SplineFrames.js'));
 const {buildRoadContinuousSectionsV2}=require(path.join(tmp,'geometry/RoadContinuous.js'));
 const {buildRoadStripV2}=require(path.join(tmp,'geometry/RoadStrip.js'));
 const {buildRoadProfileV2,buildTubeV2}=require(path.join(tmp,'geometry/ProfileSweep.js'));
 const {exportMeshGltfV2}=require(path.join(tmp,'geometry/GltfExporter.js'));
 const k=(x,z,y=0)=>({position:{x,y,z}});
 const hairpin=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:false,
  knots:[k(0,0),k(0,2),k(2,2),k(2,0)]});
 function count(mesh,x,z,flatOnly=false){
  const p=mesh.positions;let result=0;
  for(const s of mesh.submeshes)for(let i=0;i<s.indices.length;i+=3){
   const a=3*s.indices[i],b=3*s.indices[i+1],c=3*s.indices[i+2];
   if(flatOnly&&(Math.abs(p[a+1])>.0005||Math.abs(p[b+1])>.0005||Math.abs(p[c+1])>.0005))continue;
   const cr=(a,b)=>(p[b]-p[a])*(z-p[a+2])-(p[b+2]-p[a+2])*(x-p[a]);
   const A=cr(a,b),B=cr(b,c),C=cr(c,a);
   if((A>1e-7&&B>1e-7&&C>1e-7)||(A< -1e-7&&B< -1e-7&&C< -1e-7))result++;
  }
  return result;
 }
 for(const step of [.1,.15,.25,.5,1])for(const axis of ['u','v']){
  const frames=buildSplineFramesV2(hairpin,{maxStep:step}).frames;
  const fitted=buildRoadContinuousSectionsV2(frames,2);
  assert(fitted.report.constrainedSections>0&&fitted.report.minimumWidthRatio<1);
  assert.equal(fitted.report.hitSafetyLimit,false);
  const mesh=buildRoadStripV2(hairpin,{width:4,step,surfaceMode:'continuous',uvLongitudinalAxis:axis});
  assert.equal(mesh.vertexCount,frames.length*3,'Keep left/centre/right rings without cut vertices');
  assert.equal(mesh.triangleCount,(frames.length-1)*4,'Two continuous half-width quads per ring segment');
  for(let i=0;i<frames.length;i++)for(let side=0;side<3;side++){
   const idx=2*(3*i+side),along=frames[i].distance/5,across=side/2;
   if(side===1){
    const pos=3*(3*i+side);
    assert(Math.abs(mesh.positions[pos]-frames[i].position.x)<1e-4);
    assert(Math.abs(mesh.positions[pos+2]-frames[i].position.z)<1e-4);
   }
   assert(Math.abs(mesh.uv0[idx]-(axis==='u'?along:across))<2e-6);
   assert(Math.abs(mesh.uv0[idx+1]-(axis==='u'?across:along))<2e-6);
   assert(Math.abs(mesh.uv2[idx]-across)<2e-6);
   assert(Math.abs(mesh.uv2[idx+1]-frames[i].distance/hairpin.length)<2e-6);
  }
  let overlap=0,covered=0;
  for(let x=-2;x<4;x+=.065)for(let z=-2;z<5;z+=.065){
   const n=count(mesh,x+.00073,z+.00017);
   if(n>1)overlap++;
   if(n>0)covered++;
  }
  assert.equal(overlap,0,'No overlapping surface on the tight U-turn');
  assert(covered>3000,'The strip must not disappear or collapse');
  const gltf=JSON.parse(exportMeshGltfV2(mesh).json);
  assert(gltf.meshes[0].primitives[0].attributes.TEXCOORD_0!==undefined);
  assert(gltf.meshes[0].primitives[0].attributes.TEXCOORD_1!==undefined);
 }
 const straight=buildSplineCacheV2({type:'linear',closed:false,knots:[k(0,0),k(0,12)]});
 const continuous=buildRoadStripV2(straight,{width:4,surfaceMode:'continuous'});
 const original=buildRoadStripV2(straight,{width:4,surfaceMode:'clip',resolvePlanarOverlaps:false});
 assert.equal(continuous.vertexCount,(original.vertexCount/2)*3);
 for(let i=0;i<original.vertexCount/2;i++){
  for(const [j,k] of [[0,0],[2,1]]){
   for(let c=0;c<3;c++)
    assert(Math.abs(continuous.positions[3*(3*i+j)+c]-original.positions[3*(2*i+k)+c])<1e-5);
   for(let c=0;c<2;c++)
    assert(Math.abs(continuous.uv0[2*(3*i+j)+c]-original.uv0[2*(2*i+k)+c])<1e-5);
  }
 }
 const frames=buildSplineFramesV2(hairpin,{maxStep:.15}).frames;
 const sections=buildRoadContinuousSectionsV2(frames,2).sections;
 for(let i=1;i<sections.length;i++){
  const d=frames[i].distance-frames[i-1].distance;
  assert(Math.abs(sections[i].left-sections[i-1].left)<=.65*d+1e-6);
  assert(Math.abs(sections[i].right-sections[i-1].right)<=.65*d+1e-6);
 }
 for(const step of [.15,.25]){
  const profile=buildRoadProfileV2(hairpin,{width:4,step,shoulderWidth:1,
   curbWidth:.3,curbHeight:.2,uvLongitudinalAxis:'u',surfaceMode:'continuous'});
  assert.deepEqual(profile.submeshes.map(s=>s.materialSlot),[0,1,2]);
  assert(profile.vertexCount>0&&profile.triangleCount>0);
  assert.equal(profile.uv0.length,profile.uv2.length);
  assert(Array.from(profile.positions).every(Number.isFinite));
  assert(Array.from(profile.tangents).every(Number.isFinite));
  assert.equal(JSON.parse(exportMeshGltfV2(profile).json).meshes[0].primitives.length,3);
  let over=0;
  for(let x=-2;x<4;x+=.065)for(let z=-2;z<5;z+=.065)
   if(count(profile,x+.00073,z+.00017,true)>1)over++;
  assert.equal(over,0,'Asphalt and flat shoulders should not double-cover the U-turn');
 }
 const tube=buildTubeV2(hairpin,{radius:.5,step:.25,sides:12});
 assert(tube.vertexCount>0,'Extrude tube must remain independent');
 const fake=(x,y,z,distance)=>({position:{x,y,z},up:{x:0,y:1,z:0},right:{x:1,y:0,z:0},tangent:{x:0,y:0,z:1},distance});
 const bridge=[fake(0,0,0,0),fake(0,0,4,4),fake(1,5,4,8),fake(1,5,0,12)];
 assert.equal(buildRoadContinuousSectionsV2(bridge,2).report.constrainedSections,0,'Do not shrink elevated crossings');
 for(const bad of [{clearanceSafety:0},{clearanceSafety:1},{widthSlope:-1}])
  assert.throws(()=>buildRoadContinuousSectionsV2(frames,2,bad),/Continuous/);
 const inspector=require(path.join(root,'src/contributions/inspector/RoadV2.js'));
 assert.match(inspector.template,/spl-v2-surfaceMode/);
 console.log('CONTINUOUS ROAD PASS: centre-anchored UV rings without clipping, U/V UV0, UV2, shoulders, curbs, height separation and glTF Bake.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
