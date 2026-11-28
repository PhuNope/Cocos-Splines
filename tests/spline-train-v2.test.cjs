'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-train-'));
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false','--outDir',dir],{stdio:'pipe'});
 const {compileTrainRoute,locateTrainCars,normalizeTrainHead,advanceTrainHead,trainProgressAtDistance}=require(dir+'/Core/SplineTrainMath.js');
 const arc=(length)=>[{progress:0,distance:0},{progress:.5,distance:length*.25},{progress:1,distance:length}];
 const leg=(length,backwards=false)=>({arc:arc(length),backwards});
 const route=compileTrainRoute([leg(10),leg(20,true)],false);
 assert.equal(route.length,30);assert.equal(trainProgressAtDistance(arc(10),2.5),.5);
 assert.equal(normalizeTrainHead(route,0,3,4),8);
 assert.deepEqual(locateTrainCars(route,14,3,4).map(x=>[x.legIndex,x.routeDistance]),[[1,14],[1,10],[0,6]]);
 assert.equal(locateTrainCars(route,10,1,1)[0].progress,1);
 assert.equal(locateTrainCars(route,30,1,1)[0].progress,0);
 assert.deepEqual(advanceTrainHead(route,28,4,2,3,4),{distance:30,arrived:true});
 assert.throws(()=>normalizeTrainHead(route,0,10,4),/fit/);
 const loop=compileTrainRoute([leg(10),leg(20)],true);
 assert.deepEqual(locateTrainCars(loop,2,3,4).map(x=>x.routeDistance),[2,28,24]);
 assert.deepEqual(advanceTrainHead(loop,28,4,2,3,4),{distance:6,arrived:false});
 assert.throws(()=>normalizeTrainHead(loop,0,8,4),/fit/);
 assert.throws(()=>compileTrainRoute([{arc:[{progress:0,distance:0},{progress:1,distance:0}],backwards:false}],false));
 class Vec3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new Vec3(this.x,this.y,this.z);}static dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z;}}
 class Quat{constructor(x=0,y=0,z=0,w=1){Object.assign(this,{x,y,z,w});}clone(){return Object.assign(new Quat(),this);}static fromEuler(o){return o;}static fromAxes(o,x,y,z){o.axes={x,y,z};return o;}static multiply(o,a){return Object.assign(o,a);}}
 class Node{constructor(){this.parent=null;this.isValid=true;this.activeInHierarchy=true;this.worldPosition=new Vec3();this.worldRotation=new Quat();}setWorldPosition(p){if(this.fail){this.fail=false;throw Error('injected transform failure');}this.worldPosition=p.clone();}setWorldRotation(q){this.worldRotation=q.clone();}}
 class Component{constructor(){this.node=new Node();this.enabled=true;}}
 class SplineContainer{}
 let editor=false,frameBuilds=0;const activeJunctions=new Set();
 const cc={_decorator:{ccclass:()=>x=>x,menu:()=>x=>x,property:()=>{}},Component,Node,Vec3,Quat,CCBoolean:'boolean',CCInteger:'integer'};
 const original=Module._load;
 Module._load=function(name,parent,isMain){
  if(name==='cc')return cc;
  if(name==='cc/env')return {get EDITOR_NOT_IN_PREVIEW(){return editor;}};
  if(name==='../Core/SplineContainer')return {SplineContainer};
  if(name==='./SplineJunction')return {SplineJunction:{active:activeJunctions},JunctionExitDirection:{Preserve:0,Forward:1,Backward:2},JunctionTrafficSignal:{Green:0,Red:1,Yellow:2}};
  if(name==='../Core/SplineHeadwayWorldArc')return {headwayWorldArc:s=>s.arc};
  if(name==='../Core/SplineWorldFrames')return {createWorldFrameField:s=>{frameBuilds++;return {at:p=>({position:new Vec3(s.start+(s.end-s.start)*p),tangent:new Vec3(Math.sign(s.end-s.start)),right:new Vec3(0,0,-Math.sign(s.end-s.start)),up:new Vec3(0,1,0)})};}};
  return original.call(this,name,parent,isMain);
 };
 try{
  const {SplineTrainController}=require(dir+'/Components/SplineTrainController.js');
  const spline=(start,end)=>({start,end,arc:[{progress:0,distance:0},{progress:1,distance:Math.abs(end-start)}],count:2,node:new Node(),enabled:true});
  const a=spline(0,10),b=spline(30,10),train=new SplineTrainController();
  train.legs=[{spline:a,backwards:false},{spline:b,backwards:true}];train.cars=[new Node(),new Node(),new Node()];
  train.centerSpacing=4;train.startDistance=0;train.speed=4;train.onEnable();
  assert.equal(train.currentDistance,8);assert.deepEqual(train.cars.map(c=>c.worldPosition.x),[8,4,0]);
  train.lateUpdate(1.5);assert.equal(train.currentDistance,14);assert.deepEqual(train.cars.map(c=>c.worldPosition.x),[14,10,6]);assert.equal(frameBuilds,2);
  assert(train.cars.every(c=>c.worldRotation.axes.z.x===1));
  train.pause();train.lateUpdate(1);assert.equal(train.currentDistance,14);
  assert(train.play());train.lateUpdate(10);assert.equal(train.currentDistance,30);assert.equal(train.isPlaying,false);
  assert.deepEqual(train.cars.map(c=>c.worldPosition.x),[30,26,22]);
  const before=train.cars.map(c=>c.worldPosition.x);
  train.cars[1].fail=true;assert.equal(train.seekRouteDistance(12),false);assert.deepEqual(train.cars.map(c=>c.worldPosition.x),before);assert.equal(train.currentDistance,30);
  train.legs[1]={spline:spline(50,40),backwards:true};assert.equal(train.seekRouteDistance(12),false);assert.match(train.lastError,/discontinuity/i);
  assert.deepEqual(train.cars.map(c=>c.worldPosition.x),before);
  train.legs[1]={spline:b,backwards:true};assert(train.seekRouteDistance(12));assert.equal(train.lastError,'');
  train.cars[1].parent=train.cars[0];assert.equal(train.seekRouteDistance(16),false);assert.match(train.lastError,/ancestors/i);train.cars[1].parent=null;
  train.loopRoute=true;assert.equal(train.seekRouteDistance(16),false);assert.match(train.lastError,/discontinuity/i);
  train.loopRoute=false;editor=true;assert.equal(train.seekRouteDistance(20),false);editor=false;
  train.onDisable();assert.equal(train.isPlaying,false);
  const {splineTrafficGate:gate}=require(dir+'/Core/SplineTrafficGate.js');
  const junction=(from,to,reverse=false)=>{const j={node:new Node(),enabled:true,connections:[{spline:from,getProgress:()=>1},{spline:to,getProgress:()=>reverse?1:0,exitDirection:reverse?2:1,maxFollowers:1,trafficSignal:0}]};activeJunctions.add(j);return j;};
  const x=spline(0,10),y=spline(10,13),z=spline(13,40),j1=junction(x,y),j2=junction(y,z);
  const t=new SplineTrainController();t.legs=[{spline:x,backwards:false},{spline:y,backwards:false,entryJunction:j1,junctionEntryIndex:0,junctionExitIndex:1},{spline:z,backwards:false,entryJunction:j2,junctionEntryIndex:0,junctionExitIndex:1}];
  t.cars=[new Node(),new Node(),new Node()];t.centerSpacing=3;t.startDistance=6;t.speed=4;t.enableTraffic=true;t.trafficStopGap=.1;t.trafficTailClearance=.5;
  j1.connections[1].trafficSignal=1;t.onEnable();assert.equal(t.currentDistance,6);t.lateUpdate(2);
  assert.equal(t.currentDistance,9.9);assert(t.trafficWaiting);assert.equal(gate.waiting(j1,1),1);assert.equal(gate.count(j1,1),0);
  t.lateUpdate(2);assert.equal(gate.waiting(j1,1),1);assert.equal(t.currentDistance,9.9);
  j1.connections[1].trafficSignal=0;const competitor={};assert(!gate.move(competitor,j1,1,1));
  t.lateUpdate(1);assert.equal(t.currentDistance,13.9);assert.equal(t.trafficReservations,2);assert.equal(gate.count(j1,1),1);assert.equal(gate.count(j2,1),1);assert(!t.trafficWaiting);
  assert(!gate.move(competitor,j1,1,1));t.lateUpdate(.65);assert.equal(gate.count(j1,1),1); // tail exactly at clearance boundary
  t.lateUpdate(.1);assert.equal(gate.count(j1,1),0);assert.equal(gate.count(j2,1),1);assert(gate.move(competitor,j1,1,1));
  t.pause();assert.equal(gate.count(j2,1),1);assert.equal(t.seekRouteDistance(0),false);assert.equal(gate.count(j2,1),1);
  t.play();t.lateUpdate(1);assert.equal(gate.count(j2,1),0);assert.equal(t.trafficReservations,0);
  t.onDisable();gate.release(competitor);assert.equal(gate.size,0);assert.equal(gate.waitingCount,0);
  t.onEnable();t.cars[1].fail=true;t.lateUpdate(2);assert.equal(t.currentDistance,6);assert.equal(gate.size,0);assert.equal(t.isPlaying,false);
  t.play();t.lateUpdate(2);assert.equal(gate.size,2);gate.releaseJunction(j1);t.lateUpdate(.1);assert.match(t.lastError,/invalidated/);assert.equal(t.isPlaying,false);assert.equal(gate.count(j2,1),1);
  t.onDestroy();assert.equal(gate.size,0);
  t.startDistance=15;t.onEnable();assert.match(t.lastError,/before the first junction/);assert.equal(gate.size,0);
 }finally{Module._load=original;}
 console.log('TRAIN CONTROLLER V2 PASS: world arc route math, reversed legs, fixed consist, loop fitting, cache, rollback and runtime-only placement.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
