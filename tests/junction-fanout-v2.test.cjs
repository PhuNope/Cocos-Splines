'use strict';
const assert=require('node:assert/strict');
const {planJunctionFanout}=require('../dist/SplineJunctionFanoutMath');
const {createJunctionScene}=require('../dist/SplineJunctionScene');
const v=(x=0,y=0,z=0)=>({x,y,z}),q={x:0,y:0,z:0,w:1};
const mat=(tx=0,sx=1)=>[sx,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const points=[0,5,10].map(x=>({position:v(x),tangentIn:v(-1),tangentOut:v(1)}));
const desc=(tx=0,progress=0,sx=1,dim=0)=>({
 matrix:mat(tx,sx),knots:points.map(p=>({
   position:{...p.position},tangentIn:{...p.tangentIn},
   tangentOut:{...p.tangentOut}})),
 reversed:false,progress,dimension:dim,
});
const a=desc(0,1),b=desc(10,0),c=desc(10,0,2);
const original=JSON.stringify([a,b,c]);
let plan=planJunctionFanout(a,[{index:1,source:b},{index:2,source:c}]);
assert.equal(plan.routeCount,2);
assert.equal(plan.totalKnotCount,10);
assert.deepEqual(plan.routes.map(r=>r.count),[5,5]);
assert.deepEqual(plan.routes[0].knots.map(k=>k.position.x),[0,5,10,15,20]);
assert.deepEqual(plan.routes[1].knots.map(k=>k.position.x),[0,5,10,20,30]);
assert.equal(plan.routes[0].targetIndex,1);
assert.equal(plan.routes[1].targetIndex,2);
assert(plan.routes.every(r=>r.knots[2].position.x===10&&r.gap===0));
assert.equal(JSON.stringify([a,b,c]),original,'No mutation of sources');
assert.throws(()=>planJunctionFanout(a,[{index:1,source:b}]),/2 to 8/);
assert.throws(()=>planJunctionFanout(a,[{index:1,source:b},{index:1,source:c}]),/distinct/);
assert.throws(()=>planJunctionFanout(a,[{index:1,source:b},{index:2,source:desc(11,0)}]),/Snap/);
assert.throws(()=>planJunctionFanout(a,[{index:1,source:b},{index:2,source:desc(10,0,1,1)}]),/dimension/);
assert.throws(()=>planJunctionFanout(a,Array.from({length:9},(_,i)=>({index:i,source:b}))),/2 to 8/);
const big=desc(0,1),bigTarget=desc(10,0);
big.knots=Array.from({length:60},(_,i)=>({
 position:v(i*10/59),tangentIn:v(-1),tangentOut:v(1)}));
bigTarget.knots=Array.from({length:60},(_,i)=>({
 position:v(i*10/59),tangentIn:v(-1),tangentOut:v(1)}));
assert.throws(()=>planJunctionFanout(big,[{index:1,source:bigTarget},
 {index:2,source:bigTarget},
 {index:3,source:bigTarget}]),/256-Knot/);

const worldScene={uuid:'scene-A',isValid:true};
const nodes=new Map();
function spline(id,tx=0,sx=1){
 const node={uuid:id,name:'Spline '+id,parent:worldScene,isValid:true,
   position:v(tx),rotation:{...q},scale:v(sx,1,1),
   worldMatrix:mat(tx,sx),components:[],children:[]};
 const knots=points.map((p,i)=>{
   const n={uuid:id+'-k'+i,isValid:true,parent:node,
     position:{...p.position},rotation:{...q},children:[],components:[]};
   const k={kind:'Splines.SplineKnot',node:n,enabled:true,mode:4,
     tension:1/3,tangentsInKnotSpace:false,
     tangentIn:{...p.tangentIn},tangentOut:{...p.tangentOut},
     tangentInHandle:null,tangentOutHandle:null};
   n.components=[k];node.children.push(n);nodes.set(n.uuid,n);return k;
 });
 const s={kind:'Splines.SplineContainer',node,enabled:true,closed:false,
   reversed:false,dimension:0,samplesPerCurve:32,count:3,
   showGizmos:true,showTangentGizmos:false,gizmoSteps:16,
   get knots(){return this.reversed?[...knots].reverse():knots;},
   getNaturalResolvedKnots(){return knots.map(k=>({
     position:{...k.node.position},tangentIn:{...k.tangentIn},
     tangentOut:{...k.tangentOut}}));},
   evaluateWorldPosition(p){return v(node.worldMatrix[12]+
      node.worldMatrix[0]*10*(this.reversed?1-p:p));},
   evaluateTangent(){return v(1)},
 };
 node.components=[s];nodes.set(node.uuid,node);return s;
}
const A=spline('a'),B=spline('b',10),C=spline('c',10,2);
const D=spline('d',10);
const junctionNode={uuid:'junction',parent:worldScene,isValid:true,components:[]};
const link=(s,p)=>({spline:s,progress:p,positionMode:0,
 distance:0,exitDirection:0,getProgress(){return this.progress;}});
const junction={kind:'Splines.SplineJunction',node:junctionNode,enabled:true,
 connections:[link(A,1),link(B,0),link(C,0),link(D,0)]};
junctionNode.components=[junction];nodes.set(junctionNode.uuid,junctionNode);
const scene=createJunctionScene({
 resolve:id=>nodes.get(id)||null,classOf:c=>c.kind,
 sceneId:()=>worldScene.uuid,
 queryKnotEditFrame:id=>({ok:true,matrix:nodes.get(id).worldMatrix}),
});
let p=scene.queryJunctionFanoutPlan('junction',0,[1,2,3]);
assert(p.ok,p.error);
assert.equal(p.routeCount,3);
assert.equal(p.totalKnotCount,15);
assert.deepEqual(p.targetIndices,[1,2,3]);
assert.deepEqual(p.targetSplineUuids,['b','c','d']);
assert.equal(p.parentUuid,'scene-A');
assert.equal(p.samplesPerCurve,32);
assert(scene.queryJunctionJoinValid('junction',p.guard).ok);
B.knots[1].tangentOut.x=9;
assert(!scene.queryJunctionJoinValid('junction',p.guard).ok,
 'Any source Knot mutation invalidates plan');
B.knots[1].tangentOut.x=1;
assert(scene.queryJunctionJoinValid('junction',p.guard).ok);
worldScene.uuid='scene-B';
assert(!scene.queryJunctionJoinValid('junction',p.guard).ok);
worldScene.uuid='scene-A';
assert(!scene.queryJunctionFanoutPlan('junction',0,[0,1]).ok);
assert(!scene.queryJunctionFanoutPlan('junction',0,[1,1]).ok);
assert(!scene.queryJunctionFanoutPlan('junction',0,[1]).ok);
junction.connections[1].progress=.5;
assert(!scene.queryJunctionFanoutPlan('junction',0,[1,2]).ok);
junction.connections[1].progress=0;
C.closed=true;
assert(!scene.queryJunctionFanoutPlan('junction',0,[1,2]).ok);
C.closed=false;
D.node.worldMatrix[12]=12;
assert(!scene.queryJunctionFanoutPlan('junction',0,[2,3]).ok);
D.node.worldMatrix[12]=10;
console.log('JUNCTION FAN-OUT SCENE/MATH PASS: branch-preserving routes, source isolation, bounds, stale guard, endpoint validation.');
