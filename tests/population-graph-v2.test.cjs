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
 // Transform/filter pipeline with host snapshots. Preserve candidate identity,
 // surface miss handling, normal alignment, scale, RNG and atomic cache.
 const chain=(stages)=>compilePopulationGraph({version:1,output:'out',nodes:[
  {id:'path',type:'spline'},{id:'dist',type:'count',input:'path',count:5},
  ...stages.map((s,i)=>({id:'stage'+i,input:i?'stage'+(i-1):'dist',...s})),
  {id:'variant',type:'prefab',input:stages.length?'stage'+(stages.length-1):'dist',weights:[1,3],seed:55},
  {id:'out',type:'output',input:'variant'}]});
 const run=(stages,context=ctx)=>runner.evaluate(chain(stages),context).instances;
 const base=run([]);
 const localOffset=run([{type:'offset',offset:v(2,3,4)}]);
 assert.deepEqual(localOffset[0].position,v(4,3,-2));
 assert.deepEqual(run([{type:'offset',offset:v(2,3,4),space:'world'}])[0].position,v(2,3,4));
 const yaw={type:'rotation',minDegrees:v(0,90,0),maxDegrees:v(0,90,0)};
 const rotated=run([yaw]);assert(Math.abs(rotated[0].forward.z+1)<1e-9);
 assert(Math.abs(rotated[0].forward.x)<1e-9);
 const randomRotation={type:'rotation',minDegrees:v(-20,-180,-15),maxDegrees:v(20,180,15),seed:23};
 const randomScale={type:'scale',minScale:.5,maxScale:1.5,seed:23};
 const transforms=[randomRotation,randomScale];
 const transformed=run(transforms);
 assert.deepEqual(run(transforms),transformed);
 assert.notDeepEqual(run([{...randomRotation,seed:24},randomScale]),transformed);
 assert(transformed.every(p=>p.scale>=.5&&p.scale<=1.5&&Math.abs(Math.hypot(p.forward.x,p.forward.y,p.forward.z)-1)<1e-9&&Math.abs(p.up.x*p.forward.x+p.up.y*p.forward.y+p.up.z*p.forward.z)<1e-9));
 assert.deepEqual(run([{type:'range',startProgress:.25,endProgress:.75},...transforms]),transformed.filter(p=>p.progress>=.25&&p.progress<.75));
 assert.deepEqual(run(transforms).map(p=>p.prefabSlot),base.map(p=>p.prefabSlot));
 assert.equal(run([{type:'scale',minScale:2,maxScale:2},{type:'scale',minScale:3,maxScale:3}])[0].scale,6);
 assert.deepEqual(run([yaw,{type:'align',alignment:'world'}])[0].forward,v(0,0,1));
 let rayCount=0;
 const surface={revision:'surface-a',targetCount:1,raycast:(origin,length)=>{
  rayCount++;assert.equal(length,15);
  if(origin.x===5)return [];
  return [{targetIndex:99,distance:1,point:v(origin.x,4,origin.z),normal:v(0,1)},
   {targetIndex:0,distance:3,point:v(origin.x,2,origin.z),normal:v(0,1,1)}];
 }};
 const ground={type:'surface',surfaceOffset:1,skipMissing:true},align={type:'align',alignment:'surface'};
 const obstacles={revision:'obstacle-a',shapes:[{kind:'aabb',bounds:{center:v(2.5,2+Math.SQRT1_2,Math.SQRT1_2),halfExtents:v(.1,.1,.1)}}]};
 const surfaceCtx={...ctx,surface,obstacles};
 const projected=run([ground,align],surfaceCtx);
 assert.deepEqual(projected.map(p=>p.index),[0,1,3,4]);
 assert(Math.abs(projected[0].up.y-Math.SQRT1_2)<1e-9);
 assert(Math.abs(projected[0].position.y-2-Math.SQRT1_2)<1e-9);
 const keepMiss=run([{...ground,skipMissing:false},align],surfaceCtx);
 assert.equal(keepMiss[2].surfaceNormal,null);assert.deepEqual(keepMiss[2].position,base[2].position);
 const filteredStages=[ground,align,{type:'obstacle',clearance:0,footprintRadius:0},randomScale];
 const filtered=run(filteredStages,surfaceCtx);
 assert.deepEqual(filtered.map(p=>p.index),[0,3,4]);
 assert.deepEqual(filtered.map(p=>p.prefabSlot),base.filter(p=>[0,3,4].includes(p.index)).map(p=>p.prefabSlot));
 const rays=rayCount;assert.deepEqual(run(filteredStages,surfaceCtx),filtered);assert.equal(rayCount,rays);
 const changedObstacle={...surfaceCtx,obstacles:{revision:'obstacle-b',shapes:[]}};
 const changedFilter=runner.evaluate(chain(filteredStages),changedObstacle);
 assert.deepEqual(changedFilter.instances.map(p=>p.index),[0,1,3,4]);
 assert.deepEqual(changedFilter.metrics,{computed:4,reused:4,nodes:8});assert.equal(rayCount,rays);
 const changedSurface={...changedObstacle,surface:{...surface,revision:'surface-b'}};
 runner.evaluate(chain(filteredStages),changedSurface);assert.equal(rayCount,rays+5);
 const last=runner.metrics;
 assert.throws(()=>run(filteredStages,{...changedSurface,surface:{...surface,revision:'fail',raycast:()=>{throw Error('ray failed');}}}),/ray failed/);
 assert.deepEqual(runner.metrics,last);
 assert.throws(()=>run(filteredStages,ctx),/surface snapshot/i);
 assert.throws(()=>run([{type:'obstacle'}],ctx),/obstacle snapshot/i);
 const copy=run(filteredStages,changedSurface);copy[0].surfaceNormal.y=100;
 assert(Math.abs(run(filteredStages,changedSurface)[0].surfaceNormal.y-Math.SQRT1_2)<1e-9);
 for(const bad of [{type:'offset',offset:v(10001)},{type:'rotation',minDegrees:v(1),maxDegrees:v(0)},{type:'scale',minScale:0,maxScale:1},{type:'align',alignment:'bad'},{type:'surface',rayHeight:0,rayDepth:0},{type:'obstacle',footprintRadius:101}])assert.throws(()=>chain([bad]));
 assert(Object.isFrozen(chain([yaw]).nodes[2].minDegrees));
 const transformExample=JSON.parse(fs.readFileSync(root+'/examples/installable/Population/TransformPopulationGraph.json','utf8'));
 assert(runner.evaluate(compilePopulationGraph(transformExample),ctx).instances.length>0);
 const surfaceExample=JSON.parse(fs.readFileSync(root+'/examples/installable/Population/SurfacePopulationGraph.json','utf8'));
 assert(runner.evaluate(compilePopulationGraph(surfaceExample),surfaceCtx).instances.length>0);
 // Exact trace from cached values, with no extra raycasts or RNG pass.
 const tracePlan=chain([{type:'range',startProgress:0,endProgress:.8},ground,align,{type:'obstacle',clearance:0}, {type:'density',density:0}]);
 const traceBefore=rayCount;const traced=runner.evaluate(tracePlan,surfaceCtx,true);
 assert.equal(rayCount,traceBefore+4);assert.equal(traced.instances.length,0);
 assert.deepEqual(traced.diagnostics.map(d=>d.reason),['density','collider','surface','density','exclusion']);
 assert.deepEqual(traced.stages.map(s=>[s.type,s.input,s.output,s.rejected]),[['count',0,5,0],['range',5,4,1],['surface',4,3,1],['align',3,3,0],['obstacle',3,2,1],['density',2,0,2],['prefab',0,0,0],['output',0,0,0]]);
 assert(Math.abs(traced.diagnostics[1].position.y-2-Math.SQRT1_2)<1e-9);
 const traceRays=rayCount,again=runner.evaluate(tracePlan,surfaceCtx,true);assert.equal(rayCount,traceRays);assert.deepEqual(again.diagnostics,traced.diagnostics);
 traced.diagnostics[1].position.y=999;traced.stages[1].examples[0]=999;
 assert.deepEqual(runner.evaluate(tracePlan,surfaceCtx,true).diagnostics,again.diagnostics);
 assert.deepEqual(runner.evaluate(tracePlan,surfaceCtx,true).stages,again.stages);
 assert.equal(runner.evaluate(tracePlan,surfaceCtx).diagnostics,undefined);
 // Visual model parity with the authoritative runtime compiler.
 const visual=require(root+'/dist/SplinePopulationGraphVisualModel.js');
 let visualText=DEFAULT_POPULATION_GRAPH;
 for(const type of visual.DISTRIBUTIONS){
  visualText=visual.edit(visualText,{kind:'distribution',id:'distribution',type});
  parsePopulationGraph(visualText);
 }
 for(const type of visual.FILTERS){
  visualText=visual.edit(visualText,{kind:'insert',id:'distribution',type});
  parsePopulationGraph(visualText);
 }
 const ordered=visual.parse(visualText);
 assert.equal(ordered.nodes.length,4+visual.FILTERS.length);
 const filter=ordered.nodes[2].id;
 visualText=visual.edit(visualText,{kind:'move',id:filter,delta:1});
 parsePopulationGraph(visualText);
 visualText=visual.edit(visualText,{kind:'remove',id:filter});parsePopulationGraph(visualText);
 assert.throws(()=>visual.edit(visualText,{kind:'remove',id:'source'}));
 assert.throws(()=>visual.edit(visualText,{kind:'insert',id:'output',type:'offset'}));
 assert.throws(()=>visual.edit(visualText,{kind:'parameters',id:'distribution',params:{count:0}}));
 for(const file of fs.readdirSync(root+'/examples/installable/Population').filter(f=>f.endsWith('Graph.json'))){
  const text=fs.readFileSync(root+'/examples/installable/Population/'+file,'utf8');
  assert.deepEqual(visual.parse(text).nodes,parsePopulationGraph(text).nodes);
 }
 // Fake Inspector: native dump commit, read-only shared asset, invalid edits.
 const panel=require(root+'/dist/contributions/inspector/ObjectController.js');
 const el=()=>({events:{},innerHTML:'',textContent:'',value:'',disabled:false,hidden:false,addEventListener(k,fn){this.events[k]=fn;},render(){},querySelectorAll(){return this.widgets||[];}});
 const inspector={$:{}},commits=[];
 for(const k of Object.keys(panel.$))inspector.$[k]=el();
 const dump={value:{usePopulationGraph:{value:true},populationGraphAsset:{value:null},populationGraphJson:{value:DEFAULT_POPULATION_GRAPH}}};
 inspector.$.p_populationGraphJson.dispatch=function(event){assert.equal(event,'change-dump');assert.equal(this.dump,dump.value.populationGraphJson);commits.push(this.dump.value);};
 panel.ready.call(inspector);panel.update.call(inspector,dump);
 assert(inspector.$.pgChain.innerHTML.includes('data-pg-node="distribution"'));
 assert.equal(inspector.$.pgRemove.disabled,true);
 inspector.$.pgFilter.value='offset';inspector.$.pgInsert.events.click();
 assert.equal(commits.length,1);parsePopulationGraph(commits[0]);
 const select=id=>inspector.$.pgChain.events.click({target:{closest:()=>({dataset:{pgNode:id}})}});
 select('offset1');inspector.$.pgFields.widgets=[{dataset:{pgParam:'offset'},value:'{"x":2,"y":0,"z":0}'},{dataset:{pgParam:'space'},value:'world'}];
 inspector.$.pgApply.events.click();assert.equal(commits.length,2);
 assert.deepEqual(visual.parse(commits[1]).nodes.find(n=>n.id==='offset1').offset,{x:2,y:0,z:0});
 inspector.$.pgFields.widgets[0].value='{"x":99999,"y":0,"z":0}';inspector.$.pgApply.events.click();assert.equal(commits.length,2);
 dump.value.populationGraphAsset.value={uuid:'shared'};panel.update.call(inspector,dump);
 inspector.$.pgInsert.events.click();assert.equal(commits.length,2);assert(inspector.$.pgInsert.disabled);
 dump.value.populationGraphAsset.value=null;dump.value.populationGraphJson.values=[commits[1],commits[1]];panel.update.call(inspector,dump);
 inspector.$.pgRemove.events.click();assert.equal(commits.length,2);
 panel.close.call(inspector);
 console.log('POPULATION GRAPH V2 PASS: typed DAG, arc-count placement, shared policy, deterministic prefab slots, cache and rollback.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
