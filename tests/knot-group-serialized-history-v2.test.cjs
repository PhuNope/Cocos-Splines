'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-history-contract-'));
(async()=>{
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
  '--noEmit','false','--outDir',tmp]);
 const {commitGroupPositions}=require(path.join(tmp,'Editor/SplineGizmoGroupHistory.js'));
 const baseline={a:{x:1,y:2,z:3},b:{x:6,y:7,z:8}};
 const desired={a:{x:4,y:2,z:3},b:{x:6,y:10,z:8}};
 const parent={uuid:'SplineContainer'};
 const makeHarness=(options={})=>{
  const nodes=Object.fromEntries(Object.keys(baseline).map(uuid=>[
   uuid,{uuid,parent,isValid:true,position:{...desired[uuid]}}
  ]));
  let snapshots=0;
  const calls=[];
  let rejected=false;
  const request=async(channel,method,payload)=>{
   assert.equal(channel,'scene');
   if(method==='snapshot'){
    snapshots++;calls.push('snapshot');
    if(options.rejectSnapshot)return false;
    if(options.throwSnapshot)throw Error('Snapshot IPC failure');
    return undefined;
   }
   assert.equal(method,'set-property');
   assert.equal(payload.path,'position');
   assert.equal(payload.record,false);
   assert.equal(payload.dump.type,'cc.Vec3');
   assert.deepEqual(Object.keys(payload.dump.value).sort(),['x','y','z']);
   calls.push(payload.uuid+':'+payload.dump.value.y);
   const node=nodes[payload.uuid];
   node.position={...payload.dump.value};
   if(options.failWriteUuid===payload.uuid&&!rejected){
    rejected=true;
    if(options.reparentOnFailure)node.parent={uuid:'Different Root'};
    if(options.throwWrite)return Promise.reject(Error('Scene write threw after mutation'));
    return false;
   }
   return true;
  };
  const edits=Object.keys(baseline).map(uuid=>({
   node:nodes[uuid],parent,before:baseline[uuid],after:desired[uuid],
  }));
  return {nodes,edits,request,calls,get snapshots(){return snapshots;}};
 };
 let h=makeHarness();
 const result=await commitGroupPositions(h.edits,h.request);
 assert.equal(result,undefined);
 assert.equal(h.snapshots,1,'One Scene snapshot for both Knot positions');
 assert.deepEqual(h.calls,['a:2','b:10','snapshot']);
 assert.deepEqual(h.nodes.a.position,desired.a);
 assert.deepEqual(h.nodes.b.position,desired.b);

 h=makeHarness();
 const same=h.edits.map(e=>({...e,before:{...e.after}}));
 assert.equal(await commitGroupPositions(same,h.request),true);
 assert.equal(h.snapshots,0);
 assert.deepEqual(h.calls,[],'No-op writes no Prefab override and no Undo entry');

 h=makeHarness({failWriteUuid:'b'});
 await assert.rejects(commitGroupPositions(h.edits,h.request),/rejected serialized Knot position/);
 assert.equal(h.snapshots,0,'Partial writes cannot snapshot');
 assert.deepEqual(h.nodes.a.position,baseline.a);
 assert.deepEqual(h.nodes.b.position,baseline.b,'Failed mutating Node is also rolled back');
 assert.deepEqual(h.calls,['a:2','b:10','b:7','a:2']);

 h=makeHarness({failWriteUuid:'b',throwWrite:true});
 await assert.rejects(commitGroupPositions(h.edits,h.request),/Scene write threw/);
 assert.equal(h.snapshots,0);
 assert.deepEqual(h.nodes.a.position,baseline.a);
 assert.deepEqual(h.nodes.b.position,baseline.b);

 for(const option of [{rejectSnapshot:true},{throwSnapshot:true}]){
  h=makeHarness(option);
  await assert.rejects(commitGroupPositions(h.edits,h.request),/snapshot/i);
  assert.equal(h.snapshots,1,'Exactly one attempted snapshot, not per Knot');
  assert.deepEqual(h.nodes.a.position,baseline.a);
  assert.deepEqual(h.nodes.b.position,baseline.b);
  assert.deepEqual(h.calls,['a:2','b:10','snapshot','b:7','a:2']);
 }

 h=makeHarness();
 h.nodes.a.position.x=999;
 await assert.rejects(commitGroupPositions(h.edits,h.request),/stale/);
 assert.deepEqual(h.calls,[],'Stale Scene edits fail before the first Editor message');

 h=makeHarness({failWriteUuid:'b',reparentOnFailure:true});
 await assert.rejects(commitGroupPositions(h.edits,h.request),/rejected/);
 assert.deepEqual(h.nodes.a.position,baseline.a);
 assert.deepEqual(h.nodes.b.position,desired.b,
  'Never overwrite a Node moved to a different parent');
 assert.equal(h.nodes.b.parent.uuid,'Different Root');

 h=makeHarness();
 await assert.rejects(commitGroupPositions([...h.edits,h.edits[0]],h.request),
  /stale/,'Duplicate UUIDs must fail closed');
 assert.equal(h.snapshots,0);

 h=makeHarness();
 h.edits[0].after={x:NaN,y:1,z:2};
 await assert.rejects(commitGroupPositions(h.edits,h.request),/stale/);
 assert.deepEqual(h.calls,[]);

 console.log('GROUP SERIALIZED HISTORY PASS: property paths, one snapshot, partial write rollback, stale and reparent guards.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
