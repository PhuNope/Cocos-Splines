'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),
  cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-pop-obb-capsule-v2-'));
try{
  cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
    '--noEmit','false','--outDir',tmp],{stdio:'pipe'});
  const {filterPopulationShapeCandidates}=require(
    path.join(tmp,'Core','SplinePopulationPreciseMath.js'));
  const {filterObstacleCandidates}=require(
    path.join(tmp,'Core','SplinePopulationPlacementMath.js'));
  const p=(index,x,y,z)=>({index,progress:index/3,position:{x,y,z}});
  const cos=Math.SQRT1_2;
  const obb={center:{x:0,y:0,z:0},axes:[
    {x:cos,y:0,z:-cos},{x:0,y:1,z:0},{x:cos,y:0,z:cos}
  ],half:{x:2,y:.2,z:.5}};
  const bounds={center:{x:0,y:0,z:0},halfExtents:{
    x:2*cos+.5*cos,y:.2,z:2*cos+.5*cos
  }};
  const points=[p(0,0,0,0),p(1,1.4,0,1.4),p(2,.7,0,-.7),p(3,3,0,3)];
  assert.deepEqual(filterPopulationShapeCandidates(points,[{kind:'obb',box:obb}],0,0)
    .map(x=>x.index),[1,3],'Rotated OBB rejects actual interior, not AABB corner');
  assert.deepEqual(filterObstacleCandidates(points,[bounds],0).map(x=>x.index),[3],
    'Conservative AABB overrejects a corner outside OBB');
  assert.deepEqual(filterPopulationShapeCandidates(points,[{kind:'obb',box:obb}],0,1.5)
    .map(x=>x.index),[3],'Footprint sphere narrows available clearance');
  const capsule={a:{x:0,y:-1,z:0},b:{x:0,y:1,z:0},radius:.3};
  const probes=[p(0,0,0,0),p(1,.29,1.25,0),p(2,2,0,0)];
  assert.deepEqual(filterPopulationShapeCandidates(probes,[{kind:'capsule',capsule}],0,0)
    .map(x=>x.index),[1,2],'Capsule rounded end removes less than AABB');
  assert.deepEqual(filterPopulationShapeCandidates(probes,[{kind:'capsule',capsule}],0,.1)
    .map(x=>x.index),[2],'Footprint sphere inflates capsule radius');
  assert.deepEqual(filterPopulationShapeCandidates(points,[],0,0)
    .map(x=>x.index),[0,1,2,3],'Empty obstacle set keeps all candidates');
  for(const obstacle of [
    {kind:'obb',box:{...obb,axes:[obb.axes[0],obb.axes[0],obb.axes[2]]}},
    {kind:'capsule',capsule:{...capsule,radius:-1}},
    {kind:'aabb',bounds:{...bounds,halfExtents:{x:-1,y:1,z:1}}},
    {kind:'unsupported'}
  ])assert.throws(()=>filterPopulationShapeCandidates(points,[obstacle],0,0));
  for(const radius of [-1,Infinity,101])
    assert.throws(()=>filterPopulationShapeCandidates(points,[],0,radius));
  assert.throws(()=>filterPopulationShapeCandidates(points,[{kind:'obb',box:obb}],NaN,0));
  assert.throws(()=>filterPopulationShapeCandidates([
    p(0,0,0,0),p(0,1,1,1)],[],0,0));
  assert.throws(()=>filterPopulationShapeCandidates(
    Array.from({length:2049},(_,index)=>p(index,index,0,0)),[],0,0));
  const before=JSON.stringify({points,obb,capsule});
  filterPopulationShapeCandidates(points,[{kind:'obb',box:obb},{kind:'capsule',capsule}],.4,.2);
  assert.equal(JSON.stringify({points,obb,capsule}),before,'Pure filter never mutates callers');

  class Vec3{
    constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
    clone(){return new Vec3(this.x,this.y,this.z);}
    set(x,y,z){if(x&&typeof x==='object')return this.set(x.x,x.y,x.z);
      Object.assign(this,{x,y,z});return this;}
    static add(out,a,b){return out.set(a.x+b.x,a.y+b.y,a.z+b.z);}
    static transformQuat(out,a){return out.set(a);}
  }
  class Quat{static multiply(out){return out;}static fromEuler(out){return out;}}
  class Node{
    constructor(name='node'){this.name=name;this.uuid=name;this.children=[];this.parent=null;
      this.isValid=true;this.activeInHierarchy=true;
      this.worldRotation=new Quat();this.scale=new Vec3(1,1,1);this.worldPosition=new Vec3();}
    setParent(p){this.removeFromParent();this.parent=p;if(p)p.children.push(this);}
    removeFromParent(){if(!this.parent)return;
      const children=this.parent.children,idx=children.indexOf(this);
      if(idx>=0)children.splice(idx,1);this.parent=null;}
    setWorldPosition(p){this.worldPosition=p.clone();}
    setWorldRotation(q){this.worldRotation=q;}
    setScale(p){this.scale=p.clone();}
    getComponent(){return null;}
    destroy(){this.isValid=false;}
  }
  class Component{constructor(){this.node=new Node();this.enabled=true;}}
  class Collider extends Component{
    constructor(){super();this.worldBounds={center:new Vec3(),halfExtents:new Vec3()};}
  }
  class BoxCollider extends Collider{
    constructor(){super();this.center=new Vec3();this.size=new Vec3(4,.4,1);}
  }
  class CapsuleCollider extends Collider{
    constructor(){super();this.center=new Vec3();this.radius=.3;
      this.cylinderHeight=2;this.direction=1;}
  }
  const created=[],cc={_decorator:{ccclass:()=>cl=>cl,property:()=>{},menu:()=>cl=>cl},
    Component,Node,Vec3,Quat,Collider,BoxCollider,CapsuleCollider,
    Prefab:class{},Enum:x=>x,instantiate:()=>{
      const n=new Node('clone');created.push(n);return n;
    }};
  const original=Module._load;
  Module._load=function(name,parent,isMain){
    if(name==='cc')return cc;
    if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};
    if(name==='../Core/SplineContainer')return {SplineContainer:class SplineContainer{}};
    if(name==='./SplineModifiers')return {SplineModifiers:class SplineModifiers{}};
    if(name==='./SplineNoise')return {SplineNoise:class SplineNoise{}};
    if(name==='./SplineInstantiate')return {InstantiateMethod:{Count:0,Distance:1}};
    return original.call(this,name,parent,isMain);
  };
  try{
    const {SplineObjectController}=require(
      path.join(tmp,'Components','SplineObjectController.js'));
    const box=new BoxCollider();
    box.node.worldMatrix={
      m00:cos,m01:0,m02:-cos,
      m04:0,m05:1,m06:0,
      m08:cos,m09:0,m10:cos,
      m12:0,m13:0,m14:0
    };
    box.worldBounds={center:new Vec3(),halfExtents:new Vec3(
      bounds.halfExtents.x,.2,bounds.halfExtents.z)};
    const positions=[
      {x:0,y:0,z:0},{x:1.4,y:0,z:1.4},
      {x:.7,y:0,z:-.7},{x:3,y:0,z:3}
    ];
    const spline={count:2,closed:false,length:10,node:new Node('spline'),
      getRevision:()=>1,
      evaluateWorldPosition:t=>{const q=positions[Math.round(t*3)];return new Vec3(q.x,q.y,q.z);},
      evaluateRotation:()=>new Quat()};
    const ctrl=new SplineObjectController();
    ctrl.spline=spline;ctrl.prefabs=[{id:'P'}];ctrl.count=4;ctrl.alignToSpline=false;
    ctrl.avoidObstacleColliders=true;ctrl.obstacleColliders=[box];
    ctrl.obstacleClearance=0;
    assert.equal(ctrl.respawn(),1,'Legacy AABB retains only far corner');
    assert.deepEqual(ctrl.spawnedRoot.children.map(n=>n.name),['Spline Object 003']);
    ctrl.usePreciseObstacleShapes=true;
    assert.equal(ctrl.respawn(),2,'OBB adapter accepts rotated AABB corner');
    assert.deepEqual(ctrl.spawnedRoot.children.map(n=>n.name),
      ['Spline Object 001','Spline Object 003']);
    const sig=ctrl.signature();ctrl.placementFootprintRadius=1.5;
    assert.notEqual(ctrl.signature(),sig,'Radius change invalidates signature');
    assert.equal(ctrl.respawn(),1,'Sphere footprint expands OBB exclusion');
    ctrl.placementFootprintRadius=0;
    const old=ctrl.spawnedRoot.children.slice();
    ctrl.placementFootprintRadius=-2;
    assert.throws(()=>ctrl.respawn(),'Invalid radius cannot clear existing population');
    assert.deepEqual(ctrl.spawnedRoot.children,old);
    assert(old.every(n=>n.isValid));
    ctrl.placementFootprintRadius=0;
    // Mismatched bounds mean OBB adapter MUST fall back to AABB.
    box.worldBounds.halfExtents.x=3;
    assert.equal(ctrl.respawn(),1,'Invalid OBB transform uses the conservative supplied World AABB');
    box.worldBounds.halfExtents.x=bounds.halfExtents.x;
    const capsuleNode=new CapsuleCollider();
    capsuleNode.node.worldMatrix={
      m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,m08:0,m09:0,m10:1,
      m12:0,m13:0,m14:0
    };
    capsuleNode.worldBounds={center:new Vec3(),halfExtents:new Vec3(.3,1.3,.3)};
    ctrl.obstacleColliders=[capsuleNode];
    const probes2=[{x:0,y:0,z:0},{x:.29,y:1.25,z:0},{x:2,y:0,z:0},{x:4,y:0,z:0}];
    spline.evaluateWorldPosition=t=>{
      const q=probes2[Math.round(t*3)];return new Vec3(q.x,q.y,q.z);
    };
    assert.equal(ctrl.respawn(),3,'Capsule adapter excludes precise center only');
    ctrl.placementFootprintRadius=.1;
    assert.equal(ctrl.respawn(),2,'Footprint sphere inflates Capsule');
    ctrl.usePreciseObstacleShapes=false;
    const offSignature=ctrl.signature();
    ctrl.placementFootprintRadius=10;
    assert.equal(ctrl.signature(),offSignature,
      'Inactive radius edits do not trigger unnecessary respawn');
  }finally{Module._load=original;}
  const pkg=require(root+'/package.json');
  assert(pkg.scripts.test.includes('spline-population-precise-v2.test.cjs'));
  const inspector=require(root+'/dist/contributions/inspector/ObjectController.js');
  for(const name of ['usePreciseObstacleShapes','placementFootprintRadius'])
    assert(inspector.template.includes('spl-field-'+name));
  console.log('POPULATION PRECISE V2 PASS: OBB/Capsule fallback, footprint radius, safe preflight and legacy compatibility.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
