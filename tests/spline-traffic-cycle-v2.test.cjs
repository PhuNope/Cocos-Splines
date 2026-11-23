'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-traffic-cycle-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
   '--noEmit','false','--outDir',out],{stdio:'pipe'});
 const {compileTrafficCycle,sampleTrafficCycle}=
   require(path.join(out,'Core','SplineTrafficCycle.js'));
 const phases=[
   {greenExits:[0],greenSeconds:2,yellowSeconds:1},
   {greenExits:[2,1],greenSeconds:2,yellowSeconds:1},
 ];
 const plan=compileTrafficCycle(phases,[{firstExit:0,secondExit:1}],3,1);
 assert.deepEqual(plan.phases[1].greenExits,[1,2],
   'Compiler sorts selected exits deterministically');
 assert.equal(plan.loopSeconds,8);
 const state=t=>sampleTrafficCycle(plan,t);
 assert.equal(state(0).stage,'all-red');
 assert.equal(state(.8).phaseIndex,-1);
 assert.equal(state(1).stage,'green');
 assert.equal(state(2.999).phaseIndex,0);
 assert.equal(state(3).stage,'yellow');
 assert.equal(state(3).phaseIndex,0);
 assert.equal(state(4).stage,'all-red');
 assert.equal(state(5).stage,'green');
 assert.equal(state(5).phaseIndex,1);
 assert.deepEqual(state(5).greenExits,[1,2]);
 assert.equal(state(7).stage,'yellow');
 assert.equal(state(8).stage,'all-red');
 assert.equal(state(9).stage,'green');
 assert.equal(state(9).phaseIndex,0);
 assert.equal(state(17).phaseIndex,0);
 assert.equal(state(1e10).stage,state(1+((1e10-1)%8)).stage,
   'Large dt must use periodic math, never O(dt) frame loops');
 assert.deepEqual(phases[1].greenExits,[2,1],
   'Compilation must never mutate authored Scene values');
 assert.throws(()=>compileTrafficCycle([
   {greenExits:[0,1],greenSeconds:1,yellowSeconds:1}],
   [{firstExit:0,secondExit:1}],3,1),/Conflicting/);
 assert.throws(()=>compileTrafficCycle([
   {greenExits:[1,1],greenSeconds:1,yellowSeconds:0}],[],3,1),/duplicate/);
 assert.throws(()=>compileTrafficCycle([
   {greenExits:[4],greenSeconds:1,yellowSeconds:0}],[],3,1),/index/);
 assert.throws(()=>compileTrafficCycle(phases,[],3,0),/clearance/);
 assert.throws(()=>compileTrafficCycle(phases,[],3,NaN),/clearance/);
 assert.throws(()=>compileTrafficCycle(phases,[{firstExit:0,secondExit:0}],3,1),/conflict pair/);
 assert.throws(()=>compileTrafficCycle([],[],3,1),/cycle/);
 const noYellow=compileTrafficCycle([{greenExits:[0],greenSeconds:1,yellowSeconds:0}],[],3,.1);
 assert.equal(sampleTrafficCycle(noYellow,.5).stage,'green');
 assert.equal(sampleTrafficCycle(noYellow,1.1).stage,'all-red');

 // End-to-end simulation of Cocos Component under the project's offline mocks.
 const decor=(...args)=>args.length>1?undefined:()=>{};
 class Node{
   constructor(name){this.uuid=name;this.name=name;this.isValid=true;this.events=[];}
   emit(name,payload){this.events.push({name,payload});}
   getComponent(){return null;}
 }
 class Component{constructor(){this.enabled=true;}getComponent(){return null;}}
 const cc={_decorator:{ccclass:()=>c=>c,property:decor,menu:()=>c=>c,
   executeInEditMode:()=>c=>c},Component,Node,Enum:v=>v,
   Color:class{},Vec3:class{},Quat:class{}};
 const original=Module._load;
 Module._load=function(name,parent,isMain){
   if(name==='cc')return cc;
   if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};
   return original.call(this,name,parent,isMain);
 };
 try{
   const {SplineJunction,SplineJunctionLink,JunctionTrafficSignal:Sig}=
     require(path.join(out,'Components','SplineJunction.js'));
   const {SplineTrafficController,SplineTrafficPhase,SplineTrafficConflict}=
     require(path.join(out,'Components','SplineTrafficController.js'));
   const {splineTrafficGate}=require(path.join(out,'Core','SplineTrafficGate.js'));
   const red=Sig.Red,green=Sig.Green,yellow=Sig.Yellow;
   assert.equal(green,0);assert.equal(red,1);assert.equal(yellow,2);
   const j=new SplineJunction();j.node=new Node('junction');
   j.connections=[new SplineJunctionLink(),new SplineJunctionLink(),new SplineJunctionLink()];
   assert(j.setTrafficSignal(2,red),'Authored state saved before attachment');
   const ctrl=new SplineTrafficController();ctrl.node=new Node('controller');ctrl.junction=j;
   const p0=new SplineTrafficPhase();p0.greenExits=[0];p0.greenSeconds=2;p0.yellowSeconds=1;
   const p1=new SplineTrafficPhase();p1.greenExits=[1,2];p1.greenSeconds=2;p1.yellowSeconds=1;
   const conflict=new SplineTrafficConflict();conflict.firstExit=0;conflict.secondExit=1;
   ctrl.phases=[p0,p1];ctrl.conflicts=[conflict];ctrl.allRedSeconds=1;
   ctrl.onEnable();
   const states=()=>j.connections.map(c=>c.trafficSignal);
   assert.deepEqual(states(),[red,red,red],'Controller must initially be All-Red');
   assert.equal(ctrl.stage,'all-red');assert.equal(ctrl.phaseIndex,-1);
   const observe=()=>assert(!(states()[0]===green&&states()[1]===green),
     'Conflict pair must never be simultaneously Green');
   ctrl.update(1);observe();
   assert.deepEqual(states(),[green,red,red]);
   const gateOwner={};
   assert(splineTrafficGate.move(gateOwner,j,0,0,true,0));
   splineTrafficGate.release(gateOwner);
   ctrl.update(2);observe();
   assert.deepEqual(states(),[yellow,red,red]);
   assert(!splineTrafficGate.move(gateOwner,j,0,0,false,0),
     'Yellow blocks new admission even when Max Followers is unlimited');
   assert.equal(splineTrafficGate.waiting(j,0),1);
   ctrl.update(1);observe();
   assert.deepEqual(states(),[red,red,red]);
   ctrl.update(1);observe();
   assert.deepEqual(states(),[red,green,green]);
   ctrl.update(2);observe();assert.deepEqual(states(),[red,yellow,yellow]);
   ctrl.update(1);observe();assert.deepEqual(states(),[red,red,red]);
   ctrl.update(1);observe();assert.deepEqual(states(),[green,red,red]);
   assert(ctrl.node.events.some(e=>e.name==='spline-traffic-cycle-stage'));
   assert(j.node.events.filter(e=>e.name==='spline-traffic-signal-changed').length>3);
   ctrl.pauseCycle();assert.deepEqual(states(),[red,red,red]);
   assert.equal(ctrl.isCycling,false);
   ctrl.update(100);assert.deepEqual(states(),[red,red,red]);
   ctrl.resumeCycle();assert.equal(ctrl.stage,'all-red');
   ctrl.update(1);assert.deepEqual(states(),[green,red,red]);
   // A conflicting phase change in Play is rejected and forces All-Red,
   // preserving no transient Green, then automatically recovers when fixed.
   p0.greenExits=[0,1];ctrl.update(.1);
   assert.equal(ctrl.stage,'invalid');
   assert.match(ctrl.validationError,/Conflicting/);
   assert.deepEqual(states(),[red,red,red]);
   assert.equal(ctrl.node.events.filter(e=>e.name==='spline-traffic-cycle-invalid').length,1);
   p0.greenExits=[0];ctrl.update(.1);
   assert.equal(ctrl.stage,'all-red');
   assert.equal(ctrl.validationError,'');
   ctrl.update(1);assert.deepEqual(states(),[green,red,red]);
   // External scripts cannot persistently override an active Controller:
   // next update reasserts the authored automatic schedule.
   j.setTrafficSignal(1,green);ctrl.update(0);
   assert.deepEqual(states(),[green,red,red]);
   // Only one live controller may manage a particular Junction.
   const duplicate=new SplineTrafficController();duplicate.node=new Node('duplicate');
   duplicate.junction=j;duplicate.phases=[p0];
   duplicate.onEnable();
   assert.equal(duplicate.stage,'invalid');
   assert.match(duplicate.validationError,/another/);
   duplicate.update(1);
   assert.deepEqual(states(),[green,red,red]);
   ctrl.onDisable();
   assert.deepEqual(states(),[green,green,red],
     'OnDisable restores manual Green/Red state by link identity');
   assert.equal(ctrl.stage,'inactive');
   assert.equal(ctrl.isCycling,false);
   // Previously refused controller is free to own Junction now.
   duplicate.update(0);
   assert.equal(duplicate.stage,'all-red');
   assert.deepEqual(states(),[red,red,red]);
   duplicate.onDestroy();
   assert.deepEqual(states(),[green,green,red]);
   // Zero phases is invalid: it must not silently open an unmanaged link.
   const invalid=new SplineTrafficController();invalid.node=new Node('invalid');
   invalid.junction=j;invalid.phases=[];
   invalid.onEnable();
   assert.equal(invalid.stage,'invalid');
   assert.deepEqual(states(),[red,red,red]);
   invalid.onDisable();assert.deepEqual(states(),[green,green,red]);
   // Dynamic link addition has its original manual state restored.
   const added=new SplineTrafficController();added.node=new Node('added');
   added.junction=j;added.phases=[p0];added.onEnable();
   j.connections.push(new SplineJunctionLink());
   added.update(0);
   assert.deepEqual(states(),[red,red,red,red]);
   added.onDisable();
   assert.deepEqual(states(),[green,green,red,green]);
   splineTrafficGate.clear();
   console.log('TRAFFIC CYCLE PASS: deterministic Yellow/all-red, conflicts, runtime edits, controller authority, manual restoration, FIFO signal admission and lifecycle.');
 }finally{Module._load=original;}
}finally{fs.rmSync(out,{recursive:true,force:true});}
