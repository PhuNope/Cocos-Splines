'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
function element(){
 return {events:{},innerHTML:'',textContent:'',disabled:false,hidden:false,
  classList:{toggle(){}},addEventListener(type,callback){this.events[type]=callback;},
  render(){},dispatch(){throw Error('Draft should never persist Scene dump.');},
  setPointerCapture(){},releasePointerCapture(){}};
}
const graph=width=>JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},{id:'ribbon',type:'ribbon',input:'source',width},
 {id:'output',type:'output',input:'ribbon'}],output:'output'});
const ui={$:{}};
for(const name of Object.keys(panel.$))ui.$[name]=element();
const dump={value:{graphJson:{value:graph(2)},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:true},graphAsset:{value:{uuid:'asset-1'}}}};
let began=0,saved=0,requests=[],lastPayload=null,saveError=false;
const prior=globalThis.Editor;
globalThis.Editor={Message:{request:async (pkg,method,payload)=>{
 assert.equal(pkg,'cocos-splines');requests.push(method);
 if(method==='query-geometry-graph-asset')return {ok:true,assetMode:true,
  assetName:'Graph.json',assetUuid:'asset-1',graphJson:graph(4)};
 if(method==='begin-shared-geometry-graph-edit'){
  began++;return {ok:true,nodeUuid:'node-1',assetUuid:'asset-1',
   sha256:'a'.repeat(64),graphJson:graph(4)};
 }
 if(method==='save-shared-geometry-graph-edit'){
  saved++;lastPayload=payload;
  if(saveError)return {ok:false,error:'Shared graph changed on disk'};
  return {ok:true,changed:true,graphJson:payload.graphJson,message:'Saved shared JSON'};
 }
 throw Error('Unexpected: '+method);
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const card=id=>({dataset:{node:id},closest(s){return s==='.spl-vg-card'?this:null;}});
async function run(){
 try{
  panel.ready.call(ui);panel.update.call(ui,dump);
  await tick();
  assert.equal(ui._vgShared,true);
  assert.equal(ui.$.vgEditShared.disabled,false);
  assert.equal(ui.$.vgSaveShared.disabled,true);
  ui.$.vgEditShared.events.click();await tick();
  assert.equal(began,1);
  assert(ui._vgSharedDraft);
  assert.equal(ui.$.vgAddOffset.disabled,false);
  assert.equal(ui.$.vgAuto.disabled,true,'Layout is component-local, locked in shared draft.');
  assert.equal(ui.$.vgCopyLocal.disabled,true);
  assert.equal(ui.$.vgRefresh.disabled,true);
  const beforeLayout=dump.value.graphLayoutJson.value;
  ui.$.vgAddOffset.events.click();
  assert(model.parseGraph(ui._vgGraphJson).ordered.some(n=>n.type==='offset'));
  assert.equal(dump.value.graphJson.value,graph(2));
  assert.equal(dump.value.graphLayoutJson.value,beforeLayout);
  assert.equal(ui.$.vgSaveShared.disabled,false);
  assert(ui.$.vgSourceMode.textContent.includes('UNSAVED DRAFT'));
  ui.$.vgStage.events.click({target:card('ribbon')});
  ui.$.vgProperties.events.change({target:{
   dataset:{graphParam:'width'},value:'11',closest(s){
    return s==='[data-graph-param]'?this:null;
   }
  }});
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('ribbon').width,11);
  saveError=true;
  ui.$.vgSaveShared.events.click();await tick();
  assert.equal(saved,1);
  assert(ui._vgSharedDraft,'Conflict must preserve draft');
  assert.equal(dump.value.graphJson.value,graph(2));
  saveError=false;
  ui.$.vgSaveShared.events.click();await tick();
  assert.equal(saved,2);
  assert.equal(lastPayload.assetUuid,'asset-1');
  assert.equal(lastPayload.sha256,'a'.repeat(64));
  assert.equal(model.parseGraph(lastPayload.graphJson).map.get('ribbon').width,11);
  assert.equal(ui._vgSharedDraft,null);
  assert.equal(ui.$.vgAddOffset.disabled,true);
  assert.equal(dump.value.graphJson.value,graph(2));
  ui.$.vgEditShared.events.click();await tick();
  assert(ui._vgSharedDraft);
  ui.$.vgDiscardShared.events.click();await tick();
  assert.equal(ui._vgSharedDraft,null);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('ribbon').width,4);
  ui.$.vgEditShared.events.click();await tick();
  dump.value.graphAsset.value={uuid:'asset-2'};
  panel.update.call(ui,dump);
  assert.equal(ui._vgSharedDraft,null,'Changing source asset invalidates a draft');
  panel.close.call(ui);
  assert.equal(ui._vgSharedDraft,null);
  assert(require(root+'/package.json').scripts.test.includes('geometry-graph-shared-draft-inspector-v2.test.cjs'));
  console.log('SHARED GRAPH INSPECTOR DRAFT V2 PASS: edit/save/discard, no native dump mutation, conflict retained, asset identity guard.');
 }finally{globalThis.Editor=prior;}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
