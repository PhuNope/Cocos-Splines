'use strict';
const assert=require('node:assert/strict');
const {createJunctionScene}=require('../dist/SplineJunctionScene');
const v=(x=0,y=0,z=0)=>({x,y,z});
const m=(tx=0)=>[1,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const scene={uuid:'scene-1'};
const nodes=new Map();
function knot(id,root,x){
 const node={uuid:id,isValid:true,parent:root,position:v(x),
   rotation:{x:0,y:0,z:0,w:1},components:[]};
 const comp={kind:'Splines.SplineKnot',node,mode:4,tension:1/3,tangentsInKnotSpace:false,
   tangentIn:v(-3),tangentOut:v(0,2),tangentInHandle:null,tangentOutHandle:null};
 node.components.push(comp);nodes.set(id,node);return comp;
}
function spline(id,offset){
 const node={uuid:id,isValid:true,parent:scene,worldMatrix:m(offset)};
 const knots=[knot(id+'-0',node,0),knot(id+'-1',node,10)];
 return {kind:'Splines.SplineContainer',node,enabled:true,closed:false,reversed:false,
   dimension:0,samplesPerCurve:32,count:2,
   get knots(){return this.reversed?[...knots].reverse():knots;},
   getNaturalResolvedKnots(){return knots.map(k=>({
     position:k.node.position,tangentIn:k.tangentIn,tangentOut:k.tangentOut,
     mode:k.mode,tension:k.tension,
   }));},
   evaluateWorldPosition(progress){
     const p=this.reversed?1-progress:progress;
     return v(knots[0].node.position.x*(1-p)+knots[1].node.position.x*p+node.worldMatrix[12]);
   },
   evaluateTangent(){return v(1);},
 };
}
const a=spline('a',0),b=spline('b',10);
const link=(s,p)=>({spline:s,progress:p,distance:0,positionMode:0,exitDirection:0,
 getProgress(){return this.progress;}});
const junctionNode={uuid:'junction',isValid:true,parent:scene,components:[]};
const junction={kind:'Splines.SplineJunction',node:junctionNode,enabled:true,
 connections:[link(a,1),link(b,0)]};
junctionNode.components.push(junction);nodes.set('junction',junctionNode);
const adapter=createJunctionScene({
 resolve:uuid=>nodes.get(uuid)||null,
 classOf:c=>c.kind,
 queryKnotEditFrame:uuid=>({ok:true,matrix:(uuid==='a'?a:b).node.worldMatrix}),
 sceneId:()=>scene.uuid,
});
let plan=adapter.queryJunctionTangentPlan('junction',0,1,'g1','same');
assert(plan.ok,plan.error);
assert.equal(plan.writeUuid,'b-0');
assert.equal(plan.writePath,'__comps__.0.tangentOut');
assert.equal(plan.side,'out');
assert.deepEqual(plan.before,v(0,2));
assert.deepEqual(plan.after,v(2));
assert.equal(plan.changed,true);
let state=adapter.queryJunctionTangentState('junction',plan.guard,'b-0','out');
assert(state.ok,state.error);assert.deepEqual(state.value,v(0,2));
b.knots[0].tangentOut=v(2);
state=adapter.queryJunctionTangentState('junction',plan.guard,'b-0','out');
assert(state.ok,state.error);
assert.deepEqual(state.value,v(2),'guard excludes deliberate target side only');
b.knots[0].tangentOut=v(0,2);
b.knots[0].tangentIn.y=1;
assert(!adapter.queryJunctionTangentState('junction',plan.guard,'b-0','out').ok,
 'Unrelated target side mutation must invalidate');
b.knots[0].tangentIn.y=0;
const c1=adapter.queryJunctionTangentPlan('junction',0,1,'c1','same');
assert(c1.ok,c1.error);assert.deepEqual(c1.after,v(3));
const reversed=adapter.queryJunctionTangentPlan('junction',0,1,'g1','opposed');
assert(reversed.ok,reversed.error);assert.deepEqual(reversed.after,v(-2));
const target=b.knots[0];
const handle={uuid:'handle-out',parent:target.node,isValid:true,position:v(0,2)};
nodes.set(handle.uuid,handle);
target.tangentOutHandle=handle;
plan=adapter.queryJunctionTangentPlan('junction',0,1,'g1');
assert(plan.ok,plan.error);
assert.equal(plan.writeUuid,'handle-out');
assert.equal(plan.writePath,'position');
handle.position=v(2);
assert(adapter.queryJunctionTangentState('junction',plan.guard,'b-0','out').ok,
 'Handle position is the deliberate changed field');
handle.parent=b.node;
assert(!adapter.queryJunctionTangentPlan('junction',0,1,'g1').ok,
 'Foreign tangent handles must be rejected');
handle.parent=target.node;target.tangentOutHandle=null;
b.reversed=true;b.node.worldMatrix[12]=0;
// When reversed, first evaluator knot is natural last; start link uses
// its original tangentIn (not tangentOut), with +progress tangent direction.
junction.connections[1].progress=0;
plan=adapter.queryJunctionTangentPlan('junction',0,1,'g1');
assert(plan.ok,plan.error);assert.equal(plan.targetKnotUuid,'b-1');
assert.equal(plan.side,'in');
assert.equal(plan.writePath,'__comps__.0.tangentIn');
b.reversed=false;b.node.worldMatrix[12]=10;
const obsolete=adapter.queryJunctionTangentPlan('junction',0,1,'g1');
assert(obsolete.ok,obsolete.error);
scene.uuid='scene-2';
assert(!adapter.queryJunctionTangentState('junction',obsolete.guard,'b-0','out').ok,
 'Scene switch must cancel serialized edit');
scene.uuid='scene-1';
a.knots[1].tangentIn=v(-8);
assert(!adapter.queryJunctionTangentState('junction',obsolete.guard,'b-0','out').ok,
 'Source handle changed');
a.knots[1].tangentIn=v(-3);
target.mode=0;
assert(!adapter.queryJunctionTangentPlan('junction',0,1,'g1').ok,
 'AutoSmooth must be explicit Broken before writing tangent');
target.mode=4;
junction.connections[1].progress=.4;
assert(!adapter.queryJunctionTangentPlan('junction',0,1,'g1').ok);
junction.connections[1].progress=0;
b.node.worldMatrix[12]=10.25;
assert(!adapter.queryJunctionTangentPlan('junction',0,1,'g1').ok,'Position gap must be snapped first');
b.node.worldMatrix[12]=10;
console.log('JUNCTION TANGENT SCENE PASS: G1/C1, reversible endpoint sides, handles, stale guards, Broken-only, gap preflight.');
