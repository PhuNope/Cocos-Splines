'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-noise-'));
const close=(a,b,eps=1e-8)=>assert(Math.abs(a-b)<eps,a+' != '+b);
try {
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {sampleNoiseLayers}=require(path.join(tmp,'Core','SplineNoiseMath.js'));
 const layer=(o={})=>({enabled:true,frequency:4,octaves:3,persistence:.5,phase:0,seed:10,
     amplitude:{x:2,y:1,z:3},fadeEnds:.1,...o});
 assert.deepEqual(sampleNoiseLayers([],0,123,false),{x:0,y:0,z:0});
 assert.deepEqual(sampleNoiseLayers([layer({enabled:false})],.3,123,false),{x:0,y:0,z:0});
 assert.deepEqual(sampleNoiseLayers([layer({amplitude:{x:0,y:0,z:0}})],.3,123,false),{x:0,y:0,z:0});
 for(const t of [0,.05,.2,.333,.5,.8,1]){
  const a=sampleNoiseLayers([layer({phase:.18})],t,123,true);
  const b=sampleNoiseLayers([layer({phase:.18})],t+1,123,true);
  for(const axis of ['x','y','z'])close(a[axis],b[axis]);
 }
 const nearStart=sampleNoiseLayers([layer()],1e-6,123,true);
 const nearEnd=sampleNoiseLayers([layer()],1-1e-6,123,true);
 for(const axis of ['x','y','z'])
  assert(Math.abs(nearStart[axis]-nearEnd[axis])<.002,'Closed seam continuous '+axis);
 assert.deepEqual(sampleNoiseLayers([layer({fadeEnds:.2})],0,123,false),{x:0,y:0,z:0});
 assert.deepEqual(sampleNoiseLayers([layer({fadeEnds:.2})],1,123,false),{x:0,y:0,z:0});
 assert.notDeepEqual(sampleNoiseLayers([layer()],.37,12,true),sampleNoiseLayers([layer()],.37,13,true));
 const before=layer(),serialized=JSON.stringify(before);
 sampleNoiseLayers([before],.4,10,false);assert.equal(JSON.stringify(before),serialized,'Input immutable');
 for(const bad of [layer({frequency:0}),layer({frequency:1.5}),layer({octaves:7}),
     layer({persistence:-1}),layer({amplitude:{x:Infinity,y:0,z:0}})])
  assert.throws(()=>sampleNoiseLayers([bad],.2,12,false));
 assert.throws(()=>sampleNoiseLayers(Array(17).fill(layer()),.2,123,false));
 assert.throws(()=>sampleNoiseLayers([layer()],NaN,123,false));

 class Vec3 {
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  clone(){return new Vec3(this.x,this.y,this.z);}
  set(x,y,z){return x&&typeof x==='object'?this.set(x.x,x.y,x.z):Object.assign(this,{x,y,z});}
  static add(o,a,b){return o.set(a.x+b.x,a.y+b.y,a.z+b.z);}
  static transformQuat(o,a){return o.set(a);}
 }
 class Quat{static multiply(o){return o;}static fromEuler(o){return o;}}
 class Node{
  constructor(name='node'){this.name=name;this.uuid=name;this.children=[];this.parent=null;
    this.isValid=true;this.scale=new Vec3(1,1,1);this.worldRotation=new Quat();this.worldPosition=new Vec3();}
  getComponent(ctor){return this.components?.find(c=>c instanceof ctor)||null;}
  setParent(p){this.removeFromParent();this.parent=p;if(p)p.children.push(this);}
  removeFromParent(){if(!this.parent)return;const c=this.parent.children;const i=c.indexOf(this);if(i>=0)c.splice(i,1);this.parent=null;}
  setWorldPosition(p){this.worldPosition=p.clone();}
  setWorldRotation(q){this.worldRotation=q;}
  setScale(v){this.scale=v.clone();}
  destroy(){this.isValid=false;}
 }
 class Component{constructor(){this.node=new Node();this.enabled=true;}}
 const made=[],cc={_decorator:{ccclass:()=>cl=>cl,property:()=>{},menu:()=>cl=>cl,executeInEditMode:()=>cl=>cl},
    Component,Node,Vec3,Quat,Prefab:class{},Enum:x=>x,
    instantiate:()=>{const n=new Node('inst-'+made.length);made.push(n);return n;}};
 const original=Module._load;
 Module._load=function(name,parent,isMain){
  if(name==='cc')return cc;
  if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};
  if(name==='../Core/SplineContainer')return {SplineContainer:class SplineContainer{}};
  if(name==='./SplineModifiers')return {SplineModifiers:class SplineModifiers{}};
  if(name==='./SplineInstantiate')return {InstantiateMethod:{Count:0,Distance:1}};
  return original.call(this,name,parent,isMain);
 };
 try {
  const {SplineNoise,SplineNoiseLayer}=require(path.join(tmp,'Components','SplineNoise.js'));
  const {SplineObjectController}=require(path.join(tmp,'Components','SplineObjectController.js'));
  const spline={closed:false,count:2,length:10,node:new Node('spline'),getRevision:()=>123,
      evaluateWorldPosition:p=>new Vec3(p*10,0,0),evaluateRotation:()=>new Quat()};
  const noise=new SplineNoise();noise.node=spline.node;noise.spline=spline;
  const l=new SplineNoiseLayer();l.frequency=1;l.octaves=1;l.phase=.2;l.fadeEnds=0;
  l.amplitude=new Vec3(2,1,0);noise.layers=[l];noise.seed=123;
  close(noise.sample(.35).x,sampleNoiseLayers([l],.35,123,false).x);
  const rev=noise.getRevision();l.phase=.4;assert.notEqual(noise.getRevision(),rev);
  noise.enabled=false;assert.deepEqual(noise.sample(.3),new Vec3());noise.enabled=true;
  const controller=new SplineObjectController();controller.spline=spline;controller.prefabs=[{}];controller.count=3;
  controller.randomPosition=new Vec3();controller.randomRotation=new Vec3();controller.randomScale=0;
  controller.offset=new Vec3();controller.alignToSpline=false;
  assert.equal(controller.respawn(),3);
  assert.deepEqual(made.slice(-3).map(n=>n.worldPosition.x),[0,5,10]);
  controller.noise=noise;const old=controller.signature();
  assert.equal(controller.respawn(),3);
  for(let i=0;i<3;i++){
   const pos=made[made.length-3+i].worldPosition,delta=noise.sample(i/2);
   close(pos.x,i*5+delta.x);close(pos.y,delta.y);close(pos.z,delta.z);
  }
  controller.respawn();
  assert.deepEqual(made.slice(-3).map(n=>n.worldPosition),
                   made.slice(-6,-3).map(n=>n.worldPosition),'Deterministic respawn');
  assert(made.slice(-6,-3).every(n=>!n.isValid),'Previous instances destroyed');
  l.frequency=3;assert.notEqual(controller.signature(),old,'Signature invalidation');
  controller.noise=null;controller.respawn();
  assert.deepEqual(made.slice(-3).map(n=>n.worldPosition.x),[0,5,10],'Legacy unchanged');
  assert.equal(spline.getRevision(),123,'Spline geometry never mutated');
 }finally{Module._load=original;}
 const pkg=require(root+'/package.json');
 assert(pkg.contributions.menu.some(m=>m.message==='create-noise-layers'));
 assert.deepEqual(pkg.contributions.messages['create-noise-layers'].methods,['createNoiseLayers']);
 assert.equal(pkg.contributions.inspector.section.node['Splines.SplineNoise'],
   './dist/contributions/inspector/Noise.js');
 const noiseInspector=require(root+'/dist/contributions/inspector/Noise.js');
 for(const s of ['spl-field-spline','spl-field-seed','spl-field-layers'])
  assert(noiseInspector.template.includes(s),'Missing noise property '+s);
 assert(require(root+'/dist/contributions/inspector/Container.js').template.includes('spl-create-noise'));
 assert(require(root+'/dist/contributions/inspector/ObjectController.js').template.includes('spl-field-noise'));
 console.log('NOISE LAYERS V2 PASS: periodic deterministic noise, validation and non-destructive population.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
