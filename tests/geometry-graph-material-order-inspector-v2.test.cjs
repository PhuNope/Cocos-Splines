'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const inspector=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const raw=JSON.stringify({version:2,nodes:[
 {id:'source',type:'spline'},
 {id:'road',type:'ribbon',input:'source',width:4},
 {id:'pipe',type:'tube',input:'source',radius:1},
 {id:'outputRoad',type:'output',input:'road'},
 {id:'outputPipe',type:'output',input:'pipe'},
],output:'outputRoad'});
const element=()=>({events:{},disabled:false,hidden:false,
 textContent:'',innerHTML:'',classList:{toggle(){}},
 addEventListener(type,fn){this.events[type]=fn;},
 dispatch(){throw Error('Unbound dump');},render(){},
 setPointerCapture(){},releasePointerCapture(){}});
const panel={$:{}};
for(const name of Object.keys(inspector.$))panel.$[name]=element();
const dump={value:{graphJson:{value:raw},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null},
 renderAllOutputs:{value:true},outputId:{value:''},outputOrder:{value:''}}};
const writes=[];
panel.$.p_outputOrder.dispatch=function(event){
 assert.equal(event,'change-dump');
 writes.push(this.dump.value);
};
const click=(index,delta)=>panel.$.vgOrderList.events.click({target:{
 closest(query){
  assert.equal(query,'button[data-order-index]');
  return {dataset:{orderIndex:String(index),orderMove:String(delta)},disabled:false};
 },
}});
const oldEditor=globalThis.Editor;
globalThis.Editor={Message:{request:async(_extension,method)=>{
 if(method==='query-geometry-graph-asset')return {
  ok:true,assetMode:true,graphJson:raw,assetName:'SharedGraph',
 };
 throw Error('Unexpected Scene IPC '+method);
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function run(){
 try{
  inspector.ready.call(panel);
  inspector.update.call(panel,dump);
  assert.equal(panel.$.vgOrderSection.hidden,false);
  assert.match(panel.$.vgOrderList.innerHTML,/Material A · outputPipe/);
  assert.match(panel.$.vgOrderList.innerHTML,/Material B · outputRoad/);
  assert.equal(panel.$.vgOrderReset.disabled,true);
  click(0,1);
  assert.equal(dump.value.outputOrder.value,'outputRoad,outputPipe');
  assert.deepEqual(writes,['outputRoad,outputPipe']);
  assert.match(panel.$.vgOrderList.innerHTML,/Material A · outputRoad/);
  assert.equal(panel.$.vgOrderReset.disabled,false);
  panel.$.vgOrderReset.events.click();
  assert.equal(dump.value.outputOrder.value,'');
  assert.deepEqual(writes,['outputRoad,outputPipe','']);
  // Shared graph remains read-only, but renderer-local slot order is editable.
  dump.value.useGraphAsset.value=true;
  dump.value.graphAsset.value={uuid:'shared'};
  inspector.update.call(panel,dump);
  await tick();
  click(0,1);
  assert.equal(dump.value.outputOrder.value,'outputRoad,outputPipe');
  assert.deepEqual(writes,['outputRoad,outputPipe','','outputRoad,outputPipe']);
  assert.equal(dump.value.graphJson.value,raw);
  assert.equal(dump.value.graphLayoutJson.value,'{}');
  // Native Inspector commit failure rolls back the dump and output order.
  panel.$.p_outputOrder.dispatch=()=>{throw Error('native dump rejected');};
  panel.$.vgOrderReset.events.click();
  assert.equal(dump.value.outputOrder.value,'outputRoad,outputPipe');
  assert.match(panel.$.vgStatus.textContent,/native dump rejected/);
  // A graph topology edit can make an old order invalid: fail visibly.
  dump.value.useGraphAsset.value=false;
  dump.value.graphAsset.value=null;
  inspector.update.call(panel,dump);
  dump.value.graphJson.value=JSON.stringify({...JSON.parse(raw),nodes:[
   ...JSON.parse(raw).nodes.filter(n=>n.id!=='outputPipe'),
   {id:'outputNew',type:'output',input:'pipe'},
  ]});
  inspector.update.call(panel,dump);
  assert.match(panel.$.vgOrderList.textContent,/every Output Node ID exactly once/);
  panel.$.p_outputOrder.dispatch=function(){};
  panel.$.vgOrderReset.events.click();
  assert.equal(dump.value.outputOrder.value,'');
  dump.value.renderAllOutputs.value=false;
  inspector.update.call(panel,dump);
  assert.equal(panel.$.vgOrderSection.hidden,true);
  inspector.close.call(panel);
  assert(require(root+'/package.json').scripts.test.includes(
   'geometry-graph-material-order-inspector-v2.test.cjs'));
  console.log('MATERIAL ORDER INSPECTOR V2 PASS: reorder, reset, native dump rollback, shared graph isolation and stale graph guard.');
 }finally{globalThis.Editor=oldEditor;}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
