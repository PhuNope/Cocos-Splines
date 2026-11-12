'use strict';
/** Regression of opt-in round, CONTINUOUS curb-top and vertical corner wall. */
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
  const input=all(count);
  const options={curbCornerMode:'rounded',curbCornerSegments:12,curbCornerPull:.32,
   uvMode:'matched',uvMetersPerRepeat:5,maxCurbHeight:.4};
  const {mesh,report}=buildJunctionPatchV2(input,options);
  assert.equal(report.roundedCurbCorners,count);
  assert.equal(report.curbWallTriangles,2*12*count);
  assert.deepEqual(mesh.submeshes.map(s=>s.materialSlot),[0,1,2]);
  assert(report.profileBands.curb>0&&report.profileBands.shoulder>0);
  assert(mesh.positions.every(Number.isFinite)&&mesh.normals.every(Number.isFinite));
  assert(mesh.tangents.every(Number.isFinite)&&mesh.uv2.every(Number.isFinite));
  assert(mesh.triangleCount>100);
  // The full Road profile cut ring, including high lip and the vertical foot,
  // is present in the generated geometry with modulo-1 Repeat UV continuity.
  for(const branch of input)for(const src of branch.profile.vertices){
   let matched=false;
   for(let j=0;j<mesh.vertexCount;j++){
    if(!near(mesh.positions[3*j],src.position.x)||
       !near(mesh.positions[3*j+1],src.position.y)||
       !near(mesh.positions[3*j+2],src.position.z))continue;
    const du=mesh.uv0[2*j]-src.uv0.x,dv=mesh.uv0[2*j+1]-src.uv0.y;
    if(near(du,Math.round(du))&&near(dv,Math.round(dv))){matched=true;break;}
   }
   assert(matched,'Exact Road profile boundary X/Y/Z/UV0 must be present');
  }
  for(const group of mesh.submeshes)for(let t=0;t<group.indices.length;t+=3){
   const pos=j=>({x:mesh.positions[j*3],y:mesh.positions[j*3+1],z:mesh.positions[j*3+2]});
   const [a,b,c]=Array.from(group.indices.slice(t,t+3),pos);
   const uv=(x,y,z)=>[x.x-y.x,x.y-y.y,x.z-y.z];
   const u=uv(b,a),v=uv(c,a),cross=[u[1]*v[2]-u[2]*v[1],
    u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
   assert(Math.hypot(...cross)>1e-8,'Nondegenerate curb/core triangles');
   if(group.materialSlot===2){
    assert(![a,b,c].some(p=>near(p.x,0)&&near(p.z,0)),
      'Continuous curb top/wall must NOT taper to Junction center');
   }
   if(group.materialSlot!==2)assert(cross[1]>1e-8,'Driveable patch faces upward');
  }
  // Both tessellation and shape must affect persisted Bake/fingerprint.
  const bake=JSON.parse(exportMeshGltfV2(mesh).json);
  assert.deepEqual(bake.extras.cocosSplinesV2.materialSlots,[0,1,2]);
  assert.equal(bake.extras.cocosSplinesV2.fingerprint,fingerprintMeshV2(mesh));
  const again=buildJunctionPatchV2(input,options).mesh;
  assert.deepEqual(Array.from(again.uv0),Array.from(mesh.uv0));
  const finer=buildJunctionPatchV2(input,{...options,curbCornerSegments:20}).mesh;
  assert(finer.triangleCount>mesh.triangleCount);
  assert.notEqual(fingerprintMeshV2(finer),fingerprintMeshV2(mesh));
  // Local curb ramp: drop only one chosen CORNER, never its Road endpoint
  // rings. Positions in XZ, UV0/UV2, indexes and material slots stay identical.
  const rampOptions={...options,curbRampPairs:[{fromBranch:0,toBranch:1}],
   curbRampMinLip:.015,curbRampMaxSlope:.35};
  const ramp=buildJunctionPatchV2(input,rampOptions);
  assert.equal(ramp.report.loweredCurbCorners,1);
  assert.equal(report.loweredCurbCorners,0);
  assert.equal(ramp.mesh.triangleCount,mesh.triangleCount);
  assert.deepEqual(ramp.mesh.submeshes.map(g=>g.materialSlot),[0,1,2]);
  assert.deepEqual(Array.from(ramp.mesh.uv0),Array.from(mesh.uv0),
   'Ramp must not alter existing Road/Junction Repeat texture UV0');
  assert.deepEqual(Array.from(ramp.mesh.uv2),Array.from(mesh.uv2),
   'Ramp must not change lightmap UV2');
  let dropped=0;
  for(let i=0;i<mesh.vertexCount;i++){
   assert(near(ramp.mesh.positions[3*i],mesh.positions[3*i]));
   assert(near(ramp.mesh.positions[3*i+2],mesh.positions[3*i+2]));
   const dy=ramp.mesh.positions[3*i+1]-mesh.positions[3*i+1];
   assert(dy<1e-5,'Ramp must never raise curb top');
   if(dy<-.03)dropped++;
  }
  assert(dropped>6,'Chosen corner should have a meaningful smooth curb drop');
  assert(ramp.mesh.positions.some((y,i)=>i%3===1&&y>.01&&y<.07),
   'Ramp center must retain a short, positive curb lip');
  for(const branch of input)for(const src of branch.profile.vertices){
   let exact=false;
   for(let j=0;j<ramp.mesh.vertexCount;j++){
    if(near(ramp.mesh.positions[3*j],src.position.x)&&
       near(ramp.mesh.positions[3*j+1],src.position.y)&&
       near(ramp.mesh.positions[3*j+2],src.position.z)){
     const u=ramp.mesh.uv0[2*j]-src.uv0.x,v=ramp.mesh.uv0[2*j+1]-src.uv0.y;
     if(near(u,Math.round(u))&&near(v,Math.round(v)))exact=true;
    }
   }
   assert(exact,'Curb ramp must keep every authored Road seam exactly');
  }
  assert.notEqual(fingerprintMeshV2(ramp.mesh),fingerprintMeshV2(mesh),
   'Changing ramp profile must invalidate Baked fingerprint');
  assert.deepEqual(Array.from(buildJunctionPatchV2(input,rampOptions).mesh.positions),
   Array.from(ramp.mesh.positions),'Ramp rebuild must be deterministic');
  assert.deepEqual(Array.from(buildJunctionPatchV2(input,{
   ...rampOptions,curbRampPairs:[{fromBranch:1,toBranch:0}]}).mesh.positions),
   Array.from(ramp.mesh.positions),'Road corner pair order must not matter');
  assert.equal(JSON.parse(exportMeshGltfV2(ramp.mesh).json).extras.cocosSplinesV2.fingerprint,
   fingerprintMeshV2(ramp.mesh));
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...rampOptions,curbRampPairs:[{fromBranch:0,toBranch:0}]}),/invalid Road branch/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...rampOptions,curbRampPairs:[{fromBranch:0,toBranch:5}]}),/invalid Road branch/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...rampOptions,curbRampPairs:[{fromBranch:0,toBranch:1},{fromBranch:1,toBranch:0}]}),
   /duplicate curb ramp/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...rampOptions,curbRampMinLip:0}),/invalid curb ramp/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   ...rampOptions,curbRampMaxSlope:.02}),/Max Slope/);
  assert.throws(()=>buildJunctionPatchV2(input,{
   curbRampPairs:[{fromBranch:0,toBranch:1}]}),/require Rounded/);
  if(count===4)assert.throws(()=>buildJunctionPatchV2(input,{
   ...rampOptions,curbRampPairs:[{fromBranch:0,toBranch:2}]}),/not adjacent/);
  const old=buildJunctionPatchV2(input,{maxCurbHeight:.4}).mesh;
  assert.notEqual(fingerprintMeshV2(old),fingerprintMeshV2(mesh));
  assert.throws(()=>buildJunctionPatchV2(input,{...options,curbCornerSegments:2}),/segments\/pull/);
  assert.throws(()=>buildJunctionPatchV2(input,{...options,curbCornerPull:.99}),/segments\/pull/);
  assert.throws(()=>buildJunctionPatchV2(input,{...options,gradeMode:'gentle'}),/flat Roads/);
  const banked=input.map((b,i)=>i?b:{...b,profile:{...b.profile,
   vertices:b.profile.vertices.map((p,j)=>j===0?
    {...p,position:{...p.position,y:p.position.y+.07}}:p)}});
  assert.throws(()=>buildJunctionPatchV2(banked,options),/level curb top|curb height/);
  const noCurb=input.map((b,i)=>i?b:{...b,profile:{
    vertices:[b.left,b.middle,b.right],edgeMaterials:[0,0]}});
  assert.throws(()=>buildJunctionPatchV2(noCurb,options),/requires curb width/);
 }
 console.log('JUNCTION ROUNDED CURB/RAMP PASS: flat 3/4 Road profiles, continuous top/wall, selected lowered corners, slope/UV seams, Bake, no radial taper and invalid inputs.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
