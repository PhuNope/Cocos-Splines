/* v2 engine-independent spline core regression suite. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cocos-splines-v2-'));
try{
  cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict','--outDir',temp,path.resolve(__dirname,'../src-v2/core/SplineCurves.ts')],{stdio:'pipe'});
  const {evaluateSplineV2,buildSplineLengthV2,parameterAtDistanceV2,validateSplineV2,splineSegmentsV2}=require(path.join(temp,'SplineCurves.js'));
  const v=(x,y=0,z=0)=>({x,y,z}), k=(x,y=0,z=0,extra={})=>({position:v(x,y,z),...extra});
  const near=(x,y,e=1e-6)=>assert(Math.abs(x-y)<=e,`${x} differs from ${y}`);
  for(const type of ['linear','bezier','catmull-rom']){
    const s={type,closed:false,knots:[k(0),k(10)]};
    validateSplineV2(s);
    near(evaluateSplineV2(s,.5).position.x,5);
    near(evaluateSplineV2(s,1).position.x,10);
    assert.equal(splineSegmentsV2(s),1);
    const table=buildSplineLengthV2(s);
    near(table.length,10);
    near(parameterAtDistanceV2(table,2.5),.25,1e-4);
    near(parameterAtDistanceV2(table,999),1);
  }
  const curve={type:'bezier',closed:false,knots:[k(0,0,0,{handleOut:v(2,8)}),k(10,0,0,{handleIn:v(-2,8)})]};
  const curveTable=buildSplineLengthV2(curve,.0001);
  assert(curveTable.length>10);
  assert(curveTable.points.length>2,'adaptive samples should refine curved segments');
  const mid=evaluateSplineV2(curve,.5);
  assert(mid.position.y>5 && mid.tangent.x>0);
  const half=parameterAtDistanceV2(curveTable,curveTable.length/2);
  near(half,.5,.01);
  const closed={type:'linear',closed:true,knots:[k(0,0),k(10,0),k(10,10),k(0,10)]};
  assert.equal(splineSegmentsV2(closed),4);
  near(buildSplineLengthV2(closed).length,40);
  near(evaluateSplineV2(closed,1).position.x,0);
  near(evaluateSplineV2(closed,1).position.y,0);
  const degenerate={type:'bezier',closed:false,knots:[k(0),k(0)]};
  const zero=buildSplineLengthV2(degenerate);
  near(zero.length,0);near(parameterAtDistanceV2(zero,2),0);
  assert(Number.isFinite(evaluateSplineV2(degenerate,.8).tangent.x));
  assert.throws(()=>validateSplineV2({type:'linear',closed:false,knots:[k(0)]}),/at least two/);
  assert.throws(()=>validateSplineV2({type:'linear',closed:false,knots:[k(Infinity),k(1)]}),/Non-finite/);
  assert.throws(()=>buildSplineLengthV2(curve,-1),/Tolerance/);
  console.log('V2 CORE PASS: linear, Bezier, Catmull-Rom, adaptive length, closed/degenerate, invalid knot');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
