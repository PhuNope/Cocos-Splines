'use strict';
const assert=require('node:assert/strict');
const model=require('../src/SplineGeometryGraphVisualModel');
const conflict=require('../src/SplineGeometryGraphConflict');
const basic=JSON.stringify({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'ribbon',type:'ribbon',input:'source',width:3},
 {id:'output',type:'output',input:'ribbon'},
],output:'output'});
const parse=model.parseGraph;
const names=json=>parse(json).ordered.map(n=>n.id);
let branched=model.applyGraphEdit(basic,'add-output');
let graph=parse(branched);
assert.equal(graph.graph.version,2);
assert.equal(graph.graph.output,'output');
assert.equal(graph.outputs.length,2);
assert.equal(graph.map.get('ribbonBranch').type,'ribbon');
assert.equal(graph.map.get('outputBranch').input,'ribbonBranch');
assert.deepEqual(graph.outputs,['output','outputBranch']);
assert.deepEqual(names(branched),['source','ribbon','output','ribbonBranch','outputBranch']);
assert.equal(model.renderGraphCanvas(branched,'{}',null,null).match(/class="spl-vg-card/g).length,5);
assert.equal(model.parseLayout('{}',branched).outputBranch.y,144);
assert.throws(()=>model.applyGraphEdit(basic,'remove-output',{id:'output'}),/default/);
assert.throws(()=>model.applyGraphEdit(branched,'remove-output',{id:'output'}),/default/);
assert.throws(()=>model.applyGraphEdit(branched,'set-default-output',{id:'ribbon'}),/Output Node/);
assert.throws(()=>model.applyGraphEdit(branched,'set-default-output',{id:'none'}),/Output Node/);
const alt=model.applyGraphEdit(branched,'replace-generator',{
 type:'tube',outputId:'outputBranch',
});
const parsedAlt=parse(alt);
assert.equal(parsedAlt.graph.output,'output');
assert.equal(parsedAlt.map.get('output').input,'ribbon',
 'Original branch must remain unchanged');
assert.equal(parsedAlt.map.get('outputBranch').input,'tube',
 'Selected branch must use its new generator');
assert.equal(parsedAlt.map.get('ribbonBranch'),undefined,
 'Old branch generator should be pruned when unreferenced');
let different=model.applyGraphEdit(alt,'param',{id:'tube',key:'radius',value:2});
assert.equal(parse(different).map.get('tube').radius,2);
assert.equal(parse(different).map.get('ribbon').width,3);
assert.throws(()=>model.applyGraphEdit(different,'connect',{
 source:'tube',target:'ribbon'
}),/incompatible/i);
assert.throws(()=>model.applyGraphEdit(different,'param',{
 id:'outputBranch',key:'width',value:1
}),/does not support/);
let selected=model.applyGraphEdit(different,'set-default-output',{id:'outputBranch'});
assert.equal(parse(selected).graph.output,'outputBranch');
assert.equal(model.applyGraphEdit(selected,'set-default-output',
 {id:'outputBranch'}),selected);
assert.throws(()=>model.applyGraphEdit(selected,'remove-output',
 {id:'outputBranch'}),/default/);
selected=model.applyGraphEdit(selected,'set-default-output',{id:'output'});
assert.equal(parse(selected).graph.output,'output');
const trimmed=model.applyGraphEdit(selected,'remove-output',{id:'outputBranch'});
assert.equal(parse(trimmed).graph.version,1);
assert.deepEqual(names(trimmed),['source','ribbon','output']);
assert.deepEqual(JSON.parse(trimmed),JSON.parse(basic));
assert.equal(JSON.parse(basic).version,1,'V1 input must remain unchanged');
const second=model.applyGraphEdit(branched,'add-output',{
 fromOutputId:'outputBranch',
});
const third=model.applyGraphEdit(second,'add-output',{
 fromOutputId:'outputBranch',
});
assert.equal(parse(third).outputs.length,4);
assert.throws(()=>model.applyGraphEdit(third,'add-output'),/four outputs/);
const graphWidth=model.applyGraphEdit(branched,'insert',{
 type:'width',before:'ribbonBranch',
});
assert.equal(parse(graphWidth).map.get('ribbonBranch').input,'width1');
assert.equal(parse(graphWidth).map.get('ribbon').input,'source');
const base2=branched;
const local=model.applyGraphEdit(base2,'param',{
 id:'ribbonBranch',key:'width',value:6,
});
const remote=model.applyGraphEdit(base2,'param',{
 id:'ribbon',key:'width',value:10,
});
const review=conflict.analyzeSharedGraphChanges(base2,local,remote);
assert.equal(review.canRebase,true);
assert.equal(parse(review.mergedGraphJson).map.get('ribbon').width,10);
assert.equal(parse(review.mergedGraphJson).map.get('ribbonBranch').width,6);
const overlap=conflict.analyzeSharedGraphChanges(base2,local,
 model.applyGraphEdit(base2,'param',{id:'ribbonBranch',key:'width',value:8}));
assert.equal(overlap.canRebase,false);
assert.deepEqual(overlap.conflicts,['ribbonBranch.width']);
const structure=conflict.analyzeSharedGraphChanges(basic,branched,basic);
assert.equal(structure.canRebase,false,'V1->V2 topology upgrade is never silently rebased');
assert.equal(structure.structuralConflict,true);
assert(require('../package.json').scripts.test.includes('geometry-graph-multi-output-editor-v2.test.cjs'));
console.log('MULTI-OUTPUT EDITOR V2 PASS: branch add, independent generator, default/remove/downgrade, 4-output cap, safe shared rebase.');
