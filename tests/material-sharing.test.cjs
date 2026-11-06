'use strict';
/** Regression: shared .mtl assets must not become per-component clones.
 * This test runs only the material synchronization paths under Cocos API mocks. */
const assert=require('node:assert/strict');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-material-binding-'));
try {
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',out]);
 class Vec3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}}
 class Mat4{constructor(){Object.assign(this,{m00:1,m05:1,m10:1});}}
 class Color{constructor(r=0,g=0,b=0,a=255){Object.assign(this,{r,g,b,a});}}
 class Quat{}
 let autoId=0;
 class Material{constructor(){this.uuid='mat'+ ++autoId;this.props={};}initialize(options){this.effectName=options.effectName;}setProperty(k,v){this.props[k]=v;}destroy(){this.destroyed=true;}}
 class Mesh{}
 class Component{getComponent(type){return this.node.getComponent(type);}}
 class MeshRenderer{constructor(){this.shared=null;this.calls=0;}getSharedMaterial(){return this.shared;}setSharedMaterial(value){this.shared=value;this.calls++;}getMaterialInstance(){throw Error('Unexpected per-renderer MaterialInstance creation');}}
 const noop=()=>{},deco=(...args)=>args.length>1?undefined:noop;
 const cc={_decorator:{ccclass:()=>cls=>cls,property:deco,menu:()=>cls=>cls,executeInEditMode:()=>cls=>cls,requireComponent:()=>cls=>cls},Enum:x=>x,
  Component,MeshRenderer,Mesh,Material,Vec3,Quat,Mat4,Color,gfx:{},utils:{}};
 const loader=Module._load;
 Module._load=function(name,parent,isMain){if(name==='cc')return cc;return loader.call(this,name,parent,isMain);};
 try {
  const cases=[['SplineRoad','roadMaterial'],['SplineExtrude','material'],['SplineMeshDeform','material']];
  for(const [name,key] of cases){
   const C=require(path.join(out,'Components',name+'.js'))[name];
   const sameAsset=new Material(),two=[new C(),new C()];
   const renderers=two.map((c)=>{const r=new MeshRenderer();c.node={getComponent:(type)=>type===MeshRenderer?r:null};c.rebuildOnChange=false;c[key]=sameAsset;return r;});
   two.forEach(c=>c.update());
   assert(renderers.every(r=>r.getSharedMaterial(0)===sameAsset),`${name}: same material asset across 2 splines`);
   assert.equal(renderers[0].shared,renderers[1].shared,`${name}: must share identity`);
   const previous=renderers[0].calls;two[0].update();assert.equal(renderers[0].calls,previous,`${name}: do not reassign every frame`);
   sameAsset.setProperty('mainColor',{r:120});
   assert.equal(renderers[0].shared.props.mainColor.r,120,`${name}: asset edits visible on both renderers`);
   assert.equal(renderers[1].shared.props.mainColor.r,120,`${name}: asset edit visible on second renderer`);
   const reimported=new Material();reimported.uuid=sameAsset.uuid;
   two[0][key]=reimported;two[0].update();
   assert.equal(renderers[0].shared,reimported,`${name}: swapped Material object with same uuid resynced`);
   two[0][key]=null;two[0].update();
   assert.notEqual(renderers[0].shared,reimported,`${name}: clearing Inspector binding removes stale renderer Material`);
   assert.equal(renderers[1].shared,sameAsset,`${name}: other spline retains original shared asset`);
   const manual=new Material(),manualC=new C(),manualR=new MeshRenderer();
   manualR.shared=manual;manualC.node={getComponent:(type)=>type===MeshRenderer?manualR:null};manualC.rebuildOnChange=false;
   manualC.update();assert.equal(manualR.shared,manual,`${name}: direct MeshRenderer material respected`);
  }
  console.log('MATERIAL SHARING MOCK PASS: shared asset identity, live sync, reimport, clear, manual renderer material.');
 }finally{Module._load=loader;}
}finally{fs.rmSync(out,{recursive:true,force:true});}
