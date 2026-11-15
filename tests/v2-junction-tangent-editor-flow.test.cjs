'use strict';
/** Mock Creator Editor + Scene end-to-end tangent authoring contract. */
const assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),copy=x=>JSON.parse(JSON.stringify(x));
const vec=(x,y,z)=>({x,y,z}),wrap=(type,value)=>({type,value});
const knot=(position,mode,handleIn,handleOut,rollDegrees=25)=>({
 position,mode,handleIn,handleOut,rollDegrees,tension:.2
});
const typed=k=>wrap('Spline.Knot',{
 position:wrap('cc.Vec3',copy(k.position)),mode:wrap('Enum',k.mode),
 handleIn:wrap('cc.Vec3',copy(k.handleIn)),
 handleOut:wrap('cc.Vec3',copy(k.handleOut)),
 rollDegrees:wrap('Float',k.rollDegrees),tension:wrap('Float',k.tension),
 custom:wrap('String','keep')
});
const paths=[];
const roadNodes=[];
const ends=[false,true,false],handles=[
 vec(2,0,0),vec(0,0,-2),vec(-1,0,0)];
for(let i=0;i<3;i++){
 const mode=i===0?1:i===1?2:0;
 const record={
  className:'Spline.Path',restores:0,
  interpolation:1,closed:false,
  knots:[knot(vec(0,0,0),ends[i]?1:mode,vec(-1,0,0),vec(0,0,2)),
   knot(vec(12,0,5),ends[i]?mode:1,vec(-1,0,0),vec(1,0,0))],
  onRestore(){this.restores++;}
 };
 const node={uuid:'path-'+i,components:[record],children:[]};
 paths.push(node);record.node=node;
 roadNodes.push({uuid:'road-'+i,children:[],components:[{
  className:'Spline.Road',pathSource:record,
  rebuilds:0,bakedMesh:{uuid:'mesh-'+i},
  rebuildPreview(){this.rebuilds++;}
 }]});
}
const original=paths.map(p=>copy(p.components[0].knots));
const junction={className:'Spline.Junction',
 previews:0,bakedMesh:{uuid:'junction-asset'},
 branches:roadNodes.map((r,i)=>({road:r.components[0],atEnd:ends[i]})),
 rebuildPreview(){this.previews++;},planEndpointSnaps(){return {};},
 planTangentAlignment(){
  const branches=paths.map((node,i)=>{
   const record=node.components[0],atEnd=ends[i],index=atEnd?1:0;
   const k=record.knots[index],side=atEnd?'in':'out',active=atEnd?k.handleIn:k.handleOut;
   const target=handles[i],changed=i!==2&&
    (JSON.stringify(active)!==JSON.stringify(target)||k.mode!==1);
   return {pathUuid:node.uuid,pathId:node.uuid,
    roadId:roadNodes[i].uuid,knotIndex:index,knotCount:2,
    handleSide:side,expectedPosition:copy(k.position),
    expectedHandle:copy(active),expectedMode:k.mode,
    targetLocalHandle:changed?target:copy(active),
    targetMode:changed?1:k.mode,changed};
  });
  return {center:vec(0,0,0),changedCount:branches.filter(b=>b.changed).length,branches};
 }
};
const sceneNode={uuid:'scene',components:[],children:[
 {uuid:'junction',components:[junction],children:[]},...roadNodes,...paths]};
const oldLoad=Module._load;
Module._load=function(id,parent,isMain){
 if(id==='cc')return {director:{getScene:()=>sceneNode},
  js:{getClassName:c=>c.className}};
 return oldLoad.call(this,id,parent,isMain);
};
const oldEditor=globalThis.Editor,history=[],writes=[];
let failAfter=-1,mutateBeforeQuery=false;
const nodeDump=node=>({__comps__:[{type:'Spline.Path',value:{
 interpolation:wrap('Enum',1),closed:wrap('Boolean',false),
 gizmoKnotIndex:wrap('Integer',0),
 knots:{type:'Array',value:node.components[0].knots.map(typed),
  elementTypeData:typed(node.components[0].knots[0])}
 }}]});
(async()=>{
try{
 const scene=require(path.join(root,'src/v2/clean-scene.js'));
 globalThis.Editor={
  Selection:{getSelected:()=>['junction']},
  Message:{request:async(channel,method,payload)=>{
   if(channel==='scene'&&method==='execute-scene-script')
    return scene.methods[payload.method](...payload.args);
   if(channel==='scene'&&method==='query-node'){
    const node=paths.find(p=>p.uuid===payload);assert(node);
    if(mutateBeforeQuery){mutateBeforeQuery=false;
     node.components[0].knots[0].position.x+=.2;}
    return nodeDump(node);
   }
   if(channel==='scene'&&method==='set-property'){
    assert.equal(payload.record,true);
    if(failAfter>=0&&writes.length>=failAfter)return false;
    const node=paths.find(p=>p.uuid===payload.uuid);assert(node);
    assert.equal(payload.path,'__comps__.0.knots');
    history.push({node,prior:copy(node.components[0].knots)});
    const prior=node.components[0].knots;
    node.components[0].knots=payload.dump.value.map((k,i)=>({
     ...prior[i],mode:k.value.mode.value,
     handleIn:copy(k.value.handleIn.value),
     handleOut:copy(k.value.handleOut.value)
    }));
    writes.push(payload.uuid);return true;
   }
   throw Error('Unexpected request '+channel+':'+method);
  }}
 };
 const main=require(path.join(root,'src/v2/clean-main.js'));
 const checked=await main.methods.planV2JunctionTangents();
 assert.equal(checked.ok,true);assert.equal(checked.plan.changedCount,2);
 assert.deepEqual(paths.map(p=>p.components[0].knots),original,
  'Read-only Check must not mutate authored Knot records');
 const applied=await main.methods.applyV2JunctionTangents();
 assert.equal(applied.ok,true);assert.equal(applied.changed,2);
 assert.deepEqual(writes,['path-0','path-1']);
 assert.equal(junction.previews,1);
 assert.equal(paths[0].components[0].knots[0].mode,1);
 assert.deepEqual(paths[0].components[0].knots[0].handleOut,handles[0]);
 assert.deepEqual(paths[1].components[0].knots[1].handleIn,handles[1]);
 assert.equal(paths[1].components[0].knots[1].mode,1);
 for(let i=0;i<3;i++){
  assert.equal(paths[i].components[0].knots[ends[i]?1:0].rollDegrees,25);
  assert.equal(roadNodes[i].components[0].bakedMesh.uuid,'mesh-'+i);
 }
 assert.equal(junction.bakedMesh.uuid,'junction-asset');
 assert.equal((await main.methods.applyV2JunctionTangents()).changed,0);
 assert.equal(history.length,2,'No-op must not record another Undo event');
 for(const item of [...history].reverse())item.node.components[0].knots=item.prior;
 assert.deepEqual(paths.map(p=>p.components[0].knots),original);
 writes.length=0;history.length=0;
 mutateBeforeQuery=true;
 const stale=await main.methods.applyV2JunctionTangents();
 assert.equal(stale.ok,false);assert.match(stale.error,/changed since/);
 assert.equal(writes.length,0,'All Path dumps validated before editing any');
 paths[0].components[0].knots=copy(original[0]);
 failAfter=1;
 const partial=await main.methods.applyV2JunctionTangents();
 assert.equal(partial.ok,false);
 assert.match(partial.error,/1 Path edits were recorded/);
 assert.equal(writes.length,1);
 console.log('JUNCTION TANGENT EDITOR FLOW PASS: Check, recordable Apply, no-op, 2-Path Undo replay, preflight, partial failure, baked safety');
}finally{Module._load=oldLoad;globalThis.Editor=oldEditor;}
})().catch(e=>{console.error(e);process.exitCode=1;});
