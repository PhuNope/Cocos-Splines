'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
 path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-profile-uv-'));
const editor=require(root+'/dist/SplineGeometryProfileEditor.js');
const pt=(x,y,z)=>({x,y,z});
const frames=[0,2].map(z=>({position:pt(0,0,z),forward:pt(0,0,1),
 right:pt(1,0,0),up:pt(0,1,0),widthFactor:1,distance:z}));
const square={format:'cocos-splines/profile',version:1,points:[
 {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},
]};
const uvProfile={...square,uv:{seamEdge:2,edgeWeights:[1,2,1,1]}};
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,a+' != '+b);
const settings=(profile,uv)=>({width:2,height:1,profileShape:0,
 profile:profile.points,profileUV:uv,uvMetersPerRepeat:2,capEnds:true});
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json',
  '--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {parseGraphProfileAsset,buildProfileExtrudeGeometry}=require(
  tmp+'/Core/SplineProfileExtrudeMath.js');
 const {compileGeometryGraph,GeometryGraphRunner}=require(
  tmp+'/Core/SplineGeometryGraph.js');
 const frozen=JSON.stringify(uvProfile);
 const parsed=parseGraphProfileAsset(uvProfile);
 assert.deepEqual(parsed,uvProfile);
 assert.notEqual(parsed.uv,uvProfile.uv);
 assert.notEqual(parsed.uv.edgeWeights,uvProfile.uv.edgeWeights);
 assert.equal(parseGraphProfileAsset(square).uv,undefined);
 const old=buildProfileExtrudeGeometry(frames,settings(square),false);
 const mapped=buildProfileExtrudeGeometry(frames,settings(parsed,parsed.uv),false);
 assert.deepEqual(mapped.positions,old.positions,'UV must not move any vertices');
 assert.deepEqual(mapped.normals,old.normals,'UV must not change normals');
 assert.deepEqual(mapped.indices,old.indices,'UV must not alter triangle topology');
 const expected=[[3/7,5/7],[5/7,1],[0,2/7],[2/7,3/7]];
 expected.forEach(([start,end],i)=>{
  near(mapped.uvs[i*8],start);near(mapped.uvs[i*8+2],end);
 });
 near(mapped.uvs[5],1);
 assert.notDeepEqual(mapped.uvs,old.uvs);
 assert.equal(JSON.stringify(uvProfile),frozen,'Never mutate JsonAsset data');
 assert.throws(()=>buildProfileExtrudeGeometry(frames,
  {width:2,height:1,profileShape:0,profileUV:uvProfile.uv,
   uvMetersPerRepeat:2,capEnds:false},false),/UV requires/);
 const invalid=[
  null,[],{seamEdge:-1},{seamEdge:4},{seamEdge:.5},{seamEdge:'2'},
  {edgeWeights:[]},{edgeWeights:[1,2]},{edgeWeights:[1,2,3,5]},
  {edgeWeights:[1,0,1,1]},{edgeWeights:[1,NaN,1,1]},
  {edgeWeights:[1,1,1,Infinity]},{seamEdge:0,extra:1},
 ];
 for(const uv of invalid){
  assert.throws(()=>parseGraphProfileAsset({...square,uv}),/Profile Asset UV/);
  assert.throws(()=>editor.parseProfile({...square,uv}),/Profile UV/);
 }
 assert.deepEqual(parseGraphProfileAsset({...square,uv:{}}).uv,{});
 assert.deepEqual(editor.parseProfile({...square,uv:{}}).uv,{});
 const original=editor.formatProfile(uvProfile);
 assert.deepEqual(editor.parseProfile(original),uvProfile);
 const seam=editor.applyProfileEdit(editor.formatProfile(square),
  'set-uv-seam',{index:3});
 assert.equal(editor.parseProfile(seam).uv.seamEdge,3);
 const weights=editor.applyProfileEdit(seam,'set-edge-weight',
  {index:1,weight:2.5});
 assert.deepEqual(editor.parseProfile(weights).uv.edgeWeights,[1,2.5,1,1]);
 assert.match(editor.renderProfileControls(weights,0,1),/Edge UV weight/);
 assert.match(editor.renderProfileControls(weights,0,1),/Custom mapping/);
 assert.match(editor.renderProfileControls(weights,0,1),/Set UV seam/);
 for(const weight of [-1,0,.2,4.5,'',NaN,Infinity])
  assert.throws(()=>editor.applyProfileEdit(weights,'set-edge-weight',
   {index:1,weight}),/Profile UV/);
 assert.throws(()=>editor.applyProfileEdit(original,'set-uv-seam',
  {index:4}),/point index/);
 const inserted=editor.applyProfileEdit(original,'insert-edge',
  {index:0,t:.5,offset:.12});
 assert.deepEqual(editor.parseProfile(inserted).uv,
  {seamEdge:3,edgeWeights:[1,1,2,1,1]});
 assert.equal(editor.applyProfileEdit(inserted,'remove',{index:1}),original);
 assert.deepEqual(editor.parseProfile(
  editor.applyProfileEdit(original,'remove',{index:0})).uv,
  {seamEdge:1,edgeWeights:[2,1,1]});
 assert.deepEqual(editor.parseProfile(
  editor.applyProfileEdit(original,'remove',{index:2})).uv,
  {seamEdge:1,edgeWeights:[1,2,1]});
 assert.equal(editor.applyProfileEdit(original,'reset-uv'),
  editor.formatProfile(square));
 assert.equal(JSON.stringify(uvProfile),frozen);
 const graph={version:2,nodes:[
  {id:'source',type:'spline'},
  {id:'extrudeA',type:'extrude',input:'source',width:2,height:1,profileSlot:0},
  {id:'extrudeB',type:'extrude',input:'source',width:2,height:1,profileSlot:1},
  {id:'outputA',type:'output',input:'extrudeA'},
  {id:'outputB',type:'output',input:'extrudeB'},
 ],output:'outputA'};
 const runner=new GeometryGraphRunner(),compiled=compileGeometryGraph(graph);
 const context={frames,closed:false,revision:'r1',
  profileSources:[square.points,square.points],
  profileUVs:[undefined,undefined],
  profileRevisions:[JSON.stringify(square),JSON.stringify(square)]};
 const baseline=runner.evaluateOutputs(compiled,context);
 assert.deepEqual(runner.metrics,{computed:5,reused:0,nodes:5});
 runner.evaluateOutputs(compiled,context);
 assert.deepEqual(runner.metrics,{computed:0,reused:5,nodes:5});
 const changed={...context,profileUVs:[undefined,parsed.uv],
  profileRevisions:[context.profileRevisions[0],JSON.stringify(uvProfile)]};
 const mappedOutputs=runner.evaluateOutputs(compiled,changed);
 assert.deepEqual(runner.metrics,{computed:2,reused:3,nodes:5});
 assert.deepEqual(mappedOutputs.outputA,baseline.outputA);
 assert.deepEqual(mappedOutputs.outputB.positions,baseline.outputB.positions);
 assert.deepEqual(mappedOutputs.outputB.normals,baseline.outputB.normals);
 assert.notDeepEqual(mappedOutputs.outputB.uvs,baseline.outputB.uvs);
 const valid=JSON.stringify(mappedOutputs);
 assert.throws(()=>runner.evaluateOutputs(compiled,{
  ...changed,profileUVs:[undefined,{seamEdge:9}],
  profileRevisions:[context.profileRevisions[0],'invalid']}),/Profile Asset UV/);
 assert.equal(JSON.stringify(runner.evaluateOutputs(compiled,changed)),valid,
  'Invalid UV cannot corrupt the last-good graph cache');
 assert(require(root+'/package.json').scripts.test.includes(
  'geometry-profile-uv-v2.test.cjs'));
 console.log('PROFILE UV V2 PASS: normalized seam + weighted U, strict runtime/editor validation, topology-safe edits, isolated cache and rollback.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
