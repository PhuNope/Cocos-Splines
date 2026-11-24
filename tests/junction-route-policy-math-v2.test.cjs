'use strict';
const assert=require('node:assert/strict');
const {costRoute,validateRoutePolicy,exitPermits}=
 require('../dist/SplineJunctionRouteCost');
const v=x=>({x,y:0,z:0});
const L=(junctionId,linkIndex,splineId,progress,x,arc,total,
 exitDirection=0,trafficSignal=0)=>({
 junctionId,linkIndex,splineId,progress,world:v(x),
 worldArc:arc,worldTotal:total,exitDirection,trafficSignal,
});
assert.equal(validateRoutePolicy(),'ignore');
for(const p of ['ignore','direction','direction-green'])
 assert.equal(validateRoutePolicy(p),p);
for(const p of ['green','all',null,3])
 assert.throws(()=>validateRoutePolicy(p),/Invalid Join route policy/);
assert.equal(exitPermits({exitDirection:0},1,1,'direction'),true);
assert.equal(exitPermits({exitDirection:0},1,-1,'direction'),false);
assert.equal(exitPermits({exitDirection:1},-1,1,'direction'),true);
assert.equal(exitPermits({exitDirection:2},1,-1,'direction'),true);
assert.equal(exitPermits({exitDirection:2},1,1,'direction'),false);
assert.equal(exitPermits({exitDirection:1,trafficSignal:1},1,1,'direction-green'),false);
assert.equal(exitPermits({exitDirection:1,trafficSignal:2},1,1,'direction-green'),false);
assert.equal(exitPermits({exitDirection:1,trafficSignal:0},1,1,'direction-green'),true);
assert.throws(()=>exitPermits({exitDirection:9},1,1,'direction'),/exitDirection/);
const links=[
 L('j1',0,'a',1,10,10,10),L('j1',1,'b',0,10,0,10),
 L('j2',0,'b',1,20,10,10),L('j2',1,'d',0,20,0,6),
 L('j1',2,'c',0,10,0,2),L('j3',0,'c',1,12,2,2),
 L('j3',1,'e',0,12,0,2),L('j4',0,'e',1,14,2,2),
 // Preserve would reverse incoming direction at d's 1 endpoint:
 // explicitly setting Backward makes this exit traversable.
 L('j4',1,'d',1,14,6,6,2),
];
const source=JSON.stringify(links);
const anchor={junctionId:'j1',linkIndex:0};
const plan=(policy,mode='distance',penalty=10)=>
 costRoute(links,anchor,'d',{mode,penalty,routeMode:'full',policy});
assert.deepEqual(plan('direction').path.map(p=>p.splineId),['a','c','e','d']);
assert.deepEqual(plan('direction','switches').path.map(p=>p.splineId),['a','b','d']);
links[1].trafficSignal=1; // B Red: signal-aware must pick C.
assert.deepEqual(plan('direction-green','switches').path.map(p=>p.splineId),
 ['a','c','e','d']);
assert.deepEqual(plan('direction','switches').path.map(p=>p.splineId),
 ['a','b','d'],'Direction-only mode does not filter signal state');
links[4].trafficSignal=2; // C Yellow: both routes blocked.
assert.throws(()=>plan('direction-green'),/No cost-aware/);
links[1].trafficSignal=0;
assert.deepEqual(plan('direction-green','switches').path.map(p=>p.splineId),
 ['a','b','d']);
links[1].trafficSignal=2;
links[4].trafficSignal=0;
links[8].exitDirection=0; // Preserve incoming Forward; goal needs Backward.
assert.throws(()=>plan('direction-green','distance'),/No cost-aware/);
links[8].exitDirection=2;
assert.deepEqual(plan('direction-green','distance').path.map(p=>p.splineId),
 ['a','c','e','d']);
links[4].exitDirection=2; // C says Backward, actual segment requires Forward.
assert.throws(()=>plan('direction-green'),/No cost-aware/);
links[4].exitDirection=1;
assert.deepEqual(plan('direction-green').path.map(p=>p.splineId),
 ['a','c','e','d']);
links[4].exitDirection=0;links[1].trafficSignal=0;
assert.deepEqual(plan('ignore').path.map(p=>p.splineId),['a','c','e','d']);
assert.deepEqual(costRoute(links,anchor,'d',{mode:'balanced',
 penalty:10,policy:'direction'}).path.map(p=>p.splineId),['a','b','d']);
assert.throws(()=>plan('not-policy'),/Invalid Join route policy/);
assert.throws(()=>costRoute(links.map((l,i)=>i===4?
 {...l,trafficSignal:9}:l),anchor,'d',{policy:'direction-green'}),/sampled world arc/);
// Reverse traversal: from the Anchor's end to progress 0,
 // incoming travel direction is Backward. Explicit Forward exit is invalid.
const backward=[
 L('j1',0,'start',0,0,0,10),
 L('j1',1,'mid',1,0,10,10,1),
 L('j2',0,'mid',0,-10,0,10),
 L('j2',1,'goal',1,-10,10,10,2),
];
assert.throws(()=>costRoute(backward,{junctionId:'j1',linkIndex:0},'goal',
 {mode:'switches',policy:'direction'}),/No cost-aware/);
backward[1].exitDirection=0;
assert.deepEqual(costRoute(backward,{junctionId:'j1',linkIndex:0},'goal',
 {mode:'switches',policy:'direction'}).path.map(p=>p.splineId),
 ['start','mid','goal']);
assert.equal(source.includes('"trafficSignal":0'),true);
console.log('JUNCTION ROUTE POLICY MATH PASS: Preserve/Forward/Backward, Red/Yellow gates, distance and switch ranking, reverse traversal.');
