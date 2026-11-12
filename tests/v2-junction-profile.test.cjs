'use strict';
/** Flat 3/4-way Junction transition from exact multi-material Road end rings. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-profile-junction-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
  '--rootDir',path.join(root,'src-v2'),'--outDir',dir,
  path.join(root,'src-v2/geometry/RoadStrip.ts'),
  path.join(root,'src-v2/geometry/ProfileSweep.ts'),
  path.join(root,'src-v2/geometry/JunctionPatchV2.ts'),
  path.join(root,'src-v2/geometry/JunctionMarkingsV2.ts'),
  path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildSplineCacheV2}=require(path.join(dir,'core/SplineCache.js'));
 const {buildRoadProfileV2,roadProfileLayoutV2}=require(path.join(dir,'geometry/ProfileSweep.js'));
 const {buildRoadStripV2}=require(path.join(dir,'geometry/RoadStrip.js'));
 const {buildJunctionPatchV2}=require(path.join(dir,'geometry/JunctionPatchV2.js'));
 const {buildJunctionMarkingsV2}=require(path.join(dir,'geometry/JunctionMarkingsV2.js'));
 const {appendRoadMarkingsV2}=require(path.join(dir,'geometry/RoadMarkings.js'));
 const {exportMeshGltfV2}=require(path.join(dir,'geometry/GltfExporter.js'));
 const {fingerprintMeshV2}=require(path.join(dir,'geometry/MeshBuildPlan.js'));
 const knot=(x,y,z)=>({position:{x,y,z}});
 const near=(a,b,eps=3e-5)=>Math.abs(a-b)<eps;
 const point=(mesh,i)=>({position:{x:mesh.positions[3*i],y:mesh.positions[3*i+1],z:mesh.positions[3*i+2]},
  uv0:{x:mesh.uv0[2*i],y:mesh.uv0[2*i+1]}});
 const all=(count,style='full')=>Array.from({length:count},(_,k)=>{
  const rad=k*Math.PI*2/count,out={x:Math.sin(rad),z:Math.cos(rad)};
  const atEnd=k%2===1,nearK=knot(0,0,0),farK=knot(out.x*12,0,out.z*12);
  const cache=buildSplineCacheV2({type:'linear',closed:false,
   knots:atEnd?[farK,nearK]:[nearK,farK]});
  const dimensions=style==='full'?{shoulderWidth:.45,curbWidth:.22,curbHeight:.16}:
   style==='shoulder'?{shoulderWidth:.6,curbWidth:0,curbHeight:0}:
   {shoulderWidth:0,curbWidth:0,curbHeight:0};
  const opts={width:4,step:.25,surfaceMode:'fillet',uvMetersPerRepeat:5,
   uvLongitudinalAxis:k%2?'u':'v',
   junctionStartTrim:atEnd?0:4,junctionEndTrim:atEnd?4:0,...dimensions};
  const mesh=style==='plain'?buildRoadStripV2(cache,opts):buildRoadProfileV2(cache,opts);
  const asphalt=mesh.submeshes.find(s=>s.materialSlot===0);
  assert(asphalt);
  const rings=asphalt.indices.length/12+1;
  const start=(atEnd?rings-1:0)*3;
  let profile;
  if(style==='plain')profile=[point(mesh,start),point(mesh,start+1),point(mesh,start+2)];
  else{
   const layout=roadProfileLayoutV2(4,dimensions.shoulderWidth,dimensions.curbWidth,
     dimensions.curbHeight,true);
   const index=(edge,end)=>edge*2*rings+2*(atEnd?rings-1:0)+(end?1:0);
   profile=[point(mesh,index(0,false))];
   for(let e=0;e<layout.edgeMaterials.length;e++)profile.push(point(mesh,index(e,true)));
   assert.equal(profile.length,layout.points.length);
   const local={x:out.z,z:-out.x},left=layout.points.findIndex(p=>p.x===-2&&p.y===0);
   assert(left>=0);
   // Profile vertices at the trim boundary lie on a single width-4 centre row,
   // and their UV0 values are exactly the authored Road values.
   const across=profile[left].position;
   assert(Number.isFinite(across.x));
   const m=layout.points.findIndex(p=>p.x===0&&p.y===0);
   const r=layout.points.findIndex(p=>p.x===2&&p.y===0);
   assert(m>=0&&r>=0);
   const expected=atEnd?cache.length-4:4,axis=k%2?'x':'y';
   for(const indexId of [left,m,r])assert(near(profile[indexId].uv0[axis],expected/5));
  }
  const layout=style==='plain'?null:roadProfileLayoutV2(4,dimensions.shoulderWidth,
   dimensions.curbWidth,dimensions.curbHeight,true);
  const left=style==='plain'?profile[0]:profile[layout.points.findIndex(p=>p.x===-2&&p.y===0)];
  const middle=style==='plain'?profile[1]:profile[layout.points.findIndex(p=>p.x===0&&p.y===0)];
  const right=style==='plain'?profile[2]:profile[layout.points.findIndex(p=>p.x===2&&p.y===0)];
  return {endpoint:{x:0,y:0,z:0},left,middle,right,
   ...(style==='plain'?{}:{profile:{vertices:profile,edgeMaterials:layout.edgeMaterials}})};
 });
 for(const count of [3,4]){
  for(const style of ['shoulder','full']){
   const entries=all(count,style);
   const output=buildJunctionPatchV2(entries,{uvMode:'matched',uvMetersPerRepeat:5,maxCurbHeight:.4});
   const mesh=output.mesh,report=output.report;
   assert.equal(report.branches,count);
   assert(report.profileBands.asphalt>0);
   assert(report.profileBands.shoulder>0);
   if(style==='full')assert(report.profileBands.curb>0);
   else assert.equal(report.profileBands.curb,0);
   assert.deepEqual(mesh.submeshes.map(s=>s.materialSlot),
     style==='full'?[0,1,2]:[0,1]);
   assert(mesh.positions.every(Number.isFinite)&&mesh.tangents.every(Number.isFinite));
   for(let i=0;i<mesh.vertexCount;i++){
    assert(Number.isFinite(mesh.uv0[2*i])&&Number.isFinite(mesh.uv0[2*i+1]));
    assert(Number.isFinite(mesh.uv2[2*i])&&Number.isFinite(mesh.uv2[2*i+1]));
   }
   for(const group of mesh.submeshes)for(let t=0;t<group.indices.length;t+=3){
    const [a,b,c]=[group.indices[t],group.indices[t+1],group.indices[t+2]];
    const get=i=>({x:mesh.positions[3*i],y:mesh.positions[3*i+1],z:mesh.positions[3*i+2]});
    const p=get(a),q=get(b),r=get(c);
    const ab={x:q.x-p.x,y:q.y-p.y,z:q.z-p.z},ac={x:r.x-p.x,y:r.y-p.y,z:r.z-p.z};
    const normal={x:ab.y*ac.z-ab.z*ac.y,y:ab.z*ac.x-ab.x*ac.z,z:ab.x*ac.y-ab.y*ac.x};
    assert(Math.hypot(normal.x,normal.y,normal.z)>1e-8,'No degenerate profile fan triangles');
    assert(normal.y>=-1e-6,'Non-wall profile surface faces upwards');
   }
   // Position and UV continuity: every exact end-ring vertex must be present
   // on the patch perimeter, modulo a whole Repeat tile. 3D curb wall height
   // is checked too (not just projection to XZ).
   for(const b of entries)for(const v of b.profile.vertices){
    let found=false;
    for(let i=0;i<mesh.vertexCount;i++){
     const pos=3*i,uv=2*i;
     if(!near(mesh.positions[pos],v.position.x)||!near(mesh.positions[pos+1],v.position.y)||
        !near(mesh.positions[pos+2],v.position.z))continue;
     const du=mesh.uv0[uv]-v.uv0.x,dv=mesh.uv0[uv+1]-v.uv0.y;
     if(near(du,Math.round(du))&&near(dv,Math.round(dv))){found=true;break;}
    }
    assert(found,'Junction profile seam must match exact Road X/Y/Z+UV0');
   }
   const rawUV=Array.from(mesh.uv0);
   const bake=JSON.parse(exportMeshGltfV2(mesh).json);
   assert.deepEqual(bake.extras.cocosSplinesV2.materialSlots,
    style==='full'?[0,1,2]:[0,1]);
   assert.equal(bake.meshes[0].primitives.length,style==='full'?3:2);
   assert.equal(fingerprintMeshV2(mesh),bake.extras.cocosSplinesV2.fingerprint);
   const second=buildJunctionPatchV2(entries,{uvMode:'matched',uvMetersPerRepeat:5,maxCurbHeight:.4}).mesh;
   assert.deepEqual(Array.from(second.uv0),rawUV,'Deterministic UV0');
   // Existing paint remains inside the same asphalt wedges, never on the curb.
   const paint=buildJunctionMarkingsV2(entries,{stopBars:true,crosswalks:true});
   const combined=appendRoadMarkingsV2(mesh,paint.mesh);
   assert.deepEqual(combined.submeshes.map(s=>s.materialSlot),
    style==='full'?[0,1,2,3]:[0,1,3]);
   assert.deepEqual(Array.from(combined.uv0.slice(0,mesh.uv0.length)),rawUV);
  }
 }
 const mixed=buildJunctionPatchV2([...all(3,'full').slice(0,2),all(3,'plain')[2]],{maxCurbHeight:.4});
 assert.deepEqual(mixed.mesh.submeshes.map(s=>s.materialSlot),[0,1,2]);
 const entries=all(3,'full');
 assert.throws(()=>buildJunctionPatchV2(entries,{maxCurbHeight:.05}),/curb height/);
 const malformed=entries.map((b,i)=>i?b:{...b,profile:{vertices:b.profile.vertices,
   edgeMaterials:[0]}}); 
 assert.throws(()=>buildJunctionPatchV2(malformed),/invalid Road profile layout/);
 const steep=entries.map((b,i)=>i?b:{...b,profile:{...b.profile,
   vertices:b.profile.vertices.map((e,j)=>j===0?{...e,position:{...e.position,y:2}}:e)}});
 assert.throws(()=>buildJunctionPatchV2(steep),/curb height/);
 const short=entries.map((b,i)=>i?b:{...b,profile:{...b.profile,
   vertices:b.profile.vertices.map(e=>({...e,position:{...e.position,
     x:e.position.x*.3,z:e.position.z*.3}}))}});
 assert.throws(()=>buildJunctionPatchV2(short),/profile does not contain|needs more Junction Trim/);
 console.log('JUNCTION PROFILE V2 PASS: shoulder/curb, vertical wall seams, mixed branch, UV0/UV2 and material slots, paint, 3/4 arms, glTF and invalid profiles.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
