'use strict';
/** Full Editor <-> Scene Auto Connect action contract, mocked Cocos 3.8. */
const assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),copy=x=>JSON.parse(JSON.stringify(x));
const prop=(type,value)=>({type,value});
const link=(componentUuid,atEnd=false,stopBarEnabled=true,crosswalkEnabled=true)=>
 prop('SplinesV2.JunctionRoadLink',{
  road:prop('SplinesV2.SplineRoad',{uuid:componentUuid}),
  atEnd:prop('Boolean',atEnd),
  stopBarEnabled:prop('Boolean',stopBarEnabled),
  crosswalkEnabled:prop('Boolean',crosswalkEnabled)
 });
const roadNodes=['W','N','E'].map(name=>({
 uuid:'road-'+name,components:[{className:'SplinesV2.SplineRoad',
 uuid:'component-'+name,bakedMesh:{uuid:'baked-'+name}}],children:[]}));
const junction={className:'SplinesV2.JunctionPatch',uuid:'junction-component',
 branches:[{road:roadNodes[1].components[0],atEnd:false,
  stopBarEnabled:false,crosswalkEnabled:true}],
 previews:0,bakedMesh:{uuid:'baked-junction'},onRestore(){this.previews++;},
 planAutoConnectV2(){
  const names=['W','N','E'];
  return {center:{x:0,y:0,z:0},searchRadius:.75,scannedRoads:3,skipped:[],
   expectedLinks:this.branches.map(l=>({componentUuid:l.road?.uuid||'',atEnd:!!l.atEnd})),
   branches:names.map((name,i)=>({roadId:'road-'+name,
    componentUuid:'component-'+name,pathId:'path-'+name,
    atEnd:i===0,distance:.1,bearingDegrees:i*90}))};
 }};
const junctionNode={uuid:'junction',components:[junction],children:[]};
const sceneNode={uuid:'root',components:[],children:[junctionNode,...roadNodes]};
const oldLoad=Module._load;
Module._load=function(id,parent,isMain){
 if(id==='cc')return {director:{getScene:()=>sceneNode},
  js:{getClassName:c=>c.className}};
 return oldLoad.call(this,id,parent,isMain);
};
const oldEditor=globalThis.Editor;
let history=[],writes=0,reject=false,mutateBeforeQuery=false;
const dumped=()=>({__comps__:[{type:'cc.MeshRenderer',value:{}},
 {type:'SplinesV2.JunctionPatch',value:{
  branches:{type:'Array',elementTypeData:link(''),value:
   junction.branches.map(l=>link(l.road?.uuid||'',!!l.atEnd,
    l.stopBarEnabled,l.crosswalkEnabled))},
  endpointTolerance:prop('Float',.25),junctionUVMode:prop('Enum',0),
  curbRamps:prop('Array',[]),turnGuides:prop('Array',[])
 }}]});
(async()=>{
try{
 const scene=require(path.join(root,'src/v2/clean-scene.js'));
 let selected='junction';
 globalThis.Editor={Selection:{getSelected:()=>[selected]},
  Message:{request:async(channel,method,payload)=>{
   if(channel==='scene'&&method==='execute-scene-script')
    return scene.methods[payload.method](...payload.args);
   if(channel==='scene'&&method==='query-node'){
    assert.equal(payload,'junction');
    if(mutateBeforeQuery){
     mutateBeforeQuery=false;junction.branches[0].atEnd=true;
    }
    return dumped();
   }
   if(channel==='scene'&&method==='set-property'){
    assert.equal(payload.uuid,'junction');
    assert.equal(payload.record,true);
    assert.equal(payload.path,'__comps__.1.branches');
    if(reject)return false;
    history.push(copy(dumped().__comps__[1].value.branches.value));
    writes++;
    junction.branches=payload.dump.value.map(x=>{
     const id=x.value.road.value.uuid;
     const road=roadNodes.find(n=>n.components[0].uuid===id).components[0];
     return {road,atEnd:x.value.atEnd.value,
      stopBarEnabled:x.value.stopBarEnabled.value,
      crosswalkEnabled:x.value.crosswalkEnabled.value};
    });
    return true;
   }
   throw Error('Unexpected request '+channel+':'+method);
  }}};
 const main=require(path.join(root,'src/v2/clean-main.js'));
 const old=copy(dumped().__comps__[1].value.branches.value);
 const checked=await main.methods.planV2JunctionAutoConnect();
 assert.equal(checked.ok,true);assert.equal(checked.plan.branches.length,3);
 assert.equal(writes,0);
 let applied=await main.methods.applyV2JunctionAutoConnect();
 assert.equal(applied.ok,true);
 assert.equal(applied.changed,true);assert.equal(writes,1);
 assert.equal(junction.previews,1);
 assert.deepEqual(junction.branches.map(l=>l.road.uuid),
  ['component-N','component-W','component-E']);
 assert.equal(junction.branches[0].stopBarEnabled,false,
  'Existing Road-specific paint settings survive sorting');
 assert.equal(junction.branches[0].atEnd,false);
 assert.equal(junction.branches[1].atEnd,true);
 assert.equal(junction.bakedMesh.uuid,'baked-junction');
 assert(roadNodes.every((n,i)=>n.components[0].bakedMesh.uuid==='baked-'+['W','N','E'][i]));
 applied=await main.methods.applyV2JunctionAutoConnect();
 assert.equal(applied.changed,false);assert.equal(writes,1,'No-op has no Undo entry');
 // Simulated Creator Undo restores original Branches array.
 const prev=history.pop();
 junction.branches=prev.map(x=>({
  road:roadNodes.find(n=>n.components[0].uuid===x.value.road.value.uuid).components[0],
  atEnd:x.value.atEnd.value,
  stopBarEnabled:x.value.stopBarEnabled.value,
  crosswalkEnabled:x.value.crosswalkEnabled.value
 }));
 assert.deepEqual(dumped().__comps__[1].value.branches.value,old);
 mutateBeforeQuery=true;
 const rejected=await main.methods.applyV2JunctionAutoConnect();
 assert.equal(rejected.ok,false);assert.match(rejected.error,/changed since/);
 assert.equal(writes,1,'Stale preflight must refuse without recorded mutation');
 junction.branches[0].atEnd=false;
 reject=true;
 const failed=await main.methods.applyV2JunctionAutoConnect();
 assert.equal(failed.ok,false);assert.match(failed.error,/Creator rejected/);
 assert.equal(writes,1);
 console.log('JUNCTION AUTO CONNECT EDITOR FLOW PASS: Check, recordable apply, existing paint flags, no-op, preflight, Undo, baked safety');
}finally{Module._load=oldLoad;globalThis.Editor=oldEditor;}
})().catch(error=>{console.error(error);process.exitCode=1;});
