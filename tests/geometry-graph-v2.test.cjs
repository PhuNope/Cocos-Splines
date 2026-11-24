'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),path=require('node:path'),
 fs=require('node:fs'),os=require('node:os');
const root=path.resolve(__dirname,'..'),
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-geometry-graph-v2-'));
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json',
  '--noEmit','false','--outDir',temp],{stdio:'pipe'});
 const {
   compileGeometryGraph,parseGeometryGraph,GeometryGraphRunner,
   DEFAULT_GEOMETRY_GRAPH,GEOMETRY_GRAPH_VERSION,
 }=require(temp+'/Core/SplineGeometryGraph.js');
 assert.equal(GEOMETRY_GRAPH_VERSION,1);
 const v=(x=0,y=0,z=0)=>({x,y,z});
 const frames=Array.from({length:4},(_,i)=>({
   position:v(0,0,i),right:v(1),up:v(0,1),
   forward:v(0,0,1),distance:i,
 }));
 const ctx={frames,closed:false,revision:'rev1'};
 const basic=parseGeometryGraph(DEFAULT_GEOMETRY_GRAPH);
 assert.deepEqual(basic.nodes.map(n=>n.id),['source','ribbon','output']);
 const runner=new GeometryGraphRunner();
 let mesh=runner.evaluate(basic,ctx);
 assert.equal(mesh.positions.length,4*2*3,'Ribbon width produces two verts per ring');
 assert.equal(mesh.indices.length,3*2*3,'Three sections, two triangles each');
 assert.equal(mesh.positions[0],-2);
 assert.equal(mesh.positions[3],2);
 assert.deepEqual(runner.metrics,{computed:3,reused:0,nodes:3});
 mesh.positions[0]=999999;
 let cached=runner.evaluate(basic,ctx);
 assert.equal(cached.positions[0],-2,'Returned arrays must not mutate internal cache');
 assert.deepEqual(runner.metrics,{computed:0,reused:3,nodes:3});
 const graph={
   version:1,nodes:[
     {id:'output',type:'output',input:'ribbon'},
     {id:'offset',type:'offset',input:'source',right:2,up:1},
     {id:'ribbon',type:'ribbon',input:'width',width:4,uvMetersPerRepeat:5},
     {id:'width',type:'width',input:'offset',multiplier:2},
     {id:'source',type:'spline'},
   ],output:'output',
 };
 const order=compileGeometryGraph(graph);
 assert.deepEqual(order.nodes.map(n=>n.id),['source','offset','width','ribbon','output'],
  'Unordered JSON nodes compile into stable dependency-first order');
 const graphRunner=new GeometryGraphRunner();
 const originalFrames=JSON.stringify(frames),originalGraph=JSON.stringify(graph);
 mesh=graphRunner.evaluate(order,ctx);
 assert.equal(mesh.positions[0],-2,'Offset right +2 and doubled width -4 yields -2');
 assert.equal(mesh.positions[1],1,'Offset up +1 moves ribbon');
 assert.equal(mesh.positions[3],6,'Right edge includes offset and doubled width');
 assert.deepEqual(graphRunner.metrics,{computed:5,reused:0,nodes:5});
 assert.equal(JSON.stringify(frames),originalFrames,'Source frames must remain immutable');
 assert.equal(JSON.stringify(graph),originalGraph,'User graph may not be normalized in-place');
 graphRunner.evaluate(order,ctx);
 assert.deepEqual(graphRunner.metrics,{computed:0,reused:5,nodes:5});
 const changeWidth={...graph,nodes:graph.nodes.map(n=>
  n.id==='width'?{...n,multiplier:1}:n)};
 const narrow=graphRunner.evaluate(compileGeometryGraph(changeWidth),ctx);
 assert.deepEqual(graphRunner.metrics,{computed:3,reused:2,nodes:5},
  'Width edit dirties width/ribbon/output but reuses source and offset');
 assert.equal(narrow.positions[0],0);
 assert.equal(narrow.positions[3],4);
 const changeUV={...changeWidth,nodes:changeWidth.nodes.map(n=>
  n.id==='ribbon'?{...n,uvMetersPerRepeat:2}:n)};
 const uv=graphRunner.evaluate(compileGeometryGraph(changeUV),ctx);
 assert.deepEqual(graphRunner.metrics,{computed:2,reused:3,nodes:5},
  'Ribbon-only edit reuses all upstream path nodes');
 assert(uv.uvs[9]>narrow.uvs[9],'UV length setting changes output geometry');
 graphRunner.evaluate(compileGeometryGraph(changeUV),{...ctx,revision:'rev2'});
 assert.deepEqual(graphRunner.metrics,{computed:5,reused:0,nodes:5},
  'Source frame revision invalidates entire graph exactly once');
 const after=graphRunner.evaluate(compileGeometryGraph(changeUV),{...ctx,revision:'rev2'});
 const snapshot=JSON.stringify(after);
 assert.throws(()=>graphRunner.evaluate(compileGeometryGraph(changeUV),{
   ...ctx,revision:'bad',frames:[...frames.slice(0,3),{...frames[3],distance:NaN}]
 }));
 assert.equal(JSON.stringify(graphRunner.evaluate(
   compileGeometryGraph(changeUV),{...ctx,revision:'rev2'})),snapshot,
   'Bad frame evaluation must preserve last successful cached result');
 const invalid=[
  {version:2,nodes:graph.nodes,output:'output'},
  {...graph,output:'not-found'},
  {...graph,nodes:[...graph.nodes,{id:'source',type:'spline'}]},
  {...graph,nodes:graph.nodes.map(n=>
   n.id==='offset'?{...n,input:'width'}:n)},
  {...graph,nodes:graph.nodes.map(n=>
   n.id==='ribbon'?{...n,input:'output'}:n)},
  {...graph,nodes:graph.nodes.map(n=>
   n.id==='ribbon'?{...n,width:-5}:n)},
  {...graph,nodes:graph.nodes.map(n=>
   n.id==='ribbon'?{...n,customScript:'eval(x)'}:n)},
  {...graph,nodes:[...graph.nodes,{id:'dead',type:'offset',input:'source'}]},
  {...graph,nodes:graph.nodes.map(n=>
   n.id==='width'?{...n,multiplier:Infinity}:n)},
 ];
 for(const bad of invalid)assert.throws(()=>compileGeometryGraph(bad));
 assert.throws(()=>parseGeometryGraph('{bad'));
 assert.throws(()=>parseGeometryGraph(' '.repeat(16385)));
 const cyc={version:1,nodes:[
  {id:'source',type:'spline'},
  {id:'a',type:'offset',input:'b'},
  {id:'b',type:'width',input:'a'},
  {id:'ribbon',type:'ribbon',input:'b',width:1},
  {id:'output',type:'output',input:'ribbon'},
 ],output:'output'};
 assert.throws(()=>compileGeometryGraph(cyc),/cycle/i);
 const thick={version:1,nodes:[
  {id:'source',type:'spline'},
  {id:'ribbon',type:'ribbon',input:'source',width:2,thickness:.3,capEnds:true},
  {id:'output',type:'output',input:'ribbon'},
 ],output:'output'};
 const thickMesh=new GeometryGraphRunner().evaluate(compileGeometryGraph(thick),ctx);
 assert(thickMesh.indices.length>cached.indices.length,
   'Road tessellator thick ribbon produces side volume and caps');
 assert.deepEqual(thickMesh.indices.every(i=>i>=0&&i<thickMesh.positions.length/3),true);
 console.log('GEOMETRY GRAPH V2 PASS: v1 DAG typing, cycles, Road ribbon, width/offset, atomic source cache, dirty propagation and finite bounds.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
