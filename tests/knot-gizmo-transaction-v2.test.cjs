'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cocos-spline-gesture-test-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
  '--noEmit','false','--outDir',dir]);
 const {SplineGizmoEditTransaction}=require(path.join(dir,'Editor/SplineGizmoEditTransaction.js'));
 const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
 let state={x:2,y:3,z:4};
 const clone=()=>({...state});
 const port={
  capture:clone,
  restore:before=>{state={...before};},
  changed:(a,b)=>a.x!==b.x||a.y!==b.y||a.z!==b.z,
 };
 let calls=0,failures=[];
 let transaction=new SplineGizmoEditTransaction(()=>{
  calls++;return true;
 },error=>failures.push(String(error)));
 assert.equal(transaction.begin('move',port),true);
 assert.equal(transaction.begin('move',port),false,'Nested begin does not overwrite baseline');
 assert.equal(transaction.baseline.x,2);
 assert.equal(transaction.end('move'),false,'No-op creates no snapshot');
 assert.equal(calls,0);
 assert.equal(transaction.end('move'),false,'Double end does not commit');

 transaction.begin('move',port);
 state.x=9;
 assert.equal(transaction.cancel('move'),true);
 assert.deepEqual(state,{x:2,y:3,z:4});
 assert.equal(calls,0,'Cancellation does not snapshot');
 assert.equal(transaction.cancel('move'),false,'Double cancel is safe');

 transaction.begin('move',port);
 state.x=10;
 assert.equal(transaction.end('move'),true);
 assert.equal(calls,1,'Snapshot request runs synchronously at End');
 await flush();
 assert.equal(transaction.pendingCount,0);
 assert.equal(transaction.baseline,null);
 assert.deepEqual(state,{x:10,y:3,z:4});

 transaction=new SplineGizmoEditTransaction(()=>false,error=>failures.push(String(error)));
 transaction.begin('move',port);
 state.x=20;
 transaction.end('move');
 assert.equal(state.x,10,'Rejected snapshot reverts the completed move');
 assert(failures.some(x=>/rejected/i.test(x)));

 transaction=new SplineGizmoEditTransaction(()=>({ok:false}),error=>failures.push(String(error)));
 transaction.begin('rotate',port);
 state.y=55;
 transaction.end('rotate');
 assert.equal(state.y,3,'Explicit {ok:false} snapshot reverts');

 transaction=new SplineGizmoEditTransaction(()=>{throw Error('IPC down');},
  error=>failures.push(String(error)));
 transaction.begin('tangent',port);
 state.z=99;
 transaction.end('tangent');
 assert.equal(state.z,4,'Synchronous snapshot failure reverts');

 // If the rejected Promise returns later and the user has already made
 // a different gesture, it must never overwrite the newer change.
 let rejectOld;
 transaction=new SplineGizmoEditTransaction(
  ()=>new Promise((_res,rej)=>{rejectOld=rej;}),
  error=>failures.push(String(error)),
 );
 transaction.begin('move',port);
 state.x=15;
 transaction.end('move');
 assert.equal(transaction.pendingCount,1);
 const rejectFirst=rejectOld;
 transaction.begin('move',port);
 state.x=22;
 transaction.end('move');
 rejectFirst(Error('Delayed snapshot failure'));
 await flush();
 assert.equal(state.x,22,'Late failing snapshot cannot corrupt later edit');
 // The second pending promise has no callback; no Node process keepalive.

 // Even without a new gesture, external Scene changes invalidate
 // rollback because the committed after-state is no longer current.
 let rejectExternal;
 transaction=new SplineGizmoEditTransaction(
  ()=>new Promise((_res,rej)=>{rejectExternal=rej;}),
  error=>failures.push(String(error)),
 );
 transaction.begin('move',port);
 state.x=30;
 transaction.end('move');
 state.x=60;
 rejectExternal(Error('Late failure'));
 await flush();
 assert.equal(state.x,60,'Do not overwrite externally changed Scene data');

 transaction=new SplineGizmoEditTransaction(
  ()=>Promise.reject(Error('Async failed')),
  error=>failures.push(String(error)),
 );
 transaction.begin('move',port);
 state.z=40;
 transaction.end('move');
 await flush();
 assert.equal(state.z,4,'Async snapshot error restores if state has not changed');

 transaction=new SplineGizmoEditTransaction(()=>true,error=>failures.push(String(error)));
 transaction.begin('move',port);
 state.x=70;
 assert.equal(transaction.cancel('rotate'),false,'Wrong property does not cancel');
 assert.equal(transaction.end('rotate'),false,'Wrong property does not snapshot');
 assert.equal(transaction.cancel('move'),true);
 assert.equal(state.x,60);
 assert.equal(failures.length>=4,true);
 console.log('GIZMO TRANSACTION PASS: begin/end, cancel, no-op, sync/async failures, stale rollback guards.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
