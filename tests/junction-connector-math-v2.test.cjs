'use strict';
const assert=require('node:assert/strict');
const {worldTangent,analyzeConnections,planEndpointSnap}=require('../dist/SplineConnectionMath');
const v=(x=0,y=0,z=0)=>({x,y,z});
const mat=(x=0,y=0,z=0)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const nearly=(a,b)=>assert(Math.abs(a-b)<1e-6,String(a)+' != '+String(b));
const entries=[
 {index:0,position:v(1,2),tangent:v(1,0)},
 {index:2,position:v(1.02,2),tangent:v(-1,0)},
 {index:5,position:v(3,2),tangent:v(0,1)},
];
const result=analyzeConnections(entries,.1,15);
assert.equal(result.pairCount,3);
assert.equal(result.positionFailures,2);
assert.equal(result.tangentFailures,2);
assert.equal(result.pairs[0].orientation,'opposed');
nearly(result.pairs[0].axisAngleDeg,0);
nearly(result.pairs[1].axisAngleDeg,90);
assert.equal(result.pairs[0].positionOK,true);
assert.equal(result.pairs[1].positionOK,false);
const rotated=worldTangent(v(1,0),[0,1,0,0,-1,0,0,0,0,0,1,0,0,0,0,1]);
nearly(rotated.x,0);nearly(rotated.y,1);
assert.equal(worldTangent(v(),mat()),null);
assert.equal(analyzeConnections([{index:0,position:v(),tangent:v()},
 {index:1,position:v(),tangent:v(1)}]).tangentFailures,1);
const direct=planEndpointSnap({anchorWorld:v(12,4,7),targetLocal:v(2,0,0),
 worldMatrix:mat(10,4,7),progress:0,closed:false,dimension:0});
assert.deepEqual(direct.after,v(2,0,0));
assert.equal(direct.changed,false);
const moved=planEndpointSnap({anchorWorld:v(12,4,7),targetLocal:v(0,0,0),
 worldMatrix:mat(10,4,7),progress:1,closed:false,dimension:0});
assert.deepEqual(moved.after,v(2,0,0));
assert.equal(moved.changed,true);
const planar=planEndpointSnap({anchorWorld:v(5,3,0),targetLocal:v(0,0,9),
 worldMatrix:mat(),progress:0,closed:false,dimension:1});
assert.deepEqual(planar.after,v(5,3,9),'hidden local axis must remain untouched');
assert.throws(()=>planEndpointSnap({anchorWorld:v(5,3,1),targetLocal:v(),
 worldMatrix:mat(),progress:0,closed:false,dimension:1}),/plane/);
assert.throws(()=>planEndpointSnap({anchorWorld:v(),targetLocal:v(),
 worldMatrix:mat(),progress:.2,closed:false,dimension:0}),/start\/end/);
assert.throws(()=>planEndpointSnap({anchorWorld:v(),targetLocal:v(),
 worldMatrix:mat(),progress:0,closed:true,dimension:0}),/Invalid/);
assert.throws(()=>planEndpointSnap({anchorWorld:v(),targetLocal:v(),
 worldMatrix:Array(16).fill(0),progress:0,closed:false,dimension:0}),/singular|affine/i);
assert.throws(()=>analyzeConnections(entries.map(e=>({...e,index:0}))),/duplicate/);
assert.throws(()=>analyzeConnections(entries,.1,91),/tolerances/);
console.log('JUNCTION CONNECTOR MATH PASS: gaps, tangent axes, 2D plane, world-to-local, closed/interior guards.');
