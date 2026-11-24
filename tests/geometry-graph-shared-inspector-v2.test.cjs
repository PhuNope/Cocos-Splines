'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
function element(){
 return {events:{},innerHTML:'',textContent:'',disabled:false,hidden:false,
  classList:{toggle(){}},addEventListener(type,callback){this.events[type]=callback;},
  render(){},dispatch(){throw Error('Shared asset must not mutate serialized dumps.');},
  setPointerCapture(){},releasePointerCapture(){}};
}
const shared=(width)=>JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'ribbon',type:'ribbon',input:'source',width},
 {id:'output',type:'output',input:'ribbon'}
],output:'output'});
const local=shared(2),ui={$:{}};
for(const name of Object.keys(panel.$))ui.$[name]=element();
const dump={value:{
 graphJson:{value:local},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:true},graphAsset:{value:{uuid:'asset-shared'}},
}};
const previous=globalThis.Editor;
let width=7,queries=0,copies=0;
globalThis.Editor={Message:{request:async (pkg,method)=>{
 assert.equal(pkg,'cocos-splines');
 if(method==='query-geometry-graph-asset'){
  queries++;return {ok:true,assetMode:true,assetName:'SharedRibbon.json',
   graphJson:shared(width)};
 }
 if(method==='copy-geometry-graph-to-local'){
  copies++;return {ok:true,changed:true,message:'Copied to local'};
 }
 throw Error('Unexpected command: '+method);
}}};
async function test(){
 try{
  panel.ready.call(ui);
  panel.update.call(ui,dump);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(queries,1);
  assert.equal(ui._vgShared,true);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('ribbon').width,7);
  assert.equal(ui.$.vgAddOffset.disabled,true);
  assert.equal(ui.$.vgAddWidth.disabled,true);
  assert.equal(ui.$.vgAuto.disabled,true);
  assert.equal(ui.$.vgCopyLocal.disabled,false);
  assert.match(ui.$.vgSourceMode.textContent,/read-only/);
  assert.match(ui.$.vgStatus.textContent,/SharedRibbon/);
  ui.$.vgAddOffset.events.click();
  ui.$.vgAddWidth.events.click();
  ui.$.vgAuto.events.click();
  ui.$.vgStage.events.pointerdown({button:0,pointerId:1,clientX:1,clientY:1,
   target:{dataset:{drag:'source'},closest(selector){return selector==='[data-drag]'?this:null;}}});
  assert.equal(ui._vgDrag,null,'Shared asset must not drag/commit layout');
  assert.equal(dump.value.graphJson.value,local);
  assert.equal(dump.value.graphLayoutJson.value,'{}');
  width=9;
  ui.$.vgRefresh.events.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(queries,2);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('ribbon').width,9);
  await ui.$.vgCopyLocal.events.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(copies,1);
  assert.equal(dump.value.graphJson.value,local,
   'Only native extension property transaction may copy to local');
  dump.value.useGraphAsset.value=false;
  dump.value.graphJson.value=shared(9);
  panel.update.call(ui,dump);
  assert.equal(ui._vgShared,false);
  assert.equal(ui.$.vgAddOffset.disabled,false);
  assert.equal(ui.$.vgCopyLocal.disabled,true);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('ribbon').width,9);
  panel.close.call(ui);
  assert.equal(ui._vgGraphJson,null);
  assert(require(root+'/package.json').scripts.test.includes(
   'geometry-graph-shared-inspector-v2.test.cjs'));
  console.log('GEOMETRY SHARED INSPECTOR V2 PASS: native JsonAsset refresh, readonly canvas, no dump writes and local-copy transition.');
 }finally{globalThis.Editor=previous;}
}
test().catch(e=>{console.error(e);process.exitCode=1;});
