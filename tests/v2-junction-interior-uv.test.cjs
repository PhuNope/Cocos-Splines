'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'junction-interior-uv-v2-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
  '--rootDir',path.join(root,'src-v2'),'--outDir',dir,
  path.join(root,'src-v2/geometry/JunctionInteriorUVV2.ts')],{stdio:'pipe'});
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
 console.log('JUNCTION INTERIOR UV PASS: deterministic, bounded relaxation, less angular energy, legacy default, no boundary mutation');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
