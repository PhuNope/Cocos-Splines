'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-lane-proximity-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {laneLateralOffset}=require(path.join(tmp,'Core/SplineLaneLayout.js'));
 const {SplineProximityRegistry,planSplineProximity}=
   require(path.join(tmp,'Core/SplineProximity.js'));
 const near=(a,b,t=2e-4)=>assert(Math.abs(a-b)<t,a+' != '+b);
 assert.equal(laneLateralOffset({enabled:false,laneId:31,laneCount:0,laneWidth:0}),0);
 const lane=id=>laneLateralOffset({enabled:true,laneId:id,laneCount:4,laneWidth:3.5});
 near(lane(0),-5.25);near(lane(1),-1.75);near(lane(2),1.75);near(lane(3),5.25);
 assert.equal(laneLateralOffset({enabled:true,laneId:0,laneCount:1,laneWidth:3}),0);
 assert.throws(()=>laneLateralOffset({enabled:true,laneId:2,laneCount:2,laneWidth:3}),/Invalid/);
 assert.throws(()=>laneLateralOffset({enabled:true,laneId:1,laneCount:2,laneWidth:0}),/Invalid/);
 const p=(x,y=0,z=0)=>({x,y,z});
 const gate=new SplineProximityRegistry(),owner={},blocker={},bridge={};
 gate.set(blocker,p(5),.5);
 const world=t=>p(t*10);
 let result=gate.limit(owner,world,.5,0);
 assert(result.limited);assert(!result.stopped);assert.equal(result.obstacle,blocker);
 near(result.fraction,.4);
 result=gate.limit(owner,t=>p(t*100),.5,0);
 near(result.fraction,.04,2e-4); // Sweep across obstacle with a large step
 result=gate.limit(owner,t=>p(t*10,4),.5,0);
 assert(!result.limited,'Different physical lane is not blocked');
 gate.set(bridge,p(8,5),1);
 result=gate.limit(owner,t=>p(t*10,0),.5,0);
 assert.equal(result.obstacle,blocker,'Elevated bridge does not collide');
 const other={};gate.set(other,p(2),.5);
 result=gate.limit(owner,world,.5,0);
 near(result.fraction,.1);assert.equal(result.obstacle,other);
 gate.remove(other);gate.remove(blocker);
 result=gate.limit(owner,world,.5,0);
 assert(!result.limited);
 gate.set(blocker,p(5),.5);
 result=gate.limit(owner,t=>p(t*10),.5,.5);
 near(result.fraction,.35);
 result=gate.limit(owner,t=>p(5+t*2),.5,0);
 assert(result.stopped&&result.limited,'Initial overlap must fail closed');
 result=gate.limit(owner,t=>p(-5-10*t),.5,0);
 assert(!result.limited,'Moving away from a distant obstacle is safe');
 // A smooth bend is sampled as multiple segments rather than a single chord.
 gate.clear();gate.set(blocker,p(5,2),.4);
 result=gate.limit(owner,t=>p(t*10,2*Math.sin(Math.PI*t)),.4,0);
 assert(result.limited&&result.fraction>.25&&result.fraction<.55);
 const snapshot=gate.get(blocker);snapshot.position.x=100;
 assert.equal(gate.get(blocker).position.x,5,'Registry snapshots cannot be edited externally');
 assert.throws(()=>gate.set({},p(0),-1),/Invalid/);
 assert.throws(()=>gate.limit({},()=>p(0),.5,-1),/Invalid/);
 assert.throws(()=>planSplineProximity({},()=>p(NaN),new Map(),.5,0),/Invalid/);
 gate.clear();assert.equal(gate.size,0);
 console.log('LANE/PROXIMITY PASS: centered physical lanes, 3D swept spheres, elevated separation, large steps, safe stops and lifecycle.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
