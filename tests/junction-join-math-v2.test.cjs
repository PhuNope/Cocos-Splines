'use strict';
const assert=require('node:assert/strict');
const {planJunctionJoin}=require('../dist/SplineJunctionJoinMath');
const v=(x=0,y=0,z=0)=>({x,y,z});
const m=(scale=1,tx=0,ty=0)=>[scale,0,0,0,0,1,0,0,0,0,1,0,tx,ty,0,1];
const near=(a,b,eps=1e-7)=>assert(Math.abs(a-b)<eps,a+' != '+b);
const knot=(p,iv=-1,ov=1)=>({
    position:v(p),tangentIn:v(iv),tangentOut:v(ov),
});
const source=(knots,matrix,progress=1,reversed=false,dimension=0)=>({
    knots:knots.map(k=>({...k,position:{...k.position},
        tangentIn:{...k.tangentIn},tangentOut:{...k.tangentOut}})),
    matrix:[...matrix],progress,reversed,dimension,
});
const a=source([knot(0),knot(5),knot(10)],m(),1);
const b=source([knot(0),knot(5),knot(10)],m(2,10),0);
const frozen=JSON.stringify([a,b]);
let join=planJunctionJoin(a,b);
assert.deepEqual(join.knots.map(k=>k.position.x),[0,5,10,20,30]);
assert.equal(join.count,5);
near(join.knots[2].tangentIn.x,-1);
near(join.knots[2].tangentOut.x,2);
assert.equal(join.knots[2].mode,4);
assert.equal(join.gap,0);
assert.equal(join.closed,false);
assert.equal(join.reversed,false);
assert.equal(join.continuousC1,false);
assert.equal(JSON.stringify([a,b]),frozen,'Never mutate input descriptors');
const equalSource=source([knot(0),knot(5),knot(10)],m(1,10),0);
join=planJunctionJoin(a,equalSource);
assert(join.continuousC1,'Equal derivative vectors make a C1 seam');
assert.equal(join.angleDeg,0);
// Source progress=0: A should travel from natural end toward natural start.
// Target progress=1: B should travel from natural end toward natural start.
const backA=source([knot(0),knot(5),knot(10)],m(),0);
const backB=source([knot(0),knot(5),knot(10)],m(1,-10),1);
join=planJunctionJoin(backA,backB);
assert.deepEqual(join.knots.map(k=>k.position.x),[10,5,0,-5,-10]);
near(join.knots[0].tangentOut.x,-(-1));
near(join.knots[2].tangentIn.x,-1); // Reversed A incoming = negative original A outgoing
near(join.knots[2].tangentOut.x,-(-1)); // Reversed B outgoing = negative old incoming
// Reversed=true changes which natural endpoint is at progress 0.
const ra=source([knot(0),knot(5),knot(10)],m(),0,true);
const rb=source([knot(0),knot(5),knot(10)],m(1,10),1,true);
join=planJunctionJoin(ra,rb);
assert.deepEqual(join.knots.map(k=>k.position.x),[0,5,10,15,20]);
const scaledA=source([knot(0),knot(5),knot(10)],m(2,4),1);
const translatedB=source([knot(0),knot(3),knot(8)],m(3,24),0);
join=planJunctionJoin(scaledA,translatedB);
assert.deepEqual(join.knots.map(k=>k.position.x),[0,5,10,14.5,22]);
near(join.knots[2].tangentOut.x,1.5);
// Identity target metadata never leaks into new output knots.
assert(join.knots.every(k=>Object.keys(k).sort().join(',')===
    'mode,position,tangentIn,tangentOut'));
assert.throws(()=>planJunctionJoin(a,source(b.knots,m(2,10.3),0)),/Snap/);
assert.throws(()=>planJunctionJoin(a,b,NaN),/tolerance/);
assert.throws(()=>planJunctionJoin(a,source(b.knots,m(0,10),0)),/singular/);
assert.throws(()=>planJunctionJoin(a,{...b,dimension:1}),/dimension/);
const xy=source([knot(0),knot(5),knot(10)],m(),1,false,1);
const tilted=source([knot(0),knot(5),knot(10)],m(1,10),0,false,1);
tilted.knots[1].position.z=2;
assert.throws(()=>planJunctionJoin(xy,tilted),/planes/);
const huge=source(Array.from({length:66},(_,i)=>knot(i*10/65)),m(),1);
const hugeTarget=source(Array.from({length:66},(_,i)=>knot(i*10/65)),m(1,10),0);
assert.throws(()=>planJunctionJoin(huge,hugeTarget),/128-Knot/);
assert.equal(huge.knots.length,66);
console.log('JUNCTION JOIN MATH PASS: C0/C1, 0/1 direction, reverse, affine scales, source isolation, invalid cases.');
