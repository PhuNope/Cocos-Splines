'use strict';
const assert=require('node:assert/strict');
const {createJunctionScene}=require('../dist/SplineJunctionScene');
const v=(x=0,y=0,z=0)=>({x,y,z}),q={x:0,y:0,z:0,w:1};
const mat=tx=>[1,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,String(a)+' != '+String(b));
const root={uuid:'scene-A',children:[],components:[],isValid:true};
const nodes=new Map([[root.uuid,root]]);
function spline(id,offset){
 const node={uuid:id,name:'Spline '+id,parent:root,
   worldMatrix:mat(offset),position:v(offset),
   rotation:{...q},scale:v(1,1,1),components:[],children:[],
   isValid:true};
 const knots=[0,5,10].map((x,i)=>{
   const kNode={uuid:id+'-k'+i,parent:node,isValid:true,position:v(x),
     rotation:{...q},children:[],components:[]};
   const knot={kind:'Splines.SplineKnot',node:kNode,enabled:true,mode:4,
     tension:1/3,tangentsInKnotSpace:false,
     tangentIn:v(i===0?0:-5/3),tangentOut:v(i===2?0:5/3),
     tangentInHandle:null,tangentOutHandle:null};
   kNode.components=[knot];node.children.push(kNode);
   nodes.set(kNode.uuid,kNode);return knot;
 });
 const spline={kind:'Splines.SplineContainer',node,enabled:true,closed:false,
   reversed:false,dimension:0,samplesPerCurve:32,count:3,
   showGizmos:true,showTangentGizmos:false,gizmoSteps:12,
   get knots(){return this.reversed?[...knots].reverse():knots;},
   getNaturalResolvedKnots(){return knots.map(k=>({
    position:{...k.node.position},tangentIn:{...k.tangentIn},
    tangentOut:{...k.tangentOut},mode:4,
   }));},
   tAtProgress(progress){return progress*progress;},
   evaluateWorldPosition(progress){
     const t=this.tAtProgress(progress);
     return v(node.worldMatrix[12]+10*(this.reversed?1-t:t));
   },
   evaluateTangent(){return v(1);},
 };
 node.components=[spline];root.children.push(node);
 nodes.set(id,node);return spline;
}
const A=spline('a',0),B=spline('b',2.1),C=spline('c',7.6);
function junction(id,one,po,two,pt){
 const node={uuid:id,components:[],children:[],parent:root,isValid:true};
 const link=(s,p)=>({spline:s,progress:p,positionMode:0,distance:0,
   exitDirection:0,getProgress(){return this.progress;}});
 const junction={kind:'Splines.SplineJunction',node,enabled:true,
    connections:[link(one,po),link(two,pt)]};
 node.components=[junction];root.children.push(node);nodes.set(id,node);
 return junction;
}
const J1=junction('j1',A,.5,B,.2);
const J2=junction('j2',B,.8,C,.3);
const adapter=createJunctionScene({
 resolve:id=>nodes.get(id)||null,classOf:c=>c.kind,
 sceneRoot:()=>root,sceneId:()=>root.uuid,
 queryKnotEditFrame:id=>({ok:true,matrix:nodes.get(id).worldMatrix}),
});
const full=adapter.queryMultiJunctionJoinPlan('j1',0,'c','preserve');
assert(!full.ok,/endpoint/.test(full.error));
let plan=adapter.queryMultiJunctionJoinPlan('j1',0,'c',
 'preserve','partial',0,1);
assert(plan.ok,plan.error);
assert.equal(plan.routeMode,'partial');
assert.equal(plan.startSide,0);
assert.equal(plan.goalSide,1);
assert.equal(plan.count,6);
assert.deepEqual(plan.chain.map(s=>[s.fromProgress,s.toProgress]),
 [[0,.5],[.2,.8],[.3,1]]);
near(plan.knots[1].position.x,2.5);
near(plan.knots[3].position.x,8.5);
near(plan.knots[5].position.x,17.6);
assert(adapter.queryMultiJunctionJoinValid('j1',plan.guard).ok);
const before=JSON.stringify([A.getNaturalResolvedKnots(),
 B.getNaturalResolvedKnots(),C.getNaturalResolvedKnots()]);
const smooth=adapter.queryMultiJunctionJoinPlan('j1',0,'c',
 'c1','partial',0,1);
assert(smooth.ok,smooth.error);
assert(smooth.seams.every(x=>x.continuousC1));
assert.equal(JSON.stringify([A.getNaturalResolvedKnots(),
 B.getNaturalResolvedKnots(),C.getNaturalResolvedKnots()]),before);
assert(!adapter.queryMultiJunctionJoinPlan('j1',0,'c',
 'preserve','partial',.5,1).ok);
assert(!adapter.queryMultiJunctionJoinPlan('j1',0,'c',
 'preserve','invalid',0,1).ok);
assert(!adapter.queryMultiJunctionJoinPlan('j1',0,'c',
 'preserve','partial',0,4).ok);
// A reversed Container samples progress in reversed space; the planner
// MUST map tAtProgress back to natural curve t, not take its raw value.
B.reversed=true;
B.node.worldMatrix[12]=-7.1;
B.node.position.x=-7.1;
C.node.worldMatrix[12]=-4.4;
C.node.position.x=-4.4;
const reversed=adapter.queryMultiJunctionJoinPlan('j1',0,'c',
 'preserve','partial',0,0);
assert(reversed.ok,reversed.error);
near(reversed.knots[1].position.x,2.5);
near(reversed.knots[reversed.seams[1].atKnot].position.x,-3.5);
assert(adapter.queryMultiJunctionJoinValid('j1',reversed.guard).ok);
const originalTangent=B.knots[0].tangentOut.x;
B.knots[0].tangentOut.x=originalTangent+2;
assert(!adapter.queryMultiJunctionJoinValid('j1',reversed.guard).ok,
 'Source edits invalidate global Scene lease');
B.knots[0].tangentOut.x=originalTangent;
assert(adapter.queryMultiJunctionJoinValid('j1',reversed.guard).ok);
J2.connections[0].progress=.5;
assert(!adapter.queryMultiJunctionJoinValid('j1',reversed.guard).ok);
J2.connections[0].progress=.8;
root.uuid='scene-B';
assert(!adapter.queryMultiJunctionJoinValid('j1',reversed.guard).ok);
console.log('PARTIAL ROUTE SCENE PASS: source distance → geometric t, reverse, G1/C1, global Scene lease, full-mode compatibility.');
