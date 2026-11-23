'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-collider-bounds-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',out],{stdio:'pipe'});
 const {colliderProximityRadius}=require(path.join(out,'Core/SplineColliderBounds.js'));
 const p=(x,y=0,z=0)=>({x,y,z});
 const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<t,a+' != '+b);
 const box={center:p(0),halfExtents:p(1,.5,.25)};
 let report=colliderProximityRadius(box,p(0),.5);
 near(report.radius,Math.hypot(1,.5,.25));
 assert(report.valid&&report.source==='collider');
 report=colliderProximityRadius(box,p(2),.5);
 near(report.radius,Math.hypot(1,.5,.25)+2);
 assert(report.valid,'Collider center offset must inflate the target-centered sphere');
 report=colliderProximityRadius({center:p(0),halfExtents:p(2,1,.5)},p(0),.5);
 near(report.radius,Math.hypot(2,1,.5),'World AABB half-extents include nonuniform scale');
 for(const invalid of [
   null,undefined,{center:p(NaN),halfExtents:p(1)},
   {center:p(0),halfExtents:p(-1,1,1)},
   {center:p(0),halfExtents:p(0,0,0)},
   {center:p(500),halfExtents:p(100,100,100)}
 ]){
   const fallback=colliderProximityRadius(invalid,p(0),.5);
   assert.deepEqual(fallback,{radius:.5,valid:false,source:'fallback'});
 }
 assert.deepEqual(colliderProximityRadius(box,null,.5),
   {radius:.5,valid:false,source:'fallback'});
 assert.throws(()=>colliderProximityRadius(box,p(0),-1),/Invalid/);
 console.log('COLLIDER BOUNDS PASS: conservative WORLD AABB sphere, off-center shapes, nonuniform scale, disabled/unavailable bounds and safe fallback.');
}finally{fs.rmSync(out,{recursive:true,force:true});}
