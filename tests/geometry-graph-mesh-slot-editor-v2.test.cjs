'use strict';
const assert=require('node:assert/strict');
const model=require('../src/SplineGeometryGraphVisualModel');
const conflict=require('../src/SplineGeometryGraphConflict');
const graph=JSON.stringify({version:2,nodes:[
 {id:'source',type:'spline'},
 {id:'road',type:'meshDeform',input:'source'},
 {id:'pipe',type:'meshDeform',input:'source'},
 {id:'outRoad',type:'output',input:'road'},
 {id:'outPipe',type:'output',input:'pipe'},
],output:'outRoad'});
const parse=model.parseGraph;
let json=model.applyGraphEdit(graph,'attach-mesh-asset',{id:'road'});
assert.equal(parse(json).map.get('road').meshInput,'meshAsset');
assert.equal(parse(json).map.get('meshAsset').slot,undefined);
json=model.applyGraphEdit(json,'attach-mesh-asset',{id:'pipe'});
assert.equal(parse(json).map.get('pipe').meshInput,'meshAsset1');
assert.equal(parse(json).map.get('meshAsset1').slot,1);
assert.equal(parse(json).ordered.filter(n=>n.type==='meshAsset').length,2);
const first=JSON.stringify(json);
assert.equal(model.applyGraphEdit(json,'attach-mesh-asset',{id:'pipe'}),json);
json=model.applyGraphEdit(json,'param',{id:'road',key:'axis',value:0});
json=model.applyGraphEdit(json,'param',{id:'pipe',key:'axis',value:1});
assert.equal(parse(json).map.get('road').axis,0);
assert.equal(parse(json).map.get('pipe').axis,1);
for(const invalid of [3,-1,1.5]){
 assert.throws(()=>model.applyGraphEdit(json,'param',{
  id:'road',key:'axis',value:invalid
 }),/parameter/);
}
assert.match(model.renderNodeParameters(json,'road'),/data-graph-param="axis"/);
assert.match(model.renderNodeParameters(json,'pipe'),/>Y</);
assert.match(model.renderNodeParameters(json,'meshAsset1'),/B \(Source Mesh B\)/);
assert.match(model.renderGraphCanvas(json,'{}',null,null),/spl-vg-wire-meshSource/);
assert.throws(()=>model.applyGraphEdit(json,'param',{id:'meshAsset1',
 key:'slot',value:0}),/slot/);
const base=json;
const changedSlot=model.applyGraphEdit(base,'param',{id:'meshAsset1',
 key:'slot',value:2});
const review=conflict.analyzeSharedGraphChanges(base,changedSlot,base);
assert.equal(review.structuralConflict,true,'Mesh slot reassignment must not rebase silently');
assert.equal(review.canRebase,false);
const changedAxis=model.applyGraphEdit(base,'param',{id:'pipe',
 key:'axis',value:2});
const otherAxis=model.applyGraphEdit(base,'param',{id:'road',
 key:'axis',value:2});
const merged=conflict.analyzeSharedGraphChanges(base,changedAxis,otherAxis);
assert.equal(merged.canRebase,true,'Separate axis settings can merge');
assert.equal(parse(merged.mergedGraphJson).map.get('pipe').axis,2);
assert.equal(parse(merged.mergedGraphJson).map.get('road').axis,2);
json=model.applyGraphEdit(json,'add-output',{fromOutputId:'outRoad'});
const branch=parse(json).outputs.find(id=>!['outRoad','outPipe'].includes(id));
const created=parse(json).map.get(parse(json).map.get(branch).input);
assert.equal(created.meshInput,'meshAsset');
json=model.applyGraphEdit(json,'detach-mesh-asset',{id:created.id});
assert(parse(json).map.has('meshAsset'),'Shared input stays if another branch uses it');
json=model.applyGraphEdit(json,'attach-mesh-asset',{id:created.id});
const third=parse(json).map.get(created.id);
assert.equal(parse(json).map.get(third.meshInput).slot,2);
json=model.applyGraphEdit(json,'add-output',{fromOutputId:branch});
const newOutput=parse(json).outputs.find(id=>!['outRoad','outPipe',branch].includes(id));
const fourth=parse(json).map.get(parse(json).map.get(newOutput).input);
json=model.applyGraphEdit(json,'detach-mesh-asset',{id:fourth.id});
assert.throws(()=>model.applyGraphEdit(json,'attach-mesh-asset',{id:fourth.id}),
 /three Mesh Asset slots/);
json=model.applyGraphEdit(json,'connect',{source:'meshAsset1',target:fourth.id});
assert.equal(parse(json).map.get(fourth.id).meshInput,'meshAsset1',
 'Explicit socket can share a slot across generators');
const detached=model.applyGraphEdit(json,'detach-mesh-asset',{id:'pipe'});
assert(parse(detached).map.has('meshAsset1'),
 'Shared source remains when another node still uses it');
assert.equal(parse(detached).map.get('pipe').meshInput,undefined);
assert.equal(JSON.parse(graph).version,2);
assert.equal(first.startsWith('"'),true);
assert(require('../package.json').scripts.test.includes('geometry-graph-mesh-slot-editor-v2.test.cjs'));
console.log('GRAPH MESH SLOT EDITOR V2 PASS: three slots, axis selectors, shared sockets and structural rebase guards.');
