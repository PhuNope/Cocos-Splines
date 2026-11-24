'use strict';
const assert=require('node:assert/strict');
const {planJunctionBrokenConversion}=require('../dist/SplineJunctionModeMath');
const {commitJunctionBrokenConversion}=require('../dist/SplineJunctionConversionTransaction');
const {createJunctionScene}=require('../dist/SplineJunctionScene');
const v=(x=0,y=0,z=0)=>({x,y,z});
const q={x:0,y:0,z:0,w:1};
const near=(a,b,eps=1e-6)=>assert(Math.abs(a-b)<eps,a+' != '+b);
let input={mode:0,resolvedIn:v(-2),resolvedOut:v(3),
 storedIn:v(-1),storedOut:v(1),knotRotation:q,dimension:0};
let converted=planJunctionBrokenConversion(input);
assert.equal(converted.afterMode,4);
assert.deepEqual(converted.afterIn,v(-2));
assert.deepEqual(converted.afterOut,v(3));
assert.deepEqual(converted.beforeIn,v(-1));
assert.deepEqual(planJunctionBrokenConversion({...input,mode:1,
 resolvedIn:v(),resolvedOut:v()}).afterOut,v());
assert.deepEqual(planJunctionBrokenConversion({...input,mode:2,
 resolvedIn:v(-5),resolvedOut:v(5)}).afterIn,v(-5));
assert.deepEqual(planJunctionBrokenConversion({...input,mode:3,
 resolvedIn:v(-4),resolvedOut:v(2)}).afterIn,v(-4));
assert.equal(planJunctionBrokenConversion({...input,mode:4}).changed,false);
assert.throws(()=>planJunctionBrokenConversion({...input,mode:5}),/Invalid/);
assert.throws(()=>planJunctionBrokenConversion({...input,resolvedIn:v(NaN)}),/Invalid/);
const rotation={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};
converted=planJunctionBrokenConversion({...input,knotRotation:rotation,
 handleIn:true,tangentsInKnotSpace:true});
near(converted.afterIn.x,0);near(converted.afterIn.y,2);
converted=planJunctionBrokenConversion({...input,dimension:1,
 storedOut:v(1,0,88),resolvedOut:v(3,2)});
assert.equal(converted.afterOut.z,88,'Preserve unused planar serialized axis');

const sceneRoot={uuid:'scene-a'},nodeMap=new Map();
const makeKnot=(id,root,x,mode=4)=>{
 const node={uuid:id,parent:root,isValid:true,position:v(x),rotation:{...q},
   components:[]};
 const component={kind:'Splines.SplineKnot',node,mode,tension:1/3,
   tangentsInKnotSpace:false,tangentIn:v(-1),tangentOut:v(1),
   tangentInHandle:null,tangentOutHandle:null};
 node.components=[component];nodeMap.set(id,node);return component;
};
function spline(id,offset=0,mode=4){
 const node={uuid:id,isValid:true,parent:sceneRoot,
   worldMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,offset,0,0,1]};
 const knots=[makeKnot(id+'-start',node,0,mode),makeKnot(id+'-end',node,10)];
 return {kind:'Splines.SplineContainer',node,closed:false,enabled:true,
   reversed:false,dimension:0,samplesPerCurve:16,count:2,
   get knots(){return this.reversed?[...knots].reverse():knots;},
   getNaturalResolvedKnots(){
     return knots.map((k,i)=>{
       const tin=k.mode===0?v(i===0?0:-10/3):k.mode===1?v():
         k.mode===2?v(-k.tangentOut.x):k.mode===3?v(-Math.abs(k.tangentIn.x)):
         {...k.tangentIn};
       const tout=k.mode===0?v(i===0?10/3:0):k.mode===1?v():{...k.tangentOut};
       return {position:k.node.position,tangentIn:tin,tangentOut:tout};
     });
   },
   evaluateWorldPosition(t){return v(offset+10*(this.reversed?1-t:t));},
   evaluateTangent(){return v(1);}
 };
}
const source=spline('src',0),target=spline('dst',10,0);
const junctionNode={uuid:'junction-1',isValid:true,parent:sceneRoot,components:[]};
const link=(s,progress)=>({spline:s,progress,positionMode:0,distance:0,
 exitDirection:0,getProgress(){return this.progress;}});
const junction={kind:'Splines.SplineJunction',node:junctionNode,
 enabled:true,connections:[link(source,1),link(target,0)]};
junctionNode.components=[junction];nodeMap.set(junctionNode.uuid,junctionNode);
const scene=createJunctionScene({resolve:id=>nodeMap.get(id)||null,
 classOf:c=>c.kind,sceneId:()=>sceneRoot.uuid,
 queryKnotEditFrame:id=>({ok:true,matrix:(id==='src'?source:target).node.worldMatrix})});
let plan=scene.queryJunctionConversionPlan(junctionNode.uuid,1);
assert(plan.ok,plan.error);
assert.equal(plan.changed,true);assert.equal(plan.beforeMode,0);
assert.equal(plan.writes.length,3);
assert.equal(plan.writes[0].path,'__comps__.0.tangentIn');
assert.equal(plan.writes[1].path,'__comps__.0.tangentOut');
assert.equal(plan.writes[2].path,'__comps__.0.mode');
near(plan.writes[1].after.x,10/3);
const targetKnot=target.knots[0],beforePos={...targetKnot.node.position};
const state=()=>scene.queryJunctionConversionState(junctionNode.uuid,
 plan.guard,plan.targetKnotUuid);
assert(state().ok);
const setValue=(w,val)=>{
 const node=nodeMap.get(w.uuid);
 const key=w.path.split('.').slice(-1)[0];
 if(w.path==='position')node.position={...val};
 else node.components[0][key]=typeof val==='number'?val:{...val};
};
let writes=0,snapshots=0,behavior='';
const adapter={
 read:async()=>state(),
 write:async(w,val)=>{
   writes++;setValue(w,val);
   if(behavior==='reject-after-mutating'&&w.path.endsWith('.tangentOut')&&val.x>1)
     throw Error('Injected rejected write');
 },
 snapshot:async()=>{
   snapshots++;
   return behavior!=='reject-snapshot';
 }
};
(async()=>{
 let result=await commitJunctionBrokenConversion(plan,adapter);
 assert(result.ok&&result.changed);
 assert.equal(targetKnot.mode,4);
 near(targetKnot.tangentOut.x,10/3);
 assert.deepEqual(targetKnot.node.position,beforePos,'Knot position remains fixed');
 assert.equal(snapshots,1);
 assert(!scene.queryJunctionConversionPlan(junctionNode.uuid,1).changed,
   'Broken mode is a no-op without a second snapshot');
 targetKnot.mode=0;targetKnot.tangentIn=v(-1);targetKnot.tangentOut=v(1);
 plan=scene.queryJunctionConversionPlan(junctionNode.uuid,1);
 behavior='reject-after-mutating';
 await assert.rejects(()=>commitJunctionBrokenConversion(plan,adapter),/Injected/);
 assert.equal(targetKnot.mode,0);
 assert.deepEqual(targetKnot.tangentIn,v(-1));
 assert.deepEqual(targetKnot.tangentOut,v(1));
 assert.equal(snapshots,1);
 behavior='reject-snapshot';
 await assert.rejects(()=>commitJunctionBrokenConversion(plan,adapter),/snapshot/);
 assert.equal(targetKnot.mode,0);
 assert.deepEqual(targetKnot.tangentOut,v(1));
 assert.equal(snapshots,2,'One attempted snapshot only; no rollback snapshot');

 // Mode 2 and 3 must preserve resolved incoming vector when switching to Broken.
 for(const mode of [1,2,3]){
   targetKnot.mode=mode;targetKnot.tangentIn=v(-3);
   targetKnot.tangentOut=v(2);
   plan=scene.queryJunctionConversionPlan(junctionNode.uuid,1);
   assert(plan.ok,plan.error);
   const expected=target.getNaturalResolvedKnots()[0];
   behavior='';
   const result=await commitJunctionBrokenConversion(plan,adapter);
   assert(result.changed);
   assert.deepEqual(targetKnot.tangentIn,expected.tangentIn);
   assert.deepEqual(targetKnot.tangentOut,expected.tangentOut);
 }
 // Editor mutation must not proceed when Scene or non-target Knot changes.
 targetKnot.mode=0;targetKnot.tangentIn=v(-1);targetKnot.tangentOut=v(1);
 plan=scene.queryJunctionConversionPlan(junctionNode.uuid,1);
 source.knots[0].tangentOut.x=500;
 assert(!state().ok,'Guard must catch unrelated spline edits');
 await assert.rejects(()=>commitJunctionBrokenConversion(plan,adapter),/guard|changed/i);
 assert.equal(targetKnot.mode,0);
 source.knots[0].tangentOut.x=1;
 sceneRoot.uuid='scene-b';
 assert(!state().ok,'Scene lease invalidates stale plan');
 sceneRoot.uuid='scene-a';

 // A handle-backed tangent is serialized through its child Node.position.
 const handle={uuid:'h-out',parent:targetKnot.node,isValid:true,position:v(1)};
 nodeMap.set(handle.uuid,handle);targetKnot.tangentOutHandle=handle;
 plan=scene.queryJunctionConversionPlan(junctionNode.uuid,1);
 assert(plan.ok,plan.error);
 assert.equal(plan.writes[1].uuid,'h-out');
 assert.equal(plan.writes[1].path,'position');
 assert.equal(plan.writes[1].type,'cc.Vec3');
 assert.equal(targetKnot.mode,0);
 behavior='';await commitJunctionBrokenConversion(plan,adapter);
 near(handle.position.x,10/3);
 assert.equal(targetKnot.mode,4);
 assert.deepEqual(targetKnot.node.position,beforePos);
 handle.parent=target.node;targetKnot.mode=0;
 assert(!scene.queryJunctionConversionPlan(junctionNode.uuid,1).ok,
   'Foreign handle must fail closed');
 handle.parent=targetKnot.node;
 targetKnot.tangentOutHandle=null;
 target.closed=true;
 assert(!scene.queryJunctionConversionPlan(junctionNode.uuid,1).ok);
 target.closed=false;
 junction.connections[1].progress=.5;
 assert(!scene.queryJunctionConversionPlan(junctionNode.uuid,1).ok);
 // Full Editor-to-Scene workflow uses set-property record:false and
 // exactly one snapshot; it must expose a button and registered message.
 junction.connections[1].progress=0;
 targetKnot.mode=0;targetKnot.tangentIn=v(-1);targetKnot.tangentOut=v(1);
 let editorSnapshots=0,editorWrites=0;
 global.Editor={
   Selection:{getSelected:()=>[junctionNode.uuid]},
   Message:{request:async(channel,method,arg)=>{
     assert.equal(channel,'scene');
     if(method==='execute-scene-script'){
       if(arg.method==='refreshPreview')return {ok:true};
       return scene[arg.method](...arg.args);
     }
     if(method==='set-property'){
       assert.equal(arg.record,false);
       assert(['Enum','cc.Vec3'].includes(arg.dump.type));
       editorWrites++;setValue({uuid:arg.uuid,path:arg.path},arg.dump.value);
       return true;
     }
     if(method==='snapshot'){editorSnapshots++;return true;}
     throw Error('Unexpected Editor operation '+method);
   }},
 };
 const {methods}=require('../dist/main.js');
 const editorResult=await methods.convertJunctionTargetToBroken(1);
 assert(editorResult.ok,editorResult.error);
 assert(editorResult.changed);
 assert.equal(targetKnot.mode,4);
 assert.equal(editorSnapshots,1);
 assert(editorWrites>=2);
 const repeat=await methods.convertJunctionTargetToBroken(1);
 assert(repeat.ok&&!repeat.changed);
 assert.equal(editorSnapshots,1);
 const inspector=require('../dist/contributions/inspector/Junction.js');
 assert(inspector.template.includes('spl-convert-connector-mode'));
 const messages=require('../package.json').contributions.messages;
 assert.deepEqual(messages['convert-junction-tangent-mode'].methods,
   ['convertJunctionTargetToBroken']);
 console.log('JUNCTION MODE CONVERSION PASS: Auto/Linear/Mirrored/Continuous, handles, Editor action, single snapshot, rollback, Scene lease.');
})().catch(error=>{console.error(error);process.exitCode=1;});
