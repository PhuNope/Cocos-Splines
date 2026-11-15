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
 const {buildRoadStripV2,inspectRoadLoopUVV2}=require(path.join(tmp,'geometry/RoadStrip.js'));
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
  assert(covered>1700,'Even a curvature-fitted hairpin must retain substantial road coverage');
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
 // Closed loops have a duplicate final frame. A nearby one-sided
 // sharp corner must constrain BOTH seam rings, not leave a visible gap.
 const closedFrames=[
  fakeClosed(0,0,0),fakeClosed(0,1,1),fakeClosed(0,2,2),
  fakeClosed(1,2,3),fakeClosed(2,2,4),fakeClosed(2,0,6),fakeClosed(0,0,8)
 ];
 const cyclicCorners=closedFrames.map((_,i)=>({
  right:{x:1,y:0,z:0},insideSign:i===1?1:0,
  insideLimit:i===1?.5:Infinity,angleRadians:0,isPinched:i===1
 }));
 const cyclic=buildRoadContinuousSectionsV2(closedFrames,2,{
  closed:true,cornerSections:cyclicCorners,widthSlope:.65
 });
 const seam0=cyclic.sections[0],seamLast=cyclic.sections.at(-1);
 assert(seam0.right<2,'One-sided pinch must influence the closed seam');
 assert(Math.abs(seam0.right-seamLast.right)<1e-10,
  'Closed Loop positive edge cannot split at the duplicate first/last frame');
 assert(Math.abs(seam0.left-seamLast.left)<1e-10,
  'Closed Loop negative edge cannot split at the duplicate first/last frame');
 for(let i=1;i<cyclic.sections.length;i++){
  const d=closedFrames[i].distance-closedFrames[i-1].distance;
  assert(Math.abs(cyclic.sections[i].right-cyclic.sections[i-1].right)<=.25*d+1e-6,
   'Closed Loop smoothing must preserve its conservative width slope');
 }
 const loop=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:true,
  knots:[k(0,0),k(0,2),k(2,2),k(3,0),k(1,-1)]});
 for(const axis of ['u','v']){
  const mesh=buildRoadStripV2(loop,{width:4,step:.2,
   surfaceMode:'continuous',uvLongitudinalAxis:axis});
  const frames=buildSplineFramesV2(loop,{maxStep:.2}).frames;
  assert.equal(mesh.vertexCount,frames.length*3);
  const final=frames.length-1;
  for(let side=0;side<3;side++){
   const firstVertex=side,lastVertex=3*final+side;
   for(let c=0;c<3;c++)assert(Math.abs(
    mesh.positions[3*firstVertex+c]-mesh.positions[3*lastVertex+c])<2e-5,
    'Closed Road seam position split on axis '+axis+' at side '+side);
   for(let c=0;c<2;c++)assert(Math.abs(
    mesh.uv0[2*firstVertex+c]-mesh.uv0[2*lastVertex+c]-
     (c===(axis==='u'?0:1)?-loop.length/5:0))<3e-5,
    'Closed Road UV0 must differ only by expected longitudinal distance');
   assert(Math.abs(mesh.uv2[2*firstVertex]-mesh.uv2[2*lastVertex])<2e-6);
   assert(Math.abs(mesh.uv2[2*firstVertex+1])<2e-6);
   assert(Math.abs(mesh.uv2[2*lastVertex+1]-1)<2e-6);
  }
 }
 // Opt-in closed-loop integer tile UVs; geometry and UV2 must be identical.
 const tiles=Math.max(1,Math.round(loop.length/5));
 const raw=inspectRoadLoopUVV2(loop.length,5,true,false);
 const fixed=inspectRoadLoopUVV2(loop.length,5,true,true);
 assert.equal(raw.enabled,false);
 assert.equal(raw.phaseMismatch,true,'Fractional loop UV tiles need a warning');
 assert(raw.phaseErrorTiles>.01);
 assert.equal(fixed.phaseMismatch,false);
 assert.equal(fixed.requiresRepeatSampler,true);
 assert(Math.abs(fixed.longitudinalTiles-tiles)<1e-5);
 assert(Math.abs(fixed.effectiveMetersPerRepeat-loop.length/tiles)<1e-9);
 assert.equal(inspectRoadLoopUVV2(loop.length,5,false,true),null);
 assert.throws(()=>inspectRoadLoopUVV2(loop.length,0,true,true),/uvMetersPerRepeat/);
 assert(Math.abs(loop.length/5-tiles)>.01,'Fixture must have noninteger default repeats');
 for(const axis of ['u','v']){
  const settings={width:4,step:.2,surfaceMode:'continuous',uvLongitudinalAxis:axis};
  const before=buildRoadStripV2(loop,settings);
  const after=buildRoadStripV2(loop,{...settings,closedLoopUVRepeat:true});
  const frames=buildSplineFramesV2(loop,{maxStep:.2}).frames;
  const lng=axis==='u'?0:1;
  assert.deepEqual(Array.from(after.positions),Array.from(before.positions));
  assert.deepEqual(Array.from(after.uv2),Array.from(before.uv2));
  assert.equal(after.triangleCount,before.triangleCount);
  assert.notDeepEqual(Array.from(after.uv0),Array.from(before.uv0));
  for(let i=0;i<frames.length;i++)for(let side=0;side<3;side++){
   const at=2*(3*i+side);
   assert(Math.abs(after.uv0[at+lng]-frames[i].distance/loop.length*tiles)<2e-5);
   assert(Math.abs(after.uv0[at+1-lng]-side/2)<2e-6);
  }
  const last=2*(after.vertexCount-1)+lng;
  assert(Math.abs(after.uv0[last]-tiles)<2e-5);
  assert(Math.abs(before.uv0[last]-loop.length/5)<2e-5);
  const gltf=JSON.parse(exportMeshGltfV2(after).json);
  assert(gltf.meshes[0].primitives[0].attributes.TEXCOORD_0!==undefined);
  assert(gltf.meshes[0].primitives[0].attributes.TEXCOORD_1!==undefined);
 }
 const open=buildSplineCacheV2({type:'linear',closed:false,knots:[k(0,0),k(0,13)]});
 assert.deepEqual(
  Array.from(buildRoadStripV2(open,{width:4,surfaceMode:'continuous'}).uv0),
  Array.from(buildRoadStripV2(open,{width:4,surfaceMode:'continuous',closedLoopUVRepeat:true}).uv0));
 const tube=buildTubeV2(hairpin,{radius:.5,step:.25,sides:12});
 assert(tube.vertexCount>0,'Extrude tube must remain independent');
 function fakeClosed(x,z,distance){return {position:{x,y:0,z},up:{x:0,y:1,z:0},
  right:{x:1,y:0,z:0},tangent:{x:0,y:0,z:1},distance};}
 const fake=(x,y,z,distance)=>({position:{x,y,z},up:{x:0,y:1,z:0},right:{x:1,y:0,z:0},tangent:{x:0,y:0,z:1},distance});
 const bridge=[fake(0,0,0,0),fake(0,0,4,4),fake(1,5,4,8),fake(1,5,0,12)];
 assert.equal(buildRoadContinuousSectionsV2(bridge,2).report.constrainedSections,0,'Do not shrink elevated crossings');
 for(const bad of [{clearanceSafety:0},{clearanceSafety:1},{widthSlope:-1}])
  assert.throws(()=>buildRoadContinuousSectionsV2(frames,2,bad),/Continuous/);
 const inspector=require(path.join(root,'src/contributions/inspector/RoadV2.js'));
 assert.match(inspector.template,/spl-v2-surfaceMode/);
 console.log('CONTINUOUS ROAD PASS: centre-anchored UV rings without clipping, U/V UV0, UV2, shoulders, curbs, height separation and glTF Bake.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
