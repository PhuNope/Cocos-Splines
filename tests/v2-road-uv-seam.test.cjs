'use strict';
/** UV continuity after planar Road clipping: U/V, repeats, material bands and Bake. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-v2-cut-uv-'));
try{
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict',
  '--rootDir',path.join(root,'src-v2'),'--outDir',tmp,
  path.join(root,'src-v2/geometry/RoadOverlapClip.ts'),
  path.join(root,'src-v2/geometry/RoadStrip.ts'),
  path.join(root,'src-v2/geometry/ProfileSweep.ts'),
  path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildMeshV2}=require(path.join(tmp,'geometry/MeshData.js'));
 const {resolveRoadOverlapV2}=require(path.join(tmp,'geometry/RoadOverlapClip.js'));
 const {buildSplineCacheV2}=require(path.join(tmp,'core/SplineCache.js'));
 const {buildRoadStripV2}=require(path.join(tmp,'geometry/RoadStrip.js'));
 const {buildRoadProfileV2}=require(path.join(tmp,'geometry/ProfileSweep.js'));
 const {exportMeshGltfV2}=require(path.join(tmp,'geometry/GltfExporter.js'));
 const phaseDiff=(a,b)=>Math.abs(a-b-Math.round(a-b));
 const near=(a,b)=>assert(Math.abs(a-b)<1e-5,a+' != '+b);
 const points=[{x:0,y:0,z:0},{x:0,y:0,z:2},{x:2,y:0,z:0},
  {x:.5,y:0,z:0},{x:.5,y:0,z:2},{x:2.5,y:0,z:0}];
 const sample=(axis='u',material=0,offset=.27)=>buildMeshV2({
  positions:points,normals:points.map(()=>({x:0,y:1,z:0})),
  uv0:points.map((p,i)=>axis==='u'
   ?{x:p.x/5+(i>=3?offset:0),y:p.z/5+(i>=3?.17:0)}
   :{x:p.z/5+(i>=3?.17:0),y:p.x/5+(i>=3?offset:0)}),
  uv2:points.map(p=>({x:p.x/10,y:p.z/10})),
  submeshes:[{materialSlot:0,indices:[0,1,2]},{materialSlot:material,indices:[3,4,5]}]
 });
 for(const axis of ['u','v']){
  const original=sample(axis);
  const on=resolveRoadOverlapV2(original,{roadWidth:2});
  const off=resolveRoadOverlapV2(original,{roadWidth:2,stitchCutUV:false});
  assert(on.report.clippedSourceTriangles>0&&on.report.stitchedCutVertices>0);
  assert.equal(off.report.stitchedCutVertices,0);
  assert.deepEqual(Array.from(on.mesh.positions),Array.from(off.mesh.positions));
  assert.deepEqual(Array.from(on.mesh.uv2),Array.from(off.mesh.uv2));
  assert.deepEqual(on.mesh.submeshes.map(s=>Array.from(s.indices)),off.mesh.submeshes.map(s=>Array.from(s.indices)));
  let stitched=0,rawMismatch=0,untouched=0;
  for(let i=3;i<on.mesh.vertexCount;i++){
   const x=on.mesh.positions[3*i],z=on.mesh.positions[3*i+2];
   const border=Math.abs(x+z-2)<1e-5||Math.abs(z)<1e-5||Math.abs(x)<1e-5;
   const field=axis==='u'?[x/5,z/5]:[z/5,x/5];
   const uv=[on.mesh.uv0[2*i],on.mesh.uv0[2*i+1]];
   const raw=[off.mesh.uv0[2*i],off.mesh.uv0[2*i+1]];
   if(border&&x>=.5-1e-5&&x+z<=2+1e-5 &&
      Math.abs(uv[0]-raw[0])+Math.abs(uv[1]-raw[1])>1e-4){
    assert(phaseDiff(uv[0],field[0])<1e-5);
    assert(phaseDiff(uv[1],field[1])<1e-5);
    if(phaseDiff(raw[0],field[0])>.1)rawMismatch++;
    stitched++;
   }else if(Math.abs(uv[0]-raw[0])+Math.abs(uv[1]-raw[1])<1e-5)untouched++;
   near(on.mesh.uv2[2*i],x/10);near(on.mesh.uv2[2*i+1],z/10);
  }
  assert(stitched>=2&&rawMismatch>0&&untouched>0);
  const gltf=JSON.parse(exportMeshGltfV2(on.mesh).json);
  assert(gltf.meshes[0].primitives.every(p=>
   p.attributes.TEXCOORD_0!==undefined&&p.attributes.TEXCOORD_1!==undefined));
 }
 const different=sample('u',1);
 const differentOn=resolveRoadOverlapV2(different,{roadWidth:2});
 const differentOff=resolveRoadOverlapV2(different,{roadWidth:2,stitchCutUV:false});
 assert.equal(differentOn.report.stitchedCutVertices,0);
 assert.deepEqual(Array.from(differentOn.mesh.uv0),Array.from(differentOff.mesh.uv0));
 // A high relative UV gradient must use ONE integer tile shift for the entire
 // cut edge; otherwise the line appears continuous at endpoints but breaks midway.
 const steep=buildMeshV2({positions:points,normals:points.map(()=>({x:0,y:1,z:0})),
  uv0:points.map((p,i)=>({x:p.x/5+(i>2?.27+p.z*1.3:0),y:p.z/5+(i>2?.17:0)})),
  uv2:points.map(p=>({x:p.x/10,y:p.z/10})),
  submeshes:[{materialSlot:0,indices:[0,1,2,3,4,5]}]});
 const seam=resolveRoadOverlapV2(steep,{roadWidth:2}).mesh;
 const phases=[];
 for(let i=3;i<seam.vertexCount;i++){
  const x=seam.positions[3*i],z=seam.positions[3*i+2];
  if(Math.abs(x+z-2)<1e-5&&x>=.5-1e-5){
   const delta=seam.uv0[2*i]-x/5;
   assert(Math.abs(delta-Math.round(delta))<1e-5);
   phases.push(Math.round(delta));
  }
 }
 assert(phases.length>=2&&phases.every(p=>p===phases[0]));
 const knot=(x,y,z)=>({position:{x,y,z}});
 const cache=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:false,
  knots:[knot(0,0,0),knot(0,0,2),knot(2,0,2),knot(2,0,0)]});
 function coLocatedUVErrors(mesh){
  const seen=new Map();let duplicated=0,wrong=0;
  for(let i=0;i<mesh.vertexCount;i++){
   const key=[mesh.positions[3*i],mesh.positions[3*i+1],mesh.positions[3*i+2]]
    .map(n=>Math.fround(n).toFixed(5)).join(':');
   const u=mesh.uv0[2*i],v=mesh.uv0[2*i+1],first=seen.get(key);
   if(first){duplicated++;if(phaseDiff(u,first[0])+phaseDiff(v,first[1])>1e-3)wrong++;}
   else seen.set(key,[u,v]);
  }
  return {duplicated,wrong};
 }
 for(const axis of ['u','v']){
  const opts={width:4,step:.2,uvLongitudinalAxis:axis};
  const on=buildRoadStripV2(cache,{...opts,stitchCutUV:true});
  const off=buildRoadStripV2(cache,{...opts,stitchCutUV:false});
  assert.deepEqual(Array.from(on.positions),Array.from(off.positions));
  assert.deepEqual(Array.from(on.uv2),Array.from(off.uv2));
  assert(coLocatedUVErrors(on).duplicated>0);
  assert.equal(coLocatedUVErrors(on).wrong,0,'Same-material cut vertices must share wrapped UV0');
  assert(coLocatedUVErrors(off).wrong>0,'Control U-turn must contain UV seams');
  const bands={...opts,shoulderWidth:1,curbWidth:.3,curbHeight:.2};
  const profOn=buildRoadProfileV2(cache,{...bands,stitchCutUV:true});
  const profOff=buildRoadProfileV2(cache,{...bands,stitchCutUV:false});
  assert.deepEqual(Array.from(profOn.positions),Array.from(profOff.positions));
  assert.deepEqual(Array.from(profOn.uv2),Array.from(profOff.uv2));
  assert.deepEqual(profOn.submeshes.map(s=>s.materialSlot),profOff.submeshes.map(s=>s.materialSlot));
 }
 const inspector=require(path.join(root,'src/contributions/inspector/RoadV2.js'));
 assert(inspector.template.includes('spl-v2-stitchCutUV'));
 const component=fs.readFileSync(path.join(root,'assets/splines-v2/Components/SplineRoadV2.ts'),'utf8');
 assert(component.includes('stitchCutUV:this.stitchCutUV'));
 console.log('V2 CUT UV STITCH PASS: U/V, wrapped seam vertices, whole-edge phase, shoulder/curb, UV2, glTF and Inspector');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
