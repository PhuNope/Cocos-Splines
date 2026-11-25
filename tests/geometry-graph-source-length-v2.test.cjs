'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
  cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'geometry-graph-natural-repeat-'));
const approx=(a,b)=>assert(Math.abs(a-b)<1e-5,a+' != '+b);
const vec=(x=0,y=0,z=0)=>({x,y,z});
const frames=[0,2,4,5].map(z=>({
 position:vec(0,0,z),right:vec(1),up:vec(0,1),
 forward:vec(0,0,1),distance:z,widthFactor:1,
}));
const mesh={positions:[-1,0,0,1,0,0,-1,0,2,1,0,2],
 indices:[0,2,1,1,2,3],uvs:[0,0,1,0,0,1,1,1]};
const settings=(over={})=>({
 width:1,height:1,axis:2,deformShape:0,segments:4,repeats:3,
 repeatLayout:1,tileLength:0,uvMode:0,uvMetersPerRepeat:2,...over,
});
const graph=(over={})=>({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'asset',type:'meshAsset'},
 {id:'deform',type:'meshDeform',input:'source',meshInput:'asset',
  repeatLayout:1,tileLength:0,uvMode:0,repeats:3,...over},
 {id:'output',type:'output',input:'deform'},
],output:'output'});
const context={frames,revision:'r1',closed:false,meshSource:mesh,meshRevision:'mesh1'};
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json',
  '--noEmit','false','--outDir',temp],{stdio:'pipe'});
 const {buildGraphMeshDeformGeometry,createDeformPresetMesh}=
  require(temp+'/Core/SplineGraphMeshDeformMath.js');
 const {compileGeometryGraph,GeometryGraphRunner}=
  require(temp+'/Core/SplineGeometryGraph.js');
 const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
 const saved=JSON.stringify(mesh);
 const physical=buildGraphMeshDeformGeometry(frames,settings(),false,mesh);
 assert.equal(physical.positions.length/3,12);
 assert.equal(physical.indices.length,18);
 approx(Math.min(...physical.positions.filter((_,i)=>i%3===2)),0);
 approx(Math.max(...physical.positions.filter((_,i)=>i%3===2)),5);
 // Every full imported module is exactly 2 local units long, including the
 // third module's unscaled source section clipped at z=5.
 const zs=physical.positions.filter((_,i)=>i%3===2);
 for(const end of [0,2,4,5])assert(zs.some(z=>Math.abs(z-end)<1e-5));
 const lastUV=physical.uvs.slice(-8);
 assert(lastUV.some((v,i)=>i%2===1&&Math.abs(v-.5)<1e-5),
  'Final clipping interpolates authored UV0 at half a tile.');
 assert.equal(JSON.stringify(mesh),saved,'Imported mesh source must be immutable');
 const legacy=buildGraphMeshDeformGeometry(frames,settings({repeatLayout:0}),false,mesh);
 assert.equal(legacy.positions.length,physical.positions.length);
 assert(legacy.positions.some((v,i)=>i%3===2&&Math.abs(v-5/3)<1e-5),
  'Legacy Count mode stretches each section to one third of the spline');
 assert(!physical.positions.some((v,i)=>i%3===2&&Math.abs(v-5/3)<1e-5));
 const continuous=buildGraphMeshDeformGeometry(frames,settings({uvMode:1}),false,mesh);
 const distance=buildGraphMeshDeformGeometry(frames,settings({uvMode:2}),false,mesh);
 approx(Math.max(...continuous.uvs.filter((_,i)=>i%2===1)),2.5);
 approx(Math.max(...distance.uvs.filter((_,i)=>i%2===1)),2.5);
 const override=buildGraphMeshDeformGeometry(frames,
  settings({tileLength:3}),false,mesh);
 assert.equal(override.positions.length/3,8,'Override 3m length produces 2 modules');
 assert(override.positions.some((v,i)=>i%3===2&&Math.abs(v-3)<1e-5));
 approx(Math.max(...override.positions.filter((_,i)=>i%3===2)),5);
 const one=buildGraphMeshDeformGeometry(frames,settings({tileLength:10}),false,mesh);
 assert.equal(one.positions.length/3,4,'One partial tile fits a shorter route');
 approx(Math.max(...one.positions.filter((_,i)=>i%3===2)),5);
 const preset=createDeformPresetMesh(settings());
 assert.equal(preset.positions.length/3,10);
 const presetPhysical=buildGraphMeshDeformGeometry(frames,settings(),false);
 assert(presetPhysical.positions.length>preset.positions.length,
  'Preset also supports natural-length repeats');
 approx(Math.max(...presetPhysical.positions.filter((_,i)=>i%3===2)),5);
 const closed=buildGraphMeshDeformGeometry(frames,settings(),true,mesh);
 assert.deepEqual(closed.indices,physical.indices,
  'Closed source path does not invent end caps');
 const runner=new GeometryGraphRunner(),plan=compileGeometryGraph(graph());
 const a=runner.evaluate(plan,context);
 assert.deepEqual(a.positions,physical.positions);
 assert.deepEqual(runner.metrics,{computed:4,reused:0,nodes:4});
 runner.evaluate(plan,context);
 assert.deepEqual(runner.metrics,{computed:0,reused:4,nodes:4});
 const overridePlan=compileGeometryGraph(graph({tileLength:3}));
 runner.evaluate(overridePlan,context);
 assert.deepEqual(runner.metrics,{computed:2,reused:2,nodes:4},
  'Changing tileLength dirties deform and output, not mesh or spline source');
 const originalCache=JSON.stringify(runner.evaluate(overridePlan,context));
 const errorPlan=compileGeometryGraph(graph({tileLength:.01}));
 assert.throws(()=>runner.evaluate(errorPlan,context),
  /256 tiles|budget/);
 assert.equal(JSON.stringify(runner.evaluate(overridePlan,context)),originalCache,
  'Failed oversized natural repetition retains successful runner cache');
 const rejects=[
  {repeatLayout:-1},{repeatLayout:2},{repeatLayout:.5},
  {tileLength:-1},{tileLength:.005},{tileLength:10001},
  {uvMode:-1},{uvMode:3},{uvMode:.5},
 ];
 for(const bad of rejects){
  assert.throws(()=>compileGeometryGraph(graph(bad)));
  assert.throws(()=>model.parseGraph(JSON.stringify(graph(bad))));
  assert.throws(()=>buildGraphMeshDeformGeometry(frames,settings(bad),false,mesh));
 }
 const editorJson=JSON.stringify(graph());
 const params=model.renderNodeParameters(editorJson,'deform');
 for(const name of ['repeatLayout','tileLength','uvMode'])
  assert(params.includes('data-graph-param="'+name+'"'));
 assert(params.includes('Source Length (trim last tile)'));
 assert(params.includes('Original UV atlas'));
 const changed=model.applyGraphEdit(editorJson,'param',
  {id:'deform',key:'tileLength',value:4});
 assert.equal(model.parseGraph(changed).map.get('deform').tileLength,4);
 assert(require(root+'/package.json').scripts.test.includes(
  'geometry-graph-source-length-v2.test.cjs'));
 console.log('SOURCE LENGTH GRAPH V2 PASS: physical trim, source UV, count compatibility, strict budgets and cache rollback.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
