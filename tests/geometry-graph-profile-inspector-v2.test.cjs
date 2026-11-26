'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const graph=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const basic=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},{id:'ribbon',type:'ribbon',input:'source',width:4},
 {id:'output',type:'output',input:'ribbon'}],output:'output'});
const nodeTypes=[['source','spline'],['ribbon','ribbon'],['output','output']];
const profile=()=>({
 graphVersion:1,outputId:'output',sampledFrames:13,
 cold:{computed:3,reused:0,totalMs:3,
  nodes:nodeTypes.map(([id,type])=>({id,type,cached:false,durationMs:1}))},
 warm:{computed:0,reused:3,totalMs:0,
  nodes:nodeTypes.map(([id,type])=>({id,type,cached:true,durationMs:0}))},
});
function element(){return {
 events:{},disabled:false,textContent:'',innerHTML:'',hidden:false,
 classList:{toggle(){}},addEventListener(event,fn){this.events[event]=fn;},
 dispatch(){throw Error('Native dispatch should be bound manually');},
 render(){},setPointerCapture(){},releasePointerCapture(){},
};}
const ui={$:{}},writes=[];
for(const key of Object.keys(panel.$))ui.$[key]=element();
for(const name of ['graphJson','graphLayoutJson']){
 ui.$['p_'+name].dispatch=function(ev){
  assert.equal(ev,'change-dump');writes.push({name,value:this.dump.value});
 };
}
const dump={value:{graphJson:{value:basic},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null},outputId:{value:''}}};
const original=globalThis.Editor;
let calls=[],resolvePending=null,invalid=false;
globalThis.Editor={Message:{request:async (_ext,message)=>{
 calls.push(message);
 if(message==='profile-geometry-graph'){
  if(resolvePending)return new Promise(resolve=>{const old=resolvePending;resolvePending=v=>{old(v);resolve(v);};});
  return invalid?{ok:true,profile:{...profile(),outputId:'<img onerror=evil()>'}}:
    {ok:true,profile:profile()};
 }
 if(message==='query-geometry-graph-asset')
  return {ok:true,assetMode:true,assetUuid:'shared',graphJson:basic,assetName:'Sample'};
 if(message==='begin-shared-geometry-graph-edit')
  return {ok:true,nodeUuid:'node-1',assetUuid:'shared',sha256:'a'.repeat(64),
   graphJson:basic};
 throw Error('Unexpected IPC '+message);
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function run(){
 try{
  panel.ready.call(ui);panel.update.call(ui,dump);
  assert(ui.$.vgProfile);
  assert.equal(ui.$.vgProfile.disabled,false);
  assert.equal(ui.$.vgProfileReport.textContent,'');
  ui.$.vgProfile.events.click();await tick();
  assert(calls.includes('profile-geometry-graph'));
  assert.match(ui.$.vgProfileReport.textContent,/Cold CPU: 3.000 ms/);
  assert.match(ui.$.vgProfileReport.textContent,/Warm CPU: 0.000 ms/);
  assert.match(ui.$.vgProfileReport.textContent,/ribbon \(ribbon\) \| 1.000 ms \| cached/);
  assert.equal(writes.length,0,'CPU profiling cannot modify ui-prop Scene dumps');
  assert.equal(dump.value.graphJson.value,basic);
  ui.$.vgAddWidth.events.click();
  assert.equal(writes.length,1,'Only intentional graph edit creates a native dump');
  assert.deepEqual(graph.parseGraph(ui._vgGraphJson).ordered.map(n=>n.type),
   ['spline','width','ribbon','output']);
  assert.equal(ui.$.vgProfileReport.textContent,'',
   'Graph edit clears stale diagnostic timings');
  assert.equal(ui._vgProfile,null);
  invalid=true;
  ui.$.vgProfile.events.click();await tick();
  assert.match(ui.$.vgStatus.textContent,/Invalid or oversized/);
  assert(!ui.$.vgProfileReport.textContent.includes('<img'));
  invalid=false;
  ui.$.vgProfile.events.click();await tick();
  assert.match(ui.$.vgProfileReport.textContent,/3.000 ms/);
  dump.value.outputId.value='someOtherOutput';
  panel.update.call(ui,dump);
  assert.equal(ui._vgProfile,null,'Renderer Output ID change invalidates timing');
  dump.value.outputId.value='';
  dump.value.useGraphAsset.value=true;
  dump.value.graphAsset.value={uuid:'shared'};
  panel.update.call(ui,dump);await tick();
  assert.equal(ui.$.vgProfile.disabled,false,
   'Read-only shared asset view permits read-only CPU profiling');
  ui.$.vgEditShared.events.click();await tick();
  assert(ui._vgSharedDraft);
  assert.equal(ui.$.vgProfile.disabled,true,'Unsaved shared draft cannot be profiled as source');
  const before=calls.filter(x=>x==='profile-geometry-graph').length;
  ui.$.vgProfile.events.click();await tick();
  assert.equal(calls.filter(x=>x==='profile-geometry-graph').length,before);
  ui.$.vgDiscardShared.events.click();await tick();
  assert.equal(ui._vgSharedDraft,null);
  assert.equal(ui.$.vgProfile.disabled,false);
  panel.close.call(ui);
  assert.equal(ui._vgProfile,null);
  assert(require(root+'/package.json').scripts.test.includes('geometry-graph-profile-inspector-v2.test.cjs'));
  console.log('GRAPH PROFILE INSPECTOR V2 PASS: read-only cold/warm report, stale invalidation, safe IPC, shared draft guard.');
 }finally{globalThis.Editor=original;}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
