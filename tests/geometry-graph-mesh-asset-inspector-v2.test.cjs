'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const basic=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'deform',type:'meshDeform',input:'source',repeats:2},
 {id:'output',type:'output',input:'deform'}],output:'output'});
const el=()=>({events:{},textContent:'',innerHTML:'',hidden:false,
 disabled:false,classList:{toggle(){}},addEventListener(event,fn){this.events[event]=fn;},
 render(){},dispatch(){throw Error('Native ui-prop not bound');},
 setPointerCapture(){},releasePointerCapture(){}});
const ui={$:{}},commits=[];
for(const k of Object.keys(panel.$))ui.$[k]=el();
for(const key of ['graphJson','graphLayoutJson']){
 ui.$['p_'+key].dispatch=function(event){
  assert.equal(event,'change-dump');commits.push([key,this.dump.value]);
 };
}
const dump={value:{graphJson:{value:basic},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null},outputId:{value:''},
 sourceMesh:{value:null}}};
const beforeEditor=globalThis.Editor;
globalThis.Editor={Message:{request:async (_name,method)=>{
 if(method==='query-geometry-graph-asset')return {
  ok:true,assetMode:true,assetUuid:'shared',graphJson:basic,assetName:'SharedImported'};
 if(method==='begin-shared-geometry-graph-edit')return {
  ok:true,assetUuid:'shared',nodeUuid:'node',sha256:'f'.repeat(64),
  graphJson:basic};
 throw Error('Unexpected IPC '+method);
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const value=()=>model.parseGraph(ui._vgGraphJson);
function select(id){
 ui.$.vgStage.events.click({target:{dataset:{node:id},
  closest(x){return x==='.spl-vg-card'?this:null;}}});
}
async function run(){
 try{
  panel.ready.call(ui);panel.update.call(ui,dump);
  assert(panel.template.includes('spl-vg-attach-mesh'));
  select('deform');
  assert.equal(ui.$.vgAttachMesh.disabled,false);
  assert.equal(ui.$.vgDetachMesh.disabled,true);
  ui.$.vgAttachMesh.events.click();
  assert.equal(value().map.get('deform').meshInput,'meshAsset');
  assert.equal(value().map.get('meshAsset').type,'meshAsset');
  assert.equal(ui.$.vgAttachMesh.disabled,true);
  assert.equal(ui.$.vgDetachMesh.disabled,false);
  assert.equal(commits.length,1);
  assert.equal(commits[0][0],'graphJson');
  assert.equal(dump.value.sourceMesh.value,null,'Attaching graph slot never replaces source asset');
  assert(ui.$.vgStage.innerHTML.includes('data-socket="mesh-in"'));
  select('meshAsset');
  assert.match(ui.$.vgProperties.innerHTML,/data-graph-param="slot"/);
  assert.doesNotMatch(ui.$.vgProperties.innerHTML,/Source Mesh is assigned on each Renderer/);
  select('deform');
  ui.$.vgDetachMesh.events.click();
  assert.equal(value().map.has('meshAsset'),false);
  assert.equal(value().map.get('deform').meshInput,undefined);
  assert.equal(commits.length,2);
  const local=dump.value.graphJson.value;
  dump.value.useGraphAsset.value=true;
  dump.value.graphAsset.value={uuid:'shared'};
  panel.update.call(ui,dump);await tick();
  select('deform');
  assert.equal(ui.$.vgAttachMesh.disabled,true);
  ui.$.vgAttachMesh.events.click();
  assert.equal(value().map.has('meshAsset'),false);
  assert.equal(commits.length,2);
  ui.$.vgEditShared.events.click();await tick();
  select('deform');
  assert.equal(ui.$.vgAttachMesh.disabled,false);
  ui.$.vgAttachMesh.events.click();
  assert(value().map.has('meshAsset'));
  assert.equal(commits.length,2,'Shared draft must not commit Scene property');
  assert.equal(dump.value.graphJson.value,local);
  ui.$.vgDiscardShared.events.click();await tick();
  assert.equal(value().map.has('meshAsset'),false);
  assert.equal(dump.value.sourceMesh.value,null);
  assert.equal(commits.length,2);
  panel.close.call(ui);
  assert(require(root+'/package.json').scripts.test.includes('geometry-graph-mesh-asset-inspector-v2.test.cjs'));
  console.log('MESH ASSET INSPECTOR V2 PASS: typed socket attachment, local change-dump, shared draft isolation and asset field safety.');
 }finally{globalThis.Editor=beforeEditor;}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
