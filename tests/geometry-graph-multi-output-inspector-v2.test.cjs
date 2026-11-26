'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const basic=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'ribbon',type:'ribbon',input:'source',width:3},
 {id:'output',type:'output',input:'ribbon'},
],output:'output'});
const element=()=>({events:{},disabled:false,hidden:false,
 textContent:'',innerHTML:'',classList:{toggle(){}},
 addEventListener(event,fn){this.events[event]=fn;},
 render(){},dispatch(){throw Error('Unbound native ui-prop dispatch');},
 setPointerCapture(){},releasePointerCapture(){}});
const ui={$:{}},writes=[];
for(const key of Object.keys(panel.$))ui.$[key]=element();
const dump={value:{
 graphJson:{value:basic},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null},
 outputId:{value:''},
}};
for(const field of ['graphJson','graphLayoutJson','outputId']){
 ui.$['p_'+field].dispatch=function(event){
  assert.equal(event,'change-dump');
  writes.push({field,content:this.dump.value});
 };
}
const oldEditor=globalThis.Editor;
let source=basic;
globalThis.Editor={Message:{request:async(_pkg,method)=>{
 if(method==='query-geometry-graph-asset')return {
  ok:true,assetMode:true,assetName:'MultiGraph',graphJson:source,
 };
 if(method==='begin-shared-geometry-graph-edit')return {
  ok:true,nodeUuid:'node-1',assetUuid:'shared-1',sha256:'a'.repeat(64),
  graphJson:source,
 };
 throw Error('Unexpected IPC '+method);
}}};
const tick=()=>new Promise(r=>setImmediate(r));
const graph=()=>model.parseGraph(ui._vgGraphJson);
function select(id){
 ui.$.vgStage.events.click({target:{
  dataset:{node:id},closest(s){return s==='.spl-vg-card'?this:null;}
 }});
}
async function run(){
 try{
  panel.ready.call(ui);panel.update.call(ui,dump);
  assert.equal(ui.$.vgAddOutput.disabled,false);
  assert.equal(ui.$.vgRemoveOutput.disabled,true);
  assert.equal(ui.$.vgDefaultOutput.disabled,true);
  ui.$.vgAddOutput.events.click();
  assert.equal(graph().graph.version,2);
  assert.equal(graph().outputs.length,2);
  assert.equal(ui._vgSelected,'outputBranch');
  assert.equal(ui.$.vgDefaultOutput.disabled,false);
  assert.equal(ui.$.vgRemoveOutput.disabled,false);
  assert.equal(writes.length,1);
  assert.equal(writes[0].field,'graphJson');
  assert.equal(dump.value.outputId.value,'','Output ID must not change implicitly');
  ui.$.vgDefaultOutput.events.click();
  assert.equal(graph().graph.output,'outputBranch');
  assert.equal(writes.length,2);
  assert.equal(ui.$.vgRemoveOutput.disabled,true,'Cannot remove active default');
  select('output');
  assert.equal(ui.$.vgRemoveOutput.disabled,false);
  ui.$.vgRemoveOutput.events.click();
  assert.equal(graph().graph.version,1);
  assert.equal(graph().graph.output,'outputBranch');
  assert.equal(graph().outputs.length,1);
  assert.equal(writes.length,3);
  // Re-add and change generator on the selected *secondary* output.
  ui.$.vgAddOutput.events.click();
  assert.equal(graph().outputs.length,2);
  assert.equal(ui._vgSelected,'outputBranch1');
  const secondaryGenerator=graph().map.get('outputBranch1').input;
  select(secondaryGenerator);
  assert(ui.$.vgStatus.textContent.includes('editing: outputBranch1'));
  ui.$.vgSwitchGenerator.events.click();
  const branch=graph().map.get('outputBranch1');
  assert.equal(graph().map.get(branch.input).type,'tube');
  assert.equal(ui._vgSelected,branch.input,'Generator switch retains the edited branch selection');
  assert.equal(ui.$.vgSwitchGenerator.textContent,'Switch to Ribbon');
  assert.equal(graph().map.get(graph().map.get(graph().graph.output).input).type,'ribbon',
   'Switching secondary output generator cannot modify default mesh');
  assert.equal(writes.length,5);
  const localSnapshot=dump.value.graphJson.value;
  // Shared references are read-only unless an explicit draft is opened.
  dump.value.useGraphAsset.value=true;
  dump.value.graphAsset.value={uuid:'shared-1'};
  panel.update.call(ui,dump);await tick();
  assert.equal(ui.$.vgAddOutput.disabled,true);
  ui.$.vgAddOutput.events.click();
  assert.equal(graph().graph.version,1);
  assert.equal(writes.length,5);
  ui.$.vgEditShared.events.click();await tick();
  assert(ui._vgSharedDraft);
  assert.equal(ui.$.vgAddOutput.disabled,false);
  ui.$.vgAddOutput.events.click();
  assert.equal(graph().graph.version,2);
  assert.equal(writes.length,5,'Shared draft must not dispatch component JSON');
  assert.equal(dump.value.graphJson.value,localSnapshot);
  assert.equal(ui.$.vgSaveShared.disabled,false);
  ui.$.vgDiscardShared.events.click();await tick();
  assert.equal(ui._vgSharedDraft,null);
  assert.equal(graph().graph.version,1);
  assert.equal(dump.value.graphJson.value,localSnapshot);
  panel.close.call(ui);
  assert(require(root+'/package.json').scripts.test.includes('geometry-graph-multi-output-inspector-v2.test.cjs'));
  console.log('MULTI-OUTPUT INSPECTOR V2 PASS: add/default/remove/branch generator, native dump, shared draft isolation.');
 }finally{globalThis.Editor=oldEditor;}
}
run().catch(err=>{console.error(err);process.exitCode=1;});
