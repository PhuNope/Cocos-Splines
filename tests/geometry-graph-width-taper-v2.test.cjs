'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-width-curve-'));
const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const V=(x,y,z)=>({x,y,z});
const frames=[0,1,4,6,8].map(d=>({position:V(0,0,d),forward:V(0,0,1),
 right:V(1,0,0),up:V(0,1,0),distance:d}));
const square=[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}];
const uv={seamEdge:0,uMetersPerRepeat:1,uFollowFrameScale:true};
const profile={format:'cocos-splines/profile',version:1,points:square,uv};
const graph={version:2,nodes:[
 {id:'source',type:'spline'},
 {id:'widthA',type:'width',input:'source',multiplier:1},
 {id:'widthB',type:'width',input:'source',multiplier:1},
 {id:'extrudeA',type:'extrude',input:'widthA',profileSlot:0,width:2,height:1,capEnds:true},
 {id:'extrudeB',type:'extrude',input:'widthB',profileSlot:1,width:2,height:1,capEnds:true},
 {id:'outputA',type:'output',input:'extrudeA'},
 {id:'outputB',type:'output',input:'extrudeB'},
],output:'outputA'};
const ctx={frames,closed:false,revision:'frames-1',
 profileSources:[square,square],profileUVs:[uv,uv],
 profileRevisions:[JSON.stringify(profile),JSON.stringify(profile)]};
const eq=(a,b)=>assert(Math.abs(a-b)<1e-6,String(a)+' != '+String(b));
const original=JSON.stringify(graph),originalFrames=JSON.stringify(frames);
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false',
  '--outDir',temp],{stdio:'pipe'});
 const {compileGeometryGraph,GeometryGraphRunner}=require(
  temp+'/Core/SplineGeometryGraph.js');
 const runner=new GeometryGraphRunner();
 let compiled=compileGeometryGraph(graph);
 assert.deepEqual(model.parseGraph(JSON.stringify(graph)).ordered.map(n=>n.id),
  compiled.nodes.map(n=>n.id),'Visual and runtime must accept identical graph');
 const base=runner.evaluateOutputs(compiled,ctx);
 assert.deepEqual(runner.metrics,{computed:7,reused:0,nodes:7});
 for(let ring=0;ring<frames.length;ring++){
  eq(base.outputB.positions[6*ring],-1);
  eq(base.outputB.uvs[4*ring+2],2);
 }
 runner.evaluateOutputs(compiled,ctx);
 assert.deepEqual(runner.metrics,{computed:0,reused:7,nodes:7});
 const taper=JSON.parse(JSON.stringify(graph));
 Object.assign(taper.nodes.find(n=>n.id==='widthB'),
  {multiplier:2,midMultiplier:.5,endMultiplier:1.5,taperMode:0});
 compiled=compileGeometryGraph(taper);
 const linear=runner.evaluateOutputs(compiled,ctx);
 assert.deepEqual(runner.metrics,{computed:3,reused:4,nodes:7},
  'Only the edited Width branch, Extrude B and Output B recompute');
 assert.deepEqual(linear.outputA,base.outputA,
  'Unrelated path, profile slot and output must be untouched');
 const scales=[2,1.625,.5,1,1.5];
 scales.forEach((scale,i)=>{
  eq(linear.outputB.positions[6*i],-scale);
  eq(linear.outputB.positions[6*i+3],scale);
  eq(linear.outputB.uvs[4*i+2],2*scale);
 });
 assert.deepEqual(linear.outputB.indices,base.outputB.indices);
 assert.deepEqual(linear.outputB.normals,base.outputB.normals);
 assert.deepEqual(linear.outputB.uvs.slice(4*frames.length*2*2),
  base.outputB.uvs.slice(4*frames.length*2*2),
  'Cap UVs never change when Width curve is edited');
 assert.equal(JSON.stringify(graph),original);
 assert.equal(JSON.stringify(frames),originalFrames);
 // The curve is physical-distance-based, not sample-index-based.
 const eased=JSON.parse(JSON.stringify(taper));
 eased.nodes.find(n=>n.id==='widthB').taperMode=1;
 const smooth=runner.evaluateOutputs(compileGeometryGraph(eased),ctx);
 assert.deepEqual(runner.metrics,{computed:3,reused:4,nodes:7});
 eq(smooth.outputB.positions[6],-1.765625);
 eq(smooth.outputB.positions[0],-2);
 eq(smooth.outputB.positions[6*2],-.5);
 eq(smooth.outputB.positions[6*4],-1.5);
 assert.notDeepEqual(smooth.outputB.positions,linear.outputB.positions);
 const stable=JSON.stringify(smooth);
 // Invalid closed-loop seam must fail atomically; a matching cycle works.
 assert.throws(()=>runner.evaluateOutputs(
  compileGeometryGraph(eased),{...ctx,closed:true}),
  /closed spline Width curve requires equal Start and End/);
 assert.equal(JSON.stringify(runner.evaluateOutputs(
  compileGeometryGraph(eased),ctx)),stable);
 assert.deepEqual(runner.metrics,{computed:0,reused:7,nodes:7});
 const cyclic=JSON.parse(JSON.stringify(eased));
 cyclic.nodes.find(n=>n.id==='widthB').endMultiplier=2;
 const closed=runner.evaluateOutputs(
  compileGeometryGraph(cyclic),{...ctx,closed:true});
 eq(closed.outputB.positions[0],closed.outputB.positions[6*4]);
 eq(closed.outputB.uvs[2],closed.outputB.uvs[4*4+2]);
 // Mid-only curves return to the same end as the start (closed safe).
 const midOnly=JSON.parse(JSON.stringify(graph));
 Object.assign(midOnly.nodes.find(n=>n.id==='widthB'),
  {midMultiplier:.5,taperMode:1});
 const closedMid=runner.evaluateOutputs(
  compileGeometryGraph(midOnly),{...ctx,closed:true});
 eq(closedMid.outputB.positions[0],closedMid.outputB.positions[6*4]);
 eq(closedMid.outputB.positions[6*2],-.5);
 // Strict runtime & Visual model schema parity and fail-closed bounds.
 const invalid=[
  {endMultiplier:0},{endMultiplier:20.01},{endMultiplier:'2'},
  {midMultiplier:NaN},{midMultiplier:Infinity},{midMultiplier:null},
  {taperMode:2},{taperMode:.5},{taperMode:'1'},{extra:1},
 ];
 for(const fields of invalid){
  const bad=JSON.parse(JSON.stringify(graph));
  Object.assign(bad.nodes.find(n=>n.id==='widthB'),fields);
  if(Number.isNaN(fields.midMultiplier))
   bad.nodes.find(n=>n.id==='widthB').midMultiplier=NaN;
  else if(fields.midMultiplier===Infinity)
   bad.nodes.find(n=>n.id==='widthB').midMultiplier=Infinity;
  assert.throws(()=>compileGeometryGraph(bad));
  assert.throws(()=>model.validateGraph(bad));
 }
 let edited=model.applyGraphEdit(original,'param',{
  id:'widthB',key:'endMultiplier',value:.3});
 edited=model.applyGraphEdit(edited,'param',{
  id:'widthB',key:'midMultiplier',value:.6});
 edited=model.applyGraphEdit(edited,'param',{
  id:'widthB',key:'taperMode',value:1});
 assert.equal(model.parseGraph(edited).map.get('widthB').endMultiplier,.3);
 assert.equal(model.parseGraph(edited).map.get('widthB').midMultiplier,.6);
 assert.equal(model.parseGraph(edited).map.get('widthB').taperMode,1);
 const controls=model.renderNodeParameters(edited,'widthB');
 assert.match(controls,/data-graph-param="midMultiplier"/);
 assert.match(controls,/data-graph-param="endMultiplier"/);
 assert.match(controls,/Smoothstep \(ease in\/out\)/);
 assert.match(controls,/distance-based taper curve/);
 edited=model.applyGraphEdit(edited,'param',{
  id:'widthB',key:'midMultiplier',value:null});
 edited=model.applyGraphEdit(edited,'param',{
  id:'widthB',key:'endMultiplier',value:null});
 assert.equal(model.parseGraph(edited).map.get('widthB').midMultiplier,undefined);
 assert.equal(model.parseGraph(edited).map.get('widthB').endMultiplier,undefined);
 assert.match(model.renderNodeParameters(edited,'widthB'),/Auto \(linear midpoint\)/);
 assert.match(model.renderNodeParameters(edited,'widthB'),/Same as Start/);
 assert.throws(()=>model.applyGraphEdit(edited,'param',{
  id:'widthB',key:'multiplier',value:null}),/Non-finite/);
 assert.throws(()=>model.applyGraphEdit(edited,'param',{
  id:'widthB',key:'taperMode',value:.5}),/range/);
 assert.equal(JSON.stringify(graph),original);
 assert.equal(JSON.stringify(frames),originalFrames);
 assert(require(root+'/package.json').scripts.test.includes(
  'geometry-graph-width-taper-v2.test.cjs'));
 console.log('GRAPH WIDTH CURVE V2 PASS: physical-distance linear/smoothstep taper, local UV0, legacy widths, closed seam, isolated cache and strict Visual/runtime parity.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
