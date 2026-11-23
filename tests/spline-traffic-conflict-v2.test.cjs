'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-conflict-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
  '--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {closestConflictSegments,analyzeTrafficConflictPaths}=
   require(path.join(tmp,'Core/SplineTrafficConflictGeometry.js'));
 const v=(x,y,z)=>({x,y,z}),close=(a,b,t=1e-5)=>assert(Math.abs(a-b)<t,`${a} !== ${b}`);
 const crossing=closestConflictSegments(v(0,0,0),v(10,0,0),
     v(5,0,-5),v(5,0,5));
 close(crossing.distance,0);close(crossing.point.x,5);
 const bridge=closestConflictSegments(v(0,0,0),v(10,0,0),
     v(5,4,-5),v(5,4,5));
 close(bridge.distance,4);
 const nearby=closestConflictSegments(v(0,0,0),v(10,0,0),
     v(0,0,.25),v(10,0,.25));
 close(nearby.distance,.25);
 close(closestConflictSegments(v(0,0,0),v(0,0,0),
     v(0,0,2),v(0,0,2)).distance,2);
 const report=analyzeTrafficConflictPaths([
    {exitIndex:0,points:[v(0,0,0),v(10,0,0)]},
    {exitIndex:1,points:[v(5,0,-5),v(5,0,5)]},
    {exitIndex:2,points:[v(5,5,-5),v(5,5,5)]},
 ],[],[{greenExits:[0,1,2]}],.5);
 assert.deepEqual(report.candidates.map(x=>[x.firstExit,x.secondExit]),[[0,1]]);
 assert.deepEqual(report.missingPairs.map(x=>[x.firstExit,x.secondExit]),[[0,1]]);
 assert.deepEqual(report.unsafePhases,[0]);
 close(report.candidates[0].distance,0);
 const declared=analyzeTrafficConflictPaths([
    {exitIndex:0,points:[v(0,0,0),v(10,0,0)]},
    {exitIndex:1,points:[v(5,0,-5),v(5,0,5)],uncertainDirection:true},
 ],[{firstExit:1,secondExit:0}],[{greenExits:[0]},{greenExits:[1]}],.5);
 assert.equal(declared.missingPairs.length,0);
 assert.equal(declared.candidates[0].uncertainDirection,true);
 assert.deepEqual(declared.unsafePhases,[]);
 const multidir=analyzeTrafficConflictPaths([
    {exitIndex:0,points:[v(0,0,0),v(10,0,0)]},
    {exitIndex:0,points:[v(0,5,0),v(10,5,0)]},
    {exitIndex:1,points:[v(5,0,-5),v(5,0,5)]},
 ],[],[{greenExits:[0,1]}],.5);
 assert.equal(multidir.candidates.length,1,'Only one candidate per serialized pair');
 assert.throws(()=>analyzeTrafficConflictPaths([{exitIndex:0,points:[v(0,0,0)]}],[],[],1),/trajectory/);
 assert.throws(()=>analyzeTrafficConflictPaths([],[],[],NaN),/options/);

 // Cocos integration: world 3D point probes and explicit exit directions.
 const decor=(...args)=>args.length>1?undefined:()=>{};
 class Node{
   constructor(name){this.uuid=name;this.name=name;this.isValid=true;this.events=[];
     this.worldMatrix={m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,m08:0,m09:0,m10:1,m12:0,m13:0,m14:0};}
   emit(event,payload){this.events.push({event,payload});}
   getComponent(){return null;}
 }
 class Component{constructor(){this.enabled=true;}getComponent(){return null;}}
 const cc={_decorator:{ccclass:()=>c=>c,property:decor,menu:()=>c=>c},
   Component,Node,Enum:v=>v,Color:class{},Vec3:class{},Quat:class{}};
 const original=Module._load;
 Module._load=function(request,parent,isMain){
   if(request==='cc')return cc;
   if(request==='cc/env')return {EDITOR_NOT_IN_PREVIEW:true};
   return original.call(this,request,parent,isMain);
 };
 try{
   const {SplineJunction,SplineJunctionLink,JunctionExitDirection}=
       require(path.join(tmp,'Components/SplineJunction.js'));
   const {SplineTrafficController,SplineTrafficPhase,SplineTrafficConflict}=
       require(path.join(tmp,'Components/SplineTrafficController.js'));
   const spline=(name,fn)=>{
      const node=new Node(name);
      return {node,enabled:true,count:2,closed:false,length:10,
        segmentCount:1,samplesPerCurve:32,reversed:false,
        getRevision(){return '1';},evaluateWorldPosition:fn};
   };
   const j=new SplineJunction();j.node=new Node('junction');
   const lines=[
      spline('east',p=>v(10*p,0,0)),
      spline('north',p=>v(5,0,-5+10*p)),
      spline('bridge',p=>v(5,4,-5+10*p))];
   for(const road of lines){
      const link=new SplineJunctionLink();
      link.spline=road;link.getProgress=()=>0;
      link.exitDirection=JunctionExitDirection.Forward;
      j.connections.push(link);
   }
   const ctrl=new SplineTrafficController();ctrl.node=new Node('controller');
   ctrl.junction=j;
   const phase=new SplineTrafficPhase();phase.greenExits=[0,1,2];ctrl.phases=[phase];
   let diag=ctrl.diagnoseConflicts();
   assert.equal(diag.ok,true);assert.equal(diag.validExits,3);
   assert.deepEqual(diag.missingPairs.map(x=>[x.firstExit,x.secondExit]),[[0,1]]);
   assert.deepEqual(diag.unsafePhases,[0]);
   const pair=new SplineTrafficConflict();pair.firstExit=0;pair.secondExit=1;
   ctrl.conflicts=[pair];diag=ctrl.diagnoseConflicts();
   assert.equal(diag.missingPairs.length,0);
   assert.equal(diag.unsafePhases.length,1,'Existing pair still unsafe in authored same-Green phase');
   ctrl.phases[0].greenExits=[0];
   diag=ctrl.diagnoseConflicts();assert.deepEqual(diag.unsafePhases,[]);
   j.connections[1].exitDirection=JunctionExitDirection.Preserve;
   diag=ctrl.diagnoseConflicts();
   assert(diag.ambiguousExits.includes(1));
   assert.equal(diag.candidates[0].uncertainDirection,true);
   j.connections[2].spline=null;
   diag=ctrl.diagnoseConflicts();
   assert(diag.skipped.some(x=>x.exitIndex===2));
   assert.throws(()=>{ctrl.conflictProbeIgnoreOrigin=100;ctrl.diagnoseConflicts();},/settings/);
   console.log('TRAFFIC GEOMETRY PASS: 3D crossing/bridge, declared and missing pairs, same-Green warnings, world sampling, preserve direction and safe skips.');
 }finally{Module._load=original;}
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
