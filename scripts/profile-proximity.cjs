'use strict';
/** Deterministic complexity gates + observational Node.js timings.
 * This is NOT a Cocos Creator Editor or physics-backend benchmark.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
    cp=require('node:child_process'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-proximity-profile-'));
const p=(x,y=0,z=0)=>({x,y,z});
try {
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
     '--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {SplineProximityRegistry}=require(path.join(tmp,'Core/SplineProximity.js'));
 const {SplineProximityProfileSession}=
     require(path.join(tmp,'Core/SplineProximityProfile.js'));
 const travel=t=>p(t*10),report={};
 function measure(name,registry,seconds,iterations=64){
     const sample=new SplineProximityProfileSession(256),owner={};
     let last;
     for(let i=0;i<8;i++)registry.limit(owner,travel,.5,0,16,seconds);
     for(let i=0;i<iterations;i++){
         const start=performance.now();
         last=registry.limit(owner,travel,.5,0,16,seconds);
         sample.record(performance.now()-start,registry.getTelemetry());
     }
     report[name]={...sample.summary(),limited:last.limited,
         fraction:last.fraction,occupants:registry.size};
     return {telemetry:registry.getTelemetry(),result:last,stats:report[name]};
 }
 // Large, mostly empty world: query cost must scale with nearby candidates,
 // not total registered followers.
 const sparse=new SplineProximityRegistry();
 for(let i=0;i<1024;i++)
     sparse.set({i},p(200+(i%32)*7,200+Math.floor(i/32)*7,20),.5);
 sparse.set({},p(6),.5);
 let r=measure('sparse_1025_agents',sparse,0);
 assert(r.result.limited&&Math.abs(r.result.fraction-.5)<.002);
 assert(!r.telemetry.lastFallback,'Sparse query must remain in the grid');
 assert(r.telemetry.lastCandidates<=4,'Broadphase candidate regression');
 assert(r.telemetry.lastSegmentTests<=64,'Unexpected narrowphase scaling');

 // Incoming agent starts OUTSIDE the unmoving swept path and must be found
 // through the prediction-expanded grid AABB.
 const moving=new SplineProximityRegistry();
 for(let i=0;i<600;i++)
     moving.set({i},p(200+i%30*8,180+Math.floor(i/30)*8,20),.5);
 const arriving={};
 moving.set(arriving,p(26),.5);
 moving.setVelocity(arriving,p(-60));
 r=measure('predictive_601_agents',moving,.3);
 assert(r.result.limited&&Math.abs(r.result.fraction-(25/28))<.002);
 assert(!r.telemetry.lastFallback);
 assert(r.telemetry.lastCandidates<=4,'Prediction candidate regression');
 assert(r.telemetry.lastPredictedCandidates===1);

 // Dense static WORLD mesh, but most triangles do not overlap the query.
 // BVH node/triangle gate is deterministic and portable across CI machines.
 const meshReg=new SplineProximityRegistry(),vertices=[],indices=[];
 const add=(a,b,c)=>{
     const i=vertices.length;
     vertices.push(a,b,c);indices.push(i,i+1,i+2);
 };
 add(p(5,-1,-1),p(5,1,-1),p(5,0,1));
 for(let i=0;i<2048;i++){
     const x=30+(i%48)*.5,y=10+Math.floor(i/48)*.35;
     add(p(x,y,-1),p(x,y+1,-1),p(x,y,1));
 }
 meshReg.setMesh({},vertices,indices);
 r=measure('mesh_2049_triangles',meshReg,0,40);
 assert(r.result.limited&&Math.abs(r.result.fraction-.45)<.002);
 assert(r.telemetry.lastTriangleTests<=16,'Mesh BVH triangle culling regression');
 assert(r.telemetry.lastBvhNodes<=64,'Mesh BVH traversal regression');
 assert(r.stats.totalBvhNodes>0);
 // Intentionally oversized broadphase query: all-owner fallback must
 // preserve contacts and mark the expensive path in the report.
 const fallbackReg=new SplineProximityRegistry();
 fallbackReg.set({},p(6),99);
 for(let i=0;i<64;i++)fallbackReg.set({i},p(400+i*6),.5);
 r=measure('oversized_grid_fallback',fallbackReg,0,12);
 assert(r.result.limited&&r.telemetry.lastFallback===true);
 assert(r.stats.fallbackSamples===12);

 const result={schema:'cocos-splines/proximity-profile/v1',
     environment:'node-headless-not-native-cocos',
     generatedAt:new Date().toISOString(),
     node:process.version,commit:process.env.GITHUB_SHA||process.env.BUILD_SHA||null,
     notes:'Time statistics are observational. Only deterministic geometric/candidate gates fail CI.',
     scenarios:report};
 const output=path.join(root,'builds','proximity-profile-v2.json');
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 for(const [name,row] of Object.entries(report))
     console.log('PROFILE',name,'p95ms='+row.latency.p95Ms.toFixed(3),
         'candidates='+row.maxCandidates,'triangles='+row.totalTriangleTests,
         'bvhNodes='+row.totalBvhNodes,'fallbacks='+row.fallbackSamples);
 console.log('PROXIMITY PROFILE PASS: structural complexity gates; report '+output);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
