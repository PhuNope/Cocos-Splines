'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
 path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-authored-profile-'));
const v=(x=0,y=0,z=0)=>({x,y,z});
const frames=Array.from({length:8},(_,i)=>({
 position:v(0,0,i),right:v(1),up:v(0,1),forward:v(0,0,1),
 distance:i,
}));
const lShape={format:'cocos-splines/profile',version:1,points:[
 {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:-.1},
 {x:.1,y:-.1},{x:.1,y:.5},{x:-.5,y:.5},
]};
const square={format:'cocos-splines/profile',version:1,points:[
 {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},
]};
const dual=()=>({version:2,nodes:[
 {id:'source',type:'spline'},
 {id:'extrudeA',type:'extrude',input:'source',width:2,height:2,
  profileShape:0,profileSlot:0,capEnds:true},
 {id:'extrudeB',type:'extrude',input:'source',width:2,height:1,
  profileShape:2,profileSlot:1,capEnds:true},
 {id:'outputA',type:'output',input:'extrudeA'},
 {id:'outputB',type:'output',input:'extrudeB'},
],output:'outputA'});
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false',
  '--outDir',tmp],{stdio:'pipe'});
 const {parseGraphProfileAsset,buildProfileExtrudeGeometry}=require(
  tmp+'/Core/SplineProfileExtrudeMath.js');
 const {compileGeometryGraph,GeometryGraphRunner}=require(
  tmp+'/Core/SplineGeometryGraph.js');
 const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
 const raw=JSON.stringify(lShape);
 const snapshot=parseGraphProfileAsset(lShape);
 assert.notEqual(snapshot,lShape);
 assert.notEqual(snapshot.points,lShape.points);
 assert.equal(JSON.stringify(lShape),raw,'Source asset must be immutable');
 assert.equal(snapshot.points.length,6);
 const transformed=buildProfileExtrudeGeometry(frames.map(f=>({...f,widthFactor:1})),{
  width:2,height:2,profileShape:0,profile:snapshot.points,
  uvMetersPerRepeat:4,capEnds:true,
 },false);
 assert.equal(transformed.bands,6);
 assert.equal(transformed.ringCount,8);
 assert.equal(transformed.positions.length/3,6*2*8+6*2);
 assert.equal(transformed.indices.length,6*7*6+2*(6-2)*3);
 assert.equal(JSON.stringify(lShape),raw,'Extrusion must never mutate authored input');
 // Concave L cap area 1 - removed 0.4*0.6 = 0.76 normalized.
 const capOffset=6*2*8;
 const triArea=(i)=>{
  const pos=j=>transformed.positions.slice(j*3,j*3+3);
  const [a,b,c]=transformed.indices.slice(i,i+3).map(pos);
  return ((b[0]-a[0])*(c[1]-a[1])-
    (b[1]-a[1])*(c[0]-a[0]))/2;
 };
 let total=0;
 for(let i=6*7*6;i<6*7*6+12;i+=3)total+=Math.abs(triArea(i));
 assert(Math.abs(total-3.04)<1e-5,'Concave cap must not fill the removed corner');
 const invalids=[
  null,{},[],{...lShape,version:2},
  {...lShape,format:'unsupported'}, {...lShape,unknown:1},
  {...lShape,points:[lShape.points[0],lShape.points[1]]},
  {...lShape,points:[...lShape.points,{x:1,y:0,extra:true}]},
  {...lShape,points:square.points.slice().reverse()},
  {...lShape,points:[...square.points.slice(0,3),square.points[2]]},
  {...lShape,points:[{x:-.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},{x:.5,y:-.5}]},
  {...lShape,points:[{x:-.5,y:-.5},{x:0,y:-.5},{x:.5,y:-.5},{x:0,y:.5}]},
  {...lShape,points:lShape.points.map(p=>({...p})).concat(
    Array.from({length:11},(_,i)=>({x:0,y:i/100})))},
  {...lShape,points:square.points.map((p,i)=>i===0?{x:NaN,y:p.y}:p)},
  {...lShape,points:square.points.map((p,i)=>i===1?{x:1.5,y:p.y}:p)},
 ];
 for(const item of invalids)
  assert.throws(()=>parseGraphProfileAsset(item),/Profile Asset/);
 const plan=compileGeometryGraph(dual());
 const runner=new GeometryGraphRunner();
 const context={
  frames,closed:false,revision:'spline-r1',
  profileSources:[snapshot.points,parseGraphProfileAsset(square).points],
  profileRevisions:[JSON.stringify(snapshot.points),JSON.stringify(square.points)],
 };
 const first=runner.evaluateOutputs(plan,context);
 assert.equal(first.outputA.bands,6);
 assert.equal(first.outputB.bands,4);
 assert.deepEqual(runner.metrics,{computed:5,reused:0,nodes:5});
 runner.evaluateOutputs(plan,context);
 assert.deepEqual(runner.metrics,{computed:0,reused:5,nodes:5});
 const prior=JSON.stringify(first);
 const changedPoints=square.points.map(p=>({...p}));
 changedPoints[1].x=.8;
 const changed={...context,
  profileSources:[snapshot.points,changedPoints],
  profileRevisions:[context.profileRevisions[0],JSON.stringify(changedPoints)]};
 const updated=runner.evaluateOutputs(plan,changed);
 assert.deepEqual(runner.metrics,{computed:2,reused:3,nodes:5},
  'Editing Profile B must dirty only Extrude B and Output B');
 assert.deepEqual(updated.outputA,first.outputA);
 assert.notDeepEqual(updated.outputB,first.outputB);
 assert.equal(JSON.stringify(first),prior);
 const lastGood=JSON.stringify(updated);
 assert.throws(()=>runner.evaluateOutputs(plan,{
  ...changed,profileSources:[snapshot.points,[{x:2,y:0}]],
  profileRevisions:[context.profileRevisions[0],'invalid'],
 }),/Profile Asset/);
 assert.equal(JSON.stringify(runner.evaluateOutputs(plan,changed)),lastGood,
  'Invalid profile cannot overwrite cached geometry');
 assert.throws(()=>runner.evaluate(plan,{
  ...context,profileRevisions:[undefined,context.profileRevisions[1]],
 }),/Profile Asset slot 0/);
 for(const bad of [{profileSlot:-1},{profileSlot:3},{profileSlot:1.5},
  {profileSlot:'a'}]){
  const data=dual();Object.assign(data.nodes[1],bad);
  assert.throws(()=>compileGeometryGraph(data),/profileSlot/);
  assert.throws(()=>model.parseGraph(JSON.stringify(data)),/profileSlot|Graph parameter/);
 }
 assert(model.renderNodeParameters(JSON.stringify(dual()),'extrudeA')
  .includes('Profile Asset Slot'));
 assert(model.renderNodeParameters(JSON.stringify(dual()),'extrudeA')
  .includes('A (Profile Asset A)'));
 const selection=model.applyGraphEdit(JSON.stringify(dual()),'param',
  {id:'extrudeA',key:'profileSlot',value:2});
 assert.equal(model.parseGraph(selection).map.get('extrudeA').profileSlot,2);
 const preset=model.applyGraphEdit(selection,'param',
  {id:'extrudeA',key:'profileSlot',value:-1});
 assert.equal(model.parseGraph(preset).map.get('extrudeA').profileSlot,undefined);
 assert.equal(compileGeometryGraph(JSON.parse(preset)).nodes.length,5);
 assert.equal(JSON.stringify(snapshot.points),context.profileRevisions[0]);
 // Ordered authored profile keys (step at existing arc samples).
 const keyGraph={version:1,output:'out',nodes:[{id:'source',type:'spline'},
  {id:'extrude',type:'extrude',input:'source',width:2,height:1,capEnds:true,
   profileKeys:[{progress:0,slot:0},{progress:.5,slot:1},{progress:1,slot:1}]},
  {id:'out',type:'output',input:'extrude'}]};
 const keyedRunner=new GeometryGraphRunner(),keyPlan=compileGeometryGraph(keyGraph);
 const wider=square.points.map(p=>({x:p.x*1.5,y:p.y}));
 const keyCtx={...context,profileSources:[square.points,wider],profileRevisions:['square','wide']};
 const keyed=keyedRunner.evaluate(keyPlan,keyCtx);
 assert.equal(keyed.bands,4);assert.equal(keyed.ringCount,8);
 assert.equal(keyed.positions[0],-1);assert.equal(keyed.positions[4*6],-1.5);
 assert(keyed.normals.every(Number.isFinite));assert(keyed.uvs.every(Number.isFinite));
 assert.deepEqual(keyedRunner.evaluate(keyPlan,keyCtx),keyed);
 assert.equal(keyedRunner.metrics.reused,3);
 const shorter=wider.map(p=>({x:p.x,y:p.y*.5}));
 const updatedCtx={...keyCtx,profileSources:[square.points,shorter],profileRevisions:['square','short']};
 const nextKeyed=keyedRunner.evaluate(keyPlan,updatedCtx);
 assert.notDeepEqual(nextKeyed.positions,keyed.positions);
 assert.deepEqual(keyedRunner.metrics,{computed:2,reused:1,nodes:3});
 assert.throws(()=>keyedRunner.evaluate(keyPlan,{...keyCtx,profileSources:[square.points,lShape.points],profileRevisions:['square','bad-count']}),/matching vertex counts/i);
 assert.throws(()=>keyedRunner.evaluate(keyPlan,{...keyCtx,profileRevisions:['square',undefined]}),/slot 1/i);
 assert.throws(()=>keyedRunner.evaluate(keyPlan,{...keyCtx,profileUVs:[undefined,{seamEdge:0}],profileRevisions:['square','uv']}),/custom UV/i);
 assert.throws(()=>keyedRunner.evaluate(keyPlan,{...keyCtx,closed:true}),/first\/last/i);
 assert.deepEqual(keyedRunner.evaluate(keyPlan,updatedCtx),nextKeyed);
 for(const invalid of [[{progress:.1,slot:0},{progress:1,slot:1}],
  [{progress:0,slot:0},{progress:1,slot:3}],[{progress:0,slot:0},{progress:0,slot:1},{progress:1,slot:1}]]){
  const bad={...keyGraph,nodes:keyGraph.nodes.map(n=>n.type==='extrude'?{...n,profileKeys:invalid}:n)};
  assert.throws(()=>compileGeometryGraph(bad));assert.throws(()=>model.parseGraph(JSON.stringify(bad)));
 }
 let edit=model.applyGraphEdit(JSON.stringify(dual()),'profile-keys-enable',{id:'extrudeB'});
 assert.deepEqual(model.parseGraph(edit).map.get('extrudeB').profileKeys,[{progress:0,slot:1},{progress:1,slot:1}]);
 edit=model.applyGraphEdit(edit,'profile-key-add',{id:'extrudeB'});
 edit=model.applyGraphEdit(edit,'profile-key-set',{id:'extrudeB',index:1,progress:.5,slot:2});
 assert(model.renderNodeParameters(edit,'extrudeB').includes('data-profile-field="slot"'));
 assert.throws(()=>model.applyGraphEdit(edit,'profile-key-remove',{id:'extrudeB',index:0}));
 edit=model.applyGraphEdit(edit,'profile-keys-disable',{id:'extrudeB'});
 assert.equal(model.parseGraph(edit).map.get('extrudeB').profileSlot,1);
 // Morph at exact sampled arc keys; original Step stays byte-for-byte unchanged.
 const morphGraph=mode=>({...keyGraph,nodes:keyGraph.nodes.map(n=>n.type==='extrude'?{...n,profileInterpolation:mode}:n)});
 const morphRunner=new GeometryGraphRunner(),linearPlan=compileGeometryGraph(morphGraph(1)),smoothPlan=compileGeometryGraph(morphGraph(2));
 const linear=morphRunner.evaluate(linearPlan,keyCtx),smooth=morphRunner.evaluate(smoothPlan,keyCtx);
 const near=(a,b)=>assert(Math.abs(a-b)<1e-8,a+' != '+b);
 assert.equal(linear.ringCount,9);assert.equal(smooth.ringCount,9);
 near(linear.positions[6],-1-.5*(2/7));
 const t=2/7;near(smooth.positions[6],-1-.5*t*t*(3-2*t));
 near(linear.positions[3*6+2],3);
 near(linear.positions[4*6+2],3.5);near(linear.positions[4*6],-1.5);
 near(linear.positions[linear.ringCount*6-6],-1.5);
 assert.deepEqual(linear.indices,smooth.indices);
 assert(linear.normals.every(Number.isFinite));
 assert(linear.normals.some((v,i)=>i%3===2&&Math.abs(v)>1e-4),'Morph transition has sloped normals');
 assert(linear.uvs.every(Number.isFinite));near(Math.max(...linear.uvs),7/5);
 assert.deepEqual(morphRunner.evaluate(compileGeometryGraph(morphGraph(0)),keyCtx),keyed);
 assert.deepEqual(morphRunner.evaluate(linearPlan,keyCtx),linear);
 assert.deepEqual(morphRunner.evaluate(linearPlan,keyCtx),linear);assert.equal(morphRunner.metrics.reused,3);
 const coarse=morphRunner.evaluate(linearPlan,{...keyCtx,frames:[frames[0],frames[7]],revision:'coarse'});
 assert.equal(coarse.ringCount,4,'Insert missing key and midpoint for a sparse transition');
 near(coarse.positions[6+2],1.75);near(coarse.positions[6],-1.25);
 const crossed=square.points.slice(2).concat(square.points.slice(0,2));
 assert.throws(()=>morphRunner.evaluate(linearPlan,{...keyCtx,profileSources:[square.points,crossed],profileRevisions:['square','crossed'],frames:[frames[0],frames[7]],revision:'bad-morph'}),/invalid sampled polygon/i);
 assert.deepEqual(morphRunner.evaluate(linearPlan,keyCtx),linear,'Invalid morph leaves good cache intact');
 const denseFrames=Array.from({length:1025},(_,i)=>({position:v(0,0,i),right:v(1),up:v(0,1),forward:v(0,0,1),distance:i}));
 const overflow={...morphGraph(1),nodes:morphGraph(1).nodes.map(n=>n.type==='extrude'?{...n,profileKeys:[{progress:0,slot:0},{progress:.333,slot:1},{progress:1,slot:1}]}:n)};
 assert.throws(()=>morphRunner.evaluate(compileGeometryGraph(overflow),{...keyCtx,frames:denseFrames,revision:'dense'}),/1025 frames/i);
 const loop=Array.from({length:9},(_,i)=>{const a=i===8?0:i*Math.PI/4;return {
   position:v(4*Math.sin(a),0,4*Math.cos(a)),right:v(-Math.sin(a),0,-Math.cos(a)),
   up:v(0,1),forward:v(Math.cos(a),0,-Math.sin(a)),distance:i* Math.PI};});
 const closedGraph={...morphGraph(2),nodes:morphGraph(2).nodes.map(n=>n.type==='extrude'?{...n,profileKeys:[{progress:0,slot:0},{progress:.5,slot:1},{progress:1,slot:0}]}:n)};
 const seam=morphRunner.evaluate(compileGeometryGraph(closedGraph),{...keyCtx,closed:true,frames:loop,revision:'closed-morph'});
 for(let edge=0;edge<seam.bands;edge++){
   const start=edge*seam.ringCount*6,end=start+(seam.ringCount-1)*6;
   for(let k=0;k<6;k++){near(seam.positions[start+k],seam.positions[end+k]);near(seam.normals[start+k],seam.normals[end+k]);}
 }
 for(const mode of [-1,3,1.5,null]){
   const bad=morphGraph(mode);assert.throws(()=>compileGeometryGraph(bad));assert.throws(()=>model.parseGraph(JSON.stringify(bad)));
 }
 let morphEdit=model.applyGraphEdit(JSON.stringify(morphGraph(0)),'param',{id:'extrude',key:'profileInterpolation',value:2});
 assert(model.renderNodeParameters(morphEdit,'extrude').includes('Smoothstep (ease in/out)'));
 morphEdit=model.applyGraphEdit(morphEdit,'profile-keys-disable',{id:'extrude'});
 assert.equal(model.parseGraph(morphEdit).map.get('extrude').profileInterpolation,undefined);
 assert.throws(()=>model.applyGraphEdit(morphEdit,'param',{id:'extrude',key:'profileInterpolation',value:1}));
 // Phase 4.6c1: matching ordered contour parts and holes.
 const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
 const hole=(x0,y0,x1,y1)=>rect(x0,y0,x1,y1).reverse();
 const sectionA={format:'cocos-splines/profile',version:1,
  points:rect(-.9,-.5,-.1,.5),holes:[hole(-.7,-.2,-.3,.2)],
  outerContours:[rect(.1,-.4,.9,.4)],outerHoles:[[hole(.3,-.15,.7,.15)]]};
 const sectionB={format:'cocos-splines/profile',version:1,
  points:rect(-.95,-.6,-.05,.6),holes:[hole(-.75,-.25,-.25,.25)],
  outerContours:[rect(.05,-.5,.95,.5)],outerHoles:[[hole(.25,-.2,.75,.2)]]};
 const contourCtx=(a,b,revision='contours')=>({...keyCtx,revision,
  profileSources:[a.points,b.points],profileHoles:[a.holes,b.holes],
  profileOuterContours:[a.outerContours,b.outerContours],profileOuterHoles:[a.outerHoles,b.outerHoles],
  profileRevisions:[JSON.stringify(a),JSON.stringify(b)]});
 const contourRunner=new GeometryGraphRunner(),contourContext=contourCtx(sectionA,sectionB);
 const contour=contourRunner.evaluate(linearPlan,contourContext);
 assert.equal(contour.bands,16);assert.equal(contour.ringCount,9);
 near(contour.positions[0],-1.8);near(contour.positions[4*6],-1.9);
 // Every loop owns a full normalized U perimeter, including clockwise holes.
 for(let edge=0;edge<16;edge+=4){
  const start=edge*contour.ringCount*4;
  const last=(edge+3)*contour.ringCount*4;
  near(contour.uvs[start],0);near(contour.uvs[last+2],1);
 }
 const sideIndices=16*(contour.ringCount-1)*6;
 const area=(start,end)=>{
  let result=0;
  for(let i=start;i<end;i+=3){
   const [a,b,c]=contour.indices.slice(i,i+3).map(j=>contour.positions.slice(j*3,j*3+3));
   result+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
  }
  return result;
 };
 const capMid=sideIndices+(contour.indices.length-sideIndices)/2;
 near(area(sideIndices,capMid),2*(.8*1-.4*.4+.8*.8-.4*.3));
 near(area(capMid,contour.indices.length),2*(.9*1.2-.5*.5+.9*1-.5*.4));
 assert(contour.normals.every(Number.isFinite));
 assert.deepEqual(contourRunner.evaluate(linearPlan,contourContext),contour);
 assert.equal(contourRunner.metrics.reused,3);
 const noHole={...sectionB,holes:undefined};
 assert.throws(()=>contourRunner.evaluate(linearPlan,contourCtx(sectionA,noHole)),/contour topology/i);
 const badHole={...sectionB,holes:[sectionB.holes[0].slice(2).concat(sectionB.holes[0].slice(0,2))]};
 const coarseContour={...contourCtx(sectionA,badHole,'bad-hole'),frames:[frames[0],frames[7]]};
 // Use identical hole sizes to force a zero-area interpolated hole.
 const rotatedA={...sectionA,holes:[sectionA.holes[0].slice(2).concat(sectionA.holes[0].slice(0,2))]};
 assert.throws(()=>contourRunner.evaluate(linearPlan,{...contourCtx(sectionA,rotatedA,'collapsed-hole'),frames:coarseContour.frames}),/invalid sampled polygon/i);
 assert.deepEqual(contourRunner.evaluate(linearPlan,contourContext),contour);
 const contourSeam=contourRunner.evaluate(compileGeometryGraph(closedGraph),{...contourContext,closed:true,frames:loop,revision:'closed-contours'});
 for(let edge=0;edge<contourSeam.bands;edge++){
  const first=edge*contourSeam.ringCount*6,last=first+(contourSeam.ringCount-1)*6;
  for(let k=0;k<6;k++){near(contourSeam.positions[first+k],contourSeam.positions[last+k]);near(contourSeam.normals[first+k],contourSeam.normals[last+k]);}
 }
 const pkg=require(root+'/package.json');
 assert(pkg.scripts.test.includes('geometry-graph-authored-profile-v2.test.cjs'));
 console.log('AUTHORED PROFILE V2 PASS: strict CCW simple polygon, concave triangulation, profile slots, dirty propagation, safe rollback and Visual Graph preset reset.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
