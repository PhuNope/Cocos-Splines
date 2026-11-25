'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
 path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'profile-u-metric-'));
const {parseProfile,formatProfile,applyProfileEdit,renderProfileControls}=
 require(root+'/dist/SplineGeometryProfileEditor.js');
const points=[
 {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},
];
const base={format:'cocos-splines/profile',version:1,points};
const uv={seamEdge:2,edgeWeights:[1,2,1,1],uMetersPerRepeat:2};
const authored={...base,uv};
const V=(x,y,z)=>({x,y,z});
const frames=[0,3].map(z=>({
 position:V(0,0,z),right:V(1,0,0),up:V(0,1,0),forward:V(0,0,1),
 distance:z,widthFactor:1,
}));
const near=(actual,expect,comment='')=>assert(Math.abs(actual-expect)<1e-6,
 (comment||'UV mismatch')+': '+actual+' != '+expect);
const settings=(profile,width=2,height=1)=>({
 width,height,profileShape:0,profile:profile.points,
 profileUV:profile.uv,capEnds:true,uvMetersPerRepeat:3,
});
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false',
  '--outDir',tmp],{stdio:'pipe'});
 const {parseGraphProfileAsset,buildProfileExtrudeGeometry}=require(
  tmp+'/Core/SplineProfileExtrudeMath.js');
 const {compileGeometryGraph,GeometryGraphRunner}=require(
  tmp+'/Core/SplineGeometryGraph.js');
 const original=JSON.stringify(authored);
 assert.deepEqual(parseGraphProfileAsset(authored),authored);
 assert.deepEqual(parseProfile(authored),authored);
 assert.notEqual(parseGraphProfileAsset(authored).uv,authored.uv);
 const baseline=buildProfileExtrudeGeometry(frames,settings(base),false);
 const weighted=buildProfileExtrudeGeometry(frames,settings({
  ...base,uv:{seamEdge:2,edgeWeights:[1,2,1,1]},
 }),false);
 const metric=buildProfileExtrudeGeometry(frames,settings(authored),false);
 assert.deepEqual(metric.positions,baseline.positions);
 assert.deepEqual(metric.normals,baseline.normals);
 assert.deepEqual(metric.indices,baseline.indices);
 assert.equal(metric.bands,baseline.bands);
 assert.equal(metric.ringCount,baseline.ringCount);
 // Nominal width=2, height=1 => edge weighted lengths [2,2,2,1].
 // Seam at edge 2 => start offsets [3,5,0,2] physical meters.
 // 2 meters/side U repeat => [1.5,2.5,0,1] starting UV0.
 const expected=[[1.5,2.5],[2.5,3.5],[0,1],[1,1.5]];
 expected.forEach(([start,end],i)=>{
  near(metric.uvs[i*8],start,'edge '+i+' start');
  near(metric.uvs[i*8+2],end,'edge '+i+' end');
  near(metric.uvs[i*8+1],0,'Spline V start');
  near(metric.uvs[i*8+5],1,'Spline V end');
 });
 // Without uMetersPerRepeat, the full weighted perimeter spans U=1.
 expected.forEach((pair,i)=>{
  near(weighted.uvs[i*8],pair[0]*2/7,'normalized U start');
  near(weighted.uvs[i*8+2],pair[1]*2/7,'normalized U end');
 });
 // Caps retain all previous UV coordinates even after metric U changes.
 const sideUvCount=4*2*frames.length*2;
 assert.deepEqual(metric.uvs.slice(sideUvCount),baseline.uvs.slice(sideUvCount),
  'Cap islands must keep their existing UV without metric change');
 // Physical U scale responds to cross-section size: doubling width doubles
 // horizontal edge U while normalized perimeter behavior is unchanged.
 const wide=buildProfileExtrudeGeometry(frames,settings(authored,4,1),false);
 near(wide.uvs[0],2.5,'Wide profile rotated U');
 near(wide.uvs[2],4.5,'Wide profile edge length');
 near(wide.uvs[16],0,'Wide seam starts U at zero');
 near(wide.uvs[18],2,'Wide seam-edge U range');
 near(wide.uvs[1],0);
 near(wide.uvs[5],1);
 assert.equal(JSON.stringify(authored),original,'Do not mutate source JsonAsset');
 // Strict schema: authored UVs only, finite numeric range.
 const invalid=[0,-1,.009,10000.01,NaN,Infinity,'2',null,true,undefined,{},[]];
 for(const value of invalid){
  assert.throws(()=>parseGraphProfileAsset({
   ...base,uv:{uMetersPerRepeat:value}}),/Graph Profile Asset UV/);
  assert.throws(()=>parseProfile({
   ...base,uv:{uMetersPerRepeat:value}}),/Profile UV/);
 }
 const formatted=formatProfile(authored);
 const updated=applyProfileEdit(formatted,'set-u-meters-per-repeat',{meters:5});
 assert.equal(parseProfile(updated).uv.uMetersPerRepeat,5);
 assert.equal(parseProfile(updated).uv.seamEdge,2);
 assert.deepEqual(parseProfile(updated).uv.edgeWeights,[1,2,1,1]);
 const cleared=applyProfileEdit(updated,'clear-u-meters-per-repeat');
 assert.deepEqual(parseProfile(cleared).uv,{
  seamEdge:2,edgeWeights:[1,2,1,1],
 });
 const simple=formatProfile(base);
 const withOnlyMetric=applyProfileEdit(simple,'set-u-meters-per-repeat',{meters:2});
 assert.deepEqual(parseProfile(withOnlyMetric).uv,{uMetersPerRepeat:2});
 assert.equal(applyProfileEdit(withOnlyMetric,'clear-u-meters-per-repeat'),simple);
 assert.match(renderProfileControls(updated,0,0),/Side U meters\/repeat/);
 assert.match(renderProfileControls(updated,0,0),/Nominal meters, repeat every 5 m/);
 assert.match(renderProfileControls(cleared,0,0),/Normalized perimeter/);
 for(const value of [0,.009,10000.01,NaN,Infinity,'2',null,''])
  assert.throws(()=>applyProfileEdit(formatted,'set-u-meters-per-repeat',
   {meters:value}),/Profile UV/);
 // Graph content revision changes only dependent Extrude/output branch.
 const graph={version:2,nodes:[
  {id:'source',type:'spline'},
  {id:'extrudeA',type:'extrude',input:'source',width:2,height:1,profileSlot:0},
  {id:'extrudeB',type:'extrude',input:'source',width:2,height:1,profileSlot:1},
  {id:'outputA',type:'output',input:'extrudeA'},
  {id:'outputB',type:'output',input:'extrudeB'},
 ],output:'outputA'};
 const runner=new GeometryGraphRunner(),plan=compileGeometryGraph(graph);
 const context={frames,closed:false,revision:'frame-r1',
  profileSources:[points,points],profileUVs:[undefined,undefined],
  profileRevisions:[JSON.stringify(base),JSON.stringify(base)]};
 const first=runner.evaluateOutputs(plan,context);
 assert.deepEqual(runner.metrics,{computed:5,reused:0,nodes:5});
 runner.evaluateOutputs(plan,context);
 assert.deepEqual(runner.metrics,{computed:0,reused:5,nodes:5});
 const changed={...context,profileUVs:[undefined,uv],
  profileRevisions:[context.profileRevisions[0],JSON.stringify(authored)]};
 const second=runner.evaluateOutputs(plan,changed);
 assert.deepEqual(runner.metrics,{computed:2,reused:3,nodes:5});
 assert.deepEqual(second.outputA,first.outputA);
 assert.deepEqual(second.outputB.positions,first.outputB.positions);
 assert.notDeepEqual(second.outputB.uvs,first.outputB.uvs);
 assert.throws(()=>runner.evaluateOutputs(plan,{
  ...changed,profileUVs:[undefined,{uMetersPerRepeat:0}],
  profileRevisions:[context.profileRevisions[0],'invalid']}),/Graph Profile Asset UV/);
 const third=runner.evaluateOutputs(plan,changed);
 assert.deepEqual(third,second,'Invalid metric UV cannot corrupt warm-cache');
 assert.equal(JSON.stringify(authored),original);
 assert(require(root+'/package.json').scripts.test.includes(
  'geometry-profile-uv-metric-v2.test.cjs'));
 console.log('PROFILE UV METRIC V2 PASS: opt-in nominal physical U tiling, legacy normalization, seam/edge weights, immutable source, cap isolation, Editor parity and branch-local cache.');
}finally{fs.rmSync(tmp,{force:true,recursive:true});}
