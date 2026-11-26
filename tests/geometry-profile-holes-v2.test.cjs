'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'profile-holes-'));
const editor=require(root+'/dist/SplineGeometryProfileEditor.js');
const outer=[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}];
const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x0,y:y1},{x:x1,y:y1},{x:x1,y:y0}];
const holes=[rect(-.4,-.3,-.1,.3),rect(.1,-.3,.4,.3)];
const profile={format:'cocos-splines/profile',version:1,points:outer,holes};
const v=(x,y,z)=>({x,y,z});
const frames=[0,2,4].map(distance=>({position:v(0,0,distance),right:v(1,0,0),up:v(0,1,0),forward:v(0,0,1),distance,widthFactor:1}));
const opts={profile:outer,profileHoles:holes,width:2,height:1,profileShape:0,uvMetersPerRepeat:2,capEnds:true};
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' != '+b);
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {parseGraphProfileAsset,buildProfileExtrudeGeometry}=require(tmp+'/Core/SplineProfileExtrudeMath.js');
 const {compileGeometryGraph,GeometryGraphRunner}=require(tmp+'/Core/SplineGeometryGraph.js');
 assert.deepEqual(parseGraphProfileAsset(profile),profile);
 assert.deepEqual(editor.parseProfile(profile),profile);
 assert.match(editor.renderProfileControls(editor.formatProfile(profile)),/Inner contours \(2\)/);
 const edited=editor.applyProfileEdit(editor.formatProfile({format:profile.format,version:1,points:outer}),'set-holes',{holes});
 assert.deepEqual(editor.parseProfile(edited),profile);
 const base=editor.formatProfile({...profile,uv:{seamEdge:2,edgeWeights:[1,2,3,4]}});
 const moved=editor.applyProfileEdit(base,'move',{contour:1,index:0,x:-.42,y:-.3});
 const movedProfile=editor.parseProfile(moved);
 assert.deepEqual(movedProfile.points,outer);
 assert.deepEqual(movedProfile.uv,{seamEdge:2,edgeWeights:[1,2,3,4]});
 assert.equal(movedProfile.holes[0][0].x,-.42);
 assert.deepEqual(movedProfile.holes[1],holes[1]);
 const inserted=editor.applyProfileEdit(base,'insert-edge',{contour:1,index:0,t:.5,offset:.12});
 assert.equal(editor.parseProfile(inserted).holes[0].length,5);
 assert.deepEqual(editor.parseProfile(inserted).uv,movedProfile.uv);
 assert.equal(editor.applyProfileEdit(inserted,'remove',{contour:1,index:1}),base);
 assert.throws(()=>editor.applyProfileEdit(base,'move',{contour:1,index:0,x:-.6,y:-.3}),/Profile/);
 assert.throws(()=>editor.applyProfileEdit(base,'move',{contour:3,index:0,x:0,y:0}),/contour/);
 const added=editor.applyProfileEdit(base,'add-hole');
 assert.equal(editor.parseProfile(added).holes.length,3);
 assert.throws(()=>editor.applyProfileEdit(added,'add-hole'),/three holes/);
 assert.equal(editor.applyProfileEdit(added,'remove-hole',{hole:2}),base);
 assert.match(editor.renderProfileControls(base,0,0,1),/4 CW points/);
 assert.match(editor.renderProfileControls(base,0,0,1),/spl-profile-set-uv-seam" disabled/);
 const original=JSON.stringify(profile);
 const removed=editor.applyProfileEdit(edited,'set-holes',{holes:[]});
 assert.equal(editor.parseProfile(removed).holes,undefined);
 for(const invalid of [
  [],null,[holes[0].slice().reverse()],[rect(-.6,-.3,-.1,.3)],
  [rect(-.5,-.3,-.1,.3)],[holes[0],rect(-.2,-.2,.2,.2)],
  [holes[0],rect(-.3,-.1,-.2,.1)],[holes[0],rect(-.1,-.3,.1,.3)],
 ]){
  assert.throws(()=>parseGraphProfileAsset({...profile,holes:invalid}),/Graph Profile Asset/);
  assert.throws(()=>editor.parseProfile({...profile,holes:invalid}),/Profile/);
 }
 const area=(mesh,start)=>{let sum=0;for(let i=start;i<mesh.indices.length;i+=3){
  const [a,b,c]=mesh.indices.slice(i,i+3).map(j=>mesh.positions.slice(j*3,j*3+3));
  const twice=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  assert(Math.abs(twice)>1e-10);
  assert.equal(Math.sign(twice),a[2]===0?-1:1);
  const x=(a[0]+b[0]+c[0])/6,y=(a[1]+b[1]+c[1])/3;
  assert(!holes.some(h=>x>h[0].x&&x<h[2].x&&y>h[0].y&&y<h[2].y));
  sum+=Math.abs(twice)/2;
 }return sum;};
 for(const mode of [0,1,2]){
  const uv={sideIslandMode:mode};
  const mesh=buildProfileExtrudeGeometry(frames,{...opts,profileUV:uv},false);
  assert.equal(mesh.bands,12);
  const sideIndices=12*2*6;
  assert.equal(mesh.indices.length,sideIndices+2*(12+4-2)*3);
  near(area(mesh,sideIndices),2*2*(1-2*.3*.6));
  assert.deepEqual(mesh,buildProfileExtrudeGeometry(frames,{...opts,profileUV:uv},false));
  const stride=mode===2?8:6;
  // first edge of left hole points upward, so the solid-facing outward normal points right.
  near(mesh.normals[4*stride*3],1);
  const packed=buildProfileExtrudeGeometry(frames,{...opts,profileUV:{...uv,atlasPacking:true,atlasRotate:true,atlasPixelPadding:{resolution:1024,pixels:2}}},false);
  assert.deepEqual(packed.positions,mesh.positions);
  assert.deepEqual(packed.normals,mesh.normals);
  assert.deepEqual(packed.indices,mesh.indices);
  assert(packed.uvs.every(x=>x>=0&&x<=1));
  const split=buildProfileExtrudeGeometry(frames,{...opts,profileUV:{...uv,triangleUnwrap:true,atlasPacking:true}},false);
  assert.equal(split.positions.length/3,mesh.indices.length);
  assert.equal(split.indices.length,mesh.indices.length);
  const closed=buildProfileExtrudeGeometry(frames,{...opts,profileUV:uv},true);
  assert.equal(closed.indices.length,sideIndices);
 }
 const single=buildProfileExtrudeGeometry(frames,{...opts,profileHoles:[holes[0]]},false);
 assert.equal(single.bands,8);
 assert.equal(single.indices.length,8*2*6+2*8*3);
 const ctx={frames,closed:false,revision:'holes-frame',profileSources:[outer],profileHoles:[holes],profileRevisions:[JSON.stringify(profile)]};
 const plan=compileGeometryGraph({version:1,nodes:[{id:'source',type:'spline'},
  {id:'extrude',type:'extrude',input:'source',profileSlot:0,width:2,height:1,capEnds:true},
  {id:'output',type:'output',input:'extrude'}],output:'output'});
 const runner=new GeometryGraphRunner();
 const result=runner.evaluateOutputs(plan,ctx);
 assert.equal(result.output.bands,12);
 assert.equal(JSON.stringify(profile),original);
 assert.deepEqual(runner.evaluateOutputs(plan,ctx),result);
 const changed=runner.evaluateOutputs(plan,{...ctx,profileHoles:[[holes[0]]],profileRevisions:['single-hole']});
 assert.equal(changed.output.bands,8);
 console.log('PROFILE HOLES V2 PASS: two contained CW contours, cap area, inner walls, UV modes, invalid topology, renderer graph context and draft parity.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
