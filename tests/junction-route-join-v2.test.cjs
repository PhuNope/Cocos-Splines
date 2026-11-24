'use strict';
const assert=require('node:assert/strict');
const {planEndpointJunctionChain,planMultiJunctionGeometry}=
 require('../dist/SplineJunctionRouteMath');
const {createJunctionScene}=require('../dist/SplineJunctionScene');
const v=(x=0,y=0,z=0)=>({x,y,z}),q={x:0,y:0,z:0,w:1};
const mat=(tx=0,sx=1)=>[sx,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const geom=(tx=0,progress=1,sx=1)=>({
 progress,reversed:false,dimension:0,matrix:mat(tx,sx),
 knots:[0,5,10].map(x=>({position:v(x),
    tangentIn:v(-1),tangentOut:v(1)})),
});
const l=(junctionId,linkIndex,splineId,progress,x)=>({
 junctionId,linkIndex,splineId,progress,world:v(x),
});
const links=[
 l('j1',0,'a',1,10),l('j1',1,'b',0,10),
 l('j2',0,'b',1,20),l('j2',1,'c',0,20),
];
const original=JSON.stringify(links);
let chain=planEndpointJunctionChain(links,{junctionId:'j1',linkIndex:0},'c');
assert.deepEqual(chain.path.map(p=>[p.splineId,p.progress]),
 [['a',1],['b',0],['c',0]]);
assert.equal(chain.switchCount,2);
assert.deepEqual(chain.junctionIds,['j1','j2']);
const descriptor=[geom(0,1),geom(10,0),geom(20,0)];
const before=JSON.stringify(descriptor);
let joined=planMultiJunctionGeometry(chain.path,descriptor);
assert.equal(joined.count,7);
assert.deepEqual(joined.knots.map(k=>k.position.x),[0,5,10,15,20,25,30]);
assert.deepEqual(joined.seams.map(s=>s.atKnot),[2,4]);
assert.deepEqual(joined.sourceSplineUuids,['a','b','c']);
assert.equal(joined.switchCount,2);
assert.equal(JSON.stringify(descriptor),before,'Source geometry remains unchanged');
assert.equal(JSON.stringify(links),original);
// Scale on the middle input must preserve world end/tangent lengths.
const scaled=[
 l('j1',0,'a',1,10),l('j1',1,'b',0,10),
 l('j2',0,'b',1,30),l('j2',1,'c',0,30),
];
const transformed=planEndpointJunctionChain(scaled,{junctionId:'j1',linkIndex:0},'c');
joined=planMultiJunctionGeometry(transformed.path,
 [geom(0,1),geom(10,0,2),geom(30,0)]);
assert.deepEqual(joined.knots.map(k=>k.position.x),[0,5,10,20,30,35,40]);
assert.equal(joined.knots[2].tangentOut.x,2);
// Backwards travel through two Junctions reverses every cubic exactly.
const backward=[
 l('j1',0,'a',0,0),l('j1',1,'b',1,0),
 l('j2',0,'b',0,-10),l('j2',1,'c',1,-10),
];
chain=planEndpointJunctionChain(backward,{junctionId:'j1',linkIndex:0},'c');
assert.deepEqual(chain.path.map(p=>p.progress),[0,1,1]);
joined=planMultiJunctionGeometry(chain.path,
 [geom(0,0),geom(-10,1),geom(-20,1)]);
assert.deepEqual(joined.knots.map(k=>k.position.x),[10,5,0,-5,-10,-15,-20]);
// Unsafe graph inputs reject before any geometry / Editor writes.
assert.throws(()=>planEndpointJunctionChain(links,{junctionId:'j1',linkIndex:0},'a'),/different/);
assert.throws(()=>planEndpointJunctionChain(links.slice(0,2),
 {junctionId:'j1',linkIndex:0},'b'),/No endpoint-only route/);
assert.throws(()=>planEndpointJunctionChain([
 ...links.slice(0,2),l('j1',2,'b',1,20),l('j1',3,'c',0,20),
],{junctionId:'j1',linkIndex:0},'c'),/No endpoint-only route/);
assert.throws(()=>planEndpointJunctionChain([
 ...links.slice(0,2),l('j2',0,'b',.5,15),links[3],
],{junctionId:'j1',linkIndex:0},'c'),/No endpoint-only route/);
assert.throws(()=>planEndpointJunctionChain([
 ...links.slice(0,3),l('j2',1,'c',0,21),
],{junctionId:'j1',linkIndex:0},'c'),/No endpoint-only route/);
assert.throws(()=>planEndpointJunctionChain([
 ...links,l('j2',1,'duplicate',0,20),
],{junctionId:'j1',linkIndex:0},'c'),/Duplicate/);
assert.throws(()=>planEndpointJunctionChain(links,{
 junctionId:'j1',linkIndex:0},'z'),/No endpoint-only route/);
assert.throws(()=>planMultiJunctionGeometry(chain.path,
 [geom(0,0),geom(-10,1)]),/3 to 8|orientation|unique/);
assert.throws(()=>planMultiJunctionGeometry(chain.path,
 [geom(0,1),geom(-10,1),geom(-20,1)]),/orientation/);
assert.throws(()=>planMultiJunctionGeometry(chain.path,
 [geom(0,0),geom(-10,1),geom(-19,1)]),/Snap/);
const giant=geom(0,1);
giant.knots=Array.from({length:60},(_,i)=>({
 position:v(i*10/59),tangentIn:v(-1),tangentOut:v(1),
}));
const giantMid=geom(10,0),giantEnd=geom(20,0);
giantMid.knots=giant.knots.map(p=>({...p,position:{...p.position}}));
giantEnd.knots=giantMid.knots.map(p=>({...p,position:{...p.position}}));
assert.throws(()=>planMultiJunctionGeometry(transformed.path,
 [giant,giantMid,giantEnd]),/128-Knot/);

const root={uuid:'scene-1',isValid:true,components:[],children:[]};
const map=new Map([[root.uuid,root]]);
function mockSpline(id,offset){
 const node={uuid:id,name:'Spline '+id,parent:root,isValid:true,
   position:v(offset),rotation:{...q},scale:v(1,1,1),
   worldMatrix:mat(offset),components:[],children:[]};
 const knots=[0,5,10].map((x,i)=>{
   const n={uuid:id+'-k'+i,parent:node,isValid:true,position:v(x),
     rotation:{...q},components:[],children:[]};
   const knot={kind:'Splines.SplineKnot',node:n,enabled:true,mode:4,
     tension:1/3,tangentsInKnotSpace:false,tangentIn:v(-1),tangentOut:v(1),
     tangentInHandle:null,tangentOutHandle:null};
   n.components=[knot];node.children.push(n);map.set(n.uuid,n);return knot;
 });
 const spline={kind:'Splines.SplineContainer',node,enabled:true,
   closed:false,reversed:false,dimension:0,samplesPerCurve:16,count:3,
   showGizmos:true,showTangentGizmos:false,gizmoSteps:16,
   get knots(){return this.reversed?[...knots].reverse():knots;},
   getNaturalResolvedKnots(){return knots.map(k=>({
     position:{...k.node.position},tangentIn:{...k.tangentIn},
     tangentOut:{...k.tangentOut}}));},
   evaluateWorldPosition(p){return v(node.worldMatrix[12]+
     10*(this.reversed?1-p:p));},
   evaluateTangent(){return v(1);},
 };
 node.components=[spline];root.children.push(node);map.set(id,node);return spline;
}
const A=mockSpline('a',0),B=mockSpline('b',10),C=mockSpline('c',20);
function junction(id,s1,p1,s2,p2){
 const node={uuid:id,parent:root,isValid:true,components:[],children:[]};
 const link=(s,progress)=>({spline:s,progress,positionMode:0,
   distance:0,exitDirection:0,getProgress(){return this.progress;}});
 const j={kind:'Splines.SplineJunction',node,enabled:true,
   connections:[link(s1,p1),link(s2,p2)]};
 node.components=[j];root.children.push(node);map.set(id,node);return j;
}
const J1=junction('j1',A,1,B,0),J2=junction('j2',B,1,C,0);
const adapter=createJunctionScene({
 resolve:id=>map.get(id)||null,classOf:c=>c.kind,sceneId:()=>root.uuid,
 sceneRoot:()=>root,
 queryKnotEditFrame:id=>({ok:true,matrix:map.get(id).worldMatrix}),
});
const p=adapter.queryMultiJunctionJoinPlan('j1',0,'c');
assert(p.ok,p.error);
assert.equal(p.count,7);assert.equal(p.switchCount,2);
assert.equal(p.parentUuid,'scene-1');
assert.deepEqual(p.knots.map(k=>k.position.x),[0,5,10,15,20,25,30]);
assert(adapter.queryMultiJunctionJoinValid('j1',p.guard).ok);
C.knots[1].tangentOut.x=9;
assert(!adapter.queryMultiJunctionJoinValid('j1',p.guard).ok,
 'Changed distant spline source invalidates global lease');
C.knots[1].tangentOut.x=1;
assert(adapter.queryMultiJunctionJoinValid('j1',p.guard).ok);
J2.connections[1].progress=1;
assert(!adapter.queryMultiJunctionJoinValid('j1',p.guard).ok);
assert(!adapter.queryMultiJunctionJoinPlan('j1',0,'c').ok);
J2.connections[1].progress=0;
root.uuid='scene-2';
assert(!adapter.queryMultiJunctionJoinValid('j1',p.guard).ok);
root.uuid='scene-1';
J2.enabled=false;
assert(!adapter.queryMultiJunctionJoinPlan('j1',0,'c').ok);
J2.enabled=true;
const D=mockSpline('d',10);
junction('j3',B,0,D,0);
assert(!adapter.queryMultiJunctionJoinValid('j1',p.guard).ok,
 'Adding an active Junction invalidates entire Scene route');
console.log('MULTI-JUNCTION ROUTE MATH/SCENE PASS: endpoint graph, deterministic orientations, Bezier preservation, global guard.');
