'use strict';
const assert=require('node:assert/strict');
const p0={x:0,y:0,z:0},p5={x:5,y:0,z:0};
let selected=['junction'],state={...p0},snapshots=0,writes=0,mode='',valid=true;
const q={x:0,y:0,z:0,w:1};
const plan=()=>({ok:true,changed:true,
 junctionUuid:'junction',targetSplineUuid:'target-root',
 targetKnotUuid:'target-knot',anchorIndex:0,targetIndex:1,
 before:{...p0},after:{...p5},guard:'token',gapBefore:5});
const scene={
 getSelected:()=>[...selected],clear:()=>selected=[],select:(_,id)=>selected=[id],
};
const calls=[];
global.Editor={Selection:scene,Message:{request:async (channel,method,arg)=>{
 assert.equal(channel,'scene');
 if(method==='execute-scene-script'){
   calls.push(arg.method);
   if(arg.method==='queryJunctionConnections')return {
     ok:true,validLinks:2,totalLinks:2,pairCount:1,
     positionFailures:1,tangentFailures:0,pairs:[{from:0,to:1,gap:5,axisAngleDeg:0}],
   };
   if(arg.method==='queryJunctionSnapPlan')return mode==='no-op'?{...plan(),changed:false}:plan();
   if(arg.method==='queryJunctionSnapValid')
     return valid?{ok:true}:{ok:false,error:'Scene switched'};
   if(arg.method==='queryKnotBatchState')return {ok:true,states:[{
     uuid:'target-knot',position:{...state},rotation:q,
   }]};
   if(arg.method==='refreshPreview')return {ok:true};
   throw Error('Unexpected Scene method: '+arg.method);
 }
 if(method==='set-property'){
   assert.equal(arg.uuid,'target-knot');
   assert.equal(arg.path,'position');
   assert.equal(arg.record,false);
   writes++;state={...arg.dump.value};
   if(mode==='write-reject'&&state.x===5)return false;
   return true;
 }
 if(method==='snapshot'){
   snapshots++;
   if(mode==='snapshot-reject')return false;
   return true;
 }
 throw Error('Unexpected Editor IPC '+method);
}}};
const {methods}=require('../dist/main.js');
(async()=>{
 const diag=await methods.checkJunctionConnections();
 assert(diag.ok,diag.error);assert.equal(diag.positionFailures,1);
 assert.match(diag.message,/Worst link pair/);
 let r=await methods.snapJunctionEndpoint(0,1);
 assert(r.ok,r.error);assert.equal(state.x,5);
 assert.equal(snapshots,1);assert.equal(writes,1);
 assert(calls.includes('queryJunctionSnapValid'));
 state={...p0};mode='no-op';
 const beforeSnap=snapshots,beforeWrite=writes;
 r=await methods.snapJunctionEndpoint(0,1);
 assert(r.ok&&!r.changed);assert.equal(snapshots,beforeSnap);assert.equal(writes,beforeWrite);
 mode='write-reject';
 r=await methods.snapJunctionEndpoint(0,1);
 assert(!r.ok);assert.equal(state.x,0,'rollback a rejected write');
 assert.equal(snapshots,beforeSnap,'failed write must not snapshot');
 mode='snapshot-reject';
 r=await methods.snapJunctionEndpoint(0,1);
 assert(!r.ok);assert.equal(state.x,0,'snapshot failure must rollback');
 assert.equal(snapshots,beforeSnap+1);
 mode='';valid=false;const before=writes;
 r=await methods.snapJunctionEndpoint(0,1);
 assert(!r.ok);assert.equal(writes,before,'stale scene rejected before any edit');
 valid=true;
 const inspector=require('../dist/contributions/inspector/Junction');
 assert(inspector.template.includes('spl-check-connections'));
 assert(inspector.template.includes('spl-snap-connector'));
 assert(inspector.template.includes('spl-connector-anchor'));
 assert(inspector.template.includes('spl-connector-target'));
 const manifest=require('../package.json').contributions.messages;
 assert(manifest['check-junction-connections']);
 assert(manifest['snap-junction-endpoint']);
 console.log('JUNCTION CONNECTOR EDITOR PASS: inspector controls, one snapshot, no-op, silent writes, stale guards, rollback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
