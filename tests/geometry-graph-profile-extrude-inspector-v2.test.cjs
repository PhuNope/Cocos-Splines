'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const graph=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},{id:'ribbon',type:'ribbon',input:'source',width:3},
 {id:'output',type:'output',input:'ribbon'}],output:'output'});
function el(){return {events:{},innerHTML:'',textContent:'',disabled:false,hidden:false,
 classList:{toggle(){}},addEventListener(name,cb){this.events[name]=cb;},
 render(){},dispatch(){throw Error('Uninitialized native property widget.');},
 setPointerCapture(){},releasePointerCapture(){}};}
const ui={$:{}},writes=[];
for(const k of Object.keys(panel.$))ui.$[k]=el();
const dump={value:{graphJson:{value:graph},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null}}};
for(const name of ['graphJson','graphLayoutJson']){
 ui.$['p_'+name].dispatch=function(event){
  assert.equal(event,'change-dump');writes.push({key:name,value:this.dump.value});
 };
}
const beforeEditor=globalThis.Editor;
globalThis.Editor={Message:{request:async(_pkg,method)=>{
 if(method==='query-geometry-graph-asset')
  return {ok:true,assetMode:true,graphJson:graph,assetName:'SharedProfile.json'};
 if(method==='begin-shared-geometry-graph-edit')
  return {ok:true,nodeUuid:'node-1',assetUuid:'shared-1',
   graphJson:graph,sha256:'f'.repeat(64)};
 throw Error('Unexpected IPC '+method);
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function types(){return model.parseGraph(ui._vgGraphJson).ordered.map(n=>n.type);}
function select(id){
 const target={dataset:{node:id},closest(s){return s==='.spl-vg-card'?this:null;}};
 ui.$.vgStage.events.click({target});
}
function param(key,value){
 ui.$.vgProperties.events.change({target:{dataset:{graphParam:key},value,
  closest(s){return s==='[data-graph-param]'?this:null;}}});
}
async function run(){
 try{
  panel.ready.call(ui);panel.update.call(ui,dump);
  assert.equal(ui.$.vgUseExtrude.disabled,false);
  assert.equal(ui.$.vgSwitchGenerator.disabled,false);
  ui.$.vgUseExtrude.events.click();
  assert.deepEqual(types(),['spline','extrude','output']);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('extrude').width,3);
  assert.equal(writes.length,1,'single native graph commit');
  assert.equal(writes[0].key,'graphJson');
  assert.equal(ui.$.vgUseExtrude.disabled,true);
  assert.equal(ui.$.vgSwitchGenerator.disabled,false);
  select('extrude');
  param('height','2.5');
  param('profileShape','2');
  assert.equal(writes.length,3);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('extrude').height,2.5);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('extrude').profileShape,2);
  assert.match(ui.$.vgProperties.innerHTML,/U Channel/);
  param('profileShape','3');
  assert.equal(writes.length,3,'out-of-bounds preset must not save');
  param('height','-5');
  assert.equal(writes.length,3,'out-of-bounds height must not save');
  ui.$.vgAddOffset.events.click();
  assert.deepEqual(types(),['spline','offset','extrude','output']);
  assert.equal(writes.length,4);
  ui.$.vgSwitchGenerator.events.click();
  assert.deepEqual(types(),['spline','offset','tube','output']);
  assert.equal(writes.length,5);
  const local=dump.value.graphJson.value;
  dump.value.useGraphAsset.value=true;
  dump.value.graphAsset.value={uuid:'shared-1'};
  panel.update.call(ui,dump);await tick();
  assert.equal(ui.$.vgUseExtrude.disabled,true);
  ui.$.vgUseExtrude.events.click();
  assert.deepEqual(types(),['spline','ribbon','output']);
  assert.equal(writes.length,5);
  ui.$.vgEditShared.events.click();await tick();
  assert(ui._vgSharedDraft);
  assert.equal(ui.$.vgUseExtrude.disabled,false);
  ui.$.vgUseExtrude.events.click();
  assert.deepEqual(types(),['spline','extrude','output']);
  assert.equal(writes.length,5,'shared asset draft never commits Scene property');
  assert.equal(dump.value.graphJson.value,local);
  assert.equal(ui.$.vgSaveShared.disabled,false);
  ui.$.vgDiscardShared.events.click();await tick();
  assert.deepEqual(types(),['spline','ribbon','output']);
  assert.equal(dump.value.graphJson.value,local);
  panel.close.call(ui);
  assert(require(root+'/package.json').scripts.test.includes('geometry-graph-profile-extrude-inspector-v2.test.cjs'));
  console.log('PROFILE EXTRUDE INSPECTOR V2 PASS: local typed commits, parameter bounds, generator selector and shared draft isolation.');
 }finally{globalThis.Editor=beforeEditor;}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
