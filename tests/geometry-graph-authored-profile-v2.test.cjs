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
 const pkg=require(root+'/package.json');
 assert(pkg.scripts.test.includes('geometry-graph-authored-profile-v2.test.cjs'));
 console.log('AUTHORED PROFILE V2 PASS: strict CCW simple polygon, concave triangulation, profile slots, dirty propagation, safe rollback and Visual Graph preset reset.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
