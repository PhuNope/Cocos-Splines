'use strict';
const assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const Module=require('node:module');
async function run(){
 const scene={uuid:'scene',components:[],children:[],isValid:true};
 let rebuilds=0,shouldFail=false;
 const graph={kind:'Splines.SplineGeometryGraphRenderer',enabled:true,
  rebuild(){rebuilds++;if(shouldFail)throw Error('cycle detected');},
  getGraphMetrics(){return {computed:2,reused:3,nodes:5};}
 };
 const node={uuid:'graph-node',components:[graph],children:[],parent:scene,isValid:true};
 scene.children.push(node);
 const cc={director:{getScene:()=>scene},js:{getClassName:c=>c.kind}};
 const original=Module._load,oldEditor=globalThis.Editor;
 Module._load=function(name,parent,isMain){
  if(name==='cc')return cc;
  if(name==='./SplineExampleScene'&&parent?.filename.endsWith('scene.js'))
   return {queryExampleGalleryScene:()=>({})};
  if(name==='./SplineJunctionScene'&&parent?.filename.endsWith('scene.js'))
   return {createJunctionScene:()=>({})};
  return original.call(this,name,parent,isMain);
 };
 try{
  const sceneScript=require(root+'/dist/scene.js');
  const result=sceneScript.methods.rebuildGeometryGraph('graph-node');
  assert.equal(result.ok,true);
  assert.deepEqual(result.metrics,{computed:2,reused:3,nodes:5});
  assert.equal(rebuilds,1);
  assert.equal(sceneScript.methods.rebuildGeometryGraph('bad').ok,false);
  graph.enabled=false;
  assert.equal(sceneScript.methods.rebuildGeometryGraph('graph-node').ok,false);
  graph.enabled=true;shouldFail=true;
  assert.match(sceneScript.methods.rebuildGeometryGraph('graph-node').error,/cycle detected/);
  shouldFail=false;
  let selected='graph-node';
  const calls=[];
  globalThis.Editor={
   Selection:{getSelected:()=>selected?[selected]:[]},
   Message:{request:async (...args)=>{
    calls.push(args);
    if(args[0]==='scene'&&args[1]==='execute-scene-script'){
     const request=args[2];
     assert.equal(request.name,'cocos-splines');
     return sceneScript.methods[request.method](...request.args);
    }
    throw Error('Graph rebuild must never snapshot/create/destroy Scene nodes.');
   }},
  };
  const ext=require(root+'/dist/main.js');
  assert.equal((await ext.methods.rebuildGeometryGraph()).ok,true);
  assert.equal(rebuilds,3);
  assert.equal(calls.length,1);
  assert.equal(calls[0][2].method,'rebuildGeometryGraph');
  assert.deepEqual(calls[0][2].args,['graph-node']);
  selected='';
  assert.equal((await ext.methods.rebuildGeometryGraph()).ok,false);
  assert.equal(calls.length,1,'No Scene request without selected node');
  selected='graph-node';
  const inspector=require(root+'/dist/contributions/inspector/GeometryGraph.js');
  assert(inspector.template.includes('spl-rebuild-graph'));
  assert(inspector.template.includes('spl-field-graphJson'));
  const ui={$:{rebuildGraph:{
   addEventListener(kind,fn){this.events??={};this.events[kind]=fn;}
  },status:{textContent:'',className:''}}};
  inspector.ready.call(ui);
  assert(typeof ui.$.rebuildGraph.events.click==='function');
  ui.$.rebuildGraph.events.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(rebuilds,4);
  assert.equal(calls.length,2);
  assert.match(ui.$.status.textContent,/Graph mesh regenerated/);
  shouldFail=true;
  ui.$.rebuildGraph.events.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(ui.$.status.textContent,/cycle detected/);
  assert.equal(rebuilds,5);
  assert.equal(calls.length,3);
  const pkg=require(root+'/package.json');
  assert(pkg.scripts.test.includes('geometry-graph-editor-v2.test.cjs'));
  console.log('GEOMETRY GRAPH EDITOR V2 PASS: read-only Scene lookup, selected-only rebuild, failure handling, Inspector button and no snapshot.');
 }finally{
  Module._load=original;globalThis.Editor=oldEditor;
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
