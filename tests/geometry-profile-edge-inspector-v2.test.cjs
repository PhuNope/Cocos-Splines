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
const source=model.formatProfile({format:'cocos-splines/profile',version:1,points:[
 {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},
]});
function element(){
 return {events:{},value:'0',disabled:false,hidden:false,innerHTML:'',textContent:'',
  classList:{toggle(){},contains(){return false;}},
  addEventListener(name,fn){this.events[name]=fn;},
  dispatch(){throw Error('Profile editor must not commit any Scene property');},
  render(){},setPointerCapture(){},releasePointerCapture(){},
  querySelector(selector){return selector==='svg'?{getBoundingClientRect:()=>
   ({left:0,top:0,width:240,height:240})}:null;},
 };
}
const ui={$:{}};
for(const key of Object.keys(panel.$))ui.$[key]=element();
const dump={value:{graphJson:{value:graph},graphLayoutJson:{value:'{}'},
 useGraphAsset:{value:false},graphAsset:{value:null},
 renderAllOutputs:{value:false},outputId:{value:''},outputOrder:{value:''},
 profileAssetA:{value:{uuid:'profile-1'}},profileAssetB:{value:null},
 profileAssetC:{value:null}}};
let writes=0,savedProfile=null;
const previous=globalThis.Editor;
globalThis.Editor={Message:{request:async(_pkg,action,args)=>{
 if(action==='begin-geometry-profile-edit')return {
  ok:true,nodeUuid:'node-1',slot:0,assetUuid:'profile-1',
  assetName:'Profile.json',sha256:'a'.repeat(64),profileJson:source};
 if(action==='save-geometry-profile-edit'){
  savedProfile=args.profileJson;writes++;
  return {ok:true,changed:true,sha256:'b'.repeat(64),
   profileJson:args.profileJson,message:'Saved Profile Asset'};
 }
 throw Error('Unexpected Editor request '+action);
}}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const pointer=(kind,index,x,y,id=1)=>({pointerId:id,clientX:x,clientY:y,
 preventDefault(){},target:{dataset:kind==='edge'?{profileEdge:String(index)}:
  {profilePoint:String(index)},closest(selector){
  return selector===(kind==='edge'?'[data-profile-edge]':'[data-profile-point]')?
   this:null;
 }}});
const button=name=>({classList:{contains:cls=>cls===name},
 closest(selector){return selector==='button'?this:null;}});
async function run(){
 try{
  panel.ready.call(ui);panel.update.call(ui,dump);
  assert.equal(ui.$.vgProfileUndo.disabled,true);
  assert.equal(ui.$.vgProfileRedo.disabled,true);
  ui.$.vgProfileOpen.events.click();await tick();
  assert.equal(ui._vgAuthoredDraft.profileJson,source);
  assert.match(ui.$.vgProfileCanvas.innerHTML,/data-profile-edge="0"/);
  assert.match(ui.$.vgProfileCanvas.innerHTML,/data-profile-point="0"/);
  assert.equal(ui.$.vgProfileSave.disabled,true);
  // Drag the bottom edge down twice: one Undo group.
  ui.$.vgProfileSnap.value='0.05';
  ui.$.vgProfileCanvas.events.pointerdown(pointer('edge',0,120,172,1));
  assert.equal(ui._vgAuthoredEdge,0);
  assert.match(ui.$.vgProfileCanvas.innerHTML,/edge #1 selected/);
  ui.$.vgProfileCanvas.events.pointermove({pointerId:1,clientX:120,clientY:182.4});
  ui.$.vgProfileCanvas.events.pointermove({pointerId:1,clientX:120,clientY:192.8});
  ui.$.vgProfileCanvas.events.pointerup({pointerId:1});
  const translated=ui._vgAuthoredDraft.profileJson;
  const points=model.parseProfile(translated).points;
  assert.deepEqual(points.slice(0,2),[
   {x:-.5,y:-.7},{x:.5,y:-.7}]);
  assert.equal(ui._vgAuthoredDraft.undo.length,1,
   'All pointermove events in one drag must be one history entry');
  assert.equal(ui._vgAuthoredDraft.redo.length,0);
  assert.equal(ui.$.vgProfileUndo.disabled,false);
  assert.equal(writes,0,'Drag must not write external JsonAsset or Scene');
  // Repeated Undo/Redo never changes original Scene dumps.
  ui.$.vgProfileUndo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,source);
  assert.equal(ui._vgAuthoredDraft.redo.length,1);
  assert.equal(ui.$.vgProfileUndo.disabled,true);
  ui.$.vgProfileRedo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,translated);
  // Select an edge (pointerdown/up without movement), then insert a vertex.
  ui.$.vgProfileCanvas.events.pointerdown(pointer('edge',0,120,192.8,2));
  ui.$.vgProfileCanvas.events.pointerup({pointerId:2});
  assert.match(ui.$.vgProfileCanvas.innerHTML,/Insert at selected edge/);
  ui.$.vgProfileCanvas.events.click({target:button('spl-profile-insert-edge')});
  const inserted=ui._vgAuthoredDraft.profileJson;
  assert.equal(model.parseProfile(inserted).points.length,5);
  assert.equal(ui._vgAuthoredSelected,1);
  assert.equal(ui._vgAuthoredEdge,null);
  assert.equal(ui._vgAuthoredDraft.undo.length,2);
  ui.$.vgProfileCanvas.events.keydown({ctrlKey:true,shiftKey:false,
   key:'z',target:{tagName:'SVG'},preventDefault(){}});
  assert.equal(ui._vgAuthoredDraft.profileJson,translated);
  ui.$.vgProfileCanvas.events.keydown({ctrlKey:true,shiftKey:true,
   key:'z',target:{tagName:'SVG'},preventDefault(){}});
  assert.equal(ui._vgAuthoredDraft.profileJson,inserted);
  // Draft limit and invalid edge movement fail closed.
  ui._vgAuthoredSelected=0;
  const lastGood=ui._vgAuthoredDraft.profileJson;
  ui.$.vgProfileCanvas.events.pointerdown(pointer('edge',0,120,192.8,3));
  ui.$.vgProfileCanvas.events.pointermove({pointerId:3,clientX:120,clientY:-100});
  ui.$.vgProfileCanvas.events.pointerup({pointerId:3});
  assert.equal(ui._vgAuthoredDraft.profileJson,lastGood,
   'Out-of-bounds edge drag cannot destroy valid geometry');
  assert.equal(ui._vgAuthoredDraft.undo.length,2);
  assert.equal(dump.value.graphJson.value,graph);
  assert.equal(dump.value.profileAssetA.value.uuid,'profile-1');
  // Successfully saving external JsonAsset establishes a new history baseline.
  ui.$.vgProfileSave.events.click();await tick();
  assert.equal(writes,1);
  assert.equal(savedProfile,inserted);
  assert.equal(ui._vgAuthoredDraft.undo.length,0);
  assert.equal(ui._vgAuthoredDraft.redo.length,0);
  assert.equal(ui.$.vgProfileUndo.disabled,true);
  assert.equal(ui.$.vgProfileSave.disabled,true);
  // UV0 seam/edge weights extend the same draft-only Undo/Redo and native
  // confirmed-save workflow without changing the renderer's Scene dump.
  ui.$.vgProfileCanvas.events.pointerdown(pointer('edge',0,120,192.8,6));
  ui.$.vgProfileCanvas.events.pointerup({pointerId:6});
  ui.$.vgProfileCanvas.events.click({target:button('spl-profile-set-uv-seam')});
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv.seamEdge,0);
  assert.equal(ui._vgAuthoredDraft.undo.length,1);
  ui.$.vgProfileCanvas.events.change({target:{
   value:'2.5',classList:{contains:cls=>cls==='spl-profile-uv-weight'},
  }});
  const uvDraft=ui._vgAuthoredDraft.profileJson;
  assert.equal(model.parseProfile(uvDraft).uv.edgeWeights[0],2.5);
  assert.equal(ui._vgAuthoredDraft.undo.length,2);
  ui.$.vgProfileCanvas.events.change({target:{
   value:'5',classList:{contains:cls=>cls==='spl-profile-uv-weight'},
  }});
  assert.equal(ui._vgAuthoredDraft.profileJson,uvDraft,
   'Invalid UV weight rejects without affecting last-good draft');
  assert.equal(ui._vgAuthoredDraft.undo.length,2);
  ui.$.vgProfileUndo.events.click();
  assert.deepEqual(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv,
   {seamEdge:0});
  ui.$.vgProfileRedo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,uvDraft);
  ui.$.vgProfileCanvas.events.click({target:button('spl-profile-reset-uv')});
  assert.equal(model.parseProfile(ui._vgAuthoredDraft.profileJson).uv,undefined);
  ui.$.vgProfileUndo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,uvDraft);
  assert.equal(dump.value.graphJson.value,graph);
  assert.equal(dump.value.profileAssetA.value.uuid,'profile-1');
  ui.$.vgProfileSave.events.click();await tick();
  assert.equal(writes,2);
  assert.equal(savedProfile,uvDraft);
  assert.equal(ui._vgAuthoredDraft.undo.length,0);
  assert.equal(ui.$.vgProfileSave.disabled,true);
  // Physical U tile length is a separate optional UV metadata property.
  // Editing numeric UI must be draft-only and participate in Undo/Redo.
  ui.$.vgProfileCanvas.events.change({target:{
   value:'1.5',classList:{contains:cls=>cls==='spl-profile-uv-meters'},
  }});
  const metricDraft=ui._vgAuthoredDraft.profileJson;
  assert.equal(model.parseProfile(metricDraft).uv.uMetersPerRepeat,1.5);
  assert.equal(ui._vgAuthoredDraft.undo.length,1);
  assert.match(ui.$.vgProfileCanvas.innerHTML,/Side U meters\/repeat/);
  assert.match(ui.$.vgProfileCanvas.innerHTML,/Nominal meters/);
  ui.$.vgProfileCanvas.events.change({target:{
   value:'0',classList:{contains:cls=>cls==='spl-profile-uv-meters'},
  }});
  assert.equal(ui._vgAuthoredDraft.profileJson,metricDraft);
  assert.equal(ui._vgAuthoredDraft.undo.length,1);
  ui.$.vgProfileCanvas.events.change({target:{
   value:'invalid',classList:{contains:cls=>cls==='spl-profile-uv-meters'},
  }});
  assert.equal(ui._vgAuthoredDraft.profileJson,metricDraft);
  assert.equal(ui._vgAuthoredDraft.undo.length,1);
  ui.$.vgProfileUndo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,uvDraft);
  ui.$.vgProfileRedo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,metricDraft);
  ui.$.vgProfileCanvas.events.click({target:button('spl-profile-clear-uv-meters')});
  assert.equal(ui._vgAuthoredDraft.profileJson,uvDraft);
  ui.$.vgProfileUndo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,metricDraft);
  assert.equal(dump.value.graphJson.value,graph);
  assert.equal(dump.value.profileAssetA.value.uuid,'profile-1');
  assert.equal(writes,2,'Metric draft edits cannot save without confirmation');
  ui.$.vgProfileSave.events.click();await tick();
  assert.equal(writes,3);
  assert.equal(savedProfile,metricDraft);
  assert.equal(model.parseProfile(savedProfile).uv.uMetersPerRepeat,1.5);
  assert.equal(ui._vgAuthoredDraft.undo.length,0);
  assert.equal(ui.$.vgProfileSave.disabled,true);
  // Per-frame metric UV checkbox is draft-only and can be undone, and
  // disabling it restores exact nominal mapping without losing other UV.
  ui.$.vgProfileCanvas.events.change({target:{
   checked:true,classList:{contains:cls=>cls==='spl-profile-uv-follow-frame'},
  }});
  const frameDraft=ui._vgAuthoredDraft.profileJson;
  assert.equal(model.parseProfile(frameDraft).uv.uFollowFrameScale,true);
  assert.match(ui.$.vgProfileCanvas.innerHTML,/Follow taper \/ frame scale/);
  assert.match(ui.$.vgProfileCanvas.innerHTML,/Frame-local meters/);
  assert.equal(ui._vgAuthoredDraft.undo.length,1);
  assert.equal(writes,3,'Checkbox must not save a JsonAsset implicitly');
  ui.$.vgProfileUndo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,metricDraft);
  ui.$.vgProfileRedo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,frameDraft);
  ui.$.vgProfileCanvas.events.change({target:{
   checked:false,classList:{contains:cls=>cls==='spl-profile-uv-follow-frame'},
  }});
  assert.equal(ui._vgAuthoredDraft.profileJson,metricDraft);
  ui.$.vgProfileUndo.events.click();
  assert.equal(ui._vgAuthoredDraft.profileJson,frameDraft);
  assert.equal(writes,3);
  ui.$.vgProfileSave.events.click();await tick();
  assert.equal(writes,4);
  assert.equal(savedProfile,frameDraft);
  assert.equal(ui._vgAuthoredDraft.undo.length,0);
  assert.equal(ui.$.vgProfileSave.disabled,true);
  ui.$.vgProfileDiscard.events.click();
  assert.equal(ui._vgAuthoredDraft,null);
  panel.close.call(ui);
  assert(require(root+'/package.json').scripts.test.includes(
   'geometry-profile-edge-inspector-v2.test.cjs'));
  console.log('PROFILE EDGE INSPECTOR V2 PASS: SVG edge drag and insert, 1-step drag Undo, Redo, snap, invalid-geometry rollback, save boundary and source isolation.');
 }finally{globalThis.Editor=previous;}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
