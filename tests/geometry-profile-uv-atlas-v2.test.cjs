'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),
 os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'profile-uv-atlas-'));
const model=require(root+'/dist/SplineGeometryProfileEditor.js');
const v=(x,y,z)=>({x,y,z});
const points=[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}];
const profile={format:'cocos-splines/profile',version:1,points};
const frames=[0,1,3].map(distance=>({
 position:v(0,0,distance),forward:v(0,0,1),right:v(1,0,0),
 up:v(0,1,0),distance,widthFactor:1,
}));
const opts=uv=>({profile:points,profileUV:uv,width:2,height:1,
 profileShape:0,uvMetersPerRepeat:2,capEnds:true});
const near=(a,b,label)=>assert(Math.abs(a-b)<1e-7,
 (label||'atlas')+': '+a+' != '+b);
const islandsFor=mode=>{
 const groups=[],n=frames.length,bands=points.length;
 const side=mode===2?bands*(n-1)*4:bands*n*2;
 if(mode===2)for(let i=0;i<bands*(n-1);i++)groups.push([i*4,4]);
 else if(mode===1)for(let i=0;i<bands;i++)groups.push([i*n*2,n*2]);
 else groups.push([0,side]);
 groups.push([side,bands],[side+bands,bands]);
 return groups;
};
const bounds=(uvs,[start,length])=>{
 let minU=Infinity,minV=Infinity,maxU=-Infinity,maxV=-Infinity;
 for(let v=start;v<start+length;v++){
  minU=Math.min(minU,uvs[v*2]);maxU=Math.max(maxU,uvs[v*2]);
  minV=Math.min(minV,uvs[v*2+1]);maxV=Math.max(maxV,uvs[v*2+1]);
 }
 return {minU,minV,maxU,maxV,w:maxU-minU,h:maxV-minV};
};
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false',
  '--outDir',temp],{stdio:'pipe'});
 const {packProfileUvAtlas}=require(temp+'/Core/SplineUvAtlas.js');
 const {parseGraphProfileAsset,buildProfileExtrudeGeometry}=require(
  temp+'/Core/SplineProfileExtrudeMath.js');
 const {compileGeometryGraph,GeometryGraphRunner}=require(
  temp+'/Core/SplineGeometryGraph.js');
 for(const mode of [0,1,2]){
  const originalUv={sideIslandMode:mode,uMetersPerRepeat:2,edgeWeights:[1,2,1,1]};
  const packedUv={...originalUv,atlasPacking:true,atlasPadding:.05};
  const before=JSON.stringify(packedUv);
  const base=buildProfileExtrudeGeometry(frames,opts(originalUv),false);
  const packed=buildProfileExtrudeGeometry(frames,opts(packedUv),false);
  assert.deepEqual(packed.positions,base.positions,'Atlas must not edit positions');
  assert.deepEqual(packed.normals,base.normals,'Atlas must not edit normals');
  assert.deepEqual(packed.indices,base.indices,'Atlas must not edit face topology');
  assert.deepEqual(packed,buildProfileExtrudeGeometry(frames,opts(packedUv),false),
   'Atlas output must be deterministic for an unchanged profile');
  assert.equal(JSON.stringify(packedUv),before,'Authored UV settings stay immutable');
  assert.notDeepEqual(packed.uvs,base.uvs,'Atlas changes only UV0');
  const groups=islandsFor(mode);
  const packedBounds=groups.map(g=>bounds(packed.uvs,g));
  const baseBounds=groups.map(g=>bounds(base.uvs,g));
  const scale=packedBounds[0].w/baseBounds[0].w;
  assert(scale>0&&scale<1,'UV Atlas uses an explicit global fit scale');
  for(let i=0;i<groups.length;i++){
   const a=packedBounds[i],b=baseBounds[i];
   near(a.w/b.w,scale,'All islands use one U scale');
   near(a.h/b.h,scale,'All islands use one V scale');
   assert(a.minU>=-1e-8&&a.maxU<=1+1e-8);
   assert(a.minV>=-1e-8&&a.maxV<=1+1e-8);
   for(let j=0;j<i;j++){
    const other=packedBounds[j];
    assert(a.minU>=other.maxU+1e-9||other.minU>=a.maxU+1e-9||
     a.minV>=other.maxV+1e-9||other.minV>=a.maxV+1e-9,
     'Every UV island has a positive nonoverlap gap');
   }
  }
  assert.deepEqual(buildProfileExtrudeGeometry(frames,opts(
   {...originalUv,atlasPacking:false}),false),base,'Explicit opt-out is legacy-exact');
  assert.deepEqual(buildProfileExtrudeGeometry(frames,opts(
   {...originalUv,atlasPacking:true}),false),
   buildProfileExtrudeGeometry(frames,opts(
    {...originalUv,atlasPacking:true,atlasPadding:.04}),false),
   'Omitted padding means fixed 4% per-cell margin');
 }
 // World-UV and variable taper width remain valid with opt-in atlas.
 const world={sideIslandMode:2,atlasPacking:true,uMetersPerRepeat:1.5,
  uWorldSpace:true,atlasPadding:.04};
 const tapers=frames.map((f,i)=>({...f,widthFactor:[1,2,.65][i]}));
 const worldPacked=buildProfileExtrudeGeometry(tapers,{
  ...opts(world),worldUvLinear:[2,0,0,0,1,0,0,0,1]},false);
 const unPackedWorld={...world};
 delete unPackedWorld.atlasPacking;
 delete unPackedWorld.atlasPadding;
 const worldLegacy=buildProfileExtrudeGeometry(tapers,{
  ...opts(unPackedWorld),worldUvLinear:[2,0,0,0,1,0,0,0,1]},false);
 assert.deepEqual(worldPacked.positions,worldLegacy.positions);
 assert.deepEqual(worldPacked.normals,worldLegacy.normals);
 assert.deepEqual(worldPacked.indices,worldLegacy.indices);
 // Closed curves have only side islands, never append two cap groups.
 const closed=buildProfileExtrudeGeometry(frames,opts({
  sideIslandMode:2,atlasPacking:true}),true);
 assert.equal(closed.positions.length/3,4*2*4);
 assert(closed.uvs.every(n=>n>=0&&n<=1));
 // Parse parity and failed transaction isolation.
 for(const uv of [
  {atlasPacking:1},{atlasPacking:null},{atlasPacking:'true'},
  {atlasPadding:.04},{atlasPacking:false,atlasPadding:.04},
  {atlasPacking:true,atlasPadding:-.01},
  {atlasPacking:true,atlasPadding:.201},
  {atlasPacking:true,atlasPadding:'0.04'},
  {atlasPacking:true,atlasPadding:NaN},
 ]){
  assert.throws(()=>parseGraphProfileAsset({...profile,uv}),/Graph Profile Asset UV/);
  assert.throws(()=>model.parseProfile({...profile,uv}),/Profile UV/);
 }
 const authored=model.formatProfile(profile);
 assert.match(model.renderProfileControls(authored),/Pack UV0 islands into atlas/);
 assert.throws(()=>model.applyProfileEdit(authored,'set-atlas-packing',{enabled:1}),/Profile UV/);
 assert.throws(()=>model.applyProfileEdit(authored,'set-atlas-padding',{padding:.02}),/Profile UV/);
 let edited=model.applyProfileEdit(authored,'set-atlas-packing',{enabled:true});
 assert.equal(model.parseProfile(edited).uv.atlasPacking,true);
 const enabled=edited;
 edited=model.applyProfileEdit(edited,'set-atlas-padding',{padding:.075});
 assert.equal(model.parseProfile(edited).uv.atlasPadding,.075);
 assert.deepEqual(parseGraphProfileAsset(model.parseProfile(edited)).uv,
  {atlasPacking:true,atlasPadding:.075});
 assert.throws(()=>model.applyProfileEdit(edited,'set-atlas-padding',{padding:.5}),/Profile UV/);
 edited=model.applyProfileEdit(edited,'clear-atlas-padding',{});
 assert.equal(edited,enabled);
 edited=model.applyProfileEdit(model.applyProfileEdit(enabled,'set-atlas-padding',
  {padding:.04}),'set-atlas-packing',{enabled:false});
 assert.equal(edited,authored,'Opt-out removes both atlas fields and preserves the schema');
 const noVertices=[0,0,1,0,1,1,0,1];
 assert.throws(()=>packProfileUvAtlas(noVertices,[{firstVertex:0,vertexCount:4}],
  .21),/Graph Profile UV Atlas/);
 assert.throws(()=>packProfileUvAtlas(noVertices,[{firstVertex:1,vertexCount:3}],
  .04),/consecutive/);
 assert.deepEqual(noVertices,[0,0,1,0,1,1,0,1],
  'Invalid atlas input must never partially mutate source UV');
 // Per-output graph caching: changing Profile slot B's atlas must not rebuild
 // shared spline or non-atlased Profile slot A.
 const graph={version:2,nodes:[
  {id:'s',type:'spline'},
  {id:'a',type:'extrude',input:'s',width:2,height:1,profileSlot:0},
  {id:'b',type:'extrude',input:'s',width:2,height:1,profileSlot:1},
  {id:'outA',type:'output',input:'a'},
  {id:'outB',type:'output',input:'b'},
 ],output:'outA'};
 const runner=new GeometryGraphRunner(),plan=compileGeometryGraph(graph);
 const noAtlas={sideIslandMode:2},atlas={...noAtlas,atlasPacking:true};
 const ctx={frames,closed:false,revision:'atlas-source-1',
  profileSources:[points,points],profileUVs:[noAtlas,noAtlas],
  profileRevisions:[JSON.stringify(noAtlas),JSON.stringify(noAtlas)]};
 const first=runner.evaluateOutputs(plan,ctx);
 const changed={...ctx,profileUVs:[noAtlas,atlas],
  profileRevisions:[JSON.stringify(noAtlas),JSON.stringify(atlas)]};
 const result=runner.evaluateOutputs(plan,changed);
 assert.deepEqual(runner.metrics,{computed:2,reused:3,nodes:5});
 assert.deepEqual(result.outA,first.outA);
 assert.deepEqual(result.outB.positions,first.outB.positions);
 assert.notDeepEqual(result.outB.uvs,first.outB.uvs);
 assert.deepEqual(runner.evaluateOutputs(plan,changed),result);
 assert.deepEqual(runner.metrics,{computed:0,reused:5,nodes:5});
 const profileRevisions=changed.profileRevisions.slice();
 const badCtx={...changed,profileUVs:[noAtlas,
  {atlasPacking:true,atlasPadding:.5}],profileRevisions:
  [profileRevisions[0],'invalid-profile-atlas']};
 assert.throws(()=>runner.evaluateOutputs(plan,badCtx),/Graph Profile Asset UV/);
 assert.deepEqual(runner.evaluateOutputs(plan,changed),result,
  'Failed profile parsing cannot poison last-good output cache');
 assert(require(root+'/package.json').scripts.test.includes(
  'geometry-profile-uv-atlas-v2.test.cjs'));
 console.log('PROFILE UV ATLAS V2 PASS: deterministic bounded grid layout, nonoverlap, side/caps, uniform UV scale, world taper, strict draft schema and graph cache.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
