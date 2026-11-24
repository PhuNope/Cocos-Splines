'use strict';
const assert=require('node:assert/strict');
const {planPartialJunctionChain,planPartialJunctionGeometry}=
 require('../dist/SplineJunctionRouteMath');
const {validateMultiJunctionPlan}=require('../dist/SplineJunctionRouteEditor');
const v=(x=0,y=0,z=0)=>({x,y,z}),q={x:0,y:0,z:0,w:1};
const mat=tx=>[1,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const link=(junctionId,linkIndex,splineId,progress,x)=>({
 junctionId,linkIndex,splineId,progress,world:v(x),
});
const links=[
 link('j1',0,'a',.5,2.5),link('j1',1,'b',.2,2.5),
 link('j2',0,'b',.8,8.5),link('j2',1,'c',.3,8.5),
];
const chain=planPartialJunctionChain(links,
 {junctionId:'j1',linkIndex:0},'c',0,1);
const knot=(x,i)=>({position:v(x),
 tangentIn:v(i===0?0:-5/3),tangentOut:v(i===2?0:5/3)});
const descriptors=chain.path.map((p,i)=>({
 fromProgress:p.fromProgress,toProgress:p.toProgress,
 fromT:p.fromProgress*p.fromProgress,toT:p.toProgress*p.toProgress,
 matrix:mat([0,2.1,7.6][i]),dimension:0,
 knots:[0,5,10].map(knot),
}));
const original=JSON.stringify(descriptors);
const geo=planPartialJunctionGeometry(chain.path,descriptors,'g1');
const getPlan=()=>({
 ok:true,...geo,junctionUuid:'j1',anchorIndex:0,
 goalSplineUuid:'c',routeMode:'partial',startSide:0,goalSide:1,
 parentUuid:'scene',rootTransform:{position:v(),rotation:{...q},
   scale:v(1,1,1)},sourceName:'Test Spline',
 samplesPerCurve:32,containerAppearance:{showGizmos:true,gizmoSteps:12},
 chain:chain.path,guard:'lease',
});
validateMultiJunctionPlan(getPlan(),0,'c','g1','partial',0,1);
assert.throws(()=>validateMultiJunctionPlan(getPlan(),
 0,'c','g1','full',0,1),/plan/);
assert.throws(()=>validateMultiJunctionPlan(getPlan(),
 0,'c','g1','partial',1,1),/plan/);
assert.throws(()=>validateMultiJunctionPlan({
 ...getPlan(),chain:chain.path.map((p,i)=>i===1?{...p,toProgress:p.fromProgress}:p),
},0,'c','g1','partial',0,1),/source distance/);
let selection=['j1'],messages=[],serial=0,removed=[],created=[],
 snapshots=0,guard=true,failWrite=false,badResponse=false;
const nodes=new Map([
 ['a',Object.freeze({uuid:'a',source:true})],
 ['b',Object.freeze({uuid:'b',source:true})],
 ['c',Object.freeze({uuid:'c',source:true})],
]);
const request=async(kind,method,arg)=>{
 assert.equal(kind,'scene');
 messages.push([method,arg]);
 if(method==='query-component-has-script')return true;
 if(method==='execute-scene-script'){
   if(arg.method==='queryMultiJunctionJoinPlan'){
     assert.deepEqual(arg.args,['j1',0,'c','g1','partial',0,1]);
     return badResponse?{...getPlan(),routeMode:'full'}:getPlan();
   }
   if(arg.method==='queryMultiJunctionJoinValid')
     return guard?{ok:true}:{ok:false,error:'Scene changed'};
   if(arg.method==='refreshPreview')return {ok:true};
   throw Error('Unexpected Scene query '+arg.method);
 }
 if(method==='create-node'){
   const id='generated-'+(++serial),n={uuid:id,name:arg.name,
     parent:arg.parent,components:[]};nodes.set(id,n);created.push(n);
   return id;
 }
 if(method==='create-component'){
   nodes.get(arg.uuid).components.push(arg.component);return true;
 }
 if(method==='query-node'){
   const n=nodes.get(arg);
   assert(n,'No node '+arg);
   return {__comps__:n.components.map(type=>({type,value:
    type==='Splines.SplineKnot'?{
      mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},
      tangentOut:{type:'cc.Vec3'},
    }:{} }))};
 }
 if(method==='set-property'){
   assert.equal(arg.record,false);
   assert(nodes.has(arg.uuid));
   if(failWrite&&arg.path.endsWith('tangentOut'))return false;
   nodes.get(arg.uuid)[arg.path]=arg.dump.value;return true;
 }
 if(method==='snapshot'){snapshots++;return true;}
 if(method==='remove-node'){
   assert.equal(arg.snapshot,false);
   removed.push(arg.uuid);nodes.delete(arg.uuid);return true;
 }
 throw Error('Unexpected IPC '+method);
};
global.Editor={
 Selection:{getSelected:()=>selection.slice(),clear:()=>selection=[],
   select:(_,id)=>selection.push(id)},
 Message:{request},
};
const {methods}=require('../dist/main.js');
(async()=>{
 let result=await methods.joinMultiJunctionRoute(0,'c','g1','partial',0,1);
 assert(result.ok,result.error);
 assert.equal(result.count,geo.count);
 assert.equal(result.switchCount,2);
 assert.equal(snapshots,1);
 assert.deepEqual(selection,[result.root]);
 const knots=created.filter(n=>n.parent===result.root);
 assert.equal(knots.length,geo.count);
 assert.deepEqual(knots.map(n=>nodes.get(n.uuid).position.x),
   geo.knots.map(k=>k.position.x));
 assert.equal(JSON.stringify(descriptors),original);
 const baseline=created.length,baseSnapshot=snapshots;
 selection=['j1'];badResponse=true;
 result=await methods.joinMultiJunctionRoute(0,'c','g1','partial',0,1);
 assert(!result.ok&&/plan/.test(result.error));
 assert.equal(created.length,baseline);
 assert.equal(snapshots,baseSnapshot);
 badResponse=false;guard=false;
 result=await methods.joinMultiJunctionRoute(0,'c','g1','partial',0,1);
 assert(!result.ok&&/changed/.test(result.error));
 assert.equal(created.length,baseline);
 guard=true;failWrite=true;
 const beforeRemove=removed.length;
 result=await methods.joinMultiJunctionRoute(0,'c','g1','partial',0,1);
 assert(!result.ok&&/tangentOut/.test(result.error));
 assert.equal(removed.length,beforeRemove+1);
 assert.equal(snapshots,baseSnapshot);
 result=await methods.joinMultiJunctionRoute(0,'c','g1','unsupported',0,1);
 assert(!result.ok&&/partial route mode/.test(result.error));
 const inspector=require('../dist/contributions/inspector/Junction');
 assert(inspector.template.includes('spl-route-mode'));
 assert(inspector.template.includes('value="partial"'));
 assert(inspector.template.includes('spl-route-start-side'));
 assert(inspector.template.includes('spl-route-goal-side'));
 console.log('PARTIAL ROUTE EDITOR PASS: mode/side binding, one snapshot, existing source isolation, stale guard, rollback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
