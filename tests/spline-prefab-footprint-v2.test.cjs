'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),
      cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-prefab-footprint-v2-'));
const near=(a,b,eps=1e-8)=>assert(Math.abs(a-b)<=eps,a+' != '+b);
const identity={m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,
                m08:0,m09:0,m10:1,m12:0,m13:0,m14:0};
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
  '--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const footprint=require(path.join(tmp,'Core','SplinePrefabFootprintMath.js'));
 const {filterPopulationShapeCandidatesForRadii}=require(
   path.join(tmp,'Core','SplinePopulationPreciseMath.js'));
 const V=(x=0,y=0,z=0)=>({x,y,z});
 const geom=(position=V(),scale=V(1,1,1),radii=[],children=[])=>
   ({position,scale,radii,children});
 near(footprint.prefabMeshAabbRadius(V(-1,-2,-3),V(2,3,1)),Math.hypot(2,3,3));
 near(footprint.prefabBoxRadius(V(1,0,0),V(2,2,2)),1+Math.sqrt(3));
 near(footprint.prefabSphereRadius(V(1,2,2),2),5);
 near(footprint.prefabCapsuleRadius(V(),1,4),3);
 assert.throws(()=>footprint.prefabMeshAabbRadius(V(2,0,0),V(-1,1,1)));
 assert.throws(()=>footprint.prefabBoxRadius(V(),V(-2,1,1)));
 assert.throws(()=>footprint.prefabCapsuleRadius(V(),1,-1));
 assert.throws(()=>footprint.prefabSphereRadius(V(),NaN));
 const tree=geom(V(7,0,0),V(2,2,2),[Math.sqrt(3)],[
   geom(V(3,0,0),V(2,2,2),[Math.sqrt(3)])
 ]);
 // Root translation is overwritten; child translations/scales remain.
 near(footprint.prefabHierarchyRadius(tree),2*(3+2*Math.sqrt(3)));
 assert.throws(()=>footprint.prefabHierarchyRadius(geom()));
 const cyclic=geom();cyclic.children.push(cyclic);
 assert.throws(()=>footprint.prefabHierarchyRadius(cyclic));
 assert.throws(()=>footprint.prefabHierarchyRadius(
   geom(V(),V(1,1,1),[1],Array.from({length:1025},()=>geom()))));
 near(footprint.parentLinearStretch(identity),1);
 near(footprint.parentLinearStretch({...identity,m04:2}),Math.sqrt(9));
 near(footprint.scaledPrefabFootprint(2,V(2,1,1),1.5,V(1,3,1)),18);
 assert.throws(()=>footprint.scaledPrefabFootprint(50,V(10,10,10),1,V(1,1,1)));
 const sphere={kind:'aabb',bounds:{center:V(),halfExtents:V(.5,.5,.5)}};
 const candidates=[0,2,4].map((x,index)=>({
   index,progress:index/2,position:V(x,0,0)
 }));
 assert.deepEqual(filterPopulationShapeCandidatesForRadii(
   candidates,[sphere],0,[0,.2,0]).map(c=>c.index),[1,2]);
 assert.deepEqual(filterPopulationShapeCandidatesForRadii(
   candidates,[sphere],0,[0,1.5,0]).map(c=>c.index),[2]);
 assert.throws(()=>filterPopulationShapeCandidatesForRadii(candidates,[sphere],0,[0,1]));
 assert.throws(()=>filterPopulationShapeCandidatesForRadii(candidates,[sphere],0,[0,NaN,0]));
 assert.throws(()=>filterPopulationShapeCandidatesForRadii(candidates,[sphere],0,[-1,0,0]));

 class Vec3{
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  clone(){return new Vec3(this.x,this.y,this.z);}
  set(x,y,z){if(x&&typeof x==='object')return this.set(x.x,x.y,x.z);
   Object.assign(this,{x,y,z});return this;}
  static add(out,a,b){return out.set(a.x+b.x,a.y+b.y,a.z+b.z);}
  static transformQuat(out,v){return out.set(v);}
 }
 class Quat{static multiply(o){return o;}static fromEuler(o){return o;}}
 class Node{
  constructor(name='node'){this.name=name;this.uuid=name;this.children=[];
   this.parent=null;this.components=[];this.position=new Vec3();
   this.scale=new Vec3(1,1,1);this.worldMatrix={...identity};
   this.worldRotation=new Quat();this.worldPosition=new Vec3();
   this.isValid=true;this.activeInHierarchy=true;}
  getComponent(c){return this.components.find(x=>x instanceof c)||null;}
  getComponents(c){return this.components.filter(x=>x instanceof c);}
  setParent(p){this.removeFromParent();this.parent=p;if(p)p.children.push(this);}
  removeFromParent(){if(!this.parent)return;const i=this.parent.children.indexOf(this);
   if(i>=0)this.parent.children.splice(i,1);this.parent=null;}
  setWorldPosition(v){this.worldPosition=v.clone();}
  setWorldRotation(q){this.worldRotation=q;}
  setScale(v){this.scale=v.clone();}
  destroy(){this.isValid=false;}
 }
 class Component{constructor(){this.node=new Node();this.enabled=true;}}
 class Collider extends Component{
  constructor(){super();this.worldBounds={center:new Vec3(),halfExtents:new Vec3(.5,.5,.5)};}
 }
 class BoxCollider extends Collider{constructor(){super();this.center=new Vec3();this.size=new Vec3(1,1,1);}}
 class SphereCollider extends Collider{constructor(radius=0){super();this.radius=radius;this.center=new Vec3();}}
 class CapsuleCollider extends Collider{constructor(){super();this.center=new Vec3();this.radius=1;this.cylinderHeight=2;this.direction=1;}}
 class MeshCollider extends Collider{constructor(){super();this.mesh=null;this.center=new Vec3();this.convex=false;}}
 class MeshRenderer extends Component{constructor(mesh){super();this.mesh=mesh;}}
 const attach=(node,comp)=>{node.components.push(comp);comp.node=node;return comp;};
 const prefab=(id,kind,radius)=>{
  const data=new Node('Prefab '+id);
  if(kind==='sphere')attach(data,new SphereCollider(radius));
  if(kind==='mesh')attach(data,new MeshRenderer({
   minPosition:new Vec3(-radius,-radius,-radius),
   maxPosition:new Vec3(radius,radius,radius)
  }));
  if(kind==='child'){
   const child=new Node('Child');child.position.set(2,0,0);
   child.setParent(data);
   attach(child,new SphereCollider(radius));
  }
  return {uuid:id,id,data};
 };
 const instanced=[];
 const cc={_decorator:{ccclass:()=>c=>c,property:()=>{},menu:()=>c=>c},
   Component,Node,Vec3,Quat,Collider,BoxCollider,SphereCollider,
   CapsuleCollider,MeshCollider,MeshRenderer,Prefab:class{},Enum:x=>x,
   instantiate:p=>{
    const n=new Node('clone '+p.id);
    n.variant=p.id;
    instanced.push(n);return n;
   }
 };
 const orig=Module._load;
 Module._load=function(name,parent,isMain){
  if(name==='cc')return cc;
  if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};
  if(name==='../Core/SplineContainer')return {SplineContainer:class SplineContainer{}};
  if(name==='./SplineModifiers')return {SplineModifiers:class SplineModifiers{}};
  if(name==='./SplineNoise')return {SplineNoise:class SplineNoise{}};
  if(name==='./SplineInstantiate')return {InstantiateMethod:{Count:0,Distance:1}};
  return orig.call(this,name,parent,isMain);
 };
 try{
  const {SplineObjectController}=require(
    path.join(tmp,'Components','SplineObjectController.js'));
  const c=new SplineObjectController(),a=prefab('A','sphere',.2),
    b=prefab('B','sphere',1.5),bad=prefab('NO_GEOM','empty',0),
    rendered=prefab('Mesh','mesh',.5),withChild=prefab('Child','child',.25);
  near(c.inferPrefabRadius(a),.2);
  near(c.inferPrefabRadius(b),1.5);
  near(c.inferPrefabRadius(rendered),Math.sqrt(3)*.5);
  near(c.inferPrefabRadius(withChild),2.25);
  assert.throws(()=>c.inferPrefabRadius(bad));
  c.spline={count:2,closed:false,length:4,node:new Node('spline'),
   getRevision:()=>1,evaluateWorldPosition:t=>new Vec3(4*t,0,0),
   evaluateRotation:()=>new Quat()};
  c.prefabs=[a,b];c.usePrefabWeights=true;c.prefabWeights=[1,0];
  c.count=3;c.alignToSpline=false;
  c.avoidObstacleColliders=true;c.usePreciseObstacleShapes=true;
  const obstacle=new Collider();
  obstacle.worldBounds={center:new Vec3(),halfExtents:new Vec3(.5,.5,.5)};
  c.obstacleColliders=[obstacle];
  assert.equal(c.respawn(),2,'Manual zero radius leaves x2 and x4');
  c.autoPrefabFootprint=true;
  assert.equal(c.respawn(),2,'Small prefab radius leaves x2 and x4');
  assert.deepEqual(c.spawnedRoot.children.map(n=>n.name),
   ['Spline Object 001','Spline Object 002']);
  c.prefabWeights=[0,1];
  assert.equal(c.respawn(),1,'Large prefab auto radius blocks x2');
  assert.deepEqual(c.spawnedRoot.children.map(n=>n.name),['Spline Object 002']);
  assert.equal(c.spawnedRoot.children[0].variant,'B');
  const old=c.spawnedRoot.children.slice();
  c.prefabs=[bad,b];c.prefabWeights=[1,0];
  assert.throws(()=>c.respawn(),'Missing geometry fails before destructive clear');
  assert.deepEqual(c.spawnedRoot.children,old);
  assert(old.every(n=>n.isValid));
  c.prefabs=[a,b];c.prefabWeights=[0,1];
  c.scaleMultiplier=2.5;
  assert.equal(c.respawn(),0,'Scale multiplier inflates World prefab radius');
  c.scaleMultiplier=1;
  assert.equal(c.respawn(),1);
  const signature=c.signature();c.autoPrefabFootprint=false;
  assert.notEqual(c.signature(),signature,'Opt-in toggle affects signature');
  assert.equal(c.respawn(),2,'Turning auto off restores manual zero radius');
  c.autoPrefabFootprint=true;c.prefabs=[bad,b];c.prefabWeights=[0,1];
  assert.equal(c.respawn(),1,'Zero-weight bad prefab is not selectable');
  c.prefabs=[a,b];c.prefabWeights=[1,0];
  c.autoPrefabFootprint=false;c.usePreciseObstacleShapes=false;
  c.prefabs=[bad];c.prefabWeights=[1];
  assert.equal(c.respawn(),2,'No auto footprint validation when option disabled');
 }finally{Module._load=orig;}
 const pkg=require(root+'/package.json');
 assert(pkg.scripts.test.includes('spline-prefab-footprint-v2.test.cjs'));
 const ui=require(root+'/dist/contributions/inspector/ObjectController.js');
 assert(ui.template.includes('spl-field-autoPrefabFootprint'));
 console.log('PREFAB FOOTPRINT V2 PASS: hierarchy/mesh/collider radius, per-variant scaling, safe preflight and opt-out.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
