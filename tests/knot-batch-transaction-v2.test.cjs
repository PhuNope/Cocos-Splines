'use strict';
const assert=require('node:assert/strict');
const {commitKnotEdits,equalPosition,equalQuaternion}=require('../src/SplineBatchEditTransaction');
const Q={x:0,y:0,z:0,w:1};
const rotated={x:0,y:.382683432365,z:0,w:.923879532511};
const original={
 a:{uuid:'a',position:{x:0,y:2,z:1},rotation:{...Q}},
 b:{uuid:'b',position:{x:3,y:5,z:7},rotation:{...Q}},
};
const makeEdits=()=>[
 {uuid:'a',before:{...original.a.position},after:{x:0,y:1,z:1},
  positionChanged:true,rotationChanged:false},
 {uuid:'b',before:{...original.b.position},after:{x:3,y:1,z:7},
  positionChanged:true,rotationChanged:true,
  beforeRotation:{...Q},afterRotation:{...rotated}},
];
function harness(config={}){
 const state=Object.fromEntries(Object.entries(original).map(([id,s])=>
   [id,{uuid:id,position:{...s.position},rotation:{...s.rotation}}]));
 const calls=[];
 let snapshots=0,reads=0,failed=false;
 const adapter={
  async read(ids){
   reads++;calls.push('read');
   if(config.rejectReadAt===reads)throw Error('Scene read failed');
   return {ok:true,states:ids.map(id=>({
    uuid:id,position:{...state[id].position},rotation:{...state[id].rotation},
   }))};
  },
  async writePosition(id,value){
   calls.push('position:'+id);
   if(config.ignoreWriteId===id)return;
   const snapshot={...value};state[id].position=snapshot;
   if(config.failAfterPositionId===id&&!failed){failed=true;throw Error('Scene set-property failed after mutation');}
   if(config.failRollbackId===id&&config.didFail){
    throw Error('Cannot restore node');
   }
  },
  async writeRotation(id,value){
   calls.push('rotation:'+id);
   state[id].rotation={...value};
   if(config.failAfterRotationId===id&&!failed){
    failed=true;config.didFail=true;throw Error('Rotation write failed after mutation');
   }
  },
  async snapshot(){
   calls.push('snapshot');snapshots++;
   if(config.throwSnapshot)throw Error('Snapshot IPC failed');
   if(config.falseSnapshot)return false;
   if(config.errorSnapshot)return {ok:false,error:'Rejected'};
   return config.undefinedSnapshot?undefined:true;
  },
 };
 return {state,calls,adapter,get snapshots(){return snapshots;},get reads(){return reads;}};
}
function originalState(s){
 for(const id of ['a','b']){
  assert.deepEqual(s[id].position,original[id].position,'Position restored '+id);
  assert.deepEqual(s[id].rotation,original[id].rotation,'Rotation restored '+id);
 }
}
assert(equalPosition({x:1,y:2,z:3},{x:1+1e-6,y:2,z:3}));
assert(equalQuaternion(Q,{x:0,y:0,z:0,w:-1}));
assert(!equalQuaternion(Q,rotated));
(async()=>{
 let ctx=harness();
 let result=await commitKnotEdits(makeEdits(),ctx.adapter);
 assert(result.ok);assert.equal(result.count,2);
 assert.equal(ctx.snapshots,1);
 assert.deepEqual(ctx.calls,[
  'read','position:a','position:b','rotation:b','read','snapshot'
 ]);
 assert.equal(ctx.state.a.position.y,1);
 assert.deepEqual(ctx.state.b.rotation,rotated);

 ctx=harness({undefinedSnapshot:true});
 result=await commitKnotEdits(makeEdits(),ctx.adapter);
 assert(result.ok,'Editor API may resolve snapshot with void/undefined');

 for(const setting of [
  {falseSnapshot:true},{errorSnapshot:true},{throwSnapshot:true}
 ]){
  ctx=harness(setting);
  await assert.rejects(commitKnotEdits(makeEdits(),ctx.adapter),/snapshot|Snapshot/i);
  originalState(ctx.state);
  assert.equal(ctx.snapshots,1,'Exactly one attempted snapshot');
  assert.deepEqual(ctx.calls.slice(-3),
   ['rotation:b','position:b','position:a'],
   'Rollback runs in reverse property mutation order');
 }
 ctx=harness({ignoreWriteId:'b'});
 await assert.rejects(commitKnotEdits(makeEdits(),ctx.adapter),/position after mismatch/);
 assert.equal(ctx.snapshots,0,'No snapshot when editor silently ignores writes');
 originalState(ctx.state);

 ctx=harness({rejectReadAt:2});
 await assert.rejects(commitKnotEdits(makeEdits(),ctx.adapter),/Scene read failed/);
 assert.equal(ctx.snapshots,0,'No snapshot on after-write read failure');
 originalState(ctx.state);

 ctx=harness();
 ctx.state.a.position.x=100;
 await assert.rejects(commitKnotEdits(makeEdits(),ctx.adapter),/position before mismatch/);
 assert.deepEqual(ctx.calls,['read'],'Stale plans are rejected before touching any Node');
 assert.equal(ctx.snapshots,0);

 ctx=harness({failAfterRotationId:'b'});
 await assert.rejects(commitKnotEdits(makeEdits(),ctx.adapter),/Rotation write failed/);
 assert.equal(ctx.snapshots,0);
 originalState(ctx.state);

 ctx=harness({failAfterPositionId:'b'});
 await assert.rejects(commitKnotEdits(makeEdits(),ctx.adapter),/Scene set-property failed/);
 assert.equal(ctx.snapshots,0);
 originalState(ctx.state);

 ctx=harness();
 await assert.rejects(commitKnotEdits([...makeEdits(),makeEdits()[0]],ctx.adapter),/unique/);
 assert.deepEqual(ctx.calls,[],'Invalid batch does not enter adapter');

 ctx=harness();
 await assert.rejects(commitKnotEdits([{...makeEdits()[0],after:{x:NaN,y:0,z:0}}],ctx.adapter),/invalid/);
 assert.deepEqual(ctx.calls,[]);

 console.log('KNOT TRANSACTION PASS: read-back, snapshots, silent writes, stale data and reverse rollback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
