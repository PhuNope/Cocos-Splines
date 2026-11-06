'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'spline-test-'));
cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--outDir',folder,path.join(root,'assets/splines/Core/SplineMath.ts')],{stdio:'pipe'});
const m=require(path.join(folder,'SplineMath.js'));
function knot(x,y,z,mode=1){return {position:m.v(x,y,z),tangentIn:m.v(-1,0,0),tangentOut:m.v(1,0,0),mode};}
function close(x,y,eps=1e-4){assert(Math.abs(x-y)<=eps,`${x} != ${y}`);}
const line=m.buildArcLUT([knot(0,0,0),knot(10,0,0)],false,32);
close(line.total,10);close(m.sampleNormalizedDistance(line,.35).position.x,3.5,.002);
close(m.parameterAtDistance(line,5),.5);
assert.equal(m.sampleNormalizedDistance(line,1).position.x,10);
assert.equal(m.sample(line.knots,false,0).position.x,0);
const a=m.buildArcLUT([knot(0,0,0),knot(10,0,0),knot(10,10,0)],true);
assert.equal(a.segments,3);close(m.sample(a.knots,true,1).position.x,0);
close(m.sample(a.knots,true,1).position.y,0);
assert(a.total>30);
const cubic=m.buildArcLUT([{position:m.v(),tangentIn:m.v(),tangentOut:m.v(0,5,0),mode:4},{position:m.v(10,0,0),tangentIn:m.v(0,5,0),tangentOut:m.v(),mode:4}],false,128);
assert(cubic.total>10);assert(m.sample(cubic.knots,false,.5).position.y>0);
close(m.sampleNormalizedDistance(cubic,.5).position.x,5,.1);
close(m.sample(line.knots,false,m.nearestParameter(line,m.v(7,4,0))).position.x,7,.03);
const coincident=m.buildArcLUT([knot(0,0,0),knot(0,0,0)],false);close(coincident.total,0);
assert(Number.isFinite(m.sampleNormalizedDistance(coincident,.1).position.x));
const auto=m.resolvedKnots([knot(0,0,0,0),knot(1,1,0,0),knot(3,1,0,0)],false);
assert(auto[1].tangentOut.x>0);assert(auto[1].tangentIn.x<0);
assert(m.resolvedKnots([knot(0,0,0,1),knot(1,1,0,1)],false)[0].tangentOut.x===0);
// De Casteljau splitting must preserve all point positions on both halves.
const curve=[
 {position:m.v(0,0,0),tangentIn:m.v(-2,0,0),tangentOut:m.v(3,5,0),mode:4},
 {position:m.v(8,1,2),tangentIn:m.v(-2,4,-1),tangentOut:m.v(1,1,0),mode:4},
 {position:m.v(12,-1,0),tangentIn:m.v(-1,0,0),tangentOut:m.v(2,0,0),mode:4},
];
const ctrl=m.segment(m.resolvedKnots(curve,false),0,false);
const split=m.splitSegment(curve,false,0,.5);
const left=[ctrl[0],m.add(ctrl[0],split.before.tangentOut),m.add(split.middle.position,split.middle.tangentIn),split.middle.position];
const right=[split.middle.position,m.add(split.middle.position,split.middle.tangentOut),m.add(ctrl[3],split.after.tangentIn),ctrl[3]];
for(let i=0;i<=40;i++){
 const t=i/40,original=m.bezier(...ctrl,t),now=t<=.5?m.bezier(...left,t*2):m.bezier(...right,(t-.5)*2);
 close(m.distance(original,now),0,1e-5);
}
const autoSpline=[knot(0,0,0,0),knot(2,3,0,0),knot(5,1,0,0),knot(7,0,0,0)];
const oldCurve=m.segment(m.resolvedKnots(autoSpline,true),3,true);
const closedSplit=m.splitSegment(autoSpline,true,3);
const l=[oldCurve[0],m.add(oldCurve[0],closedSplit.before.tangentOut),m.add(closedSplit.middle.position,closedSplit.middle.tangentIn),closedSplit.middle.position];
const r=[closedSplit.middle.position,m.add(closedSplit.middle.position,closedSplit.middle.tangentOut),m.add(oldCurve[3],closedSplit.after.tangentIn),oldCurve[3]];
for(let i=0;i<=40;i++){
 const t=i/40,old=m.bezier(...oldCurve,t),now=t<=.5?m.bezier(...l,t*2):m.bezier(...r,(t-.5)*2);
 close(m.distance(old,now),0,1e-5);
}
assert.throws(()=>m.splitSegment(curve,false,2));
fs.rmSync(folder,{recursive:true,force:true});
console.log('TEST PASS: linear/curved/closed/degenerate, AutoSmooth, length, uniform sampling, nearest point.');
