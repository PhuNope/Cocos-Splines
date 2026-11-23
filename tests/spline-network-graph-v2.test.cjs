'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const project=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-network-'));
try{
 cp.execFileSync('tsc',['-p',path.join(project,'tsconfig.runtime.json'),'--noEmit','false','--outDir',tmp]);
 const {findNetworkRoute}=require(path.join(tmp,'Core/SplineNetworkGraph.js'));
 const spline=(id,length,closed=false)=>({id,length,closed});
 const link=(splineId,progress,linkIndex,exitDirection=0,world)=>({splineId,progress,linkIndex,exitDirection,world});
 const S=[spline('A',10),spline('B',20),spline('C',4)];
 const J=[
   {id:'J1',links:[link('A',.5,0),link('B',.1,1),link('C',.25,2)]},
   {id:'J2',links:[link('B',.8,0),link('C',.75,1)]},
 ];
 const anchor=(splineId,progress)=>({splineId,progress});
 const near=(a,b)=>assert(Math.abs(a-b)<1e-6,String(a)+' != '+String(b));
 let route=findNetworkRoute(S,J,anchor('A',.2),anchor('C',.95),{startDirection:1});
 assert(route);
 near(route.distance,5.8);assert.equal(route.switchCount,1);
 const switches=route.steps.filter(e=>e.kind==='switch');
 assert.equal(switches.length,1);
 assert.equal(switches[0].junctionId,'J1');
 assert.equal(switches[0].exitIndex,2);
 assert.equal(switches[0].direction,1);
 // Deterministic even when input order differs.
 const permuted=findNetworkRoute([...S].reverse(),[...J].reverse(),anchor('A',.2),anchor('C',.95),{startDirection:1});
 assert.deepEqual(permuted,route);
 // A forward-only follower cannot jump backwards to reach a marker it passed.
 assert.equal(findNetworkRoute(S,J,anchor('A',.8),anchor('C',.95),{startDirection:1}),null);
 assert(findNetworkRoute(S,J,anchor('A',.8),anchor('C',.95),{startDirection:-1}));
 // Preserve/force destination direction determines whether the target is reachable.
 const only=[spline('X',10),spline('Y',10)];
 const wrong=[{id:'J',links:[link('X',.5,0),link('Y',.1,3,2)]}];
 assert.equal(findNetworkRoute(only,wrong,anchor('X',.1),anchor('Y',.9),{startDirection:1}),null);
 const right=[{id:'J',links:[link('X',.5,0),link('Y',.1,3,1)]}];
 assert(findNetworkRoute(only,right,anchor('X',.1),anchor('Y',.9),{startDirection:1}));
 const noSwitch=findNetworkRoute(S,J,anchor('A',.2),anchor('A',.8),{startDirection:1});
 near(noSwitch.distance,6);assert.equal(noSwitch.switchCount,0);
 // A zero-distance self-route must not switch indefinitely.
 const noop=findNetworkRoute(S,J,anchor('C',.25),anchor('C',.25),{startDirection:1});
 near(noop.distance,0);assert.equal(noop.switchCount,0);
 // Closed seam does not cost another whole spline circuit.
 const circle=[spline('ring',100,true)];
 route=findNetworkRoute(circle,[],anchor('ring',.95),anchor('ring',.05),{startDirection:1});
 near(route.distance,10);assert(route.steps.some(e=>e.fromProgress===1&&e.toProgress===0));
 assert.equal(findNetworkRoute([spline('line',10)],[],anchor('line',.95),anchor('line',.05),{startDirection:1}),null);
 // World-gap threshold prevents unintended teleport between distant links.
 const far=[{id:'far',links:[
   link('X',.5,0,0,{x:0,y:0,z:0}),
   link('Y',.1,1,0,{x:100,y:0,z:0}),
 ]}];
 assert.equal(findNetworkRoute(only,far,anchor('X',0),anchor('Y',1),
   {startDirection:1,maxWorldGap:.25}),null);
 assert(findNetworkRoute(only,far,anchor('X',0),anchor('Y',1),
   {startDirection:1}));
 const nearJ=[{id:'near',links:[
   link('X',.5,0,0,{x:0,y:0,z:0}),
   link('Y',.1,1,0,{x:.05,y:0,z:0}),
 ]}];
 assert(findNetworkRoute(only,nearJ,anchor('X',0),anchor('Y',1),
   {startDirection:1,maxWorldGap:.25,transferPenalty:2}));
 assert.throws(()=>findNetworkRoute(S,J,anchor('missing',0),anchor('C',0)),/anchor/);
 assert.throws(()=>findNetworkRoute([spline('A',1),spline('A',2)],[],anchor('A',0),anchor('A',1)),/duplicate/);
 assert.throws(()=>findNetworkRoute(S,[{id:'bad',links:[link('A',.5,0),link('B',.5,0)]}],anchor('A',0),anchor('C',1)),/link/);
 assert.throws(()=>findNetworkRoute(S,J,anchor('A',0),anchor('C',1),{transferPenalty:-1}),/options/);
 console.log('NETWORK GRAPH PASS: shortest paths, direction, closed seam, deterministic ties, gap filtering and validation.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
