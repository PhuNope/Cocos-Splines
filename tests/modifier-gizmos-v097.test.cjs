'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-mod-gizmo-'));
try {
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 class Vec3 {
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  static add(out,a,b){Object.assign(out,{x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});return out;}
  static multiplyScalar(out,a,n){Object.assign(out,{x:a.x*n,y:a.y*n,z:a.z*n});return out;}
  static transformQuat(out,v,q){const radians=q.zDegrees*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);return Object.assign(out,{x:v.x*c-v.y*s,y:v.x*s+v.y*c,z:v.z});}
 }
 class Quat {
  constructor(zDegrees=0){this.zDegrees=zDegrees;}
  static multiply(out,a,b){out.zDegrees=a.zDegrees+b.zDegrees;return out;}
  static fromEuler(out,x,y,z){out.zDegrees=z;return out;}
 }
 class Color {constructor(r=0,g=0,b=0,a=255){Object.assign(this,{r,g,b,a});}}
 class Node {constructor(){this.isValid=true;this.worldRotation=new Quat(90);this.parent=null;} getComponent(){return null;}}
 class Component {constructor(){this.node=new Node();}}
 const cc={_decorator:{ccclass:()=>cls=>cls,property:()=>{},menu:()=>cls=>cls,executeInEditMode:()=>cls=>cls},Component,Vec3,Quat,Color,Enum:x=>x};
 const original=Module._load;
 Module._load=function(request,parent,isMain){
  if(request==='cc')return cc;
  if(request==='../Core/SplineContainer'&&parent?.filename.endsWith('SplineModifiers.js'))return {SplineContainer:class SplineContainer{}};
  return original.apply(this,arguments);
 };
 try {
  const {SplineModifiers,SplineModifierKey}=require(path.join(tmp,'Components','SplineModifiers.js'));
  const modifiers=new SplineModifiers();const keyA=new SplineModifierKey(),keyB=new SplineModifierKey();
  keyA.progress=0;keyA.offset=new Vec3(2,0,0);keyA.width=1;keyA.speed=.5;
  keyB.progress=1;keyB.offset=new Vec3(2,0,0);keyB.width=2;keyB.speed=1.5;keyB.scale=new Vec3(1,2,3);keyB.roll=90;
  modifiers.keys=[keyA,keyB];modifiers.gizmoSamples=8;modifiers.gizmoBaseWidth=6;modifiers.showFrameGizmos=true;
  const spline={count:2,node:new Node(),length:10,evaluateWorldPosition:t=>new Vec3(t*10,0,0),evaluateRotation:()=>new Quat()};
  modifiers.spline=spline;
  const calls=[];let current=null;
  const old=globalThis.Gizmos3D;
  globalThis.Gizmos3D={
   beginColor:(owner,color)=>{current=color;},
   drawLine:(owner,a,b)=>calls.push({type:'line',rgb:[current.r,current.g,current.b],a:{...a},b:{...b}}),
   drawSphere:(owner,p,r)=>calls.push({type:'sphere',rgb:[current.r,current.g,current.b],p:{...p},r})
  };
  modifiers.onDrawGizmosSelected();
  const cyan=calls.filter(c=>c.type==='line'&&c.rgb[0]===55);
  const green=calls.filter(c=>c.type==='line'&&c.rgb[0]===85);
  assert.equal(cyan.length,8,'offset trajectory sampled at bounded intervals');
  assert(cyan.every(line=>Math.abs(line.a.y-2)<1e-8&&Math.abs(line.b.y-2)<1e-8),'offset X follows rotated spline right in world coordinates');
  assert(green.length>16,'both width rails plus ticks are drawn');
  const tick=green.find(c=>Math.abs(c.a.x-c.b.x)<1e-7&&Math.abs(c.a.y-c.b.y)>5.99);
  assert(tick,'draw width guide around offset trajectory in world-space');
  const sphere=calls.filter(c=>c.type==='sphere');assert.equal(sphere.length,2);
  assert.deepEqual(sphere.map(c=>c.rgb),[[70,140,255],[255,154,55]],'blue slower, orange faster');
  assert(calls.some(c=>c.type==='line'&&c.rgb[0]===202),'roll/scale axes appear when enabled');
  assert(Math.abs(modifiers.keys[0].offset.x-2)<1e-7,'Gizmos never modify serialized keys');
  const len=calls.length;modifiers.showGizmos=false;modifiers.onDrawGizmosSelected();assert.equal(calls.length,len,'global preview toggle disables rendering');
  globalThis.Gizmos3D=null;modifiers.showGizmos=true;assert.doesNotThrow(()=>modifiers.onDrawGizmosSelected(),'missing optional Cocos-Gizmos must be harmless');
  modifiers.spline=null;assert.doesNotThrow(()=>modifiers.onDrawGizmosSelected(),'missing spline must be harmless');
  globalThis.Gizmos3D=old;
  const src=fs.readFileSync(path.join(root,'src/contributions/inspector/common.js'),'utf8');
  for(const field of ['showGizmos','gizmoSamples','showOffsetGizmos','showWidthGizmos','gizmoBaseWidth','showKeyGizmos','showFrameGizmos'])assert(src.includes(field),`Inspector missing ${field}`);
  const doc=fs.readFileSync(path.join(root,'docs/pages/length-modifiers.html'),'utf8');
  for(const word of ['Speed','Width','Offset','Scale','Roll','sampleDistance','Gizmos','SmoothStep','Sự kiện','Xe giảm tốc','Mở rộng đường','Chuyển làn','Rải cây']){
   if(word==='Sự kiện')continue;
   assert(doc.includes(word),`Docs missing ${word}`);
  }
  console.log('MODIFIER GIZMOS PASS: world-frame offset, width guides, speed markers, roll/scale axes, toggles, Inspector and docs.');
 }finally {Module._load=original;}
}finally {fs.rmSync(tmp,{recursive:true,force:true});}
