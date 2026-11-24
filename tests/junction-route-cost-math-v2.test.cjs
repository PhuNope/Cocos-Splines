'use strict';
const assert=require('node:assert/strict');
const {validateRouteCost,measureSplineWorldArc,costRoute}=
  require('../dist/SplineJunctionRouteCost');
const v=(x=0,y=0,z=0)=>({x,y,z});
const near=(x,y,eps=1e-6)=>assert(Math.abs(x-y)<=eps,
  String(x)+' does not match '+String(y));
assert.deepEqual(validateRouteCost(),{mode:'switches',penalty:10});
assert.deepEqual(validateRouteCost('balanced',0),{mode:'balanced',penalty:0});
for(const mode of ['DISTANCE','shortest',null,undefined==='no'?'invalid':42])
  assert.throws(()=>validateRouteCost(mode),/Invalid Join route cost/);
for(const penalty of [-1,100001,NaN,Infinity,'10',null])
  assert.throws(()=>validateRouteCost('balanced',penalty),/switch penalty/);
const quadratic={
 knots:[{},{}],
 evaluateWorldPositionAtT:t=>v(10*t*t,0,0),
 tAtProgress:p=>Math.sqrt(p),
};
const length=measureSplineWorldArc(quadratic);
assert.equal(length.samples,64);
near(length.total,10);
near(length.at(.25),2.5,1e-4);
near(length.at(.81),8.1,1e-3); // chord-interpolated arc lookup is approximate
near(length.at(0),0);
near(length.at(1),10);
assert.throws(()=>length.at(-.1),/progress/);
assert.throws(()=>measureSplineWorldArc({...quadratic,
 tAtProgress:()=>NaN}).at(.4),/geometric/);
assert.throws(()=>measureSplineWorldArc({...quadratic,
 evaluateWorldPositionAtT:()=>v(NaN)}),/invalid position/);
const reverse={knots:[{},{}],
 evaluateWorldPositionAtT:t=>v(10*(1-t)),
 tAtProgress:p=>p};
near(measureSplineWorldArc(reverse).at(.6),6);
const scaled={knots:[{},{}],
 evaluateWorldPositionAtT:t=>v(30*t),
 tAtProgress:p=>p};
near(measureSplineWorldArc(scaled).total,30);

const L=(junctionId,linkIndex,splineId,progress,x,worldArc,worldTotal)=>({
 junctionId,linkIndex,splineId,progress,world:v(x),worldArc,worldTotal,
});
// A→B→D has 2 switches, world distance 26.
// A→C→E→D has 3 switches, world distance 20.
const links=[
 L('j1',0,'a',1,10,10,10),
 L('j1',1,'b',0,10,0,10),
 L('j2',0,'b',1,20,10,10),
 L('j2',1,'d',0,20,0,6),
 L('j1',2,'c',0,10,0,2),
 L('j3',0,'c',1,12,2,2),
 L('j3',1,'e',0,12,0,2),
 L('j4',0,'e',1,14,2,2),
 L('j4',1,'d',1,14,6,6),
];
const anchor={junctionId:'j1',linkIndex:0};
const snapshot=JSON.stringify(links);
let route=costRoute(links,anchor,'d',{mode:'distance'});
assert.deepEqual(route.path.map(x=>x.splineId),['a','c','e','d']);
assert.equal(route.switchCount,3);
near(route.estimatedWorldDistance,20);
near(route.estimatedRouteCost,20);
route=costRoute(links,anchor,'d',{mode:'balanced',penalty:10});
assert.deepEqual(route.path.map(x=>x.splineId),['a','b','d']);
assert.equal(route.switchCount,2);
near(route.estimatedWorldDistance,26);
near(route.estimatedRouteCost,46);
route=costRoute(links,anchor,'d',{mode:'balanced',penalty:0});
assert.deepEqual(route.path.map(x=>x.splineId),['a','c','e','d']);
near(route.estimatedRouteCost,20);
route=costRoute(links,anchor,'d',{mode:'switches'});
assert.deepEqual(route.path.map(x=>x.splineId),['a','b','d']);
route=costRoute([...links].reverse(),anchor,'d',{mode:'distance'});
assert.deepEqual(route.path.map(x=>x.splineId),['a','c','e','d'],
 'Route must not depend on original link array insertion order');
assert.equal(JSON.stringify(links),snapshot,'Planner never mutates Scene data');
// Mid-spline link positions use sampled arc distances, not normalized
// progress multiplied by sampled TOTAL: an arbitrary nonlinear scale.
const partial=[
 L('j1',0,'a',.5,10,10,20),
 L('j1',1,'b',.1,10,1,10),
 L('j2',0,'b',.9,20,9,10),
 L('j2',1,'d',.1,20,1,6),
 L('j1',2,'c',.25,10,.5,2),
 L('j3',0,'c',.75,12,1.5,2),
 L('j3',1,'e',.25,12,.5,2),
 L('j4',0,'e',.75,14,1.5,2),
 L('j4',1,'d',.9,14,5.4,6),
];
route=costRoute(partial,anchor,'d',{mode:'distance',routeMode:'partial',
 startSide:0,goalSide:0});
assert.deepEqual(route.path.map(x=>x.splineId),['a','c','e','d']);
assert.deepEqual(route.path.map(x=>[x.fromProgress,x.toProgress]),
 [[0,.5],[.25,.75],[.25,.75],[.9,0]]);
near(route.estimatedWorldDistance,17.4);
route=costRoute(partial,anchor,'d',{mode:'balanced',penalty:10,
 routeMode:'partial',startSide:0,goalSide:0});
assert.deepEqual(route.path.map(x=>x.splineId),['a','b','d']);
near(route.estimatedWorldDistance,19);
near(route.estimatedRouteCost,39);
assert.throws(()=>costRoute(links,anchor,'d',{mode:'distance',
 routeMode:'invalid'}),/Invalid cost-aware/);
assert.throws(()=>costRoute(links,anchor,'a',{mode:'distance'}),/differ/);
assert.throws(()=>costRoute(links.slice(0,3),anchor,'d',{
 mode:'distance'}),/No cost-aware/);
assert.throws(()=>costRoute([...links,L('j1',0,'z',0,10,0,3)],
 anchor,'d',{mode:'distance'}),/Duplicate/);
assert.throws(()=>costRoute(links.map((l,i)=>i===3?{...l,worldArc:7}:l),
 anchor,'d',{mode:'distance'}),/sampled world arc/);
assert.throws(()=>costRoute(links.map((l,i)=>i===8?{...l,worldTotal:5}:l),
 anchor,'d',{mode:'distance'}),/Inconsistent|sampled world arc/);
console.log('JUNCTION COST MATH PASS: world-arc sampling, shorter-vs-fewer paths, custom penalty, stable tie-breaking, partial, invalid bounds.');
