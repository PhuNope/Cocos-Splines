'use strict';
const assert=require('node:assert/strict');
const {analyzeSharedGraphChanges}=require('../src/SplineGeometryGraphConflict');
const baseline={version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'ribbon',type:'ribbon',input:'source',width:4,thickness:0},
 {id:'output',type:'output',input:'ribbon'},
],output:'output'};
const json=v=>JSON.stringify(v);
const withRibbon=patch=>({...baseline,nodes:baseline.nodes.map(n=>
 n.id==='ribbon'?{...n,...patch}:n)});
const draft=withRibbon({width:8});
const latest=withRibbon({thickness:2});
const original=json(baseline),local=json(draft),remote=json(latest);
const analysis=analyzeSharedGraphChanges(original,local,remote);
assert.equal(analysis.canRebase,true);
assert.deepEqual(analysis.draftChanges,['ribbon.width']);
assert.deepEqual(analysis.sourceChanges,['ribbon.thickness']);
assert.equal(JSON.parse(analysis.mergedGraphJson).nodes[1].width,8);
assert.equal(JSON.parse(analysis.mergedGraphJson).nodes[1].thickness,2);
assert.equal(local,json(draft),'pure analysis must never mutate callers');
assert.equal(remote,json(latest));
const sameValue=analyzeSharedGraphChanges(original,local,json(withRibbon({width:8})));
assert.equal(sameValue.canRebase,true,'Identical change on both sides is safe.');
assert.equal(JSON.parse(sameValue.mergedGraphJson).nodes[1].width,8);
const conflict=analyzeSharedGraphChanges(original,local,json(withRibbon({width:11})));
assert.equal(conflict.canRebase,false);
assert.deepEqual(conflict.conflicts,['ribbon.width']);
assert.equal(conflict.mergedGraphJson,null);
const structural={...baseline,nodes:[
 baseline.nodes[0],{id:'offset1',type:'offset',input:'source',right:1},
 {...baseline.nodes[1],input:'offset1'},baseline.nodes[2]]};
const structuralChange=analyzeSharedGraphChanges(original,local,json(structural));
assert.equal(structuralChange.canRebase,false);
assert.equal(structuralChange.structuralConflict,true);
assert(structuralChange.sourceChanges.includes('offset1 (added)'));
assert(structuralChange.sourceChanges.includes('ribbon.input'));
const localStructure=analyzeSharedGraphChanges(original,json(structural),remote);
assert.equal(localStructure.canRebase,false);
assert.equal(localStructure.structuralConflict,true);
const movedSource=JSON.parse(original);
movedSource.nodes.find(n=>n.type==='spline').slot=1;
const slotReview=analyzeSharedGraphChanges(original,JSON.stringify(movedSource),remote);
assert.equal(slotReview.structuralConflict,true,'Changing a native source slot is a topology change');
assert.equal(slotReview.canRebase,false);
const profileBase={version:1,output:'output',nodes:[baseline.nodes[0],
 {id:'extrude',type:'extrude',input:'source',profileKeys:[{progress:0,slot:0},{progress:1,slot:1}]},
 {id:'output',type:'output',input:'extrude'}]};
const profileEdit=JSON.parse(json(profileBase));profileEdit.nodes[1].profileKeys[1].slot=2;
const profileRemote=JSON.parse(json(profileBase));profileRemote.nodes[1].width=3;
const keyReview=analyzeSharedGraphChanges(json(profileBase),json(profileEdit),json(profileRemote));
assert.equal(keyReview.canRebase,true);
assert.deepEqual(keyReview.draftChanges,['extrude.profileKeys']);
assert.equal(JSON.parse(keyReview.mergedGraphJson).nodes[1].profileKeys[1].slot,2);
assert.throws(()=>analyzeSharedGraphChanges(original,'{invalid',remote),/Malformed/);
console.log('SHARED GRAPH CONFLICT V2 PASS: nonoverlapping parameter rebase, same-value merge, collision, structural fail-closed.');
