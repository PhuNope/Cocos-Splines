'use strict';
/**
 * Coplanar ROAD self-overlap: count triangle coverage at interior sample
 * points. A valid union has exactly one visible triangle at each covered
 * point, never double textures / Z-fighting. No Cocos dependency.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-v2-overlap-'));
try{
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict','--outDir',temp,
  path.join(root,'src-v2/geometry/RoadOverlapClip.ts'),
  path.join(root,'src-v2/geometry/RoadStrip.ts'),
  path.join(root,'src-v2/geometry/ProfileSweep.ts'),
  path.join(root,'src-v2/geometry/MeshBuildPlan.ts')],{stdio:'pipe'});
 const {buildMeshV2}=require(path.join(temp,'geometry/MeshData.js'));
 const {resolveRoadOverlapV2}=require(path.join(temp,'geometry/RoadOverlapClip.js'));
 const {buildSplineCacheV2}=require(path.join(temp,'core/SplineCache.js'));
 const {buildRoadStripV2}=require(path.join(temp,'geometry/RoadStrip.js'));
 const {buildRoadProfileV2,buildTubeV2}=require(path.join(temp,'geometry/ProfileSweep.js'));
 const {fingerprintMeshV2}=require(path.join(temp,'geometry/MeshBuildPlan.js'));
 const points=[
  {x:0,y:0,z:0},{x:0,y:0,z:2},{x:2,y:0,z:0},
  {x:.5,y:0,z:0},{x:.5,y:0,z:2},{x:2.5,y:0,z:0}
 ];
 const make=(points,slots=[0,1])=>buildMeshV2({
  positions:points,
  normals:points.map(()=>({x:0,y:1,z:0})),
  uv0:points.map(p=>({x:p.x/5,y:p.z/5})),
  uv2:points.map(p=>({x:p.x/10,y:p.z/10})),
  submeshes:[{materialSlot:slots[0],indices:[0,1,2]},{materialSlot:slots[1],indices:[3,4,5]}]
 });
 function countAt(mesh,x,z){
  let count=0;
  const p=mesh.positions;
  for(const group of mesh.submeshes)for(let i=0;i<group.indices.length;i+=3){
   const a=group.indices[i],b=group.indices[i+1],c=group.indices[i+2];
   const get=(id)=>({x:p[3*id],z:p[3*id+2]});
   const pa=get(a),pb=get(b),pc=get(c);
   const cr=(u,v,w)=>(v.x-u.x)*(w.z-u.z)-(v.z-u.z)*(w.x-u.x);
   const s0=cr(pa,pb,{x,z}),s1=cr(pb,pc,{x,z}),s2=cr(pc,pa,{x,z});
   if((s0>1e-7&&s1>1e-7&&s2>1e-7)||(s0< -1e-7&&s1< -1e-7&&s2< -1e-7))count++;
  }
  return count;
 }
 const input=make(points);
 const result=resolveRoadOverlapV2(input,{roadWidth:2});
 assert(result.report.clippedSourceTriangles>0,'Overlap must actually be trimmed');
 assert(!result.report.hitSafetyLimit);
 assert(result.mesh.triangleCount>0);
 assert.deepEqual(result.mesh.submeshes.map(s=>s.materialSlot),[0,1]);
 let hadOverlap=false,checked=0;
 for(let i=0;i<87;i++)for(let j=0;j<73;j++){
  const x=(i+.261)/32,z=(j+.659)/32;
  const old=countAt(input,x,z),now=countAt(result.mesh,x,z);
  if(old>=2)hadOverlap=true;
  if(old>0&&now===0)throw Error('Road union left a hole at '+x+','+z);
  if(old===0&&now>0)throw Error('Road union expanded beyond source triangles at '+x+','+z);
  assert(now<=1,'Duplicate coplanar road faces at '+x+','+z+': '+now);
  checked++;
 }
 assert(hadOverlap,'Test triangles must overlap');
 for(let i=0;i<result.mesh.vertexCount;i++){
  const p=result.mesh.positions,u=result.mesh.uv0,lm=result.mesh.uv2;
  assert(Math.abs(u[2*i]-p[3*i]/5)<1e-5);
  assert(Math.abs(u[2*i+1]-p[3*i+2]/5)<1e-5);
  assert(Math.abs(lm[2*i]-p[3*i]/10)<1e-5);
  assert(Math.abs(lm[2*i+1]-p[3*i+2]/10)<1e-5);
 }
 assert.notEqual(fingerprintMeshV2(input),fingerprintMeshV2(result.mesh));
 const elevated=make(points.map((p,i)=>i>=3?{...p,y:3}:p));
 const elevatedResult=resolveRoadOverlapV2(elevated,{roadWidth:2});
 assert.strictEqual(elevatedResult.mesh,elevated,'A bridge over a road must not be clipped');
 assert.equal(elevatedResult.report.clippedSourceTriangles,0);
 assert.strictEqual(resolveRoadOverlapV2(input,{roadWidth:2,heightTolerance:0}).mesh!==input,true);
 for(const invalid of [{roadWidth:0},{roadWidth:2,heightTolerance:-1},{roadWidth:2,minUpComponent:2}])
  assert.throws(()=>resolveRoadOverlapV2(input,invalid),/Invalid/);

 const knot=(x,y,z)=>({position:{x,y,z}});
 const cache=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:false,
  knots:[knot(0,0,0),knot(0,0,2),knot(2,0,2),knot(2,0,0)]});
 const local=buildRoadStripV2(cache,{width:4,step:.15,resolvePlanarOverlaps:false});
 const global=buildRoadStripV2(cache,{width:4,step:.15});
 assert(global.triangleCount>0);
 assert.notEqual(fingerprintMeshV2(local),fingerprintMeshV2(global),'U-turn resolution must change geometry');
 for(let i=0;i<global.vertexCount;i++)
  assert(global.uv0[2*i]===global.uv0[2*i]&&global.uv2[2*i]===global.uv2[2*i]);
 let duplicateBefore=0;
 const oldCandidates=[];
 // Use 2D grid sampling over the U-turn to verify the road is a single surface.
 for(let ix=-15;ix<=30;ix++)for(let iz=-20;iz<=50;iz++){
  const x=(ix+.271)/15,z=(iz+.713)/15;
  const old=countAt(local,x,z),now=countAt(global,x,z);
  if(old>1)duplicateBefore++;
  assert(now<=1,'Same-plane U-turn must have at most one road face per location');
  if(old>0)assert(now>0,'U-turn union should not have a visible gap');
 }
 assert(duplicateBefore>0,'The scenario must have had true overlap');
 const withShoulder=buildRoadProfileV2(cache,{
  width:4,shoulderWidth:1,curbWidth:.3,curbHeight:.2,step:.15
 });
 assert(withShoulder.submeshes.some(s=>s.materialSlot===0));
 assert(withShoulder.submeshes.some(s=>s.materialSlot===1));
 assert(withShoulder.submeshes.some(s=>s.materialSlot===2));
 const tube=buildTubeV2(cache,{radius:.3,sides:8,step:.15});
 assert(tube.triangleCount>0,'Tube extrusion remains independent of planar clipping');
 console.log('V2 ROAD OVERLAP PASS: planar triangle-union coverage '+checked+
  ' raster samples, no duplicates/gaps, stable UV0/UV2, height-separated bridge, hairpin and material bands');
} finally{fs.rmSync(temp,{recursive:true,force:true});}
