'use strict';
const assert=require('node:assert/strict'),
 cp=require('node:child_process'),os=require('node:os'),
 fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-graph-profile-'));
const frame=(z)=>({position:{x:0,y:0,z},right:{x:1,y:0,z:0},
 up:{x:0,y:1,z:0},forward:{x:0,y:0,z:1},distance:z});
const context={frames:Array.from({length:4},(_,i)=>frame(i)),closed:false,revision:'r1'};
const graph=(width=4)=>({version:2,nodes:[
 {id:'source',type:'spline'},
 {id:'road',type:'ribbon',input:'source',width},
 {id:'tube',type:'tube',input:'source',radius:1,radialSegments:8},
 {id:'outputRoad',type:'output',input:'road'},
 {id:'outputTube',type:'output',input:'tube'},
],output:'outputRoad'});
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json',
  '--noEmit','false','--outDir',temp],{stdio:'pipe'});
 const {compileGeometryGraph,GeometryGraphRunner}=require(
  temp+'/Core/SplineGeometryGraph.js');
 const plan=compileGeometryGraph(graph());
 let tick=0;
 const runner=new GeometryGraphRunner(()=>{const value=tick*.25;tick++;return value;});
 assert.equal(runner.profile,null,'Profiling disabled by default');
 const basic=runner.evaluate(plan,context);
 assert.equal(runner.profile,null,'No timing overhead when disabled');
 runner.setProfilingEnabled(true);
 runner.evaluate(plan,context);
 let report=runner.profile;
 assert.deepEqual([report.computed,report.reused],[0,5]);
 assert(report.nodes.every(n=>n.cached&&n.durationMs===0));
 assert.equal(report.totalMs,0);
 const coldRunner=new GeometryGraphRunner(()=>{const value=tick*.25;tick++;return value;});
 coldRunner.setProfilingEnabled(true);
 const coldMesh=coldRunner.evaluate(plan,context,'outputTube');
 const cold=coldRunner.profile;
 assert.deepEqual([cold.computed,cold.reused,cold.nodes.length],[5,0,5]);
 assert.equal(cold.totalMs,1.25);
 assert.deepEqual(cold.nodes.map(n=>n.durationMs),[.25,.25,.25,.25,.25]);
 assert(cold.nodes.every(n=>!n.cached));
 assert.equal(cold.nodes.find(n=>n.id==='tube').type,'tube');
 const safety=coldRunner.profile;
 safety.nodes[0].durationMs=300;
 safety.nodes.pop();
 assert.deepEqual(coldRunner.profile,cold,'Caller must not mutate internal profile');
 assert.equal(JSON.stringify(coldMesh.positions)===JSON.stringify(basic.positions),false,
  'Different output mesh geometry');
 const warmMesh=coldRunner.evaluate(plan,context,'outputRoad');
 const warm=coldRunner.profile;
 assert.deepEqual([warm.computed,warm.reused,warm.totalMs],[0,5,0]);
 assert(warm.nodes.every(n=>n.cached&&n.durationMs===0));
 assert.deepEqual(warmMesh,basic);
 const changed=compileGeometryGraph(graph(5));
 coldRunner.evaluate(changed,context,'outputRoad');
 const dirty=coldRunner.profile;
 assert.equal(dirty.computed,2);
 assert.equal(dirty.reused,3);
 assert.equal(dirty.totalMs,.5);
 assert.deepEqual(dirty.nodes.filter(n=>!n.cached).map(n=>n.id),['road','outputRoad']);
 const previous=JSON.stringify(coldRunner.profile);
 assert.throws(()=>coldRunner.evaluate(changed,{
  ...context,revision:'bad',frames:[frame(0),{...frame(1),right:{x:0,y:0,z:0}}]
 },'outputRoad'),/degenerate/);
 assert.equal(JSON.stringify(coldRunner.profile),previous,
  'Failed node evaluation cannot overwrite last successful profile');
 assert.throws(()=>coldRunner.evaluate(changed,context,'unknown'),/selected Output Node/);
 assert.equal(JSON.stringify(coldRunner.profile),previous);
 const all=coldRunner.evaluateOutputs(changed,context);
 assert.deepEqual(Object.keys(all),['outputRoad','outputTube']);
 assert.equal(coldRunner.profile.totalMs,0);
 coldRunner.setProfilingEnabled(false);
 coldRunner.evaluate(changed,context);
 assert.deepEqual(coldRunner.profile.nodes.map(n=>n.cached),
  Array(5).fill(true),'Disabling does not force a profile update');
 coldRunner.clear();
 assert.equal(coldRunner.profile,null);
 const nanRunner=new GeometryGraphRunner(()=>NaN);
 nanRunner.setProfilingEnabled(true);
 nanRunner.evaluate(plan,context);
 assert.equal(nanRunner.profile.totalMs,0,'Unavailable monotonic clock is safe');
 assert(require(root+'/package.json').scripts.test.includes('geometry-graph-node-profile-v2.test.cjs'));
 console.log('GRAPH NODE PROFILE V2 PASS: opt-in clock, cold/warm, cache dirty propagation, snapshot immutability and failure rollback.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
