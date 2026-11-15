'use strict';
/** Junction seam diagnostic is read-only across Editor Main -> Scene. */
const assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const expected={ok:true,uvPhaseChecked:true,branches:3,boundaryVertices:9,
 matchedGeometry:9,matchedUV:9,maxPositionGap:0,maxUVPhaseError:0,
 inconsistentUVBranches:0,degenerateTriangles:0,
 duplicatedTriangles:0,nonManifoldEdges:0,materialSlots:[0],details:[],notes:[]};
let passes=0;
const road={className:'Spline.Road',bakedMesh:{uuid:'road-baked'}};
const junction={className:'Spline.Junction',
 bakedMesh:{uuid:'junction-baked'},branches:[road,road,road],
 inspectJunctionSeams(){passes++;return expected;}};
const nodes={uuid:'scene',components:[],children:[
 {uuid:'junction',components:[junction],children:[]},
 {uuid:'road',components:[road],children:[]}]};
const originalLoad=Module._load,originalEditor=globalThis.Editor;
Module._load=function(id,parent,isMain){
 if(id==='cc')return {director:{getScene:()=>nodes},
  js:{getClassName:component=>component.className}};
 return originalLoad.call(this,id,parent,isMain);
};
(async()=>{
try{
 const scene=require('../src/v2/clean-scene.js');
 let selected='junction',writes=0;
 globalThis.Editor={Selection:{getSelected:()=>[selected]},
  Message:{request:async(channel,method,payload)=>{
   if(channel==='scene'&&method==='execute-scene-script')
    return scene.methods[payload.method](...payload.args);
   writes++;
   throw Error('Read-only Seam Audit must not send '+channel+':'+method);
  }}};
 const main=require('../src/v2/clean-main.js');
 let result=await main.methods.inspectV2JunctionSeams();
 assert.equal(result.ok,true);
 assert.deepEqual(result.report,expected);
 assert.equal(passes,1);
 assert.equal(writes,0);
 assert.equal(junction.bakedMesh.uuid,'junction-baked');
 const broken={...expected,ok:false,matchedUV:8,
  inconsistentUVBranches:1,notes:['Road cut-ring UV does not match']};
 junction.inspectJunctionSeams=()=>broken;
 result=await main.methods.inspectV2JunctionSeams();
 assert.equal(result.ok,true,'Audit should return a report, not hide the cause');
 assert.equal(result.report.ok,false);
 assert.equal(writes,0);
 selected='road';
 const unavailable=await main.methods.inspectV2JunctionSeams();
 assert.equal(unavailable.ok,false);
 assert.match(unavailable.error,/Select a Junction Patch/);
 assert.equal(writes,0);
 const inspector=require('../src/contributions/inspector/JunctionV2.js');
 assert.match(inspector.template,/Check Junction Seams/);
 assert.match(inspector.template,/spl-v2-strictRoadSeams/);
 assert.doesNotMatch(inspector.template,/spl-v2-status|status-panel/);
 console.log('V2 JUNCTION SEAM EDITOR FLOW PASS: read-only Scene diagnostics, valid/failed reports, no history or Bake writes, Inspector action');
}finally{Module._load=originalLoad;globalThis.Editor=originalEditor;}
})().catch(e=>{console.error(e);process.exitCode=1;});
