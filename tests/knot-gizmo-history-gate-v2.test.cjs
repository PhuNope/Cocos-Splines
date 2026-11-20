'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-history-gate-'));
(async()=>{
 try{
  cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
   '--noEmit','false','--outDir',tmp]);
  const {SplineGizmoHistoryGate:Gate}=require(path.join(tmp,'Editor/SplineGizmoHistoryGate.js'));
  const {SplineGizmoEditTransaction}=require(path.join(tmp,'Editor/SplineGizmoEditTransaction.js'));
  const scope={uuid:'spline'},otherScope={uuid:'another-spline'};
  const a={id:'a'},b={id:'b'},foreign={id:'foreign'};
  assert(!Gate.locked(scope));
  assert(Gate.claim(scope,a));
  assert(!Gate.claim(scope,a),'A pending owner cannot reenter its own history');
  assert(!Gate.claim(scope,b),'Another Knot of the same spline is excluded');
  assert(Gate.claim(otherScope,foreign),'Another spline edits independently');
  assert(!Gate.release(scope,b),'One Knot cannot release another drawer');
  assert(Gate.owns(scope,a));
  assert(Gate.release(scope,a));
  assert(!Gate.release(scope,a),'Double release is harmless');
  assert(Gate.release(otherScope,foreign));
  let position=0,complete,fail,done=0,failures=[];
  const port={
   capture:()=>position,
   restore:v=>{position=v;},
   changed:(x,y)=>x!==y,
  };
  const tx=new SplineGizmoEditTransaction(
   ()=>new Promise((resolve,reject)=>{complete=resolve;fail=reject;}),
   err=>failures.push(String(err)),
   ()=>{done++;Gate.release(scope,a);},
  );
  // One snapshot pending: the guard remains held until the failure handler
  // has had a chance to restore the Scene baseline.
  assert(Gate.claim(scope,a));
  assert(tx.begin('move',port));
  position=10;
  assert(tx.end('move'));
  assert(Gate.locked(scope));
  assert(!Gate.claim(scope,b));
  assert.equal(tx.pendingCount,1);
  complete(false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(position,0,'Snapshot rejection restores the original transform');
  assert(!Gate.locked(scope),'Gate releases AFTER the failed snapshot is handled');
  assert.equal(tx.pendingCount,0);
  assert.equal(done,1);
  assert(failures.some(s=>/snapshot rejected/i.test(s)));
  assert(Gate.claim(scope,b));
  assert(Gate.release(scope,b));
  // A successful async request follows the same lock lifetime.
  assert(Gate.claim(scope,a));
  assert(tx.begin('move',port));
  position=12;
  tx.end('move');
  assert(Gate.locked(scope));
  complete(undefined);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(position,12);
  assert(!Gate.locked(scope));
  assert.equal(done,2);
  // Cancel and no-op MUST unlock without any Editor request.
  assert(Gate.claim(scope,a));
  assert(tx.begin('rotate',port));
  position=20;
  assert(tx.cancel('rotate'));
  assert.equal(position,12);
  assert(!Gate.locked(scope));
  assert.equal(done,3);
  assert(Gate.claim(scope,a));
  assert(tx.begin('rotate',port));
  assert(!tx.end('rotate'));
  assert(!Gate.locked(scope));
  assert.equal(done,4);
  // Begin-read failures must not poison the global lock. Drawer code
  // acquires first and releases in its begin catch handler.
  assert(Gate.claim(scope,a));
  assert.throws(()=>tx.begin('broken',{
   ...port,capture:()=>{throw Error('Knot destroyed before begin');},
  }),/Knot destroyed/);
  assert(Gate.release(scope,a));
  // Rejected async work with an external Scene mutation does not roll back
  // the external edit, but it still drops the gate.
  assert(Gate.claim(scope,a));
  assert(tx.begin('move',port));
  position=15;
  tx.end('move');
  position=99;
  fail(Error('late IPC reject'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(position,99);
  assert(!Gate.locked(scope));
  assert.equal(done,5);
  console.log('GIZMO HISTORY GATE PASS: per-spline exclusion, pending IPC, rollback-before-release, no-op and Cancel.');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
