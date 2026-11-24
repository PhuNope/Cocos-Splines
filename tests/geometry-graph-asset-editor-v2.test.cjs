'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),work=fs.mkdtempSync(path.join(os.tmpdir(),'spline-graph-editor-assets-'));
async function run(){
 let oldEditor=globalThis.Editor;
 const original=Module._load;
 const sharedGraph={version:1,nodes:[
  {id:'source',type:'spline'},
  {id:'ribbon',type:'ribbon',input:'source',width:7},
  {id:'output',type:'output',input:'ribbon'}
 ],output:'output'};
 let localGraph=JSON.stringify({...sharedGraph,
  nodes:sharedGraph.nodes.map(n=>n.type==='ribbon'?{...n,width:3}:n)});
 const graph={
  kind:'Splines.SplineGeometryGraphRenderer',enabled:true,
  useGraphAsset:true,graphAsset:{name:'SharedPreset',json:sharedGraph},
  get graphJson(){return localGraph;},set graphJson(x){localGraph=x;},
  activeGraphJson(){return this.useGraphAsset?JSON.stringify(this.graphAsset.json):this.graphJson;}
 };
 const rootScene={uuid:'scene',components:[],children:[],isValid:true};
 const node={uuid:'graph-node',components:[graph],children:[],parent:rootScene,isValid:true};
 rootScene.children.push(node);
 const cc={director:{getScene:()=>rootScene},js:{getClassName:c=>c.kind}};
 Module._load=function(name,parent,isMain){
  if(name==='cc')return cc;
  if(name==='./SplineExampleScene'&&parent?.filename.endsWith('scene.js'))
   return {queryExampleGalleryScene:()=>({})};
  if(name==='./SplineJunctionScene'&&parent?.filename.endsWith('scene.js'))
   return {createJunctionScene:()=>({})};
  return original.apply(this,arguments);
 };
 try{
  const scene=require(root+'/dist/scene.js');
  const read=scene.methods.queryGeometryGraphAsset('graph-node');
  assert.equal(read.ok,true);
  assert.equal(read.componentIndex,0);
  assert.equal(read.assetMode,true);
  assert.equal(read.assetName,'SharedPreset');
  assert.equal(JSON.parse(read.graphJson).nodes[1].width,7);
  assert.equal(JSON.parse(read.localGraphJson).nodes[1].width,3);
  assert.equal(scene.methods.queryGeometryGraphAsset('missing').ok,false);
  graph.enabled=false;
  assert.equal(scene.methods.queryGeometryGraphAsset('graph-node').ok,false);
  graph.enabled=true;
  let selected='graph-node',failField='',rejectSnapshot=false;
  let pendingSave=null,pendingImport=null,dialogSave=0,dialogImport=0;
  const requests=[];
  globalThis.Editor={
   Project:{path:work},
   Selection:{getSelected:()=>selected?[selected]:[]},
   Dialog:{
    save:async()=>{dialogSave++;return pendingSave??{canceled:true};},
    select:async()=>{dialogImport++;return pendingImport??{canceled:true};}
   },
   Message:{request:async (...args)=>{
    requests.push(args);
    if(args[0]==='scene'&&args[1]==='execute-scene-script'){
     const payload=args[2];assert.equal(payload.name,'cocos-splines');
     return scene.methods[payload.method](...payload.args);
    }
    if(args[0]==='scene'&&args[1]==='set-property'){
     const data=args[2],key=data.path.split('.').at(-1);
     assert.equal(data.uuid,'graph-node');
     assert.equal(data.record,false,'Graph import uses one final native snapshot');
     if(key===failField)throw Error('Injected Cocos property failure');
     graph[key]=data.dump.value;return true;
    }
    if(args[0]==='scene'&&args[1]==='snapshot'){
     if(rejectSnapshot)return false;
     return true;
    }
    throw Error('Unexpected Scene mutation: '+args.join(':'));
   }}
  };
  const ext=require(root+'/dist/main.js');
  const active=await ext.methods.queryGeometryGraphAsset();
  assert.equal(active.ok,true);
  assert.equal(active.assetMode,true);
  assert.equal((await ext.methods.exportGeometryGraphAsset()).canceled,true);
  const saved=path.join(work,'SharedGraph.json');
  pendingSave={canceled:false,filePath:saved};
  const exportResult=await ext.methods.exportGeometryGraphAsset();
  assert.equal(exportResult.ok,true);
  assert.equal(JSON.parse(fs.readFileSync(saved,'utf8')).nodes[1].width,7);
  assert.equal(graph.useGraphAsset,true,'Export must never modify component');
  assert.equal(graph.graphAsset.json.nodes[1].width,7);
  const again=await ext.methods.exportGeometryGraphAsset();
  assert.equal(again.ok,false,'Export must not overwrite an existing asset');
  assert.equal(fs.readFileSync(saved,'utf8').includes('"width": 7'),true);
  const copy=await ext.methods.copyGeometryGraphAssetToLocal();
  assert.equal(copy.ok,true);
  assert.equal(graph.useGraphAsset,false);
  assert.equal(JSON.parse(graph.graphJson).nodes[1].width,7);
  assert.equal(graph.graphAsset.json.nodes[1].width,7);
  assert.equal(requests.filter(r=>r[1]==='snapshot').length,1);
  assert.equal((await ext.methods.copyGeometryGraphAssetToLocal()).changed,false);
  const importedFile=path.join(work,'DifferentGraph.json');
  const newData={...sharedGraph,nodes:sharedGraph.nodes.map(n=>
   n.type==='ribbon'?{...n,width:12}:n)};
  fs.writeFileSync(importedFile,JSON.stringify(newData));
  pendingImport={canceled:false,filePaths:[importedFile]};
  const imported=await ext.methods.importGeometryGraphAsset();
  assert.equal(imported.ok,true);
  assert.equal(JSON.parse(graph.graphJson).nodes[1].width,12);
  assert.equal(graph.graphAsset.json.nodes[1].width,7);
  assert.equal(requests.filter(r=>r[1]==='snapshot').length,2);
  const previous=graph.graphJson;
  graph.useGraphAsset=true;
  failField='useGraphAsset';
  const failed=await ext.methods.importGeometryGraphAsset();
  assert.equal(failed.ok,false);
  assert.equal(graph.graphJson,previous,'Failed import must rollback local JSON');
  assert.equal(graph.useGraphAsset,true,'Failed import retains shared mode');
  failField='';
  rejectSnapshot=true;
  assert.equal((await ext.methods.copyGeometryGraphAssetToLocal()).ok,false);
  assert.equal(graph.graphJson,previous,'Snapshot rejection rolls back JSON');
  assert.equal(graph.useGraphAsset,true);
  rejectSnapshot=false;
  fs.writeFileSync(importedFile,'{bad');
  assert.equal((await ext.methods.importGeometryGraphAsset()).ok,false);
  assert.equal(graph.graphJson,previous);
  assert.equal(graph.useGraphAsset,true);
  selected='';
  const beforeDialog=dialogImport;
  assert.equal((await ext.methods.importGeometryGraphAsset()).ok,false);
  assert.equal(dialogImport,beforeDialog,'No file selector without selected Graph node');
  const pkg=require(root+'/package.json');
  for(const key of ['import','export']){
   assert.deepEqual(pkg.contributions.messages[key+'-geometry-graph-asset'].methods,
    [key+'GeometryGraphAsset']);
  }
  assert.deepEqual(pkg.contributions.messages['copy-geometry-graph-to-local'].methods,
    ['copyGeometryGraphAssetToLocal']);
  assert(pkg.scripts.test.includes('geometry-graph-asset-editor-v2.test.cjs'));
  console.log('GEOMETRY GRAPH ASSET EDITOR V2 PASS: shared read-only query, exclusive export, import local copy, rollback, snapshot and missing/invalid file safety.');
 }finally{
  globalThis.Editor=oldEditor;
  Module._load=original;
  fs.rmSync(work,{recursive:true,force:true});
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
