'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
 path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'profile-triangle-uv-'));
const editor=require(root+'/dist/SplineGeometryProfileEditor.js');
const v=(x,y,z)=>({x,y,z}),near=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' != '+b);
const profile={format:'cocos-splines/profile',version:1,points:[
 {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},
]};
const frames=[0,1,3].map(distance=>({position:v(0,0,distance),
 forward:v(0,0,1),right:v(1,0,0),up:v(0,1,0),
 widthFactor:1,distance}));
const options=uv=>({profile:profile.points,profileUV:uv,
 width:2,height:1,profileShape:0,capEnds:true,uvMetersPerRepeat:2});
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json',
  '--noEmit','false','--outDir',temp],{stdio:'pipe'});
 const {parseGraphProfileAsset,buildProfileExtrudeGeometry}=require(
  temp+'/Core/SplineProfileExtrudeMath.js');
 const {unwrapProfileUvTriangles}=require(temp+'/Core/SplineUvAtlas.js');
 const {compileGeometryGraph,GeometryGraphRunner}=require(
  temp+'/Core/SplineGeometryGraph.js');
 for(const mode of [0,1,2]){
  const originalUv={sideIslandMode:mode,uMetersPerRepeat:1.5,
   uFollowFrameScale:true};
  const normal=buildProfileExtrudeGeometry(frames,options(originalUv),false);
  assert.deepEqual(buildProfileExtrudeGeometry(frames,options({
   ...originalUv,triangleUnwrap:false}),false),normal,
   'Explicit false must reproduce legacy byte-identical geometry');
  const triangle=buildProfileExtrudeGeometry(frames,options({
   ...originalUv,triangleUnwrap:true}),false);
  assert.equal(triangle.indices.length,normal.indices.length,
   'Triangle count and original winding must be preserved');
  assert.equal(triangle.positions.length/3,normal.indices.length,
   'Triangle unwrap duplicates one unique vertex per face corner');
  assert.equal(triangle.uvs.length,normal.indices.length*2);
  for(let t=0;t<normal.indices.length;t+=3){
   const ids=normal.indices.slice(t,t+3);
   assert.deepEqual(triangle.indices.slice(t,t+3),[t,t+1,t+2]);
   const us=ids.map(i=>normal.uvs[i*2]);
   const vs=ids.map(i=>normal.uvs[i*2+1]);
   const minU=Math.min(...us),minV=Math.min(...vs);
   for(let k=0;k<3;k++){
    const src=ids[k],dst=t+k;
    assert.deepEqual(triangle.positions.slice(dst*3,dst*3+3),
     normal.positions.slice(src*3,src*3+3));
    assert.deepEqual(triangle.normals.slice(dst*3,dst*3+3),
     normal.normals.slice(src*3,src*3+3));
    near(triangle.uvs[dst*2],us[k]-minU);
    near(triangle.uvs[dst*2+1],vs[k]-minV);
   }
  }
  const packed=buildProfileExtrudeGeometry(frames,options({
   ...originalUv,triangleUnwrap:true,atlasPacking:true,
   atlasPadding:.05}),false);
  assert.deepEqual(packed.positions,triangle.positions);
  assert.deepEqual(packed.normals,triangle.normals);
  assert.deepEqual(packed.indices,triangle.indices);
  assert(packed.uvs.every(n=>Number.isFinite(n)&&n>=0&&n<=1));
  const bounds=[];
  for(let t=0;t<packed.indices.length;t+=3){
   let minU=Infinity,minV=Infinity,maxU=-Infinity,maxV=-Infinity;
   for(let k=0;k<3;k++){
    const u=packed.uvs[(t+k)*2],vv=packed.uvs[(t+k)*2+1];
    minU=Math.min(minU,u);maxU=Math.max(maxU,u);
    minV=Math.min(minV,vv);maxV=Math.max(maxV,vv);
   }
   for(const other of bounds)
    assert(minU>other.maxU||other.minU>maxU||
     minV>other.maxV||other.minV>maxV,
     'Every side/cap triangle UV island must be disjoint');
   bounds.push({minU,maxU,minV,maxV});
  }
  assert.deepEqual(packed,buildProfileExtrudeGeometry(frames,options({
   ...originalUv,triangleUnwrap:true,atlasPacking:true,
   atlasPadding:.05}),false),'Atlas packing must be deterministic');
 }
 // Closed loop without caps and inverse-handed frame basis retain triangle
 // locations, normals, winding, and exact side triangle count.
 const reversed=frames.map(f=>({...f,right:v(-1,0,0)}));
 for(const closed of [true,false]){
  const old=buildProfileExtrudeGeometry(reversed,options(),closed);
  const result=buildProfileExtrudeGeometry(reversed,
   options({triangleUnwrap:true,atlasPacking:true}),closed);
  assert.equal(result.indices.length,old.indices.length);
  assert.equal(result.positions.length/3,old.indices.length);
  for(let i=0;i<old.indices.length;i++){
   assert.deepEqual(result.positions.slice(i*3,i*3+3),
    old.positions.slice(old.indices[i]*3,old.indices[i]*3+3));
  }
 }
 // World-space U and taper can coexist with both UV flags.
 const world={triangleUnwrap:true,atlasPacking:true,uMetersPerRepeat:2,
  uWorldSpace:true,sideIslandMode:2};
 const scaledFrames=frames.map((f,i)=>({...f,widthFactor:[1,2,.7][i]}));
 const worldMatrix=[2,0,0,0,1,0,0,0,1];
 const warped=buildProfileExtrudeGeometry(scaledFrames,
  {...options(world),worldUvLinear:worldMatrix},false);
 assert(warped.uvs.every(n=>n>=0&&n<=1));
 assert(warped.positions.length/3===warped.indices.length);
 const unknown=[null,0,1,'true',{},[],NaN,Infinity];
 for(const value of unknown){
  const input={...profile,uv:{triangleUnwrap:value}};
  assert.throws(()=>parseGraphProfileAsset(input),/Graph Profile Asset UV/);
  assert.throws(()=>editor.parseProfile(input),/Profile UV/);
 }
 const json=editor.formatProfile(profile);
 assert.match(editor.renderProfileControls(json),/Per-triangle UV unwrap/);
 assert.throws(()=>editor.applyProfileEdit(json,'set-triangle-unwrap',
  {enabled:1}),/Profile UV/);
 let enabled=editor.applyProfileEdit(json,'set-triangle-unwrap',{enabled:true});
 assert.equal(editor.parseProfile(enabled).uv.triangleUnwrap,true);
 const after=editor.applyProfileEdit(enabled,'set-atlas-packing',{enabled:true});
 assert.deepEqual(parseGraphProfileAsset(editor.parseProfile(after)).uv,
  {triangleUnwrap:true,atlasPacking:true});
 assert.equal(editor.applyProfileEdit(enabled,'set-triangle-unwrap',
  {enabled:false}),json,'Toggle opt-out restores original JSON exactly');
 assert.equal(editor.applyProfileEdit(after,'reset-uv'),json);
 // Preflight very dense graphs before creating (not while array grows).
 const largeFrames=Array.from({length:1025},(_,i)=>({
  ...frames[0],position:v(0,0,i),distance:i,
 }));
 assert.throws(()=>buildProfileExtrudeGeometry(largeFrames,
  options({triangleUnwrap:true}),false),/65536-vertex/);
 // Fail-closed on zero physical UV span and invalid stand-alone arrays.
 const stationary=[frames[0],{...frames[0],position:v(0,0,1)}];
 assert.throws(()=>buildProfileExtrudeGeometry(stationary,
  options({triangleUnwrap:true}),false),/nondegenerate UV/);
 const input={positions:[0,0,0,1,0,0,0,1,0],
  normals:[0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,0,1],
  indices:[0,1,2]};
 const snapshot=JSON.stringify(input);
 assert.throws(()=>unwrapProfileUvTriangles({...input,indices:[0,1,42]}),
  /index is invalid/);
 assert.equal(JSON.stringify(input),snapshot);
 // Cache isolation: a new Profile triangle mode invalidates only its branch.
 const plan=compileGeometryGraph({version:2,nodes:[
  {id:'source',type:'spline'},
  {id:'extrudeA',type:'extrude',input:'source',profileSlot:0,width:2,height:1},
  {id:'extrudeB',type:'extrude',input:'source',profileSlot:1,width:2,height:1},
  {id:'outputA',type:'output',input:'extrudeA'},
  {id:'outputB',type:'output',input:'extrudeB'},
 ],output:'outputA'});
 const runner=new GeometryGraphRunner();
 const ctx={frames,closed:false,revision:'triangle-source-1',
  profileSources:[profile.points,profile.points],
  profileUVs:[undefined,undefined],profileRevisions:['v1','v1']};
 const before=runner.evaluateOutputs(plan,ctx);
 const packedUV={triangleUnwrap:true,atlasPacking:true};
 const changed={...ctx,profileUVs:[undefined,packedUV],
  profileRevisions:['v1',JSON.stringify(packedUV)]};
 const output=runner.evaluateOutputs(plan,changed);
 assert.deepEqual(runner.metrics,{computed:2,reused:3,nodes:5});
 assert.deepEqual(output.outputA,before.outputA);
 assert.notDeepEqual(output.outputB.uvs,before.outputB.uvs);
 const stable=JSON.stringify(output);
 assert.throws(()=>runner.evaluateOutputs(plan,{...changed,
  profileUVs:[undefined,{triangleUnwrap:'yes'}],
  profileRevisions:['v1','invalid-profile']}),/Graph Profile Asset UV/);
 assert.equal(JSON.stringify(runner.evaluateOutputs(plan,changed)),stable,
  'An invalid Profile must not poison previous cached outputs');
 assert(require(root+'/package.json').scripts.test.includes(
  'geometry-profile-uv-triangle-unwrap-v2.test.cjs'));
 console.log('PROFILE TRIANGLE UV V2 PASS: per-face vertex split, cap/non-cap, atlas, world taper, bounds, strict schema and branch cache.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
