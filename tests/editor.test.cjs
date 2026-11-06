'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const calls=[];
let next=0,current=[];
const splineData={found:true,rootUuid:'spline-1',rootName:'Spline',parentUuid:'parent-1',closed:false,reversed:false,containerIndex:0,knots:[
 {uuid:'knot-a',name:'A',position:{x:0,y:0,z:0},mode:4,tension:.33,tangentIn:{x:-1,y:0,z:0},tangentOut:{x:1,y:0,z:0}},
 {uuid:'knot-b',name:'B',position:{x:3,y:0,z:0},mode:4,tension:.33,tangentIn:{x:-1,y:0,z:0},tangentOut:{x:1,y:0,z:0}},
 {uuid:'knot-c',name:'C',position:{x:5,y:0,z:0},mode:4,tension:.33,tangentIn:{x:-1,y:0,z:0},tangentOut:{x:1,y:0,z:0}},
]};
global.Editor={
 Selection:{getSelected(){return current;},clear(){current=[];calls.push(['selection','clear']);},select(_,uuid){current.push(uuid);calls.push(['selection','select',uuid]);}},
 Message:{request:async(pkg,method,...args)=>{
    calls.push([pkg,method,...args]);
    if(pkg==='scene'){
      if(method==='query-component-has-script')return true;
      if(method==='create-node')return 'node-'+(++next);
      if(method==='set-property')return true;
      if(method==='query-node')return {__comps__:[{type:'Splines.SplineKnot',value:{mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},tangentOut:{type:'cc.Vec3'},tension:{type:'Float'}}}]};
      if(method==='execute-scene-script'){
        switch(args[0].method){
          case 'querySpline':return splineData;
          case 'describeSplit':return {ok:true,rootUuid:'spline-1',firstUuid:'knot-a',lastUuid:'knot-b',split:{
            before:{tangentIn:{x:-1,y:0,z:0},tangentOut:{x:.5,y:0,z:0}},
            middle:{position:{x:1.5,y:0,z:0},tangentIn:{x:-.5,y:0,z:0},tangentOut:{x:.5,y:0,z:0}},
            after:{tangentIn:{x:-.5,y:0,z:0},tangentOut:{x:1,y:0,z:0}}
          }};
          case 'placeAfter':return {ok:true};
          case 'moveKnot':return {ok:true};
          case 'refreshPreview':return {ok:true};
          case 'rebuildRoad':return {ok:true,rebuilds:1};
          case 'queryAnimate':return {found:true,componentIndex:2,previewInEditor:false};
          case 'previewAnimate':return {ok:true};
          case 'restoreAnimate':return {ok:true};
          case 'spawnPrefabs':return {ok:true,changed:true,count:3,message:'Spawned 3 prefabs'};
        }
      }
    }
    return undefined;
 }}
};
const ext=require(path.resolve(__dirname,'../dist/main.js')).methods;
(async()=>{
  let r=await ext.createSpline();assert(r.ok,r.error);
  assert.equal(calls.filter(c=>c[1]==='create-node').length,5);
  assert.equal(calls.filter(c=>c[1]==='create-component').length,6);
  assert.equal(calls.filter(c=>c[1]==='snapshot').length,1);
  current=['spline-1'];
  r=await ext.addKnot();assert(r.ok,r.error);
  assert.deepEqual(current,['spline-1'],'AddKnot stays on Container Inspector');
  r=await ext.setKnotField('knot-a','position',{x:1,y:2,z:3});assert(r.ok,r.error);
  const pos=calls.filter(c=>c[1]==='set-property').at(-1)[2];
  assert.equal(pos.path,'position');assert.equal(pos.record,true);
  r=await ext.setKnotField('knot-a','tangentOut',{x:1,y:0,z:3});assert(r.ok,r.error);
  const tangent=calls.filter(c=>c[1]==='set-property').at(-1)[2];
  assert.equal(tangent.path,'__comps__.0.tangentOut');assert.equal(tangent.record,true);
  r=await ext.setKnotField('knot-a','mode',2);assert(r.ok,r.error);
  r=await ext.setKnotField('knot-a','tension',.5);assert(r.ok,r.error);
  r=await ext.setKnotField('knot-a','position',{x:Infinity,y:0,z:0});assert.equal(r.ok,false);
  r=await ext.setKnotField('bad-knot','tension',1);assert.equal(r.ok,false);
  r=await ext.setKnotField('knot-a','__proto__',1);assert.equal(r.ok,false);
  r=await ext.selectKnotId('knot-b');assert(r.ok);assert.deepEqual(current,['knot-b']);
  assert(calls.some(c=>c[0]==='selection'&&c[1]==='clear')); 
  r=await ext.selectContainer();assert(r.ok);assert.deepEqual(current,['spline-1']);
  r=await ext.splitAfterKnot('knot-a');assert(r.ok,r.error);
  assert(calls.some(c=>c[1]==='execute-scene-script'&&c[2].method==='placeAfter'));
  assert(calls.some(c=>c[1]==='set-property'&&c[2].dump.value===4&&c[2].path.endsWith('.mode')));
  assert.deepEqual(current,['spline-1']);
  r=await ext.moveKnotId('knot-b','down');assert(r.ok);
  r=await ext.reverseDirection();assert(r.ok);
  assert(calls.some(c=>c[1]==='set-property'&&c[2].path==='__comps__.0.reversed'&&c[2].dump.value===true));
  r=await ext.deleteKnotId('knot-b');assert(r.ok);assert(calls.some(c=>c[1]==='remove-node'&&c[2].uuid==='knot-b'));
  current=['anim-node'];
  r=await ext.previewAnimate();assert(r.ok,r.error);
  assert(calls.some(c=>c[1]==='set-property'&&c[2]?.path==='__comps__.2.previewInEditor'&&c[2]?.dump.value===true));
  r=await ext.stopPreviewAnimate();assert(r.ok,r.error);
  current=['spawner-node'];
  const oldSnapshots=calls.filter(x=>x[1]==='snapshot').length;
  r=await ext.spawnPrefabs('instantiate','spawn');assert(r.ok,r.error);
  r=await ext.spawnPrefabs('objectController','respawn');assert(r.ok,r.error);
  assert.equal(calls.filter(x=>x[1]==='snapshot').length,oldSnapshots+2,'Scene mutations require undo/snapshot');
  assert(calls.some(x=>x[1]==='execute-scene-script'&&x[2].method==='spawnPrefabs'&&x[2].args[1]==='objectController'));
  assert.equal(require(path.resolve(__dirname,'../package.json')).contributions.messages['spawn-prefabs'].methods[0],'spawnPrefabs');
  const payload=JSON.stringify({closed:true,knots:[
    {position:[0,0,0],tangentIn:[-1,0,0],tangentOut:[1,0,0],mode:4},
    {position:[4,0,0],tangentIn:[-1,0,0],tangentOut:[1,0,0],mode:4}
  ]});
  current=['spline-1'];
  r=await ext.importJSON(payload);assert(r.ok,r.error);assert.equal(r.knots,2);
  assert(calls.some(c=>c[1]==='create-node'&&c[2]?.parent==='parent-1'));
  // Road / trigger / junction can be created without a standalone Editor panel.
  current=['spline-1'];
  r=await ext.createRoad();assert(r.ok,r.error);
  const roadId=r.uuid;assert.deepEqual(current,[roadId]);
  assert(calls.some(c=>c[1]==='create-component'&&c[2].component==='Splines.SplineRoad'));
  assert(calls.some(c=>c[1]==='execute-scene-script'&&c[2].method==='rebuildRoad'));
  r=await ext.rebuildRoad();assert(r.ok,r.error);
  current=['spline-1'];
  r=await ext.createTrigger();assert(r.ok,r.error);
  assert(calls.some(c=>c[1]==='create-component'&&c[2].component==='Splines.SplineTrigger'));
  current=['spline-1'];
  r=await ext.createJunction();assert(r.ok,r.error);
  assert(calls.some(c=>c[1]==='create-node'&&c[2].parent==='parent-1'));
  assert(calls.some(c=>c[1]==='create-component'&&c[2].component==='Splines.SplineJunction'));
  current=[];
  r=await ext.createRoadSpline();assert(r.ok,r.error);
  assert(calls.some(c=>c[1]==='create-node'&&c[2].name==='Road Spline'));
    r=await ext.importJSON('{"knots":[]}');assert.equal(r.ok,false);
  console.log('EDITOR MOCK PASS: inline knot edits, undo flags, navigation, preview messages, import, validation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
