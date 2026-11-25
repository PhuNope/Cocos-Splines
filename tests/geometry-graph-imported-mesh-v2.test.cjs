'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-imported-mesh-'));
const frame=z=>({position:{x:0,y:0,z},right:{x:1,y:0,z:0},
 up:{x:0,y:1,z:0},forward:{x:0,y:0,z:1},distance:z});
const sample={positions:[-1,0,0,1,0,0,-1,0,1,1,0,1],
 indices:[0,2,1,1,2,3],uvs:[0,0,1,0,0,1,1,1]};
const context=(mesh=sample,revision='asset-a')=>({
 frames:[frame(0),frame(5),frame(10)],closed:false,revision:'spline-a',
 meshSource:mesh,meshRevision:revision,
});
const graph=(over={})=>({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'meshAsset',type:'meshAsset'},
 {id:'deform',type:'meshDeform',input:'source',meshInput:'meshAsset',
  width:1,height:1,repeats:3,uvMetersPerRepeat:2,...over},
 {id:'output',type:'output',input:'deform'},
],output:'output'});
const almost=(a,b)=>assert(Math.abs(a-b)<1e-5,a+' != '+b);
try {
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json',
  '--noEmit','false','--outDir',dir],{stdio:'pipe'});
 const {GeometryGraphRunner,compileGeometryGraph,parseGeometryGraph}=
  require(dir+'/Core/SplineGeometryGraph.js');
 const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
 const before=JSON.stringify(sample);
 const plan=compileGeometryGraph(graph());
 assert.deepEqual(plan.nodes.map(n=>n.id),['source','meshAsset','deform','output']);
 assert.deepEqual(model.parseGraph(JSON.stringify(graph())).ordered.map(n=>n.id),
  plan.nodes.map(n=>n.id));
 const runner=new GeometryGraphRunner();
 const first=runner.evaluate(plan,context());
 assert.equal(first.positions.length/3,12);
 assert.equal(first.indices.length,18);
 almost(first.positions[0],-1);
 almost(first.positions[2],0);
 almost(first.positions[first.positions.length-1],10);
 assert.equal(JSON.stringify(sample),before,'Source imported geometry remains immutable');
 assert.deepEqual(runner.metrics,{computed:4,reused:0,nodes:4});
 const last=JSON.stringify(first);
 first.positions[0]=999;
 assert.equal(JSON.stringify(runner.evaluate(plan,context())),last,
  'Callers cannot mutate cached output');
 assert.deepEqual(runner.metrics,{computed:0,reused:4,nodes:4});
 const updated={...sample,positions:sample.positions.map((v,i)=>i%3===0?v*2:v)};
 const change=runner.evaluate(plan,context(updated,'asset-b'));
 almost(change.positions[0],-2);
 assert.deepEqual(runner.metrics,{computed:3,reused:1,nodes:4},
  'Asset changes dirty only meshAsset + downstream deform/output; path cache is reused');
 const stable=JSON.stringify(change);
 assert.throws(()=>runner.evaluate(plan,context(undefined,'no-mesh')),/Mesh/i);
 // default mesh in context() is valid; explicitly pass a missing asset
 assert.throws(()=>runner.evaluate(plan,{...context(),meshSource:undefined,
  meshRevision:'missing'}),/readable imported Mesh/);
 assert.equal(JSON.stringify(runner.evaluate(plan,context(updated,'asset-b'))),stable,
  'Failed evaluation keeps successful cache');
 const invalid=[
  {...graph(),nodes:graph().nodes.map(n=>n.id==='deform'?{...n,meshInput:'source'}:n)},
  {...graph(),nodes:[...graph().nodes,{id:'meshTwo',type:'meshAsset'}]},
  {...graph(),nodes:graph().nodes.map(n=>n.id==='deform'?{...n,meshInput:'absent'}:n)},
  {...graph(),nodes:graph().nodes.map(n=>n.id==='meshAsset'?{...n,input:'source'}:n)},
  {...graph(),nodes:graph().nodes.map(n=>n.id==='meshAsset'?{...n,url:'assetdb://hack'}:n)},
 ];
 for(const item of invalid){
  assert.throws(()=>compileGeometryGraph(item));
  assert.throws(()=>model.parseGraph(JSON.stringify(item)));
 }
 assert.throws(()=>runner.evaluate(plan,context({
  ...sample,indices:[0,1,99]},'bad-index')),/invalid\/oversized/);
 assert.throws(()=>runner.evaluate(plan,context({
  ...sample,positions:new Array(4100*3).fill(0)},'big')),/invalid\/oversized/);
 assert.throws(()=>runner.evaluate(plan,{...context(),meshRevision:''}),/revision/);
 const graphJson=JSON.stringify(graph());
 assert(model.renderGraphCanvas(graphJson,'{}',null,null).includes('data-socket="mesh-in"'));
 assert(model.renderGraphCanvas(graphJson,'{}',null,null).includes('spl-vg-wire-meshSource'));
 const detach=model.applyGraphEdit(graphJson,'detach-mesh-asset',{id:'deform'});
 assert.equal(model.parseGraph(detach).map.has('meshAsset'),false);
 assert.equal(model.parseGraph(detach).map.get('deform').meshInput,undefined);
 const reattached=model.applyGraphEdit(detach,'attach-mesh-asset',{id:'deform'});
 assert.equal(model.parseGraph(reattached).map.get('deform').meshInput,'meshAsset');
 assert.equal(model.applyGraphEdit(reattached,'attach-mesh-asset',{id:'deform'}),reattached);
 const switched=model.applyGraphEdit(reattached,'replace-generator',{type:'tube'});
 assert.deepEqual(model.parseGraph(switched).ordered.map(n=>n.type),
  ['spline','tube','output'],'Switching generator prunes now-unused Mesh Asset');
 const path=model.applyGraphEdit(detach,'replace-generator',{type:'tube'});
 assert.throws(()=>model.applyGraphEdit(path,'attach-mesh-asset',{id:'tube'}),/Mesh Deform/);
 const connected=model.applyGraphEdit(detach,'attach-mesh-asset',{id:'deform'});
 const sourceVersion=JSON.stringify(sample);
 assert.equal(sourceVersion,before);
 assert(require(root+'/package.json').scripts.test.includes('geometry-graph-imported-mesh-v2.test.cjs'));
 console.log('GRAPH IMPORTED MESH V2 PASS: typed mesh port, bounded asset, cache isolation, immutable source, attach/detach.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
