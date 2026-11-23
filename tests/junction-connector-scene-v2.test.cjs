'use strict';
const assert=require('node:assert/strict');
const {createJunctionScene}=require('../dist/SplineJunctionScene');
const v=(x=0,y=0,z=0)=>({x,y,z});
const mat=x=>[1,0,0,0,0,1,0,0,0,0,1,0,x,0,0,1];
const world={uuid:'scene-one'};
const knot=(name,root,x)=>{
 const n={uuid:name,name,parent:root,position:v(x),rotation:{x:0,y:0,z:0,w:1},
  isValid:true};
 return {node:n,mode:4,tension:1/3,tangentsInKnotSpace:false,
  tangentIn:v(-1),tangentOut:v(1),tangentInHandle:null,tangentOutHandle:null};
};
function spline(name,offset){
 const node={uuid:name,parent:world,isValid:true,matrix:mat(offset)};
 const knots=[knot(name+'-start',node,0),knot(name+'-end',node,10)];
 return {kind:'Splines.SplineContainer',node,enabled:true,closed:false,reversed:false,
  dimension:0,samplesPerCurve:32,count:2,get knots(){return knots;},
  evaluateWorldPosition:p=>v(knots[0].node.position.x*(1-p)+knots[1].node.position.x*p+offset),
  evaluateTangent:()=>v(1)};
}
const a=spline('a',0),b=spline('b',5);
const link=(s,p)=>({spline:s,positionMode:0,progress:p,distance:0,
 exitDirection:0,getProgress(){return this.progress;}});
const node={uuid:'junction',parent:world,isValid:true};
const junction={kind:'Splines.SplineJunction',node,enabled:true,
 connections:[link(a,1),link(b,0)]};
node.components=[junction];
const scene=createJunctionScene({
 resolve:id=>id===node.uuid?node:null,
 classOf:c=>c.kind,
 sceneId:()=>world.uuid,
 queryKnotEditFrame:id=>{
  const source=[a,b].find(s=>s.node.uuid===id);
  return source?{ok:true,matrix:source.node.matrix}:{ok:false,error:'unknown'};
 },
});
const report=scene.queryJunctionConnections(node.uuid,.1,15);
assert(report.ok,report.error);
assert.equal(report.validLinks,2);
assert.equal(report.positionFailures,1);
assert.equal(report.tangentFailures,0);
assert.equal(report.pairs[0].gap,5);
assert.equal(scene.queryJunctionConnections('other').ok,false);
let plan=scene.queryJunctionSnapPlan(node.uuid,0,1);
assert(plan.ok,plan.error);
assert.equal(plan.targetKnotUuid,'b-start');
assert.deepEqual(plan.before,v());
assert.deepEqual(plan.after,v(5));
assert.equal(plan.gapBefore,5);
assert(scene.queryJunctionSnapValid(node.uuid,plan.guard,'b-start').ok);
b.knots[0].node.position.x=5;
assert(scene.queryJunctionSnapValid(node.uuid,plan.guard,'b-start').ok,
 'The planned target field must be deliberately excluded from the guard');
b.knots[0].node.position.x=0;
a.knots[1].node.position.x=11;
assert(!scene.queryJunctionSnapValid(node.uuid,plan.guard,'b-start').ok,
 'Source spline geometry changed');
a.knots[1].node.position.x=10;
b.node.matrix[12]=6;
assert(!scene.queryJunctionSnapValid(node.uuid,plan.guard,'b-start').ok,
 'Container world transform changed');
b.node.matrix[12]=5;
junction.connections[1].progress=.5;
assert(!scene.queryJunctionSnapPlan(node.uuid,0,1).ok,
 'Interior marker must never edit Knot geometry');
junction.connections[1].progress=0;
assert(!scene.queryJunctionSnapPlan(node.uuid,0,0).ok);
b.closed=true;
assert(!scene.queryJunctionSnapPlan(node.uuid,0,1).ok,'Closed spline cannot snap endpoint');
b.closed=false;
junction.connections[1].spline=a;
assert(!scene.queryJunctionSnapPlan(node.uuid,0,1).ok,'same spline');
junction.connections[1].spline=b;
b.dimension=1;
a.knots[1].node.position.y=3;
assert(!scene.queryJunctionSnapPlan(node.uuid,0,1).ok,'2D off-plane anchor');
a.knots[1].node.position.y=0;
b.dimension=0;
plan=scene.queryJunctionSnapPlan(node.uuid,0,1);
world.uuid='scene-two';
assert(!scene.queryJunctionSnapValid(node.uuid,plan.guard,'b-start').ok,
 'Scene switch must invalidate pending writes/rollback');
world.uuid='scene-one';
assert(scene.queryJunctionSnapValid(node.uuid,plan.guard,'b-start').ok);
assert.equal(b.knots[0].node.position.x,0,'read-only planning does not move any Knot');
console.log('JUNCTION CONNECTOR SCENE PASS: diagnostics, endpoint plan, 2D/interior/closed guards, revisions, Scene lease.');
