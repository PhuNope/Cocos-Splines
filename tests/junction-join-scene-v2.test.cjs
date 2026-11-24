'use strict';
const assert=require('node:assert/strict');
const {createJunctionScene}=require('../dist/SplineJunctionScene');
const v=(x=0,y=0,z=0)=>({x,y,z}),q={x:0,y:0,z:0,w:1};
const matrix=(tx=0,scale=1)=>[scale,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const scene={uuid:'scene-1',isValid:true},registry=new Map();
function spline(id,offset,scale=1){
 const node={uuid:id,name:'Spline '+id,parent:scene,isValid:true,
   position:v(offset),rotation:{...q},scale:v(scale,1,1),
   worldMatrix:matrix(offset,scale),components:[],children:[]};
 const knots=[0,5,10].map((x,i)=>{
   const n={uuid:id+'-k'+i,parent:node,isValid:true,position:v(x),
      rotation:{...q},components:[],children:[]};
   const k={kind:'Splines.SplineKnot',node:n,enabled:true,mode:4,
      tension:1/3,tangentIn:v(-1),tangentOut:v(1),
      tangentsInKnotSpace:false,tangentInHandle:null,tangentOutHandle:null};
   n.components=[k];node.children.push(n);registry.set(n.uuid,n);return k;
 });
 const value={kind:'Splines.SplineContainer',node,closed:false,reversed:false,
   enabled:true,dimension:0,samplesPerCurve:32,count:3,
   showGizmos:true,showTangentGizmos:false,gizmoSteps:16,
   get knots(){return this.reversed?[...knots].reverse():knots;},
   getNaturalResolvedKnots(){return knots.map(k=>({
     position:{...k.node.position},tangentIn:{...k.tangentIn},
     tangentOut:{...k.tangentOut},mode:4}));},
   evaluateWorldPosition(progress){
     return v(node.worldMatrix[12]+node.worldMatrix[0]*10*(this.reversed?1-progress:progress));
   },
   evaluateTangent(){return v(1);}};
 node.components=[value];registry.set(id,node);return value;
}
const a=spline('a',0),b=spline('b',10);
const node={uuid:'junction',parent:scene,isValid:true,components:[]};
const link=(s,progress)=>({spline:s,progress,positionMode:0,distance:0,
 exitDirection:0,getProgress(){return this.progress;}});
const junction={kind:'Splines.SplineJunction',node,enabled:true,
 connections:[link(a,1),link(b,0)]};
node.components=[junction];registry.set('junction',node);
const adapter=createJunctionScene({
 resolve:uuid=>registry.get(uuid)||null,classOf:c=>c.kind,
 queryKnotEditFrame:uuid=>({ok:true,matrix:(uuid==='a'?a:b).node.worldMatrix}),
 sceneId:()=>scene.uuid,
});
let p=adapter.queryJunctionJoinPlan('junction',0,1);
assert(p.ok,p.error);
assert.equal(p.count,5);
assert.equal(p.parentUuid,scene.uuid);
assert.equal(p.junctionUuid,node.uuid);
assert.deepEqual(p.knots.map(k=>k.position.x),[0,5,10,15,20]);
assert.deepEqual(p.rootTransform.position,v(0));
assert.equal(p.containerAppearance.showGizmos,true);
assert(adapter.queryJunctionJoinValid('junction',p.guard).ok);
a.knots[0].tangentOut.x=3;
assert(!adapter.queryJunctionJoinValid('junction',p.guard).ok,
 'Mutating a source Knot invalidates the scene lease');
a.knots[0].tangentOut.x=1;
assert(adapter.queryJunctionJoinValid('junction',p.guard).ok);
scene.uuid='scene-2';
assert(!adapter.queryJunctionJoinValid('junction',p.guard).ok);
scene.uuid='scene-1';
b.node.worldMatrix[12]=12;
assert(!adapter.queryJunctionJoinPlan('junction',0,1).ok,
 'Separated endpoints must be snapped before joining');
b.node.worldMatrix[12]=10;
junction.connections[1].progress=.5;
assert(!adapter.queryJunctionJoinPlan('junction',0,1).ok);
junction.connections[1].progress=0;
b.closed=true;assert(!adapter.queryJunctionJoinPlan('junction',0,1).ok);b.closed=false;
b.dimension=1;assert(!adapter.queryJunctionJoinPlan('junction',0,1).ok);b.dimension=0;
b.reversed=true;b.node.worldMatrix[12]=0;
p=adapter.queryJunctionJoinPlan('junction',0,1);
assert(p.ok,p.error);
assert.deepEqual(p.knots.map(k=>k.position.x),[0,5,10,5,0]);
b.reversed=false;b.node.worldMatrix[12]=10;
console.log('JUNCTION JOIN SCENE PASS: independent geometry, resolved tangents, version guard, endpoint policy, reverse.');
