'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {PRESETS,createProfilePreset,applyProfilePreset}=
 require(root+'/dist/SplineGeometryProfileLibrary.js');
const {parseProfile,formatProfile}=require(root+'/dist/SplineGeometryProfileEditor.js');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
assert(PRESETS.length>=5);
assert.equal(new Set(PRESETS.map(p=>p.id)).size,PRESETS.length);
assert(Object.isFrozen(PRESETS));
for(const option of PRESETS){
 const profile=parseProfile(createProfilePreset(option.id));
 assert.equal(profile.format,'cocos-splines/profile');
 assert.equal(profile.version,1);
 assert.equal(profile.points.length,option.vertices);
 assert.equal(!!profile.uv,option.hasUV);
 const again=parseProfile(createProfilePreset(option.id));
 again.points[0].x=999;
 assert.notEqual(parseProfile(createProfilePreset(option.id)).points[0].x,999,
  'Profile Library must return isolated copies');
}
for(const invalid of ['',null,0,{},'../../asset.json'])
 assert.throws(()=>createProfilePreset(invalid),/Profile Library/);
const source=createProfilePreset('rectangle');
const sourceSnapshot=source;
assert.equal(applyProfilePreset(source,'l-section'),createProfilePreset('l-section'));
assert.equal(source,sourceSnapshot,'Applying a preset must not mutate input');
assert.throws(()=>applyProfilePreset('{}','rectangle'),/Profile Asset/);
const graph=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'extrude',type:'extrude',input:'source',profileSlot:0},
 {id:'output',type:'output',input:'extrude'},
],output:'output'});
const ui={$:{}};
function element(){
 return {events:{},disabled:false,hidden:false,innerHTML:'',textContent:'',
  value:'0',classList:{toggle(){},contains(){return false;}},
  addEventListener(name,cb){this.events[name]=cb;},
  dispatch(){throw Error('Library preset must not touch Scene property');},
  render(){},setPointerCapture(){},releasePointerCapture(){}};
}
for(const key of Object.keys(panel.$))ui.$[key]=element();
const dump={value:{graphJson:{value:graph},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null},renderAllOutputs:{value:false},
 outputOrder:{value:''},outputId:{value:''},profileAssetA:{value:{uuid:'lib-a'}},
 profileAssetB:{value:null},profileAssetC:{value:null}}};
const oldEditor=globalThis.Editor;
let opened=0,saved=0,savePayload=null;
globalThis.Editor={Message:{request:async(_pkg,method,params)=>{
 if(method==='begin-geometry-profile-edit'){
  opened++;assert.equal(params,0);
  return {ok:true,nodeUuid:'node-1',assetUuid:'lib-a',
   assetName:'ProfileA',slot:0,sha256:'a'.repeat(64),profileJson:source};
 }
 if(method==='save-geometry-profile-edit'){
  saved++;savePayload=params;
  return {ok:true,changed:true,sha256:'b'.repeat(64),profileJson:params.profileJson,
   message:'Saved explicit Profile JSON'};
 }
 throw Error('Unexpected Editor IPC: '+method);
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 try{
  panel.ready.call(ui);panel.update.call(ui,dump);
  assert.match(panel.template,/Profile Library/);
  assert.match(panel.template,/Load Preset into Draft/);
  assert.equal(ui.$.vgProfileApplyPreset.disabled,true);
  ui.$.vgProfileOpen.events.click();await tick();
  assert.equal(opened,1);
  assert.equal(ui.$.vgProfileApplyPreset.disabled,false);
  ui.$.vgProfilePreset.value='l-section';
  ui.$.vgProfileApplyPreset.events.click();
  const lDraft=ui._vgAuthoredDraft.profileJson;
  assert.equal(lDraft,createProfilePreset('l-section'));
  assert.equal(ui._vgAuthoredDraft.undo.length,1);
  assert.equal(saved,0);
  assert.equal(dump.value.graphJson.value,graph);
  assert.equal(dump.value.profileAssetA.value.uuid,'lib-a');
  ui.$.vgProfileUndo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,source);
  ui.$.vgProfileRedo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,lDraft);
  ui.$.vgProfilePreset.value='uv-seam-demo';
  ui.$.vgProfileApplyPreset.events.click();
  const uvDraft=ui._vgAuthoredDraft.profileJson;
  assert.deepEqual(parseProfile(uvDraft).uv,
   {seamEdge:2,edgeWeights:[1,2,1,1]});
  assert.equal(ui._vgAuthoredDraft.undo.length,2);
  ui.$.vgProfilePreset.value='../invalid';
  ui.$.vgProfileApplyPreset.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,uvDraft,
   'Unknown preset rejected without draft mutation');
  assert.equal(ui._vgAuthoredDraft.undo.length,2);
  assert.equal(saved,0);
  ui.$.vgProfileSave.events.click();await tick();
  assert.equal(saved,1);
  assert.equal(savePayload.profileJson,uvDraft);
  assert.equal(savePayload.assetUuid,'lib-a');
  assert.equal(ui._vgAuthoredDraft.undo.length,0);
  assert.equal(ui.$.vgProfileSave.disabled,true);
  ui.$.vgProfileDiscard.events.click();
  assert.equal(ui._vgAuthoredDraft,null);
  panel.close.call(ui);
  assert(require(root+'/package.json').scripts.test.includes(
   'geometry-profile-library-v2.test.cjs'));
  console.log('PROFILE LIBRARY V2 PASS: bounded validated templates, isolated copies, Inspector draft replacement, Undo/Redo and explicit save.');
 }finally{globalThis.Editor=oldEditor;}
})().catch(e=>{console.error(e);process.exitCode=1;});
