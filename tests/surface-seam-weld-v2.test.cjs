'use strict';
const assert=require('node:assert/strict');
const {prepareSurface,snapOrigins}=require('../src/SplineSurfaceSnapMath');
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const positions=[
  0,0,0, 1,0,0, 0,0,1,
  1,0,0, 0,0,1, 1,.35,1
];
const surface=prepareSurface(positions,[0,2,1,3,4,5],I);
const left={x:.495,y:3,z:.495},right={x:.505,y:3,z:.505};
const hit=(p,opts={})=>snapOrigins(surface,[{uuid:'k',position:p}],{
  alignNormal:true,smoothNormal:true,creaseAngle:60,...opts
})[0];
const gap=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const baselineA=hit(left),baselineB=hit(right);
assert(gap(baselineA.normal,baselineB.normal)>.25,
  'Default must keep split vertices independent');
const weldedA=hit(left,{weldSeams:true}),weldedB=hit(right,{weldSeams:true});
assert(gap(weldedA.normal,weldedB.normal)<gap(baselineA.normal,baselineB.normal)*.25,
  'Weld opt-in smooths UV-split geometrically coincident vertices');
assert.deepEqual(weldedA.position,baselineA.position,'No positional modification');
assert.deepEqual(weldedB.position,baselineB.position,'No positional modification');
const sharpA=hit(left,{weldSeams:true,creaseAngle:0});
const sharpB=hit(right,{weldSeams:true,creaseAngle:0});
assert(gap(sharpA.normal,baselineA.normal)<1e-9,'Crease must preserve sharp side A');
assert(gap(sharpB.normal,baselineB.normal)<1e-9,'Crease must preserve sharp side B');
assert.deepEqual(surface.positions,positions,'Source mesh must stay unchanged');
assert.deepEqual(surface.indices,[0,2,1,3,4,5],'Triangle indices remain untouched');
console.log('SURFACE SEAM WELD V2 PASS: opt-in, crease, no geometry mutation.');
