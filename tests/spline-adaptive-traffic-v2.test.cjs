'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-adaptive-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
   '--noEmit','false','--outDir',out],{stdio:'pipe'});
 const {compileTrafficCycle}=require(path.join(out,'Core','SplineTrafficCycle.js'));
 const {SplineAdaptiveTraffic,validateAdaptiveTraffic}=
     require(path.join(out,'Core','SplineAdaptiveTraffic.js'));
 const program=compileTrafficCycle([
   {greenExits:[0],greenSeconds:4,yellowSeconds:1},
   {greenExits:[1],greenSeconds:4,yellowSeconds:1},
   {greenExits:[2],greenSeconds:4,yellowSeconds:1},
 ],[{firstExit:0,secondExit:1}],3,1);
 const config={minGreenSeconds:2,maxGreenSeconds:6,maxDemandWaitSeconds:3};
 const sample=(scheduler,dt,counts)=>scheduler.tick(dt,counts);
 let s=new SplineAdaptiveTraffic(program,config);
 assert.equal(s.sample.stage,'all-red');
 let p=sample(s,1,[0,4,0]);
 assert.equal(p.stage,'green');assert.equal(p.phaseIndex,1);
 assert.deepEqual(p.greenExits,[1]);
 p=sample(s,2,[0,4,0]);
 assert.equal(p.stage,'green','Only demanded direction should extend Green');
 p=sample(s,4,[0,4,0]);
 assert.equal(p.stage,'yellow');assert.equal(p.phaseIndex,1);
 p=sample(s,1,[0,4,0]);assert.equal(p.stage,'all-red');
 p=sample(s,1,[0,4,0]);assert.equal(p.stage,'green');assert.equal(p.phaseIndex,1);
 assert.deepEqual(s.currentDemand,[0,4,0]);
 assert.notStrictEqual(s.currentDemand,s.currentDemand,'Demand getters are defensive copies');
 const separate=s.currentDemand;separate[1]=0;
 assert.equal(s.currentDemand[1],4,'External mutation cannot alter scheduler demand');
 s=new SplineAdaptiveTraffic(program,config);
 sample(s,1,[4,0,0]);assert.equal(s.sample.phaseIndex,0);
 p=sample(s,1,[4,3,0]);
 assert.equal(p.stage,'green','Cannot preempt before min Green');
 p=sample(s,1,[4,3,0]);
 assert.equal(p.stage,'green','Waiting threshold not reached at 2 seconds');
 p=sample(s,1,[4,3,0]);
 assert.equal(p.stage,'yellow','Overdue demand forces Yellow after minimum Green');
 assert.equal(p.phaseIndex,0);
 assert.deepEqual(p.greenExits,[0],
   'Yellow still identifies the formerly Green exits; they do not admit');
 p=sample(s,1,[4,3,0]);assert.equal(p.stage,'all-red');
 p=sample(s,1,[4,3,0]);assert.equal(p.stage,'green');assert.equal(p.phaseIndex,1);
 // Choose highest queue on equal overdue ages, rotate rather than always
 // selecting the heavily trafficked phase. No phase is skipped indefinitely
 // merely because a second direction has higher raw queue demand.
 s=new SplineAdaptiveTraffic(program,config);
 sample(s,1,[9,3,2]);assert.equal(s.sample.phaseIndex,0);
 sample(s,3,[9,3,2]);assert.equal(s.sample.stage,'yellow');
 sample(s,1,[9,3,2]);assert.equal(s.sample.stage,'all-red');
 p=sample(s,1,[9,3,2]);assert.equal(p.phaseIndex,1);
 sample(s,2,[9,3,2]);assert.equal(s.sample.stage,'yellow');
 sample(s,1,[9,3,2]);assert.equal(s.sample.stage,'all-red');
 p=sample(s,1,[9,3,2]);assert.equal(p.phaseIndex,2,
   'Oldest unserved phase gets an opportunity even if it has lower demand');
 s=new SplineAdaptiveTraffic(program,config);
 sample(s,1,[0,0,0]);assert.equal(s.sample.phaseIndex,0);
 sample(s,4,[0,0,0]);assert.equal(s.sample.stage,'yellow');
 sample(s,1,[0,0,0]);assert.equal(s.sample.stage,'all-red');
 sample(s,1,[0,0,0]);assert.equal(s.sample.phaseIndex,1,
   'Without demand, fall back to deterministic cyclic phase order');
 assert.throws(()=>validateAdaptiveTraffic({...config,minGreenSeconds:0}),/Invalid/);
 assert.throws(()=>validateAdaptiveTraffic({...config,maxGreenSeconds:1}),/Invalid/);
 assert.throws(()=>validateAdaptiveTraffic({...config,maxDemandWaitSeconds:Infinity}),/Invalid/);
 assert.throws(()=>s.tick(-1,[0,0,0]),/Invalid/);
 assert.throws(()=>s.tick(1,[0,1]),/Invalid/);
 assert.throws(()=>s.tick(1,[0,-1,0]),/Invalid/);
 assert.doesNotThrow(()=>s.tick(1e7,[0,0,0]),
   'Huge dt must be bounded and not loop through millions of cycles');
 // Cocos component adapter: read actual FIFO queues, issue events, preserve
 // controller ownership and original manual signals on disable.
 const deco=(...args)=>args.length>1?undefined:()=>{};
 class Node{constructor(name){this.uuid=name;this.isValid=true;this.events=[];}
   emit(name,payload){this.events.push({name,payload});}
   getComponent(){return null;}}
 class Component{constructor(){this.enabled=true;}getComponent(){return null;}}
 const cc={_decorator:{ccclass:()=>v=>v,property:deco,menu:()=>v=>v,
   executeInEditMode:()=>v=>v},Component,Node,Enum:v=>v,Color:class{},
   Vec3:class{},Quat:class{}};
 const load=Module._load;
 Module._load=function(name,parent,isMain){
   if(name==='cc')return cc;
   if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};
   return load.call(this,name,parent,isMain);
 };
 try{
   const {SplineJunction,SplineJunctionLink,JunctionTrafficSignal:Signal}=
       require(path.join(out,'Components','SplineJunction.js'));
   const {SplineTrafficController,SplineTrafficPhase}=
       require(path.join(out,'Components','SplineTrafficController.js'));
   const {splineTrafficGate}=require(path.join(out,'Core','SplineTrafficGate.js'));
   splineTrafficGate.clear();
   const j=new SplineJunction();j.node=new Node('junction');
   j.connections=[new SplineJunctionLink(),new SplineJunctionLink(),new SplineJunctionLink()];
   j.setTrafficSignal(2,Signal.Red);
   const ctrl=new SplineTrafficController();ctrl.node=new Node('controller');ctrl.junction=j;
   ctrl.allRedSeconds=1;ctrl.adaptiveTraffic=true;
   ctrl.minGreenSeconds=2;ctrl.maxGreenSeconds=6;ctrl.maxDemandWaitSeconds=3;
   for(let i=0;i<3;i++){
       const phase=new SplineTrafficPhase();
       phase.greenExits=[i];phase.greenSeconds=4;phase.yellowSeconds=1;
       ctrl.phases.push(phase);
   }
   const manual=j.connections.map(x=>x.trafficSignal);
   ctrl.onEnable();assert.equal(ctrl.stage,'all-red');
   const owners=[{},{}];
   assert(!splineTrafficGate.move(owners[0],j,2,0,false,0));
   assert(!splineTrafficGate.move(owners[1],j,2,0,false,0));
   assert.deepEqual(ctrl.phaseDemand,[0,0,2]);
   ctrl.update(1);
   assert.equal(ctrl.phaseIndex,2,'Demand-responsive first phase');
   assert.deepEqual(j.connections.map(x=>x.trafficSignal),
     [Signal.Red,Signal.Red,Signal.Green]);
   ctrl.update(2);assert.equal(ctrl.stage,'green');
   assert.equal(ctrl.phaseDemandAges.length,3);
   ctrl.update(4);assert.equal(ctrl.stage,'yellow');
   assert.equal(j.getTrafficSignal(2),Signal.Yellow);
   ctrl.update(1);assert.equal(ctrl.stage,'all-red');
   ctrl.update(1);assert.equal(ctrl.phaseIndex,2);
   assert(ctrl.node.events.some(e=>e.name==='spline-traffic-cycle-stage'));
   // Runtime settings switch mode only after resetting to all-red.
   ctrl.adaptiveTraffic=false;ctrl.update(.1);
   assert.equal(ctrl.stage,'all-red');
   ctrl.update(.9);assert.equal(ctrl.phaseIndex,0,
     'Fixed-mode still preserves original authoring order');
   ctrl.adaptiveTraffic=true;ctrl.minGreenSeconds=7;ctrl.maxGreenSeconds=6;
   ctrl.update(.2);assert.equal(ctrl.stage,'invalid');
   assert.deepEqual(j.connections.map(x=>x.trafficSignal),
     [Signal.Red,Signal.Red,Signal.Red]);
   assert.match(ctrl.validationError,/adaptive/);
   ctrl.maxGreenSeconds=8;ctrl.update(.1);
   assert.equal(ctrl.stage,'all-red');
   ctrl.pauseCycle();ctrl.update(50);assert.equal(ctrl.isCycling,false);
   ctrl.resumeCycle();assert.equal(ctrl.stage,'all-red');
   ctrl.onDisable();
   assert.deepEqual(j.connections.map(x=>x.trafficSignal),manual,
     'Manual signals restored after adaptive controller disable');
   splineTrafficGate.clear();
   console.log('ADAPTIVE TRAFFIC PASS: queued demand, min/max Green, overdue fairness, Yellow/All-Red, invalidation, fixed fallback and Cocos adapter.');
 }finally{Module._load=load;}
}finally{fs.rmSync(out,{recursive:true,force:true});}
