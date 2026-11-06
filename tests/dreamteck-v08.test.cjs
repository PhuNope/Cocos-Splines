'use strict';
/** Regression checks for the Dreamteck-inspired additions, with engine mocks. */
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-v08-'));
const near=(a,b,e=.025)=>assert(Math.abs(a-b)<=e,`${a} != ${b}`);
try{
  cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',out],{stdio:'pipe'});
  const {closestParameter}=require(path.join(out,'Core','SplineProjectionMath.js'));
  let projection=closestParameter(t=>({x:10*t,y:0,z:0}),{x:5,y:4,z:0});near(projection.t,.5,1e-4);near(projection.squaredDistance,16,.001);
  projection=closestParameter(t=>({x:10*t,y:10*t*t,z:0}),{x:9,y:8,z:0},256);
  assert(projection.t>.7&&projection.t<1,'curved closest point');
  projection=closestParameter(t=>({x:20*t,y:0,z:0}),{x:-2,y:1,z:0},32);near(projection.t,0,1e-7);
  projection=closestParameter(t=>({x:20*t,y:0,z:0}),{x:32,y:0,z:0},32);near(projection.t,1,1e-7);

  class Vec3{
    constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
    clone(){return new Vec3(this.x,this.y,this.z);}
    set(x=0,y=0,z=0){Object.assign(this,{x,y,z});return this;}
    static add(o,a,b){return o.set(a.x+b.x,a.y+b.y,a.z+b.z);}
    static transformQuat(o,a){return o.set(a.x,a.y,a.z);}
    static transformMat4(o,a,m){return o.set(a.x*m.m00+m.m12,a.y*m.m05+m.m13,a.z*m.m10+m.m14);}
  }
  class Quat{
    constructor(x=0,y=0,z=0,w=1){Object.assign(this,{x,y,z,w});}
    clone(){return new Quat(this.x,this.y,this.z,this.w);}
    static multiply(o){return o;}
    static fromEuler(o){return o;}
  }
  class Component{constructor(){this.enabled=true;}getComponent(type){return this.node.getComponent(type);}}
  class Node{
    constructor(uuid){this.uuid=uuid;this.name=uuid;this.isValid=true;this.parent=null;this.children=[];this.components=[];this.events=[];
      this.worldPosition=new Vec3();this.worldRotation=new Quat();this.position=new Vec3();
      this.worldMatrix={m00:1,m05:1,m10:1,m12:0,m13:0,m14:0};}
    emit(name,payload){this.events.push({name,payload});}
    getComponent(type){return this.components.find(x=>x instanceof type)||null;}
    setWorldPosition(p){this.worldPosition=p.clone();}
    setWorldRotation(q){this.worldRotation=q.clone();}
  }
  class EventHandler{static emitEvents(events,...args){for(const e of events||[])if(typeof e==='function')e(...args);}}
  const env={EDITOR_NOT_IN_PREVIEW:false};
  const noOp=()=>{},deco=(...args)=>args.length>1?undefined:noOp;
  const cc={_decorator:{ccclass:()=>cls=>cls,property:deco,menu:()=>cls=>cls,executeInEditMode:()=>cls=>cls},
    Enum:v=>v,Component,Node,Vec3,Quat,EventHandler,Color:class{}};
  const original=Module._load;
  Module._load=function(request,parent,isMain){if(request==='cc')return cc;if(request==='cc/env')return env;return original.call(this,request,parent,isMain);};
  try{
    const {SplineContainer}=require(path.join(out,'Core','SplineContainer.js'));
    const {SplinePositioner}=require(path.join(out,'Components','SplinePositioner.js'));
    const {SplineProjector}=require(path.join(out,'Components','SplineProjector.js'));
    const {SplineLengthMonitor}=require(path.join(out,'Components','SplineLengthMonitor.js'));
    const {SplinePositionMode}=require(path.join(out,'Core','SplinePosition.js'));
    // Exercise container world projector with non-uniform x scale; sample mock geometry.
    const curve=new SplineContainer();curve.node=new Node('spline');curve.node.worldMatrix.m00=3;curve.node.worldMatrix.m12=10;
    Object.defineProperty(curve,'count',{get:()=>2});Object.defineProperty(curve,'length',{get:()=>10});
    curve.distanceAtT=t=>10*t;curve.tAtDistance=d=>d/10;
    curve.evaluateWorldPositionAtT=t=>new Vec3(10+30*t,0,0);
    curve.evaluateWorldPosition=t=>new Vec3(10+30*t,0,0);
    curve.evaluateRotation=t=>new Quat();curve.getRevision=()=>String('r1');
    curve.evaluateWorldPositionAtDistance=d=>new Vec3(10+3*d,0,0);
    const result=curve.projectWorld(new Vec3(31,6,0),200);
    near(result.t,.7,1e-4);near(result.progress,.7,1e-4);near(result.distance,7,1e-4);
    near(result.squaredDistance,36,1e-4);

    const target=new Node('positioned');target.worldPosition=new Vec3(1,2,3);
    const positioner=new SplinePositioner();positioner.node=new Node('positioner');positioner.spline=curve;positioner.target=target;
    positioner.positionMode=SplinePositionMode.Distance;positioner.distance=4;
    positioner.alignToSpline=false;positioner.onEnable();near(target.worldPosition.x,22);
    positioner.positionMode=SplinePositionMode.SplineT;positioner.progress=.8;
    positioner.applyPosition();near(target.worldPosition.x,34);
    const source=new Node('follow-source');source.worldPosition=new Vec3(25,5,0);
    positioner.followTarget=source;positioner.followDistance=2;
    positioner.applyPosition();near(target.worldPosition.x,31);
    positioner.followTarget=null;
    env.EDITOR_NOT_IN_PREVIEW=true;target.worldPosition=new Vec3(44,12,0);
    positioner.previewInEditor=true;positioner.preview();near(target.worldPosition.x,34);
    positioner.previewInEditor=false;positioner.update();near(target.worldPosition.x,44);near(target.worldPosition.y,12);

    const {SplineAnimate}=require(path.join(out,'Components','SplineAnimate.js'));
    const offsetFollower=new SplineAnimate();offsetFollower.node=new Node('offsetFollower');offsetFollower.target=new Node('car');
    offsetFollower.spline=curve;offsetFollower.alignToSpline=false;
    offsetFollower.splineOffset=new Vec3(2,3,4);offsetFollower.worldOffset=new Vec3(1,0,0);
    offsetFollower.seek(.5);near(offsetFollower.target.worldPosition.x,28);near(offsetFollower.target.worldPosition.y,3);near(offsetFollower.target.worldPosition.z,4);

    const projector=new SplineProjector();projector.node=new Node('projector');projector.spline=curve;
    projector.sourceNode=new Node('subject');projector.sourceNode.worldPosition=new Vec3(31,6,0);
    projector.projectedNode=new Node('marker');projector.projectedNode.worldPosition=new Vec3(88,0,0);
    projector.snapToSpline=true;projector.alignToSpline=false;projector.enterExitRadius=3;
    projector.projectNow();near(projector.lastProjection.t,.7,1e-4);
    near(projector.projectedNode.worldPosition.x,88); // Editor preview default OFF: no scene mutation
    projector.previewInEditor=true;projector.projectNow();near(projector.projectedNode.worldPosition.x,31);
    projector.previewInEditor=false;projector.update();near(projector.projectedNode.worldPosition.x,88);
    env.EDITOR_NOT_IN_PREVIEW=false;
    const entered=[],exited=[],notified=[];
    projector.onEnter=[e=>entered.push(e)];projector.onExit=[e=>exited.push(e)];projector.onProject=[e=>notified.push(e)];
    const onEnterObject={hit:0},onExitObject={hit:0};
    function onProjectionBoundary(e){this.hit++;assert(e.projector===projector);}
    projector.AddOnEnterEvent(onProjectionBoundary,onEnterObject);
    projector.AddOnExitEvent(onProjectionBoundary,onExitObject);
    let runtimeProjectCount=0;const onRuntimeProject=()=>runtimeProjectCount++;
    projector.AddOnProjectEvent(onRuntimeProject);
    projector.notifyOnProject=true;projector.snapToSpline=false;
    projector.projectNow();assert.equal(entered.length,0);
    projector.sourceNode.worldPosition=new Vec3(31,1,0);projector.projectNow();assert.equal(entered.length,1);assert.equal(onEnterObject.hit,1);
    projector.sourceNode.worldPosition=new Vec3(31,9,0);projector.projectNow();assert.equal(exited.length,1);assert.equal(notified.length,3);
    assert.equal(onExitObject.hit,1);assert.equal(runtimeProjectCount,3);
    projector.RemoveOnProjectEvent(onRuntimeProject);
    projector.onDestroy();projector.projectNow();assert.equal(runtimeProjectCount,3);
    assert(projector.node.events.some(x=>x.name==='spline-project-exit'));

    const monitor=new SplineLengthMonitor();monitor.node=new Node('monitor');
    let length=6;monitor.spline={get length(){return length;}};
    const grew=[],shrunk=[],up=[],down=[];
    monitor.onGrowing=[e=>grew.push(e)];monitor.onShrinking=[e=>shrunk.push(e)];
    monitor.onCrossAbove=[e=>up.push(e)];monitor.onCrossBelow=[e=>down.push(e)];monitor.threshold=10;
    monitor.onEnable();length=13;near(monitor.checkNow(),7);assert.equal(up.length,1);assert.equal(grew.length,1);
    length=9;near(monitor.checkNow(),-4);assert.equal(down.length,1);assert.equal(shrunk.length,1);
    env.EDITOR_NOT_IN_PREVIEW=true;length=15;monitor.checkNow();assert.equal(grew.length,1,'Editor must not emit gameplay length events');
    const manifest=require(path.join(root,'package.json'));
    for(const [key,panelName,fields] of [
      ['Splines.SplinePositioner','Positioner',['positionMode','progress','distance','followTarget','previewInEditor']],
      ['Splines.SplineProjector','Projector',['sourceNode','projectedNode','enterExitRadius','onEnter','onExit']],
      ['Splines.SplineLengthMonitor','LengthMonitor',['threshold','tolerance','onGrowing','onCrossAbove']],
    ]){
      assert(manifest.contributions.inspector.section.node[key],key+' inspector');
      const panel=require(path.join(root,'dist/contributions/inspector',panelName+'.js'));
      for(const field of fields)assert(panel.template.includes('spl-field-'+field),panelName+' UI missing '+field);
    }
    assert(manifest.contributions.messages['create-positioner']);
    assert(manifest.contributions.messages['create-projector']);
    assert(manifest.contributions.messages['create-length-monitor']);
    console.log('DREAMTECK V0.8 PASS: world projection/scaled spline; positioner modes, follow & preview restore; projector events, editor safety; length threshold crossing.');
  }finally{Module._load=original;}
}finally{fs.rmSync(out,{recursive:true,force:true});}
