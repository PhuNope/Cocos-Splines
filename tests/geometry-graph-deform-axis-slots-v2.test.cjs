'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),
 os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'graph-deform-axis-slots-'));
const v=(x=0,y=0,z=0)=>({x,y,z});
const frame=z=>({position:v(0,0,z),right:v(1),up:v(0,1),
 forward:v(0,0,1),distance:z,widthFactor:1});
const frames=[frame(0),frame(5),frame(10)];
const mesh={positions:[-1,0,0,1,0,0,-1,0,1,1,0,1],
 indices:[0,2,1,1,2,3],uvs:[0,0,1,0,0,1,1,1]};
const almost=(a,b)=>assert(Math.abs(a-b)<1e-5,a+' != '+b);
const graph=()=>({version:2,nodes:[
 {id:'source',type:'spline'},
 {id:'assetA',type:'meshAsset'},
 {id:'assetB',type:'meshAsset',slot:1},
 {id:'deformA',type:'meshDeform',input:'source',meshInput:'assetA',
  axis:2,repeats:1},
 {id:'deformB',type:'meshDeform',input:'source',meshInput:'assetB',
  axis:2,repeats:1},
 {id:'outputA',type:'output',input:'deformA'},
 {id:'outputB',type:'output',input:'deformB'},
],output:'outputA'});
const ctx=(sources=[mesh,mesh],revs=['a1','b1'])=>({
 frames,closed:false,revision:'spline1',meshSources:sources,meshRevisions:revs});
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json',
  '--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {buildGraphMeshDeformGeometry}=require(
  tmp+'/Core/SplineGraphMeshDeformMath.js');
 const {compileGeometryGraph,GeometryGraphRunner}=require(
  tmp+'/Core/SplineGeometryGraph.js');
 const settings={width:2,height:1,deformShape:0,segments:4,
  repeats:1,uvMetersPerRepeat:2};
 const z=buildGraphMeshDeformGeometry(frames,{...settings,axis:2},false);
 for(const axis of [0,1]){
  const g=buildGraphMeshDeformGeometry(frames,{...settings,axis},false);
  assert.equal(g.positions.length,z.positions.length);
  for(let i=0;i<g.positions.length;i++)almost(g.positions[i],z.positions[i]);
  assert(g.normals.every(Number.isFinite));
  for(let i=0;i<g.normals.length;i++)almost(g.normals[i],z.normals[i]);
  assert(g.indices.length===z.indices.length);
 }
 for(const axis of [-1,3,0.5,NaN,Infinity]){
  assert.throws(()=>buildGraphMeshDeformGeometry(frames,
    {...settings,axis},false),/axis/);
 }
 const importedX={...mesh,positions:mesh.positions.slice()};
 for(let i=0;i<importedX.positions.length;i+=3){
  const z=importedX.positions[i+2];
  importedX.positions[i+2]=importedX.positions[i];importedX.positions[i]=z;
 }
 const before=JSON.stringify(importedX);
 const fromX=buildGraphMeshDeformGeometry(frames,{...settings,axis:0},false,importedX);
 const fromZ=buildGraphMeshDeformGeometry(frames,{...settings,axis:2},false,mesh);
 for(let i=0;i<fromZ.positions.length;i++)almost(fromX.positions[i],fromZ.positions[i]);
 assert.equal(JSON.stringify(importedX),before,'Imported mesh must remain immutable');
 const plan=compileGeometryGraph(graph());
 assert.deepEqual(plan.outputs,['outputA','outputB']);
 const runner=new GeometryGraphRunner();
 const result=runner.evaluateOutputs(plan,ctx());
 assert.equal(Object.keys(result).length,2);
 assert.deepEqual(runner.metrics,{computed:7,reused:0,nodes:7});
 const updatedB={...mesh,positions:mesh.positions.map((n,i)=>i%3===0?n*1.5:n)};
 const altered=runner.evaluateOutputs(plan,ctx([mesh,updatedB],['a1','b2']));
 assert.deepEqual(runner.metrics,{computed:3,reused:4,nodes:7},
  'Replacing slot B only recomputes assetB and its dependent output');
 assert.deepEqual(altered.outputA,result.outputA);
 assert.notDeepEqual(altered.outputB,result.outputB);
 const updatedA={...mesh,positions:mesh.positions.map((n,i)=>i%3===0?n*2:n)};
 runner.evaluateOutputs(plan,ctx([updatedA,updatedB],['a2','b2']));
 assert.deepEqual(runner.metrics,{computed:3,reused:4,nodes:7});
 assert.throws(()=>runner.evaluateOutputs(plan,ctx([updatedA,undefined],['a2','b3'])),
  /readable imported Mesh/);
 assert.deepEqual(runner.metrics,{computed:3,reused:4,nodes:7},
  'Invalid secondary source cannot commit partial cache');
 for(const spec of [
  {slot:3},{slot:-1},{slot:1.5},{slot:0},
 ]){
  const invalid=graph();
  invalid.nodes.find(n=>n.id==='assetB').slot=spec.slot;
  assert.throws(()=>compileGeometryGraph(invalid),/slot|unused/);
 }
 const third=graph();
 third.nodes.push({id:'assetC',type:'meshAsset',slot:2});
 third.nodes.find(n=>n.id==='deformB').meshInput='assetC';
 assert.throws(()=>compileGeometryGraph(third),/disconnected/i);
 const simple=compileGeometryGraph({version:1,nodes:[
  {id:'source',type:'spline'},{id:'deform',type:'meshDeform',input:'source'},
  {id:'output',type:'output',input:'deform'}],output:'output'});
 assert.deepEqual(new GeometryGraphRunner().evaluate(simple,{
  frames,closed:false,revision:'old'}).positions,
  buildGraphMeshDeformGeometry(frames,
   {width:1,height:1,deformShape:0,segments:12,repeats:1,
   uvMetersPerRepeat:5},false).positions,'Legacy graph stays compatible');
 assert(require(root+'/package.json').scripts.test.includes('geometry-graph-deform-axis-slots-v2.test.cjs'));
 console.log('GRAPH AXIS/SLOTS PASS: X/Y/Z, isolated three-slot sources, atomic cache and legacy fallback.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
