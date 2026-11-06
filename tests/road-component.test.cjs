'use strict';
/** Component integration with Cocos API mocks. This is NOT a real engine render test. */
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-road-component-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',out]);
 class Vec3{
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  clone(){return new Vec3(this.x,this.y,this.z);}
  set(x,y,z){Object.assign(this,{x,y,z});return this;}
  lengthSqr(){return this.x*this.x+this.y*this.y+this.z*this.z;}
  length(){return Math.sqrt(this.lengthSqr());}
  static add(o,a,b){return o.set(a.x+b.x,a.y+b.y,a.z+b.z);}
  static subtract(o,a,b){return o.set(a.x-b.x,a.y-b.y,a.z-b.z);}
  static multiplyScalar(o,a,k){return o.set(a.x*k,a.y*k,a.z*k);}
  static dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z;}
  static cross(o,a,b){return o.set(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);}
  static normalize(o,a){const l=a.length();return l>0?this.multiplyScalar(o,a,1/l):o.set(0,0,0);}
  static transformMat4(o,a,m){return o.set(a.x,a.y,a.z);}
 }
 Vec3.UP=new Vec3(0,1,0);
 class Mat4{constructor(){Object.assign(this,{m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,m08:0,m09:0,m10:1,m12:0,m13:0,m14:0});}static invert(o,a){return o;}}
 class Color{constructor(r,g,b,a){Object.assign(this,{r,g,b,a});}}
 class Material{constructor(){this.props={};this.uuid='m';this.destroyed=false;} initialize(o){this.effect=o.effectName;} setProperty(n,v){this.props[n]=v;}destroy(){this.destroyed=true;}}
 class Mesh{constructor(data){this.data=data;this.destroyed=false;}destroy(){this.destroyed=true;}}
 class Node{constructor(){this.parent=null;this.components=[];this.worldMatrix=new Mat4();}getComponent(type){return this.components.find(c=>c instanceof type)||null;}}
 class Component{getComponent(type){return this.node.getComponent(type);}}
 class MeshRenderer extends Component{constructor(){super();this.mesh=null;this.shared=null;}getSharedMaterial(){return this.shared;}setSharedMaterial(m){this.shared=m;}}
 const meshCalls=[];
 const noOp=()=>{};const deco=(...args)=>args.length>1?undefined:noOp;
 const cc={_decorator:{ccclass:()=>cls=>cls,property:deco,menu:()=>cls=>cls,executeInEditMode:()=>cls=>cls,requireComponent:()=>cls=>cls},
  Enum:x=>x,Component,Node,Vec3,Mat4,Color,Material,Mesh,MeshRenderer,utils:{createMesh:d=>{meshCalls.push(d);return new Mesh(d);}}};
 const original=Module._load;
 Module._load=function(name,parent,isMain){if(name==='cc')return cc;return original.call(this,name,parent,isMain);};
 try{
  const {SplineContainer}=require(path.join(out,'Core','SplineContainer.js'));
  const {SplineRoad}=require(path.join(out,'Components','SplineRoad.js'));
  const source={getRevision:()=>'original',count:2,segmentCount:1,length:10,node:{worldMatrix:new Mat4()},
   distanceAtT:t=>10*t*t,evaluatePosition:t=>new Vec3(0,0,t*10),evaluateWorldPosition:t=>new Vec3(0,0,t*10),
   evaluateTangent:t=>new Vec3(0,0,1),evaluateUp:t=>new Vec3(0,1,0)};
  const parent=new Node();parent.getComponent=type=>type===SplineContainer?source:null;
  const roadNode=new Node();roadNode.parent=parent;
  const renderer=new MeshRenderer();renderer.node=roadNode;roadNode.components.push(renderer);
  const road=new SplineRoad();road.node=roadNode;roadNode.components.push(road);
  road.onEnable();assert(renderer.mesh,'mesh created in edit/runtime lifecycle');
  assert.equal(meshCalls.length,1);assert(meshCalls[0].indices.length>0);
  assert(renderer.shared instanceof Material,'fallback material created');
  assert.equal(renderer.shared.props.mainColor.r,48,'default asphalt color');
  const previous=renderer.mesh;road.width=9;road.update();
  assert(previous.destroyed,'previous mesh is reclaimed when width changed');
  assert.notEqual(renderer.mesh,previous);assert.equal(meshCalls.length,2);
  road.roadMaterial=new Material();road.update();assert.equal(renderer.shared,road.roadMaterial,'custom material assigned');
  const {SplinePositionMode}=require(path.join(out,'Core','SplinePosition.js'));
  road.rangeMode=SplinePositionMode.Distance;road.startDistance=2;road.endDistance=6;
  road.rebuild();const distanceGeometry=meshCalls.at(-1);
  const distanceZ=distanceGeometry.positions.filter((_,i)=>i%3===2);
  assert(Math.min(...distanceZ)>1.99&&Math.max(...distanceZ)<6.01,'Road crop by distance controls generated geometry');
  road.rangeMode=SplinePositionMode.SplineT;road.startProgress=.5;road.endProgress=1;
  road.rebuild();const tZ=meshCalls.at(-1).positions.filter((_,i)=>i%3===2);
  assert(Math.min(...tZ)>2.49&&Math.max(...tZ)<10.01,'Road crop by cubic t converted through arc distance');
  road.onDestroy();assert.equal(renderer.mesh,null,'renderer cleared after destruction');
  console.log('ROAD COMPONENT MOCK PASS: create mesh in lifecycle, rebuild on width, cleanup old GPU mesh and material binding.');
 }finally{Module._load=original;}
}finally{fs.rmSync(out,{recursive:true,force:true});}
