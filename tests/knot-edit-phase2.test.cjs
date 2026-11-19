'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const math=require('../src/SplineKnotEditMath');
const raw=[
 {uuid:'a',position:{x:0.2,y:1.3,z:5}},
 {uuid:'b',position:{x:2.6,y:3.8,z:7}},
 {uuid:'c',position:{x:-1.4,y:-0.2,z:9}},
];
function clone(p){return {x:p.x,y:p.y,z:p.z};}
assert.deepEqual(math.dimensionAxes(0),['x','y','z']);
assert.deepEqual(math.dimensionAxes(1),['x','y']);
assert.deepEqual(math.dimensionAxes(2),['x','z']);
const snap=math.planKnotPositions(raw,['b','a'],'snap',{step:.5},1);
assert.deepEqual(snap.map(e=>e.uuid),['a','b'],'Sibling order is deterministic');
assert.deepEqual(snap.map(e=>e.after),[{x:0,y:1.5,z:5},{x:2.5,y:4,z:7}],
 'XY2D snap preserves depth');
const align=math.planKnotPositions(raw,['c','a','b'],'align',{axis:'x'},0);
assert.deepEqual(align.map(e=>e.after.x),[.2,.2],'First hierarchy knot anchors alignment');
assert.throws(()=>math.planKnotPositions(raw,['a'],'snap',{step:0},0),/Grid step/);
assert.throws(()=>math.planKnotPositions(raw,['a'],'snap',{step:Infinity},0),/Grid step/);
assert.throws(()=>math.planKnotPositions(raw,['a'],'align',{axis:'z'},1),/not active/);
assert.throws(()=>math.planKnotPositions(raw,['a','a'],'snap',{step:1},0),/Duplicate/);
assert.throws(()=>math.planKnotPositions(raw,['foreign'],'snap',{step:1},0),/belong/);
assert.throws(()=>math.planKnotPositions(raw,['a'],'foo',{},0),/Unknown/);
assert.equal(math.planKnotPositions(raw,['a'],'align',{axis:'x'},0).length,0,'No-op is skipped');

const state=raw.map(k=>({uuid:k.uuid,name:k.uuid,mode:4,position:clone(k.position)}));
let current=['root'],records=[],snapshots=0,refreshes=0,failedUuid=null,dimension=1;
global.Editor={
 Selection:{
  getSelected(){return [...current];},
  clear(){current=[];},
  select(_type,uuid){current.push(uuid);},
 },
 Message:{request:async (channel,method,payload)=>{
  if(channel!=='scene')throw new Error('Unexpected channel');
  if(method==='execute-scene-script'){
   if(payload.method==='querySpline')return {
     found:true,rootUuid:'root',dimension,knots:state.map(k=>({...k,position:clone(k.position)})),
   };
   if(payload.method==='refreshPreview'){refreshes++;return {ok:true};}
   throw new Error('Unexpected method '+payload.method);
  }
  if(method==='set-property'){
    assert.equal(payload.path,'position');
    assert.equal(payload.record,false,'Batch positions should be one transaction');
    assert.equal(payload.dump.type,'cc.Vec3');
    records.push(payload);
    if(payload.uuid===failedUuid){failedUuid=null;return false;}
    const knot=state.find(k=>k.uuid===payload.uuid);
    if(!knot)throw new Error('Unknown node');
    knot.position=clone(payload.dump.value);
    return true;
  }
  if(method==='snapshot'){snapshots++;return true;}
  throw new Error('Unexpected scene operation '+method);
 }},
};
const methods=require(path.join(__dirname,'../dist/main.js')).methods;
(async()=>{
 let r=await methods.snapSelectedKnots(['a','b'],.5);
 assert(r.ok,r.error);assert.equal(r.count,2);
 assert.equal(snapshots,1);assert.equal(refreshes,1);
 assert.deepEqual(state[0].position,{x:0,y:1.5,z:5});
 assert.deepEqual(state[1].position,{x:2.5,y:4,z:7});
 r=await methods.snapSelectedKnots(['a','b'],.5);
 assert(r.ok);assert.equal(r.changed,false);
 assert.equal(snapshots,1,'No-op does not commit');
 r=await methods.alignSelectedKnots(['c','a','b'],'x');
 assert(r.ok,r.error);assert.equal(r.count,2);
 assert.equal(snapshots,2);assert.deepEqual(state.map(k=>k.position.x),[0,0,0]);
 r=await methods.selectKnotIds(['b','a']);
 assert(r.ok,r.error);assert.deepEqual(current,['a','b']);
 r=await methods.snapSelectedKnots(undefined,1);
 assert(r.ok,r.error);assert.equal(snapshots,3,'Native Scene selection accepted when IDs are omitted');
 const beforeCount=records.length,snapCount=snapshots;
 r=await methods.snapSelectedKnots(['a','foreign'],1);
 assert.equal(r.ok,false);assert.equal(records.length,beforeCount);
 r=await methods.alignSelectedKnots(['a','b'],'z');
 assert.equal(r.ok,false,'Do not align XY2D depth');
 assert.equal(records.length,beforeCount);
 state[0].position.x=.27;state[1].position.y=4.41;
 const originals=state.map(k=>clone(k.position));
 failedUuid='b';
 r=await methods.snapSelectedKnots(['a','b'],.5);
 assert.equal(r.ok,false);
 assert.deepEqual(state.map(k=>k.position),originals,'A failed batch restores all applied edits');
 assert.equal(snapshots,snapCount,'Failed batch creates no partial snapshot');
 dimension=2;current=['root'];
 r=await methods.snapSelectedKnots(['a'],.5);
 assert(r.ok,r.error);assert.equal(state[0].position.y,originals[0].y);
 const inspector=require(path.join(__dirname,'../dist/contributions/inspector/Container.js'));
 for(const marker of ['spl-mark-all','spl-mark-none','spl-select-marked','spl-grid-step','spl-snap-marked','spl-align-axis','spl-align-marked'])
  assert(inspector.template.includes(marker),'Missing batch Inspector control '+marker);
 const pkg=require('../package.json');
 for(const msg of ['select-knot-ids','snap-selected-knots','align-selected-knots'])
  assert(pkg.contributions.messages[msg],'Missing manifest message '+msg);
 console.log('PHASE 2 KNOT EDIT PASS: multi-select, 2D grid, alignment, one snapshot, validation, no-op and rollback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
