'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'profile-uv-islands-'));
const editor=require(root+'/dist/SplineGeometryProfileEditor.js');
const v=(x,y,z)=>({x,y,z});
const profile={format:'cocos-splines/profile',version:1,points:[
 {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},
]};
const frames=[0,1,3].map(distance=>({
 position:v(0,0,distance),forward:v(0,0,1),right:v(1,0,0),up:v(0,1,0),
 widthFactor:1,distance,
}));
const near=(a,b,label)=>assert(Math.abs(a-b)<1e-6,(label||'UV')+': '+a+' != '+b);
const opts=uv=>({profile:profile.points,profileUV:uv,
 width:2,height:1,profileShape:0,capEnds:true,uvMetersPerRepeat:2});
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false',
  '--outDir',temp],{stdio:'pipe'});
 const {parseGraphProfileAsset,buildProfileExtrudeGeometry}=require(
  temp+'/Core/SplineProfileExtrudeMath.js');
 const {GeometryGraphRunner,compileGeometryGraph}=require(
  temp+'/Core/SplineGeometryGraph.js');
 const original=JSON.stringify(profile),base=buildProfileExtrudeGeometry(frames,opts(),false);
 const continuous=buildProfileExtrudeGeometry(frames,opts({sideIslandMode:0}),false);
 assert.deepEqual(continuous,base,'Explicit continuous mode must be byte-identical to legacy UVs');
 const edgeUV={sideIslandMode:1},edge=buildProfileExtrudeGeometry(frames,opts(edgeUV),false);
 assert.deepEqual(edge.positions,base.positions);
 assert.deepEqual(edge.normals,base.normals);
 assert.deepEqual(edge.indices,base.indices);
 assert.deepEqual(edge.uvs.slice(4*frames.length*4),base.uvs.slice(4*frames.length*4),
  'End cap UVs stay unchanged in edge-islands mode');
 for(let band=0;band<4;band++)for(let ring=0;ring<frames.length;ring++){
  const offset=(band*frames.length+ring)*4;
  near(edge.uvs[offset],0);near(edge.uvs[offset+2],1);
  near(edge.uvs[offset+1],frames[ring].distance/2);
  near(edge.uvs[offset+3],frames[ring].distance/2);
 }
 assert.equal(JSON.stringify(edgeUV),'{"sideIslandMode":1}');
 const quads=buildProfileExtrudeGeometry(frames,opts({sideIslandMode:2}),false);
 assert.equal(quads.bands,base.bands);assert.equal(quads.ringCount,base.ringCount);
 assert.equal(quads.positions.length/3,4*(frames.length-1)*4+8);
 assert.equal(quads.indices.length,base.indices.length);
 // Every generated island quad maps to exactly the same two geometric
 // triangles and per-frame hard normals as the legacy shared-ring mesh.
 for(let band=0;band<4;band++)for(let span=0;span<frames.length-1;span++){
  const dstBase=(band*(frames.length-1)+span)*4;
  const srcBase=band*frames.length*2+span*2;
  const sources=[srcBase,srcBase+1,srcBase+2,srcBase+3];
  for(let corner=0;corner<4;corner++){
   assert.deepEqual(quads.positions.slice((dstBase+corner)*3,(dstBase+corner+1)*3),
    base.positions.slice(sources[corner]*3,(sources[corner]+1)*3));
   assert.deepEqual(quads.normals.slice((dstBase+corner)*3,(dstBase+corner+1)*3),
    base.normals.slice(sources[corner]*3,(sources[corner]+1)*3));
  }
  assert.deepEqual(quads.indices.slice((band*(frames.length-1)+span)*6,
    (band*(frames.length-1)+span+1)*6),
   [dstBase,dstBase+1,dstBase+2,dstBase+1,dstBase+3,dstBase+2]);
  for(const corner of [0,2])near(quads.uvs[(dstBase+corner)*2],0);
  for(const corner of [1,3])near(quads.uvs[(dstBase+corner)*2],1);
  near(quads.uvs[(dstBase+0)*2+1],0);
  near(quads.uvs[(dstBase+1)*2+1],0);
  const vSpan=(frames[span+1].distance-frames[span].distance)/2;
  near(quads.uvs[(dstBase+2)*2+1],vSpan);
  near(quads.uvs[(dstBase+3)*2+1],vSpan);
 }
 const capSideStart=4*(frames.length-1)*4;
 const baseCapStart=4*frames.length*2;
 for(const field of ['positions','normals']){
  assert.deepEqual(quads[field].slice(capSideStart*3),base[field].slice(baseCapStart*3),
   'Cap geometry and normals must be unchanged');
 }
 assert.deepEqual(quads.uvs.slice(capSideStart*2),base.uvs.slice(baseCapStart*2),
  'Cap UV islands are not modified');
 const metric=buildProfileExtrudeGeometry(frames,
  opts({sideIslandMode:1,edgeWeights:[1,2,1,1],uMetersPerRepeat:2}),false);
 near(metric.uvs[2],1);
 near(metric.uvs[frames.length*4+2],1);
 // The metric follow-frame mode updates U independently at both ends
 // of each face, making taper-safe UV islands.
 const tapered=frames.map((f,i)=>({...f,widthFactor:[1,2,.5][i]}));
 const variable=buildProfileExtrudeGeometry(tapered,
  opts({sideIslandMode:2,uMetersPerRepeat:1,uFollowFrameScale:true}),false);
 near(variable.uvs[2],2);
 near(variable.uvs[6],4);
 near(variable.uvs[8*2],0);
 // Runtime and draft Editor share the exact bounded numeric enum schema.
 for(const value of [-1,3,1.5,'2',null,false,NaN,Infinity]){
  const bad={...profile,uv:{sideIslandMode:value}};
  assert.throws(()=>parseGraphProfileAsset(bad),/Graph Profile Asset UV/);
  assert.throws(()=>editor.parseProfile(bad),/Profile UV/);
 }
 assert.deepEqual(parseGraphProfileAsset({...profile,uv:{sideIslandMode:2}}).uv,
  {sideIslandMode:2});
 assert.deepEqual(editor.parseProfile({...profile,uv:{sideIslandMode:2}}).uv,
  {sideIslandMode:2});
 const first=editor.formatProfile(profile);
 const second=editor.applyProfileEdit(first,'set-side-island-mode',{mode:1});
 assert.equal(editor.parseProfile(second).uv.sideIslandMode,1);
 assert.match(editor.renderProfileControls(second),/Quad Islands/);
 const third=editor.applyProfileEdit(second,'set-side-island-mode',{mode:2});
 assert.equal(editor.parseProfile(third).uv.sideIslandMode,2);
 assert.equal(editor.applyProfileEdit(third,'set-side-island-mode',{mode:0}),first);
 assert.throws(()=>editor.applyProfileEdit(first,'set-side-island-mode',{mode:'2'}),/Profile UV/);
 const withSeam=editor.applyProfileEdit(third,'set-uv-seam',{index:1});
 const inserted=editor.applyProfileEdit(withSeam,'insert-edge',{index:0,t:.5,offset:.12});
 assert.equal(editor.parseProfile(inserted).uv.sideIslandMode,2);
 assert.equal(editor.applyProfileEdit(inserted,'remove',{index:1}),withSeam);
 assert.equal(editor.applyProfileEdit(third,'reset-uv'),first);
 assert.equal(JSON.stringify(profile),original);
 const graph={version:2,nodes:[
  {id:'source',type:'spline'},
  {id:'extrudeA',type:'extrude',input:'source',width:2,height:1,profileSlot:0},
  {id:'extrudeB',type:'extrude',input:'source',width:2,height:1,profileSlot:1},
  {id:'outputA',type:'output',input:'extrudeA'},
  {id:'outputB',type:'output',input:'extrudeB'},
 ],output:'outputA'};
 const plan=compileGeometryGraph(graph),runner=new GeometryGraphRunner();
 const ctx={frames,closed:false,revision:'islands-frame-1',
  profileSources:[profile.points,profile.points],
  profileUVs:[undefined,undefined],
  profileRevisions:[original,original]};
 const unmodified=runner.evaluateOutputs(plan,ctx);
 assert.deepEqual(runner.metrics,{computed:5,reused:0,nodes:5});
 const newUv={sideIslandMode:2};
 const changed={...ctx,profileUVs:[undefined,newUv],
  profileRevisions:[original,JSON.stringify({...profile,uv:newUv})]};
 const output=runner.evaluateOutputs(plan,changed);
 assert.deepEqual(runner.metrics,{computed:2,reused:3,nodes:5},
  'Only the modified Profile slot B branch must rebuild');
 assert.deepEqual(output.outputA,unmodified.outputA);
 assert.notDeepEqual(output.outputB.uvs,unmodified.outputB.uvs);
 const lastGood=JSON.stringify(output);
 assert.throws(()=>runner.evaluateOutputs(plan,{
  ...changed,profileUVs:[undefined,{sideIslandMode:99}],
  profileRevisions:[original,'invalid-uv-islands-revision']}),/Graph Profile Asset UV/);
 assert.equal(JSON.stringify(runner.evaluateOutputs(plan,changed)),lastGood,
  'Invalid Profile JsonAsset must not poison cached graph geometry');
 // Quad islands plus caps can exceed the mesh budget at maximal settings.
 const largeFrames=Array.from({length:1025},(_,i)=>({
  ...frames[0],position:v(0,0,i),distance:i,
 }));
 const sixteen=Array.from({length:16},(_,i)=>({
  x:Math.cos(i*Math.PI/8)*.5,y:Math.sin(i*Math.PI/8)*.5,
 }));
 assert.throws(()=>buildProfileExtrudeGeometry(largeFrames,
  {...opts({sideIslandMode:2}),profile:sixteen},false),/65536-vertex/);
 assert(require(root+'/package.json').scripts.test.includes(
  'geometry-profile-uv-islands-v2.test.cjs'));
 console.log('PROFILE UV ISLANDS V2 PASS: edge U mapping, split quad face UV, cap geometry, winding, taper, strict schema, draft history & graph cache isolation.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
