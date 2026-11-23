'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-traffic-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',tmp]);
 const {SplineTrafficGate}=require(path.join(tmp,'Core/SplineTrafficGate.js'));
 const gate=new SplineTrafficGate(),j1={},j2={},a={},b={},c={};
 assert(gate.move(a,j1,2,1));assert.equal(gate.count(j1,2),1);
 assert(gate.move(a,j1,2,1),'Owner already occupies the slot');
 assert.equal(gate.move(b,j1,2,1),false,'Second follower must wait');
 assert.equal(gate.count(j1,2),1);
 assert(gate.move(b,j1,3,1),'Different link has independent capacity');
 assert.equal(gate.count(j1,3),1);
 assert.equal(gate.move(a,j1,3,1),false,'Atomic move retains old reservation');
 assert.equal(gate.count(j1,2),1);
 assert(gate.move(a,j2,2,1),'Different Junction has independent capacity');
 assert.equal(gate.count(j1,2),0);
 assert.equal(gate.count(j2,2),1);
 assert(gate.move(c,j1,3,0),'Unlimited exit admits without reservation');
 assert.equal(gate.count(j1,3),1);
 assert.deepEqual(gate.reservation(a),{junction:j2,exitIndex:2});
 assert(gate.move(a,j1,8,0),'Unlimited exit releases old slot');
 assert.equal(gate.reservation(a),null);
 assert.equal(gate.count(j2,2),0);
 gate.release(b);gate.release(b);
 assert.equal(gate.size,0);
 assert.throws(()=>gate.move(a,j1,-1,1),/Invalid/);
 assert.throws(()=>gate.move(a,j1,0,-2),/Invalid/);
 assert.throws(()=>gate.move(a,j1,0,4097),/Invalid/);
 gate.move(a,j1,0,2);gate.move(b,j1,0,2);
 assert.equal(gate.count(j1,0),2);
 gate.releaseJunction(j1);
 assert.equal(gate.count(j1,0),0,'Disabling Junction releases all occupant slots');
 assert.equal(gate.reservation(a),null);
 assert.equal(gate.reservation(b),null);
 gate.move(a,j2,0,2);
 gate.clear();assert.equal(gate.size,0);
 assert.equal(gate.count(j1,0),0);
 // First blocked follower gets the first available slot, not the fastest
 // update tick; releasing/moving owners preserves queue order.
 const one={},two={},three={},four={},junction={};
 assert(gate.move(one,junction,4,1));
 assert.equal(gate.move(two,junction,4,1),false);
 assert.equal(gate.move(three,junction,4,1),false);
 assert.equal(gate.move(two,junction,4,1),false,'idempotent queue join');
 assert.equal(gate.waiting(junction,4),2);
 assert.equal(gate.queuePosition(two,junction,4),0);
 assert.equal(gate.queuePosition(three,junction,4),1);
 gate.release(one);
 assert.equal(gate.move(four,junction,4,1),false,'newcomer cannot cut FIFO');
 assert.equal(gate.queuePosition(four,junction,4),2);
 assert.equal(gate.move(three,junction,4,1),false,'later waiter cannot cut FIFO');
 assert(gate.move(two,junction,4,1));
 assert.equal(gate.queuePosition(three,junction,4),0);
 gate.release(two);
 assert(gate.move(three,junction,4,1));
 gate.release(three);
 gate.release(four);
 assert.equal(gate.waiting(junction,4),0);
 // Switching a queued destination removes old entry.
 assert(gate.move(one,junction,4,1));
 assert.equal(gate.move(two,junction,4,1),false);
 assert.equal(gate.move(two,junction,6,1),true);
 assert.equal(gate.waiting(junction,4),0);
 gate.releaseJunction(junction);
 assert.equal(gate.waitingCount,0);assert.equal(gate.size,0);
 // With an occupied OLD slot, failure at new exit must not free it.
 assert(gate.move(one,j1,1,1));
 assert(gate.move(two,j2,1,1));
 assert.equal(gate.move(one,j2,1,1),false);
 assert.equal(gate.count(j1,1),1);
 assert.equal(gate.waiting(j2,1),1);
 gate.releaseJunction(j2);
 assert.equal(gate.waiting(j2,1),0);
 assert.equal(gate.count(j1,1),1);
 gate.clear();

 // Red blocks even unlimited exits. Green releases by priority, with FIFO
 // preserved for equal-priority traffic; existing occupancy is never preempted.
 const redGate={},normal={},emergency={},samePriority={},entrant={};
 assert.equal(gate.move(normal,redGate,2,0,false,0),false);
 assert.equal(gate.move(emergency,redGate,2,0,false,10),false);
 assert.equal(gate.move(samePriority,redGate,2,0,false,10),false);
 assert.equal(gate.waiting(redGate,2),3);
 assert.equal(gate.queuePosition(emergency,redGate,2),0);
 assert.equal(gate.queuePosition(samePriority,redGate,2),1);
 assert.equal(gate.queuePosition(normal,redGate,2),2);
 assert.equal(gate.move(normal,redGate,2,0,true,0),false,
     'Lower-priority follower cannot overtake queued emergency');
 assert.equal(gate.move(samePriority,redGate,2,0,true,10),false,
     'Equal-priority follower remains FIFO');
 assert(gate.move(emergency,redGate,2,0,true,10));
 assert.equal(gate.reservation(emergency),null,
     'Unlimited Green admission does not retain a capacity slot');
 assert.equal(gate.queuePosition(samePriority,redGate,2),0);
 assert(gate.move(samePriority,redGate,2,0,true,10));
 assert(gate.move(normal,redGate,2,0,true,0));
 assert.equal(gate.waiting(redGate,2),0);
 // Priority change on retry reorders while keeping a single queue entry.
 assert(gate.move(entrant,redGate,2,1,true,0));
 assert(!gate.move(normal,redGate,2,1,false,0));
 assert(!gate.move(emergency,redGate,2,1,false,0));
 assert.equal(gate.queuePosition(normal,redGate,2),0);
 assert(!gate.move(emergency,redGate,2,1,false,9));
 assert.equal(gate.queuePosition(emergency,redGate,2),0);
 assert.equal(gate.waiting(redGate,2),2);
 gate.release(entrant);
 assert.equal(gate.move(normal,redGate,2,1,true,0),false);
 assert(gate.move(emergency,redGate,2,1,true,9));
 gate.release(emergency);
 assert(gate.move(normal,redGate,2,1,true,0));
 gate.releaseJunction(redGate);
 assert.equal(gate.size,0);assert.equal(gate.waitingCount,0);
 assert.throws(()=>gate.move({},redGate,0,1,true,11),/priority/);
 assert.throws(()=>gate.canEnter({},redGate,0,1,'green',0),/signal/);
 console.log('SPLINE TRAFFIC GATE PASS: opt-in capacity, atomic admission, independent links, release and unlimited fallback.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
