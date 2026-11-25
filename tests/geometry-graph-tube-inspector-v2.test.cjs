'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const graph=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const ribbon=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'ribbon',type:'ribbon',input:'source',width:4},
 {id:'output',type:'output',input:'ribbon'},
],output:'output'});
const element=()=>({events:{},disabled:false,textContent:'',innerHTML:'',hidden:false,
 classList:{toggle(){}},addEventListener(type,callback){this.events[type]=callback;},
 render(){},dispatch(){throw Error('dispatch not initialized');},
 setPointerCapture(){},releasePointerCapture(){}});
const panelMock={$:{}},nativeWrites=[];
for(const key of Object.keys(panel.$))panelMock.$[key]=element();
const dump={value:{graphJson:{value:ribbon},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null}}};
for(const key of ['graphJson','graphLayoutJson']){
 panelMock.$['p_'+key].dispatch=function(event){
  assert.equal(event,'change-dump');
  nativeWrites.push({key,value:this.dump.value});
 };
}
const prior=globalThis.Editor;
let sharedGraph=ribbon;
globalThis.Editor={Message:{request:async (_ext,message)=>{
 if(message==='query-geometry-graph-asset')
  return {ok:true,assetMode:true,assetUuid:'shared',graphJson:sharedGraph};
 if(message==='begin-shared-geometry-graph-edit')
  return {ok:true,assetUuid:'shared',nodeUuid:'graph-node',sha256:'a'.repeat(64),
   graphJson:sharedGraph};
 throw Error('Unexpected message '+message);
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function selected(type){return graph.parseGraph(panelMock._vgGraphJson).ordered.map(n=>n.type);}
async function run(){
 try{
  panel.ready.call(panelMock);panel.update.call(panelMock,dump);
  assert.equal(panelMock.$.vgSwitchGenerator.disabled,false);
  assert.match(panelMock.$.vgSwitchGenerator.textContent,/Tube/);
  panelMock.$.vgSwitchGenerator.events.click();
  assert.deepEqual(selected(),['spline','tube','output']);
  assert.equal(nativeWrites.length,1);
  assert.equal(nativeWrites[0].key,'graphJson');
  assert.equal(graph.parseGraph(dump.value.graphJson.value).map.get('output').input,'tube');
  assert.match(panelMock.$.vgSwitchGenerator.textContent,/Ribbon/);
  panelMock.$.vgAddWidth.events.click();
  assert.deepEqual(selected(),['spline','width','tube','output']);
  assert.equal(nativeWrites.length,2);
  const chooser={dataset:{node:'tube'},closest(sel){
   return sel==='.spl-vg-card'?this:null;
  }};
  panelMock.$.vgStage.events.click({target:chooser});
  panelMock.$.vgProperties.events.change({target:{dataset:{graphParam:'radialSegments'},
   value:'16',closest(sel){return sel==='[data-graph-param]'?this:null;}}});
  assert.equal(graph.parseGraph(panelMock._vgGraphJson).map.get('tube').radialSegments,16);
  assert.equal(nativeWrites.length,3);
  panelMock.$.vgProperties.events.change({target:{dataset:{graphParam:'radialSegments'},
   value:'3.5',closest(sel){return sel==='[data-graph-param]'?this:null;}}});
  assert.equal(nativeWrites.length,3,'Invalid radialSegments must not commit');
  panelMock.$.vgSwitchGenerator.events.click();
  assert.deepEqual(selected(),['spline','width','ribbon','output']);
  assert.equal(nativeWrites.length,4);
  const localCommitted=dump.value.graphJson.value;
  dump.value.useGraphAsset.value=true;
  dump.value.graphAsset.value={uuid:'shared'};
  panel.update.call(panelMock,dump);await tick();
  assert.equal(panelMock.$.vgSwitchGenerator.disabled,true);
  panelMock.$.vgSwitchGenerator.events.click();
  assert.equal(dump.value.graphJson.value,localCommitted,'Shared view is immutable');
  assert.equal(nativeWrites.length,4);
  panelMock.$.vgEditShared.events.click();await tick();
  assert(panelMock._vgSharedDraft);
  panelMock.$.vgSwitchGenerator.events.click();
  assert.deepEqual(selected(),['spline','tube','output']);
  assert.equal(nativeWrites.length,4,'Shared draft must not write local Inspector dump');
  assert.equal(dump.value.graphJson.value,localCommitted);
  panelMock.$.vgDiscardShared.events.click();await tick();
  assert.deepEqual(selected(),['spline','ribbon','output']);
  assert.equal(dump.value.graphJson.value,localCommitted);
  panel.close.call(panelMock);
  assert(require(root+'/package.json').scripts.test.includes('geometry-graph-tube-inspector-v2.test.cjs'));
  console.log('GEOMETRY TUBE INSPECTOR V2 PASS: local generator switch, Tube params, bounded edits, shared read-only and draft isolation.');
 }finally{globalThis.Editor=prior;}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
