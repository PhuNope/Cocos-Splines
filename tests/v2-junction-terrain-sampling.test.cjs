'use strict';
/** Regression of sampled heightfield outer sidewalk/terrain edge via actual trimmed Road profiles. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
    path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-curb-corner-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
  '--rootDir',path.join(root,'src-v2'),'--outDir',dir,
  path.join(root,'src-v2/geometry/JunctionPatchV2.ts'),
  path.join(root,'src-v2/geometry/RoadStrip.ts'),
  path.join(root,'src-v2/geometry/ProfileSweep.ts'),
  path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildSplineCacheV2}=require(path.join(dir,'core/SplineCache.js'));
 const {buildRoadProfileV2,roadProfileLayoutV2}=require(path.join(dir,'geometry/ProfileSweep.js'));
 const {buildJunctionPatchV2}=require(path.join(dir,'geometry/JunctionPatchV2.js'));
 const {exportMeshGltfV2}=require(path.join(dir,'geometry/GltfExporter.js'));
 const {fingerprintMeshV2}=require(path.join(dir,'geometry/MeshBuildPlan.js'));
 const knot=(x,y,z)=>({position:{x,y,z}});
 const near=(a,b,eps=4e-5)=>Math.abs(a-b)<eps;
 const point=(mesh,i)=>({position:{x:mesh.positions[i*3],y:mesh.positions[i*3+1],z:mesh.positions[i*3+2]},
  uv0:{x:mesh.uv0[i*2],y:mesh.uv0[i*2+1]}});
 const all=count=>Array.from({length:count},(_,i)=>{
  const rad=i*2*Math.PI/count,out={x:Math.sin(rad),z:Math.cos(rad)},atEnd=i%2===1;
  const cache=buildSplineCacheV2({type:'linear',closed:false,knots:atEnd?
    [knot(out.x*12,0,out.z*12),knot(0,0,0)]:
    [knot(0,0,0),knot(out.x*12,0,out.z*12)]});
  const layout=roadProfileLayoutV2(4,.45,.22,.16,true);
  const mesh=buildRoadProfileV2(cache,{width:4,shoulderWidth:.45,curbWidth:.22,curbHeight:.16,
   surfaceMode:'fillet',step:.25,uvMetersPerRepeat:5,
   uvLongitudinalAxis:i%2?'u':'v',
   junctionStartTrim:atEnd?0:4,junctionEndTrim:atEnd?4:0});
  const asphalt=mesh.submeshes.find(s=>s.materialSlot===0);
  assert(asphalt);
  const rings=asphalt.indices.length/12+1;
  const vertex=(edge,end)=>point(mesh,edge*2*rings+2*(atEnd?rings-1:0)+(end?1:0));
  const profile=[vertex(0,false)];
  for(let j=0;j<layout.edgeMaterials.length;j++)profile.push(vertex(j,true));
  assert.equal(profile.length,layout.points.length);
  const index=x=>layout.points.findIndex(p=>p.x===x&&p.y===0);
  const left=profile[index(-2)],middle=profile[index(0)],right=profile[index(2)];
  assert(left&&middle&&right);
  return {endpoint:{x:0,y:0,z:0},left,middle,right,
   profile:{vertices:profile,edgeMaterials:layout.edgeMaterials}};
 });


 for(const count of [3,4]){
  const input=all(count),segments=16,repeat=5;
  const settings={curbCornerMode:'rounded',curbCornerSegments:segments,
    curbCornerPull:.32,uvMode:'matched',uvMetersPerRepeat:repeat,maxCurbHeight:.4,
    sidewalkApronWidth:1,sidewalkMaxCrossSlope:.35};
  const flat=buildJunctionPatchV2(input,{...settings,sidewalkTerrainHeightOffset:0});
  const height=(x,z)=>.025*Math.sin(.68*x)+.018*Math.cos(.45*z);
  let calls=0;
  const sampled={...settings,sidewalkTerrainMode:'sample',
    sidewalkTerrainHeightOffset:.015,sidewalkMaxEdgeSlope:.35,
    sidewalkTerrainSampler:(x,z)=>{calls++;return height(x,z)}};
  const {mesh,report}=buildJunctionPatchV2(input,sampled);
  assert.equal(calls,count*(segments+1),'Sample every outer vertex at the actual XZ station');
  assert.equal(report.sidewalkApronCorners,count);
  assert.equal(report.sidewalkApronTriangles,count*segments*2);
  assert.equal(mesh.triangleCount,flat.mesh.triangleCount);
  assert.deepEqual(mesh.submeshes.map(s=>s.materialSlot),[0,1,2,5]);
  assert.deepEqual(Array.from(mesh.uv0),Array.from(flat.mesh.uv0),
   'Terrain sampling must not shift UV0 or change road repeat phase');
  assert.deepEqual(Array.from(mesh.uv2),Array.from(flat.mesh.uv2),
   'Terrain sampling must not change UV2 coordinate mapping');
  let altered=0;
  for(let k=0;k<mesh.vertexCount;k++){
   assert(near(mesh.positions[3*k],flat.mesh.positions[3*k]));
   assert(near(mesh.positions[3*k+2],flat.mesh.positions[3*k+2]));
   if(Math.abs(mesh.positions[3*k+1]-flat.mesh.positions[3*k+1])>1e-5)altered++;
  }
  assert(altered>count*segments,'Heightfield must change outer rail geometry without moving xz/UV');
  const apron=mesh.submeshes.find(g=>g.materialSlot===5);
  let boundary=0,inner=0;
  for(const id of apron.indices){
   const x=mesh.positions[3*id],y=mesh.positions[3*id+1],z=mesh.positions[3*id+2];
   const v=mesh.uv0[2*id+1];
   if(near(v,1/repeat,1e-6)){
    assert(near(y,height(x,z)+.015,5e-5),
     'Each apron OUTER vertex must land on sampled Terrain height + offset');
    boundary++;
   }else if(near(v,0,1e-6)){
    inner++;
   }else assert.fail('Unexpected sidewalk V coordinate');
  }
  assert(boundary>count*segments&&inner>count*segments);
  for(const group of mesh.submeshes)for(let t=0;t<group.indices.length;t+=3){
   if(group.materialSlot!==5)continue;
   const at=j=>({x:mesh.positions[3*j],y:mesh.positions[3*j+1],z:mesh.positions[3*j+2]});
   const [a,b,c]=Array.from(group.indices.slice(t,t+3),at);
   const crossY=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);
   assert(crossY>1e-8,'Terrain-sampled apron faces upward, not inverted');
  }
  // Sampling is deterministic for identical input heights and affected by
  // terrain edits, making the Baked fingerprint stale on next explicit Bake.
  const another=buildJunctionPatchV2(input,sampled).mesh;
  assert.deepEqual(Array.from(another.positions),Array.from(mesh.positions));
  assert.notEqual(fingerprintMeshV2(flat.mesh),fingerprintMeshV2(mesh));
  const edited=buildJunctionPatchV2(input,{...sampled,
   sidewalkTerrainSampler:(x,z)=>height(x,z)+.03}).mesh;
  assert.notEqual(fingerprintMeshV2(edited),fingerprintMeshV2(mesh));
  assert.equal(JSON.parse(exportMeshGltfV2(mesh).json).extras.cocosSplinesV2.fingerprint,
   fingerprintMeshV2(mesh));
  // Inputs must fail closed. Never substitute flat terrain when the user
  // explicitly selected heightfield sampling.
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...settings,sidewalkTerrainMode:'sample'}),/requires enabled Apron Width and valid Terrain sampler/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...sampled,sidewalkTerrainSampler:()=>null}),/outside Terrain bounds/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...sampled,sidewalkTerrainSampler:()=>NaN}),/non-finite sampled height/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...sampled,sidewalkTerrainSampler:()=>{throw Error('mock terrain disconnected')}}),
   /mock terrain disconnected/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...sampled,sidewalkTerrainSampler:(x)=>.18*Math.sin(8*x)}),
   /Max Edge Slope/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...sampled,sidewalkTerrainSampler:()=>-1}),/Max Cross Slope/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...sampled,sidewalkMaxEdgeSlope:1.1}),/invalid sidewalk apron/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...sampled,sidewalkApronWidth:0}),/requires enabled Apron Width/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...sampled,sidewalkTerrainMode:'invalid'}),/invalid sidewalk apron/);
 }
 const component=fs.readFileSync(path.join(root,
  'assets/splines-v2/Components/SplineJunctionPatchV2.ts'),'utf8');
 assert.match(component,/getHeightAt\(terrainLocal\.x,terrainLocal\.z\)/);
 assert.match(component,/new Vec3\(terrainLocal\.x,height,terrainLocal\.z\)/);
 assert.match(component,/terrain\.node\.worldMatrix/);
 assert.match(component,/sidewalkTerrainSampler:terrainSample/);
 assert.match(component,/sidewalkTerrainMode=JunctionTerrainEdgeModeV2.FlatHeight/);
 assert.match(component,/Sample Terrain requires upright Junction\/Terrain/);
 const inspector=require(path.join(root,'src/contributions/inspector/JunctionV2.js'));
 assert.match(inspector.template,/spl-v2-sidewalkTerrainMode/);
 assert.match(inspector.template,/spl-v2-sidewalkTerrainSource/);
 assert.match(inspector.template,/spl-v2-sidewalkMaxEdgeSlope/);
 console.log('JUNCTION HEIGHTMAP SAMPLING PASS: 3/4 corners, exact outer Terrain vertices, UV0/UV2/Bake, invalid/null/steep data, Cocos Terrain bridge.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
