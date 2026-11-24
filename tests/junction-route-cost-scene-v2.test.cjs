'use strict';
const assert=require('node:assert/strict');
const {createJunctionScene}=require('../dist/SplineJunctionScene');
const v=(x=0,y=0,z=0)=>({x,y,z});
const q={x:0,y:0,z:0,w:1};
const matrix=tx=>[1,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const near=(x,y)=>assert(Math.abs(x-y)<1e-5,String(x)+' != '+String(y));
const scene={uuid:'scene-cost',isValid:true,children:[],components:[]};
const registry=new Map([[scene.uuid,scene]]);
function spline(id,tx,diff){
 const node={uuid:id,parent:scene,name:'Spline '+id,
   position:v(tx),rotation:{...q},scale:v(1,1,1),
   worldMatrix:matrix(tx),isValid:true,components:[],children:[]};
 const points=[0,diff/2,diff];
 const knots=points.map((x,i)=>{
   const kn={uuid:id+'-k'+i,parent:node,isValid:true,position:v(x),
     rotation:{...q},components:[],children:[]};
   const k={kind:'Splines.SplineKnot',node:kn,enabled:true,
     mode:4,tension:1/3,tangentsInKnotSpace:false,
     tangentIn:v(-diff/6),tangentOut:v(diff/6),
     tangentInHandle:null,tangentOutHandle:null};
   kn.components=[k];node.children.push(kn);registry.set(kn.uuid,kn);
   return k;
 });
 const spl={kind:'Splines.SplineContainer',node,isValid:true,
   closed:false,reversed:false,dimension:0,samplesPerCurve:24,enabled:true,
   count:3,showGizmos:true,showTangentGizmos:false,gizmoSteps:16,
   get knots(){return this.reversed?[...knots].reverse():knots;},
   getNaturalResolvedKnots(){return knots.map(k=>({
     position:{...k.node.position},tangentIn:{...k.tangentIn},
     tangentOut:{...k.tangentOut},mode:4,
   }));},
   evaluateWorldPosition(p){return v(tx+diff*(this.reversed?1-p:p));},
   evaluateWorldPositionAtT(t){return v(tx+diff*(this.reversed?1-t:t));},
   evaluateTangent(){return v(diff);},
   tAtProgress(p){return p;},
 };
 node.components=[spl];scene.children.push(node);registry.set(id,node);
 return spl;
}
const A=spline('a',0,10),B=spline('b',10,10);
const C=spline('c',10,2),E=spline('e',12,2),D=spline('d',20,-6);
function junction(id,entries){
 const node={uuid:id,parent:scene,isValid:true,components:[],children:[]};
 const connections=entries.map(([s,p])=>({
   spline:s,progress:p,positionMode:0,distance:0,exitDirection:0,
   trafficSignal:0,
   getProgress(){return this.progress;},
 }));
 const j={kind:'Splines.SplineJunction',node,enabled:true,connections};
 node.components=[j];scene.children.push(node);registry.set(id,node);
 return j;
}
const J1=junction('j1',[[A,1],[B,0],[C,0]]);
const J2=junction('j2',[[B,1],[D,0]]);
const J3=junction('j3',[[C,1],[E,0]]);
const J4=junction('j4',[[E,1],[D,1]]);
J4.connections[1].exitDirection=2; // Backward required for D progress 1.
const sceneApi=createJunctionScene({
 resolve:id=>registry.get(id)||null,
 classOf:x=>x.kind,
 sceneRoot:()=>scene,sceneId:()=>scene.uuid,
 queryKnotEditFrame:id=>({ok:true,matrix:registry.get(id).worldMatrix}),
});
const names=p=>p.chain.map(x=>x.splineId);
let plan=sceneApi.queryMultiJunctionJoinPlan('j1',0,'d');
assert(plan.ok,plan.error);
assert.deepEqual(names(plan),['a','b','d']);
assert.equal(plan.routeCostMode,'switches');
assert.equal(plan.estimatedWorldDistance,null);
const baseline=JSON.stringify([A.getNaturalResolvedKnots(),
 B.getNaturalResolvedKnots(),C.getNaturalResolvedKnots(),
 D.getNaturalResolvedKnots(),E.getNaturalResolvedKnots()]);
plan=sceneApi.queryMultiJunctionJoinPlan('j1',0,'d',
 'preserve','full',0,1,'distance',10);
assert(plan.ok,plan.error);
assert.deepEqual(names(plan),['a','c','e','d']);
assert.equal(plan.routeCostMode,'distance');
assert.equal(plan.count,9);
near(plan.estimatedWorldDistance,20);
near(plan.estimatedRouteCost,20);
near(plan.knots[plan.count-1].position.x,20);
assert(sceneApi.queryMultiJunctionJoinValid('j1',plan.guard).ok);
const policyPlan=sceneApi.queryMultiJunctionJoinPlan('j1',0,'d',
 'preserve','full',0,1,'distance',10,'direction');
assert(policyPlan.ok,policyPlan.error);
assert.deepEqual(names(policyPlan),['a','c','e','d']);
assert.equal(policyPlan.routePolicy,'direction');
J1.connections[1].trafficSignal=1; // Red: block shortest-switch B transfer.
const green=sceneApi.queryMultiJunctionJoinPlan('j1',0,'d',
 'preserve','full',0,1,'switches',10,'direction-green');
assert(green.ok,green.error);
assert.deepEqual(names(green),['a','c','e','d']);
assert.equal(green.routePolicy,'direction-green');
assert(!sceneApi.queryMultiJunctionJoinValid('j1',plan.guard).ok,
 'Changing a traffic signal must invalidate a planned route lease');
J1.connections[2].trafficSignal=2;
assert(!sceneApi.queryMultiJunctionJoinPlan('j1',0,'d',
 'preserve','full',0,1,'switches',10,'direction-green').ok);
J1.connections[1].trafficSignal=0;
J1.connections[2].trafficSignal=0;
assert(sceneApi.queryMultiJunctionJoinValid('j1',plan.guard).ok);
let balanced=sceneApi.queryMultiJunctionJoinPlan('j1',0,'d',
 'preserve','full',0,1,'balanced',10);
assert(balanced.ok,balanced.error);
assert.deepEqual(names(balanced),['a','b','d']);
near(balanced.estimatedWorldDistance,26);
near(balanced.estimatedRouteCost,46);
balanced=sceneApi.queryMultiJunctionJoinPlan('j1',0,'d',
 'preserve','full',0,1,'balanced',0);
assert(balanced.ok,balanced.error);
assert.deepEqual(names(balanced),['a','c','e','d']);
// Cost-aware Partial mode traverses monotonic Bezier portions using the
// existing de Casteljau slicing. Goal side changes reachable routes.
let partial=sceneApi.queryMultiJunctionJoinPlan('j1',0,'d',
 'preserve','partial',0,0,'distance',10);
assert(partial.ok,partial.error);
assert.deepEqual(names(partial),['a','c','e','d']);
near(partial.estimatedWorldDistance,20);
assert.equal(partial.routeMode,'partial');
partial=sceneApi.queryMultiJunctionJoinPlan('j1',0,'d',
 'c1','partial',0,1,'distance',10);
assert(partial.ok,partial.error);
assert.deepEqual(names(partial),['a','b','d']);
assert(partial.seams.every(s=>s.continuousC1));
assert.equal(JSON.stringify([A.getNaturalResolvedKnots(),
 B.getNaturalResolvedKnots(),C.getNaturalResolvedKnots(),
 D.getNaturalResolvedKnots(),E.getNaturalResolvedKnots()]),baseline);
const originalTangent=C.knots[0].tangentOut.x;
C.knots[0].tangentOut.x=originalTangent+1;
assert(!sceneApi.queryMultiJunctionJoinValid('j1',plan.guard).ok);
C.knots[0].tangentOut.x=originalTangent;
assert(sceneApi.queryMultiJunctionJoinValid('j1',plan.guard).ok);
J3.connections[1].progress=.7;
assert(!sceneApi.queryMultiJunctionJoinValid('j1',plan.guard).ok);
J3.connections[1].progress=0;
assert(!sceneApi.queryMultiJunctionJoinPlan('j1',0,'d',
 'preserve','full',0,1,'balanced',-1).ok);
assert(!sceneApi.queryMultiJunctionJoinPlan('j1',0,'d',
 'preserve','full',0,1,'bad',10).ok);
assert(!sceneApi.queryMultiJunctionJoinPlan('j1',0,'d',
 'preserve','full',0,1,'distance',10,'unsupported').ok);
assert(sceneApi.queryMultiJunctionJoinValid('j1',plan.guard).ok);
console.log('JUNCTION COST SCENE PASS: legacy BFS, 2-vs-3 switches, sampled world path length, Full/Partial, C1, source lease.');
