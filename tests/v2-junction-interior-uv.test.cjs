'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'junction-interior-uv-v2-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
  '--rootDir',path.join(root,'src-v2'),'--outDir',dir,
  path.join(root,'src-v2/geometry/JunctionInteriorUVV2.ts'),
  path.join(root,'src-v2/geometry/JunctionPatchV2.ts'),
  path.join(root,'src-v2/geometry/MeshBuildPlan.ts')],{stdio:'pipe'});
 const {smoothJunctionInteriorUVRingV2:smooth}=
  require(path.join(dir,'geometry/JunctionInteriorUVV2.js'));
 const original=Array.from({length:12},(_,i)=>({x:i%3===0?i*2:i*.1,y:i%4===0?4:-1}));
 const frozen=JSON.stringify(original),center={x:0,y:0};
 const base=smooth(original,center,.55,0);
 const out=smooth(original,center,.55,.35);
 const energy=points=>points.reduce((sum,p,i)=>{
  const next=points[(i+1)%points.length];
  return sum+(p.x-next.x)**2+(p.y-next.y)**2;
 },0);
 assert(energy(out)<energy(base),'Interior ring UV smoothing should reduce angular UV jump energy');
 assert.equal(JSON.stringify(original),frozen,'Should never mutate Road boundary UV values');
 assert.deepEqual(smooth(original,center,.55,.35),out,'Should be deterministic');
 assert.deepEqual(smooth(original,center,.55,0),base,'Default must match legacy linear interpolation');
 assert(out.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 assert.throws(()=>smooth(original,center,.55,.6),/Invalid Junction/);
 assert.throws(()=>smooth(original,center,1,0),/Invalid Junction/);
 assert.throws(()=>smooth(original.slice(0,8),center,.55,.2),/Invalid Junction/);
 assert.throws(()=>smooth(original.map((p,i)=>i===2?{x:Infinity,y:0}:p),center,.55,.2),
  /Invalid Road boundary/);
 const {buildJunctionPatchV2:build}=
  require(path.join(dir,'geometry/JunctionPatchV2.js'));
 const {fingerprintMeshV2:fingerprint}=
  require(path.join(dir,'geometry/MeshBuildPlan.js'));
 const v=(x,z)=>({x,y:0,z});
 const arms=n=>Array.from({length:n},(_,i)=>{
  const a=i*2*Math.PI/n,f={x:Math.sin(a),z:Math.cos(a)},
   right={x:Math.cos(a),z:-Math.sin(a)};
  const p=side=>v(4*f.x+side*2*right.x,4*f.z+side*2*right.z);
  const e=(side,u)=>({position:p(side),uv0:{x:u,y:.8+i*.17}});
  return {endpoint:v(0,0),left:e(-1,.1+i*.25),
   middle:e(0,.5+i*.25),right:e(1,.9+i*.25)};
 });
 for(const n of [3,4]){
  const input=arms(n),plain=build(input,{uvMode:'matched'}),
   smoothed=build(input,{uvMode:'matched',uvInteriorSmoothing:.35});
  const a=plain.mesh,b=smoothed.mesh,m=3*n;
  assert.equal(smoothed.report.uvInteriorSmoothing,.35);
  assert.equal(a.vertexCount,b.vertexCount);
  assert.equal(a.triangleCount,b.triangleCount);
  assert.deepEqual(Array.from(a.positions),Array.from(b.positions),
   'Smoothing must never move Junction geometry');
  assert.deepEqual(Array.from(a.uv2),Array.from(b.uv2),
   'UV2 lightmap must not change');
  assert.deepEqual(a.submeshes.map(g=>Array.from(g.indices)),
   b.submeshes.map(g=>Array.from(g.indices)));
  assert.deepEqual(Array.from(a.uv0.slice(0,2*(m+1))),
   Array.from(b.uv0.slice(0,2*(m+1))),
   'Road boundary and center UV0 must remain EXACT');
  const inner=mesh=>Array.from({length:m},(_,i)=>({
   x:mesh.uv0[2*(m+1+i)],y:mesh.uv0[2*(m+1+i)+1]}));
  assert(energy(inner(b))<energy(inner(a)),
   'Smoothing must reduce interior-ring UV angular variation');
  assert.notDeepEqual(Array.from(a.uv0),Array.from(b.uv0));
  assert.notEqual(fingerprint(a),fingerprint(b),
   'A changed internal UV must invalidate Baked fingerprint');
  assert.deepEqual(Array.from(build(input,{uvInteriorSmoothing:.35}).mesh.uv0),
   Array.from(b.uv0),'Optimized UV must be deterministic');
  assert.throws(()=>build(input,{uvMode:'projected',
   uvInteriorSmoothing:.25}),/Invalid Junction V2 settings/);
  assert.throws(()=>build(input,{uvInteriorSmoothing:.8}),/Invalid Junction V2 settings/);
  const withProfile=input.map((road,i)=>i===0?{...road,
   profile:{vertices:[road.left,road.middle,road.right],edgeMaterials:[0,0]}}:road);
  assert.throws(()=>build(withProfile,{uvInteriorSmoothing:.3}),
   /supports plain asphalt only/);
 }
 console.log('JUNCTION INTERIOR UV PASS: deterministic, bounded relaxation, less angular energy, legacy default, no boundary mutation');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
