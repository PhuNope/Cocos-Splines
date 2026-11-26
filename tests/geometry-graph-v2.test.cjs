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
 // Transform identity, rotation, path-only scale, metric and cache isolation.
 const transformGraph={version:1,output:'output',nodes:[
  {id:'source',type:'spline'},{id:'transform',type:'transform',input:'source'},
  {id:'ribbon',type:'ribbon',input:'transform',width:4,uvMetersPerRepeat:1},
  {id:'output',type:'output',input:'ribbon'}]};
 const tr=new GeometryGraphRunner();
 const evaluateTransform=(params={},context=ctx)=>tr.evaluate(compileGeometryGraph({
  ...transformGraph,nodes:transformGraph.nodes.map(n=>n.id==='transform'?{...n,...params}:n)
 }),context);
 const identity=evaluateTransform();
 assert.deepEqual(identity.positions,cached.positions);
 const beforeTransform=JSON.stringify(frames);
 const translated=evaluateTransform({translateX:3,translateY:2,translateZ:1,pathScale:2});
 assert.deepEqual(translated.positions.slice(0,6),[1,2,1,5,2,1]);
 assert.deepEqual(translated.positions.slice(-6),[1,2,7,5,2,7]);
 assert(Math.max(...translated.uvs)>Math.max(...identity.uvs));
 assert.deepEqual(tr.metrics,{computed:3,reused:1,nodes:4});
 evaluateTransform({translateX:3,translateY:2,translateZ:1,pathScale:2});
 assert.equal(tr.metrics.reused,4);
 const rotatedMesh=evaluateTransform({rotateY:90});
 const near=(a,b)=>assert(Math.abs(a-b)<1e-8,a+' != '+b);
 near(rotatedMesh.positions[2],2);
 near(rotatedMesh.positions[5],-2);
 near(rotatedMesh.positions.at(-6),3);
 const anisotropic=evaluateTransform({rotateY:90},{...ctx,worldUvLinear:[2,0,0,0,1,0,0,0,1]});
 near(Math.max(...anisotropic.uvs),6);
 assert.equal(tr.metrics.reused,1,'World metric changes invalidate Transform only downstream');
 assert.equal(JSON.stringify(frames),beforeTransform);
 for(const params of [{pathScale:0},{pathScale:-1},{rotateX:361},{translateY:Infinity},{unknown:1}])
  assert.throws(()=>evaluateTransform(params));
 assert.throws(()=>evaluateTransform({rotateY:90},{...ctx,worldUvLinear:[1]}));
 assert.deepEqual(evaluateTransform({rotateY:90},{...ctx,worldUvLinear:[2,0,0,0,1,0,0,0,1]}),anisotropic);
 // Noise Path: deterministic displacement, metric, seam, nonuniform world frame, cache.
 const noiseGraph={version:1,output:'output',nodes:[
  {id:'source',type:'spline'},{id:'noise',type:'noise',input:'source'},
  {id:'ribbon',type:'ribbon',input:'noise',width:4,uvMetersPerRepeat:1},
  {id:'output',type:'output',input:'ribbon'}]};
 const dense=Array.from({length:33},(_,i)=>({position:v(0,0,i/4),
  right:v(1),up:v(0,1),forward:v(0,0,1),distance:i/4}));
 const nctx={frames:dense,closed:false,revision:'noise-open'};
 const nr=new GeometryGraphRunner();
 const runNoise=(params={},context=nctx)=>nr.evaluate(compileGeometryGraph({
  ...noiseGraph,nodes:noiseGraph.nodes.map(n=>n.id==='noise'?{...n,...params}:n)
 }),context);
 const plain=runNoise(),snapshotFrames=JSON.stringify(dense);
 const settings={noiseRight:.5,noiseUp:.3,noiseFrequency:2,noiseOctaves:2,noiseSeed:7,noiseFadeEnds:.15};
 const noisy=runNoise(settings);
 assert.notDeepEqual(noisy.positions,plain.positions);
 assert.deepEqual(nr.metrics,{computed:3,reused:1,nodes:4});
 assert.deepEqual(runNoise(settings),noisy);
 assert.equal(nr.metrics.reused,4);
 assert.notDeepEqual(runNoise({...settings,noiseSeed:8}).positions,noisy.positions);
 assert.deepEqual(runNoise(settings),noisy);
 const centers=m=>Array.from({length:m.ringCount},(_,i)=>[0,1,2].map(k=>(m.positions[6*i+k]+m.positions[6*i+k+3])/2));
 const nc=centers(noisy);
 nc[0].forEach((x,k)=>near(x,[0,0,0][k]));
 nc.at(-1).forEach((x,k)=>near(x,[0,0,8][k]));
 assert(Math.max(...noisy.uvs)>Math.max(...plain.uvs));
 assert.equal(JSON.stringify(dense),snapshotFrames);
 for(const params of [{noiseSeed:1.5},{noiseFrequency:0},{noiseOctaves:7},{noiseFadeEnds:.6},{noiseUp:null},{noisePersistence:2}])
  assert.throws(()=>runNoise(params));
 assert.throws(()=>runNoise(settings,{...nctx,worldUvLinear:[0,0,0,0,1,0,0,0,1]}));
 const anis=runNoise(settings,{...nctx,worldUvLinear:[-2,0,0,0,3,0,0,0,1]});
 for(let i=0;i<anis.ringCount;i++){
  const p=anis.positions.slice(i*6,i*6+6);
  near(Math.hypot((p[3]-p[0])*2,(p[4]-p[1])*3,p[5]-p[2]),4);
 }
 const loop=Array.from({length:65},(_,i)=>{
  const t=i===64?0:i*Math.PI/32;
  return {position:v(4*Math.sin(t),0,4*Math.cos(t)),forward:v(Math.cos(t),0,-Math.sin(t)),
   right:v(-Math.sin(t),0,-Math.cos(t)),up:v(0,1),distance:i*8*Math.PI/64};
 });
 const loopMesh=runNoise(settings,{frames:loop,closed:true,revision:'noise-loop'});
 loopMesh.positions.slice(0,6).forEach((x,k)=>near(x,loopMesh.positions.at(-6+k)));
 assert.deepEqual(runNoise(settings,{frames:loop,closed:true,revision:'noise-loop'}),loopMesh);
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
