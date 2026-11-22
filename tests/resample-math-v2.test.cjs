'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const project=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-resample-math-'));
try{
 cp.execFileSync('tsc',['-p',path.join(project,'tsconfig.runtime.json'),
  '--noEmit','false','--outDir',tmp]);
 const {resampleSpline}=require(path.join(tmp,'Core/SplineResampleMath.js'));
 const M=require(path.join(tmp,'Core/SplineMath.js'));
 const v=(x=0,y=0,z=0)=>({x,y,z}),linear=(x)=>({
  position:v(x),tangentIn:v(),tangentOut:v(),mode:1,
 });
 const options=(mode,target,tolerance=0.25,space='local')=>({mode,target,tolerance,space});
 const near=(a,b,tol=1e-5)=>assert(Math.abs(a-b)<=tol,String(a)+' != '+String(b));
 const straight=[linear(0),linear(4)];
 let result=resampleSpline(straight,false,options('count',9,0.0001));
 assert.equal(result.count,9);assert.equal(result.knots.length,9);
 assert(result.estimatedMaxError<0.0001);
 near(result.actualSpacing,.5);
 for(let i=0;i<9;i++){
  near(result.knots[i].position.x,i/2);
  near(result.knots[i].position.y,0);
  assert.equal(result.knots[i].mode,4);
 }
 const last=result.knots.at(-1);
 near(last.tangentOut.x,0);
 near(result.knots[0].tangentIn.x,0);
 assert(straight.every(k=>k.mode===1),'No source tangent modes changed');
 result=resampleSpline(straight,false,options('spacing',1,.0001));
 assert.equal(result.count,5);
 near(result.actualSpacing,1);
 const world=p=>({x:2*p.x,y:3*p.y,z:4*p.z});
 result=resampleSpline(straight,false,options('spacing',1,.0001,'world'),world);
 assert.equal(result.count,9,'World scale doubles curve length and changes count');
 near(result.sourceLength,8);
 near(result.knots[4].position.x,2);

 const rounded=[
  {position:v(0,0),tangentIn:v(0,0),tangentOut:v(1,3),mode:4},
  {position:v(5,0),tangentIn:v(-1,3),tangentOut:v(0,0),mode:4},
 ];
 result=resampleSpline(rounded,false,options('count',12,.25));
 assert.equal(result.knots.length,12);assert(result.estimatedMaxError<=.25);
 near(result.knots[0].position.x,0);near(result.knots.at(-1).position.x,5);
 assert(result.knots.some(k=>Math.abs(k.position.y)>.1));
 const original=M.buildArcLUT(rounded,false,128);
 near(result.sourceLength,original.total,.01);

 const closed=[linear(0),linear(4),{position:v(4,4),tangentIn:v(),tangentOut:v(),mode:1},
  {position:v(0,4),tangentIn:v(),tangentOut:v(),mode:1}];
 result=resampleSpline(closed,true,options('count',16,1));
 assert.equal(result.count,16);assert(result.closed);
 assert(result.knots.every(k=>Number.isFinite(k.tangentIn.x)&&Number.isFinite(k.tangentOut.y)));
 near(result.knots[0].position.x,0);near(result.knots[0].position.y,0);
 near(result.actualSpacing,result.sourceLength/16);

 const corner=[linear(0),linear(2),{position:v(2,5),tangentIn:v(),tangentOut:v(),mode:1},
  {position:v(5,5),tangentIn:v(),tangentOut:v(),mode:1}];
 assert.throws(()=>resampleSpline(corner,false,options('count',2,0.0001)),/deviation|tolerance/);
 assert.throws(()=>resampleSpline(straight,false,options('count',1,.1)),/Knot count/);
 assert.throws(()=>resampleSpline(straight,false,options('count',129,.1)),/Knot count/);
 assert.throws(()=>resampleSpline(straight,true,options('count',2,.1)),/Knot count/);
 assert.throws(()=>resampleSpline(straight,false,options('count',3.5,.1)),/integer/);
 assert.throws(()=>resampleSpline(straight,false,options('spacing',0,.1)),/spacing/);
 assert.throws(()=>resampleSpline(straight,false,options('count',5,0)),/tolerance/);
 assert.throws(()=>resampleSpline(straight,false,options('count',5,.1,'invalid')),/metric/);
 assert.throws(()=>resampleSpline([linear(0),linear(0)],false,options('count',3,.1)),/zero-length/);
 assert.throws(()=>resampleSpline([linear(0),{...linear(2),position:v(NaN)}],false,options('count',3,.1)),/finite/);
 assert.throws(()=>resampleSpline(straight,false,options('count',3,.1),()=>v(Infinity)),/invalid|non-finite/);
 // Valid projected XY/XZ inputs retain their projected inactive axis.
 const xy=[linear(0),{position:v(3,4,0),tangentIn:v(),tangentOut:v(),mode:1}];
 result=resampleSpline(xy,false,options('count',6,.1));
 assert(result.knots.every(k=>k.position.z===0&&k.tangentIn.z===0&&k.tangentOut.z===0));

 console.log('RESAMPLE MATH PASS: Count/spacing, affine World length, curved fit, closed seam, tolerance, finite/2D guards.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
