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
const pathComponent={
  className:'SplinesV2.SplinePath',knots:[{position:{x:0,y:0,z:0}},{position:{x:0,y:0,z:5}}],
  gizmoKnotIndex:0,
  editKnot(operation,index){
    if(operation==='add'){this.knots.push({position:{x:0,y:0,z:10}});}
    else if(operation==='remove'){if(this.knots.length<=2)throw Error('Spline requires at least two Knots');this.knots.splice(index,1);}
    else if(operation==='duplicate')this.knots.splice(index+1,0,{...this.knots[index]});
    this.gizmoKnotIndex=this.knots.length-1;
    return this.gizmoKnotIndex;
  }
};
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
  'editV2Path','inspectV2RoadBake','prepareV2RoadBake',
  'rebuildV2Road','restoreV2RoadBaked']);
 assert.equal(scene.methods.rebuildV2Road('road-node').ok,true);
 assert.equal(road.preview,1);
 assert.equal(scene.methods.prepareV2RoadBake('road-node').componentIndex,0);
 assert.equal(scene.methods.inspectV2RoadBake('road-node').fingerprint,'abcd');
 assert.equal(scene.methods.restoreV2RoadBaked('road-node').ok,true);
 assert.equal(road.restore,1);
 assert.equal(scene.methods.rebuildV2Road('missing').ok,false);
 assert.equal(scene.methods.editV2Path('path-node','add',0).ok,true);
 assert.equal(pathComponent.knots.length,3);
 assert.equal(scene.methods.editV2Path('path-node','select',1).index,1);
 assert.equal(scene.methods.editV2Path('path-node','remove',2).ok,true);
 assert.equal(scene.methods.editV2Path('path-node','remove',1).ok,false);
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
      if(channel==='scene'&&method==='set-property')return true;
      if(channel==='asset-db'&&method==='query-asset-info')
       return {uuid:'existing-gltf'};
      throw Error('Unexpected Editor operation '+channel+':'+method);
   }}
  };
  assert.deepEqual(Object.keys(main.methods).sort(),[
   'bakeV2Road','bindV2RoadMesh','checkV2RoadBake','editV2Path',
   'rebuildV2Road','restoreV2RoadBaked']);
  assert.equal((await main.methods.rebuildV2Road()).ok,true);
  assert.equal((await main.methods.checkV2RoadBake()).ok,true);
  assert.equal((await main.methods.restoreV2RoadBaked()).ok,true);
  selectedUuid='path-node';
  assert.equal((await main.methods.editV2Path('add',0)).ok,true);
  assert.equal((await main.methods.editV2Path('select',1)).ok,true);
  assert.equal((await main.methods.editV2Path('remove',2)).ok,true);
  assert.equal((await main.methods.editV2Path('remove',1)).ok,false);
  assert.equal((await main.methods.editV2Path('bogus',0)).ok,false);
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
}finally{
 fs.rmSync(path.join(root,'test-build'),{recursive:true,force:true});
}
console.log('V2 CLEAN BREAKING BUNDLE PASS: only new scripts, inspectors, meta and Scene actions.');
})().catch(e=>{console.error(e);process.exitCode=1;});
