'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-placement-gizmos-v2-'));
const V=(x=0,y=0,z=0)=>({x,y,z});
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {attributePlacementDiagnostics,samplePlacementMarkers}=
   require(tmp+'/Core/SplinePlacementDiagnostics.js');
 const {planPopulation}=require(tmp+'/Core/SplinePopulationMath.js');
 const all=Array.from({length:7},(_,index)=>({index,progress:index/6,position:V(index)}));
 const details=attributePlacementDiagnostics({
   planned:all,projected:all.slice(1).map(c=>({...c,position:V(c.index,5)})),
   obstacle:all.filter(c=>[1,3,4,5,6].includes(c.index)),
   peers:all.filter(c=>[1,4,5,6].includes(c.index)),
   accepted:[1,6],finalRejections:[{index:4,reason:'exclusion'},{index:5,reason:'spacing'}],
   defaultRadius:.2
 });
 assert.deepEqual(details.map(p=>p.reason),[
   'surface','accepted','collider','peer','exclusion','spacing','accepted']);
 assert.equal(details[0].position.y,0);
 assert.equal(details[2].position.y,5);
 assert.deepEqual(samplePlacementMarkers(details,6).map(p=>p.reason),[
   'surface','accepted','collider','peer','exclusion','spacing']);
 assert.deepEqual(samplePlacementMarkers(details,7),details);
 const original=JSON.stringify(all);
 assert.equal(JSON.stringify(all),original,'Read-only diagnostics');
 assert.throws(()=>attributePlacementDiagnostics({
   planned:all,projected:all,obstacle:all,peers:all,accepted:[0],
   finalRejections:[],defaultRadius:0
 }),'Missing reason cannot misrepresent stage');
 const rejected=[];
 const accepted=planPopulation(all,{seed:1234,closed:false,density:1,
   densityKeys:[],exclusions:[{startProgress:.32,endProgress:.36}],
   minWorldSpacing:2.5},(index,reason)=>rejected.push({index,reason}));
 assert(accepted.includes(0)&&!accepted.includes(2));
 assert(rejected.some(e=>e.index===2&&e.reason==='exclusion'));
 assert(rejected.some(e=>e.reason==='spacing'));

 class Vec3 {
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  clone(){return new Vec3(this.x,this.y,this.z);}
  set(x,y,z){if(x&&typeof x==='object')return this.set(x.x,x.y,x.z);
   Object.assign(this,{x,y,z});return this;}
  static add(o,a,b){return o.set(a.x+b.x,a.y+b.y,a.z+b.z);}
  static transformQuat(o,a){return o.set(a);}
 }
 class Quat {static multiply(o){return o;}static fromEuler(o){return o;}}
 class Color {constructor(r,g,b,a){Object.assign(this,{r,g,b,a});}}
 class Node{
  constructor(name='node'){this.name=name;this.uuid=name;this.children=[];
   this.parent=null;this.isValid=true;this.activeInHierarchy=true;
   this.worldPosition=new Vec3();this.worldRotation=new Quat();this.scale=new Vec3(1,1,1);
   this.worldMatrix={m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,m08:0,m09:0,m10:1};}
  getComponent(){return null;}
  setParent(p){this.removeFromParent();this.parent=p;if(p)p.children.push(this);}
  removeFromParent(){if(!this.parent)return;const i=this.parent.children.indexOf(this);
   if(i>=0)this.parent.children.splice(i,1);this.parent=null;}
  setWorldPosition(p){this.worldPosition=p.clone();}
  setWorldRotation(q){this.worldRotation=q;}
  setScale(s){this.scale=s.clone();}
  destroy(){this.isValid=false;}
 }
 class Component{constructor(){this.node=new Node();this.enabled=true;}}
 const made=[],cc={
  _decorator:{ccclass:()=>cl=>cl,property:()=>{},menu:()=>cl=>cl,executeInEditMode:()=>cl=>cl},
  Component,Node,Vec3,Quat,Color,Prefab:class{},Enum:x=>x,
  instantiate:()=>{const n=new Node('inst-'+made.length);made.push(n);return n;}
 };
 const originalLoad=Module._load;
 Module._load=function(name,parent,isMain){
  if(name==='cc')return cc;
  if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};
  if(name==='../Core/SplineContainer')return {SplineContainer:class SplineContainer{}};
  if(name==='./SplineModifiers')return {SplineModifiers:class SplineModifiers{}};
  if(name==='./SplineNoise')return {SplineNoise:class SplineNoise{}};
  if(name==='./SplineInstantiate')return {InstantiateMethod:{Count:0,Distance:1}};
  return originalLoad.call(this,name,parent,isMain);
 };
 const oldGizmos=globalThis.Gizmos3D;
 try{
  const {SplineObjectController}=require(tmp+'/Components/SplineObjectController.js');
  const c=new SplineObjectController();
  c.spline={count:2,closed:false,length:10,node:new Node('spline'),
   getRevision:()=>1,evaluateWorldPosition:p=>new Vec3(10*p,0,0),
   evaluateRotation:()=>new Quat()};
  c.prefabs=[{}];c.count=6;c.alignToSpline=false;
  assert.equal(c.showPlacementGizmos,false);
  const off=c.previewPlacement();
  assert.equal(off.length,6,'Read-only preview all candidates even with no filters');
  assert(off.every(p=>p.reason==='accepted'));
  assert.equal(made.length,0,'Preview cannot instantiate prefab');
  assert.equal(c.spawnedRoot,null,'Preview cannot create generated root');

  const calls=[];let color=null;
  globalThis.Gizmos3D={
   beginColor:(_owner,c)=>{color=c;},
   drawLine:(_owner,a,b)=>calls.push({kind:'line',a:{...a},b:{...b},rgb:[color.r,color.g,color.b]}),
   drawSphere:(_owner,p,r)=>calls.push({kind:'sphere',p:{...p},r,rgb:[color.r,color.g,color.b]})
  };
  c.onDrawGizmosSelected();
  assert.equal(calls.length,0,'Editor preview defaults disabled');
  c.showPlacementGizmos=true;
  c.onDrawGizmosSelected();
  assert.equal(calls.length,6,'Draw accepted candidates selected only');
  assert(calls.every(x=>x.rgb[0]===80),'Green accepted markers');
  assert.equal(made.length,0);
  assert.equal(c.spawnedRoot,null);
  calls.length=0;
  c.enablePopulationRules=true;c.minWorldSpacing=3;
  const shown=c.previewPlacement();
  assert.deepEqual(shown.filter(x=>x.reason==='accepted').map(x=>x.index),[0,2,4]);
  assert.deepEqual(shown.filter(x=>x.reason==='spacing').map(x=>x.index),[1,3,5]);
  c.onDrawGizmosSelected();
  assert.equal(calls.filter(x=>x.rgb[0]===80).length,3);
  assert.equal(calls.filter(x=>x.rgb[0]===80&&x.kind==='sphere').length,3);
  assert.equal(calls.filter(x=>x.rgb[0]===80&&x.p.x===4).length,1);
  assert.equal(calls.filter(x=>x.rgb[0]===80&&x.p.x===0).length,1);
  assert.equal(calls.filter(x=>x.rgb[0]===80&&x.p.x===8).length,1);
  assert.equal(calls.filter(x=>x.rgb[0]===80&&x.p.x===2).length,0);
  assert.equal(calls.filter(x=>x.rgb[0]===80&&x.p.x===6).length,0);
  assert.equal(calls.filter(x=>x.rgb[0]===80&&x.p.x===10).length,0);
  assert.equal(calls.filter(x=>x.rgb[0]===80).length,3);
  assert.equal(calls.filter(x=>x.rgb[0]===80).length+calls.filter(x=>x.rgb[0]===80&&x.kind==='line').length,3);
  assert.equal(made.length,0,'Debug drawer never calls instantiate');
  assert.equal(c.respawn(),3);
  assert.deepEqual(c.spawnedRoot.children.map(n=>n.worldPosition.x),[0,4,8],
   'Preview and actual Respawn use exact same candidates');
  const generated=c.spawnedRoot.children.slice();
  const before=c.previewPlacement();
  c.density=-1;assert.throws(()=>c.previewPlacement());
  assert.deepEqual(c.spawnedRoot.children,generated,'Failed preview never deletes existing instances');
  assert(generated.every(n=>n.isValid));

  c.density=1;
  c.enablePopulationRules=false;c.showPlacementGizmos=false;
  const untouched=c.placementPreviewRevision();
  assert.equal(c.respawn(),6,'Opt-out exact legacy output');
  assert.equal(c.placementPreviewRevision(),untouched);
  const count=calls.length;
  c.onDrawGizmosSelected();assert.equal(calls.length,count,'Gizmo disabled skips drawing');
  c.showPlacementGizmos=true;c.count=200;c.placementGizmoLimit=8;
  calls.length=0;c.onDrawGizmosSelected();assert(calls.length<=8,'Bounded gizmo markers');
  c.showPlacementFootprints=true;
  c.placementGizmoLimit=12;
  calls.length=0;c.onDrawGizmosSelected();assert(calls.length<=12);
  globalThis.Gizmos3D=null;c.onDrawGizmosSelected();
 }finally{Module._load=originalLoad;globalThis.Gizmos3D=oldGizmos;}
 const pkg=require(root+'/package.json');
 assert(pkg.scripts.test.includes('spline-placement-gizmos-v2.test.cjs'));
 const ui=require(root+'/dist/contributions/inspector/ObjectController.js');
 for(const field of ['showPlacementGizmos','placementGizmoLimit','placementGizmoSize','showPlacementFootprints'])
  assert(ui.template.includes('spl-field-'+field));
 const source=fs.readFileSync(root+'/assets/splines/Components/SplineObjectController.ts','utf8');
 assert(source.includes('@registerGizmos(SplinePlacementGizmos)'));
 assert(!source.includes('onDrawGizmosSelected():void'));
 assert(fs.existsSync(root+'/assets/splines/Editor/SplinePlacementGizmos.ts.meta'));
 console.log('PLACEMENT GIZMOS V2 PASS: exact read-only preview, reason attribution, selected-only drawer, bounded markers, safe respawn and decorator.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
