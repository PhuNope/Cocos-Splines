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
 // Processing nodes operate on immutable sampled frames, not source knots.
 const pr=new GeometryGraphRunner();
 const process=(ops,context=ctx)=>pr.evaluate(compileGeometryGraph({
  version:1,output:'output',nodes:[{id:'source',type:'spline'},...ops.map((n,i)=>({
   ...n,id:'p'+i,input:i?'p'+(i-1):'source'})),
   {id:'ribbon',type:'ribbon',input:ops.length?'p'+(ops.length-1):'source',width:4,uvMetersPerRepeat:1},
   {id:'output',type:'output',input:'ribbon'}]
 }),context);
 const original=process([]);
 const reversed=process([{type:'reverse'}]);
 centers(reversed).forEach((p,i)=>p.forEach((x,k)=>near(x,centers(original).at(-1-i)[k])));
 near(reversed.positions[0],2);
 near(Math.max(...reversed.uvs),3);
 assert.deepEqual(process([{type:'reverse'},{type:'reverse'}]).positions,original.positions);
 assert.deepEqual(process([{type:'clip'}]),original);
 const clipped=process([{type:'clip',clipStart:1/6,clipEnd:5/6}]);
 assert.equal(clipped.ringCount,4);
 const cc=centers(clipped);
 near(cc[0][2],.5);near(cc.at(-1)[2],2.5);
 near(Math.max(...clipped.uvs),2);
 const resampled=process([{type:'resample',resampleSegments:6}]);
 assert.equal(resampled.ringCount,7);
 centers(resampled).forEach((p,i)=>near(p[2],i*.5));
 const combined=process([{type:'reverse'},{type:'clip',clipStart:.25,clipEnd:.75},{type:'resample',resampleSegments:4}]);
 centers(combined).forEach((p,i)=>near(p[2],2.25-i*.375));
 near(Math.max(...combined.uvs),1.5);
 assert.deepEqual(process([{type:'reverse'},{type:'clip',clipStart:.25,clipEnd:.75},{type:'resample',resampleSegments:4}]),combined);
 assert.equal(pr.metrics.reused,6);
 const closed={frames:loop,closed:true,revision:'processing-loop'};
 const closedResample=process([{type:'resample',resampleSegments:24}],closed);
 assert.equal(closedResample.ringCount,25);
 closedResample.positions.slice(0,6).forEach((x,k)=>near(x,closedResample.positions.at(-6+k)));
 const openClip=process([{type:'clip',clipStart:.1,clipEnd:.6}],closed);
 assert.notDeepEqual(centers(openClip)[0],centers(openClip).at(-1));
 const scaled={...ctx,worldUvLinear:[-2,0,0,0,3,0,0,0,2]};
 const scaledResample=process([{type:'resample',resampleSegments:6}],scaled);
 near(Math.max(...scaledResample.uvs),6);
 assert.throws(()=>process([{type:'clip',clipStart:.9,clipEnd:.1}]));
 assert.throws(()=>process([{type:'clip',clipStart:null}]));
 for(const count of [2,1025,4.5,null])assert.throws(()=>process([{type:'resample',resampleSegments:count}]));
 assert.throws(()=>process([{type:'resample',resampleSegments:6}],{...ctx,worldUvLinear:[0,0,0,0,1,0,0,0,1]}));
 assert.deepEqual(process([{type:'resample',resampleSegments:6}],scaled),scaledResample);
 assert.equal(JSON.stringify(frames),beforeTransform);
 // Conform pure host contract: explicit targets, nearest valid hit, UV and atomic failure.
 let queries=0;
 const surface={revision:'surface-1',targetCount:1,origin:v(5,10,2),
  raycast:(o,range)=>{queries++;const y=8+(o.z-2)*.5;return [
   {targetIndex:-1,distance:1,point:v(o.x,o.y-1,o.z),normal:v(0,1,0)},
   {targetIndex:0,distance:o.y-y,point:v(o.x,y,o.z),normal:v(0,1,-.5)}
  ];}};
 const conformContext={...ctx,conformSurface:surface};
 const conform=process([{type:'conform'}],conformContext);
 assert.equal(queries,4);
 centers(conform).forEach((p,i)=>{near(p[1],-2+i*.5);near(p[2],i);});
 near(Math.max(...conform.uvs),Math.hypot(3,1.5));
 assert.deepEqual(process([{type:'conform'}],conformContext),conform);
 assert.equal(queries,4);
 const missing={...conformContext,conformSurface:{...surface,revision:'missing',raycast:()=>[]}};
 assert.throws(()=>process([{type:'conform'}],missing),/missed/i);
 assert.deepEqual(process([{type:'conform'}],conformContext),conform);
 assert.deepEqual(process([{type:'conform',conformMissing:1}],missing),process([]));
 assert.throws(()=>process([{type:'conform'}]),/explicit surface/i);
 for(const opts of [{conformRayHeight:0,conformRayDepth:0},{conformAlign:2},{conformOffset:null},{conformMissing:.5}])
  assert.throws(()=>process([{type:'conform',...opts}],conformContext));
 const cclosed={...closed,conformSurface:{...surface,origin:v(),revision:'surface-loop',raycast:o=>[
  {targetIndex:0,distance:o.y+1,point:v(o.x,-1,o.z),normal:v(0,1,0)}]}};
 const seam=process([{type:'conform'}],cclosed);
 seam.positions.slice(0,6).forEach((x,k)=>near(x,seam.positions.at(-6+k)));
 // Independent spline source slots retain per-branch revision and closed state.
 const multiSpline={version:2,output:'oa',nodes:[
  {id:'sa',type:'spline'},{id:'ra',type:'ribbon',input:'sa',width:2},{id:'oa',type:'output',input:'ra'},
  {id:'sb',type:'spline',slot:1},{id:'rb',type:'ribbon',input:'sb',width:2},{id:'ob',type:'output',input:'rb'}]};
 const mrunner=new GeometryGraphRunner(),mplan=compileGeometryGraph(multiSpline);
 const shifted=frames.map(f=>({...f,position:v(10,f.position.y,f.position.z)}));
 const slotB={frames:shifted,closed:false,revision:'B1'};
 const multiCtx={...ctx,splineSources:[ctx,slotB]};
 const multiResult=mrunner.evaluateOutputs(mplan,multiCtx);
 near(multiResult.oa.positions[0],-1);near(multiResult.ob.positions[0],9);
 assert.equal(mrunner.metrics.computed,6);
 const changeB={...multiCtx,splineSources:[ctx,{...slotB,revision:'B2',frames:shifted.map(f=>({...f,position:v(20,0,f.position.z)}))}]};
 const nextMulti=mrunner.evaluateOutputs(mplan,changeB);
 near(nextMulti.ob.positions[0],19);
 assert.deepEqual(nextMulti.oa,multiResult.oa);
 assert.deepEqual(mrunner.metrics,{computed:3,reused:3,nodes:6});
 assert.throws(()=>mrunner.evaluateOutputs(mplan,ctx),/missing Spline source slot 1/i);
 assert.throws(()=>mrunner.evaluateOutputs(mplan,{...ctx,splineSources:[ctx,{...slotB,frames:[]}]}));
 assert.deepEqual(mrunner.evaluateOutputs(mplan,changeB),nextMulti);
 assert.equal(mrunner.metrics.reused,6);
 for(const slot of [0,3,1.5,null])assert.throws(()=>compileGeometryGraph({...multiSpline,nodes:multiSpline.nodes.map(n=>n.id==='sb'?{...n,slot}:n)}));
 const onlyB={version:1,output:'ob',nodes:multiSpline.nodes.slice(3)};
 near(mrunner.evaluate(compileGeometryGraph(onlyB),multiCtx).positions[0],9);
 // Merge two independent sampled paths into one continuous output (V1).
 const joinedGraph={version:1,output:'out',nodes:[
  {id:'sa',type:'spline'},{id:'sb',type:'spline',slot:1},
  {id:'join',type:'mergePath',input:'sa',pathInputB:'sb'},
  {id:'road',type:'ribbon',input:'join',width:2,uvMetersPerRepeat:1},{id:'out',type:'output',input:'road'}]};
 const jr=new GeometryGraphRunner();
 const bframes=frames.map(f=>({...f,position:v(0,0,f.position.z+3)}));
 const jctx={...ctx,splineSources:[ctx,{frames:bframes,closed:false,revision:'joinB'}]};
 const join=(opts={},c=jctx)=>jr.evaluate(compileGeometryGraph({...joinedGraph,nodes:joinedGraph.nodes.map(n=>n.id==='join'?{...n,...opts}:n)}),c);
 const welded=join();
 assert.equal(welded.ringCount,7);
 centers(welded).forEach((p,i)=>near(p[2],i));
 near(Math.max(...welded.uvs),6);
 assert.deepEqual(join(),welded);assert.equal(jr.metrics.reused,5);
 const revB=bframes.slice().reverse().map((f,i)=>({...f,forward:v(0,0,-1),right:v(-1,0,0),distance:i}));
 const revCtx={...jctx,splineSources:[ctx,{frames:revB,closed:false,revision:'reverseB'}]};
 assert.throws(()=>join({},revCtx),/gap/i);
 assert.deepEqual(join({mergeDirection:1},revCtx),welded);
 assert.deepEqual(join({mergeDirection:2},revCtx),welded);
 const gapB=bframes.map(f=>({...f,position:v(0,0,f.position.z+1)}));
 const gapCtx={...jctx,splineSources:[ctx,{frames:gapB,closed:false,revision:'gapB'}]};
 assert.throws(()=>join({},gapCtx),/gap/i);
 const bridged=join({mergeMaxGap:1},gapCtx);assert.equal(bridged.ringCount,8);
 near(Math.max(...bridged.uvs),7);
 const cornerB=bframes.map((f,i)=>({...f,position:v(i,0,3),right:v(0,0,-1),forward:v(1,0,0)}));
 const cornerCtx={...jctx,splineSources:[ctx,{frames:cornerB,closed:false,revision:'cornerB'}]};
 assert.throws(()=>join({mergeMaxAngle:45},cornerCtx),/angle/i);
 const corner=join({mergeMaxAngle:100},cornerCtx);
 assert.equal(corner.ringCount,7);assert(corner.normals.every(Number.isFinite));
 assert.throws(()=>join({}, {...jctx,splineSources:[ctx,{...jctx.splineSources[1],closed:true}]}),/open/i);
 assert.throws(()=>join({pathInputB:'sa'}),/distinct/i);
 assert.throws(()=>join({pathInputB:'road'}),/type/i);
 assert.throws(()=>join({pathInputB:'join'}),/cycle/i);
 assert.throws(()=>join({mergeDirection:1.5}));assert.throws(()=>join({mergeMaxGap:null}));
 assert.deepEqual(join(),welded);
 assert.equal(JSON.stringify(frames),beforeTransform);
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
