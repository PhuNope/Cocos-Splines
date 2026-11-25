'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),
 os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const project=fs.mkdtempSync(path.join(os.tmpdir(),'spline-profile-export-'));
const assets=path.join(project,'assets'),sub=path.join(assets,'Authored');
fs.mkdirSync(sub,{recursive:true});
const {planProfileExport,writeNewProfileAsset}=require(
 root+'/dist/SplineGeometryProfileExport.js');
const {createProfilePreset}=require(root+'/dist/SplineGeometryProfileLibrary.js');
const {formatProfile}=require(root+'/dist/SplineGeometryProfileEditor.js');
const rectangle=createProfilePreset('rectangle');
const dest=path.join(sub,'Rectangle.json');
const outside=path.join(project,'outside.json');
let selected='node-1',assetUuid='asset-a',answer=1,filenameNext=dest;
let dialogSaves=0,dialogConfirms=0,refreshes=0,snapshots=0;
let refreshFail=false;
const original=Module._load,previous=globalThis.Editor;
const sceneRoot={uuid:'root',components:[],children:[],isValid:true};
const component={kind:'Splines.SplineGeometryGraphRenderer',enabled:true,
 profileAssetA:{uuid:'asset-a',name:'ProfileA'},
 profileAssetB:null,profileAssetC:null};
sceneRoot.children=[{uuid:'node-1',components:[component],children:[],isValid:true}];
Module._load=function(name,parent,isMain){
 if(name==='cc')return {director:{getScene:()=>sceneRoot},
  js:{getClassName:c=>c.kind}};
 if(name==='./SplineExampleScene'&&parent?.filename.endsWith('scene.js'))
  return {queryExampleGalleryScene:()=>({})};
 if(name==='./SplineJunctionScene'&&parent?.filename.endsWith('scene.js'))
  return {createJunctionScene:()=>({})};
 return original.apply(this,arguments);
};
async function run(){
 try{
  // Pure creation: filename is user-chosen, inside real Project/assets only.
  const planned=planProfileExport(dest,assets,rectangle);
  assert.equal(planned.assetUrl,'db://assets/Authored/Rectangle.json');
  assert.equal(planned.content,rectangle);
  assert.equal(planned.bytes,Buffer.byteLength(rectangle));
  assert.throws(()=>planProfileExport(outside,assets,rectangle),/Project\/assets/);
  assert.throws(()=>planProfileExport(dest.replace('.json','.txt'),assets,rectangle),/\.json/);
  assert.throws(()=>planProfileExport(dest,assets,'{}'),/Profile Asset/);
  const oversized=JSON.stringify({format:'cocos-splines/profile',version:1,
   points:Array(999).fill({x:0,y:0})});
  assert.throws(()=>planProfileExport(dest,assets,oversized),/Profile Asset|JSON/);
  const link=path.join(assets,'Symlink');
  fs.symlinkSync(sub,link,'dir');
  assert.throws(()=>planProfileExport(path.join(link,'Illegal.json'),assets,rectangle),
   /real directories/);
  const first=writeNewProfileAsset(dest,assets,rectangle);
  assert.equal(first.assetUrl,planned.assetUrl);
  assert.equal(fs.readFileSync(dest,'utf8'),rectangle);
  assert.equal(fs.existsSync(dest+'.meta'),false,'Never fabricate .meta UUIDs');
  assert.throws(()=>writeNewProfileAsset(dest,assets,createProfilePreset('l-section')),
   /EEXIST/);
  assert.equal(fs.readFileSync(dest,'utf8'),rectangle);
  // Existing orphan .meta must not be silently attached to a different profile.
  const target=path.join(sub,'ExistingMeta.json');
  fs.writeFileSync(target+'.meta','{"uuid":"not-ours"}');
  assert.throws(()=>writeNewProfileAsset(target,assets,rectangle),/meta/);
  assert.equal(fs.existsSync(target),false);
  globalThis.Editor={
   Project:{path:project},Selection:{getSelected:()=>selected?[selected]:[]},
   Dialog:{
    save:async options=>{
     dialogSaves++;
     assert(options.path.startsWith(assets));
     return filenameNext===null?{canceled:true}:{filePath:filenameNext};
    },
    info:async (message,options)=>{
     dialogConfirms++;
     assert.match(message,/Create a NEW Profile JsonAsset/);
     assert(options.detail.includes('NEVER be overwritten'));
     return {response:answer};
    },
   },
   Message:{request:async(domain,action,payload)=>{
    if(domain==='scene'&&action==='execute-scene-script')
     return scene.methods[payload.method](...payload.args);
    if(domain==='asset-db'&&action==='refresh-asset'){
     refreshes++;assert(payload.startsWith('db://assets/'));
     return refreshFail?false:true;
    }
    if(domain==='scene'&&action==='snapshot'){snapshots++;return true;}
    throw Error('Unexpected IPC '+domain+'/'+action);
   }},
  };
  const scene=require(root+'/dist/scene.js');
  const ext=require(root+'/dist/main.js');
  assert.deepEqual(require(root+'/package.json').contributions.messages[
   'export-geometry-profile-asset'].methods,['exportGeometryProfileAsset']);
  assert.equal((await ext.methods.exportGeometryProfileAsset(
   {presetId:'wrong'})).ok,false,'Unknown preset cannot open Save');
  assert.equal(dialogSaves,0);
  filenameNext=null;
  assert.equal((await ext.methods.exportGeometryProfileAsset(
   {presetId:'l-section'})).canceled,true);
  assert.equal(dialogConfirms,0);
  filenameNext=outside;answer=0;
  assert.equal((await ext.methods.exportGeometryProfileAsset(
   {presetId:'l-section'})).ok,false,
   'Cannot create outside Project/assets even after dialog confirmation');
  assert.equal(fs.existsSync(outside),false);
  filenameNext=dest;
  assert.equal((await ext.methods.exportGeometryProfileAsset(
   {presetId:'l-section'})).ok,false,'Existing user asset never overwritten');
  assert.equal(fs.readFileSync(dest,'utf8'),rectangle);
  filenameNext=path.join(sub,'Canceled.json');answer=1;
  assert.equal((await ext.methods.exportGeometryProfileAsset(
   {presetId:'l-section'})).canceled,true);
  assert.equal(fs.existsSync(filenameNext),false);
  answer=0;
  const created=await ext.methods.exportGeometryProfileAsset({presetId:'l-section'});
  assert.equal(created.ok,true);assert.equal(created.created,true);
  assert.equal(created.assetUrl,'db://assets/Authored/Canceled.json');
  assert.equal(fs.readFileSync(filenameNext,'utf8'),createProfilePreset('l-section'));
  assert.equal(fs.existsSync(filenameNext+'.meta'),false);
  const prior=fs.readFileSync(filenameNext,'utf8');
  // Existing source reference cannot be silently overwritten/assigned.
  filenameNext=path.join(sub,'FromDraft.json');
  const authored=formatProfile({format:'cocos-splines/profile',version:1,
   points:[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}],
   uv:{uMetersPerRepeat:1.5,seamEdge:2}});
  const draft={nodeUuid:'node-1',assetUuid,slot:0,profileJson:authored};
  selected='other';
  assert.equal((await ext.methods.exportGeometryProfileAsset(draft)).ok,false);
  selected='node-1';
  component.profileAssetA.uuid='asset-b';
  assert.equal((await ext.methods.exportGeometryProfileAsset(draft)).ok,false,
   'Draft binding must still exist');
  component.profileAssetA.uuid=assetUuid;
  const drafted=await ext.methods.exportGeometryProfileAsset(draft);
  assert.equal(drafted.ok,true);
  assert.equal(drafted.assetUrl,'db://assets/Authored/FromDraft.json');
  assert.equal(fs.readFileSync(filenameNext,'utf8'),authored);
  assert.equal(component.profileAssetA.uuid,assetUuid,'Never change component refs');
  assert.equal(fs.readFileSync(path.join(sub,'Canceled.json'),'utf8'),prior);
  filenameNext=path.join(sub,'RefreshPending.json');refreshFail=true;
  const refresh=await ext.methods.exportGeometryProfileAsset({presetId:'octagon'});
  assert.equal(refresh.ok,true);assert.equal(refresh.refreshPending,true);
  assert.equal(fs.readFileSync(filenameNext,'utf8'),createProfilePreset('octagon'));
  assert.equal(snapshots,0,'No Scene Undo snapshot for external JsonAsset');
  assert.equal(dialogConfirms>=4,true);
  assert.equal(refreshes,3);
  assert(require(root+'/package.json').scripts.test.includes(
   'geometry-profile-export-v2.test.cjs'));
  console.log('PROFILE EXPORT V2 PASS: new project JsonAsset only, path/symlink/meta/overwrite guards, cancel, preset/draft, native confirmation, refresh failure and no Scene writes.');
 }finally{
  Module._load=original;globalThis.Editor=previous;
  fs.rmSync(project,{recursive:true,force:true});
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
