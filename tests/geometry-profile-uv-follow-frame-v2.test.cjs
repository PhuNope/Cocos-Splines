'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),
 os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'uv-follow-frame-'));
const model=require(root+'/dist/SplineGeometryProfileEditor.js');
const vec=(x,y,z)=>({x,y,z});
const points=[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}];
const source={format:'cocos-splines/profile',version:1,points,
 uv:{seamEdge:2,edgeWeights:[1,2,1,1],uMetersPerRepeat:2}};
const follows={...source,uv:{...source.uv,uFollowFrameScale:true}};
const frames=[
 {position:vec(0,0,0),right:vec(1,0,0),up:vec(0,1,0),
  forward:vec(0,0,1),distance:0,widthFactor:1},
 {position:vec(0,0,3),right:vec(1,0,0),up:vec(0,1,0),
  forward:vec(0,0,1),distance:3,widthFactor:.5},
];
const opts=p=>({width:2,height:1,profileShape:0,profile:p.points,
 profileUV:p.uv,uvMetersPerRepeat:3,capEnds:true});
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,String(a)+' != '+String(b));
const uPair=(g,edge,ring)=>[g.uvs[edge*8+ring*4],g.uvs[edge*8+ring*4+2]];
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json',
  '--noEmit','false','--outDir',temp],{stdio:'pipe'});
 const {parseGraphProfileAsset,buildProfileExtrudeGeometry}=require(
  temp+'/Core/SplineProfileExtrudeMath.js');
 const {compileGeometryGraph,GeometryGraphRunner}=require(
  temp+'/Core/SplineGeometryGraph.js');
 const before=JSON.stringify(follows);
 assert.deepEqual(parseGraphProfileAsset(follows),follows);
 assert.deepEqual(model.parseProfile(follows),follows);
 const old=buildProfileExtrudeGeometry(frames,opts(source),false);
 const mapped=buildProfileExtrudeGeometry(frames,opts(follows),false);
 assert.deepEqual(mapped.positions,old.positions);
 assert.deepEqual(mapped.normals,old.normals);
 assert.deepEqual(mapped.indices,old.indices);
 assert.deepEqual(mapped.uvs.slice(32),old.uvs.slice(32),
  'Caps UV stay identical');
 const expected=[[1.5,2.5],[2.5,3.5],[0,1],[1,1.5]];
 const scaled=[[.75,1.25],[1.25,1.75],[0,.5],[.5,.75]];
 for(let edge=0;edge<4;edge++){
  assert.deepEqual(uPair(old,edge,0),uPair(old,edge,1),
   'Original constant-metric U remains unchanged by taper');
  uPair(mapped,edge,0).forEach((n,j)=>near(n,expected[edge][j]));
  uPair(mapped,edge,1).forEach((n,j)=>near(n,scaled[edge][j]));
  near(mapped.uvs[edge*8+1],0);
  near(mapped.uvs[edge*8+5],1);
 }
 const scaledBasis=[frames[0],{...frames[1],right:vec(2,0,0)}];
 const basis=buildProfileExtrudeGeometry(scaledBasis,opts(follows),false);
 const expectBasis=[[1.25,2.25],[2.25,2.75],[0,1],[1,1.25]];
 expectBasis.forEach((pair,edge)=>
  uPair(basis,edge,1).forEach((n,j)=>near(n,pair[j])));
 assert.deepEqual(basis.positions,
  buildProfileExtrudeGeometry(scaledBasis,opts(source),false).positions);
 for(const invalid of [null,0,1,'true',[],{},NaN]){
  assert.throws(()=>parseGraphProfileAsset({...source,
   uv:{...source.uv,uFollowFrameScale:invalid}}),/Graph Profile Asset UV/);
  assert.throws(()=>model.parseProfile({...source,
   uv:{...source.uv,uFollowFrameScale:invalid}}),/Profile UV/);
 }
 assert.throws(()=>parseGraphProfileAsset({...source,
  uv:{uFollowFrameScale:true}}),/Graph Profile Asset UV/);
 assert.throws(()=>model.parseProfile({...source,
  uv:{uFollowFrameScale:true}}),/Profile UV/);
 const formatted=model.formatProfile(source);
 const enabled=model.applyProfileEdit(formatted,'set-u-follow-frame-scale',
  {enabled:true});
 assert.equal(model.parseProfile(enabled).uv.uFollowFrameScale,true);
 assert.match(model.renderProfileControls(enabled,0,0),/Follow taper \/ frame scale/);
 assert.match(model.renderProfileControls(enabled,0,0),/Frame-local meters/);
 assert.equal(model.applyProfileEdit(enabled,'set-u-follow-frame-scale',
  {enabled:false}),formatted);
 assert.deepEqual(model.parseProfile(model.applyProfileEdit(
  enabled,'clear-u-meters-per-repeat')).uv,
  {seamEdge:2,edgeWeights:[1,2,1,1]});
 assert.throws(()=>model.applyProfileEdit(model.formatProfile({
  ...source,uv:{seamEdge:2}}),'set-u-follow-frame-scale',
  {enabled:true}),/Profile UV/);
 assert.throws(()=>model.applyProfileEdit(formatted,'set-u-follow-frame-scale',
  {enabled:'true'}),/Profile UV/);
 assert.throws(()=>buildProfileExtrudeGeometry([
  frames[0],{...frames[1],widthFactor:0}],opts(follows),false),
  /Graph Profile Asset UV frame/);
 const graph={version:2,nodes:[
  {id:'src',type:'spline'},
  {id:'a',type:'extrude',input:'src',profileSlot:0,width:2,height:1},
  {id:'b',type:'extrude',input:'src',profileSlot:1,width:2,height:1},
  {id:'outA',type:'output',input:'a'},
  {id:'outB',type:'output',input:'b'},
 ],output:'outA'};
 const runner=new GeometryGraphRunner(),compiled=compileGeometryGraph(graph);
 // Graph source currently normalizes widthFactor to 1; use a changing
 // frame right basis to exercise *native Graph* per-frame UV cache effects.
 // The pure Extrude tests above separately prove variable widthFactor taper.
 const ctx={frames:[frames[0],{...frames[1],right:vec(2,0,0)}],
  closed:false,revision:'base',
  profileSources:[points,points],profileUVs:[source.uv,source.uv],
  profileRevisions:[JSON.stringify(source),JSON.stringify(source)]};
 const first=runner.evaluateOutputs(compiled,ctx);
 runner.evaluateOutputs(compiled,ctx);
 assert.deepEqual(runner.metrics,{computed:0,reused:5,nodes:5});
 const changed={...ctx,profileUVs:[source.uv,follows.uv],
  profileRevisions:[ctx.profileRevisions[0],JSON.stringify(follows)]};
 const second=runner.evaluateOutputs(compiled,changed);
 assert.deepEqual(runner.metrics,{computed:2,reused:3,nodes:5});
 assert.deepEqual(second.outA,first.outA);
 assert.deepEqual(second.outB.positions,first.outB.positions);
 assert.notDeepEqual(second.outB.uvs,first.outB.uvs);
 assert.throws(()=>runner.evaluateOutputs(compiled,{
  ...changed,profileUVs:[source.uv,{uFollowFrameScale:true}],
  profileRevisions:[ctx.profileRevisions[0],'invalid']}),/Graph Profile Asset UV/);
 assert.deepEqual(runner.evaluateOutputs(compiled,changed),second);
 assert.equal(JSON.stringify(follows),before);
 assert(require(root+'/package.json').scripts.test.includes(
  'geometry-profile-uv-follow-frame-v2.test.cjs'));
 console.log('FOLLOW FRAME UV V2 PASS: taper and basis aware side U, legacy parity, cap/mesh isolation, validation, draft actions and cache.');
}finally{fs.rmSync(temp,{force:true,recursive:true});}
