'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-route-'));
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false','--outDir',dir],{stdio:'pipe'});
 class Component{constructor(){this.enabled=true;this.node={isValid:true,activeInHierarchy:true};}}
 class SplineContainer extends Component{constructor(){super();this.count=2;this.length=10;}distanceAtT(t){return t*t*10;}}
 class SplineAnimate extends Component{
  constructor(){super();this.currentSpline=new SplineContainer();this.currentProgress=0;this.travelDirection=1;this.routeCostSpace=0;this.inspections=[];this.junctionMode=0;this.routeDestination=null;this.routeDestinationProgress=0;this.stopOnRouteArrival=false;this.routeArrived=false;this.isPlaying=false;this.isWaitingForTraffic=false;this.commands=[];this.cancels=0;}
  inspectRouteTo(s,p){return this.inspectRouteFrom(this.currentSpline,this.currentProgress,this.travelDirection,s,p);}
  inspectRouteFrom(from,p,dir,s,goal){this.inspections.push([from,p,dir,s,goal]);return s.unreachable||s.requiredDirection&&dir!==s.requiredDirection?{status:'unreachable',route:null,message:'No route'}:{status:'reachable',route:{steps:s.empty?[]:[{kind:'travel',direction:s.arrivalDirection||dir,distance:5}],distance:s.empty?0:5,cost:s.empty?0:5.2,switchCount:s.empty?0:1},message:'OK'};}
  suspendRouteNavigation(){this.pause();this.isWaitingForTraffic=false;}
  followRouteTo(s,p,stop){this.junctionMode=4;this.routeDestination=s;this.routeDestinationProgress=p;this.stopOnRouteArrival=stop;this.routeArrived=false;this.commands.push([s,p]);}
  play(){this.isPlaying=true;}pause(){this.isPlaying=false;}
  cancelRouteNavigation(){this.pause();this.routeDestination=null;this.junctionMode=0;this.routeArrived=false;this.cancels++;}
  arrive(){this.currentSpline=this.routeDestination;this.currentProgress=this.routeDestinationProgress;this.travelDirection=this.currentSpline.arrivalDirection||this.travelDirection;this.routeArrived=true;this.pause();}
 }
 const orig=Module._load;let editor=false;
 Module._load=function(name,parent,isMain){
  if(name==='cc')return {_decorator:{ccclass:()=>x=>x,menu:()=>x=>x,property:()=>{}},Component,Enum:x=>x};
  if(name==='cc/env')return {get EDITOR_NOT_IN_PREVIEW(){return editor;}};
  if(name==='../Core/SplineContainer')return {SplineContainer};
  if(name==='./SplineAnimate')return {SplineAnimate,JunctionMode:{Off:0,ShortestRoute:4},RouteCostSpace:{Local:0,World:1}};
  return orig.call(this,name,parent,isMain);
 };
 try{
  const {SplineRouteController}=require(dir+'/Components/SplineRouteController.js');
  const f=new SplineAnimate(),a=new SplineContainer(),b=new SplineContainer();
  const w=(s,p=1,dwell=0,mode=0,distance=0)=>({spline:s,progress:p,dwellSeconds:dwell,positionMode:mode,distance});
  const r=new SplineRouteController();r.follower=f;r.waypoints=[w(a,.5,2),w(b,.5,0,2),w(a,0,0,1,3)];
  assert.equal(r.inspectWaypoint(0).status,'reachable');assert.equal(f.commands.length,0);
  r.onEnable();assert.equal(f.commands.length,0);r.lateUpdate(0);assert.equal(r.state,'traveling');assert.deepEqual(f.commands,[[a,.5]]);
  const competitor=new SplineRouteController();competitor.follower=f;competitor.waypoints=[w(b)];assert(!competitor.startRoute());assert.equal(f.cancels,0);
  f.isWaitingForTraffic=true;r.lateUpdate(1);assert(r.isWaitingForTraffic);f.isWaitingForTraffic=false;
  f.arrive();r.lateUpdate(100);assert.equal(r.state,'dwelling');assert.equal(r.dwellRemaining,2);assert.equal(r.completedWaypoints,1);
  r.lateUpdate(1);assert(r.pauseRoute());r.lateUpdate(20);assert.equal(r.dwellRemaining,1);assert(r.resumeRoute());r.lateUpdate(1);
  assert.deepEqual(f.commands[1],[b,.25]);assert.equal(r.waypointIndex,1);
  assert(r.pauseRoute());assert(!f.isPlaying);assert(r.resumeRoute());assert(f.isPlaying);
  f.arrive();r.lateUpdate(0);r.lateUpdate(0);assert.deepEqual(f.commands[2],[a,.3]);f.arrive();r.lateUpdate(0);r.lateUpdate(0);assert.equal(r.state,'completed');assert.equal(r.completedWaypoints,3);assert.equal(f.cancels,1);
  assert(competitor.startRoute());competitor.stopRoute();assert.equal(f.cancels,2);
  r.repeat=true;r.waypoints=[w(a),w(b)];assert(r.startRoute());r.waypoints[1].spline=null;f.arrive();r.lateUpdate(0);r.lateUpdate(0);assert.equal(f.routeDestination,b);f.arrive();r.lateUpdate(0);r.lateUpdate(0);assert.equal(f.routeDestination,a);assert.equal(r.completedWaypoints,2);
  f.followRouteTo(b,.4,true);r.lateUpdate(0);assert.equal(r.state,'failed');assert.equal(f.routeDestination,b);assert.equal(f.routeDestinationProgress,.4);assert(f.isPlaying);
  r.waypoints=[w(a),w(b)];assert(r.startRoute());b.unreachable=true;f.arrive();r.lateUpdate(0);r.lateUpdate(0);assert.equal(r.state,'failed');assert.match(r.lastError,/No route/);assert.equal(f.routeDestination,null);b.unreachable=false;
  assert(r.startRoute());f.pause();r.lateUpdate(0);assert.equal(r.state,'failed');assert.match(r.lastError,/stopped/);
  assert(r.startRoute());r.onDisable();assert.equal(r.state,'idle');assert.equal(f.routeDestination,null);
  r.waypoints=[w(a,0,0,1,11)];assert(!r.startRoute());assert.match(r.lastError,/Invalid route waypoint/);
  // Preview chains direction across legs, including empty routes and repeat return.
  const pf=new SplineAnimate(),pr=new SplineRouteController();pr.follower=pf;pr.repeat=true;pf.routeCostSpace=1;
  const c=new SplineContainer(),empty=new SplineContainer();c.arrivalDirection=-1;empty.empty=true;b.requiredDirection=-1;
  pr.waypoints=[w(c,.5,2),w(empty,.5,3),w(b,.7,4)];
  const report=pr.previewItinerary();assert.equal(report.status,'reachable');assert.equal(report.costSpace,'world');assert.equal(report.distance,15);assert.equal(report.switchCount,3);assert.equal(report.dwellSeconds,9);assert.equal(report.legs.length,4);
  assert.deepEqual(report.legs.map(l=>[l.startDirection,l.arrivalDirection]),[[1,-1],[-1,-1],[-1,-1],[-1,-1]]);assert(report.legs[3].repeatReturn);assert.equal(pf.commands.length,0);assert.equal(pf.currentProgress,0);
  b.requiredDirection=1;const bad=pr.previewItinerary();assert.equal(bad.status,'unreachable');assert.equal(bad.legs[3].status,'unchecked');assert.equal(bad.distance,5);
  pr.requireReachableItinerary=true;assert(!pr.startRoute());assert.equal(pf.commands.length,0);pr.requireReachableItinerary=false;b.requiredDirection=undefined;
  pr.repeat=false;pr.waypoints=[w(c),w(b)];pr.maxRouteRetries=2;pr.retryDelay=.5;c.unreachable=true;
  assert(pr.startRoute());assert.equal(pr.state,'retrying');assert(!pf.isPlaying);assert.equal(pr.routeRetryCount,0);
  pr.lateUpdate(.25);assert.equal(pr.routeRetryRemaining,.25);assert(pr.pauseRoute());pr.lateUpdate(10);assert.equal(pr.routeRetryRemaining,.25);assert(pr.resumeRoute());
  pr.lateUpdate(.25);assert.equal(pr.routeRetryCount,1);assert.equal(pr.state,'retrying');c.unreachable=false;pr.lateUpdate(.5);assert.equal(pr.routeRetryCount,2);assert.equal(pr.state,'traveling');
  pf.isWaitingForTraffic=true;const commands=pf.commands.length;assert(!pr.replanCurrentWaypoint());pr.lateUpdate(100);assert.equal(pf.commands.length,commands);pf.isWaitingForTraffic=false;assert(pr.replanCurrentWaypoint());
  pf.arrive();pr.lateUpdate(0);b.unreachable=true;pr.lateUpdate(0);assert.equal(pr.state,'retrying');assert.equal(pr.routeRetryCount,0);pr.lateUpdate(100);assert.equal(pr.routeRetryCount,1);pr.lateUpdate(100);assert.equal(pr.state,'failed');assert.match(pr.lastError,/No route/);assert.equal(pf.routeDestination,null);
  b.unreachable=false;assert(pr.startRoute());pf.pause();pr.lateUpdate(0);assert.equal(pr.state,'retrying');pr.lateUpdate(.5);assert.equal(pr.state,'traveling');assert(pf.isPlaying);pr.stopRoute();
  editor=true;r.waypoints=[w(a)];assert(!r.startRoute());r.onEnable();r.lateUpdate(1);assert.equal(f.routeDestination,null);
 }finally{Module._load=orig;}
 console.log('ROUTE CONTROLLER V2 PASS: waypoint modes, delayed start, dwell, pause, repeat, ownership, failure and lifecycle.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
