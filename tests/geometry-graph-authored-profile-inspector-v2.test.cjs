'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const basic=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'extrude',type:'extrude',input:'source',width:2,height:1,profileShape:2},
 {id:'output',type:'output',input:'extrude'},
],output:'output'});
const element=()=>({events:{},disabled:false,hidden:false,textContent:'',
 innerHTML:'',classList:{toggle(){}},addEventListener(name,fn){this.events[name]=fn;},
 render(){},dispatch(){throw Error('Unbound native dump');},
 setPointerCapture(){},releasePointerCapture(){}});
const ui={$:{}},writes=[];
for(const key of Object.keys(panel.$))ui.$[key]=element();
const dump={value:{graphJson:{value:basic},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null},
 outputId:{value:''},outputOrder:{value:''},renderAllOutputs:{value:false}}};
ui.$.p_graphJson.dispatch=function(event){
 assert.equal(event,'change-dump');writes.push(this.dump.value);
};
const priorEditor=globalThis.Editor;
globalThis.Editor={Message:{request:async(_pkg,method)=>{
 if(method==='query-geometry-graph-asset')
  return {ok:true,assetMode:true,assetName:'AuthoredGraph',graphJson:basic};
 if(method==='begin-shared-geometry-graph-edit')
  return {ok:true,nodeUuid:'node-1',assetUuid:'profile-shared',
   sha256:'f'.repeat(64),graphJson:basic};
 throw Error('Unexpected Scene IPC '+method);
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const select=()=>ui.$.vgStage.events.click({target:{
 dataset:{node:'extrude'},closest(s){return s==='.spl-vg-card'?this:null;},
}});
const change=(value)=>ui.$.vgProperties.events.change({target:{
 dataset:{graphParam:'profileSlot'},value:String(value),
 closest(s){return s==='[data-graph-param]'?this:null;},
}});
(async()=>{
 try{
  panel.ready.call(ui);panel.update.call(ui,dump);
  select();
  assert.match(ui.$.vgProperties.innerHTML,/Profile Asset Slot/);
  assert.match(ui.$.vgProperties.innerHTML,/Built-in preset/);
  change(1);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('extrude').profileSlot,1);
  assert.deepEqual(writes.length,1);
  change(-1);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('extrude').profileSlot,undefined);
  assert.equal(writes.length,2);
  change(3);
  assert.equal(writes.length,2,'Invalid source profile slot must not commit');
  const local=dump.value.graphJson.value;
  dump.value.useGraphAsset.value=true;
  dump.value.graphAsset.value={uuid:'profile-shared'};
  panel.update.call(ui,dump);await tick();
  select();
  change(0);
  assert.equal(writes.length,2,'Shared graph remains read-only');
  ui.$.vgEditShared.events.click();await tick();
  select();
  change(2);
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('extrude').profileSlot,2);
  assert.equal(writes.length,2,'Shared draft never writes native Graph property');
  assert.equal(dump.value.graphJson.value,local);
  ui.$.vgDiscardShared.events.click();await tick();
  assert.equal(model.parseGraph(ui._vgGraphJson).map.get('extrude').profileSlot,undefined);
  panel.close.call(ui);
  assert(require(root+'/package.json').scripts.test.includes(
   'geometry-graph-authored-profile-inspector-v2.test.cjs'));
  console.log('AUTHORED PROFILE INSPECTOR V2 PASS: native slot select/reset, bounds, shared draft and no implicit shared writes.');
 }finally{globalThis.Editor=priorEditor;}
})().catch(error=>{console.error(error);process.exitCode=1;});
