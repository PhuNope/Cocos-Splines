'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),
 tmp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-graph-multi-'));
const vec=(x=0,y=0,z=0)=>({x,y,z});
const frames=Array.from({length:8},(_,i)=>({
 position:vec(0,0,i),forward:vec(0,0,1),right:vec(1),
 up:vec(0,1),distance:i,
}));
const ctx={frames,revision:'v2-spline-rev1',closed:false};
const graph=()=>({version:2,nodes:[
 {id:'source',type:'spline'},
 {id:'width',type:'width',input:'source',multiplier:1},
 {id:'road',type:'ribbon',input:'width',width:4},
 {id:'pipe',type:'tube',input:'width',radius:1,radialSegments:8},
 {id:'outputRoad',type:'output',input:'road'},
 {id:'outputPipe',type:'output',input:'pipe'},
],output:'outputRoad'});
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false',
  '--outDir',tmp],{stdio:'pipe'});
 const {compileGeometryGraph,parseGeometryGraph,GeometryGraphRunner,
 GEOMETRY_GRAPH_VERSION,GEOMETRY_GRAPH_MULTI_OUTPUT_VERSION,
 DEFAULT_GEOMETRY_GRAPH}=require(tmp+'/Core/SplineGeometryGraph.js');
 assert.equal(GEOMETRY_GRAPH_VERSION,1,'legacy default version remains 1');
 assert.equal(GEOMETRY_GRAPH_MULTI_OUTPUT_VERSION,2);
 const original=graph(),raw=JSON.stringify(original);
 const plan=compileGeometryGraph(original);
 assert.equal(plan.version,2);
 assert.deepEqual(plan.outputs,['outputPipe','outputRoad']);
 assert.deepEqual(plan.nodes.map(n=>n.id),
  ['source','width','road','outputRoad','pipe','outputPipe'],
  'Primary output branch precedes secondary branches, with shared source once');
 assert.deepEqual(parseGeometryGraph(raw),plan);
 assert.equal(raw,JSON.stringify(original),'compile is pure');
 const runner=new GeometryGraphRunner();
 const road=runner.evaluate(plan,ctx);
 assert.equal(road.positions.length/3,16,'ribbon output has two vertices per ring');
 assert.deepEqual(runner.metrics,{computed:6,reused:0,nodes:6});
 const pipe=runner.evaluate(plan,ctx,'outputPipe');
 assert.equal(pipe.positions.length/3,8*9,'tube output has radial seam');
 assert.deepEqual(runner.metrics,{computed:0,reused:6,nodes:6},
  'Switching selected output retains all branch caches');
 const both=runner.evaluateOutputs(plan,ctx);
 assert.deepEqual(Object.keys(both),['outputPipe','outputRoad']);
 assert.deepEqual(both.outputRoad,road);
 assert.deepEqual(both.outputPipe,pipe);
 both.outputPipe.positions[0]=999;both.outputRoad.indices[0]=-1;
 assert.deepEqual(runner.evaluateOutputs(plan,ctx).outputRoad,road,
  'evaluateOutputs clones arrays');
 assert.equal(runner.evaluate(plan,ctx,'outputPipe').positions[0],pipe.positions[0]);
 const changed=graph();
 changed.nodes.find(n=>n.id==='pipe').radius=2;
 const bigger=runner.evaluate(compileGeometryGraph(changed),ctx,'outputPipe');
 assert.equal(bigger.positions.length,pipe.positions.length);
 assert.notEqual(bigger.positions[0],pipe.positions[0]);
 assert.deepEqual(runner.metrics,{computed:2,reused:4,nodes:6},
  'Editing pipe only dirties pipe and its output, not the road branch');
 assert.deepEqual(runner.evaluate(compileGeometryGraph(changed),ctx,'outputRoad'),road);
 assert.deepEqual(runner.metrics,{computed:0,reused:6,nodes:6});
 const snapshot=JSON.stringify(runner.evaluateOutputs(compileGeometryGraph(changed),ctx));
 const badSelection=()=>runner.evaluate(plan,ctx,'typoOutput');
 assert.throws(badSelection,/selected Output Node/);
 assert.deepEqual(runner.metrics,{computed:0,reused:6,nodes:6},
  'Rejected selection does not mutate cache');
 const invalidUnused=graph();invalidUnused.nodes.find(n=>n.id==='pipe').radius=-1;
 assert.throws(()=>compileGeometryGraph(invalidUnused),/radius/);
 assert.equal(JSON.stringify(runner.evaluateOutputs(compileGeometryGraph(changed),ctx)),
  snapshot,'invalid branch cannot overwrite successful cache');
 const invalid=[
  {...graph(),version:1},
  {...graph(),version:3},
  {...graph(),output:'pipe'},
  {...graph(),nodes:[...graph().nodes,{id:'orphan',type:'offset',input:'source'}]},
  {...graph(),nodes:[...graph().nodes,{id:'outputExtra',type:'output',input:'pipe'},
   {id:'outputFour',type:'output',input:'road'},
   {id:'outputFive',type:'output',input:'road'}]},
  {...graph(),nodes:graph().nodes.map(n=>n.id==='pipe'?{...n,input:'outputRoad'}:n)},
 ];
 for(const item of invalid)assert.throws(()=>compileGeometryGraph(item));
 const noOutput=graph();noOutput.nodes=noOutput.nodes.filter(n=>n.id!=='outputPipe');
 assert.throws(()=>compileGeometryGraph(noOutput),/2–4/);
 const cyclic=graph();
 cyclic.nodes=cyclic.nodes.map(n=>n.id==='width'?{...n,input:'width'}:n);
 assert.throws(()=>compileGeometryGraph(cyclic),/cycle/i);
 const legacy=parseGeometryGraph(DEFAULT_GEOMETRY_GRAPH);
 assert.equal(legacy.version,undefined);
 assert.deepEqual(new GeometryGraphRunner().evaluateOutputs(legacy,ctx).output,
  new GeometryGraphRunner().evaluate(legacy,ctx));
 assert.throws(()=>new GeometryGraphRunner().evaluate(legacy,ctx,'outputPipe'),
  /selected Output Node/);
 assert(require(root+'/package.json').scripts.test.includes('geometry-graph-multi-output-v2.test.cjs'));
 console.log('MULTI-OUTPUT GRAPH V2 PASS: two branches, stable typing, selected output, shared cache, atomic invalid guards and v1 compatibility.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
