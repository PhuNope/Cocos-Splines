'use strict';
const assert=require('node:assert/strict');
const {sliceResolvedCubicKnots}=require('../dist/SplineRouteSliceMath');
const {planPartialJunctionChain,planPartialJunctionGeometry,
 planEndpointJunctionChain}=require('../dist/SplineJunctionRouteMath');
const v=(x=0,y=0,z=0)=>({x,y,z});
const m=tx=>[1,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const near=(a,b,eps=1e-8)=>assert(Math.abs(a-b)<=eps,
 String(a)+' differs from '+String(b));
const cubic=(a,b,c,d,t)=>{
 const u=1-t;
 return {
 x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,
 y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y,
 z:u*u*u*a.z+3*u*u*t*b.z+3*u*t*t*c.z+t*t*t*d.z,
 };
};
const knot=(x,ti,to,y=0)=>({
 position:v(x,y),tangentIn:v(ti),tangentOut:v(to),mode:4,
});
const curve=[knot(0,0,3),knot(10,-2,0,4)];
const curveCopy=JSON.stringify(curve);
const src=a=>cubic(curve[0].position,v(3),v(8,4),
 curve[1].position,a);
const clip=sliceResolvedCubicKnots(curve,.2,.8);
assert.equal(clip.length,2);
near(clip[0].position.x,src(.2).x);
near(clip[1].position.x,src(.8).x);
for(const [x,global] of [[0,.2],[.1,.26],[.5,.5],[.9,.74],[1,.8]]){
 const output=cubic(clip[0].position,
  v(clip[0].position.x+clip[0].tangentOut.x,
    clip[0].position.y+clip[0].tangentOut.y),
  v(clip[1].position.x+clip[1].tangentIn.x,
    clip[1].position.y+clip[1].tangentIn.y),
  clip[1].position,x);
 const expected=src(global);
 near(output.x,expected.x);
 near(output.y,expected.y);
}
const reversed=sliceResolvedCubicKnots(curve,.8,.2);
assert.equal(reversed.length,2);
near(reversed[0].position.x,clip[1].position.x);
near(reversed[1].position.x,clip[0].position.x);
near(reversed[0].tangentOut.x,-clip[1].tangentIn.x);
near(reversed[1].tangentIn.x,-clip[0].tangentOut.x);
assert.equal(JSON.stringify(curve),curveCopy);
assert.throws(()=>sliceResolvedCubicKnots(curve,.2,.2),/distinct/);
assert.throws(()=>sliceResolvedCubicKnots(curve,NaN,.8),/distinct/);
assert.throws(()=>sliceResolvedCubicKnots(curve,-.1,.8),/distinct/);
assert.throws(()=>sliceResolvedCubicKnots([knot(0,0,1)],0,.5),/2–128/);
const triple=[knot(0,0,3),knot(5,-2,2),knot(10,-2,0)];
const tripleCut=sliceResolvedCubicKnots(triple,.25,.75);
assert.equal(tripleCut.length,3,'Crossing one interior Knot preserves two exact trimmed segments');
const huge=Array.from({length:128},(_,i)=>knot(i,-1,1));
assert.equal(sliceResolvedCubicKnots(huge,.0001,.9999).length,128);
// Full-span slicing retains input count; it must not invent extra Knots.

const l=(junctionId,linkIndex,splineId,progress,x)=>({
 junctionId,linkIndex,splineId,progress,world:v(x),
});
const links=[
 l('j1',0,'a',.5,2.5),l('j1',1,'b',.2,2.5),
 l('j2',0,'b',.8,8.5),l('j2',1,'c',.3,8.5),
];
const graphCopy=JSON.stringify(links);
const plan=planPartialJunctionChain(links,
 {junctionId:'j1',linkIndex:0},'c',0,1);
assert.equal(plan.routeMode,'partial');
assert.deepEqual(plan.path.map(x=>[x.splineId,x.fromProgress,x.toProgress]),
 [['a',0,.5],['b',.2,.8],['c',.3,1]]);
assert.equal(plan.switchCount,2);
assert.deepEqual(plan.junctionIds,['j1','j2']);
const backward=planPartialJunctionChain(links,
 {junctionId:'j1',linkIndex:0},'c',1,0);
assert.deepEqual(backward.path.map(x=>[x.fromProgress,x.toProgress]),
 [[1,.5],[.2,.8],[.3,0]]);
assert.throws(()=>planEndpointJunctionChain(links,
 {junctionId:'j1',linkIndex:0},'c'),/exact-endpoint|endpoint-only/);
assert.throws(()=>planPartialJunctionChain(links,
 {junctionId:'j1',linkIndex:0},'c',.5,1),/direction/);
assert.throws(()=>planPartialJunctionChain(links,
 {junctionId:'j1',linkIndex:0},'a'),/different/);
assert.throws(()=>planPartialJunctionChain(links.slice(0,3),
 {junctionId:'j1',linkIndex:0},'c'),/No partial route/);
assert.throws(()=>planPartialJunctionChain([...links,l('j2',0,'z',.7,8.5)],
 {junctionId:'j1',linkIndex:0},'c'),/Duplicate/);
assert.throws(()=>planPartialJunctionChain([...links.slice(0,3),l('j2',1,'c',.3,8.6)],
 {junctionId:'j1',linkIndex:0},'c'),/No partial route/);
assert.equal(JSON.stringify(links),graphCopy);
const descriptor=(offset,fromProgress,toProgress)=>({
 dimension:0,matrix:m(offset),knots:[
   knot(0,0,5/3),knot(5,-5/3,5/3),knot(10,-5/3,0),
 ],
 fromProgress,toProgress,
 fromT:fromProgress*fromProgress,toT:toProgress*toProgress,
});
const descr=[descriptor(0,0,.5),descriptor(2.1,.2,.8),
 descriptor(7.6,.3,1)];
const immutable=JSON.stringify(descr);
let joined=planPartialJunctionGeometry(plan.path,descr);
assert.equal(joined.routeMode,'partial');
assert.equal(joined.seamMode,'preserve');
assert.equal(joined.count,6);
assert.deepEqual(joined.seams.map(x=>x.atKnot),[1,3]);
near(joined.knots[0].position.x,0);
near(joined.knots[1].position.x,2.5);
near(joined.knots[3].position.x,8.5);
near(joined.knots[joined.count-1].position.x,17.6);
joined=planPartialJunctionGeometry(plan.path,descr,'c1');
assert.equal(joined.seamMode,'c1');
assert(joined.seams.every(x=>x.continuousC1));
assert.equal(JSON.stringify(descr),immutable);
assert.throws(()=>planPartialJunctionGeometry(plan.path,
 descr.map(x=>({...x,fromT:x.toT}))),/orientation/);
assert.throws(()=>planPartialJunctionGeometry(plan.path,
 descr.map((x,i)=>i===1?{...x,toT:.65}:x)),/Snap/);
console.log('PARTIAL ROUTE MATH PASS: de Casteljau exact trim, reversal, intermediate spans, progress/t separation, C1, safe limits.');
