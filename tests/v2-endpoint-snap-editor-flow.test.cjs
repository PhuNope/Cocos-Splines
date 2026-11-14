'use strict';
/** Editor main <-> Scene contract for Pure Vec3 endpoint snap (Cocos mocks). */
const assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const clone=x=>JSON.parse(JSON.stringify(x));
const v=(x,y,z)=>({x,y,z});
const knot=p=>({position:p,mode:2,handleIn:v(-2,0,0),
 handleOut:v(2,0,1),tension:.3,rollDegrees:27});
const wrap=(type,value)=>({type,value});
const typedKnot=k=>wrap('SplinesV2.Knot',{
 position:wrap('cc.Vec3',clone(k.position)),mode:wrap('Enum',k.mode),
 handleIn:wrap('cc.Vec3',clone(k.handleIn)),
 handleOut:wrap('cc.Vec3',clone(k.handleOut)),
 tension:wrap('Float',k.tension),rollDegrees:wrap('Float',k.rollDegrees),
 custom:wrap('String','keep-me')});
const paths=[];
const roadNodes=[];
for(let i=0;i<3;i++){
 const pathComponent={className:'SplinesV2.SplinePath',
  knots:[knot(v(i+1,0,i)),knot(v(10+i,0,20+i))],restores:0,
  onRestore(){this.restores++;}};
 const pathNode={uuid:'path-'+i,components:[{className:'cc.Node'},pathComponent],children:[]};
 const road={className:'SplinesV2.SplineRoad',pathSource:pathComponent,
  previews:0,bakedMesh:{uuid:'asset-'+i},
  rebuildPreview(){this.previews++;}};
 pathComponent.node=pathNode;
 paths.push(pathNode);
 roadNodes.push({uuid:'road-'+i,components:[road],children:[]});
}
const original=paths.map(n=>clone(n.components[1].knots));
const ends=[false,true,false];
const junction={className:'SplinesV2.JunctionPatch',previews:0,
 branches:roadNodes.map((n,i)=>({road:n.components[0],atEnd:ends[i]})),
 rebuildPreview(){this.previews++;},
 inspectRoadNetworkV2(){return {roadCount:3,hubCount:1,hubs:[]};},
 planEndpointSnapsV2(){
  return {center:v(0,0,0),maxDistance:1,branches:paths.map((n,i)=>{
   const knots=n.components[1].knots,atEnd=ends[i],knotIndex=atEnd?1:0;
   return {pathUuid:n.uuid,roadId:'road-'+i,atEnd,
    knotCount:knots.length,knotIndex,
    expectedLocal:clone(knots[knotIndex].position),targetLocal:v(0,0,0),
    distance:1,changed:true};
  })};
 }};
const junctionNode={uuid:'junction',components:[junction],children:[]};
const sceneNode={uuid:'root',components:[],children:[junctionNode,...roadNodes,...paths]};
const origLoad=Module._load;
Module._load=function(id,parent,isMain){
 if(id==='cc')return {director:{getScene:()=>sceneNode},
  js:{getClassName:c=>c.className}};
 return origLoad.call(this,id,parent,isMain);
};
let oldEditor=globalThis.Editor;
const history=[],committed=[];
let rejectAfter=-1,staleOnce=false;
const dumped=node=>({__comps__:[{type:'cc.Node',value:{}},
 {type:'SplinesV2.SplinePath',value:{
  knots:{type:'Array',isArray:true,
   elementTypeData:typedKnot(knot(v(0,0,0))),
   value:node.components[1].knots.map(typedKnot)},
  interpolation:wrap('Enum',1),gizmoKnotIndex:wrap('Integer',0)}}]});
(async()=>{
try{
 const scene=require(path.join(root,'src/v2/clean-scene.js'));
 let selected='junction';
 globalThis.Editor={Selection:{getSelected:()=>[selected]},
  Message:{request:async(channel,method,payload)=>{
   if(channel==='scene'&&method==='execute-scene-script')
    return scene.methods[payload.method](...payload.args);
   if(channel==='scene'&&method==='query-node'){
    const n=paths.find(p=>p.uuid===payload);
    assert(n,'Unexpected Path query');
    if(staleOnce){staleOnce=false;n.components[1].knots[0].position.x+=.5;}
    return dumped(n);
   }
   if(channel==='scene'&&method==='set-property'){
    assert.equal(payload.record,true);
    assert.match(payload.path,/^__comps__\.1\.knots$/);
    if(rejectAfter>=0&&committed.length>=rejectAfter)return false;
    const n=paths.find(p=>p.uuid===payload.uuid);
    assert(n);
    history.push({node:n,knots:clone(n.components[1].knots)});
    const previous=clone(n.components[1].knots);
    n.components[1].knots=payload.dump.value.map((typed,j)=>({
     ...previous[j],position:clone(typed.value.position.value)
    }));
    committed.push(payload.uuid);
    return true;
   }
   throw Error('Unexpected Editor operation '+channel+' '+method);
  }}};
 const main=require(path.join(root,'src/v2/clean-main.js'));
 assert.equal((await main.methods.inspectV2RoadNetwork()).report.hubCount,1);
 const checked=await main.methods.planV2JunctionEndpointSnap();
 assert.equal(checked.ok,true);assert.equal(checked.plan.branches.length,3);
 assert.deepEqual(paths.map(n=>n.components[1].knots),original,
  'Check must not touch serialized Knot records');
 const applied=await main.methods.applyV2JunctionEndpointSnap();
 assert.equal(applied.ok,true);assert.equal(applied.changed,3);
 assert.equal(history.length,3);
 assert(paths.every((n,i)=>n.components[1].restores===1));
 assert(junction.previews>=1);
 for(let i=0;i<3;i++){
  const p=paths[i].components[1].knots;
  assert.deepEqual(p[ends[i]?1:0].position,v(0,0,0));
  assert.deepEqual(p[ends[i]?0:1],original[i][ends[i]?0:1]);
  assert.deepEqual(p[ends[i]?1:0].handleIn,original[i][ends[i]?1:0].handleIn);
  assert.equal(p[ends[i]?1:0].rollDegrees,27);
  assert.equal(roadNodes[i].components[0].bakedMesh.uuid,'asset-'+i);
 }
 assert.equal((await main.methods.applyV2JunctionEndpointSnap()).changed,0);
 assert.equal(history.length,3,'No-op cannot create extra native Undo events');
 // Simulated Ctrl+Z in reverse commit order restores serialized values.
 for(const item of [...history].reverse())item.node.components[1].knots=item.knots;
 assert.deepEqual(paths.map(n=>n.components[1].knots),original);
 history.length=0;committed.length=0;
 staleOnce=true;
 const rejected=await main.methods.applyV2JunctionEndpointSnap();
 assert.equal(rejected.ok,false);
 assert.match(rejected.error,/changed since/);
 assert.equal(history.length,0,'All Path dumps preflight before writes');
 paths[0].components[1].knots=clone(original[0]);
 history.length=0;committed.length=0;rejectAfter=1;
 const partial=await main.methods.applyV2JunctionEndpointSnap();
 assert.equal(partial.ok,false);
 assert.match(partial.error,/1 Path edits were recorded/);
 assert.equal(history.length,1,'Partial failure remains individually Undoable');
 console.log('V2 ENDPOINT SNAP EDITOR FLOW PASS: Check, Apply, no-op, typed Knot preservation, multi-Path history, preflight, partial failure, Baked safety');
}finally{
 Module._load=origLoad;globalThis.Editor=oldEditor;
}
})().catch(e=>{console.error(e);process.exitCode=1;});
