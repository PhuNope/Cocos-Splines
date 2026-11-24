'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),
    os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(
    path.join(os.tmpdir(),'spline-profile-test-'));
try {
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
     '--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {SplineProximityRegistry}=require(path.join(tmp,'Core/SplineProximity.js'));
 const {SplineProximityProfileSession}=require(
     path.join(tmp,'Core/SplineProximityProfile.js'));
 const reg=new SplineProximityRegistry(),p=(x,y=0,z=0)=>({x,y,z});
 const follower={},blocker={};
 reg.set(blocker,p(5),.5);
 reg.limit(follower,t=>p(t*10),.5,0);
 // Native runtime may enable/disable injected timing without monkey-patching limit().
 let ticks=0;
 reg.startProfiling(()=>++ticks,2);
 reg.limit(follower,t=>p(t*10),.5,0);
 reg.limit(follower,t=>p(t*10),.5,0);
 assert.equal(ticks,4);
 assert.equal(reg.getProfilingSummary().samples,2);
 assert.equal(reg.getProfilingSummary().latency.p95Ms,1);
 assert.equal(reg.stopProfiling().samples,2);
 assert.equal(reg.getProfilingSummary(),null);
 reg.limit(follower,t=>p(t*10),.5,0);
 assert.equal(ticks,4,'Disabled profiler must not invoke the clock');
 assert.throws(()=>reg.startProfiling(null),/clock/);
 const session=new SplineProximityProfileSession(2);
 assert.deepEqual(session.summary().latency,
     {minMs:0,meanMs:0,p50Ms:0,p95Ms:0,maxMs:0});
 session.record(1,reg.getTelemetry());
 session.record(2,reg.getTelemetry());
 assert.equal(session.summary().samples,2);
 assert.equal(session.summary().latency.p50Ms,1);
 assert.equal(session.summary().latency.p95Ms,2);
 assert.equal(session.summary().candidatePruningFraction,0);
 session.record(3,reg.getTelemetry());
 let sum=session.summary();
 assert.equal(sum.samples,2,'Capacity must evict old readings');
 assert.equal(sum.latency.minMs,2);
 assert.equal(sum.latency.p95Ms,3);
 assert.equal(sum.totalBvhNodes,0);
 assert.equal(sum.totalSegmentTests,reg.getTelemetry().lastSegmentTests*2);
 assert.throws(()=>session.record(-1,reg.getTelemetry()),/Invalid/);
 assert.throws(()=>new SplineProximityProfileSession(0),/Invalid/);
 session.reset();assert.equal(session.summary().samples,0);
 // Real mesh queries must report BVH node visits, and clear() resets both.
 reg.setMesh(blocker,[p(5,-1,-1),p(5,1,-1),p(5,0,1)],[0,1,2]);
 reg.limit(follower,t=>p(t*10),.5,0);
 const t=reg.getTelemetry();
 assert(t.lastBvhNodes>=1);
 assert(t.totalBvhNodes>=t.lastBvhNodes);
 assert(t.lastTriangleTests>=1);
 session.record(.25,t);
 sum=session.summary();
 assert(sum.totalBvhNodes>=1);
 assert(sum.totalTriangleTests>=1);
 reg.clear();
 assert.equal(reg.getTelemetry().lastBvhNodes,0);
 assert.equal(reg.getTelemetry().totalBvhNodes,0);
 console.log('PROXIMITY PROFILE PASS: bounded sampler, percentiles, BVH counters, telemetry reset.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
