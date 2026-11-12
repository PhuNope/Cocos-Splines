'use strict';
/** Exact 3D/Repeat-UV sidewalk seams from trimmed Road outer curb to Junction corners. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
  path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-sidewalk-network-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
  '--rootDir',path.join(root,'src-v2'),'--outDir',dir,
  path.join(root,'src-v2/geometry/JunctionPatchV2.ts'),
  path.join(root,'src-v2/geometry/RoadSidewalkV2.ts'),
  path.join(root,'src-v2/geometry/ProfileSweep.ts'),
  path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildSplineCacheV2}=require(path.join(dir,'core/SplineCache.js'));
 const {buildRoadProfileV2,roadProfileLayoutV2}=require(path.join(dir,'geometry/ProfileSweep.js'));
 const {buildRoadSidewalkV2}=require(path.join(dir,'geometry/RoadSidewalkV2.js'));
 const {buildJunctionPatchV2}=require(path.join(dir,'geometry/JunctionPatchV2.js'));
 const {appendRoadMarkingsV2}=require(path.join(dir,'geometry/RoadMarkings.js'));
 const {fingerprintMeshV2}=require(path.join(dir,'geometry/MeshBuildPlan.js'));
 const {exportMeshGltfV2}=require(path.join(dir,'geometry/GltfExporter.js'));
 const knot=(x,y,z)=>({position:{x,y,z}});
 const near=(a,b,t=6e-5)=>Math.abs(a-b)<t;
 const at=(m,i)=>({position:{x:m.positions[i*3],y:m.positions[i*3+1],z:m.positions[i*3+2]},
   uv0:{x:m.uv0[i*2],y:m.uv0[i*2+1]}});
 const w=1,repeat=5;
 const build=(count)=>Array.from({length:count},(_,i)=>{
  const rad=i*2*Math.PI/count,dir={x:Math.sin(rad),z:Math.cos(rad)},atEnd=i%2===1;
  const cache=buildSplineCacheV2({type:'linear',closed:false,knots:atEnd?
   [knot(dir.x*12,0,dir.z*12),knot(0,0,0)]:
   [knot(0,0,0),knot(dir.x*12,0,dir.z*12)]});
  const axis=i%2?'u':'v';
  const opts={width:4,shoulderWidth:.45,curbWidth:.22,curbHeight:.16,
   surfaceMode:'fillet',step:.25,uvMetersPerRepeat:repeat,
   uvLongitudinalAxis:axis,junctionStartTrim:atEnd?0:4,junctionEndTrim:atEnd?4:0};
  const base=buildRoadProfileV2(cache,opts);
  const sidewalk=buildRoadSidewalkV2(base,{
   width:w,roadWidth:4,shoulderWidth:.45,curbWidth:.22,curbHeight:.16,
   uvMetersPerRepeat:repeat,uvLongitudinalAxis:axis,terrainMode:'flat',
   terrainHeightOffset:0,maxCrossSlope:.35,maxEdgeSlope:.35
  });
  const joined=appendRoadMarkingsV2(base,sidewalk.mesh);
  assert(joined.triangleCount>base.triangleCount);
  assert.deepEqual(joined.submeshes.map(s=>s.materialSlot),[0,1,2,5]);
  assert.deepEqual(Array.from(joined.positions.slice(0,base.positions.length)),
   Array.from(base.positions),'Original Road body must not move under sidewalk append');
  const rings=base.submeshes.find(g=>g.materialSlot===0).indices.length/12+1;
  assert.equal(sidewalk.report.rings,rings);
  assert.equal(sidewalk.report.triangles,4*(rings-1));
  const layout=roadProfileLayoutV2(4,.45,.22,.16,true);
  const boundary=(edge,second)=>at(base,edge*2*rings+2*(atEnd?rings-1:0)+(second?1:0));
  const profile=[boundary(0,false)];
  for(let e=0;e<layout.edgeMaterials.length;e++)profile.push(boundary(e,true));
  const match=x=>profile[layout.points.findIndex(p=>p.x===x&&p.y===0)];
  const source={endpoint:{x:0,y:0,z:0},
   left:match(-2),middle:match(0),right:match(2),
   profile:{vertices:profile,edgeMaterials:layout.edgeMaterials},
   sidewalkStation:axis==='u'?profile[0].uv0.x:profile[0].uv0.y};
  const outerPositions=[];
  for(const [outer,high] of [[profile[0],profile[1]],
   [profile[profile.length-1],profile[profile.length-2]]]){
   const dx=outer.position.x-high.position.x,dz=outer.position.z-high.position.z;
   const norm=Math.hypot(dx,dz);
   const expected={x:outer.position.x+w*dx/norm,y:0,z:outer.position.z+w*dz/norm};
   outerPositions.push(expected);
   let found=false;
   for(let j=0;j<sidewalk.mesh.vertexCount;j++){
    const p=at(sidewalk.mesh,j),u=p.uv0;
    if(near(p.position.x,expected.x)&&near(p.position.y,expected.y)&&
       near(p.position.z,expected.z)&&near(u.y,w/repeat)&&
       near(u.x,source.sidewalkStation))found=true;
   }
   assert(found,'Road sidewalk endpoint must be exactly source Road curb lateral + Width');
  }
  const gltf=JSON.parse(exportMeshGltfV2(joined).json);
  assert.deepEqual(gltf.extras.cocosSplinesV2.materialSlots,[0,1,2,5]);
  assert.equal(gltf.extras.cocosSplinesV2.fingerprint,fingerprintMeshV2(joined));
  return {source,outerPositions,base,sidewalk,joined,opts,axis};
 });
 for(const count of [3,4]){
  const roads=build(count);
  const branches=roads.map(r=>r.source);
  const joined=buildJunctionPatchV2(branches,{
    curbCornerMode:'rounded',curbCornerSegments:16,curbCornerPull:.32,
    uvMetersPerRepeat:repeat,sidewalkApronWidth:w,
    sidewalkRoadJoin:true,sidewalkMaxCrossSlope:.35,
    sidewalkTerrainHeightOffset:0,maxCurbHeight:.4
  });
  const mesh=joined.mesh;
  assert.equal(joined.report.sidewalkApronCorners,count);
  assert.deepEqual(mesh.submeshes.map(g=>g.materialSlot),[0,1,2,5]);
  const sub=mesh.submeshes.find(g=>g.materialSlot===5);
  // Compare ALL Road outer cut edges (left/right, 2 per arm) with
  // Junction apron outer corner endpoints, including UV phase modulo 1.
  for(const r of roads)for(const p of r.outerPositions){
   let match=false;
   for(const idx of sub.indices){
    const v=at(mesh,idx);
    const phase=v.uv0.x-r.source.sidewalkStation;
    if(near(v.position.x,p.x)&&near(v.position.y,p.y)&&near(v.position.z,p.z)&&
       near(v.uv0.y,w/repeat)&&near(phase,Math.round(phase))){
      match=true;break;
    }
   }
   assert(match,'Junction must share Road sidewalk OUTER X/Y/Z and tile phase at every trim ring');
  }
  for(let i=0;i<sub.indices.length;i+=3){
   const [a,b,c]=Array.from(sub.indices.slice(i,i+3),j=>at(mesh,j).position);
   const crossY=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);
   assert(crossY>1e-8,'Joined sidewalk corner faces must not be inverted');
  }
  // Terrain readback for both Road-length and Junction apron uses identical
  // world height at common source seam positions (identity transforms here).
  const h=(x,z)=>.017*Math.sin(.7*x)+.01*Math.cos(.33*z);
  const terrainJunction=buildJunctionPatchV2(branches,{
   curbCornerMode:'rounded',curbCornerSegments:16,curbCornerPull:.32,
   uvMetersPerRepeat:repeat,sidewalkApronWidth:w,sidewalkRoadJoin:true,
   sidewalkTerrainMode:'sample',sidewalkTerrainSampler:h,
   sidewalkMaxCrossSlope:.35,sidewalkMaxEdgeSlope:.35,maxCurbHeight:.4
  });
  const terrace=terrainJunction.mesh.submeshes.find(g=>g.materialSlot===5);
  for(const r of roads){
   const sourceSidewalk=buildRoadSidewalkV2(r.base,{
    width:w,roadWidth:4,shoulderWidth:.45,curbWidth:.22,curbHeight:.16,
    uvMetersPerRepeat:repeat,uvLongitudinalAxis:r.axis,
    terrainMode:'sample',terrainSampler:h,maxCrossSlope:.35,maxEdgeSlope:.35}).mesh;
   for(const p of r.outerPositions){
    let roadPt=false,junctionPt=false;
    for(let k=0;k<sourceSidewalk.vertexCount;k++){
     const s=at(sourceSidewalk,k).position;
     if(near(s.x,p.x)&&near(s.z,p.z)&&near(s.y,h(s.x,s.z)))roadPt=true;
    }
    for(const id of terrace.indices){
     const s=at(terrainJunction.mesh,id).position;
     if(near(s.x,p.x)&&near(s.z,p.z)&&near(s.y,h(s.x,s.z)))junctionPt=true;
    }
    assert(roadPt&&junctionPt,'Sampled Road/Junction OUTER seams must match heightfield vertex height');
   }
  }
  assert.throws(()=>buildJunctionPatchV2(branches,{
   curbCornerMode:'rounded',sidewalkRoadJoin:true}),/requires enabled Rounded/);
  assert.throws(()=>buildJunctionPatchV2(branches.map((b,i)=>i?b:{
   ...b,sidewalkStation:undefined}),{
   curbCornerMode:'rounded',sidewalkRoadJoin:true,sidewalkApronWidth:w
  }),/needs exact sidewalk UV station/);
  const changed=buildJunctionPatchV2(branches,{
   curbCornerMode:'rounded',curbCornerSegments:16,curbCornerPull:.32,
   sidewalkApronWidth:w,sidewalkRoadJoin:false}).mesh;
  assert.notEqual(fingerprintMeshV2(changed),fingerprintMeshV2(mesh));
 }
 const component=fs.readFileSync(path.join(root,'assets/splines-v2/Components/SplineRoadV2.ts'),'utf8');
 const junction=fs.readFileSync(path.join(root,'assets/splines-v2/Components/SplineJunctionPatchV2.ts'),'utf8');
 assert.match(component,/buildRoadSidewalkV2\(geometry/);
 assert.match(component,/sidewalkStation:this\.roadSidewalkWidth>0/);
 assert.match(junction,/joinRoadSidewalks/);
 assert.match(junction,/sidewalkRoadJoin:this\.joinRoadSidewalks/);
 console.log('ROAD/JUNCTION SIDEWALK NETWORK PASS: real trim ring, 3/4 arms, UV U/V, XYZ/Repeat tile phase, terrain samples, glTF and safety.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
