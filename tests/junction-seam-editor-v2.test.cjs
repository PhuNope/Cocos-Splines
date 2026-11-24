'use strict';
const assert=require('node:assert/strict');
const {planJunctionJoin}=require('../dist/SplineJunctionJoinMath');
const {planJunctionFanout}=require('../dist/SplineJunctionFanoutMath');
const {planMultiJunctionGeometry}=require('../dist/SplineJunctionRouteMath');
const {validateFanoutPlan}=require('../dist/SplineJunctionFanoutEditor');
const {validateMultiJunctionPlan}=require('../dist/SplineJunctionRouteEditor');
const v=(x=0,y=0,z=0)=>({x,y,z}),q={x:0,y:0,z:0,w:1};
const m=tx=>[1,0,0,0,0,1,0,0,0,0,1,0,tx,0,0,1];
const make=(tx,progress,firstOut=v(1),lastIn=v(-1))=>({
 matrix:m(tx),progress,reversed:false,dimension:0,
 knots:[0,5,10].map((x,i)=>({
  position:v(x),tangentIn:i===2?{...lastIn}:v(-1),
  tangentOut:i===0?{...firstOut}:v(1),
 })),
});
const a=make(0,1,v(1),v(-2)),b=make(10,0,v(1,1)),c=make(20,0,v(1,1));
const unchanged=JSON.stringify([a,b,c]);
const path=[
 {splineId:'a',progress:1,junctionId:'j1',linkIndex:0},
 {splineId:'b',progress:0,junctionId:'j1',linkIndex:1},
 {splineId:'c',progress:0,junctionId:'j2',linkIndex:1},
];
const appearance={showGizmos:true,gizmoSteps:12};
const rootTransform={position:v(),rotation:{...q},scale:v(1,1,1)};
const meta={ok:true,junctionUuid:'j1',anchorIndex:0,
 parentUuid:'scene',sourceName:'A',rootTransform,
 samplesPerCurve:16,containerAppearance:appearance,guard:'lease'};
let selected=['j1'],modeSeen=[],serial=0,snapshots=0,cleanup=[],writes=[],nodes=new Map(),
 rejectWrite=false,lease=true;
const plans={
 'queryJunctionJoinPlan':([uuid,anchor,target,mode])=>{
  modeSeen.push(['join',mode]);
  if(uuid!=='j1'||anchor!==0||target!==1)return {ok:false,error:'Bad link'};
  return {...meta,...planJunctionJoin(a,b,1e-5,mode),
   targetIndex:1,anchorSplineUuid:'a',targetSplineUuid:'b'};
 },
 'queryJunctionFanoutPlan':([uuid,anchor,targets,mode])=>{
  modeSeen.push(['fanout',mode]);
  if(uuid!=='j1'||anchor!==0||targets.join(',')!=='1,2')
   return {ok:false,error:'Bad exits'};
  return {...meta,...planJunctionFanout(a,[
    {index:1,source:b},{index:2,source:make(10,0,v(1,2))}],mode),
   targetIndices:[1,2],anchorSplineUuid:'a',
   targetSplineUuids:['b','exit-2']};
 },
 'queryMultiJunctionJoinPlan':([uuid,anchor,goal,mode])=>{
  modeSeen.push(['route',mode]);
  if(uuid!=='j1'||anchor!==0||goal!=='c')return {ok:false,error:'Bad goal'};
  return {...meta,...planMultiJunctionGeometry(path,[a,b,c],mode),
   goalSplineUuid:'c',chain:path};
 },
};
const request=async(channel,action,arg)=>{
 assert.equal(channel,'scene');
 if(action==='query-component-has-script')return true;
 if(action==='execute-scene-script'){
   if(plans[arg.method])return plans[arg.method](arg.args);
   if(arg.method==='queryJunctionJoinValid'||arg.method==='queryMultiJunctionJoinValid')
    return lease?{ok:true}:{ok:false,error:'Source changed'};
   if(arg.method==='refreshPreview')return {ok:true};
   throw Error('Unexpected method '+arg.method);
 }
 if(action==='create-node'){
   const id='created-'+(++serial);
   nodes.set(id,{uuid:id,parent:arg.parent,name:arg.name,components:[]});
   return id;
 }
 if(action==='create-component'){
   nodes.get(arg.uuid).components.push(arg.component);
   return true;
 }
 if(action==='query-node'){
   const node=nodes.get(arg);assert(node,'Unknown new Node '+arg);
   return {__comps__:node.components.map(type=>({
    type,value:type==='Splines.SplineKnot'?{
      mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},
      tangentOut:{type:'cc.Vec3'},
    }:{} }))};
 }
 if(action==='set-property'){
   assert.equal(arg.record,false);
   assert(nodes.has(arg.uuid),'Must write only to new nodes');
   writes.push({uuid:arg.uuid,path:arg.path,value:arg.dump.value});
   if(rejectWrite&&arg.path.endsWith('tangentOut'))return false;
   nodes.get(arg.uuid)[arg.path]=arg.dump.value;
   return true;
 }
 if(action==='snapshot'){snapshots++;return true;}
 if(action==='remove-node'){cleanup.push(arg.uuid);nodes.delete(arg.uuid);return true;}
 throw Error('Unexpected message '+action);
};
global.Editor={
 Selection:{getSelected:()=>selected.slice(),clear:()=>selected=[],
   select:(_,uuid)=>selected.push(uuid)},
 Message:{request},
};
const methods=require('../dist/main.js').methods;
function knotNodes(root){
 return [...nodes.values()].filter(n=>n.parent===root);
}
function tangent(node,part){
 return node['__comps__.0.'+part];
}
(async()=>{
 const joined=await methods.joinJunctionLinks(0,1,'g1');
 assert(joined.ok,joined.error);
 const joinKnots=knotNodes(joined.root);
 assert.equal(joinKnots.length,5);
 assert.equal(tangent(joinKnots[2],'tangentIn').x,-2);
 const g1Out=tangent(joinKnots[2],'tangentOut');
 assert(Math.abs(g1Out.x-Math.SQRT2)<1e-7);
 assert.equal(g1Out.y,0);
 assert.equal(snapshots,1);
 selected=['j1'];
 const fan=await methods.joinJunctionFanout(0,'1,2','c1');
 assert(fan.ok,fan.error);
 assert.equal(fan.roots.length,2);
 for(const root of fan.roots){
   const knots=knotNodes(root);
   assert.equal(knots.length,5);
   assert.deepEqual(tangent(knots[2],'tangentOut'),v(2));
 }
 assert.equal(snapshots,2);
 selected=['j1'];
 const multi=await methods.joinMultiJunctionRoute(0,'c','c1');
 assert(multi.ok,multi.error);
 const routeKnots=knotNodes(multi.root);
 assert.equal(routeKnots.length,7);
 assert.deepEqual(tangent(routeKnots[2],'tangentOut'),v(2));
 assert.deepEqual(tangent(routeKnots[4],'tangentOut'),v(1));
 assert.equal(snapshots,3);
 assert.deepEqual(modeSeen,[['join','g1'],['fanout','c1'],['route','c1']]);
 assert.equal(JSON.stringify([a,b,c]),unchanged);
 // Failed C1 field write rolls back the new group, not any source.
 selected=['j1'];rejectWrite=true;
 const before=snapshots,removed=cleanup.length;
 const error=await methods.joinJunctionFanout(0,'1,2','c1');
 assert(!error.ok&&/tangentOut/.test(error.error));
 assert.equal(snapshots,before);
 assert.equal(cleanup.length,removed+1);
 rejectWrite=false;
 // A stale Scene guard cannot change source Nodes or snapshot.
 lease=false;selected=['j1'];
 const previousCount=nodes.size;
 const rejected=await methods.joinMultiJunctionRoute(0,'c','g1');
 assert(!rejected.ok&&/changed/.test(rejected.error));
 assert.equal(nodes.size,previousCount);
 lease=true;
 const inspector=require('../dist/contributions/inspector/Junction');
 assert(inspector.template.includes('spl-join-seam-mode'));
 assert(inspector.template.includes('value="preserve"'));
 assert(inspector.template.includes('value="g1"'));
 assert(inspector.template.includes('value="c1"'));
 // Policy verification also rejects mismatched mode responses.
 const fakeFan=plans.queryJunctionFanoutPlan(['j1',0,[1,2],'c1']);
 assert.throws(()=>validateFanoutPlan(fakeFan,0,[1,2],'g1'),/plan/);
 const fakeMulti=plans.queryMultiJunctionJoinPlan(['j1',0,'c','g1']);
 assert.throws(()=>validateMultiJunctionPlan(fakeMulti,0,'c','c1'),/plan/);
 console.log('JOIN SEAM EDITOR PASS: G1 Join, C1 Fan-out, C1 multi-Junction, mode binding, one snapshot each, rollback and no source edits.');
})().catch(e=>{console.error(e);process.exitCode=1;});
