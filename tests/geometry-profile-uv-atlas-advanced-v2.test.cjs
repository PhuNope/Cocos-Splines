'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-advanced-'));
const editor=require(root+'/dist/SplineGeometryProfileEditor.js');
const groups=[{firstVertex:0,vertexCount:4},{firstVertex:4,vertexCount:4}];
// Opposite aspect ratios: rotation can align the long axes.
const input=[0,0,8,0,8,1,0,1,0,0,1,0,1,8,0,8];
const bounds=(uv,g)=>{
 const u=[],v=[];
 for(let i=g.firstVertex;i<g.firstVertex+g.vertexCount;i++){u.push(uv[i*2]);v.push(uv[i*2+1]);}
 return {x:Math.min(...u),y:Math.min(...v),r:Math.max(...u),t:Math.max(...v)};
};
const scale=uv=>Math.hypot(uv[2]-uv[0],uv[3]-uv[1])/8;
const eps=1e-8;
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {packProfileUvAtlas}=require(tmp+'/Core/SplineUvAtlas.js');
 const {parseGraphProfileAsset,buildProfileExtrudeGeometry}=require(tmp+'/Core/SplineProfileExtrudeMath.js');
 const baseline=input.slice(),rotated=input.slice();
 packProfileUvAtlas(baseline,groups,.04);
 packProfileUvAtlas(rotated,groups,.04,{rotate:true});
 assert(scale(rotated)>=scale(baseline)-eps,'Rotation candidates cannot reduce uniform scale');
 assert(scale(rotated)>scale(baseline)+eps,'Mixed aspect ratios benefit from rotation');
 const repeat=input.slice();packProfileUvAtlas(repeat,groups,.04,{rotate:true});
 assert.deepEqual(repeat,rotated,'Deterministic placement');
 const disabled=input.slice();packProfileUvAtlas(disabled,groups,.04,{rotate:false});
 assert.deepEqual(disabled,baseline,'Opt-out preserves exact legacy UV');
 // A proper rotation keeps winding and uniform scale, never mirrors.
 for(const g of groups){
  const a=g.firstVertex*2;
  const cross=(uv)=>(uv[a+2]-uv[a])*(uv[a+5]-uv[a+1])-(uv[a+3]-uv[a+1])*(uv[a+4]-uv[a]);
  assert(cross(rotated)*cross(input)>0);
  const b=bounds(rotated,g);
  assert(b.x>=0&&b.y>=0&&b.r<=1&&b.t<=1);
 }
 const pixel={resolution:256,pixels:4},gutter=4/256;
 const packed=input.slice();packProfileUvAtlas(packed,groups,.2,{rotate:true,pixelPadding:pixel});
 const packed2=input.slice();packProfileUvAtlas(packed2,groups,0,{rotate:true,pixelPadding:pixel});
 assert.deepEqual(packed,packed2,'Pixel padding overrides fractional padding');
 const [a,b]=groups.map(g=>bounds(packed,g));
 for(const box of [a,b]){
  assert(box.x>=gutter-eps&&box.y>=gutter-eps);
  assert(box.r<=1-gutter+eps&&box.t<=1-gutter+eps);
 }
 assert(a.r+2*gutter<=b.x+eps||b.r+2*gutter<=a.x+eps||
  a.t+2*gutter<=b.y+eps||b.t+2*gutter<=a.y+eps,'Minimum two-sided pixel gutter');
 const failed=input.slice();
 assert.throws(()=>packProfileUvAtlas(failed,groups,.04,{pixelPadding:{resolution:16,pixels:7}}),/no space/);
 assert.deepEqual(failed,input,'Failed pack must be atomic');
 const profile={format:'cocos-splines/profile',version:1,points:[
  {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}
 ]};
 for(const uv of [
  {atlasRotate:true},{atlasPacking:true,atlasRotate:1},
  {atlasPixelPadding:pixel},{atlasPacking:true,atlasPixelPadding:null},
  {atlasPacking:true,atlasPixelPadding:{resolution:16,pixels:8}},
  {atlasPacking:true,atlasPixelPadding:{resolution:256,pixels:1.5}},
  {atlasPacking:true,atlasPixelPadding:{resolution:256,pixels:2,extra:true}}
 ]){
  assert.throws(()=>parseGraphProfileAsset({...profile,uv}),/Graph Profile Asset UV/);
  assert.throws(()=>editor.parseProfile({...profile,uv}),/Profile UV/);
 }
 let json=editor.formatProfile({...profile,uv:{atlasPacking:true}});
 json=editor.applyProfileEdit(json,'set-atlas-rotate',{enabled:true});
 json=editor.applyProfileEdit(json,'set-atlas-pixel-padding',pixel);
 assert.deepEqual(parseGraphProfileAsset(editor.parseProfile(json)).uv,
  {atlasPacking:true,atlasRotate:true,atlasPixelPadding:pixel});
 assert.match(editor.renderProfileControls(json),/Rotate islands/);
 assert.match(editor.renderProfileControls(json),/Gutter \(px\)/);
 assert.throws(()=>editor.applyProfileEdit(json,'set-atlas-pixel-padding',{resolution:16,pixels:8}),/Profile UV/);
 assert.equal(editor.applyProfileEdit(json,'set-atlas-packing',{enabled:false}),editor.formatProfile(profile));
 const v=(x,y,z)=>({x,y,z});
 const frames=[0,1,3].map(distance=>({position:v(0,0,distance),forward:v(0,0,1),right:v(1,0,0),up:v(0,1,0),distance,widthFactor:1}));
 const opts={profile:profile.points,width:2,height:1,profileShape:0,capEnds:true,uvMetersPerRepeat:2};
 const old=buildProfileExtrudeGeometry(frames,{...opts,profileUV:{triangleUnwrap:true,atlasPacking:true}},false);
 const advanced=buildProfileExtrudeGeometry(frames,{...opts,profileUV:{triangleUnwrap:true,atlasPacking:true,atlasRotate:true,atlasPixelPadding:pixel}},false);
 assert.deepEqual(advanced.positions,old.positions);
 assert.deepEqual(advanced.normals,old.normals);
 assert.deepEqual(advanced.indices,old.indices);
 assert(advanced.uvs.every(n=>Number.isFinite(n)&&n>=gutter-eps&&n<=1-gutter+eps));
 // Relative density preserves island aspect and uses a common base scale.
 const weightedGroups=groups.map((g,i)=>({...g,density:i===0?2:.5}));
 const weighted=input.slice();
 packProfileUvAtlas(weighted,weightedGroups,.04,{rotate:true,pixelPadding:pixel});
 const length=(uv,i,j)=>Math.hypot(uv[i*2]-uv[j*2],uv[i*2+1]-uv[j*2+1]);
 const near=(x,y)=>assert(Math.abs(x-y)<1e-7,x+' != '+y);
 near((length(weighted,0,1)/8)/(length(weighted,4,5)/1),4);
 const boxes=groups.map(g=>bounds(weighted,g));
 assert(boxes[0].r+2*gutter<=boxes[1].x+eps||boxes[1].r+2*gutter<=boxes[0].x+eps||
  boxes[0].t+2*gutter<=boxes[1].y+eps||boxes[1].t+2*gutter<=boxes[0].y+eps);
 const same=input.slice();packProfileUvAtlas(same,groups.map(g=>({...g,density:1})),.04);
 assert.deepEqual(same,baseline);
 const again=input.slice();packProfileUvAtlas(again,weightedGroups,.04,{rotate:true,pixelPadding:pixel});
 assert.deepEqual(again,weighted);
 for(const density of [0,5,NaN,Infinity,'2',null]){
  const untouched=input.slice();
  assert.throws(()=>packProfileUvAtlas(untouched,[{...groups[0],density},groups[1]],.04),/density/);
  assert.deepEqual(untouched,input);
 }
 const priority={outer:2,inner:.5,cap:1};
 for(const uv of [{atlasPriority:priority},{atlasPacking:true,atlasPriority:null},
  {atlasPacking:true,atlasPriority:{outer:1,inner:1}},
  {atlasPacking:true,atlasPriority:{...priority,cap:5}},
  {atlasPacking:true,atlasPriority:{...priority,extra:1}}]){
  assert.throws(()=>parseGraphProfileAsset({...profile,uv}),/Graph Profile Asset UV/);
  assert.throws(()=>editor.parseProfile({...profile,uv}),/Profile UV/);
 }
 const priorityJson=editor.applyProfileEdit(json,'set-atlas-priority',priority);
 assert.deepEqual(parseGraphProfileAsset(editor.parseProfile(priorityJson)).uv.atlasPriority,priority);
 assert.match(editor.renderProfileControls(priorityJson),/spl-profile-uv-priority-inner/);
 assert.equal(editor.applyProfileEdit(priorityJson,'clear-atlas-priority'),json);
 assert.equal(editor.applyProfileEdit(priorityJson,'set-atlas-packing',{enabled:false}),editor.formatProfile(profile));
 const hole=[{x:-.25,y:-.25},{x:-.25,y:.25},{x:.25,y:.25},{x:.25,y:-.25}];
 // With one hole, compare the linear UV density of each wall and cap in
 // all supported island layouts, including triangles. Geometry is identical.
 for(const sideIslandMode of [0,1,2])for(const triangleUnwrap of [false,true]){
  const baseUV={sideIslandMode,triangleUnwrap};
  const hollow={...opts,profileHoles:[hole]};
  const raw=buildProfileExtrudeGeometry(frames,{...hollow,profileUV:baseUV},false);
  const uniform=buildProfileExtrudeGeometry(frames,{...hollow,profileUV:{...baseUV,atlasPacking:true}},false);
  assert.deepEqual(buildProfileExtrudeGeometry(frames,{...hollow,profileUV:{...baseUV,atlasPacking:true,atlasPriority:{outer:1,inner:1,cap:1}}},false),uniform);
  const mesh=buildProfileExtrudeGeometry(frames,{...hollow,profileUV:{...baseUV,atlasPacking:true,atlasRotate:true,atlasPixelPadding:pixel,atlasPriority:priority}},false);
  assert.deepEqual(mesh.positions,raw.positions);assert.deepEqual(mesh.normals,raw.normals);assert.deepEqual(mesh.indices,raw.indices);
  const edgeVertices=triangleUnwrap?12:sideIslandMode===2?8:6;
  const ratios=[0,4*edgeVertices,8*edgeVertices].map(i=>{
   let j=i+1;
   if(length(raw.uvs,i,j)<eps)j=i+2;
   return length(mesh.uvs,i,j)/length(raw.uvs,i,j);
  });
  near(ratios[0]/ratios[1],4);near(ratios[0]/ratios[2],2);
  assert(mesh.uvs.every(n=>Number.isFinite(n)&&n>=gutter-eps&&n<=1-gutter+eps));
 }
 console.log('ADVANCED PROFILE UV ATLAS V2 PASS: deterministic rotation, winding, pixel gutters, opt-out, atomic failure, schema/editor parity and triangle mesh.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
