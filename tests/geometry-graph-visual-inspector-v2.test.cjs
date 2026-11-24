'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const model=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
function el(){
 return {
  events:{},innerHTML:'',textContent:'',value:'',disabled:false,
  classList:{toggle(){}},
  addEventListener(name,callback){this.events[name]=callback;},
  dispatch(){},
  setPointerCapture(){},releasePointerCapture(){},
 };
}
const initial=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'ribbon',type:'ribbon',input:'source',width:3},
 {id:'output',type:'output',input:'ribbon'},
],output:'output'},null,2);
const dump={value:{
 graphJson:{value:initial},
 graphLayoutJson:{value:'{}'},
}};
const ui={$:{}},commits=[];
for(const name of Object.keys(panel.$))ui.$[name]=el();
for(const key of ['graphJson','graphLayoutJson']){
 const property=ui.$['p_'+key];
 property.dispatch=function(event){
  assert.equal(event,'change-dump','Must use Cocos ui-prop native change-dump');
  assert.equal(this.dump,dump.value[key],'Dispatch must bind correct native property dump');
  commits.push({key,event,value:this.dump.value});
 };
 property.render=function(p){this.lastDump=p;};
}
panel.ready.call(ui);
panel.update.call(ui,dump);
assert(panel.template.includes('spl-vg-stage'));
assert(panel.template.includes('spl-vg-add-offset'));
assert(panel.template.includes('spl-field-graphLayoutJson'));
assert(panel.template.includes('spl-vg-properties'));
assert.equal(ui.$.vgRemove.disabled,true);
assert(ui.$.vgStage.innerHTML.includes('data-node="ribbon"'));
assert(ui.$.r_graphLayoutJson.hidden,'Layout dump widget hidden from manual UI, but retained');
function click(name){ui.$[name].events.click();}
function element(selector,id,property){
 return {dataset:{node:id,socket:property},closest(query){
  if(query===selector)return this;return null;
 }};
}
const card=id=>element('.spl-vg-card',id);
const output=id=>element('[data-socket]',id,'out');
const input=id=>element('[data-socket]',id,'in');
const header=id=>({
 dataset:{drag:id},closest(selector){return selector==='[data-drag]'?this:null;}
});
click('vgAddOffset');
assert.equal(commits.length,1);
assert.equal(commits[0].key,'graphJson');
assert.deepEqual(model.parseGraph(dump.value.graphJson.value).ordered.map(n=>n.type),
 ['spline','offset','ribbon','output']);
assert.equal(dump.value.graphLayoutJson.value,'{}');
click('vgAddWidth');
assert.equal(commits.length,2);
assert.deepEqual(model.parseGraph(dump.value.graphJson.value).ordered.map(n=>n.type),
 ['spline','offset','width','ribbon','output']);
const graphAfterInsert=dump.value.graphJson.value;
ui.$.vgStage.events.click({target:card('offset1')});
assert(ui.$.vgProperties.innerHTML.includes('data-graph-param="right"'));
ui.$.vgProperties.events.change({
 target:{dataset:{graphParam:'right'},value:'4.5',closest(sel){
  return sel==='[data-graph-param]'?this:null;
 }}
});
assert.equal(commits.length,3);
assert.equal(model.parseGraph(dump.value.graphJson.value).map.get('offset1').right,4.5);
assert.equal(commits.at(-1).key,'graphJson');
// Typed output -> typed input should reorder path operations preserving all nodes.
ui.$.vgStage.events.click({target:output('width1')});
assert(ui._vgPending==='width1');
ui.$.vgStage.events.click({target:input('offset1')});
assert.equal(commits.length,4);
assert.deepEqual(model.parseGraph(dump.value.graphJson.value).ordered.map(n=>n.type),
 ['spline','width','offset','ribbon','output']);
assert(ui._vgPending===null);
const stableGeometry=dump.value.graphJson.value;
// Invalid socket type must not change graph or generate a dump commit.
ui.$.vgStage.events.click({target:output('ribbon')});
ui.$.vgStage.events.click({target:input('offset1')});
assert.equal(commits.length,4);
assert.equal(dump.value.graphJson.value,stableGeometry);
assert.match(ui.$.vgStatus.textContent,/incompatible socket/i);
const initialPos=model.parseLayout('{}',stableGeometry).offset1;
ui.$.vgStage.events.pointerdown({
 button:0,pointerId:5,clientX:100,clientY:100,target:header('offset1'),
 preventDefault(){}
});
assert(ui._vgDrag);
ui.$.vgStage.events.pointermove({pointerId:5,clientX:144,clientY:125});
assert.equal(commits.length,4,'Pointermove must not persist any draft');
assert.equal(dump.value.graphJson.value,stableGeometry);
ui.$.vgStage.events.pointerup({pointerId:5,type:'pointerup'});
assert.equal(commits.length,5);
assert.equal(commits.at(-1).key,'graphLayoutJson');
assert.equal(dump.value.graphJson.value,stableGeometry);
let position=model.parseLayout(dump.value.graphLayoutJson.value,stableGeometry).offset1;
assert.equal(position.x,initialPos.x+44);
assert.equal(position.y,initialPos.y+25);
const afterDrag=commits.length;
ui.$.vgStage.events.pointerdown({
 button:0,pointerId:6,clientX:130,clientY:130,target:header('offset1')
});
ui.$.vgStage.events.pointermove({pointerId:6,clientX:155,clientY:154});
ui.$.vgStage.events.pointercancel({pointerId:6,type:'pointercancel'});
assert.equal(commits.length,afterDrag,'Canceled drag must not persist');
assert.equal(dump.value.graphJson.value,stableGeometry);
ui.$.vgStage.events.keydown({key:'ArrowRight',shiftKey:true,preventDefault(){}});
assert.equal(commits.length,6);
assert.equal(commits.at(-1).key,'graphLayoutJson');
position=model.parseLayout(dump.value.graphLayoutJson.value,stableGeometry).offset1;
assert.equal(position.x,initialPos.x+44+24);
assert.equal(dump.value.graphJson.value,stableGeometry);
click('vgAuto');
assert.equal(commits.length,7);
assert.equal(dump.value.graphLayoutJson.value,'{}');
ui.$.vgStage.events.click({target:card('offset1')});
click('vgRemove');
assert.equal(commits.length,8);
assert.deepEqual(model.parseGraph(dump.value.graphJson.value).ordered.map(n=>n.type),
 ['spline','width','ribbon','output']);
// Simulate Undo/Redo reloading a native serialized dump.
dump.value.graphJson.value=graphAfterInsert;
panel.update.call(ui,dump);
assert.equal(ui._vgGraphJson,graphAfterInsert);
assert(ui.$.vgStage.innerHTML.includes('data-node="offset1"'));
// Invalid raw JSON remains editable and may not be silently overwritten by canvas.
const bad='{not json';
dump.value.graphJson.value=bad;
panel.update.call(ui,dump);
assert.match(ui.$.vgStatus.textContent,/malformed/i);
const beforeBad=commits.length;
click('vgAddWidth');
assert.equal(commits.length,beforeBad);
assert.equal(dump.value.graphJson.value,bad);
dump.value.graphJson.value=initial;
panel.update.call(ui,dump);
assert.equal(model.parseGraph(ui._vgGraphJson).ordered.length,3);
panel.close.call(ui);
assert.equal(ui._vgGraphJson,null);
const pkg=require(root+'/package.json');
assert(pkg.scripts.test.includes('geometry-graph-visual-inspector-v2.test.cjs'));
const source=require('node:fs').readFileSync(root+'/src/contributions/inspector/GeometryGraph.js','utf8');
assert(source.includes("prop.dispatch('change-dump')"));
assert(!source.includes("set-property"));
assert(!source.includes('snapshot('));
console.log('VISUAL GRAPH INSPECTOR V2 PASS: UI add/remove, typed wires, safe properties, one drag commit, undo reload and invalid JSON isolation.');
