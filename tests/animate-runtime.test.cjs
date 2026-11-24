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
    static transformQuat(out,a,q){
      const tx=2*(q.y*a.z-q.z*a.y),ty=2*(q.z*a.x-q.x*a.z),tz=2*(q.x*a.y-q.y*a.x);
      out.x=a.x+q.w*tx+(q.y*tz-q.z*ty);
      out.y=a.y+q.w*ty+(q.z*tx-q.x*tz);
      out.z=a.z+q.w*tz+(q.x*ty-q.y*tx);
      return out;
    }
  }
  class Quat {
    constructor(x=0,y=0,z=0,w=1){this.x=x;this.y=y;this.z=z;this.w=w;}
    clone(){return new Quat(this.x,this.y,this.z,this.w);}
    static multiply(out,a,b){out.x=b.x;out.y=b.y;out.z=b.z;out.w=b.w;return out;}
  }
  const noOp=()=>{};
  const deco=(...args)=>args.length>1?undefined:noOp;
  class Component {constructor(){this.enabled=true;}getComponent(type){return this.node.getComponent(type);}}
  class Collider extends Component {constructor(){super();this.worldBounds={center:new Vec3(),halfExtents:new Vec3(.5,.5,.5)};}}
  class BoxCollider extends Collider {constructor(){super();this.center=new Vec3();this.size=new Vec3(1,1,1);}}
  class CapsuleCollider extends Collider {constructor(){super();this.center=new Vec3();this.radius=.5;this.cylinderHeight=1;this.direction=1;}}
  class MeshCollider extends Collider {constructor(){super();this.mesh=null;this.center=new Vec3();this.convex=false;}}
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
    Component,Collider,BoxCollider,CapsuleCollider,MeshCollider,Node,Vec3,Quat,EventHandler,Enum:x=>x,
    gfx:{AttributeName:{ATTR_POSITION:'a_position'},Format:{RGB32F:1},PrimitiveMode:{TRIANGLE_LIST:4}}};
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
    // Phase 3.6b2b — manual red/green and priority tiers at a shared exit.
    const {JunctionTrafficSignal}=require(path.join(out,'Components','SplineJunction.js'));
    exit.maxFollowers=1;
    assert.equal(exit.trafficSignal,JunctionTrafficSignal.Green,
      'Existing links default to Green');
    assert(junction.setTrafficSignal(1,JunctionTrafficSignal.Red));
    assert.equal(junction.getTrafficSignal(1),JunctionTrafficSignal.Red);
    assert(!junction.setTrafficSignal(1,JunctionTrafficSignal.Red),
      'No duplicate signal change event');
    assert(!junction.setTrafficSignal(300,JunctionTrafficSignal.Green));
    assert.equal(junction.node.events.filter(x=>x.name==='spline-traffic-signal-changed').length,1);
    const low=makeFollower(JunctionMode.ShortestRoute);
    low.enableTrafficCapacity=true;low.trafficPriority=0;
    low.followRouteTo(b,.85,false);low.update(2.5);
    assert(low.isWaitingForTraffic);near(low.currentProgress,.5);
    assert.equal(low.node.events.at(-1).payload.trafficSignal,JunctionTrafficSignal.Red);
    const high=makeFollower(JunctionMode.ShortestRoute);
    high.enableTrafficCapacity=true;high.trafficPriority=9;
    high.followRouteTo(b,.85,false);high.update(2.5);
    assert(high.isWaitingForTraffic);
    assert.equal(high.trafficQueuePosition,1);
    assert.equal(low.trafficQueuePosition,2);
    assert.equal(getSplineTrafficQueueLength(junction,1),2);
    assert.equal(low.inspectRouteTo(b,.85).redExits,1);
    assert(junction.setTrafficSignal(1,JunctionTrafficSignal.Green));
    low.update(.2);
    assert(low.isWaitingForTraffic,'Low-priority cannot jump queue after Green');
    high.update(.2);
    assert.equal(high.currentSpline,b,'High priority crosses first');
    assert.equal(getSplineTrafficOccupancy(junction,1),1);
    assert.equal(low.trafficQueuePosition,1);
    high.onDisable();low.update(.2);
    assert.equal(low.currentSpline,b,'FIFO follower crosses after priority release');
    low.onDisable();
    assert.equal(getSplineTrafficOccupancy(junction,1),0);
    assert.equal(getSplineTrafficQueueLength(junction,1),0);
    // Red also reroutes around an unlimited exit; traffic on alternate
    // still goes through atomic admission, never mutates the graph.
    exit.maxFollowers=0;
    const greenAlternative=new TrafficLink();
    greenAlternative.spline=b;greenAlternative.progress=0;
    greenAlternative.maxFollowers=0;
    junction.connections=[entry,exit,greenAlternative];
    junction.setTrafficSignal(1,JunctionTrafficSignal.Red);
    const signalReroute=makeFollower(JunctionMode.ShortestRoute);
    signalReroute.enableTrafficCapacity=true;
    signalReroute.rerouteAroundTraffic=true;
    signalReroute.followRouteTo(b,.85,false);
    signalReroute.update(2.5);
    assert.equal(signalReroute.currentSpline,b,
      'Red primary exit reroutes over Green alternate');
    assert.equal(signalReroute.node.events.filter(x=>x.name==='spline-traffic-rerouted').length,1);
    const optOut=makeFollower(JunctionMode.FirstOther);
    optOut.update(2.5);
    assert.equal(optOut.currentSpline,b,
      'Legacy non-opt-in follower is unaffected by manual signal');
    signalReroute.onDestroy();optOut.onDestroy();
    junction.connections=[entry,exit];
    junction.setTrafficSignal(1,JunctionTrafficSignal.Green);
    exit.maxFollowers=0;
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
    // Logical lanes on the same spline: unlike physical lane geometry,
    // this partitions only headway bookkeeping.
    const l1=headFollower(.6),l2=headFollower(.2);
    l1.headwayLaneId=3;l2.headwayLaneId=4;
    l1.update(.001);l2.update(2.4);
    assert(l2.currentProgress>.6,'Different lane IDs must not block each other');
    assert.equal(splineHeadwayRegistry.get(l1).laneId,3);
    const l3=headFollower(.2);l3.headwayLaneId=3;l3.update(2.4);
    assert(l3.currentProgress<.6,'Same lane ID must still obey headway gap');
    l1.onDisable();l2.onDisable();l3.onDisable();
    assert.equal(splineHeadwayRegistry.size,0);
    // Phase 3.6b2b2b2b1: actual lane CENTER positions, in spline-frame Right
    // (not world +X), with default opt-out preserving old centerline placement.
    const {splineProximityRegistry}=require(path.join(out,'Core','SplineProximity.js'));
    splineProximityRegistry.clear();
    const physicalRoad={...road,node:new Node('physical-lane-road'),
      evaluateRotation:()=>new Quat(0,Math.SQRT1_2,0,Math.SQRT1_2)};
    physicalRoad.node.worldMatrix=road.node.worldMatrix;
    const left=headFollower(.5),right=headFollower(.5);
    left.enableHeadway=false;right.enableHeadway=false;
    left.enableLanePlacement=right.enableLanePlacement=true;
    left.laneCount=right.laneCount=2;
    left.laneWidth=right.laneWidth=3.5;
    left.headwayLaneId=0;right.headwayLaneId=1;
    left.setCurrentSpline(physicalRoad,.5);
    right.setCurrentSpline(physicalRoad,.5);
    near(left.target.worldPosition.x,5);
    near(right.target.worldPosition.x,5);
    near(Math.abs(right.target.worldPosition.z-left.target.worldPosition.z),3.5);
    assert(left.laneLayoutValid);
    right.headwayLaneId=31;
    assert.equal(right.laneLayoutValid,false,
      'Out-of-range lane settings cannot silently shift follower geometry');
    right.onDisable();left.onDisable();
    // Swept sphere over actual world path clamps before a registered obstacle.
    const collisionLeader=headFollower(.55);
    collisionLeader.enableHeadway=false;
    collisionLeader.enableProximityAvoidance=true;
    collisionLeader.proximityRadius=.5;
    collisionLeader.setCurrentSpline(road,.55);
    const collisionMover=headFollower(.2);
    collisionMover.enableHeadway=false;
    collisionMover.enableProximityAvoidance=true;
    collisionMover.proximityRadius=.5;
    collisionMover.proximitySafetyGap=0;
    collisionMover.setCurrentSpline(road,.2);
    assert.equal(splineProximityRegistry.size,2);
    collisionMover.update(3);
    near(collisionMover.currentProgress,.45,.001);
    collisionMover.update(.1);
    assert(collisionMover.isProximityBlocked);
    assert.equal(collisionMover.node.events.filter(e=>e.name==='spline-proximity-blocked').length,1);
    collisionMover.update(.1);
    assert.equal(collisionMover.node.events.filter(e=>e.name==='spline-proximity-blocked').length,1);
    collisionLeader.pause();collisionMover.update(.2);
    near(collisionMover.currentProgress,.45,.001);
    collisionLeader.onDisable();collisionMover.update(.2);
    assert(collisionMover.currentProgress>.45);
    assert(!collisionMover.isProximityBlocked);
    assert.equal(collisionMover.node.events.filter(e=>e.name==='spline-proximity-cleared').length,1);
    collisionMover.onDestroy();assert.equal(splineProximityRegistry.size,0);
    // Dynamic prediction from WORLD frame displacement. Pausing, seeking,
    // and manual spline changes must not retain stale obstacle velocity.
    const predictiveLeader=headFollower(.75,-1);
    predictiveLeader.enableHeadway=false;
    predictiveLeader.enableProximityAvoidance=true;
    predictiveLeader.proximityPredictAgents=true;
    predictiveLeader.proximityRadius=.5;
    predictiveLeader.setCurrentSpline(road,.75,-1);
    predictiveLeader.update(.4);
    near(predictiveLeader.currentProgress,.65);
    near(splineProximityRegistry.get(predictiveLeader).velocity.x,-2.5);
    const predictiveMover=headFollower(.2);
    predictiveMover.enableHeadway=false;
    predictiveMover.enableProximityAvoidance=true;
    predictiveMover.proximityPredictAgents=true;
    predictiveMover.proximityPredictionHorizon=.25;
    predictiveMover.proximitySafetyGap=0;
    predictiveMover.setCurrentSpline(road,.2);
    predictiveMover.update(1.2);
    assert(predictiveMover.currentProgress<.5&&predictiveMover.currentProgress>.48,
      'Prediction should brake earlier for an oncoming follower');
    assert(splineProximityRegistry.getTelemetry().lastPredictedCandidates>=1);
    predictiveLeader.pause();
    assert.equal(splineProximityRegistry.get(predictiveLeader).velocity,undefined,
      'Pause must immediately drop stale prediction');
    predictiveLeader.play();predictiveLeader.update(.2);
    assert(splineProximityRegistry.get(predictiveLeader).velocity);
    predictiveLeader.seek(.3);
    assert.equal(splineProximityRegistry.get(predictiveLeader).velocity,undefined,
      'Seek/teleport must reset stale velocity');
    predictiveLeader.setCurrentSpline(road,.3,-1);
    assert.equal(splineProximityRegistry.get(predictiveLeader).velocity,undefined);
    predictiveLeader.onDisable();predictiveMover.onDestroy();
    assert.equal(splineProximityRegistry.size,0);
    // Collider.worldBounds radius is conservative and off-center aware.
    const boundsFollower=headFollower(.3);
    boundsFollower.enableHeadway=false;boundsFollower.enableProximityAvoidance=true;
    boundsFollower.proximityUseColliderBounds=true;boundsFollower.proximityRadius=.25;
    const bodyCollider=new Collider();bodyCollider.node=boundsFollower.target;
    bodyCollider.worldBounds={center:new Vec3(3.5,0,0),halfExtents:new Vec3(1,.5,.25)};
    boundsFollower.proximityCollider=bodyCollider;
    assert(boundsFollower.proximityBoundsValid);
    const expectedBodyRadius=Math.hypot(1,.5,.25)+.5;
    near(boundsFollower.proximityEffectiveRadius,expectedBodyRadius);
    boundsFollower.pause();boundsFollower.update(.001);
    near(splineProximityRegistry.get(boundsFollower).radius,expectedBodyRadius);
    assert.equal(splineProximityRegistry.get(boundsFollower).bounds.min.x,2.5,
      'Valid Cocos 3D Collider bounds register as a real AABB obstacle');
    bodyCollider.worldBounds={center:new Vec3(Infinity,0,0),
      halfExtents:new Vec3(1,.5,.25)};
    assert.equal(boundsFollower.proximityBoundsValid,false);
    near(boundsFollower.proximityEffectiveRadius,.25);
    boundsFollower.update(.001);
    near(splineProximityRegistry.get(boundsFollower).radius,.25);
    assert.equal(splineProximityRegistry.get(boundsFollower).bounds,undefined,
      'Invalid Collider automatically restores legacy spherical narrowphase');
    // BoxCollider preview defaults off and uses AABB until opted in.
     const rotatedBox=new BoxCollider();rotatedBox.node=boundsFollower.target;
     const kObb=Math.SQRT1_2;
     rotatedBox.size=new Vec3(4,.4,.4);
     rotatedBox.node.worldMatrix={m00:kObb,m01:0,m02:kObb,m04:0,m05:1,m06:0,
       m08:-kObb,m09:0,m10:kObb,m12:3,m13:0,m14:0};
     rotatedBox.worldBounds={center:new Vec3(3,0,0),
       halfExtents:new Vec3(2.2*kObb,.2,2.2*kObb)};
     boundsFollower.proximityCollider=rotatedBox;
     assert.equal(boundsFollower.proximityUseBoxObb,false);
     boundsFollower.update(.001);
     assert(splineProximityRegistry.get(boundsFollower).bounds);
     boundsFollower.proximityUseBoxObb=true;boundsFollower.update(.001);
     assert(splineProximityRegistry.get(boundsFollower).obb);
     assert(boundsFollower.proximityEffectiveRadius>=2);
     rotatedBox.node.worldMatrix.m04=.4;
     boundsFollower.update(.001);
     assert(!splineProximityRegistry.get(boundsFollower).obb);
     assert(splineProximityRegistry.get(boundsFollower).bounds);
     rotatedBox.node.worldMatrix.m04=0;
     boundsFollower.update(.001);
     assert(splineProximityRegistry.get(boundsFollower).obb);
     boundsFollower.proximityUseBoxObb=false;boundsFollower.update(.001);
     assert(!splineProximityRegistry.get(boundsFollower).obb);
     assert(splineProximityRegistry.get(boundsFollower).bounds);
     // CapsuleCollider opt-in and safe AABB fallback.
     const cap=new CapsuleCollider();cap.node=boundsFollower.target;
     cap.cylinderHeight=2;cap.radius=.5;cap.direction=0;
     cap.node.worldMatrix={m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,
       m08:0,m09:0,m10:1,m12:3,m13:0,m14:0};
     cap.worldBounds={center:new Vec3(3,0,0),halfExtents:new Vec3(1.5,.5,.5)};
     boundsFollower.proximityCollider=cap;
     assert.equal(boundsFollower.proximityUseCapsule,false);
     boundsFollower.update(.001);
     assert(splineProximityRegistry.get(boundsFollower).bounds);
     boundsFollower.proximityUseCapsule=true;boundsFollower.update(.001);
     assert(splineProximityRegistry.get(boundsFollower).capsule);
     near(splineProximityRegistry.get(boundsFollower).capsule.a.x,2);
     near(splineProximityRegistry.get(boundsFollower).capsule.b.x,4);
     cap.node.worldMatrix.m10=2;boundsFollower.update(.001);
     assert(!splineProximityRegistry.get(boundsFollower).capsule);
     assert(splineProximityRegistry.get(boundsFollower).bounds);
     cap.node.worldMatrix.m10=1;boundsFollower.update(.001);
     assert(splineProximityRegistry.get(boundsFollower).capsule);
     boundsFollower.proximityUseCapsule=false;boundsFollower.update(.001);
     assert(!splineProximityRegistry.get(boundsFollower).capsule);
     assert(splineProximityRegistry.get(boundsFollower).bounds);
     // Native MeshCollider: double-sided triangle BVH, cached until transform or hash changes.
     const meshCollider=new MeshCollider();meshCollider.node=boundsFollower.target;
     meshCollider.node.worldMatrix={m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,
       m08:0,m09:0,m10:1,m12:3,m13:0,m14:0};
     meshCollider.worldBounds={center:new Vec3(4,0,0),halfExtents:new Vec3(0,1,1)};
     let meshReads=0;
     meshCollider.mesh={allowDataAccess:true,hash:4,
       struct:{primitives:[{primitiveMode:4}]},
       readAttribute:()=>{meshReads++;return new Float32Array([1,-1,-1,1,1,-1,1,0,1]);},
       readAttributeFormat:()=>({name:'RGB32F'}),readIndices:()=>new Uint16Array([0,1,2])};
     boundsFollower.proximityCollider=meshCollider;
     assert.equal(boundsFollower.proximityUseMeshCollider,false);
     boundsFollower.update(.001);
     assert(splineProximityRegistry.get(boundsFollower).bounds);
     boundsFollower.proximityUseMeshCollider=true;
     boundsFollower.update(.001);
     const firstMesh=splineProximityRegistry.get(boundsFollower).mesh;
     assert(firstMesh&&firstMesh.triangleCount===1);
     assert.equal(meshReads,1);
     boundsFollower.update(.001);
     assert.strictEqual(splineProximityRegistry.get(boundsFollower).mesh,firstMesh);
     assert.equal(meshReads,1,'Stationary mesh must reuse cached BVH');
     meshCollider.node.worldMatrix.m12=4;
     meshCollider.worldBounds={center:new Vec3(5,0,0),halfExtents:new Vec3(0,1,1)};
     boundsFollower.update(.001);
     assert.notStrictEqual(splineProximityRegistry.get(boundsFollower).mesh,firstMesh);
     assert.equal(meshReads,2,'Transform change must rebuild world BVH');
     meshCollider.mesh.hash=5;
     boundsFollower.update(.001);
     assert.equal(meshReads,3,'Mesh data revision hash invalidates cache');
     meshCollider.convex=true;boundsFollower.update(.001);
     assert(!splineProximityRegistry.get(boundsFollower).mesh);
     assert(splineProximityRegistry.get(boundsFollower).bounds);
     meshCollider.convex=false;meshCollider.mesh.allowDataAccess=false;
     boundsFollower.update(.001);
     assert(!splineProximityRegistry.get(boundsFollower).mesh);
     assert(splineProximityRegistry.get(boundsFollower).bounds);
     meshCollider.mesh.allowDataAccess=true;
     meshCollider.worldBounds={center:new Vec3(50,0,0),halfExtents:new Vec3(0,1,1)};
     boundsFollower.update(.001);
     assert(!splineProximityRegistry.get(boundsFollower).mesh);
     assert(splineProximityRegistry.get(boundsFollower).bounds);
     boundsFollower.proximityUseMeshCollider=false;
     boundsFollower.proximityUseColliderBounds=false;boundsFollower.onDisable();
     assert.equal(splineProximityRegistry.get(boundsFollower),null);
     assert.equal(splineProximityRegistry.get(boundsFollower),null);
    // Cross-spline follower at the same 3D intersection is a real blocker;
    // elevated bridge (Y=3) is not, even with identical XZ projection.
    const junctionBlocker=headFollower(.5);
    junctionBlocker.enableHeadway=false;junctionBlocker.enableProximityAvoidance=true;
    junctionBlocker.setCurrentSpline(road,.5);
    const crossingRoad={...road,node:new Node('crossing-road'),
      evaluateWorldPosition:p=>new Vec3(5,0,(p-.5)*10)};
    crossingRoad.node.worldMatrix=road.node.worldMatrix;
    const crossing=headFollower(.1);
    crossing.enableHeadway=false;crossing.enableProximityAvoidance=true;
    crossing.spline=crossingRoad;crossing.setCurrentSpline(crossingRoad,.1);
    crossing.update(3);
    assert(crossing.currentProgress<.5,
      'Proximity sweep prevents crossing a blocked intersection in one large dt');
    crossing.onDisable();
    const bridgeRoad={...crossingRoad,node:new Node('bridge-proximity'),
      evaluateWorldPosition:p=>new Vec3(5,3,(p-.5)*10)};
    bridgeRoad.node.worldMatrix=road.node.worldMatrix;
    const bridge=headFollower(.1);
    bridge.enableHeadway=false;bridge.enableProximityAvoidance=true;
    bridge.spline=bridgeRoad;bridge.setCurrentSpline(bridgeRoad,.1);
    bridge.update(3);
    assert(bridge.currentProgress>.5,'Elevated path clears 3D obstacle');
    bridge.onDisable();junctionBlocker.onDisable();
    assert.equal(splineProximityRegistry.size,0);
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
