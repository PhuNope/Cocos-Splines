'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const basic=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'meshAsset',type:'meshAsset'},
 {id:'deform',type:'meshDeform',input:'source',meshInput:'meshAsset'},
 {id:'output',type:'output',input:'deform'}],output:'output'});
const el=()=>({events:{},textContent:'',innerHTML:'',disabled:false,hidden:false,
 classList:{toggle(){}},addEventListener(type,fn){this.events[type]=fn;},
 render(){},dispatch(){throw Error('Unbound ui-prop dump');},
 setPointerCapture(){},releasePointerCapture(){}});
const ui={$:{}},writes=[];
for(const key of Object.keys(panel.$))ui.$[key]=el();
for(const key of ['graphJson','graphLayoutJson']){
 ui.$['p_'+key].dispatch=function(event){
  assert.equal(event,'change-dump');writes.push([key,this.dump.value]);
 };
}
const dump={value:{graphJson:{value:basic},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null},sourceMesh:{value:null},
 outputId:{value:''}}};
const originalEditor=globalThis.Editor;
globalThis.Editor={Message:{request:async (_pkg,method)=>{
 if(method==='query-geometry-graph-asset')return {
  ok:true,assetMode:true,assetUuid:'shared',assetName:'SourceTrim',graphJson:basic};
 if(method==='begin-shared-geometry-graph-edit')return {
  ok:true,nodeUuid:'node',assetUuid:'shared',sha256:'a'.repeat(64),
  graphJson:basic};
 throw Error('Unexpected IPC '+method);
}}};
const tick=()=>new Promise(r=>setImmediate(r));
const parsed=()=>model.parseGraph(ui._vgGraphJson);
const select=id=>ui.$.vgStage.events.click({target:{dataset:{node:id},
 closest(s){return s==='.spl-vg-card'?this:null;}}});
const update=(key,value)=>ui.$.vgProperties.events.change({target:{
 dataset:{graphParam:key},value:String(value),checked:false,
 closest(s){return s==='[data-graph-param]'?this:null;}}});
async function run(){
 try{
  panel.ready.call(ui);panel.update.call(ui,dump);select('deform');
  assert.match(ui.$.vgProperties.innerHTML,/Source Length \(trim last tile\)/);
  assert.match(ui.$.vgProperties.innerHTML,/Original UV atlas/);
  assert.match(ui.$.vgProperties.innerHTML,/data-graph-param="tileLength"/);
  update('repeatLayout',1);
  update('tileLength',2.25);
  update('uvMode',0);
  assert.deepEqual([parsed().map.get('deform').repeatLayout,
   parsed().map.get('deform').tileLength,
   parsed().map.get('deform').uvMode],[1,2.25,0]);
  assert.equal(writes.length,3);
  assert(writes.every(w=>w[0]==='graphJson'));
  update('repeatLayout',2);
  update('tileLength',-.5);
  update('tileLength',.005);
  update('uvMode',3);
  assert.equal(writes.length,3,'Invalid parameters must not commit');
  assert.equal(dump.value.sourceMesh.value,null);
  const saved=dump.value.graphJson.value;
  dump.value.useGraphAsset.value=true;
  dump.value.graphAsset.value={uuid:'shared'};
  panel.update.call(ui,dump);await tick();
  select('deform');
  update('repeatLayout',1);
  assert.equal(writes.length,3,'Shared view is read-only');
  ui.$.vgEditShared.events.click();await tick();
  select('deform');
  update('repeatLayout',1);
  update('tileLength',3);
  update('uvMode',1);
  assert.equal(parsed().map.get('deform').tileLength,3);
  assert.equal(parsed().map.get('deform').uvMode,1);
  assert.equal(writes.length,3,'Shared draft does not dispatch native Scene dumps');
  assert.equal(dump.value.graphJson.value,saved);
  assert.equal(ui.$.vgSaveShared.disabled,false);
  ui.$.vgDiscardShared.events.click();await tick();
  assert.equal(parsed().map.get('deform').repeatLayout,undefined);
  assert.equal(dump.value.graphJson.value,saved);
  panel.close.call(ui);
  assert(require(root+'/package.json').scripts.test.includes(
   'geometry-graph-source-length-inspector-v2.test.cjs'));
  console.log('SOURCE LENGTH INSPECTOR V2 PASS: native local commits, parameter bounds and Shared draft isolation.');
 }finally{globalThis.Editor=originalEditor;}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
