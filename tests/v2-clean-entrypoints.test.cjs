'use strict';
/**
 * Breaking v2 bundle smoke: new Editor main/Scene entrypoints must NOT load
 * legacy SplineContainer or include legacy asset metadata.
 */
const assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const main=require(path.join(root,'src/v2/clean-main.js'));
const calls=[];
const road={
  className:'SplinesV2.SplineRoad',
  preview:0,restore:0,
  pendingBakeUrl:'',pendingBakeFingerprint:'',
  rebuildPreview(){this.preview++;},
  restoreBakedPreview(){this.restore++;},
  prepareBake(){return {content:'{"asset":{"version":"2.0"}}',fingerprint:'abcd',primitiveCount:1};},
  inspectBake(){return {stale:true,hasMesh:false,url:'',fingerprint:'abcd'};},
  inspectCornerRisk(){return null;},
  getShortKnotFallback(){return null;}
};
const node={uuid:'road-node',components:[road],children:[]};
const knot=(x,y,z)=>({position:{x,y,z},mode:0,
  handleIn:{x:-1,y:0,z:0},handleOut:{x:1,y:0,z:0},tension:0,rollDegrees:0});
const pathComponent={
  className:'SplinesV2.SplinePath',
  knots:[knot(0,0,0),knot(0,0,5)],gizmoKnotIndex:0,restores:0,
  onRestore(){this.restores++;}
};
const wrap=(type,value)=>({type,value});
const knotDump=k=>wrap('SplinesV2.Knot',{position:wrap('cc.Vec3',k.position),
  mode:wrap('Enum',k.mode),handleIn:wrap('cc.Vec3',k.handleIn),
  handleOut:wrap('cc.Vec3',k.handleOut),tension:wrap('Float',k.tension),
  rollDegrees:wrap('Float',k.rollDegrees)});
const nodeDump=()=>({__comps__:[
 {type:'cc.MeshRenderer',value:{}},
 {type:'SplinesV2.SplinePath',value:{
  interpolation:wrap('Enum',3),
  gizmoKnotIndex:wrap('Integer',pathComponent.gizmoKnotIndex),
  knots:{type:'Array',isArray:true,elementTypeData:knotDump(knot(0,0,0)),
    value:pathComponent.knots.map(knotDump)}
 }}]});
const updates=[];

const pathNode={uuid:'path-node',components:[pathComponent],children:[]};
const sceneNode={uuid:'scene',components:[],children:[node,pathNode]};
const originalLoad=Module._load;
Module._load=function(id,parent,isMain){
    if(id==='cc')return {
        director:{getScene:()=>sceneNode},
        js:{getClassName:component=>component.className}
    };
    return originalLoad.call(this,id,parent,isMain);
};
(async()=>{
try{
 const scene=require(path.join(root,'src/v2/clean-scene.js'));
 const keys=Object.keys(scene.methods).sort();
 assert.deepEqual(keys,[
  'inspectV2RoadBake','planV2JunctionAutoTrim','prepareV2RoadBake','rebuildV2Road',
  'refreshV2JunctionAutoTrim','refreshV2Path','restoreV2RoadBaked']);
 assert.equal(scene.methods.rebuildV2Road('road-node').ok,true);
 assert.equal(road.preview,1);
 assert.equal(scene.methods.prepareV2RoadBake('road-node').componentIndex,0);
 assert.equal(scene.methods.inspectV2RoadBake('road-node').fingerprint,'abcd');
 assert.equal(scene.methods.restoreV2RoadBaked('road-node').ok,true);
 assert.equal(road.restore,1);
 assert.equal(scene.methods.rebuildV2Road('missing').ok,false);
 assert.equal(scene.methods.refreshV2Path('path-node').ok,true);
 assert.equal(pathComponent.restores,1);
 assert.equal(scene.methods.refreshV2Path('missing').ok,false);
 assert.equal(pathComponent.knots.length,2,
   'Scene refresh must never mutate serialized Knot geometry');
 const oldEditor=globalThis.Editor;
 let selectedUuid='road-node';
 try{
  globalThis.Editor={
   Selection:{getSelected:()=>[selectedUuid]},
   Message:{request:async(channel,method,payload)=>{
      calls.push({channel,method,payload});
      if(channel==='scene'&&method==='execute-scene-script')
       return scene.methods[payload.method](...payload.args);
      if(channel==='scene'&&method==='snapshot')return true;
      if(channel==='scene'&&method==='query-node'){
        if(payload!=='path-node')throw Error('Wrong dump target');
        return nodeDump();
      }
      if(channel==='scene'&&method==='set-property'){
        updates.push(payload);
        if(payload.uuid==='path-node'&&payload.path==='__comps__.1.knots'){
          assert.equal(payload.record,true);
          pathComponent.knots=payload.dump.value.map(entry=>({
            position:{...entry.value.position.value},
            mode:entry.value.mode.value,
            handleIn:{...entry.value.handleIn.value},
            handleOut:{...entry.value.handleOut.value},
            tension:entry.value.tension.value,
            rollDegrees:entry.value.rollDegrees.value
          }));
        }else if(payload.uuid==='path-node'&&
                  payload.path==='__comps__.1.gizmoKnotIndex'){
          assert.equal(payload.record,false);
          pathComponent.gizmoKnotIndex=payload.dump.value;
        }
        return true;
      }
      if(channel==='asset-db'&&method==='query-asset-info')
       return {uuid:'existing-gltf'};
      throw Error('Unexpected Editor operation '+channel+':'+method);
   }}
  };
  assert.deepEqual(Object.keys(main.methods).sort(),[
   'applyV2JunctionAutoTrim','bakeV2Road','bindV2RoadMesh','checkV2RoadBake','editV2Path',
   'planV2JunctionAutoTrim','rebuildV2Road','restoreV2RoadBaked']);
  assert.equal((await main.methods.rebuildV2Road()).ok,true);
  assert.equal((await main.methods.checkV2RoadBake()).ok,true);
  assert.equal((await main.methods.restoreV2RoadBaked()).ok,true);
  selectedUuid='path-node';
  const before=JSON.stringify(pathComponent.knots);
  const previousRestoreCount=pathComponent.restores;
  assert.equal((await main.methods.editV2Path('add',0)).ok,true);
  assert.equal(pathComponent.knots.length,3);
  assert.equal(pathComponent.knots[2].position.z,10);
  assert.equal((await main.methods.editV2Path('select',1)).ok,true);
  assert.equal(pathComponent.gizmoKnotIndex,1);
  assert.equal((await main.methods.editV2Path('duplicate',1)).ok,true);
  assert.equal(pathComponent.knots.length,4);
  assert.equal((await main.methods.editV2Path('up',2)).ok,true);
  assert.equal((await main.methods.editV2Path('down',1)).ok,true);
  assert.equal((await main.methods.editV2Path('remove',3)).ok,true);
  assert.equal((await main.methods.editV2Path('remove',2)).ok,true);
  assert.equal(pathComponent.knots.length,2);
  assert.equal((await main.methods.editV2Path('remove',1)).ok,false);
  assert.equal((await main.methods.editV2Path('bogus',0)).ok,false);
  assert.equal(JSON.stringify(pathComponent.knots),before);
  assert.equal(updates.filter(v=>v.path.endsWith('.knots')).length,6);
  assert(updates.filter(v=>v.path.endsWith('.knots')).every(v=>v.record),
    'Creator records all Knot array mutations as editable Undo entries');
  assert(updates.filter(v=>v.path.endsWith('.gizmoKnotIndex')).every(v=>!v.record),
    'Changing active editor selection is not a separate undoable change');
  assert(pathComponent.restores>previousRestoreCount,
    'Each edit asks Scene to resynchronize generator previews');
  selectedUuid='road-node';
  assert(calls.filter(c=>c.method==='execute-scene-script').every(c=>
   !/Splines\.Spline/.test(JSON.stringify(c.payload))),
   'Clean Editor must not request a legacy Component');
 }finally{globalThis.Editor=oldEditor;}
}finally{Module._load=originalLoad;}

// Test actual staging, not only the source code. No old UUID/meta file is
// needed for the extension that a user installs from GitHub Actions.
try{
 const out=cp.execFileSync(process.execPath,
  [path.join(root,'scripts/pack-v2-test.cjs')],{
   cwd:root,encoding:'utf8',
   env:{...process.env,GITHUB_SHA:'f'.repeat(40)}
  });
 assert.match(out,/CLEAN V2 TEST PACKAGE PASS/);
 const installed=path.join(root,'test-build/cocos-splines');
 const pkg=JSON.parse(fs.readFileSync(path.join(installed,'package.json'),'utf8'));
 assert.equal(pkg.main,'./dist/v2/clean-main.js');
 assert.equal(pkg.contributions.scene.script,'./dist/v2/clean-scene.js');
 assert(!fs.existsSync(path.join(installed,'assets/splines')));
 assert(!fs.existsSync(path.join(installed,'assets/splines.meta')));
 assert(!fs.existsSync(path.join(installed,'dist/main.js')));
 assert(!fs.existsSync(path.join(installed,'dist/scene.js')));
 assert.equal(Object.keys(pkg.contributions.inspector.section.node).length,5);
 assert(pkg.contributions.inspector.section.node['SplinesV2.SplinePath'].includes('PathV2.js'));
 assert(pkg.contributions.messages['edit-v2-path']);
 assert.equal(pkg.contributions.menu,undefined);
 assert(!JSON.stringify(pkg).includes('Splines.SplineContainer'));
 assert(fs.existsSync(path.join(installed,'assets/splines-v2/Components/SplinePathV2.ts')));
 assert(fs.existsSync(path.join(installed,'dist/contributions/inspector/PathV2.js')));
 assert(fs.existsSync(path.join(installed,'dist/v2/EditorAssetBind.js')));
 assert(fs.existsSync(path.join(installed,'dist/v2/PathV2Dump.js')));
}finally{
 fs.rmSync(path.join(root,'test-build'),{recursive:true,force:true});
}
console.log('V2 CLEAN BREAKING BUNDLE PASS: only new scripts, inspectors, meta and Scene actions.');
})().catch(e=>{console.error(e);process.exitCode=1;});
