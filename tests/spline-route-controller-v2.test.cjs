'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-route-'));
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false','--outDir',dir],{stdio:'pipe'});
 class Component{constructor(){this.enabled=true;this.node={isValid:true,activeInHierarchy:true};}}
 class SplineContainer extends Component{constructor(){super();this.count=2;this.length=10;}distanceAtT(t){return t*t*10;}}
 class SplineAnimate extends Component{
  constructor(){super();this.currentSpline=new SplineContainer();this.junctionMode=0;this.routeDestination=null;this.routeDestinationProgress=0;this.stopOnRouteArrival=false;this.routeArrived=false;this.isPlaying=false;this.isWaitingForTraffic=false;this.commands=[];this.cancels=0;}
  inspectRouteTo(s,p){return s.unreachable?{status:'unreachable',route:null,message:'No route'}:{status:'reachable',route:{},message:'OK'};}
  followRouteTo(s,p,stop){this.junctionMode=4;this.routeDestination=s;this.routeDestinationProgress=p;this.stopOnRouteArrival=stop;this.routeArrived=false;this.commands.push([s,p]);}
  play(){this.isPlaying=true;}pause(){this.isPlaying=false;}
  cancelRouteNavigation(){this.pause();this.routeDestination=null;this.junctionMode=0;this.routeArrived=false;this.cancels++;}
  arrive(){this.currentSpline=this.routeDestination;this.routeArrived=true;this.pause();}
 }
 const orig=Module._load;let editor=false;
 Module._load=function(name,parent,isMain){
  if(name==='cc')return {_decorator:{ccclass:()=>x=>x,menu:()=>x=>x,property:()=>{}},Component,Enum:x=>x};
  if(name==='cc/env')return {get EDITOR_NOT_IN_PREVIEW(){return editor;}};
  if(name==='../Core/SplineContainer')return {SplineContainer};
  if(name==='./SplineAnimate')return {SplineAnimate,JunctionMode:{Off:0,ShortestRoute:4}};
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
  editor=true;r.waypoints=[w(a)];assert(!r.startRoute());r.onEnable();r.lateUpdate(1);assert.equal(f.routeDestination,null);
 }finally{Module._load=orig;}
 console.log('ROUTE CONTROLLER V2 PASS: waypoint modes, delayed start, dwell, pause, repeat, ownership, failure and lifecycle.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
