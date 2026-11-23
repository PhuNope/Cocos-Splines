'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const project=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-headway-'));
try {
 cp.execFileSync('tsc',['-p',path.join(project,'tsconfig.runtime.json'),'--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {SplineHeadwayRegistry}=require(path.join(tmp,'Core/SplineHeadway.js'));
 const {headwayWorldArc}=require(path.join(tmp,'Core/SplineHeadwayWorldArc.js'));
 const {buildWorldArcLength}=require(path.join(tmp,'Core/SplineWorldArcLength.js'));
 const near=(a,b,t=1e-5)=>assert(Math.abs(a-b)<t,String(a)+' != '+String(b));
 const arc=buildWorldArcLength(p=>({x:p*10,y:0,z:0}),1,32);
 const gate=new SplineHeadwayRegistry(),track={},other={};
 const leader={},follower={},opposite={};
 gate.set(leader,track,.6,1);gate.set(follower,track,.2,1);
 assert.equal(gate.size,2);
 let r=gate.limit(follower,track,.2,.9,1,arc,false,1,0);
 near(r.progress,.5);near(r.nearestWorldGap,4);near(r.availableWorldDistance,3);
 assert(r.limited&&!r.stopped);assert.equal(r.leader,leader);
 r=gate.limit(follower,track,.5,.6,1,arc,false,1,0);
 assert(r.limited&&r.stopped);near(r.progress,.5);
 gate.set(leader,track,.7,1);
 r=gate.limit(follower,track,.5,.6,1,arc,false,1,0);
 near(r.progress,.6);assert(!r.limited);
 r=gate.limit(follower,track,.5,.6,1,arc,false,1,4);
 near(r.progress,.525);assert(r.limited,'Soft brake tapers movement in last 4 world units');
 const unrelated={};gate.set(unrelated,other,.51,1);
 r=gate.limit(follower,track,.5,.6,1,arc,false,1,0);
 assert(!r.limited,'Different splines cannot limit each other');
 gate.remove(follower);gate.remove(leader);gate.remove(unrelated);
 gate.set(opposite,track,.2,-1);gate.set(follower,track,.8,-1);
 r=gate.limit(follower,track,.8,.1,-1,arc,false,2,0);
 near(r.progress,.4);assert(r.limited);
 gate.clear();
 gate.set(leader,track,.04,1);gate.set(follower,track,.95,1);
 r=gate.limit(follower,track,.95,1,1,arc,true,.7,0);
 near(r.progress,.97);assert(r.limited,'Closed seam sees ahead leader near progress 0');
 gate.set(leader,track,.96,-1);gate.set(follower,track,.03,-1);
 r=gate.limit(follower,track,.03,0,-1,arc,true,.5,0);
 near(r.progress,.01);assert(r.limited,'Closed seam sees leader near progress 1 while reversing');
 gate.set(leader,track,.03,1);gate.set(follower,track,.03,1);
 r=gate.limit(follower,track,.03,.5,1,arc,true,.5,0);
 assert(r.stopped,'Coincident followers cannot move forward into each other');
 gate.remove(leader);r=gate.limit(follower,track,.03,.5,1,arc,true,.5,0);
 assert(!r.limited,'Release from scene frees headway');
 assert.throws(()=>gate.set({},track,2,1),/Invalid/);
 assert.throws(()=>gate.limit({},track,.7,.2,1,arc,false,1,0),/Invalid/);
 assert.throws(()=>gate.limit({},track,0,1,1,arc,false,-1,0),/Invalid/);
 const rotated=buildWorldArcLength(p=>({x:p*20,y:p*3,z:0}),1,32);
 near(rotated.at(-1).distance,Math.hypot(20,3));
 // Cached World arc recalculates on revision/transform, not every follower update.
 let samples=0;
 const mock={
   count:2,length:10,closed:false,reversed:false,segmentCount:1,samplesPerCurve:32,
   revision:'one',node:{worldMatrix:{m00:1,m05:1,m10:1,m12:0,m13:0,m14:0}},
   getRevision(){return this.revision;},
   evaluateWorldPosition(p){samples++;return {x:p*10*this.node.worldMatrix.m00,y:0,z:0};},
 };
 const first=headwayWorldArc(mock);
 const observed=samples;
 const again=headwayWorldArc(mock);
 assert.strictEqual(first,again);assert.equal(samples,observed);
 mock.node.worldMatrix.m00=2;
 const scaled=headwayWorldArc(mock);
 near(scaled.at(-1).distance,20);assert(samples>observed);
 const afterTransform=samples;
 mock.revision='two';
 const revised=headwayWorldArc(mock);
 assert(samples>afterTransform);assert.notStrictEqual(revised,scaled);
 // Two logical lanes on the SAME SplineContainer must be independent.
 gate.clear();
 const laneLeader={},laneFollower={};
 gate.set(laneLeader,track,.6,1,1);
 gate.set(laneFollower,track,.2,1,2);
 let laneReport=gate.limit(laneFollower,track,.2,.9,1,arc,false,1,0,2);
 assert.equal(laneReport.limited,false,'Another lane cannot block centerline headway');
 laneReport=gate.limit(laneFollower,track,.2,.9,1,arc,false,1,0,1);
 assert.equal(laneReport.limited,true,'Same lane restricts progress');
 near(laneReport.progress,.5);
 gate.set(laneLeader,track,.6,1,2); // Dynamic lane switch is immediately visible
 laneReport=gate.limit(laneFollower,track,.2,.9,1,arc,false,1,0,2);
 assert.equal(laneReport.limited,true);
 assert.equal(gate.get(laneLeader).laneId,2);
 gate.remove(laneLeader);
 assert.equal(gate.limit(laneFollower,track,.2,.9,1,arc,false,1,0,2).limited,false);
 assert.throws(()=>gate.set({},track,.5,1,32),/Invalid/);
 assert.throws(()=>gate.limit({},track,0,1,1,arc,false,1,0,-1),/Invalid/);
 assert.equal(gate.get(laneFollower).progress,.2);
 console.log('SPLINE HEADWAY PASS: world arc clearances, soft braking, forward/backward, closed seams, pause/registration, transform and revision cache.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
