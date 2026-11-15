'use strict';
/**
 * End-to-end mocked Editor -> Scene -> typed scene.set-property(record:true).
 * One grouped translation is one Creator history entry; no untracked live
 * Vec3 mutation happens during plan/preflight.
 */
const assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const copy=x=>JSON.parse(JSON.stringify(x)),v=(x,y,z)=>({x,y,z});
const wrap=(type,value)=>({type,value});
const knots=[v(0,0,0),v(3,1,0),v(6,2,0)];
let selected=[0,2],restores=0,refreshGroup=0,mutateBeforeQuery=false;
const pathComponent={
 className:'Spline.Path',knots:knots.map(position=>({
    position,mode:1,rollDegrees:10,handleIn:v(-1,0,0),
    handleOut:v(1,0,0),tension:0})),
 gizmoKnotIndex:0,
 planGroupNudge(direction){
  assert.match(direction,/^[xyz][+-]$/);
  if(selected.length<2)throw Error('Select at least two Knots');
  const deltaLocal=v(0,0,0);deltaLocal[direction[0]]=direction[1]==='+'?1:-1;
  return {indices:copy(selected),knotCount:this.knots.length,
   expectedPositions:selected.map(i=>copy(this.knots[i].position)),deltaLocal};
 },
 onRestore(){restores++;},
 restoreGroupSelection(indices){selected=copy(indices);refreshGroup++;},
 selectedGroupIndices(){return copy(selected);}
};
const rootNode={uuid:'scene',components:[],children:[
 {uuid:'path',components:[pathComponent],children:[]}]};
const oldLoad=Module._load,oldEditor=globalThis.Editor;
Module._load=function(id,parent,isMain){
 if(id==='cc')return {
  director:{getScene:()=>rootNode},
  js:{getClassName:c=>c.className}};
 return oldLoad.call(this,id,parent,isMain);
};
const dumpKnot=k=>wrap('Spline.Knot',{
 position:wrap('cc.Vec3',copy(k.position)),
 mode:wrap('Enum',k.mode),rollDegrees:wrap('Float',k.rollDegrees),
 handleIn:wrap('cc.Vec3',copy(k.handleIn)),
 handleOut:wrap('cc.Vec3',copy(k.handleOut)),
 tension:wrap('Float',k.tension),custom:wrap('String','preserved')});
const query=()=>({__comps__:[{type:'Spline.Path',value:{
 interpolation:wrap('Enum',1),gizmoKnotIndex:wrap('Integer',0),
 knots:{type:'Array',value:pathComponent.knots.map(dumpKnot),
 elementTypeData:dumpKnot(pathComponent.knots[0])}}}]});
(async()=>{
try{
 const scene=require('../src/v2/clean-scene.js');
 let writes=[],history=[];
 globalThis.Editor={
  Selection:{getSelected:()=>['path']},
  Message:{request:async(channel,method,payload)=>{
   if(channel==='scene'&&method==='execute-scene-script')
    return scene.methods[payload.method](...payload.args);
   if(channel==='scene'&&method==='query-node'){
    if(mutateBeforeQuery){
     mutateBeforeQuery=false;pathComponent.knots[2].position.x+=.5;
    }
    return query();
   }
   if(channel==='scene'&&method==='set-property'){
    assert.equal(payload.uuid,'path');
    assert.equal(payload.path,'__comps__.0.knots');
    assert.equal(payload.record,true);
    history.push(copy(pathComponent.knots));
    pathComponent.knots=payload.dump.value.map((entry,i)=>({
      ...pathComponent.knots[i],position:copy(entry.value.position.value)
    }));
    writes.push(payload);
    return true;
   }
   throw Error('Unexpected Editor request '+channel+':'+method);
  }}
 };
 const main=require('../src/v2/clean-main.js');
 const original=copy(pathComponent.knots);
 const before=JSON.stringify(original);
 const out=await main.methods.nudgeV2PathGroup('x+');
 assert.equal(out.ok,true);
 assert.equal(out.count,2);
 assert.equal(writes.length,1,'Exactly one native recordable write per group nudge');
 assert.equal(restores,1);assert.equal(refreshGroup,1);
 assert.deepEqual(selected,[0,2]);
 assert.deepEqual(pathComponent.knots.map(k=>k.position),
  [v(1,0,0),v(3,1,0),v(7,2,0)]);
 assert.deepEqual(pathComponent.knots.map(k=>k.handleOut),
  original.map(k=>k.handleOut));
 assert.deepEqual(pathComponent.knots.map(k=>k.rollDegrees),
  original.map(k=>k.rollDegrees));
 // Emulate a native history restore; all group coordinates revert together.
 pathComponent.knots=history.pop();
 scene.methods.refreshV2Path('path');
 assert.equal(JSON.stringify(pathComponent.knots),before);
 assert.equal(writes.length,1,'Undo is not a separate write in this contract');
 writes=[];
 mutateBeforeQuery=true;
 const stale=await main.methods.nudgeV2PathGroup('x+');
 assert.equal(stale.ok,false);
 assert.match(stale.error,/changed since/);
 assert.equal(writes.length,0,'Stale validation must fail before recording history');
 pathComponent.knots=copy(original);
 selected=[];
 const empty=await main.methods.nudgeV2PathGroup('x+');
 assert.equal(empty.ok,false);
 assert.equal(writes.length,0);
 assert.equal(scene.methods.planV2PathGroupNudge('missing','x+').ok,false);
 console.log('GROUP NUDGE EDITOR FLOW PASS: typed one-step Creator Undo, group rebind, no-op read, stale preflight, empty selection');
}finally{Module._load=oldLoad;globalThis.Editor=oldEditor;}
})().catch(e=>{console.error(e);process.exitCode=1;});
