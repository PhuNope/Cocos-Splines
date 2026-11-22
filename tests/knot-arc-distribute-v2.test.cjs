'use strict';
const assert=require('node:assert/strict'),Module=require('node:module');
const {planArcDistribution}=require('../src/SplineKnotEditMath');
const p=(x,y,z=0)=>({x,y,z});
const v=[p(0,0,7),p(1,0,8),p(1,7,9),p(3,7,10),p(5,7,11)];
const raw=v.map((position,i)=>({uuid:String(i),position}));
const cumulative=[0,1,8,10,12];
const lerp=(a,b,t)=>a+(b-a)*t;
const pointAt=(d)=>{
 let i=0;while(i<3&&d>cumulative[i+1])i++;
 const t=(d-cumulative[i])/(cumulative[i+1]-cumulative[i]);
 return {position:p(lerp(v[i].x,v[i+1].x,t),lerp(v[i].y,v[i+1].y,t))};
};
const evaluator={segmentCount:4,distanceAtT:t=>cumulative[Math.round(t*4)],
 evaluateAtDistance:pointAt};
const ids=['3','1','2','0'];
const plan=planArcDistribution(raw,ids,1,false,evaluator);
assert.deepEqual(plan.map(e=>e.uuid),['1','2']);
assert(Math.abs(plan[0].after.y-7/3)<1e-8);
assert(Math.abs(plan[1].after.y-17/3)<1e-8);
assert.equal(plan[0].after.x,1);assert.equal(plan[1].after.x,1);
assert.equal(plan[0].after.z,8);assert.equal(plan[1].after.z,9);
assert.deepEqual(planArcDistribution(raw,[...ids].reverse(),1,false,evaluator),plan);
const reversed={segmentCount:4,distanceAtT:t=>12-cumulative[4-Math.round(t*4)],
 evaluateAtDistance:d=>pointAt(12-d)};
const reversePlan=planArcDistribution([...raw].reverse(),ids,1,false,reversed);
for(const e of reversePlan){const f=plan.find(x=>x.uuid===e.uuid);assert(Math.abs(e.after.y-f.after.y)<1e-8);}
assert.throws(()=>planArcDistribution(raw,['0','2','3'],1,false,evaluator),/contiguous/);
assert.throws(()=>planArcDistribution(raw,ids,1,true,evaluator),/segment count/);
assert.throws(()=>planArcDistribution(raw,['0','1'],1,false,evaluator),/at least three/);
assert.throws(()=>planArcDistribution(raw,ids,1,false,{...evaluator,segmentCount:3}),/segment count/);
assert.deepEqual(planArcDistribution(raw,ids,1,false,{...evaluator,distanceAtT:()=>0}),[]);
assert.throws(()=>planArcDistribution(raw,ids,1,false,{...evaluator,evaluateAtDistance:()=>({position:p(NaN,0)})}),/invalid arc sample/);
const xz=planArcDistribution(raw,ids,2,false,evaluator);
assert.equal(xz[0].after.y,0);
assert.equal(raw[1].position.y,0);
const state=raw.map(k=>({uuid:k.uuid,position:{...k.position},rotation:{x:0,y:0,z:0,w:1},components:[],children:[]}));
const root={uuid:'root',parent:null,children:state,components:[]};
state.forEach(n=>{n.parent=root;n.components=[{kind:'Splines.SplineKnot',node:n,enabled:true}];});
let revision='original';
const spline={kind:'Splines.SplineContainer',enabled:true,dimension:1,closed:false,
 get knots(){return state.map(n=>n.components[0]);},getRevision:()=>revision,createArcDistributionEvaluator:()=>evaluator,...evaluator};
root.components=[spline];
const old=Module._load;
Module._load=function(name,...args){if(name==='cc')return {director:{getScene:()=>root},js:{getClassName:c=>c.kind}};return old.call(this,name,...args);};
const scene=require('../src/scene.js').methods;
try{
 const result=scene.queryArcDistribution('root',ids);
 assert(result.ok,result.error);assert.deepEqual(result.edits,plan);
 assert(scene.queryKnotBatchState('root',['1'],result.revision).ok);
 revision='changed';assert(!scene.queryKnotBatchState('root',['1'],result.revision).ok);
 revision='original';
 assert(!scene.queryArcDistribution('foreign',ids).ok);
}finally{Module._load=old;}
let snapshots=0,writes=0,fail=null,stale=false;
global.Editor={Selection:{getSelected:()=>['root']},Message:{request:async(channel,method,arg)=>{
 assert.equal(channel,'scene');
 if(method==='execute-scene-script'){
  if(arg.method==='querySpline')return {found:true,rootUuid:'root',dimension:1,knots:state.map(k=>({uuid:k.uuid,position:{...k.position}}))};
  if(arg.method==='queryArcDistribution')return {ok:true,edits:plan,revision:'original'};
  if(arg.method==='queryKnotBatchState'){
   if(arg.args.length===4){assert.equal(arg.args[2],'original');assert.equal(arg.args[3],'local');if(stale)return {ok:false,error:'geometry changed'};}
   return {ok:true,states:arg.args[1].map(uuid=>{const n=state.find(k=>k.uuid===uuid);return {uuid,position:{...n.position},rotation:n.rotation};})};
  }
  if(arg.method==='refreshPreview')return {ok:true};
 }
 if(method==='set-property'){
  writes++;assert.equal(arg.record,false);assert.equal(arg.path,'position');
  if(arg.uuid===fail){fail=null;return false;}
  state.find(k=>k.uuid===arg.uuid).position={...arg.dump.value};return true;
 }
 if(method==='snapshot'){snapshots++;return true;}
 throw Error('Unexpected request '+method);
}}};
const methods=require('../dist/main.js').methods;
(async()=>{
 let result=await methods.distributeSelectedKnotsByArc(ids);
 assert(result.ok,result.error);assert.equal(snapshots,1);assert.equal(writes,2);
 assert.deepEqual(state[1].position,plan[0].after);assert.deepEqual(state[0].position,v[0]);assert.deepEqual(state[3].position,v[3]);
 state.forEach((n,i)=>n.position={...v[i]});stale=true;
 result=await methods.distributeSelectedKnotsByArc(ids);assert(!result.ok);assert.equal(writes,2);
 stale=false;fail='2';result=await methods.distributeSelectedKnotsByArc(ids);assert(!result.ok);assert.equal(snapshots,1);
 assert.deepEqual(state.map(n=>n.position),v);
 assert(require('../dist/contributions/inspector/Container').template.includes('spl-distribute-arc'));
 assert(require('../package.json').contributions.messages['distribute-selected-knots-by-arc']);
 console.log('ARC DISTRIBUTION PASS: original local arc, reverse traversal, contiguous selection, 2D locks, revision guard, one snapshot and rollback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
