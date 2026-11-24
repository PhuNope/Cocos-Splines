'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
  fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(
  path.join(os.tmpdir(),'spline-advanced-prediction-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
   '--noEmit','false','--outDir',out],{stdio:'pipe'});
 const {SplineProximityRegistry,planSplineProximity}=
   require(path.join(out,'Core/SplineProximity.js'));
 const {validPredictionAcceleration,measuredPredictionAngularSpeed,
   relativeAcceleratedPredictionSegment}=require(
   path.join(out,'Core/SplineProximityPrediction.js'));
 const p=(x,y=0,z=0)=>({x,y,z}),near=(a,b,eps=.002)=>
   assert(Math.abs(a-b)<eps, a+' != '+b);
 const reg=new SplineProximityRegistry(),obstacle={},mover={},path10=t=>p(10*t);
 const q0={x:0,y:0,z:0,w:1};
 const q90={x:0,y:Math.SQRT1_2,z:0,w:Math.SQRT1_2};
 near(measuredPredictionAngularSpeed(q0,q90,.5),Math.PI,1e-8);
 near(measuredPredictionAngularSpeed(q0,
   {x:-q0.x,y:-q0.y,z:-q0.z,w:-q0.w},.5),0,1e-8);
 assert.equal(measuredPredictionAngularSpeed(q0,q90,0),null);
 assert.equal(measuredPredictionAngularSpeed(q0,{...q90,w:NaN},.5),null);
 assert.equal(measuredPredictionAngularSpeed(q0,q90,.01),null,'Outlier rate');
 assert(validPredictionAcceleration(p(-80)));
 assert(!validPredictionAcceleration(p(-81)));
 const curve=relativeAcceleratedPredictionSegment(
   p(0),p(10),p(-5),p(-20),1,0,1);
 near(curve.end.x,25);
 near(curve.maxChordError,2.5);
 assert.throws(()=>relativeAcceleratedPredictionSegment(
   p(0),p(10),p(0),p(-81),1,0,1),/Invalid/);
 assert.throws(()=>relativeAcceleratedPredictionSegment(
   p(0),p(10),p(0),p(0),1,.8,.5),/Invalid/);
 reg.set(obstacle,p(6),.5);
 assert.equal(reg.setAcceleration({},p(0)),false);
 assert.equal(reg.setAngularSpeed({},1),false);
 assert.throws(()=>reg.setAcceleration(obstacle,p(-81)),/acceleration/);
 assert.throws(()=>reg.setAngularSpeed(obstacle,-1),/angular/);
 reg.setVelocity(obstacle,p(-5));
 reg.setAcceleration(obstacle,p(-20));
 near(reg.limit(mover,path10,.5,0,16,1).fraction,1/3,
   .001); // Legacy velocity-only calculation is unchanged.
 const accelerating=reg.limit(mover,path10,.5,0,16,1,{acceleration:true});
 assert(accelerating.limited);
 assert(accelerating.fraction>.27&&accelerating.fraction<.281,
   'Quadratic path should make the approaching obstacle reach earlier');
 assert.equal(reg.getTelemetry().lastAcceleratedCandidates,1);
 near(reg.getTelemetry().lastPredictionSeconds,1);
 const direct=new Map([[obstacle,{...reg.get(obstacle)}]]);
 assert(planSplineProximity(mover,path10,direct,.5,0,16,undefined,1,
   {acceleration:true}).fraction<1/3);
 const snapshot=reg.get(obstacle);
 snapshot.acceleration.x=99;
 assert.equal(reg.get(obstacle).acceleration.x,-20);
 // Prediction-only acceleration expands candidate search even with v = 0.
 reg.set(obstacle,p(30),.5);reg.setVelocity(obstacle,p(0));
 reg.setAcceleration(obstacle,p(-80));
 assert.equal(reg.limit(mover,path10,.5,0,16,1).limited,false);
 const incoming=reg.limit(mover,path10,.5,0,16,1,{acceleration:true});
 assert(incoming.limited&&incoming.fraction>.72&&incoming.fraction<.75);
 assert.equal(reg.getTelemetry().lastCandidates,1);
 // A coarse 2-segment quadratic sweep must be conservative (never later
 // than the mathematical first contact of a constant-acceleration model).
 const coarse=reg.limit(mover,path10,.5,0,2,1,{acceleration:true});
 const trueContact=(-10+Math.sqrt(100+4*40*29))/(2*40);
 assert(coarse.fraction<=trueContact+1e-6);
 // Each setVelocity drops stale acceleration and angular speed, so a
 // follower that changes opt-in modes cannot retain old motion estimates.
 reg.setVelocity(obstacle,p(1));
 assert.equal(reg.get(obstacle).acceleration,undefined);
 assert.equal(reg.getTelemetry().lastAcceleratedCandidates,1,
    'Last query counters are snapshot statistics');
 reg.clearVelocity(obstacle);
 assert.equal(reg.get(obstacle).velocity,undefined);
 assert.equal(reg.get(obstacle).acceleration,undefined);
 // Rotating OBB: an orientation-fixed test misses the passing sphere;
 // angular opt-in uses a conservative enclosing sphere instead.
 const obb={center:p(5),half:p(1.5,.1,.1),
   axes:[p(1),p(0,1),p(0,0,1)]};
 reg.setObb(obstacle,obb);reg.setVelocity(obstacle,p(0));
 reg.setAngularSpeed(obstacle,3);
 const passing=t=>p(10*t,1,0);
 assert.equal(reg.limit(mover,passing,.2,0,16,.5).limited,false);
 const envelope=reg.limit(mover,passing,.2,0,16,.5,
   {rotationEnvelope:true});
 assert(envelope.limited);
 assert.equal(reg.getTelemetry().lastRotationEnvelopeCandidates,1);
 assert.equal(reg.getTelemetry().lastAcceleratedCandidates,0);
 reg.setVelocity(obstacle,p(0));
 assert.equal(reg.get(obstacle).angularSpeed,undefined);
 assert.equal(reg.limit(mover,passing,.2,0,16,.5,
   {rotationEnvelope:true}).limited,false);
 // Bounded acceleration must still be safe with very large clearance
 // values: fallback to enclosing-sphere sweep, not a radius>200 exception.
 reg.set(obstacle,p(4),.5);reg.setVelocity(obstacle,p(0));
 reg.setAcceleration(obstacle,p(-80));
 assert.doesNotThrow(()=>reg.limit(mover,path10,100,100,2,1,
   {acceleration:true}));
 reg.remove(obstacle);assert.equal(reg.size,0);
 reg.clear();
 assert.equal(reg.getTelemetry().lastAcceleratedCandidates,0);
 assert.equal(reg.getTelemetry().lastRotationEnvelopeCandidates,0);
 assert.equal(reg.limit(mover,path10,.5,0,16,1,{acceleration:true}).limited,false);
 console.log('ADVANCED PREDICTION PASS: quadratic curvature, broadphase, rotation envelope, lifecycle, quaternions.');
}finally{fs.rmSync(out,{recursive:true,force:true});}
