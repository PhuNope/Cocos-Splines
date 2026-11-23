'use strict';
const assert=require('node:assert/strict'),Module=require('node:module');
const source={uuid:'original',parentUuid:'scene',name:'Source Spline',position:{x:1,y:2,z:3},
 rotation:{x:0,y:0,z:0,w:1},scale:{x:2,y:3,z:4}};
const v=(x,y=0,z=0)=>({x,y,z});
const makePlan=(o)=>({
 ok:true,revision:'source-rev-1',rootUuid:'original',parentUuid:'scene',
 sourceName:'Source Spline',dimension:1,closed:false,samplesPerCurve:32,
 rootTransform:{position:{...source.position},rotation:{...source.rotation},scale:{...source.scale}},
 count:3,sourceLength:4,actualSpacing:2,estimatedMaxError:0.01,
  ...(o.mode==='simplify'?{sourceIndices:[0,2,4],retainedKnots:[0,2,4].map(i=>({
    name:'Retained '+i,rotation:{x:0,y:0,z:Math.sin(i/10),w:Math.cos(i/10)},
    tension:1/3+i/15,tangentsInKnotSpace:i===2,
    editTangentHandles:i===0,handleIn:i===0,handleOut:i!==4,
  }))}:{}),
 knots:[0,1,2].map(i=>({position:v(i*2,0,0),tangentIn:v(-.66,0,0),
  tangentOut:v(.66,0,0),mode:4})),
});
const nodes=new Map([['original',JSON.stringify(source)]]);
let serial=0,snapshotCount=0,removed=[],writes=[],created=[],checks=0,
 failure=null,invalidAt=Infinity,optionsSeen=null,planError=null;
let selection=['original'];
const ui={getSelected:()=>selection.slice(),clear:()=>selection=[],
 select:(type,uuid)=>selection.push(uuid)};
const request=async(channel,method,arg)=>{
 assert.equal(channel,'scene');
 if(method==='query-component-has-script')return true;
 if(method==='execute-scene-script'){
  if(arg.method==='querySpline')return {
   found:true,rootUuid:'original',parentUuid:'scene',rootName:'Source Spline',
   knots:[{uuid:'a'},{uuid:'b'}],
  };
  if(arg.method==='queryResamplePlan'){
   optionsSeen=arg.args[1];
   return planError?{ok:false,error:planError}:makePlan(optionsSeen);
  }
  if(arg.method==='queryResampleValid'){
   checks++;
   return checks>=invalidAt?{ok:false,error:'Source Scene root changed'}:{ok:true};
  }
  throw Error('Unknown scene script '+arg.method);
 }
 if(method==='create-node'){
  const uuid='new_'+(++serial);
  nodes.set(uuid,{uuid,parent:arg.parent,name:arg.name,components:[]});
  created.push({uuid,parent:arg.parent,name:arg.name});
  return uuid;
 }
 if(method==='create-component'){
  const node=nodes.get(arg.uuid);assert(node);
  node.components.push(arg.component);
  return true;
 }
 if(method==='query-node'){
  const node=nodes.get(arg);assert(node);
  return {__comps__:node.components.map(type=>({type,
   value:type==='Splines.SplineKnot'?{
    mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},
    tangentOut:{type:'cc.Vec3'},
   }:{}}))};
 }
 if(method==='set-property'){
  assert.equal(arg.record,false);
  const node=nodes.get(arg.uuid);assert(node,'Unknown node '+arg.uuid);
  if(node.uuid==='original')throw Error('Resample must never mutate source');
  writes.push({uuid:arg.uuid,path:arg.path,type:arg.dump.type,value:arg.dump.value});
  if(failure==='handle-link'&&arg.path.endsWith('tangentInHandle')){
    failure=null;return false;
  }
  if(failure==='write'&&arg.path.endsWith('tangentOut')){
   failure=null;
   return false;
  }
  node[arg.path]=arg.dump.value;
  return true;
 }
 if(method==='snapshot'){
  snapshotCount++;
  if(failure==='snapshot')return false;
  return undefined;
 }
 if(method==='remove-node'){
  removed.push(arg.uuid);
  assert.equal(arg.snapshot,false);
  nodes.delete(arg.uuid);
  return true;
 }
 throw Error('Unexpected Editor method '+method);
};
global.Editor={Selection:ui,Message:{request}};
const methods=require('../dist/main.js').methods;
const reset=()=>{
 checks=0;failure=null;invalidAt=Infinity;optionsSeen=null;
 planError=null;selection=['original'];
};
(async()=>{
 let result=await methods.resampleSelectedSpline('count',3,.25,'local');
 assert(result.ok,result.error);
 assert.equal(result.count,3);
 assert.equal(snapshotCount,1,'Exactly one snapshot after completing a new spline');
 assert.equal(created.length,4,'One new SplineContainer and three Knot children');
 const root=created[0].uuid;
 assert.equal(created[0].parent,'scene');
 assert(created.slice(1).every(n=>n.parent===root));
 assert.equal(nodes.get(root).position.x,1,'Preserve original Container local transform');
 assert.equal(nodes.get(root).scale.y,3);
 assert.equal(nodes.get(root).rotation.w,1);
 assert(writes.some(w=>w.uuid===root&&w.path==='__comps__.0.closed'&&w.value===false));
 assert(writes.some(w=>w.uuid===root&&w.path==='__comps__.0.reversed'&&w.value===false));
 assert(writes.some(w=>w.uuid===root&&w.path==='__comps__.0.dimension'&&w.value===1));
 const knots=created.slice(1).map(k=>k.uuid);
 assert.equal(writes.filter(w=>knots.includes(w.uuid)&&w.path.endsWith('tangentOut')).length,3);
 assert.equal(writes.filter(w=>knots.includes(w.uuid)&&w.path.endsWith('tangentIn')).length,3);
 assert.equal(writes.filter(w=>knots.includes(w.uuid)&&w.path.endsWith('mode')).length,3);
 assert.deepEqual(selection,[root]);
 assert.equal(nodes.get('original'),JSON.stringify(source),'Source and Prefab data unchanged');
 assert.deepEqual(optionsSeen,{mode:'count',target:3,tolerance:.25,space:'local'});

 reset();
 const countBefore=created.length,snapBefore=snapshotCount;
 result=await methods.resampleSelectedSpline('spacing',1,.02,'world');
 assert(result.ok,result.error);
 assert.equal(optionsSeen.space,'world');
 assert.equal(optionsSeen.mode,'spacing');
 assert.equal(snapshotCount,snapBefore+1);
 assert.equal(created.length,countBefore+4);

 reset();
 const beforeSimplify=created.length,beforeSimplifySnapshots=snapshotCount;
 result=await methods.resampleSelectedSpline('simplify',0,.05,'local');
 assert(result.ok,result.error);
 const added=created.slice(beforeSimplify),newRoot=added[0].uuid;
 const retained=added.filter(item=>item.parent===newRoot);
 const handles=added.filter(item=>retained.some(k=>k.uuid===item.parent));
 assert.equal(added.length,7,'root + three Knots + three independent handles');
 assert.equal(retained.length,3);
 assert.equal(handles.length,3);
 assert.equal(snapshotCount,beforeSimplifySnapshots+1,'one snapshot including handles');
 for(let i=0;i<3;i++){
   const entry=retained[i],id=entry.uuid,sourceIndex=i*2;
   assert.equal(entry.name,'Retained '+sourceIndex);
   assert(Math.abs(nodes.get(id).rotation.z-Math.sin(sourceIndex/10))<1e-7);
   assert.equal(writes.filter(w=>w.uuid===id&&w.path==='rotation').length,1);
   const t=writes.find(w=>w.uuid===id&&w.path.endsWith('.tension'));
   assert(t&&Math.abs(t.value-(1/3+sourceIndex/15))<1e-7);
 }
 assert.equal(handles.filter(h=>h.parent===retained[0].uuid).length,2);
 assert.equal(handles.filter(h=>h.parent===retained[1].uuid).length,1);
 assert.equal(handles.filter(h=>h.parent===retained[2].uuid).length,0);
 const handleLinks=writes.filter(w=>w.path.endsWith('tangentInHandle')||w.path.endsWith('tangentOutHandle')).slice(-3);
 assert.equal(handleLinks.length,3);
 assert(handleLinks.every(link=>handles.some(h=>h.uuid===link.value)&&!['a','b','original'].includes(link.value)));
 assert(writes.some(w=>w.uuid===retained[1].uuid&&w.path.endsWith('tangentsInKnotSpace')&&w.value===true));
 assert(writes.some(w=>w.uuid===retained[0].uuid&&w.path.endsWith('editTangentHandles')&&w.value===true));
 assert.equal(nodes.get('original'),JSON.stringify(source));
 reset();failure='handle-link';
 const beforeRejected=removed.length,beforeRejectedSnapshots=snapshotCount;
 result=await methods.resampleSelectedSpline('simplify',0,.05,'local');
 assert(!result.ok);
 assert.equal(removed.length,beforeRejected+1,'failed Node ref must clean generated sibling');
 assert.equal(snapshotCount,beforeRejectedSnapshots,'failed handle ref must not snapshot');
 assert.equal(nodes.get('original'),JSON.stringify(source));
 reset();
 const previousCreated=created.length;
 planError='Resample deviation exceeds tolerance';
 result=await methods.resampleSelectedSpline('count',2,.0001,'local');
 assert(!result.ok);assert.match(result.error,/deviation/);
 assert.equal(created.length,previousCreated,'Planner must reject before any Scene creation');

 reset();failure='write';
 let removedCount=removed.length;
 const beforeFailedSnapshot=snapshotCount;
 result=await methods.resampleSelectedSpline('count',3,.25,'local');
 assert(!result.ok);assert(removed.length===removedCount+1);
 assert.equal(snapshotCount,beforeFailedSnapshot,'Partial Node construction never snapshots');
 assert.equal(nodes.get('original'),JSON.stringify(source));

 reset();failure='snapshot';
 removedCount=removed.length;
 result=await methods.resampleSelectedSpline('count',3,.25,'local');
 assert(!result.ok);assert(removed.length===removedCount+1);
 assert.equal(snapshotCount,beforeFailedSnapshot+1);

 reset();invalidAt=1;
 const beforeStale=created.length;
 result=await methods.resampleSelectedSpline('count',3,.25,'local');
 assert(!result.ok);assert.equal(created.length,beforeStale,'Stale source rejected before creation');

 reset();invalidAt=3;
 removedCount=removed.length;
 result=await methods.resampleSelectedSpline('count',3,.25,'local');
 assert(!result.ok);assert.match(result.error,/cleanup skipped/);
 assert.equal(removed.length,removedCount,'Never send remove-node to a replacement Scene');

 reset();
 result=await methods.resampleSelectedSpline('count',NaN,.1,'local');
 assert(!result.ok);
 assert.equal(nodes.get('original'),JSON.stringify(source));

 const inspector=require('../dist/contributions/inspector/Container');
 assert(inspector.template.includes('spl-resample-create'));
 assert(inspector.template.includes('spl-resample-tolerance'));
 assert(require('../package.json').contributions.messages['resample-selected-spline']);

 // Scene script fingerprint guards hierarchy reorder, World transform,
 // parent change and source geometry mutation.
 const scene={uuid:'scene',children:[],components:[],parent:null};
 const rootNode={uuid:'root-src',name:'Test Spline',parent:scene,children:[],
  components:[],isValid:true,position:v(1,2,3),rotation:{x:0,y:0,z:0,w:1},
  scale:v(2,1,1),worldMatrix:{
   m00:2,m01:0,m02:0,m03:0,m04:0,m05:1,m06:0,m07:0,
   m08:0,m09:0,m10:1,m11:0,m12:1,m13:2,m14:3,m15:1},
 };
 scene.children=[rootNode];
 let revision='v1';
 const knotNodes=[0,1,2].map(i=>({uuid:'k'+i,name:'Keep '+i,parent:rootNode,
  children:[],components:[],position:v(i),isValid:true,
  rotation:{x:0,y:0,z:0,w:1}}));
 for(const n of knotNodes)n.components=[{kind:'Splines.SplineKnot',node:n,enabled:true,
  tension:.42,tangentsInKnotSpace:false,editTangentHandles:false}];
 rootNode.children=knotNodes;
 const comp={kind:'Splines.SplineContainer',node:rootNode,enabled:true,
  dimension:0,closed:false,samplesPerCurve:32,
  get knots(){return rootNode.children.map(k=>k.components[0]);},
  getRevision:()=>revision,
  createResamplePlan:(opts,metric)=>makePlan(opts),
  createSimplifyPlan:(opts,metric)=>({...makePlan({...opts,mode:'simplify'}),
    sourceIndices:[0,1,2]}),
 };
 rootNode.components=[comp];
 const originalLoad=Module._load;
 Module._load=function(name,...args){
  if(name==='cc')return {director:{getScene:()=>scene},js:{getClassName:c=>c.kind}};
  return originalLoad.call(this,name,...args);
 };
 try{
  const sceneMethods=require('../src/scene.js').methods;
  let plan=sceneMethods.queryResamplePlan('root-src',{mode:'count',target:3,tolerance:.1,space:'world'});
  assert(plan.ok,plan.error);
  assert(sceneMethods.queryResampleValid('root-src',plan.revision).ok);
  const attached={uuid:'original-handle',isValid:true,parent:knotNodes[1],position:v(2,3)};
  knotNodes[1].components[0].tangentOutHandle=attached;
  let simplify=sceneMethods.queryResamplePlan('root-src',
    {mode:'simplify',target:0,tolerance:.1,space:'local'});
  assert(simplify.ok,simplify.error);
  assert.equal(simplify.retainedKnots[1].name,'Keep 1');
  assert.equal(simplify.retainedKnots[1].handleOut,true);
  assert.equal(simplify.retainedKnots[1].tension,.42);
  assert(!JSON.stringify(simplify.retainedKnots).includes('original-handle'),
    'Never leak old Scene Node identifiers to new planner payload');
  assert(sceneMethods.queryResampleValid('root-src',simplify.revision).ok);
  attached.position.x++;
  assert(!sceneMethods.queryResampleValid('root-src',simplify.revision).ok,
    'Handle movement invalidates pending Simplify copy');
  attached.position.x--;
  attached.parent=rootNode;
  assert(!sceneMethods.queryResamplePlan('root-src',{mode:'simplify',tolerance:.1}).ok,
    'Foreign handle references must fail before generating nodes');
  attached.parent=knotNodes[1];
  rootNode.scale.x=3;
  assert(!sceneMethods.queryResampleValid('root-src',plan.revision).ok);
  rootNode.scale.x=2;
  rootNode.children.reverse();
  assert(!sceneMethods.queryResampleValid('root-src',plan.revision).ok);
  rootNode.children.reverse();
  revision='v2';
  assert(!sceneMethods.queryResampleValid('root-src',plan.revision).ok);
  revision='v1';
  rootNode.worldMatrix.m00=0;
  assert(!sceneMethods.queryResampleValid('root-src',plan.revision).ok);
  assert(!sceneMethods.queryResamplePlan('missing',{mode:'count'}).ok);
 }finally{Module._load=originalLoad;}

 console.log('RESAMPLE EDITOR PASS: independent tangent handles and Knot metadata, one snapshot, cleanup, stale metadata/Scene guards, source immutability.');
})().catch(e=>{console.error(e);process.exitCode=1;});
