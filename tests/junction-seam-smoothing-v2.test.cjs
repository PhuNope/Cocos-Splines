'use strict';
const assert=require('node:assert/strict');
const {validateSeamMode,smoothJunctionSeam}=require('../dist/SplineJunctionSeamMath');
const {planJunctionJoin}=require('../dist/SplineJunctionJoinMath');
const {planJunctionFanout}=require('../dist/SplineJunctionFanoutMath');
const {planMultiJunctionGeometry}=require('../dist/SplineJunctionRouteMath');
const v=(x=0,y=0,z=0)=>({x,y,z});
const matrix=tx=>[1,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const near=(a,b,eps=1e-6)=>assert(Math.abs(a-b)<eps,String(a)+' !== '+String(b));
const beforeIn=v(-2),beforeOut=v(1,1);
const frozen=JSON.stringify([beforeIn,beforeOut]);
assert.equal(validateSeamMode('preserve'),'preserve');
for(const mode of ['none','C1',null,undefined,{},'g2'])
 assert.throws(()=>validateSeamMode(mode),/Invalid Join seam mode/);
const preserved=smoothJunctionSeam(beforeIn,beforeOut);
assert.deepEqual(preserved.tangentOut,beforeOut);
assert.deepEqual(preserved.tangentIn,beforeIn);
assert.equal(preserved.seamMode,'preserve');
assert.equal(preserved.adjusted,false);
near(preserved.angleDeg,45);
const g1=smoothJunctionSeam(beforeIn,beforeOut,'g1');
assert.deepEqual(g1.tangentIn,beforeIn);
near(g1.tangentOut.x,Math.SQRT2);
near(g1.tangentOut.y,0);
near(g1.angleDeg,0);
near(g1.beforeAngleDeg,45);
assert(g1.adjusted);
assert(!g1.continuousC1,'G1 retains original outgoing magnitude');
const c1=smoothJunctionSeam(beforeIn,beforeOut,'c1');
assert.deepEqual(c1.tangentOut,v(2));
assert.equal(c1.continuousC1,true);
assert.equal(c1.angleDeg,0);
near(c1.beforeAngleDeg,45);
assert.equal(JSON.stringify([beforeIn,beforeOut]),frozen,'Pure smoothing never mutates sources');
assert.throws(()=>smoothJunctionSeam(v(),v(1),'g1'),/zero-length/);
assert.throws(()=>smoothJunctionSeam(v(-1),v(),'c1'),/zero-length/);
assert.deepEqual(smoothJunctionSeam(v(),v(),'preserve').tangentOut,v());
assert.throws(()=>smoothJunctionSeam(v(NaN),v(1)),/finite/);
assert.throws(()=>smoothJunctionSeam(v(-1),v(1),'bad'),/Invalid/);

const make=(tx,progress,initialOut=v(1),finalIn=v(-1))=>({
 matrix:matrix(tx),dimension:0,reversed:false,progress,
 knots:[0,5,10].map((x,i)=>({
  position:v(x),
  tangentIn:i===2?{...finalIn}:v(-1),
  tangentOut:i===0?{...initialOut}:v(1),
 })),
});
const a=make(0,1,v(1),v(-2)),b=make(10,0,v(1,1));
const sources=JSON.stringify([a,b]);
let joined=planJunctionJoin(a,b);
assert.equal(joined.seamMode,'preserve');
near(joined.angleDeg,45);
assert.deepEqual(joined.knots[2].tangentOut,v(1,1));
joined=planJunctionJoin(a,b,1e-5,'g1');
assert.equal(joined.seamMode,'g1');
assert(joined.seamAdjusted);
near(joined.knots[2].tangentOut.x,Math.SQRT2);
near(joined.knots[2].tangentOut.y,0);
near(joined.knots[2].tangentIn.x,-2);
near(joined.beforeAngleDeg,45);
near(joined.angleDeg,0);
assert(!joined.continuousC1);
joined=planJunctionJoin(a,b,1e-5,'c1');
assert.deepEqual(joined.knots[2].tangentOut,v(2));
assert(joined.continuousC1);
assert.deepEqual(joined.knots.map(k=>k.position.x),[0,5,10,15,20]);
assert.equal(JSON.stringify([a,b]),sources);
assert.throws(()=>planJunctionJoin(a,b,1e-5,'bad'),/Invalid Join seam/);
const zero=make(10,0,v());
assert.throws(()=>planJunctionJoin(a,zero,1e-5,'g1'),/zero-length/);
assert.equal(planJunctionJoin(a,zero).count,5,'Preserve allows degenerate source curves');

let fan=planJunctionFanout(a,[{index:1,source:b},{index:2,source:make(10,0,v(2,2))}],'c1');
assert.equal(fan.seamMode,'c1');
assert.equal(fan.routeCount,2);
assert.deepEqual(fan.routes.map(r=>r.seamMode),['c1','c1']);
for(const r of fan.routes){
 assert.deepEqual(r.knots[2].tangentOut,v(2));
 assert.equal(r.continuousC1,true);
 near(r.angleDeg,0);
}
assert.equal(JSON.stringify([a,b]),sources);
assert.throws(()=>planJunctionFanout(a,[{index:1,source:b},{index:2,source:zero}],'c1'),/zero-length/);
fan=planJunctionFanout(a,[{index:1,source:b},{index:2,source:zero}]);
assert.equal(fan.seamMode,'preserve');

const path=[
 {splineId:'a',progress:1,junctionId:'j1',linkIndex:0},
 {splineId:'b',progress:0,junctionId:'j1',linkIndex:1},
 {splineId:'c',progress:0,junctionId:'j2',linkIndex:1},
];
const c=make(20,0,v(1,1));
const sourceChain=JSON.stringify([a,b,c]);
let multi=planMultiJunctionGeometry(path,[a,b,c],'c1');
assert.equal(multi.seamMode,'c1');
assert.deepEqual(multi.seams.map(s=>s.atKnot),[2,4]);
assert.deepEqual(multi.seams.map(s=>s.seamMode),['c1','c1']);
assert.deepEqual(multi.knots[2].tangentOut,v(2));
assert.deepEqual(multi.knots[4].tangentOut,v(1));
assert(multi.seams.every(s=>s.angleDeg<1e-5&&s.continuousC1));
assert.equal(JSON.stringify([a,b,c]),sourceChain);
multi=planMultiJunctionGeometry(path,[a,b,c],'g1');
assert.equal(multi.seamMode,'g1');
assert(multi.seams.every(s=>s.angleDeg<1e-5));
multi=planMultiJunctionGeometry(path,[a,b,c]);
assert.equal(multi.seamMode,'preserve');
assert.equal(multi.seams[0].seamMode,'preserve');
assert.deepEqual(multi.knots[2].tangentOut,v(1,1));
assert.throws(()=>planMultiJunctionGeometry(path,[a,b,c],'G1'),/Invalid/);
// Reversed physical traversal still applies smoothing after sign inversion.
const ra=make(0,0),rb=make(-10,1,v(1,1));
ra.knots[0].tangentOut=v(3);
rb.knots[2].tangentIn=v(-1,-1);
const reversed=planJunctionJoin(ra,rb,1e-5,'c1');
assert.deepEqual(reversed.knots.map(k=>k.position.x),[10,5,0,-5,-10]);
assert(reversed.continuousC1);
console.log('JUNCTION SEAM SMOOTHING MATH PASS: preserve, G1, C1, degenerate, fan-out, multi-seam, reverse, source isolation.');
