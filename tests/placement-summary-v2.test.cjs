'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),
 path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-placement-summary-v2-'));
async function main(){
 try{
  cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json',
    '--noEmit','false','--outDir',tmp],{stdio:'pipe'});
  const {summarizePlacementDiagnostics,PLACEMENT_REASONS}=
    require(tmp+'/Core/SplinePlacementDiagnostics.js');
  const pt=(index,reason)=>({index,progress:index/9,
    position:{x:index,y:0,z:0},radius:0.25,reason});
  const rows=PLACEMENT_REASONS.map((reason,index)=>pt(index,reason));
  const immutable=JSON.stringify(rows);
  const stats=summarizePlacementDiagnostics(rows);
  assert.equal(stats.total,7);
  assert.equal(stats.accepted,1);
  assert.equal(stats.rejected,6);
  assert.deepEqual(stats.byReason,{
    accepted:1,surface:1,collider:1,peer:1,exclusion:1,density:1,spacing:1,
  });
  assert.deepEqual(stats.examples,{surface:[1],collider:[2],peer:[3],
    exclusion:[4],density:[5],spacing:[6]});
  assert.equal(JSON.stringify(rows),immutable,'Summary must not modify diagnostic plan');
  const many=Array.from({length:2048},(_,index)=>({
    index,progress:index/2047,position:{x:index,y:0,z:0},radius:0,reason:'spacing'
  }));
  const big=summarizePlacementDiagnostics(many);
  assert.equal(big.total,2048);
  assert.equal(big.byReason.spacing,2048);
  assert.deepEqual(big.examples.spacing,[0,1,2],'Return at most three rejected indexes per class');
  const empty=summarizePlacementDiagnostics([]);
  assert.equal(empty.total,0);assert.equal(empty.accepted,0);
  assert.deepEqual(empty.examples.colliDER,undefined);
  assert.throws(()=>summarizePlacementDiagnostics([pt(1,'unknown')]));
  assert.throws(()=>summarizePlacementDiagnostics([pt(2,'spacing'),pt(1,'accepted')]));
  assert.throws(()=>summarizePlacementDiagnostics([pt(1,'accepted'),pt(1,'accepted')]));
  assert.throws(()=>summarizePlacementDiagnostics([{...pt(0,'accepted'),radius:NaN}]));
  assert.throws(()=>summarizePlacementDiagnostics(many.concat(many[0])));
  const registry=new Map();
  const sceneRoot={uuid:'scene',components:[],children:[],isValid:true};
  const component={kind:'Splines.SplineObjectController',enabled:true,
    summarizePlacement:()=>stats};
  const node={uuid:'controller',isValid:true,components:[component],
    children:[],parent:sceneRoot};
  sceneRoot.children.push(node);registry.set('controller',node);
  const cc={director:{getScene:()=>sceneRoot},js:{getClassName:x=>x.kind}};
  const original=Module._load;
  Module._load=function(request,parent,isMain){
    if(request==='cc')return cc;
    if(request==='./SplineExampleScene'&&parent?.filename.endsWith('scene.js'))
      return {queryExampleGalleryScene:()=>({})};
    if(request==='./SplineJunctionScene'&&parent?.filename.endsWith('scene.js'))
      return {createJunctionScene:()=>({})};
    return original.apply(this,arguments);
  };
  const oldEditor=globalThis.Editor;
  try{
   const scene=require(root+'/dist/scene.js');
   assert(typeof scene.methods.queryPlacementSummary==='function');
   assert.deepEqual(scene.methods.queryPlacementSummary('controller'),{ok:true,summary:stats});
   assert.equal(scene.methods.queryPlacementSummary('missing').ok,false);
   component.enabled=false;
   assert.equal(scene.methods.queryPlacementSummary('controller').ok,false);
   component.enabled=true;
   component.summarizePlacement=()=>{throw Error('Physics readback unavailable');};
   const failed=scene.methods.queryPlacementSummary('controller');
   assert.equal(failed.ok,false);
   assert.match(failed.error,/Physics readback unavailable/);
   component.summarizePlacement=()=>({total:2050,accepted:1});
   assert.equal(scene.methods.queryPlacementSummary('controller').ok,false);
   component.summarizePlacement=()=>stats;
   const calls=[];
   let selected='controller';
   globalThis.Editor={
    Selection:{getSelected:()=>selected?[selected]:[]},
    Message:{request:async (...args)=>{
     calls.push(args);
     if(args[0]==='cocos-splines'&&args[1]==='query-placement-summary')
      return extension.methods.queryPlacementSummary();
     if(args[0]==='scene'&&args[1]==='execute-scene-script'){
      const payload=args[2];
      assert.equal(payload.name,'cocos-splines');
      return scene.methods[payload.method](...payload.args);
     }
     throw Error('Read-only placement query must not invoke other Scene operations.');
    }}
   };
   const extension=require(root+'/dist/main.js');
   const result=await extension.methods.queryPlacementSummary();
   assert.deepEqual(result,{ok:true,summary:stats});
   assert.equal(calls.length,1,'One read-only Scene request');
   assert.equal(calls[0][2].method,'queryPlacementSummary');
   assert.deepEqual(calls[0][2].args,['controller']);
   selected='';
   assert.equal((await extension.methods.queryPlacementSummary()).ok,false);
   assert.equal(calls.length,1,'No request without selection');
   selected='controller';
   const panel=require(root+'/dist/contributions/inspector/ObjectController.js');
   assert.match(panel.template,/spl-placement-analyze/);
   assert.match(panel.template,/spl-placement-results/);
   const control=(id)=>({
    id,disabled:false,textContent:'',className:'',
    addEventListener(name,fn){this.events??={};this.events[name]=fn;}
   });
   const ui={$:{
    spawn:control('spawn'),respawn:control('respawn'),
    clearSpawned:control('clearSpawned'),
    placementAnalyze:control('placementAnalyze'),
    placementSummary:control('placementSummary'),
    status:control('status'),
   }};
   panel.ready.call(ui);
   assert(ui.$.placementAnalyze.events.click);
   await ui.$.placementAnalyze.events.click();
   assert.match(ui.$.placementSummary.textContent,/Total: 7/);
   assert.match(ui.$.placementSummary.textContent,/Accepted: 1/);
   assert.match(ui.$.placementSummary.textContent,/Rejected: 6/);
   assert.match(ui.$.placementSummary.textContent,/Surface: 1/);
   assert.match(ui.$.placementSummary.textContent,/Spacing: 1/);
   assert.match(ui.$.placementSummary.textContent,/index 6/);
   assert.equal(ui.$.placementAnalyze.disabled,false);
   assert.equal(calls.length,3,'Inspector click uses plugin and read-only Scene query');
   component.summarizePlacement=()=>{throw Error('invalid density');};
   await ui.$.placementAnalyze.events.click();
   assert.match(ui.$.placementSummary.textContent,/invalid density/);
   assert.equal(ui.$.placementAnalyze.disabled,false);
   assert.equal(calls.length,5,'Second click repeats plugin and Scene query without snapshot');
   const {formatPlacementSummary}=require(root+'/dist/contributions/inspector/common.js');
   assert.match(formatPlacementSummary(empty),/Total: 0/);
   assert.throws(()=>formatPlacementSummary({...stats,rejected:99}));
   assert.throws(()=>formatPlacementSummary({...stats,byReason:{...stats.byReason,spacing:NaN}}));
   const unsafe={...stats,examples:{...stats.examples,surface:['<script>']}};
   assert.throws(()=>formatPlacementSummary(unsafe));
   const packageJSON=require(root+'/package.json');
   assert.deepEqual(packageJSON.contributions.messages['query-placement-summary'].methods,
      ['queryPlacementSummary']);
   assert(packageJSON.scripts.test.includes('placement-summary-v2.test.cjs'));
   const source=fs.readFileSync(root+'/src/main.js','utf8');
   const start=source.indexOf('async queryPlacementSummary()');
   assert(start!==-1);
   const next=source.indexOf('async spawnPrefabs',start);
   assert(!source.slice(start,next).includes('snapshot('),
     'Summary should never create Scene Undo snapshot');
   console.log('PLACEMENT SUMMARY V2 PASS: 7 exact reason counts, example indexes, bounded Scene IPC, read-only Inspector snapshot and validation.');
  }finally{
   Module._load=original;
   globalThis.Editor=oldEditor;
  }
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
main().catch(err=>{console.error(err);process.exitCode=1;});
