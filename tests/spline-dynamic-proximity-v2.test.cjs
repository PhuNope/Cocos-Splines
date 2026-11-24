'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
    path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'spl-dynamic-proximity-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
     '--noEmit','false','--outDir',out],{stdio:'pipe'});
 const {SplineProximityRegistry,planSplineProximity}=
     require(path.join(out,'Core/SplineProximity.js'));
 const {relativePredictionSegment,validPredictionVelocity}=
     require(path.join(out,'Core/SplineProximityPrediction.js'));
 const p=(x,y=0,z=0)=>({x,y,z});
 const near=(actual,expected,tolerance=3e-4)=>
     assert(Math.abs(actual-expected)<tolerance,actual+' != '+expected);
 const reg=new SplineProximityRegistry(),moving={},obstacle={};
 const path10=t=>p(10*t);
 reg.set(obstacle,p(6),.5);
 assert.equal(reg.setVelocity({},p(1)),false);
 assert.equal(validPredictionVelocity(p(10)),true);
 assert.equal(validPredictionVelocity(p(101)),false);
 assert.throws(()=>reg.setVelocity(obstacle,p(101)),/velocity/);
 assert.throws(()=>reg.setVelocity(obstacle,p(NaN)),/velocity/);
 assert.throws(()=>reg.limit(moving,path10,.5,0,16,-1),/Invalid/);
 assert.throws(()=>reg.limit(moving,path10,.5,0,16,1.1),/Invalid/);
 near(reg.limit(moving,path10,.5,0).fraction,.5);
 reg.setVelocity(obstacle,p(-10));
 near(reg.limit(moving,path10,.5,0,16,0).fraction,.5);
 let report=reg.limit(moving,path10,.5,0,16,.5);
 near(report.fraction,1/3);
 assert.equal(reg.getTelemetry().lastPredictedCandidates,1);
 near(reg.getTelemetry().lastPredictionSeconds,.5);
 const velocity=reg.get(obstacle).velocity;velocity.x=100;
 assert.equal(reg.get(obstacle).velocity.x,-10,'Velocity getter must copy');
 reg.set(obstacle,p(6),.5);
 assert.equal(reg.get(obstacle).velocity.x,-10,'Shape update must preserve velocity');
 reg.setVelocity(obstacle,p(12));
 assert.equal(reg.limit(moving,path10,.5,0,16,.5).limited,false);
 reg.clearVelocity(obstacle);
 assert.equal(reg.get(obstacle).velocity,undefined);
 near(reg.limit(moving,path10,.5,0,16,.5).fraction,.5);
 // Broadphase includes agents that move INTO the swept path.
 reg.set(obstacle,p(45),.5);
 reg.setVelocity(obstacle,p(-80));
 report=reg.limit(moving,path10,.5,0,16,.5);
 assert(report.limited);
 near(report.fraction,.88);
 assert.equal(reg.getTelemetry().lastCandidates,1);
 // Crossing two trajectories at the same time.
 reg.set(obstacle,p(5,-5),.5);
 reg.setVelocity(obstacle,p(0,10));
 assert.equal(reg.limit(moving,path10,.5,0,16,0).limited,false);
 report=reg.limit(moving,path10,.5,0,16,1);
 near(report.fraction,.5-Math.SQRT1_2/10);
 assert.equal(report.obstacle,obstacle);
 // Moving shape geometry is translated in relative space (no BVH rebuild).
 reg.set(obstacle,p(6),2,{min:p(5.5,-.5,-.5),max:p(6.5,.5,.5)});
 reg.setVelocity(obstacle,p(-10));
 report=reg.limit(moving,path10,.5,0,16,.5);
 near(report.fraction,1/3);
 reg.setCapsule(obstacle,{a:p(6,-.5),b:p(6,.5),radius:.3});
 reg.setVelocity(obstacle,p(-10));
 report=reg.limit(moving,path10,.5,0,16,.5);
 near(report.fraction,(6-.8)/15);
 reg.setMesh(obstacle,[p(6,-1,-1),p(6,1,-1),p(6,0,1)],[0,1,2]);
 reg.setVelocity(obstacle,p(-10));
 report=reg.limit(moving,path10,.5,0,16,.5);
 near(report.fraction,(6-.5)/15);
 assert(reg.getTelemetry().lastTriangleTests>0);
 const direct=new Map([[obstacle,{position:p(6),radius:.5,velocity:p(-10)}]]);
 const metrics={segmentTests:0};
 near(planSplineProximity(moving,path10,direct,.5,0,16,metrics,.5).fraction,1/3);
 assert(metrics.segmentTests>0);
 const pair=relativePredictionSegment(p(0),p(10),p(2),.5,0,1);
 assert.deepEqual(pair,{start:p(0),end:p(9)});
 assert.throws(()=>relativePredictionSegment(p(0),p(10),p(0),1,.8,.2),/Invalid/);
 reg.remove(obstacle);
 assert.equal(reg.size,0);
 assert.equal(reg.limit(moving,path10,.5,0,16,.5).limited,false);
 reg.clear();
 assert.equal(reg.getTelemetry().lastPredictionSeconds,0);
 assert.equal(reg.getTelemetry().lastPredictedCandidates,0);
 console.log('DYNAMIC PROXIMITY PASS: relative sweeps, crossing agents, moving mesh, broadphase, velocity lifecycle.');
}finally{fs.rmSync(out,{recursive:true,force:true});}
