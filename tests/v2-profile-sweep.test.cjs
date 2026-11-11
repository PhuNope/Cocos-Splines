'use strict';
const assert=require('node:assert/strict'),os=require('node:os'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const repo=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'v2-profile-'));
try{
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict','--outDir',tmp,
  path.join(repo,'src-v2/geometry/ProfileSweep.ts'),path.join(repo,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildSplineCacheV2}=require(path.join(tmp,'core/SplineCache.js'));
 const {buildRoadProfileV2,buildTubeV2,buildProfileSweepV2}=require(path.join(tmp,'geometry/ProfileSweep.js'));
 const {exportMeshGltfV2}=require(path.join(tmp,'geometry/GltfExporter.js'));
 const v=(x,y=0,z=0)=>({x,y,z}),k=(x,y=0,z=0)=>({position:v(x,y,z)});
 const near=(a,b,e=1e-4)=>assert(Math.abs(a-b)<=e,`${a} != ${b}`);
 const cache=buildSplineCacheV2({type:'linear',closed:false,knots:[k(0,0,0),k(0,0,10)]});
 const road=buildRoadProfileV2(cache,{width:4,shoulderWidth:1,curbWidth:.25,curbHeight:.2,step:1});
 assert.deepEqual(road.submeshes.map(x=>x.materialSlot),[0,1,2]);
 assert(road.triangleCount>40);
 assert(road.uv2?.length===road.vertexCount*2);
 near(road.min.x,-3.25);near(road.max.x,3.25);near(road.max.y,.2);
 for(let i=0;i<road.normals.length;i++)assert(Number.isFinite(road.normals[i]));
 const mid=buildRoadProfileV2(cache,{width:4});
 assert.equal(mid.submeshes.length,1);
 assert.equal(mid.submeshes[0].materialSlot,0);
 near(mid.min.x,-2);near(mid.max.x,2);
 const gltf=JSON.parse(exportMeshGltfV2(road).json);
 assert.equal(gltf.meshes[0].primitives.length,3,'Three material bands');
 assert(gltf.meshes[0].primitives.every(p=>p.attributes.TEXCOORD_1!==undefined));
 assert.deepEqual(gltf.extras.cocosSplinesV2.materialSlots,[0,1,2]);
 const tube=buildTubeV2(cache,{radius:2,sides:16,step:1,capEnds:true});
 assert.equal(tube.submeshes.length,1);
 near(tube.min.x,-2,1e-3);near(tube.max.x,2,1e-3);near(tube.min.y,-2,1e-3);
 assert(tube.triangleCount>=16*2*10+16*2);
 let hasOutward=false;
 for(let i=0;i<tube.vertexCount;i++){
  const x=tube.positions[3*i],y=tube.positions[3*i+1];
  const nx=tube.normals[3*i],ny=tube.normals[3*i+1];
  if(x>1.8&&Math.abs(y)<.2&&nx>.9)hasOutward=true;
 }
 assert(hasOutward,'Tube normals must point outward');
 const inverted=buildTubeV2(cache,{radius:2,sides:12,step:1,flipFaces:true});
 assert(inverted.normals[0]<-.9,'Flip should reverse normal');
 const helix=[0,1,2,3,4,5,6,7,8,9].map(i=>k(Math.cos(i*.6)*2,i*.7,Math.sin(i*.6)*2));
 const hc=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:false,knots:helix});
 const spiral=buildTubeV2(hc,{radius:.3,sides:8,step:.15,capEnds:false});
 assert(spiral.positions.every(Number.isFinite));assert(spiral.normals.every(Number.isFinite));
 assert(spiral.tangents.every(Number.isFinite));assert(spiral.vertexCount>500);
 assert.throws(()=>buildRoadProfileV2(cache,{width:-1}),/Invalid road/);
 assert.throws(()=>buildTubeV2(cache,{radius:1,sides:2}),/sides/);
 assert.throws(()=>buildProfileSweepV2(cache,{points:[{x:0,y:0},{x:1,y:0}],edgeMaterials:[0,1]}),/edgeMaterials/);
 assert.throws(()=>buildProfileSweepV2(cache,{points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],edgeMaterials:[0,0,0,0],closedProfile:true,capEnds:true,step:0}),/Invalid profile sweep/);
 const concave=[{x:0,y:0},{x:0,y:2},{x:1,y:1},{x:2,y:2},{x:2,y:0}];
 assert.throws(()=>buildProfileSweepV2(cache,{points:concave,edgeMaterials:[0,0,0,0,0],closedProfile:true,capEnds:true}),/convex/);
 console.log('V2 PROFILE SWEEP PASS: asphalt/shoulder/curb material slots, UV2, caps, outward normals, helix and invalid inputs.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
