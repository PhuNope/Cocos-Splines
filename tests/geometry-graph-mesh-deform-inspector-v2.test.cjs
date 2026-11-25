'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const ribbon=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},{id:'ribbon',type:'ribbon',input:'source',width:3},
 {id:'output',type:'output',input:'ribbon'}],output:'output'});
const element=()=>({events:{},disabled:false,textContent:'',innerHTML:'',hidden:false,
 classList:{toggle(){}},addEventListener(type,handler){this.events[type]=handler;},
 render(){},dispatch(){throw Error('Property dispatch not bound.');},
 setPointerCapture(){},releasePointerCapture(){}});
const ui={$:{}},writes=[];
for(const id of Object.keys(panel.$))ui.$[id]=element();
for(const key of ['graphJson','graphLayoutJson']){
 ui.$['p_'+key].dispatch=function(e){assert.equal(e,'change-dump');writes.push({
  key,value:this.dump.value
 });};
}
const dump={value:{graphJson:{value:ribbon},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null}}};
let src=ribbon,started=0;
const oldEditor=globalThis.Editor;
globalThis.Editor={Message:{request:async (_ext,action)=>{
 if(action==='query-geometry-graph-asset')
  return {ok:true,assetMode:true,assetUuid:'shared-1',graphJson:src,assetName:'DeformPreset'};
 if(action==='begin-shared-geometry-graph-edit'){
  started++;return {ok:true,nodeUuid:'graph-node',assetUuid:'shared-1',
   sha256:'f'.repeat(64),graphJson:src};
 }
 throw Error('Unexpected IPC '+action);
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const getNode=(id)=>model.parseGraph(ui._vgGraphJson).map.get(id);
function select(id){
 ui.$.vgStage.events.click({target:{dataset:{node:id},
  closest(s){return s==='.spl-vg-card'?this:null;}}});
}
function changeParam(key,value){
 ui.$.vgProperties.events.change({target:{dataset:{graphParam:key},value,
  closest(s){return s==='[data-graph-param]'?this:null;}}});
}
async function run(){
 try{
  panel.ready.call(ui);panel.update.call(ui,dump);
  assert.equal(ui.$.vgUseDeform.disabled,false);
  ui.$.vgUseDeform.events.click();
  assert.equal(getNode('meshDeform').width,3);
  assert.equal(ui.$.vgUseDeform.disabled,true);
  assert.equal(writes.length,1);
  assert.equal(writes[0].key,'graphJson');
  select('meshDeform');
  changeParam('deformShape','1');
  changeParam('segments','24');
  changeParam('repeats','3');
  assert.equal(getNode('meshDeform').deformShape,1);
  assert.equal(getNode('meshDeform').segments,24);
  assert.equal(getNode('meshDeform').repeats,3);
  assert.equal(writes.length,4);
  assert.match(ui.$.vgProperties.innerHTML,/Box Shell/);
  changeParam('segments','3.5');
  changeParam('repeats','17');
  changeParam('deformShape','2');
  assert.equal(writes.length,4,'Noninteger or out-of-bounds params cannot commit');
  ui.$.vgAddWidth.events.click();
  assert.deepEqual(model.parseGraph(ui._vgGraphJson).ordered.map(n=>n.type),
   ['spline','width','meshDeform','output']);
  assert.equal(writes.length,5);
  const savedLocal=dump.value.graphJson.value;
  dump.value.useGraphAsset.value=true;
  dump.value.graphAsset.value={uuid:'shared-1'};
  panel.update.call(ui,dump);await tick();
  assert.equal(ui.$.vgUseDeform.disabled,true);
  ui.$.vgUseDeform.events.click();
  assert.equal(writes.length,5,'Shared read-only mode must not mutate graphJson');
  assert.equal(getNode('meshDeform'),undefined);
  ui.$.vgEditShared.events.click();await tick();
  assert.equal(started,1);
  assert(ui._vgSharedDraft);
  assert.equal(ui.$.vgUseDeform.disabled,false);
  ui.$.vgUseDeform.events.click();
  assert(getNode('meshDeform'));
  select('meshDeform');
  changeParam('repeats','5');
  assert.equal(getNode('meshDeform').repeats,5);
  assert.equal(writes.length,5,'Shared draft cannot commit Scene values');
  assert.equal(dump.value.graphJson.value,savedLocal);
  assert.equal(ui.$.vgSaveShared.disabled,false);
  ui.$.vgDiscardShared.events.click();await tick();
  assert(!ui._vgSharedDraft);
  assert.equal(getNode('meshDeform'),undefined);
  assert.equal(dump.value.graphJson.value,savedLocal);
  panel.close.call(ui);
  assert(require(root+'/package.json').scripts.test.includes(
   'geometry-graph-mesh-deform-inspector-v2.test.cjs'));
  console.log('MESH DEFORM GRAPH INSPECTOR V2 PASS: local params, strict bounds, native change-dump, shared draft and discard isolation.');
 }finally{globalThis.Editor=oldEditor;}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
