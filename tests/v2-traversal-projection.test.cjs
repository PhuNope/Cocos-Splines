'use strict';
/** Original geometry for follower/projector workflows found in Dreamteck,
 * Curvy and SplineArchitect reference ZIPs. No vendor source is copied. */
const assert=require('node:assert/strict'),os=require('node:os'),
 fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const target=fs.mkdtempSync(path.join(os.tmpdir(),'spline-v2-consumers-'));
const near=(a,b,e=.005)=>assert(Math.abs(a-b)<=e,`expected ${a} ~= ${b}`);
const v=(x,y=0,z=0)=>({x,y,z});
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
  '--rootDir',path.join(root,'src-v2'),'--outDir',target,
  path.join(root,'src-v2/core/SplineTraversal.ts'),
  path.join(root,'src-v2/core/SplineProjection.ts')],{stdio:'pipe'});
 const {advanceSplineDistanceV2:advance,normalizedSplineDistanceV2:progress}=
  require(path.join(target,'core/SplineTraversal.js'));
 const {projectPointOnSplineV2:project,distanceAtParameterV2:distanceAt}=
  require(path.join(target,'core/SplineProjection.js'));
 const {buildSplineCacheV2}=require(path.join(target,'core/SplineCache.js'));
 assert.deepEqual(advance(10,{distance:9,direction:1},4,'clamp'),{
  distance:10,direction:1,reachedStart:false,reachedEnd:true});
 assert.deepEqual(advance(10,{distance:1,direction:-1},4,'clamp'),{
  distance:0,direction:-1,reachedStart:true,reachedEnd:false});
 near(advance(10,{distance:9,direction:1},5,'loop').distance,4);
 near(advance(10,{distance:2,direction:-1},5,'loop').distance,7);
 let state=advance(10,{distance:8,direction:1},5,'pingpong');
 near(state.distance,7);assert.equal(state.direction,-1);
 state=advance(10,state,4,'pingpong');
 near(state.distance,3);assert.equal(state.direction,-1);
 state=advance(10,state,9,'pingpong');
 near(state.distance,6);assert.equal(state.direction,1);
 state=advance(10,{distance:2,direction:-1},28,'pingpong');
 near(state.distance,6);assert.equal(state.direction,1);
 state=advance(10,{distance:9,direction:1},1,'pingpong');
 assert.equal(state.direction,-1);near(state.distance,10);
 assert.equal(progress(10,5),.5);
 assert.equal(progress(0,5),0);
 assert.throws(()=>advance(10,{distance:2,direction:1},-1,'loop'),/non-negative/);
 assert.throws(()=>advance(-1,{distance:2,direction:1},1,'loop'),/length/);
 assert.throws(()=>advance(10,{distance:2,direction:0},1,'loop'),/state/);
 assert.throws(()=>advance(10,{distance:2,direction:1},1,'skip'),/wrap/);
 const linear=buildSplineCacheV2({
  type:'linear',closed:false,knots:[{position:v(0)},{position:v(10)}]
 });
 const q=project(linear,v(4,3,0));
 near(q.parameter,.4,1e-4);near(q.distanceAlong,4,.005);
 near(q.distanceFromPoint,3,.005);
 near(q.position.x,4,.005);assert.equal(q.segmentIndex,0);
 const low=project(linear,v(-4,2,0));
 near(low.parameter,0,1e-8);
 const high=project(linear,v(14,2,0));
 near(high.parameter,1,1e-8);
 const world=project(linear,v(15,4),{
  transformPosition:p=>v(p.x*3,p.y*2,p.z)
 });
 near(world.position.x,5,.005);
 near(world.distanceFromPoint,4,.005);
 near(distanceAt(linear,.75),7.5,.005);
 near(distanceAt(linear,1),10,.005);
 assert.throws(()=>project(linear,v(NaN)),/finite/);
 assert.throws(()=>project(linear,v(2),{subdivisions:3}),/subdivisions/);
 assert.throws(()=>project(linear,v(2),{candidates:65}),/candidates/);
 assert.throws(()=>project(linear,v(2),{
  transformPosition:()=>v(Infinity)}),/transform/);
 // A curved Bezier has multiple local slopes. Test a known interior
 // on-curve point and its nearest answer, not the chord midpoint.
 const curve=buildSplineCacheV2({type:'bezier',closed:false,
  knots:[
   {position:v(0),handleOut:v(0,0,10)},
   {position:v(10),handleIn:v(0,0,10)}
  ]});
 const {evaluateSplineV2}=require(path.join(target,'core/SplineCurves.js'));
 const t=.37,pt=evaluateSplineV2(curve.spline,t).position;
 const hit=project(curve,pt,{subdivisions:28,candidates:20});
 near(hit.parameter,t,.003);
 near(hit.distanceFromPoint,0,1e-4);
 // Three-dimensional nearest point; z-offset tests nonplanar search.
 const point3d=project(curve,v(pt.x,5,pt.z));
 near(point3d.parameter,t,.015);
 const closed=buildSplineCacheV2({type:'linear',closed:true,knots:[
  {position:v(0,0,0)},{position:v(10,0,0)},
  {position:v(10,0,10)},{position:v(0,0,10)}
 ]});
 const seam=project(closed,v(-1,0,1));
 near(seam.position.x,0,.02);
 near(seam.position.z,1,.02);
 assert(seam.distanceAlong>=0&&seam.distanceAlong<=closed.length);
 // Bounded coarse search on user-authored huge Knot counts.
 const points=Array.from({length:130},(_,i)=>({position:v(i)}));
 assert.throws(()=>project(buildSplineCacheV2({
  type:'linear',closed:false,knots:points
 }),v(5),{subdivisions:128}),/budget/);
 console.log('V2 PROJECTION+TRAVERSAL PASS: World metric, Bezier, seam, Speed/Duration distance primitives, PingPong multiple bounces.');
}finally{fs.rmSync(target,{recursive:true,force:true});}
