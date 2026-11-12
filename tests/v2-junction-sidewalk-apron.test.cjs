'use strict';
/** Regression of optional outer sidewalk/terrain edge via actual trimmed Road profiles. */
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
  const input=all(count),segments=12,width=1;
  const settings={curbCornerMode:'rounded',curbCornerSegments:segments,
    curbCornerPull:.32,uvMode:'matched',uvMetersPerRepeat:5,maxCurbHeight:.4};
  const base=buildJunctionPatchV2(input,settings);
  const options={...settings,sidewalkApronWidth:width,
    sidewalkTerrainHeightOffset:0,sidewalkMaxCrossSlope:.35};
  const {mesh,report}=buildJunctionPatchV2(input,options);
  assert.equal(report.sidewalkApronCorners,count);
  assert.equal(report.sidewalkApronTriangles,count*segments*2);
  assert.equal(mesh.triangleCount,base.mesh.triangleCount+count*segments*2);
  assert.deepEqual(mesh.submeshes.map(s=>s.materialSlot),[0,1,2,5]);
  assert(mesh.positions.every(Number.isFinite)&&mesh.normals.every(Number.isFinite));
  assert(mesh.tangents.every(Number.isFinite)&&mesh.uv2.every(Number.isFinite));
  assert.equal(mesh.vertexCount,base.mesh.vertexCount+count*segments*6);
  // The new outer-edge strip must not alter the original exact Road ring
  // UV positions even under alternate source Road U/V longitudinal axes.
  for(const branch of input)for(const source of branch.profile.vertices){
   let found=false;
   for(let j=0;j<mesh.vertexCount;j++){
    const xyz=j*3,uv=j*2;
    if(!near(mesh.positions[xyz],source.position.x)||
       !near(mesh.positions[xyz+1],source.position.y)||
       !near(mesh.positions[xyz+2],source.position.z))continue;
    const du=mesh.uv0[uv]-source.uv0.x,dv=mesh.uv0[uv+1]-source.uv0.y;
    if(near(du,Math.round(du))&&near(dv,Math.round(dv)))found=true;
   }
   assert(found,'Exterior sidewalk must preserve the exact source Road cut ring and UV0');
  }
  const apron=mesh.submeshes.find(s=>s.materialSlot===5);
  assert.equal(apron.indices.length,count*segments*6);
  let slopeFaces=0,terrainVertices=0,curveVertices=0;
  for(let i=0;i<apron.indices.length;i+=3){
   const p=id=>({x:mesh.positions[id*3],y:mesh.positions[id*3+1],z:mesh.positions[id*3+2]});
   const [a,b,c]=Array.from(apron.indices.slice(i,i+3),p);
   const v={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
   const w={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
   const normal={x:v.y*w.z-v.z*w.y,y:v.z*w.x-v.x*w.z,z:v.x*w.y-v.y*w.x};
   assert(normal.y>1e-8,'Apron surface must face +Y and never fold');
   assert(Math.hypot(normal.x,normal.y,normal.z)>1e-8);
   if(Math.abs(normal.x)+Math.abs(normal.z)>1e-5)slopeFaces++;
   for(const pt of [a,b,c]){
    if(near(pt.y,0,1e-5)&&Math.hypot(pt.x,pt.z)>5)terrainVertices++;
    if(near(pt.y,.16)&&Math.hypot(pt.x,pt.z)<6)curveVertices++;
    assert(pt.y>=-1e-5&&pt.y<=.16+1e-5);
   }
  }
  assert(terrainVertices>count*segments,'Apron must reach the explicit level terrain edge');
  assert(curveVertices>0,'Apron inner edge must meet existing top curb rail');
  assert(slopeFaces>count*segments,'Apron should slope toward the target terrain plane');
  assert.equal(JSON.parse(exportMeshGltfV2(mesh).json).extras.cocosSplinesV2.fingerprint,
   fingerprintMeshV2(mesh));
  assert.deepEqual(Array.from(buildJunctionPatchV2(input,options).mesh.positions),
   Array.from(mesh.positions),'Apron rebuilding must be deterministic');
  assert.notEqual(fingerprintMeshV2(base.mesh),fingerprintMeshV2(mesh));
  const shorter=buildJunctionPatchV2(input,{...options,sidewalkApronWidth:.8}).mesh;
  assert.notEqual(fingerprintMeshV2(shorter),fingerprintMeshV2(mesh));
  const raised=buildJunctionPatchV2(input,{
   ...options,sidewalkTerrainHeightOffset:.07}).mesh;
  assert.notEqual(fingerprintMeshV2(raised),fingerprintMeshV2(mesh));
  const ramped=buildJunctionPatchV2(input,{
    ...options,curbRampPairs:[{fromBranch:0,toBranch:1}]});
  assert.equal(ramped.report.loweredCurbCorners,1);
  assert.equal(ramped.report.sidewalkApronCorners,count);
  assert.equal(ramped.report.sidewalkApronTriangles,count*segments*2);
  assert.deepEqual(ramped.mesh.submeshes.map(s=>s.materialSlot),[0,1,2,5]);
  assert.throws(()=>buildJunctionPatchV2(input,{...options,sidewalkApronWidth:.2}),/invalid sidewalk apron/);
  assert.throws(()=>buildJunctionPatchV2(input,{...options,sidewalkApronWidth:7}),/invalid sidewalk apron/);
  assert.throws(()=>buildJunctionPatchV2(input,{...options,sidewalkMaxCrossSlope:.03}),/Max Cross Slope/);
  assert.throws(()=>buildJunctionPatchV2(input,{...options,sidewalkTerrainHeightOffset:3}),/invalid sidewalk apron/);
  assert.throws(()=>buildJunctionPatchV2(input,{...options,gradeMode:'gentle'}),/flat Roads/);
  assert.throws(()=>buildJunctionPatchV2(input,{...options,curbCornerMode:'radial'}),/require Rounded/);
 }
 console.log('JUNCTION SIDEWALK APRON PASS: 3/4 Road joints, curb/terrain rail geometry, top-facing normals, UV0/UV2, ramps, Bake and constraints.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
