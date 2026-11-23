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
    const {SplineAnimate,AnimateMethod,LoopMode,JunctionMode,RouteCostSpace}=require(path.join(out,'Components','SplineAnimate.js'));
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
    // ShortestRoute chooses the junction exit leading toward the requested spline.
    junction.onReach=[]; // no manual callback required
    const shortest=makeFollower(JunctionMode.ShortestRoute);
    shortest.routeDestination=b;shortest.routeDestinationProgress=.85;
    const previewRoute=shortest.planRouteTo(b,.85);
    assert(previewRoute&&previewRoute.switchCount===1,'Route planner finds one junction switch');
    assert.equal(shortest.routeCostSpace,RouteCostSpace.Local,
      'Existing scenes keep legacy LOCAL routing by default');
    shortest.routeCostSpace=RouteCostSpace.World;
    const worldPreview=shortest.planRouteTo(b,.85);
    assert(worldPreview&&worldPreview.switchCount===1);
    assert(Math.abs(worldPreview.distance-previewRoute.distance)<1e-4,
      'World and local costs match without spline scale');
    shortest.routeCostSpace=RouteCostSpace.Local;
    shortest.update(2.5);
    assert.equal(shortest.currentSpline,b,'ShortestRoute picks reachable destination');
    assert.equal(shortest.junctionMode,JunctionMode.ShortestRoute);
    const noDestination=makeFollower(JunctionMode.ShortestRoute);
    noDestination.update(2.5);
    assert.equal(noDestination.currentSpline,a,'ShortestRoute without target is inert');
    const guarded=makeFollower(JunctionMode.ShortestRoute);
    guarded.routeDestination=b;guarded.routeDestinationProgress=.85;
    guarded.routeMaxWorldGap=.5; // junction is 96 world units apart
    guarded.update(2.5);
    assert.equal(guarded.currentSpline,a,'World gap guard prevents teleport');
    const direct=makeFollower(JunctionMode.ShortestRoute);
    direct.followRouteTo(a,.9);
    assert.equal(direct.junctionMode,JunctionMode.ShortestRoute);
    direct.update(2.5);
    assert.equal(direct.currentSpline,a,'Shortest path on current spline needs no switch');
    // Phase 3.3 — arrive at the exact normalized route marker, including a
    // single update that switches between multiple splines.
    const near=(x,y)=>assert(Math.abs(x-y)<1e-5,String(x)+' != '+String(y));
    const ending=makeFollower(JunctionMode.ShortestRoute);
    const arrived=[],editorArrivals=[];
    ending.onRouteArrived=[event=>editorArrivals.push(event)];
    ending.AddOnRouteArrivedEvent(event=>arrived.push(event));
    ending.followRouteTo(a,.35,true);
    ending.update(3); // would overshoot .35 without route arrival clipping
    assert.strictEqual(ending.currentSpline,a);
    near(ending.currentProgress,.35);
    near(ending.target.worldPosition.x,3.5);
    assert(!ending.isPlaying);
    assert(ending.routeArrived);
    assert.equal(arrived.length,1);
    assert.equal(editorArrivals.length,1);
    assert.equal(arrived[0].stopped,true);
    assert.strictEqual(arrived[0].spline,a);
    assert.equal(arrived[0].direction,1);
    assert.equal(ending.node.events.filter(e=>e.name==='spline-route-arrived').length,1);
    // Resume without changing the destination must not emit a second arrival.
    ending.play();ending.update(.2);
    assert.equal(arrived.length,1);
    // A newly requested destination re-arms arrival even after auto-stop.
    ending.followRouteTo(a,.65,true);
    ending.update(2);
    assert(!ending.isPlaying);near(ending.currentProgress,.65);
    assert.equal(arrived.length,2);

    const continuous=makeFollower(JunctionMode.ShortestRoute);
    const uninterrupted=[];
    continuous.AddOnRouteArrivedEvent(event=>uninterrupted.push(event));
    continuous.followRouteTo(a,.3,false);
    continuous.update(1.7);
    assert.equal(uninterrupted.length,1,'Event fires even with auto-stop disabled');
    assert.equal(uninterrupted[0].stopped,false);
    near(continuous.currentProgress,.425);
    assert(continuous.isPlaying);
    continuous.update(.15);
    assert.equal(uninterrupted.length,1,'No duplicate On Arrived in subsequent frames');
    continuous.restart();continuous.update(1.7);
    assert.equal(uninterrupted.length,2,'Restart re-arms route arrival');

    const branchArrival=makeFollower(JunctionMode.ShortestRoute);
    let branches=0;branchArrival.AddOnRouteArrivedEvent(()=>branches++);
    branchArrival.followRouteTo(b,.3,true);
    branchArrival.update(4); // crosses A->B switch, then B .3, in same update
    assert.strictEqual(branchArrival.currentSpline,b);
    near(branchArrival.currentProgress,.3);
    near(branchArrival.target.worldPosition.x,103);
    assert.equal(branches,1);
    assert(!branchArrival.isPlaying);

    const sameJunction=makeFollower(JunctionMode.ShortestRoute);
    sameJunction.followRouteTo(a,.5,true);
    sameJunction.update(3);
    assert.strictEqual(sameJunction.currentSpline,a,
      'Do not switch away from a coincident Junction destination');
    near(sameJunction.currentProgress,.5);
    assert(sameJunction.routeArrived);

    const backwardArrival=makeFollower(JunctionMode.ShortestRoute);
    backwardArrival.setCurrentSpline(a,.9,-1);
    const backwardEvents=[];backwardArrival.AddOnRouteArrivedEvent(e=>backwardEvents.push(e));
    backwardArrival.followRouteTo(a,.7,true);backwardArrival.update(2);
    near(backwardArrival.currentProgress,.7);
    assert.equal(backwardEvents[0].direction,-1);
    assert(!backwardArrival.isPlaying);

    const atStart=makeFollower(JunctionMode.ShortestRoute);
    atStart.followRouteTo(a,0,true);
    atStart.update(.05);
    assert(atStart.routeArrived);
    near(atStart.currentProgress,0);
    assert(!atStart.isPlaying);
    assert.equal(atStart.node.events.filter(e=>e.name==='spline-route-arrived').length,1);

    const boundaryArrival=makeFollower(JunctionMode.ShortestRoute,LoopMode.Loop);
    let ends=0;boundaryArrival.onEndReached=[()=>ends++];
    boundaryArrival.followRouteTo(a,1,true);
    boundaryArrival.update(10);
    near(boundaryArrival.currentProgress,1);
    assert.equal(ends,1,'Boundary event is preserved at route destination 1');
    assert(!boundaryArrival.isPlaying);

    const legacyArrival=makeFollower(JunctionMode.Off);
    legacyArrival.routeDestination=a;
    legacyArrival.routeDestinationProgress=.3;
    legacyArrival.stopOnRouteArrival=true;
    legacyArrival.update(1.5);
    assert(!legacyArrival.routeArrived);
    assert(legacyArrival.isPlaying);
    assert.equal(legacyArrival.node.events.filter(e=>e.name==='spline-route-arrived').length,0);
    // Phase 3.6 — opt-in exit occupancy with deterministic stall/resume.
    const {getSplineTrafficOccupancy,getSplineTrafficQueueLength,inspectSplineRoute}=require(path.join(out,'Core','SplineNetwork.js'));
    const {SplineJunctionLink:TrafficLink}=require(path.join(out,'Components','SplineJunction.js'));
    const {splineTrafficGate}=require(path.join(out,'Core','SplineTrafficGate.js'));
    splineTrafficGate.clear();
    exit.maxFollowers=1; // capacity applies only to followers that opted in
    assert.equal(exit.maxFollowers,1);
    const holder=makeFollower(JunctionMode.ShortestRoute);
    holder.enableTrafficCapacity=true;
    holder.followRouteTo(b,.85,false);
    holder.update(2.5);
    assert.equal(holder.currentSpline,b);
    assert.equal(getSplineTrafficOccupancy(junction,1),1);
    assert(holder.trafficReservation);
    const waiter=makeFollower(JunctionMode.ShortestRoute);
    waiter.enableTrafficCapacity=true;
    waiter.followRouteTo(b,.85,false);
    waiter.update(2.5);
    assert.equal(waiter.currentSpline,a);
    near(waiter.currentProgress,.5);
    assert(waiter.isWaitingForTraffic);
    assert(waiter.isPlaying);
    assert.equal(waiter.node.events.filter(e=>e.name==='spline-traffic-blocked').length,1);
    const diagnostics=waiter.inspectRouteTo(b,.85);
    assert.equal(diagnostics.status,'reachable',
      'Capacity saturation does not mark graph unreachable');
    assert.equal(diagnostics.saturatedExits,1);
    assert.equal(diagnostics.linkCount,2);
    assert.equal(diagnostics.waitingFollowers,1);
    const invalid=inspectSplineRoute(a,-.5,b,.85);
    assert.equal(invalid.status,'invalid');
    const disconnected=inspectSplineRoute(a,.1,b,.85,{junctions:[]});
    assert.equal(disconnected.status,'unreachable');
    waiter.update(.5);
    assert.equal(waiter.node.events.filter(e=>e.name==='spline-traffic-blocked').length,1,
      'Wait retry does not spam On Blocked');
    assert.equal(waiter.currentSpline,a);
    const later=makeFollower(JunctionMode.ShortestRoute);
    later.enableTrafficCapacity=true;later.followRouteTo(b,.85,false);
    later.update(2.5);
    assert.equal(waiter.trafficQueuePosition,1);
    assert.equal(later.trafficQueuePosition,2);
    assert.equal(getSplineTrafficQueueLength(junction,1),2);
    holder.onDisable();
    assert.equal(getSplineTrafficOccupancy(junction,1),0);
    later.update(.2); // Later update first must NOT cut ahead in FIFO.
    assert.equal(later.currentSpline,a);
    assert(later.isWaitingForTraffic);
    waiter.update(.2);
    assert.equal(waiter.currentSpline,b,'Waiter resumes after capacity is released');
    assert(!waiter.isWaitingForTraffic);
    assert.equal(getSplineTrafficOccupancy(junction,1),1);
    assert.equal(getSplineTrafficQueueLength(junction,1),1);
    const legacyTraffic=makeFollower(JunctionMode.FirstOther);
    legacyTraffic.update(2.5);
    assert.equal(legacyTraffic.currentSpline,b,
      'Legacy follower bypasses traffic gate without opt-in');
    assert.equal(getSplineTrafficOccupancy(junction,1),1);
    waiter.setCurrentSpline(a,0);
    later.update(.2);
    assert.equal(later.currentSpline,b,'Second waiter receives released slot');
    assert(!later.isWaitingForTraffic);
    later.onDisable();
    assert.equal(getSplineTrafficOccupancy(junction,1),0,
      'Manual teleport releases reserved traffic slot');
    const unrestricted=makeFollower(JunctionMode.ShortestRoute);
    unrestricted.enableTrafficCapacity=true;unrestricted.followRouteTo(b,.85,false);
    exit.maxFollowers=0;unrestricted.update(2.5);
    assert.equal(unrestricted.currentSpline,b);
    assert.equal(getSplineTrafficOccupancy(junction,1),0,
      'Unlimited exit requires no managed reservation');
    // When a waiting destination is removed, follower must not transfer.
    exit.maxFollowers=1;
    const holder2=makeFollower(JunctionMode.ShortestRoute);
    holder2.enableTrafficCapacity=true;holder2.followRouteTo(b,.85,false);
    holder2.update(2.5);
    const abandoned=makeFollower(JunctionMode.ShortestRoute);
    abandoned.enableTrafficCapacity=true;abandoned.followRouteTo(b,.85,false);
    abandoned.update(2.5);
    assert(abandoned.isWaitingForTraffic);
    exit.spline=null;
    abandoned.update(.2);
    assert(!abandoned.isWaitingForTraffic);
    assert.equal(abandoned.currentSpline,a);
    exit.spline=b;
    holder2.onDestroy();
    abandoned.onDestroy();unrestricted.onDestroy();waiter.onDestroy();
    assert.equal(getSplineTrafficOccupancy(junction,1),0);
    exit.maxFollowers=0;
    splineTrafficGate.clear();
    // Occupancy-aware alternative: two exits from the same Junction to B,
    // the closer exit is full but a farther one is still reachable.
    const alternative=new TrafficLink();
    alternative.spline=b;alternative.progress=0;alternative.maxFollowers=1;
    junction.connections=[entry,exit,alternative];exit.maxFollowers=1;
    const primary=makeFollower(JunctionMode.ShortestRoute);
    primary.enableTrafficCapacity=true;primary.followRouteTo(b,.85,false);
    primary.update(2.5);
    assert.equal(primary.currentSpline,b);
    near(primary.currentProgress,.225); // .1 + (.5 / duration 4)
    assert.equal(getSplineTrafficOccupancy(junction,1),1);
    const alternateFollower=makeFollower(JunctionMode.ShortestRoute);
    alternateFollower.enableTrafficCapacity=true;
    alternateFollower.rerouteAroundTraffic=true;
    alternateFollower.followRouteTo(b,.85,false);
    alternateFollower.update(2.5);
    assert.equal(alternateFollower.currentSpline,b);
    assert.equal(getSplineTrafficOccupancy(junction,2),1);
    assert.equal(alternateFollower.node.events.filter(e=>e.name==='spline-traffic-rerouted').length,1);
    assert.equal(alternateFollower.node.events.filter(e=>e.name==='spline-traffic-blocked').length,0);
    const congested=makeFollower(JunctionMode.ShortestRoute);
    congested.enableTrafficCapacity=true;congested.rerouteAroundTraffic=true;
    congested.followRouteTo(b,.85,false);congested.update(2.5);
    assert(congested.isWaitingForTraffic,'No alternate -> FIFO on shortest exit');
    assert.equal(congested.trafficQueuePosition,1);
    primary.onDisable();
    congested.update(.2);
    assert.equal(congested.currentSpline,b,
      'Recalculate at retry and admit oldest queued follower');
    assert(!congested.isWaitingForTraffic);
    alternateFollower.onDisable();congested.onDisable();primary.onDestroy();
    assert.equal(getSplineTrafficOccupancy(junction,1),0);
    assert.equal(getSplineTrafficOccupancy(junction,2),0);
    exit.maxFollowers=0;
    junction.connections=[entry,exit];
    splineTrafficGate.clear();
    // Phase 3.6b2 — opt-in world-arc headway works with gameplay traversal,
    // including paused obstacles, reverse direction, runtime toggling, cleanup.
    const {splineHeadwayRegistry}=require(path.join(out,'Core','SplineHeadway.js'));
    splineHeadwayRegistry.clear();
    const road={...source,node:new Node('headway-road'),closed:false,
      segmentCount:1,samplesPerCurve:32,
      evaluateWorldPosition:t=>new Vec3(t*10,0,0)};
    road.node.worldMatrix={m00:1,m05:1,m10:1,m12:0,m13:0,m14:0};
    const headFollower=(progress,direction=1)=>{
       const f=new SplineAnimate();f.node=new Node('headway-'+progress);
       f.target=new Node('headway-target-'+progress);
       f.spline=road;f.alignToSpline=false;f.duration=4;
       f.method=AnimateMethod.Time;f.loopMode=LoopMode.Once;
       f.startProgress=progress;f.playOnStart=true;
       f.enableHeadway=true;f.headwayWorldGap=2;f.headwayBrakeDistance=0;
       f.onEnable();
       if(direction===-1)f.setCurrentSpline(road,progress,-1);
       return f;
    };
    const leader=headFollower(.6);
    const following=headFollower(.2);
    assert.equal(splineHeadwayRegistry.size,2);
    following.update(3);
    near(following.currentProgress,.4);
    assert(following.isPlaying,'Following is not paused by headway limit');
    following.update(.1);
    assert(following.isHeadwayBlocked);
    assert.equal(following.node.events.filter(x=>x.name==='spline-headway-blocked').length,1);
    following.update(.1);
    assert.equal(following.node.events.filter(x=>x.name==='spline-headway-blocked').length,1,
      'Blocked event is not spammed every tick');
    leader.pause();
    following.update(.4);
    near(following.currentProgress,.4);
    leader.play();leader.update(.4); // .7, new clearance
    following.update(.4);
    near(following.currentProgress,.5);
    assert(!following.isHeadwayBlocked);
    assert.equal(following.node.events.filter(x=>x.name==='spline-headway-cleared').length,1);
    assert.equal(following.target.worldPosition.x,5);
    leader.onDisable();following.onDisable();
    assert.equal(splineHeadwayRegistry.size,0);
    // Direction-aware nearest leader in backward traversal.
    const frontBack=headFollower(.2,-1),rearBack=headFollower(.8,-1);
    rearBack.update(3.8);
    near(rearBack.currentProgress,.4);
    rearBack.onDestroy();frontBack.onDestroy();
    assert.equal(splineHeadwayRegistry.size,0);
    // Opt-in can change at runtime and must leave no ghost obstacles.
    const toggled=headFollower(.6);
    toggled.enableHeadway=false;toggled.update(.01);
    assert.equal(splineHeadwayRegistry.size,0);
    toggled.enableHeadway=true;toggled.update(.01);
    assert.equal(splineHeadwayRegistry.size,1);
    toggled.onDestroy();
    assert.equal(splineHeadwayRegistry.size,0);
    // Headway is runtime-only: Scene Editor preview cannot register.
    env.EDITOR_NOT_IN_PREVIEW=true;
    const preview=headFollower(.4);
    assert.equal(splineHeadwayRegistry.size,0);
    preview.onDisable();
    env.EDITOR_NOT_IN_PREVIEW=false;
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
