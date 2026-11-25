'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const {createProfilePreset}=require(root+'/dist/SplineGeometryProfileLibrary.js');
const graph=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'extrude',type:'extrude',input:'source',profileSlot:0},
 {id:'output',type:'output',input:'extrude'},
],output:'output'});
function element(){
 return {events:{},disabled:false,hidden:false,textContent:'',innerHTML:'',
  value:'0',classList:{contains(){return false},toggle(){}},
  addEventListener(n,fn){this.events[n]=fn;},
  dispatch(){throw Error('Export must not write Scene dump');},render(){},
  setPointerCapture(){},releasePointerCapture(){},
 };
}
const ui={$:{}};
for(const key of Object.keys(panel.$))ui.$[key]=element();
const dump={value:{graphJson:{value:graph},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null},
 renderAllOutputs:{value:false},outputId:{value:''},outputOrder:{value:''},
 profileAssetA:{value:{uuid:'profile-asset-a'}},
 profileAssetB:{value:null},profileAssetC:{value:null}}};
let calls=[],response={ok:true,created:true,assetUrl:'db://assets/Profiles/New.json',
 message:'New JsonAsset created; assign manually'};
const old=globalThis.Editor;
globalThis.Editor={Message:{request:async(_name,method,arg)=>{
 if(method==='begin-geometry-profile-edit')return {
  ok:true,nodeUuid:'node-1',assetUuid:'profile-asset-a',
  slot:0,assetName:'Old.json',profileJson:createProfilePreset('rectangle'),
  sha256:'a'.repeat(64)};
 if(method==='export-geometry-profile-asset'){
  calls.push(arg);return response;
 }
 throw Error('Unexpected Editor call '+method);
}}};
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 try{
  panel.ready.call(ui);panel.update.call(ui,dump);
  assert.match(panel.template,/Create Preset JSON/);
  assert.match(panel.template,/Export Draft As New JSON/);
  assert.equal(ui.$.vgProfileCreatePreset.disabled,false,
   'Preset export is available without a bound/opened asset draft');
  assert.equal(ui.$.vgProfileExportDraft.disabled,true);
  ui.$.vgProfilePreset.value='l-section';
  ui.$.vgProfileCreatePreset.events.click();await tick();
  assert.deepEqual(calls,[{presetId:'l-section'}]);
  assert.equal(ui._vgAuthoredDraft,null);
  assert.equal(ui.$.vgProfileCreatePreset.disabled,false);
  assert.match(ui.$.vgProfileStatus.textContent,/assign manually/);
  assert.equal(dump.value.graphJson.value,graph);
  // Canceled export leaves asset, existing source references and draft alone.
  response={ok:false,canceled:true};ui.$.vgProfileCreatePreset.events.click();
  await tick();
  assert.match(ui.$.vgProfileStatus.textContent,/canceled/);
  assert.equal(ui._vgAuthoredDraft,null);
  ui.$.vgProfileOpen.events.click();await tick();
  assert(ui._vgAuthoredDraft);
  assert.equal(ui.$.vgProfileExportDraft.disabled,false);
  assert.equal(ui.$.vgProfileCreatePreset.disabled,false);
  const draft=ui._vgAuthoredDraft;
  const expected=draft.profileJson;
  response={ok:true,created:true,assetUrl:'db://assets/Profiles/Copy.json',
   message:'Copy saved, manual slot assignment required'};
  ui.$.vgProfileExportDraft.events.click();await tick();
  assert.deepEqual(calls.at(-1),{
   nodeUuid:'node-1',slot:0,assetUuid:'profile-asset-a',
   profileJson:expected,
  });
  assert.equal(ui._vgAuthoredDraft,draft);
  assert.equal(draft.profileJson,expected);
  assert.equal(dump.value.profileAssetA.value.uuid,'profile-asset-a');
  assert.equal(dump.value.graphJson.value,graph);
  assert.equal(ui.$.vgProfileExportDraft.disabled,false);
  response={ok:false,error:'Existing destination cannot be overwritten'};
  ui.$.vgProfileExportDraft.events.click();await tick();
  assert.match(ui.$.vgProfileStatus.textContent,/cannot be overwritten/);
  assert.equal(ui._vgAuthoredDraft,draft);
  // A renderer/asset rebind closes stale drafts; Export Draft disabled.
  dump.value.profileAssetA.value={uuid:'new-profile'};
  panel.update.call(ui,dump);
  assert.equal(ui._vgAuthoredDraft,null);
  assert.equal(ui.$.vgProfileExportDraft.disabled,true);
  assert.equal(ui.$.vgProfileCreatePreset.disabled,false);
  panel.close.call(ui);
  assert(require(root+'/package.json').scripts.test.includes(
   'geometry-profile-export-inspector-v2.test.cjs'));
  console.log('PROFILE EXPORT INSPECTOR V2 PASS: preset without draft, copy draft without mutation, cancel, errors, binding changes, safe UI states.');
 }finally{globalThis.Editor=old;}
})().catch(e=>{console.error(e);process.exitCode=1;});
