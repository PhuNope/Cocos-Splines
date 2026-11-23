'use strict';
const assert=require('node:assert/strict');
const {planCopiedKnot,inverseRotate,finiteQuat}=require('../dist/SplineTopologyCopyMath');
const v=(x=0,y=0,z=0)=>({x,y,z});
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<=tol,String(a)+' != '+String(b));
function rotate(q,p){
    const x=q.x,y=q.y,z=q.z,w=q.w;
    const a=2*(y*p.z-z*p.y),b=2*(z*p.x-x*p.z),c=2*(x*p.y-y*p.x);
    return {x:p.x+w*a+y*c-z*b,y:p.y+w*b+z*a-x*c,z:p.z+w*c+x*b-y*a};
}
const q={x:0,y:0,z:Math.sin(Math.PI/4),w:Math.cos(Math.PI/4)};
const fitted={position:v(5,0,0),tangentIn:v(-2,3,0),tangentOut:v(4,-1,0)};
const meta={name:'original',rotation:q,handleIn:true,handleOut:true,
    tangentsInKnotSpace:false,editTangentHandles:true,tension:.43};
const source=JSON.stringify({fitted,meta});
let copy=planCopiedKnot(fitted,meta);
assert(copy.handleIn&&copy.handleOut);
assert(copy.editTangentHandles);
assert.equal(copy.tension,.43);
for(const field of ['tangentIn','tangentOut']){
    const expected=fitted[field],actual=rotate(q,copy[field]);
    for(const axis of ['x','y','z'])near(actual[axis],expected[axis]);
}
assert.equal(JSON.stringify({fitted,meta}),source,'No source edits');
const mixed=planCopiedKnot(fitted,{...meta,handleIn:false,handleOut:true});
assert.deepEqual(mixed.tangentIn,fitted.tangentIn,'No inverse rotation for Container-space field');
for(const axis of ['x','y','z'])near(rotate(q,mixed.tangentOut)[axis],fitted.tangentOut[axis]);
const knotSpace=planCopiedKnot(fitted,{...meta,handleIn:false,handleOut:false,
    tangentsInKnotSpace:true,editTangentHandles:true});
assert(knotSpace.tangentsInKnotSpace&&!knotSpace.editTangentHandles);
for(const field of ['tangentIn','tangentOut'])
    for(const axis of ['x','y','z'])near(rotate(q,knotSpace[field])[axis],fitted[field][axis]);
const direct=planCopiedKnot(fitted,{...meta,handleIn:false,handleOut:false,
    tangentsInKnotSpace:false});
assert.deepEqual(direct.tangentIn,fitted.tangentIn);
assert.deepEqual(direct.tangentOut,fitted.tangentOut);
assert(finiteQuat(q));
assert(!finiteQuat({x:0,y:0,z:0,w:0}));
assert.throws(()=>inverseRotate({x:0,y:0,z:0,w:0},v(1)),/Invalid/);
assert.throws(()=>planCopiedKnot(fitted,{...meta,tension:-1}),/Invalid/);
assert.throws(()=>planCopiedKnot(fitted,{...meta,handleOut:'old-uuid'}),/Invalid/);
assert.throws(()=>planCopiedKnot({...fitted,tangentIn:v(Infinity)},meta),/Invalid/);
console.log('TOPOLOGY COPY PASS: knot-space vs container-space, fresh handle payload, rotations, validation.');
