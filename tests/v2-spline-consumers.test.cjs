'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),
 os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),
 Module=require('node:module');
const {registerGizmos}=require('./helpers/register-gizmos-decorator.cjs');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-new-consumers-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
  '--experimentalDecorators','--useDefineForClassFields','false',
  '--rootDir',path.join(root,'assets/splines-v2'),'--outDir',temp,
  path.join(root,'assets/splines-v2/Components/SplineFollower.ts'),
  path.join(root,'assets/splines-v2/Components/SplineProjector.ts'),
  path.join(root,'tests/types/cc.d.ts'),
  path.join(root,'tests/types/cocos-gizmos.d.ts')],{stdio:'pipe'});
 const env={EDITOR_NOT_IN_PREVIEW:false};
 class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  static transformMat4(out,p,m){
   out.x=p.x*(m?.sx||1)+(m?.tx||0);
   out.y=p.y*(m?.sy||1)+(m?.ty||0);
   out.z=p.z*(m?.sz||1)+(m?.tz||0);return out;
  }
  static subtract(out,a,b){out.x=a.x-b.x;out.y=a.y-b.y;out.z=a.z-b.z;return out;}
  static normalize(out,p){const l=Math.hypot(p.x,p.y,p.z)||1;
   out.x=p.x/l;out.y=p.y/l;out.z=p.z/l;return out;}
  static cross(out,a,b){
   out.x=a.y*b.z-a.z*b.y;out.y=a.z*b.x-a.x*b.z;
   out.z=a.x*b.y-a.y*b.x;return out;
  }
 }
 class Quat {
  static fromAxes(out,x,y,z){out.axes=[x,y,z];return out;}
 }
 class Mat4 {
  constructor(){Object.assign(this,{sx:1,sy:1,sz:1,tx:0,ty:0,tz:0});}
  static invert(out,m){
   Object.assign(out,{sx:1/m.sx,sy:1/m.sy,sz:1/m.sz,
    tx:-m.tx/m.sx,ty:-m.ty/m.sy,tz:-m.tz/m.sz});
   return out;
  }
 }
 class Component {constructor(){this.node=null;}}
 class Node{
  constructor(name){this.name=name;this.isValid=true;this.worldMatrix=new Mat4();
   this.worldPosition=new Vec3();this.components=[];this.rotation=null;}
  addComponent(Type){const c=new Type();c.node=this;this.components.push(c);return c;}
  setWorldPosition(p){this.worldPosition=new Vec3(p.x,p.y,p.z);}
  setWorldRotation(q){this.rotation=q;}
 }
 const passthrough=()=>target=>target;
 const cc={Component,Node,Vec3,Quat,Mat4,Enum:x=>x,
  _decorator:{ccclass:passthrough,property:()=>()=>{},menu:passthrough,
   executeInEditMode:passthrough,requireComponent:passthrough}};
 const original=Module._load;
 Module._load=function(id,parent,isMain){
  if(id==='cc')return cc;
  if(id==='cc/env')return env;
  if(id==='db://cocos-gizmos/RegisterGizmos')return {registerGizmos};
  return original.apply(this,arguments);
 };
 let Path,Knot,CurveMode,Follower,TravelMode,WrapMode,Projector;
 try{
  ({SplinePath:Path,SplineKnot:Knot,CurveMode}=
   require(path.join(temp,'Components/SplinePath.js')));
  ({SplineFollower:Follower,FollowerTravelMode:TravelMode,
    FollowerWrapMode:WrapMode}=
   require(path.join(temp,'Components/SplineFollower.js')));
  ({SplineProjector:Projector}=
   require(path.join(temp,'Components/SplineProjector.js')));
 }finally{Module._load=original;}
 const pathNode=new Node('path');pathNode.worldMatrix.tx=20;
 pathNode.worldMatrix.sx=2;
 const spline=pathNode.addComponent(Path);
 const knots=[new Knot(),new Knot()];
 knots[0].position=new Vec3(0,0,0);
 knots[1].position=new Vec3(10,0,0);
 spline.interpolation=CurveMode.Linear;spline.knots=knots;
 const moverNode=new Node('mover');
 const mover=moverNode.addComponent(Follower);mover.path=spline;
 mover.playOnEnable=true;mover.onEnable();
 mover.update(1);
 assert.equal(mover.distance,3);
 assert.equal(moverNode.worldPosition.x,26);
 mover.wrapMode=WrapMode.PingPong;
 mover.speed=20;mover.update(1);
 assert.equal(mover.distance,3,'One 20-unit step reflects twice from 3');
 assert.equal(mover.direction,1);
 mover.alignRotation=true;mover.sampleCurrent();
 assert(moverNode.rotation?.axes,'Optional banked orientation is resolved');
 mover.travelMode=TravelMode.Duration;
 mover.duration=10;mover.restart();
 mover.update(2);assert.equal(mover.distance,2);
 mover.pause();mover.update(2);assert.equal(mover.distance,2);
 mover.seek(5);assert.equal(moverNode.worldPosition.x,30);
 env.EDITOR_NOT_IN_PREVIEW=true;
 mover.play();mover.update(1);assert.equal(mover.distance,5,
  'Scene editing is opt-in, no runtime movement in Editor by default');
 env.EDITOR_NOT_IN_PREVIEW=false;
 const source=new Node('input');source.worldPosition=new Vec3(33,4,0);
 const projectorNode=new Node('projector');
 const projector=projectorNode.addComponent(Projector);
 projector.path=spline;projector.sourcePosition=source;
 const query=projector.projectOnce();
 assert(query);assert(Math.abs(query.worldPosition.x-33)<.02);
 assert(Math.abs(query.distanceAlong-6.5)<.02,
  'Projection must respect nonuniform Path scale for world metric');
 assert(Math.abs(query.distanceFromPoint-4)<.02);
 assert.equal(projectorNode.worldPosition.x,0,
  'Projection must remain read-only unless explicit snap enabled');
 projector.snapThisNode=true;projector.projectOnce();
 assert(Math.abs(projectorNode.worldPosition.x-33)<.02);
 assert.equal(source.worldPosition.y,4,'Query Node must not be moved');
 source.worldPosition=new Vec3(38,6,0);
 projector.continuous=true;projector.update(.01);
 assert(Math.abs(projectorNode.worldPosition.x-38)<.02);
 assert(Math.abs(projector.latest.distanceFromPoint-6)<.02);
 assert.equal(spline.knots.length,2,'Consumers never own or mutate Knots');
 console.log('V2 CONSUMERS PASS: Follower Speed/Duration/PingPong, edit gating, read-only world projection, nonuniform-scale distance.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
