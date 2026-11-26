'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const model=require(root+'/dist/SplineGeometryProfileEditor.js');
const graph=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'extrude',type:'extrude',input:'source',profileSlot:0},
 {id:'output',type:'output',input:'extrude'},
],output:'output'});
const profile={format:'cocos-splines/profile',version:1,points:[
 {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},
]};
const original=model.formatProfile(profile);
function element(){
 return {events:{},innerHTML:'',textContent:'',disabled:false,hidden:false,
  value:'0',classList:{toggle(){},contains(){return false;}},
  addEventListener(name,fn){this.events[name]=fn;},render(){},
  dispatch(){throw Error('Profile Editor must not write Scene dump');},
  querySelector(q){
   if(q==='svg')return {getBoundingClientRect:()=>({
    left:0,top:0,width:240,height:240,
   })};return null;
  },
  setPointerCapture(){},releasePointerCapture(){}};
}
const ui={$:{}};
for(const k of Object.keys(panel.$))ui.$[k]=element();
const dump={value:{graphJson:{value:graph},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null},
 renderAllOutputs:{value:false},outputId:{value:''},outputOrder:{value:''},
 profileAssetA:{value:{uuid:'profile-1'}},profileAssetB:{value:null},
 profileAssetC:{value:null}}};
const priorEditor=globalThis.Editor;
let began=0,saved=0,saveResult='conflict',payload=null;
globalThis.Editor={Message:{request:async(_pkg,method,input)=>{
 if(method==='begin-geometry-profile-edit'){
  began++;if(input!==0)return {ok:false,error:'Missing Profile Asset slot'};
  return {ok:true,nodeUuid:'node-1',slot:0,assetUuid:'profile-1',
   assetName:'Profile.json',sha256:'a'.repeat(64),profileJson:original};
 }
 if(method==='save-geometry-profile-edit'){
  saved++;payload=input;
  if(saveResult==='conflict')return {ok:false,conflict:true,error:'checksum conflict'};
  if(saveResult==='cancel')return {ok:false,canceled:true};
  return {ok:true,changed:true,sha256:'b'.repeat(64),
   profileJson:input.profileJson,message:'Profile saved'};
 }
 throw Error('Unexpected IPC '+method);
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const button=cls=>({classList:{contains:x=>x===cls},
 closest:s=>s==='button'?this:null});
async function run(){
 try{
  panel.ready.call(ui);
  panel.update.call(ui,dump);
  assert.equal(ui.$.vgProfileOpen.disabled,false);
  assert.equal(ui.$.vgProfileSave.disabled,true);
  ui.$.vgProfileOpen.events.click();await tick();
  assert.equal(began,1);
  assert(ui._vgAuthoredDraft);
  assert.match(ui.$.vgProfileCanvas.innerHTML,/profile-point/);
  assert.equal(ui.$.vgProfileOpen.disabled,true);
  assert.equal(ui.$.vgProfileDiscard.disabled,false);
  assert.equal(ui.$.vgProfileSave.disabled,true);
  assert.match(ui.$.vgProfileCanvas.innerHTML,/spl-profile-uv-island-mode/);
  // UV island mode is draft-only, supports native draft Undo/Redo and does
  // not touch the source JsonAsset or the Graph component scene dump.
  const uvBefore=ui._vgAuthoredDraft.profileJson;
  const setIsland=raw=>ui.$.vgProfileCanvas.events.change({target:{
   value:raw,classList:{contains:name=>name==='spl-profile-uv-island-mode'},
  }});
  setIsland('1');
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.sideIslandMode,1);
  assert.equal(ui.$.vgProfileSave.disabled,false);
  ui.$.vgProfileUndo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,uvBefore);
  ui.$.vgProfileRedo.events.click();
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.sideIslandMode,1);
  setIsland('2');
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.sideIslandMode,2);
  assert.match(ui.$.vgProfileCanvas.innerHTML,/spl-profile-uv-world-space/);
  const setWorld=enabled=>ui.$.vgProfileCanvas.events.change({target:{
   checked:enabled,classList:{contains:name=>name==='spl-profile-uv-world-space'},
  }});
  const setMeters=value=>ui.$.vgProfileCanvas.events.change({target:{
   value,classList:{contains:name=>name==='spl-profile-uv-meters'},
  }});
  // World mode requires metric U; invalid draft transactions never persist.
  const beforeWorld=ui._vgAuthoredDraft.profileJson;
  setWorld(true);
  assert.equal(ui._vgAuthoredDraft.profileJson,beforeWorld);
  assert.match(ui.$.vgProfileStatus.textContent,/Profile UV World-space U/);
  setMeters('2');
  setWorld(true);
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.uWorldSpace,true);
  const withWorld=ui._vgAuthoredDraft.profileJson;
  assert.match(ui.$.vgProfileCanvas.innerHTML,/World-space meters/);
  ui.$.vgProfileUndo.events.click();
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.uWorldSpace,undefined);
  ui.$.vgProfileRedo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,withWorld);
  setWorld(false);
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.uWorldSpace,undefined);
  setWorld(true);
  setMeters('');
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.uWorldSpace,undefined,
   'Clearing metric U also removes the world-space opt-in');
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.sideIslandMode,2);
  // Atlas settings remain only in the editable draft until Save.
  assert.match(ui.$.vgProfileCanvas.innerHTML,/spl-profile-uv-atlas/);
  assert.match(ui.$.vgProfileCanvas.innerHTML,/spl-profile-uv-padding/);
  const setAtlas=enabled=>ui.$.vgProfileCanvas.events.change({target:{
   checked:enabled,classList:{contains:name=>name==='spl-profile-uv-atlas'},
  }});
  const setAtlasPadding=value=>ui.$.vgProfileCanvas.events.change({target:{
   value,classList:{contains:name=>name==='spl-profile-uv-padding'},
  }});
  const beforeAtlas=ui._vgAuthoredDraft.profileJson;
  setAtlasPadding('0.03');
  assert.equal(ui._vgAuthoredDraft.profileJson,beforeAtlas);
  assert.match(ui.$.vgProfileStatus.textContent,/Profile UV Atlas padding/);
  setAtlas(true);
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.atlasPacking,true);
  setAtlasPadding('0.075');
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.atlasPadding,.075);
  const atlasDraft=ui._vgAuthoredDraft.profileJson;
  ui.$.vgProfileUndo.events.click();
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.atlasPadding,undefined);
  ui.$.vgProfileRedo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,atlasDraft);
  setAtlasPadding('0.5');
  assert.equal(ui._vgAuthoredDraft.profileJson,atlasDraft,
   'Invalid atlas gutter must not enter serialized draft');
  setAtlasPadding('');
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.atlasPadding,undefined);
  setAtlas(false);
  assert.equal(ui._vgAuthoredDraft.profileJson,beforeAtlas);
  assert.equal(dump.value.graphJson.value,graph);
  // Triangle UV split is an independent draft toggle. Undo/Redo must not
  // touch the source JsonAsset until explicit Save.
  assert.match(ui.$.vgProfileCanvas.innerHTML,/spl-profile-uv-triangle-unwrap/);
  const setTriangle=enabled=>ui.$.vgProfileCanvas.events.change({target:{
   checked:enabled,classList:{contains:name=>name==='spl-profile-uv-triangle-unwrap'},
  }});
  const beforeTriangle=ui._vgAuthoredDraft.profileJson;
  setTriangle(true);
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.triangleUnwrap,true);
  const triangleDraft=ui._vgAuthoredDraft.profileJson;
  ui.$.vgProfileUndo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,beforeTriangle);
  ui.$.vgProfileRedo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,triangleDraft);
  setTriangle(false);
  assert.equal(ui._vgAuthoredDraft.profileJson,beforeTriangle);
  assert.equal(dump.value.graphJson.value,graph);
  const validUvDraft=ui._vgAuthoredDraft.profileJson;
  setIsland('3');
  assert.equal(ui._vgAuthoredDraft.profileJson,validUvDraft);
  assert.match(ui.$.vgProfileStatus.textContent,/Invalid side UV island mode/);
  assert.equal(dump.value.graphJson.value,graph);
  assert.equal(dump.value.profileAssetA.value.uuid,'profile-1');
  // Selecting and moving a point through native numeric controls edits draft only.
  ui.$.vgProfileCanvas.events.pointerdown({pointerId:7,preventDefault(){},
   target:{dataset:{profilePoint:'1'},closest(s){
    return s==='[data-profile-point]'?this:null;
   }}});
  assert.equal(ui._vgAuthoredSelected,1);
  ui.$.vgProfileCanvas.events.pointerup({pointerId:7});
  assert.equal(ui._vgAuthoredDrag,null);
  ui.$.vgProfileCanvas.events.change({target:{
   value:'.8',classList:{contains:s=>s==='spl-profile-x'},
  }});
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).points[1].x,.8);
  assert.equal(ui.$.vgProfileSave.disabled,false);
  assert.equal(dump.value.graphJson.value,graph,'No graph JSON mutations');
  assert.equal(dump.value.profileAssetA.value.uuid,'profile-1');
  // Inserting and removing points updates only the draft.
  ui._vgAuthoredSelected=0;
  ui.$.vgProfileCanvas.events.click({target:{
   classList:{contains:x=>x==='spl-profile-insert'},closest(s){return s==='button'?this:null;}
  }});
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).points.length,5);
  ui.$.vgProfileCanvas.events.click({target:{
   classList:{contains:x=>x==='spl-profile-remove'},closest(s){return s==='button'?this:null;}
  }});
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).points.length,4);
  // Invalid coordinates reject and do not overwrite the last-good draft.
  const last=ui._vgAuthoredDraft.profileJson;
  ui.$.vgProfileCanvas.events.change({target:{
   value:'10',classList:{contains:s=>s==='spl-profile-x'},
  }});
  assert.equal(ui._vgAuthoredDraft.profileJson,last);
  assert.match(ui.$.vgProfileStatus.textContent,/Profile point/);
  ui.$.vgProfileSave.events.click();await tick();
  assert.equal(saved,1);assert(ui._vgAuthoredDraft);
  assert.match(ui.$.vgProfileStatus.textContent,/checksum conflict/);
  saveResult='cancel';
  ui.$.vgProfileSave.events.click();await tick();
  assert.equal(saved,2);assert(ui._vgAuthoredDraft);
  saveResult='ok';
  ui.$.vgProfileSave.events.click();await tick();
  assert.equal(saved,3);
  assert.equal(payload.assetUuid,'profile-1');
  assert.equal(payload.slot,0);
  assert.equal(payload.sha256,'a'.repeat(64));
  assert.equal(ui._vgAuthoredDraft.sha256,'b'.repeat(64));
  assert.equal(ui.$.vgProfileSave.disabled,true);
  ui.$.vgProfileDiscard.events.click();
  assert.equal(ui._vgAuthoredDraft,null);
  ui.$.vgProfileOpen.events.click();await tick();
  assert(ui._vgAuthoredDraft);
  dump.value.profileAssetA.value={uuid:'profile-2'};
  panel.update.call(ui,dump);
  assert.equal(ui._vgAuthoredDraft,null,'Asset rebind invalidates draft');
  assert.equal(dump.value.graphJson.value,graph);
  panel.close.call(ui);
  assert(require(root+'/package.json').scripts.test.includes(
   'geometry-profile-inspector-v2.test.cjs'));
  console.log('PROFILE INSPECTOR V2 PASS: SVG point selection, numeric edit, insert/delete, conflict/cancel/save, draft discard and source identity guard.');
 }finally{globalThis.Editor=priorEditor;}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
