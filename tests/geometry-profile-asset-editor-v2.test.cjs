'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
 path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const project=fs.mkdtempSync(path.join(os.tmpdir(),'splines-profile-asset-ipc-'));
const assets=path.join(project,'assets');fs.mkdirSync(assets);
const file=path.join(assets,'Profile.json');
const profile={format:'cocos-splines/profile',version:1,points:[
 {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},
]};
const serialize=p=>JSON.stringify(p,null,2)+'\n';
fs.writeFileSync(file,serialize(profile));
fs.writeFileSync(file+'.meta','unchanged');
const rootNode={uuid:'root',components:[],children:[],isValid:true};
const comp={kind:'Splines.SplineGeometryGraphRenderer',enabled:true,
 profileAssetA:{name:'Profile',uuid:'profile-a'},
 profileAssetB:null,profileAssetC:null};
rootNode.children=[{uuid:'node-1',components:[comp],children:[],isValid:true}];
let selected='node-1',answer={response:1},refreshes=0,snapshots=0,requests=[];
const prev=globalThis.Editor,original=Module._load;
Module._load=function(name,parent,isMain){
 if(name==='cc')return {director:{getScene:()=>rootNode},js:{getClassName:c=>c.kind}};
 if(name==='./SplineExampleScene'&&parent?.filename.endsWith('scene.js'))
  return {queryExampleGalleryScene:()=>({})};
 if(name==='./SplineJunctionScene'&&parent?.filename.endsWith('scene.js'))
  return {createJunctionScene:()=>({})};
 return original.apply(this,arguments);
};
async function run(){
 try{
  const scene=require(root+'/dist/scene.js');
  globalThis.Editor={
   Project:{path:project},
   Selection:{getSelected:()=>selected?[selected]:[]},
   Dialog:{info:async()=>answer},
   Message:{request:async(name,method,payload)=>{
    requests.push([name,method,payload]);
    if(name==='scene'&&method==='execute-scene-script')
     return scene.methods[payload.method](...payload.args);
    if(name==='asset-db'&&method==='query-url'){
     assert.equal(payload,'profile-a');return 'db://assets/Profile.json';
    }
    if(name==='asset-db'&&method==='query-path'){
     assert.equal(payload,'profile-a');return file;
    }
    if(name==='asset-db'&&method==='refresh-asset'){
     refreshes++;assert.equal(payload,'db://assets/Profile.json');return true;
    }
    if(name==='scene'&&method==='snapshot'){snapshots++;return true;}
    throw Error('Unexpected Editor IPC '+name+'/'+method);
   }},
  };
  const ext=require(root+'/dist/main.js');
  assert.deepEqual(require(root+'/package.json').contributions.messages['begin-geometry-profile-edit'].methods,
   ['beginGeometryProfileEdit']);
  assert.deepEqual(require(root+'/package.json').contributions.messages['save-geometry-profile-edit'].methods,
   ['saveGeometryProfileEdit']);
  assert.equal(scene.methods.queryGeometryProfileAsset('node-1',1).ok,false,
   'Missing Profile B must not open a phantom asset');
  assert.equal(scene.methods.queryGeometryProfileAsset('node-1',3).ok,false);
  const opened=await ext.methods.beginGeometryProfileEdit(0);
  assert.equal(opened.ok,true);assert.equal(opened.assetUuid,'profile-a');
  assert.equal(opened.nodeUuid,'node-1');assert.equal(opened.slot,0);
  const changed={...profile,points:profile.points.map((p,i)=>i===1?{x:.8,y:p.y}:p)};
  const draft={nodeUuid:opened.nodeUuid,slot:0,assetUuid:opened.assetUuid,
   sha256:opened.sha256,profileJson:serialize(changed)};
  assert.equal((await ext.methods.saveGeometryProfileEdit(draft)).canceled,true);
  assert.equal(fs.readFileSync(file,'utf8'),serialize(profile));
  assert.equal(snapshots,0);assert.equal(refreshes,0);
  answer={response:0};
  selected='another-node';
  assert.equal((await ext.methods.saveGeometryProfileEdit(draft)).ok,false);
  selected='node-1';
  comp.profileAssetA={uuid:'different-asset'};
  assert.equal((await ext.methods.saveGeometryProfileEdit(draft)).ok,false);
  comp.profileAssetA={uuid:'profile-a',name:'Profile'};
  const ok=await ext.methods.saveGeometryProfileEdit(draft);
  assert.equal(ok.ok,true);assert.equal(ok.changed,true);
  assert.equal(refreshes,1);assert.equal(snapshots,0);
  assert.equal(fs.readFileSync(file+'.meta','utf8'),'unchanged');
  assert.equal(fs.readFileSync(file,'utf8'),serialize(changed));
  const stale=await ext.methods.saveGeometryProfileEdit(draft);
  assert.equal(stale.conflict,true);
  const latest=await ext.methods.beginGeometryProfileEdit(0);
  assert.equal((await ext.methods.saveGeometryProfileEdit({
   ...draft,sha256:latest.sha256,profileJson:latest.profileJson})).changed,false);
  const bad=await ext.methods.saveGeometryProfileEdit({
   ...draft,sha256:latest.sha256,profileJson:'{}'});
  assert.equal(bad.ok,false);
  assert.equal(fs.readFileSync(file,'utf8'),serialize(changed));
  assert.equal(snapshots,0);assert.equal(refreshes,1);
  assert.equal(requests.some(x=>x[1]==='set-property'),false);
  assert(require(root+'/package.json').scripts.test.includes('geometry-profile-asset-editor-v2.test.cjs'));
  console.log('PROFILE ASSET EDITOR IPC V2 PASS: asset slot/UUID guards, native confirmation, checksum conflict, save, meta preservation, no Scene writes.');
 }finally{Module._load=original;globalThis.Editor=prev;
  fs.rmSync(project,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
