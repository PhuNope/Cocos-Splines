'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'profile-world-uv-'));
const model=require(root+'/dist/SplineGeometryProfileEditor.js');
const v=(x,y,z)=>({x,y,z});
const square={format:'cocos-splines/profile',version:1,points:[
 {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},
]};
const frames=[0,2].map(distance=>({
 position:v(0,0,distance),right:v(1,0,0),up:v(0,1,0),
 forward:v(0,0,1),widthFactor:1,distance,
}));
const identity=[1,0,0,0,1,0,0,0,1],wide=[2,0,0,0,1,0,0,0,1];
const shear=[1,0,0,1,1,0,0,0,1];
const uv={uMetersPerRepeat:2,sideIslandMode:1};
const world={...uv,uWorldSpace:true};
const opts=(profileUV,worldUvLinear)=>({
 profile:square.points,profileUV,width:2,height:1,profileShape:0,
 uvMetersPerRepeat:2,capEnds:true,worldUvLinear,
});
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,String(a)+' != '+String(b));
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json',
  '--noEmit','false','--outDir',temp],{stdio:'pipe'});
 const {parseGraphProfileAsset,buildProfileExtrudeGeometry}=require(
  temp+'/Core/SplineProfileExtrudeMath.js');
 const {compileGeometryGraph,GeometryGraphRunner}=require(
  temp+'/Core/SplineGeometryGraph.js');
 const local=buildProfileExtrudeGeometry(frames,opts(uv),false);
 const metric=buildProfileExtrudeGeometry(frames,opts(world,wide),false);
 const metricIdentity=buildProfileExtrudeGeometry(frames,opts(world,identity),false);
 assert.deepEqual(metricIdentity,local,'Identity world space equals local metric U');
 assert.deepEqual(metric.positions,local.positions,'World UV never changes local positions');
 assert.deepEqual(metric.indices,local.indices);
 assert.deepEqual(metric.normals,local.normals);
 assert.deepEqual(metric.uvs.slice(frames.length*4*4),
  local.uvs.slice(frames.length*4*4),'Caps keep their original local UV');
 near(local.uvs[2],1);near(metric.uvs[2],2);
 near(metric.uvs[frames.length*4+2],.5,'Height axis retains its world size');
 near(metric.uvs[1],0);near(metric.uvs[5],1);
 const skew=buildProfileExtrudeGeometry(frames,opts(world,shear),false);
 near(skew.uvs[2],1);
 near(skew.uvs[frames.length*4+2],Math.SQRT2/2);
 const strong=frames.map((f,i)=>({...f,widthFactor:i+1}));
 const tapered=buildProfileExtrudeGeometry(strong,opts(world,wide),false);
 near(tapered.uvs[2],2);
 near(tapered.uvs[6],4);
 assert.deepEqual(tapered.uvs.slice(frames.length*4*4),
  metric.uvs.slice(frames.length*4*4));
 const both=buildProfileExtrudeGeometry(strong,
  opts({...world,uFollowFrameScale:true},wide),false);
 assert.deepEqual(both,tapered,'World space supersedes frame-local U without double scaling');
 // For a renderer with nonuniform world scale, local basis vectors may have
 // inverse scale. World metric must cancel it; V is already world arc distance.
 const inverseFrames=frames.map(f=>({
  ...f,right:v(.5,0,0),up:v(0,1,0),
 }));
 const compensated=buildProfileExtrudeGeometry(inverseFrames,opts(world,wide),false);
 near(compensated.uvs[2],1);
 near(compensated.uvs[5],1);
 assert.deepEqual(compensated.uvs,metricIdentity.uvs,
  'Physical UV unaffected when local inverse basis and world matrix cancel');
 for(const bad of [null,[],[1,0,0],[...wide,0],
  [Infinity,0,0,0,1,0,0,0,1],
  [NaN,0,0,0,1,0,0,0,1],
  [1e8,0,0,0,1,0,0,0,1]]){
  assert.throws(()=>buildProfileExtrudeGeometry(frames,opts(world,bad),false),/world-space mode/);
 }
 assert.deepEqual(buildProfileExtrudeGeometry(frames,opts(uv),false),
  buildProfileExtrudeGeometry(frames,opts(uv,[1,2,3]),false),
  'Legacy/local U does not require a world matrix');
 assert.throws(()=>buildProfileExtrudeGeometry(frames,opts(world),false),
  /world-space mode/);
 const quad={...world,sideIslandMode:2};
 const quadOut=buildProfileExtrudeGeometry(frames,opts(quad,wide),false);
 near(quadOut.uvs[2],2);
 near(quadOut.uvs[5],1);
 near(quadOut.uvs[7],1);
 assert.deepEqual(quadOut.uvs.slice(4*4*2),
  metric.uvs.slice(4*frames.length*4),'Quad and edge mode cap UVs remain independent');
 // Strict runtime/editor JsonAsset schema parity and opt-in semantics.
 for(const flag of [0,1,null,NaN,'true',{},[]]){
  const profile={...square,uv:{...uv,uWorldSpace:flag}};
  assert.throws(()=>parseGraphProfileAsset(profile),/Graph Profile Asset UV/);
  assert.throws(()=>model.parseProfile(profile),/Profile UV/);
 }
 assert.throws(()=>parseGraphProfileAsset({...square,uv:{uWorldSpace:true}}),
  /Graph Profile Asset UV/);
 assert.throws(()=>model.parseProfile({...square,uv:{uWorldSpace:true}}),
  /Profile UV/);
 const profileJson=model.formatProfile({...square,uv});
 assert.throws(()=>model.applyProfileEdit(profileJson,'set-u-world-space',
  {enabled:'true'}),/Profile UV/);
 let edit=model.applyProfileEdit(profileJson,'set-u-world-space',{enabled:true});
 assert.equal(model.parseProfile(edit).uv.uWorldSpace,true);
 assert.match(model.renderProfileControls(edit,0,0),/World-space side U/);
 assert.match(model.renderProfileControls(edit,0,0),/World-space meters/);
 assert.deepEqual(parseGraphProfileAsset(model.parseProfile(edit)).uv,world);
 const off=model.applyProfileEdit(edit,'set-u-world-space',{enabled:false});
 assert.equal(off,profileJson,'Turning off world U fully preserves authored metrics');
 edit=model.applyProfileEdit(edit,'clear-u-meters-per-repeat');
 assert.deepEqual(model.parseProfile(edit).uv,{sideIslandMode:1},
  'Clearing metric U must clear world-space flag and all metric-only flags');
 assert.throws(()=>model.applyProfileEdit(model.formatProfile(square),
  'set-u-world-space',{enabled:true}),/Profile UV/);
 const graph={version:2,nodes:[
  {id:'source',type:'spline'},
  {id:'meshA',type:'extrude',input:'source',width:2,height:1,profileSlot:0},
  {id:'meshB',type:'extrude',input:'source',width:2,height:1,profileSlot:1},
  {id:'outA',type:'output',input:'meshA'},
  {id:'outB',type:'output',input:'meshB'},
 ],output:'outA'};
 const runner=new GeometryGraphRunner(),plan=compileGeometryGraph(graph);
 const ctx={frames,closed:false,revision:'source-1',
  profileSources:[square.points,square.points],
  profileUVs:[uv,world],
  profileRevisions:[JSON.stringify({...square,uv}),JSON.stringify({...square,uv:world})],
  worldUvLinear:identity};
 const baseline=runner.evaluateOutputs(plan,ctx);
 assert.deepEqual(runner.metrics,{computed:5,reused:0,nodes:5});
 runner.evaluateOutputs(plan,ctx);
 assert.deepEqual(runner.metrics,{computed:0,reused:5,nodes:5});
 const wideOut=runner.evaluateOutputs(plan,{...ctx,worldUvLinear:wide});
 assert.deepEqual(runner.metrics,{computed:2,reused:3,nodes:5},
  'Only opted-in Extrude B and output B recompute with a different world matrix');
 assert.deepEqual(wideOut.outA,baseline.outA);
 assert.deepEqual(wideOut.outB.positions,baseline.outB.positions);
 assert.notDeepEqual(wideOut.outB.uvs,baseline.outB.uvs);
 near(wideOut.outB.uvs[2],2);
 const stable=JSON.stringify(wideOut);
 assert.throws(()=>runner.evaluateOutputs(plan,{...ctx,worldUvLinear:[0]}),
  /world-space mode/);
 assert.equal(JSON.stringify(runner.evaluateOutputs(plan,{...ctx,worldUvLinear:wide})),stable,
  'Bad world transform must never poison previous valid mesh cache');
 assert.deepEqual(runner.metrics,{computed:0,reused:5,nodes:5});
 assert(require(root+'/package.json').scripts.test.includes(
  'geometry-profile-uv-world-space-v2.test.cjs'));
 console.log('PROFILE WORLD UV V2 PASS: renderer world scale/shear, frame taper, quad cap UV, pure Core cache and strict profile schema.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
