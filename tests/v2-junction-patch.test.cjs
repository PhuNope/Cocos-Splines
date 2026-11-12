'use strict';
/** Flat 3/4-way Junction V2, exact trimmed boundaries and safe UV phase. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'v2-junction-'));
try{
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict',
  '--rootDir',path.join(root,'src-v2'),'--outDir',tmp,
  path.join(root,'src-v2/geometry/RoadStrip.ts'),
  path.join(root,'src-v2/geometry/JunctionPatchV2.ts'),
  path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildSplineCacheV2}=require(path.join(tmp,'core/SplineCache.js'));
 const {buildRoadStripV2}=require(path.join(tmp,'geometry/RoadStrip.js'));
 const {buildJunctionPatchV2}=require(path.join(tmp,'geometry/JunctionPatchV2.js'));
 const {exportMeshGltfV2}=require(path.join(tmp,'geometry/GltfExporter.js'));
 const {fingerprintMeshV2}=require(path.join(tmp,'geometry/MeshBuildPlan.js'));
 const knot=(x,y,z)=>({position:{x,y,z}});
 const equal=(a,b)=>Math.abs(a-b)<=2e-5;
 const around=(arms)=>{
  const result=[];
  for(let i=0;i<arms;i++){
   const angle=2*Math.PI*i/arms;
   const outward={x:Math.sin(angle),z:Math.cos(angle)};
   const atEnd=i%2===1;
   const far=knot(outward.x*12,0,outward.z*12),center=knot(0,0,0);
   const cache=buildSplineCacheV2({type:'linear',closed:false,
    knots:atEnd?[far,center]:[center,far]});
   const source={width:4,step:.25,uvMetersPerRepeat:5,uvLongitudinalAxis:i%2?'v':'u',
    surfaceMode:'fillet',
    junctionStartTrim:atEnd?0:3,junctionEndTrim:atEnd?3:0};
   const mesh=buildRoadStripV2(cache,source);
   const full=buildRoadStripV2(cache,{...source,junctionStartTrim:0,junctionEndTrim:0});
   assert(mesh.vertexCount<full.vertexCount);
   assert.equal(mesh.triangleCount,(mesh.vertexCount/3-1)*4);
   const start=(atEnd?mesh.vertexCount-3:0);
   const point=j=>({position:{x:mesh.positions[3*j],y:mesh.positions[3*j+1],z:mesh.positions[3*j+2]},
    uv0:{x:mesh.uv0[2*j],y:mesh.uv0[2*j+1]}});
   result.push({endpoint:{x:0,y:0,z:0},left:point(start),right:point(start+2)});
   // UV0 should preserve the ORIGINAL spline distance, never restart at trim.
   const d=atEnd?cache.length-3:3,expected=d/5;
   for(const j of [start,start+2])
    assert(equal(mesh.uv0[2*j+(i%2?1:0)],expected),'trimmed UV lost original distance');
  }
  return result;
 };
 for(const armCount of [3,4]){
  const roads=around(armCount);
  for(const mode of ['matched','projected']){
   const {mesh,report}=buildJunctionPatchV2(roads,{uvMode:mode,uvBlendStart:.55});
   assert.equal(mesh.vertexCount,1+4*armCount*2);
   assert.equal(mesh.triangleCount,armCount*12);
   assert.equal(report.branches,armCount);
   assert.equal(report.matchedUV,mode==='matched');
   assert.deepEqual(mesh.submeshes.map(s=>s.materialSlot),[0]);
   assert.equal(mesh.uv0.length,mesh.uv2.length);
   assert(mesh.positions.every(Number.isFinite)&&mesh.tangents.every(Number.isFinite));
   for(let k=0;k<mesh.submeshes[0].indices.length;k+=3){
    const idx=[...mesh.submeshes[0].indices.slice(k,k+3)].map(i=>3*i);
    const p=mesh.positions,a=idx[0],b=idx[1],c=idx[2];
    const cross=(p[b+2]-p[a+2])*(p[c]-p[a])-(p[b]-p[a])*(p[c+2]-p[a+2]);
    assert(cross>1e-8,'Junction V2 triangle flipped or degenerate');
   }
   if(mode==='matched'){
    for(const b of roads)for(const e of [b.left,b.right]){
     let found=false;
     for(let i=1;i<=2*armCount;i++){
      const j=3*i;
      if(!equal(mesh.positions[j],e.position.x)||!equal(mesh.positions[j+2],e.position.z))continue;
      const dx=mesh.uv0[2*i]-e.uv0.x,dy=mesh.uv0[2*i+1]-e.uv0.y;
      assert(equal(dx,Math.round(dx))&&equal(dy,Math.round(dy)),
       'Junction perimeter UV must match same Road material under Repeat');
      found=true;break;
     }
     assert(found,'Junction V2 lost a Road boundary vertex');
    }
   }
   const gltf=JSON.parse(exportMeshGltfV2(mesh).json);
   assert(gltf.meshes[0].primitives[0].attributes.TEXCOORD_0!==undefined);
   assert(gltf.meshes[0].primitives[0].attributes.TEXCOORD_1!==undefined);
   assert.equal(gltf.meshes[0].primitives.length,1);
   assert.equal(gltf.extras.cocosSplinesV2.fingerprint,fingerprintMeshV2(mesh));
  }
 }
 const triple=around(3);
 assert.throws(()=>buildJunctionPatchV2(triple.slice(0,2)),/3 or 4/);
 const unsnapped=triple.map((b,i)=>i===1?{...b,endpoint:{x:2,y:0,z:0}}:b);
 assert.throws(()=>buildJunctionPatchV2(unsnapped),/not co-located/);
 const raised=triple.map((b,i)=>i===0?{...b,left:{...b.left,
   position:{...b.left.position,y:2}}}:b);
 assert.throws(()=>buildJunctionPatchV2(raised),/flat only/);
 const tooShort=triple.map((b,i)=>i!==0?b:{
  ...b,left:{...b.left,position:{...b.left.position,z:b.left.position.z/10}},
  right:{...b.right,position:{...b.right.position,z:b.right.position.z/10}}});
 assert.throws(()=>buildJunctionPatchV2(tooShort),/trim is too short/);
 const cache=buildSplineCacheV2({type:'linear',closed:false,knots:[knot(0,0,0),knot(0,0,10)]});
 assert.throws(()=>buildRoadStripV2(cache,{width:4,surfaceMode:'clip',junctionStartTrim:2}),/needs ConstantWidth/);
 assert.throws(()=>buildRoadStripV2(cache,{width:4,surfaceMode:'fillet',junctionStartTrim:6,junctionEndTrim:5}),/leave no Road length/);
 assert.throws(()=>buildRoadStripV2(cache,{width:4,surfaceMode:'fillet',junctionStartTrim:-1}),/non-negative/);
 console.log('V2 JUNCTION PASS: 3/4 roads, exact UV0 Repeat phase, trim distances, positive winding, UV2, glTF, material slot and unsafe input rejections.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
