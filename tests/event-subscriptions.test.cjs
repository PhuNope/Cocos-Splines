'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=path.join(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-event-test-'));
try{
  cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',out],{stdio:'pipe'});
  const {SplineEventCallbacks}=require(path.join(out,'Core','SplineEventCallbacks.js'));
  const callbacks=new SplineEventCallbacks();const a={count:0},b={count:0};
  function handle(v){this.count+=v;}
  callbacks.add(handle,a);callbacks.add(handle,a);callbacks.add(handle,b);
  assert.equal(callbacks.count,2,'No duplicate (callback,target)');
  callbacks.emit(2);assert.equal(a.count,2);assert.equal(b.count,2);
  callbacks.remove(handle,a);callbacks.emit(3);assert.equal(a.count,2);assert.equal(b.count,5);
  callbacks.clear(b);assert.equal(callbacks.count,0);
  let order=[];
  const removeDuring=()=>{order.push('a');callbacks.remove(later);callbacks.add(newly);};
  const later=()=>order.push('b'),newly=()=>order.push('c');
  callbacks.add(removeDuring);callbacks.add(later);callbacks.emit({});assert.deepEqual(order,['a']);
  callbacks.clear();callbacks.add(()=>{throw Error('test error');});callbacks.add(()=>order.push('survived'));
  const origError=console.error;console.error=()=>{};
  try{callbacks.emit({});}finally{console.error=origError;}
  assert(order.includes('survived'));
  callbacks.clear();const destroyed={isValid:false};callbacks.add(handle,destroyed);callbacks.emit(2);assert.equal(callbacks.count,0);
  class Node{constructor(name='node'){this.name=name;this.uuid=name;this.isValid=true;this.parent=null;this.events=[];} emit(name,payload){this.events.push({name,payload});}getComponent(){return null;}}
  class Component{constructor(){this.enabled=true;this.node=new Node();}getComponent(){return null;}}
  class EventHandler{static emitEvents(events,payload){for(const cb of events||[])if(typeof cb==='function')cb(payload);}}
  const deco=(...args)=>args.length>1?undefined:()=>{};
  const cc={_decorator:{ccclass:()=>cls=>cls,property:deco,menu:()=>cls=>cls,executeInEditMode:()=>cls=>cls},Component,EventHandler,Node,Vec3:class{},Quat:class{},Color:class{},Enum:x=>x};
  const oldLoad=Module._load;Module._load=function(name,parent,isMain){if(name==='cc')return cc;if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};return oldLoad.call(this,name,parent,isMain);};
  try {
    const {SplineJunction,SplineJunctionLink}=require(path.join(out,'Components','SplineJunction.js'));
    const j=new SplineJunction();const spline={count:2,length:100,tAtProgress:p=>p},follower={node:new Node('follower'),target:new Node('target')};
    const l=new SplineJunctionLink();l.spline=spline;l.getProgress=()=>0.5;j.connections=[l,l];
    let editorEvents=0, called=0, switched=0;
    j.onReach=[()=>editorEvents++];const ctx={events:[]};
    function onReach(e){assert.strictEqual(this,ctx);this.events.push(e);called++;}
    function onSwitch(e){assert.strictEqual(this,ctx);switched++;}
    j.AddOnReachEvent(onReach,ctx);j.AddOnReachEvent(onReach,ctx);j.AddOnSwitchEvent(onSwitch,ctx);
    j.reaches(follower,0,1);assert.equal(called,1);assert.equal(editorEvents,1);assert.equal(follower.node.events.length,1);
    j.RemoveOnReachEvent(onReach,ctx);j.reaches(follower,0,1);assert.equal(called,1);assert.equal(editorEvents,2);
    j.switched(follower,0,1,1);assert.equal(switched,1);
    j.onDestroy();j.switched(follower,0,1,1);assert.equal(switched,1);
    const {SplineTrigger}=require(path.join(out,'Components','SplineTrigger.js'));
    const tr=new SplineTrigger();tr.spline=spline;tr.getSpline=()=>spline;tr.getProgress=()=>0.6;
    let crosses=0;const c=()=>crosses++;tr.AddOnCrossEvent(c);
    assert(tr.fire(follower,1));assert.equal(crosses,1);tr.RemoveOnCrossEvent(c);assert(tr.fire(follower,1));assert.equal(crosses,1);
    tr.onDestroy();
    const {SplineAnimate}=require(path.join(out,'Components','SplineAnimate.js'));
    const animator=new SplineAnimate();animator.node=new Node('animator');animator.source=()=>spline;
    let end=0;const endCb=()=>end++;animator.AddOnEndReachedEvent(endCb);animator.reachedBoundary(1);assert.equal(end,1);
    animator.RemoveOnEndReachedEvent(endCb);animator.reachedBoundary(1);assert.equal(end,1);
    const {SplineLengthMonitor}=require(path.join(out,'Components','SplineLengthMonitor.js'));
    const monitor=new SplineLengthMonitor();let total=4;monitor.spline={get length(){return total}};
    let changed=0,above=0;monitor.AddOnChangedEvent(()=>changed++);monitor.AddOnCrossAboveEvent(()=>above++);
    monitor.threshold=5;monitor.reset();total=8;monitor.checkNow();assert.equal(changed,1);assert.equal(above,1);
    monitor.onDestroy();total=2;monitor.checkNow();assert.equal(changed,1);
  } finally {Module._load=oldLoad;}
  console.log('EVENT SUBSCRIPTIONS PASS: dedup, target binding, unsubscribe, dispatch mutations, error isolation, destroy cleanup, Junction/Trigger/Animate/LengthMonitor.');
}finally{fs.rmSync(out,{recursive:true,force:true});}
