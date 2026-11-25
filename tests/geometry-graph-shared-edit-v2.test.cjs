'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),project=fs.mkdtempSync(path.join(os.tmpdir(),'splines-shared-edit-'));
const assets=path.join(project,'assets');fs.mkdirSync(assets);
const file=path.join(assets,'Graph.json');
const graph=width=>({version:1,nodes:[{id:'source',type:'spline'},
 {id:'ribbon',type:'ribbon',input:'source',width},{id:'output',type:'output',input:'ribbon'}],output:'output'});
fs.writeFileSync(file,JSON.stringify(graph(4)));
let selected='graph-node',mode=true,assetUuid='asset-1',confirm={response:1};
let refreshed=0,snapshots=0,queries=[],failedRefresh=false;
const ccGraph={kind:'Splines.SplineGeometryGraphRenderer',enabled:true,useGraphAsset:true,
 graphJson:JSON.stringify(graph(2)),graphAsset:{name:'Graph',uuid:'asset-1',json:graph(4)},
 activeGraphJson(){return JSON.stringify(this.graphAsset.json);},
 profileGraph(){return {graphVersion:1,outputId:'output',sampledFrames:4,
  cold:{totalMs:1,computed:3,reused:0,nodes:[]},
  warm:{totalMs:0,computed:0,reused:3,nodes:[]}};}};
const sceneRoot={uuid:'scene',components:[],children:[],isValid:true};
const graphNode={uuid:'graph-node',components:[ccGraph],children:[],parent:sceneRoot,isValid:true};
sceneRoot.children.push(graphNode);
const original=Module._load,previous=globalThis.Editor;
Module._load=function(name,parent,isMain){
 if(name==='cc')return {director:{getScene:()=>sceneRoot},js:{getClassName:c=>c.kind}};
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
   Dialog:{info:async()=>confirm},
   Message:{request:async (name,action,value)=>{
    queries.push([name,action,value]);
    if(name==='scene'&&action==='execute-scene-script')
      return scene.methods[value.method](...value.args);
    if(name==='asset-db'&&action==='query-url'){
      assert.equal(value,'asset-1');return 'db://assets/Graph.json';
    }
    if(name==='asset-db'&&action==='query-path'){
      assert.equal(value,'asset-1');return file;
    }
    if(name==='asset-db'&&action==='refresh-asset'){
      refreshed++;assert.equal(value,'db://assets/Graph.json');
      if(failedRefresh)throw Error('AssetDB disconnected');
      return true;
    }
    if(name==='scene'&&action==='snapshot'){snapshots++;return true;}
    throw Error('Unexpected Editor message: '+name+'/'+action);
   }}
  };
  const ext=require(root+'/dist/main.js');
  // Read-only CPU profiling bridges Inspector -> main -> Scene, without
  // modifying shared JSON, local component properties or scene history.
  const profiled=await ext.methods.profileGeometryGraph();
  assert.equal(profiled.ok,true);
  assert.equal(profiled.profile.cold.computed,3);
  assert.equal(profiled.profile.outputId,'output');
  assert.equal(refreshed,0);
  assert.equal(snapshots,0);
  assert.equal(queries.some(x=>x[1]==='set-property'),false);
  selected='different-node';
  assert.equal((await ext.methods.profileGeometryGraph()).ok,false);
  selected='graph-node';
  const first=await ext.methods.beginSharedGeometryGraphEdit();
  assert.equal(first.ok,true);
  assert.equal(first.assetUuid,'asset-1');
  assert.equal(JSON.parse(first.graphJson).nodes[1].width,4);
  assert.equal(refreshed,0);
  assert.equal(fs.readFileSync(file,'utf8'),JSON.stringify(graph(4)),'Open draft is read-only');
  const draft={nodeUuid:first.nodeUuid,assetUuid:first.assetUuid,sha256:first.sha256,graphJson:JSON.stringify(graph(8))};
  const canceled=await ext.methods.saveSharedGeometryGraphEdit(draft);
  assert.equal(canceled.canceled,true);
  assert.equal(refreshed,0);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).nodes[1].width,4);
  confirm={response:0};
  selected='different-node';
  assert.equal((await ext.methods.saveSharedGeometryGraphEdit(draft)).ok,false);
  selected='graph-node';
  ccGraph.useGraphAsset=false;
  assert.equal((await ext.methods.saveSharedGeometryGraphEdit(draft)).ok,false);
  ccGraph.useGraphAsset=true;
  ccGraph.graphAsset.uuid='different-asset';
  assert.equal((await ext.methods.saveSharedGeometryGraphEdit(draft)).ok,false);
  ccGraph.graphAsset.uuid='asset-1';
  const successful=await ext.methods.saveSharedGeometryGraphEdit(draft);
  assert.equal(successful.ok,true);
  assert.equal(successful.changed,true);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).nodes[1].width,8);
  assert.equal(refreshed,1);
  assert.equal(snapshots,0,'Shared JSON updates are not Scene history');
  assert.equal(ccGraph.graphJson,JSON.stringify(graph(2)),'Local component JSON never changes');
  const stale=await ext.methods.saveSharedGeometryGraphEdit(draft);
  assert.equal(stale.ok,false,'Old draft must not overwrite updated source');
  const latest=await ext.methods.beginSharedGeometryGraphEdit();
  assert.equal(latest.ok,true);
  const unchanged=await ext.methods.saveSharedGeometryGraphEdit({
   nodeUuid:latest.nodeUuid,assetUuid:latest.assetUuid,
   sha256:latest.sha256,graphJson:latest.graphJson});
  assert.equal(unchanged.changed,false);
  assert.equal(refreshed,1);
  const after=await ext.methods.beginSharedGeometryGraphEdit();
  failedRefresh=true;
  const pending=await ext.methods.saveSharedGeometryGraphEdit({...draft,
   sha256:after.sha256,graphJson:JSON.stringify(graph(10))});
  assert.equal(pending.ok,true);
  assert.equal(pending.refreshPending,true);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).nodes[1].width,10);
  assert.equal(refreshed,2);
  assert.equal(snapshots,0);
  assert.equal(queries.some(x=>x[1]==='set-property'),false);
  const pkg=require(root+'/package.json');
  assert.deepEqual(pkg.contributions.messages['begin-shared-geometry-graph-edit'].methods,
   ['beginSharedGeometryGraphEdit']);
  assert.deepEqual(pkg.contributions.messages['save-shared-geometry-graph-edit'].methods,
   ['saveSharedGeometryGraphEdit']);
  assert.deepEqual(pkg.contributions.messages['profile-geometry-graph'].methods,
   ['profileGeometryGraph']);
  assert(pkg.scripts.test.includes('geometry-graph-shared-edit-v2.test.cjs'));
  console.log('SHARED GRAPH EDIT V2 PASS: staged draft, confirmation, selection/mode guards, CAS conflict, refresh and no Scene mutations.');
 }finally{
  Module._load=original;globalThis.Editor=previous;
  fs.rmSync(project,{recursive:true,force:true});
 }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
