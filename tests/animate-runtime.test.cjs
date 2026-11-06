'use strict';
/* Offline integration of the compiled SplineAnimate with engine/environment mocks.
 * This does NOT replace a live Cocos Creator scene test. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'cocos-splines-runtime-'));
try {
  cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',out],{stdio:'pipe'});
  class Vec3 {
    constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
    clone(){return new Vec3(this.x,this.y,this.z);}
    static add(out,a,b){out.x=a.x+b.x;out.y=a.y+b.y;out.z=a.z+b.z;return out;}
  }
  class Quat {
    constructor(x=0,y=0,z=0,w=1){this.x=x;this.y=y;this.z=z;this.w=w;}
    clone(){return new Quat(this.x,this.y,this.z,this.w);}
    static multiply(out,a,b){out.x=b.x;out.y=b.y;out.z=b.z;out.w=b.w;return out;}
  }
  const noOp=()=>{};
  const deco=(...args)=>args.length>1?undefined:noOp;
  class Component {constructor(){this.enabled=true;}getComponent(type){return this.node.getComponent(type);}}
  class Node {
    constructor(uuid){this.uuid=uuid;this.isValid=true;this.parent=null;this.worldPosition=new Vec3(4,0,0);this.worldRotation=new Quat();this.events=[];}
    emit(name,payload){this.events.push({name,payload});}
    getComponent(){return null;}
    setWorldPosition(x){this.worldPosition=x.clone();}
    setWorldRotation(x){this.worldRotation=x.clone();}
  }
  const handlers=[];
  class EventHandler { static emitEvents(events,...payload){for(const e of events||[])if(typeof e==='function')e(...payload);else if(typeof e?.handler==='function')e.handler(...payload);handlers.push(...payload);}}
  const env={EDITOR_NOT_IN_PREVIEW:true};
  const cc={_decorator:{ccclass:()=>cls=>cls,property:deco,menu:()=>cls=>cls,executeInEditMode:()=>cls=>cls},
    Component,Node,Vec3,Quat,EventHandler,Enum:x=>x};
  const original=Module._load;
  Module._load=function(request,parent,isMain){if(request==='cc')return cc;if(request==='cc/env')return env;return original.call(this,request,parent,isMain);};
  try{
    // Module import of SplineContainer is safe with mocks; its geometry methods are never called here.
    const {SplineAnimate,AnimateMethod,LoopMode,JunctionMode}=require(path.join(out,'Components','SplineAnimate.js'));
    const target=new Node('target');
    const sourceNode=new Node('path');
    sourceNode.worldMatrix={m12:0,m13:0,m14:0};
    const source={node:sourceNode,count:2,length:10,
      evaluateWorldPosition:t=>new Vec3(t*10,0,0),
      distanceAtT:t=>t*10,tAtProgress:t=>t,tAtDistance:d=>d/10,
      evaluateRotation:()=>new Quat(),
      getRevision:()=>'rev1'};
    const animate=new SplineAnimate();animate.node=new Node('animate-node');animate.target=target;animate.spline=source;
    animate.alignToSpline=false;
    assert.equal(target.worldPosition.x,4);
    animate.previewAt(.6);assert.equal(target.worldPosition.x,6);
    animate.previewAt(.2);assert.equal(target.worldPosition.x,2);
    animate.restorePreview();assert.equal(target.worldPosition.x,4);
    animate.previewInEditor=true;animate.previewProgress=.8;
    animate.onEnable();assert.equal(target.worldPosition.x,8);
    animate.previewProgress=.4;animate.update(0);assert.equal(target.worldPosition.x,4);
    animate.previewInEditor=false;animate.update(0);assert.equal(target.worldPosition.x,4);
    // A target co-located with the source must never move the source along itself.
    animate.target=sourceNode;assert.equal(animate.previewAt(.5),false);
    animate.target=target;
    env.EDITOR_NOT_IN_PREVIEW=false;
    target.worldPosition=new Vec3(4,0,0);
    animate.method=AnimateMethod.Time;animate.duration=4;animate.loopMode=LoopMode.Once;animate.startProgress=.25;
    animate.playOnStart=true;
    animate.onEnable();assert.equal(target.worldPosition.x,2.5);
    animate.update(1);assert.equal(target.worldPosition.x,5);
    animate.pause();animate.update(1);assert.equal(target.worldPosition.x,5);
    animate.play();animate.update(20);assert.equal(target.worldPosition.x,10);
    animate.restart();assert.equal(target.worldPosition.x,0);
    animate.method=AnimateMethod.Speed;animate.speed=5;animate.loopMode=LoopMode.PingPong;
    animate.restart();animate.update(1);assert.equal(target.worldPosition.x,5);
    animate.update(2);assert.equal(target.worldPosition.x,5);

    // Two named spline paths connected at progress 0.5; events must be called
    // when crossed even if the follower traverses the junction within one update.
    const {SplineTrigger,TriggerDirection}=require(path.join(out,'Components','SplineTrigger.js'));
    const {SplineJunction,SplineJunctionLink}=require(path.join(out,'Components','SplineJunction.js'));
    const follower=new SplineAnimate();follower.node=new Node('follower');follower.target=new Node('car');
    const a={...source,node:new Node('lane-a'),length:10};
    const b={...source,node:new Node('lane-b'),length:10,evaluateWorldPosition:t=>new Vec3(100+t*10,0,0)};
    const trigger=new SplineTrigger();trigger.node=new Node('checkpoint');trigger.spline=a;trigger.progress=.25;
    const triggerCalls=[];trigger.onCross=[payload=>triggerCalls.push(payload)];trigger.onEnable();
    const junction=new SplineJunction();junction.node=new Node('junction');
    const entry=new SplineJunctionLink();entry.spline=a;entry.progress=.5;
    const exit=new SplineJunctionLink();exit.spline=b;exit.progress=.1;
    junction.connections=[entry,exit];const reaches=[],switches=[];
    junction.onReach=[p=>reaches.push(p)];junction.onSwitch=[p=>switches.push(p)];junction.onEnable();
    follower.spline=a;follower.loopMode=LoopMode.Once;follower.duration=4;
    follower.junctionMode=1; // FirstOther
    follower.onEnable();follower.update(2.5);
    assert.equal(triggerCalls.length,1,'trigger fired crossing progress .25');
    assert.equal(triggerCalls[0].direction,1);
    assert.equal(reaches.length,1,'junction reached');
    assert.equal(switches.length,1,'junction switched');
    assert.equal(follower.currentSpline,b,'follower switched to other road');
    assert.equal(follower.target.worldPosition.x>100,true,'target moved along new spline');
    assert(follower.node.events.some(x=>x.name==='spline-junction-switch'));

    // Regression: Off must NEVER route even if On Reach requests an exit.
    // Previously the requested exit bypassed junctionMode altogether.
    const makeFollower=(mode,loopMode=LoopMode.Once)=>{
      const f=new SplineAnimate();f.node=new Node('junction-mode-'+mode);
      f.target=new Node('target-'+mode);f.spline=a;f.alignToSpline=false;
      f.duration=4;f.method=AnimateMethod.Time;f.loopMode=loopMode;
      f.junctionMode=mode;f.onEnable();return f;
    };
    const originalReach=junction.onReach;
    const baselineSwitches=switches.length;
    const offReaches=[];
    junction.onReach=[event=>{
      offReaches.push(event);
      // A script might request a branch even when routing is disabled.
      event.follower.requestJunctionExit(1);
    }];
    const off=makeFollower(JunctionMode.Off,LoopMode.PingPong);
    off.update(2.5);
    assert.equal(off.currentSpline,a,'Off must stay on source spline despite requested exit');
    assert.equal(off.target.worldPosition.x,6.25,'Off remains on source geometric path');
    assert.equal(switches.length,baselineSwitches,'Off does not emit On Switch');
    off.update(5); // Reaches end, reverses, crosses same Junction backwards.
    assert.equal(off.currentSpline,a,'Off + PingPong cannot change source spline');
    assert.equal(switches.length,baselineSwitches,'Off + PingPong never emits On Switch');
    assert(offReaches.length>=2,'On Reach must still fire when routing is Off');

    // Manual with no exit request should not switch; with a valid request it should.
    junction.onReach=[];
    const manualStay=makeFollower(JunctionMode.Manual);
    manualStay.update(2.5);
    assert.equal(manualStay.currentSpline,a,'Manual without request stays on source');
    junction.onReach=[event=>event.follower.requestJunctionExit(1)];
    const manualGo=makeFollower(JunctionMode.Manual);
    manualGo.update(2.5);
    assert.equal(manualGo.currentSpline,b,'Manual honors an explicit valid exit');

    // Autonomous modes must ignore the manual callback override.
    junction.onReach=[event=>event.follower.requestJunctionExit(999)];
    const first=makeFollower(JunctionMode.FirstOther);
    first.update(2.5);
    assert.equal(first.currentSpline,b,'First Other ignores manual exit override');
    const round=makeFollower(JunctionMode.RoundRobin);
    round.update(2.5);
    assert.equal(round.currentSpline,b,'Round Robin ignores manual exit override');
    junction.onReach=originalReach;
    const calls=triggerCalls.length;
    trigger.workOnce=true;trigger.resetTrigger();trigger.fire(follower,1);trigger.fire(follower,1);
    assert.equal(triggerCalls.length,calls+1,'workOnce prevents duplicate event');
    trigger.resetTrigger();trigger.direction=TriggerDirection.Backward;
    assert.equal(trigger.fire(follower,1),false,'direction filter');
    assert.equal(trigger.fire(follower,-1),true,'backward crossing');
    trigger.onDisable();junction.onDisable();
        console.log('ANIMATE + TRIGGER/JUNCTION RUNTIME PASS: editor scrub/restore, scene-only update, once/pause/restart, speed/pingpong, self-source guard.');
  }finally{Module._load=original;}
}finally{fs.rmSync(out,{recursive:true,force:true});}
