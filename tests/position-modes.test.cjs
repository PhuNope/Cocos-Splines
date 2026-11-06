'use strict';
/** Parameter conversion regression suite. Mocked Cocos runtime, not a live Editor test. */
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-position-'));
const near=(a,b,eps=1e-6)=>assert(Math.abs(a-b)<eps,`${a} should ~= ${b}`);
try {
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',out],{stdio:'pipe'});
 const {SplinePositionMode:Mode,toNormalizedDistance,toNormalizedRange}=require(path.join(out,'Core','SplinePosition.js'));
 const math=require(path.join(out,'Core','SplineMath.js'));
 const line=math.buildArcLUT([
  {position:math.v(0),tangentIn:math.v(),tangentOut:math.v(),mode:1},
  {position:math.v(2),tangentIn:math.v(),tangentOut:math.v(),mode:1},
  {position:math.v(12),tangentIn:math.v(),tangentOut:math.v(),mode:1},
 ],false,128);
 near(line.total,12);
 near(math.distanceAtParameter(line,.5),2,0.00001); // 50% of cubic segments, not 50% length
 near(math.parameterAtDistance(line,2),.5,0.00001);
 near(math.distanceAtParameter(line,1),12);
 near(math.distanceAtParameter(line,-1),0);
 near(math.distanceAtParameter(line,3),12);
 for(const fraction of [.001,.02,.2,.35,.5,.75,.987,1]) {
  const param=math.parameterAtDistance(line,line.total*fraction);
  near(math.distanceAtParameter(line,param)/line.total,fraction,1e-5);
 }
 const spline={length:20,distanceAtT:t=>20*t*t}; // intentionally non-constant speed
 near(toNormalizedDistance(spline,Mode.NormalizedDistance,.5,123),.5);
 near(toNormalizedDistance(spline,Mode.Distance,0,5),.25);
 near(toNormalizedDistance(spline,Mode.SplineT,.5,100),.25);
 near(toNormalizedDistance(spline,Mode.Distance,0,100),1);
 near(toNormalizedDistance(spline,Mode.Distance,0,-5),0);
 near(toNormalizedDistance(spline,Mode.NormalizedDistance,NaN,0),0);
 near(toNormalizedDistance({length:0,distanceAtT:()=>0},Mode.Distance,0,1),0);
 assert.deepEqual(toNormalizedRange(spline,Mode.Distance,0,1,5,15),[.25,.75]);
 assert.deepEqual(toNormalizedRange(spline,Mode.SplineT,.5,1,0,0),[.25,1]);
 // Runtime integration (decorators are no-ops, movement uses a deterministic path).
 class Vec3 {
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  clone(){return new Vec3(this.x,this.y,this.z);}
  static add(out,a,b){return Object.assign(out,{x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});}
 }
 class Quat {constructor(){this.x=0;this.y=0;this.z=0;this.w=1;}clone(){return new Quat();}}
 class Node {
  constructor(name){this.uuid=name;this.name=name;this.worldPosition=new Vec3();this.worldRotation=new Quat();this.isValid=true;this.parent=null;this.events=[];this.worldMatrix={};}
  setWorldPosition(v){this.worldPosition=v.clone();}
  setWorldRotation(q){this.worldRotation=q.clone();}
  emit(name,payload){this.events.push({name,payload});}
  getComponent(){return null;}
 }
 const handlers=[];
 class EventHandler {static emitEvents(events,...payload){for(const event of events||[])if(typeof event==='function')event(...payload);handlers.push(...payload);}}
 const deco=(...args)=>args.length>1?undefined:()=>{};
 const env={EDITOR_NOT_IN_PREVIEW:false};
 const cc={_decorator:{ccclass:()=>cls=>cls,property:deco,menu:()=>cls=>cls,executeInEditMode:()=>cls=>cls},
  Component:class Component{constructor(){this.enabled=true;}getComponent(){return null;}},Node,Vec3,Quat,EventHandler,Enum:x=>x};
 const original=Module._load;
 Module._load=function(name,parent,isMain){if(name==='cc')return cc;if(name==='cc/env')return env;return original.call(this,name,parent,isMain);};
 try {
  const {SplineAnimate,LoopMode,Easing,JunctionMode}=require(path.join(out,'Components','SplineAnimate.js'));
  const {SplineTrigger}=require(path.join(out,'Components','SplineTrigger.js'));
  const {SplineJunction,SplineJunctionLink}=require(path.join(out,'Components','SplineJunction.js'));
  const a={...spline,node:new Node('RoadA'),count:2,
    distanceAtT(t){return this.length*t*t;},
    evaluateWorldPosition:p=>new Vec3(20*p,0,0),tAtProgress:p=>Math.sqrt(p),getRevision:()=>String(spline.length)};
  const b={length:12,distanceAtT:t=>12*t*t,node:new Node('RoadB'),count:2,
    evaluateWorldPosition:p=>new Vec3(100+12*p,0,0),tAtProgress:p=>Math.sqrt(p),getRevision:()=>'road-b'};
  const anim=new SplineAnimate();anim.node=new Node('Follower');anim.target=new Node('Car');anim.spline=a;anim.alignToSpline=false;
  anim.loopMode=LoopMode.Once;anim.duration=10;anim.startPositionMode=Mode.Distance;anim.startDistance=8;
  anim.easing=Easing.EaseIn;anim.onEnable();near(anim.target.worldPosition.x,8);near(anim.currentDistance,8);
  anim.seekDistance(6);near(anim.target.worldPosition.x,6);near(anim.currentT,Math.sqrt(.3));
  anim.seekAtT(.5);near(anim.target.worldPosition.x,5);near(anim.currentDistance,5);
  anim.setCurrentSplineAtDistance(b,6);near(anim.target.worldPosition.x,106);near(anim.currentT,Math.sqrt(.5));
  anim.spline=a;anim.setCurrentSpline(a,0);
  const trigger=new SplineTrigger();trigger.node=new Node('Trigger');trigger.spline=a;
  trigger.positionMode=Mode.SplineT;trigger.progress=.5;
  near(trigger.getProgress(),.25);
  let triggerPayload=null;trigger.onCross=[payload=>triggerPayload=payload];trigger.onEnable();
  anim.seekDistance(8,true);
  assert(triggerPayload,'trigger fired when seekDistance crosses t=.5');
  near(triggerPayload.progress,.25);near(triggerPayload.distance,5);near(triggerPayload.t,.5);
  trigger.positionMode=Mode.Distance;trigger.distance=10;
  near(trigger.getProgress(),.5);
  const junction=new SplineJunction();junction.node=new Node('Junction');
  const entry=new SplineJunctionLink();entry.spline=a;entry.positionMode=Mode.Distance;entry.distance=10;
  const exit=new SplineJunctionLink();exit.spline=b;exit.positionMode=Mode.SplineT;exit.progress=.5;
  junction.connections=[entry,exit];
  let reach=null,switchEvent=null;
  junction.onReach=[p=>reach=p];junction.onSwitch=[p=>switchEvent=p];junction.onEnable();
  anim.setCurrentSpline(a,0);anim.duration=10;anim.easing=Easing.Linear;anim.junctionMode=JunctionMode.FirstOther;
  anim.play();anim.update(6); // cross A at 10/20, then 1 second on B
  assert(reach&&switchEvent,'junction events triggered');
  near(reach.distance,10);near(reach.progress,.5);
  near(switchEvent.nextDistance,3);near(switchEvent.nextT,.5);
  assert.equal(anim.currentSpline,b);near(anim.currentDistance,4.2,1e-4);near(anim.target.worldPosition.x,104.2,1e-4);
  // Changing spline length should keep Distance marker at 10, now halfway->quarter etc.
  a.length=40;near(entry.getProgress(),.25);near(trigger.getProgress(),.25);
  // Editor preview uses distance and does not dispatch gameplay events.
  env.EDITOR_NOT_IN_PREVIEW=true;
  const scrubbing=new SplineAnimate();scrubbing.node=new Node('Scrubber');scrubbing.target=new Node('PreviewCar');scrubbing.spline=a;
  scrubbing.alignToSpline=false;scrubbing.previewInEditor=true;
  scrubbing.previewPositionMode=Mode.Distance;scrubbing.previewDistance=16;
  scrubbing.onEnable();near(scrubbing.target.worldPosition.x,8); // 16 / new length 40 * 20 world units
  scrubbing.previewPositionMode=Mode.SplineT;scrubbing.previewProgress=.5;scrubbing.update(0);
  near(scrubbing.target.worldPosition.x,5);
  scrubbing.previewInEditor=false;scrubbing.update(0);
  near(scrubbing.target.worldPosition.x,0);
  trigger.onDisable();junction.onDisable();
 }finally {Module._load=original;}
 console.log('POSITION MODES PASS: arc LUT inverse, t vs distance, clamp, Trigger/Junction routing, Animate seek/start/preview.');
}finally {fs.rmSync(out,{recursive:true,force:true});}
