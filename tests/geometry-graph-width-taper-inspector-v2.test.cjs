'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const original=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'ribbon',type:'ribbon',input:'source',width:2},
 {id:'output',type:'output',input:'ribbon'},
],output:'output'});
function el(){
 return {events:{},innerHTML:'',textContent:'',value:'',disabled:false,
  classList:{toggle(){}},addEventListener(name,fn){this.events[name]=fn;},
  dispatch(){throw Error('Unexpected Scene write');},render(){},
  setPointerCapture(){},releasePointerCapture(){}};
}
const ui={$:{}},commits=[],dump={value:{
 graphJson:{value:original},graphLayoutJson:{value:'{}'},
}};
for(const key of Object.keys(panel.$))ui.$[key]=el();
for(const key of ['graphJson','graphLayoutJson']){
 ui.$['p_'+key].dispatch=function(event){
  assert.equal(event,'change-dump');
  commits.push({key,event,value:this.dump.value});
 };
 ui.$['p_'+key].render=function(p){this.lastDump=p;};
}
const card=id=>({dataset:{node:id},closest(sel){
 return sel==='.spl-vg-card'?this:null;
}});
const update=(key,value)=>ui.$.vgProperties.events.change({target:{
 dataset:{graphParam:key},value,
 closest(sel){return sel==='[data-graph-param]'?this:null;},
}});
try{
 panel.ready.call(ui);panel.update.call(ui,dump);
 ui.$.vgAddWidth.events.click();
 const parsed=model.parseGraph(dump.value.graphJson.value);
 assert.equal(parsed.map.get('width1').input,'source');
 ui.$.vgStage.events.click({target:card('width1')});
 assert.match(ui.$.vgProperties.innerHTML,/data-graph-param="multiplier"/);
 assert.match(ui.$.vgProperties.innerHTML,/data-graph-param="midMultiplier"/);
 assert.match(ui.$.vgProperties.innerHTML,/data-graph-param="endMultiplier"/);
 assert.match(ui.$.vgProperties.innerHTML,/data-graph-param="taperMode"/);
 assert.match(ui.$.vgProperties.innerHTML,/closed splines/);
 const source=original;
 update('multiplier','2');
 update('midMultiplier','0.7');
 update('endMultiplier','0.3');
 update('taperMode','1');
 const tapered=model.parseGraph(dump.value.graphJson.value).map.get('width1');
 assert.deepEqual([tapered.multiplier,tapered.midMultiplier,
  tapered.endMultiplier,tapered.taperMode],[2,.7,.3,1]);
 assert.equal(commits.length,5);
 assert(commits.every(c=>c.key==='graphJson'),
  'Width parameter edits must not write Graph layout');
 assert.equal(dump.value.graphLayoutJson.value,'{}');
 const valid=dump.value.graphJson.value;
 update('endMultiplier','20.5');
 assert.equal(dump.value.graphJson.value,valid,'Out-of-bounds input cannot mutate graph');
 assert.equal(commits.length,5);
 update('midMultiplier','not-a-number');
 assert.equal(commits.length,5);
 assert.equal(dump.value.graphJson.value,valid);
 update('taperMode','0.5');
 assert.equal(commits.length,5);
 update('endMultiplier','');
 assert.equal(model.parseGraph(dump.value.graphJson.value).map.get('width1').endMultiplier,
  undefined,'Empty End means uniform Start');
 update('midMultiplier','');
 assert.equal(model.parseGraph(dump.value.graphJson.value).map.get('width1').midMultiplier,
  undefined,'Empty Mid means automatic interpolation');
 assert.equal(model.parseGraph(dump.value.graphJson.value).map.get('width1').taperMode,1);
 assert.match(ui.$.vgProperties.innerHTML,/Auto \(linear midpoint\)/);
 assert.match(ui.$.vgProperties.innerHTML,/Same as Start/);
 assert.equal(commits.length,7);
 // Native Undo/Redo rehydrates serialized Graph data correctly, without
 // new snapshot IPC or edits to attached source/Scene components.
 dump.value.graphJson.value=valid;
 panel.update.call(ui,dump);
 assert.equal(model.parseGraph(ui._vgGraphJson).map.get('width1').endMultiplier,.3);
 assert.equal(model.parseGraph(ui._vgGraphJson).map.get('width1').midMultiplier,.7);
 dump.value.graphJson.value=source;
 panel.update.call(ui,dump);
 assert.deepEqual(model.parseGraph(ui._vgGraphJson).ordered.map(n=>n.id),
  ['source','ribbon','output']);
 panel.close.call(ui);
 assert(require(root+'/package.json').scripts.test.includes(
  'geometry-graph-width-taper-inspector-v2.test.cjs'));
 console.log('WIDTH CURVE INSPECTOR V2 PASS: optional Mid/End editing/clearing, smoothstep, validation, native property Undo, no layout writes.');
}catch(error){console.error(error);process.exitCode=1;}
