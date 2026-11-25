'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
function element(){
 return {events:{},innerHTML:'',textContent:'',disabled:false,hidden:false,
  classList:{toggle(){}},addEventListener(t,fn){this.events[t]=fn;},render(){},
  dispatch(){throw Error('Shared draft must not mutate Scene properties.');},
  setPointerCapture(){},releasePointerCapture(){}};
}
function graph(width,thickness=0){return JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'ribbon',type:'ribbon',input:'source',width,thickness},
 {id:'output',type:'output',input:'ribbon'}],output:'output'});}
const ui={$:{}};
for(const name of Object.keys(panel.$))ui.$[name]=element();
const dump={value:{graphJson:{value:graph(1)},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:true},graphAsset:{value:{uuid:'asset-1'}}}};
const oldEditor=globalThis.Editor;
let sourceGraph=graph(4),hash='1'.repeat(64),conflictSave=true,savePayload=null,beginCount=0;
globalThis.Editor={Message:{request:async (_pkg,message,payload)=>{
 if(message==='query-geometry-graph-asset')return {ok:true,assetMode:true,
  graphJson:sourceGraph,assetName:'Shared.json'};
 if(message==='begin-shared-geometry-graph-edit'){
  beginCount++;
  return {ok:true,nodeUuid:'graph-node',assetUuid:'asset-1',
    sha256:hash,graphJson:sourceGraph};
 }
 if(message==='save-shared-geometry-graph-edit'){
  savePayload=payload;
  return conflictSave?{ok:false,conflict:true,error:'Source changed'}:
    {ok:true,changed:true,graphJson:payload.graphJson,message:'Saved shared'};
 }
 throw Error('Unexpected request: '+message);
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const card=id=>({dataset:{node:id},closest(s){return s==='.spl-vg-card'?this:null;}});
const parameter=(key,value)=>({target:{dataset:{graphParam:key},value,
 closest(s){return s==='[data-graph-param]'?this:null;}}});
async function run(){
 try{
  panel.ready.call(ui);panel.update.call(ui,dump);await tick();
  ui.$.vgEditShared.events.click();await tick();
  assert.equal(beginCount,1);
  ui.$.vgStage.events.click({target:card('ribbon')});
  ui.$.vgProperties.events.change(parameter('width','8'));
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('ribbon').width,8);
  ui.$.vgSaveShared.events.click();await tick();
  assert(ui._vgSharedDraft);
  assert.match(ui.$.vgStatus.textContent,/Compare with Source/);
  sourceGraph=graph(4,2);hash='2'.repeat(64);
  ui.$.vgReviewShared.events.click();await tick();
  assert.equal(beginCount,2);
  assert.equal(ui._vgSharedReview.sha256,hash);
  assert.match(ui.$.vgConflict.textContent,/ribbon.width/);
  assert.match(ui.$.vgConflict.textContent,/ribbon.thickness/);
  assert.equal(ui.$.vgRebaseShared.disabled,false);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('ribbon').thickness,0,
    'Comparison must never silently overwrite draft');
  assert.equal(dump.value.graphJson.value,graph(1));
  ui.$.vgRebaseShared.events.click();
  assert.equal(ui._vgSharedReview,null);
  assert.equal(ui._vgSharedDraft.sha256,hash);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('ribbon').width,8);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('ribbon').thickness,2);
  conflictSave=false;
  ui.$.vgSaveShared.events.click();await tick();
  assert.equal(savePayload.sha256,hash);
  assert.equal(model.parseGraph(savePayload.graphJson).map.get('ribbon').width,8);
  assert.equal(model.parseGraph(savePayload.graphJson).map.get('ribbon').thickness,2);
  assert.equal(ui._vgSharedDraft,null);
  assert.equal(dump.value.graphJson.value,graph(1),'No local component edits');
  sourceGraph=graph(4);hash='3'.repeat(64);
  ui.$.vgEditShared.events.click();await tick();
  ui.$.vgStage.events.click({target:card('ribbon')});
  ui.$.vgProperties.events.change(parameter('width','9'));
  sourceGraph=graph(11);hash='4'.repeat(64);
  ui.$.vgReviewShared.events.click();await tick();
  assert.equal(ui.$.vgRebaseShared.disabled,true);
  assert.match(ui.$.vgConflict.textContent,/Conflicting fields: ribbon.width/);
  ui.$.vgRebaseShared.events.click();
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('ribbon').width,9,
    'Programmatic Rebase should also refuse a conflict');
  ui.$.vgDiscardShared.events.click();await tick();
  assert.equal(ui._vgSharedDraft,null);
  assert.equal(ui._vgSharedReview,null);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('ribbon').width,11);
  panel.close.call(ui);
  assert(require(root+'/package.json').scripts.test.includes(
    'geometry-graph-conflict-inspector-v2.test.cjs'));
  console.log('SHARED GRAPH CONFLICT INSPECTOR V2 PASS: compare, no mutation, safe rebase, overlap blocking, discard.');
 }finally{globalThis.Editor=oldEditor;}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
