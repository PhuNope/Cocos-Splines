'use strict';
/** Real Road trim -> Junction end-ring seam audit, not mocked geometry. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
 path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'junction-audit-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
 '--rootDir',path.join(root,'src-v2'),'--outDir',out,
 path.join(root,'src-v2/geometry/JunctionSeamAuditV2.ts'),
 path.join(root,'src-v2/geometry/RoadStrip.ts'),
 path.join(root,'src-v2/geometry/ProfileSweep.ts')],{stdio:'pipe'});
 const {auditJunctionSeamsV2:audit}=require(path.join(out,'geometry/JunctionSeamAuditV2.js'));
 const {buildJunctionPatchV2:build}=require(path.join(out,'geometry/JunctionPatchV2.js'));
 const {buildSplineCacheV2:cache}=require(path.join(out,'core/SplineCache.js'));
 const {buildRoadStripV2:strip}=require(path.join(out,'geometry/RoadStrip.js'));
 const {buildRoadProfileV2:profile,roadProfileLayoutV2:layout}=
  require(path.join(out,'geometry/ProfileSweep.js'));
 const knot=(x,y,z)=>({position:{x,y,z}});
 const point=(m,i)=>({position:{x:m.positions[3*i],y:m.positions[3*i+1],z:m.positions[3*i+2]},
  uv0:{x:m.uv0[2*i],y:m.uv0[2*i+1]}});
 const roads=(n,kind='plain')=>Array.from({length:n},(_,i)=>{
  const angle=i*2*Math.PI/n,outward={x:Math.sin(angle),z:Math.cos(angle)};
  const atEnd=i%2===1;
  const path=cache({type:'linear',closed:false,knots:atEnd?[
   knot(outward.x*12,0,outward.z*12),knot(0,0,0)]:[
   knot(0,0,0),knot(outward.x*12,0,outward.z*12)]});
  const dimensions=kind==='plain'?{shoulderWidth:0,curbWidth:0,curbHeight:0}:
   kind==='shoulder'?{shoulderWidth:.5,curbWidth:0,curbHeight:0}:
   {shoulderWidth:.45,curbWidth:.22,curbHeight:.16};
  const options={width:4,step:.25,surfaceMode:'fillet',
   uvMetersPerRepeat:5,uvLongitudinalAxis:i%2?'u':'v',
   junctionStartTrim:atEnd?0:4,junctionEndTrim:atEnd?4:0,...dimensions};
  const m=kind==='plain'?strip(path,options):profile(path,options);
  const asphalt=m.submeshes.find(g=>g.materialSlot===0);
  const rings=asphalt.indices.length/12+1;
  let ring,section;
  if(kind==='plain'){
   const first=(atEnd?rings-1:0)*3;
   ring=[point(m,first),point(m,first+1),point(m,first+2)];
  }else{
   section=layout(4,dimensions.shoulderWidth,dimensions.curbWidth,dimensions.curbHeight,true);
   const at=(edge,last)=>point(m,edge*2*rings+2*(atEnd?rings-1:0)+(last?1:0));
   ring=[at(0,false)];
   for(let e=0;e<section.edgeMaterials.length;e++)ring.push(at(e,true));
  }
  const index=x=>kind==='plain'?x===-2?0:x===0?1:2:
   section.points.findIndex(p=>p.x===x&&p.y===0);
  return {endpoint:{x:0,y:0,z:0},
   left:ring[index(-2)],middle:ring[index(0)],right:ring[index(2)],
   ...(kind==='plain'?{}:{profile:{vertices:ring,edgeMaterials:section.edgeMaterials}})};
 });
 for(const n of [3,4])for(const kind of ['plain','shoulder','full']){
  const entries=roads(n,kind);
  const options={uvMode:'matched',uvMetersPerRepeat:5,maxCurbHeight:.4,
   ...(kind==='full'?{curbCornerMode:'rounded',curbCornerSegments:12}: {})};
  const mesh=build(entries,options).mesh;
  const initial=Array.from(mesh.positions);
  const initialUV=Array.from(mesh.uv0);
  const report=audit(mesh,entries);
  assert.equal(report.ok,true,n+' road '+kind+' '+JSON.stringify(report.notes));
  assert.equal(report.matchedGeometry,report.boundaryVertices);
  assert.equal(report.matchedUV,report.boundaryVertices);
  assert.equal(report.inconsistentUVBranches,0);
  assert.equal(report.degenerateTriangles,0);
  assert.equal(report.asphaltOverlapChecked,true);
  assert.equal(report.overlappingAsphaltPairs,0,
   'Generated Junction asphalt must not overlap in positive area');
  assert.deepEqual(Array.from(mesh.positions),initial);
  assert.deepEqual(Array.from(mesh.uv0),initialUV);
  const lifted=build(entries,{...options,surfaceLift:.012}).mesh;
  const gap=audit(lifted,entries);
  assert.equal(gap.ok,false,'nonzero Patch Lift should not be called watertight');
  assert(gap.matchedGeometry<gap.boundaryVertices);
  assert(gap.maxPositionGap>.01);
  const projected=build(entries,{...options,uvMode:'projected'}).mesh;
  const checked=audit(projected,entries,{uvMode:'projected'});
  assert.equal(checked.ok,false);
  assert.equal(checked.uvPhaseChecked,false);
  assert(checked.notes.some(x=>x.includes('World Projected')));
  if(kind==='plain'){
   const wrong={...mesh,uv0:new Float32Array(mesh.uv0)};
   wrong.uv0[2*1]+=.35;
   const mismatch=audit(wrong,entries);
   assert.equal(mismatch.ok,false);
   assert(mismatch.matchedUV<mismatch.boundaryVertices);
   const incoherent={...mesh,uv0:new Float32Array(mesh.uv0)};
   incoherent.uv0[2*1]+=1;
   const incoherentReport=audit(incoherent,entries);
   assert.equal(incoherentReport.matchedUV,incoherentReport.boundaryVertices,
    'Each point individually matches Repeat, but one segment jumps a tile');
   assert.equal(incoherentReport.ok,false,'Global per-arm UV offset must remain coherent');
   assert(incoherentReport.inconsistentUVBranches>=1);
   const overlap={...mesh,submeshes:mesh.submeshes.map((group,i)=>({
    ...group,indices:i===0?new Uint16Array([
      ...group.indices,...group.indices.slice(0,3)]):group.indices}))};
   const overlapReport=audit(overlap,entries);
   assert.equal(overlapReport.ok,false);
   assert(overlapReport.overlappingAsphaltPairs>0,
    'Duplicate asphalt surface must be reported as overlapping');
   const broken={...mesh,submeshes:mesh.submeshes.map((s,i)=>({
    ...s,indices:i===0?new Uint16Array(s.indices):s.indices}))};
   broken.submeshes[0].indices[1]=broken.submeshes[0].indices[0];
   const degenerate=audit(broken,entries);
   assert(degenerate.degenerateTriangles>0);
   assert.equal(degenerate.ok,false);
  }
 }
 assert.throws(()=>audit({vertexCount:0,positions:[],uv0:[],submeshes:[]},
  roads(3)),/malformed/);
 console.log('V2 JUNCTION SEAM AUDIT PASS: actual 3/4-way plain, shoulder and rounded curb Road ring XYZ/UV, coherent tile shifts, lift/gap, UV failure, degenerate triangles');
}finally{fs.rmSync(out,{recursive:true,force:true});}
