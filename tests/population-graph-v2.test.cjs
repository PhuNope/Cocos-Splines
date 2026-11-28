'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'population-graph-'));
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false','--outDir',dir],{stdio:'pipe'});
 const {compilePopulationGraph,parsePopulationGraph,PopulationGraphRunner,DEFAULT_POPULATION_GRAPH,populationGraphPorts}=require(dir+'/Core/SplinePopulationGraph.js');
 const {populationGate,planPopulation}=require(dir+'/Core/SplinePopulationMath.js');
 const {selectWeightedPrefab}=require(dir+'/Core/SplinePopulationPlacementMath.js');
 const v=(x=0,y=0,z=0)=>({x,y,z});
 const frame=x=>({position:v(x),forward:v(1),up:v(0,1),distance:x});
 const source={frames:[frame(0),frame(1),frame(10)],revision:'one',closed:false};
 const ctx={sources:[source],prefabSlotCount:2};
 const graph={version:1,output:'out',nodes:[
  {id:'path',type:'spline'},{id:'count',type:'count',input:'path',count:11},
  {id:'filter',type:'density',input:'count',density:.75,seed:19,exclusions:[{startProgress:.2,endProgress:.4}],minWorldSpacing:1.5},
  {id:'variant',type:'prefab',input:'filter',weights:[1,3],seed:55},{id:'out',type:'output',input:'variant'}
 ]};
 const runner=new PopulationGraphRunner(),plan=compilePopulationGraph(graph);
 const first=runner.evaluate(plan,ctx),expected=planPopulation(Array.from({length:11},(_,index)=>({index,progress:index/10,position:v(index)})),{density:.75,seed:19,exclusions:graph.nodes[2].exclusions,minWorldSpacing:1.5,densityKeys:[],closed:false});
 assert.deepEqual(first.instances.map(p=>p.index),expected);
 for(const p of first.instances){assert.equal(p.position.x,p.index);assert.equal(p.distance,p.index);assert.equal(p.prefabSlot,selectWeightedPrefab([1,3],populationGate(55,p.index)));}
 assert.deepEqual(first.metrics,{computed:5,reused:0,nodes:5});
 assert.deepEqual(runner.evaluate(plan,ctx).metrics,{computed:0,reused:5,nodes:5});
 const before=JSON.stringify(first.instances);
 first.instances[0].position.x=999;
 assert.equal(JSON.stringify(runner.evaluate(plan,ctx).instances),before);
 const edited=JSON.parse(JSON.stringify(graph));edited.nodes[3].weights=[0,1];
 const changed=runner.evaluate(compilePopulationGraph(edited),ctx);
 assert.deepEqual(changed.metrics,{computed:2,reused:3,nodes:5});assert(changed.instances.every(x=>x.prefabSlot===1));
 const metrics=runner.metrics;
 assert.throws(()=>runner.evaluate(plan,{...ctx,prefabSlotCount:1}),/weights|weighted/i);
 assert.deepEqual(runner.metrics,metrics);
 assert.deepEqual(runner.evaluate(compilePopulationGraph(edited),ctx).metrics,{computed:0,reused:5,nodes:5});
 const reverse={...graph,nodes:[...graph.nodes].reverse()};assert.deepEqual(compilePopulationGraph(reverse).nodes,plan.nodes);
 assert.equal(Object.isFrozen(plan.nodes[2].exclusions),true);
 assert.deepEqual(populationGraphPorts('prefab'),{input:'candidates',output:'instances'});
 for(const mutate of [
  g=>g.nodes[1].input='variant',g=>g.nodes[2].input='filter',g=>g.nodes[2].input='missing',
  g=>g.nodes.push({id:'dead',type:'spline'}),g=>g.nodes[1].count=2049,g=>g.nodes[3].weights=[0,0],
  g=>g.nodes[0].script='evil',g=>g.nodes[0].type='constructor',g=>g.nodes[1].id='path'
 ]){const bad=JSON.parse(JSON.stringify(graph));mutate(bad);assert.throws(()=>compilePopulationGraph(bad));}
 const closed={closed:true,revision:'loop',frames:[frame(0),frame(5),{...frame(10),position:v(0)}]};
 const defaultPlan=parsePopulationGraph(DEFAULT_POPULATION_GRAPH);
 const loop=runner.evaluate(defaultPlan,{sources:[closed],prefabSlotCount:1}).instances;
 assert.equal(loop.length,10);assert.equal(loop[9].progress,.9);
 assert.throws(()=>runner.evaluate(defaultPlan,{sources:[{...closed,frames:[frame(0),frame(10)]}],prefabSlotCount:1}),/closed path/i);
 const one=JSON.parse(DEFAULT_POPULATION_GRAPH);one.nodes[1].count=1;
 assert.equal(runner.evaluate(compilePopulationGraph(one),{sources:[source],prefabSlotCount:1}).instances[0].progress,0);
 const example=JSON.parse(fs.readFileSync(root+'/examples/installable/Population/BasicPopulationGraph.json','utf8'));
 assert(runner.evaluate(compilePopulationGraph(example),ctx).instances.length>0);
 // Distribution nodes and range masks preserve stable candidate indexes.
 const {distributionDistances,inPopulationProgressRange}=require(dir+'/Core/SplinePopulationDistributionMath.js');
 const distribute=(node,range)=>compilePopulationGraph({version:1,output:'out',nodes:[
  {id:'path',type:'spline'},{id:'dist',input:'path',...node},
  ...(range?[{id:'range',type:'range',input:'dist',...range}]:[]),
  {id:'variant',type:'prefab',input:range?'range':'dist',weights:[1,3],seed:55},
  {id:'out',type:'output',input:'variant'}]});
 const samples=(node,range,context=ctx)=>runner.evaluate(distribute(node,range),context).instances;
 assert.deepEqual(samples({type:'spacing',spacing:3}).map(p=>p.distance),[0,3,6,9]);
 assert.deepEqual(samples({type:'spacing',spacing:3,includeEnd:true}).map(p=>p.distance),[0,3,6,9,10]);
 assert.deepEqual(samples({type:'spacing',spacing:5,includeEnd:true}).map(p=>p.distance),[0,5,10]);
 assert.deepEqual(samples({type:'spacing',spacing:5,includeEnd:true},null,{...ctx,sources:[closed]}).map(p=>p.distance),[0,5]);
 assert.deepEqual(samples({type:'spacing',spacing:20,includeEnd:true}).map(p=>p.distance),[0,10]);
 const random={type:'random',count:32,seed:19};
 const randomAll=samples(random);
 assert.deepEqual(samples(random),randomAll);
 assert(randomAll.some((p,i)=>i>0&&p.progress<randomAll[i-1].progress));
 assert(randomAll.every(p=>p.progress>=0&&p.progress<1&&Math.abs(p.position.x-p.distance)<1e-9));
 assert.notDeepEqual(samples({...random,seed:20}).map(p=>p.progress),randomAll.map(p=>p.progress));
 const ranged=samples(random,{startProgress:.2,endProgress:.7});
 assert.deepEqual(ranged,randomAll.filter(p=>p.progress>=.2&&p.progress<.7));
 const countNode={type:'count',count:11};
 assert.deepEqual(samples(countNode,{startProgress:.7,endProgress:1}).map(p=>p.index),[7,8,9,10]);
 assert.deepEqual(samples(countNode,{startProgress:.4,endProgress:.4}),[]);
 assert.throws(()=>samples(countNode,{startProgress:.8,endProgress:.2}),/closed path/i);
 const closedCtx={...ctx,sources:[closed]};
 assert.deepEqual(samples({type:'count',count:10},{startProgress:.8,endProgress:.2},closedCtx).map(p=>p.index),[0,1,8,9]);
 assert.deepEqual(samples({type:'count',count:10},{startProgress:0,endProgress:1},closedCtx).map(p=>p.index),Array.from({length:10},(_,i)=>i));
 assert.equal(inPopulationProgressRange(0,1,0,true),false);
 const centered=samples({type:'jitter',count:4,jitter:0});
 assert.deepEqual(centered.map(p=>p.distance),[1.25,3.75,6.25,8.75]);
 const jitter={type:'jitter',count:32,jitter:1,seed:7};
 const jittered=samples(jitter);
 assert(jittered.every((p,i)=>p.progress>=i/32&&p.progress<(i+1)/32));
 assert.deepEqual(samples(jitter),jittered);
 assert.notDeepEqual(jittered.map(p=>p.progress),samples({...jitter,seed:8}).map(p=>p.progress));
 assert.equal(distributionDistances(2048,true,{type:'spacing',spacing:1}).length,2048);
 assert.throws(()=>distributionDistances(2048,false,{type:'spacing',spacing:1,includeEnd:true}),/2048/i);
 assert.throws(()=>samples({type:'spacing',spacing:.001}),/2048/i);
 for(const node of [{type:'spacing',spacing:0},{type:'random',count:2049},{type:'jitter',count:4,jitter:1.1},{type:'random',count:4,seed:1.5}])assert.throws(()=>distribute(node));
 assert.throws(()=>distribute(countNode,{startProgress:-1,endProgress:1}));
 const good=distribute(random,{startProgress:.2,endProgress:.7});
 runner.evaluate(good,ctx);
 const changedRange=runner.evaluate(distribute(random,{startProgress:.3,endProgress:.7}),ctx);
 assert.deepEqual(changedRange.metrics,{computed:3,reused:2,nodes:5});
 const lastMetrics=runner.metrics;
 assert.throws(()=>samples(countNode,{startProgress:.8,endProgress:.2}),/closed path/i);
 assert.deepEqual(runner.metrics,lastMetrics);
 assert.deepEqual(runner.evaluate(distribute(random,{startProgress:.3,endProgress:.7}),ctx).metrics,{computed:0,reused:5,nodes:5});
 for(const file of ['SpacingPopulationGraph','RandomPopulationGraph','JitterPopulationGraph']){
  const g=JSON.parse(fs.readFileSync(root+'/examples/installable/Population/'+file+'.json','utf8'));
  assert(runner.evaluate(compilePopulationGraph(g),ctx).instances.length>0);
 }
 console.log('POPULATION GRAPH V2 PASS: typed DAG, arc-count placement, shared policy, deterministic prefab slots, cache and rollback.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
