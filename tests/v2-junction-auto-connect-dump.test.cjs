'use strict';
const assert=require('node:assert/strict');
const {planJunctionAutoConnectDump:plan}=require('../src/v2/JunctionAutoConnectDump');
const copy=x=>JSON.parse(JSON.stringify(x));
const property=(type,value)=>({type,value});
const link=(id,atEnd=false,stopBarEnabled=true,crosswalkEnabled=true)=>
 property('SplinesV2.JunctionRoadLink',{
  road:property('SplinesV2.SplineRoad',{uuid:id}),
  atEnd:property('Boolean',atEnd),
  stopBarEnabled:property('Boolean',stopBarEnabled),
  crosswalkEnabled:property('Boolean',crosswalkEnabled),
  extra:property('String','keep')
 });
const make=(entries,opts={})=>({__comps__:[
 {type:'cc.MeshRenderer',value:{}},
 {type:'SplinesV2.JunctionPatch',value:{
  branches:{type:'Array',value:copy(entries),
   elementTypeData:link('',false)},
  endpointTolerance:property('Float',.25),junctionUVMode:property('Enum',0),
  turnGuides:property('Array',opts.turnGuides||[]),
  curbRamps:property('Array',opts.curbRamps||[])
 }}]});
const arms=['A','B','C','D'].map((id,i)=>({
 componentUuid:'comp-'+id,roadId:'road-'+id,pathId:'path-'+id,
 atEnd:i%2===1,bearingDegrees:i*90
}));
let original=make([]),baseline=JSON.stringify(original);
let proposal={branches:arms.slice(0,3),expectedLinks:[]};
let p=plan(original,proposal);
assert.equal(p.record,true);assert.equal(p.componentIndex,1);
assert.equal(p.count,3);
assert.deepEqual(p.dump.value.map(x=>x.value.road.value.uuid),
 ['comp-A','comp-B','comp-C']);
assert.equal(p.dump.value[1].value.atEnd.value,true);
assert.equal(p.dump.value[0].value.stopBarEnabled.value,true);
assert.equal(JSON.stringify(original),baseline,'Planner must not mutate dump');
const partial=make([link('comp-B',false,false,true)]);
const oldLinks=[{componentUuid:'comp-B',atEnd:false}];
p=plan(partial,{branches:arms.slice(0,3),expectedLinks:oldLinks});
assert.deepEqual(p.dump.value.map(x=>x.value.road.value.uuid),
 ['comp-B','comp-A','comp-C'],'Keep existing ordering, append deterministic new Roads');
assert.equal(p.dump.value[0].value.atEnd.value,true,'Correct old At End');
assert.equal(p.dump.value[0].value.stopBarEnabled.value,false);
assert.equal(p.dump.value[0].value.extra.value,'keep');
const applied=copy(partial);applied.__comps__[1].value.branches=p.dump;
assert.equal(plan(applied,{branches:arms.slice(0,3),expectedLinks:
 p.dump.value.map(x=>({componentUuid:x.value.road.value.uuid,
 atEnd:x.value.atEnd.value}))}).noOp,true);
assert.throws(()=>plan(partial,{branches:arms.slice(0,3),expectedLinks:[]}),
 /changed since/);
assert.throws(()=>plan(make([link('comp-Z')]),
 {branches:arms.slice(0,3),expectedLinks:[{componentUuid:'comp-Z',atEnd:false}]}),
 /outside Auto Connect radius/);
assert.throws(()=>plan(make([],{turnGuides:[{a:0}]}),proposal),
 /index-based routes/);
assert.throws(()=>plan(make([],{curbRamps:[{a:0}]}),proposal),
 /index-based routes/);
assert.throws(()=>plan(make([]),{branches:[arms[0],arms[0],arms[2]],
 expectedLinks:[]}),/duplicated/);
const redo=plan(make([]),proposal);
const restore=copy(redo.dump);
restore.value=[];
assert.deepEqual(restore.value,original.__comps__[1].value.branches.value,
 'Simulated Creator Undo must restore original typed array');
console.log('JUNCTION AUTO CONNECT DUMP PASS: typed component references, source order, flags, history replay, stale-guard, no-op');
