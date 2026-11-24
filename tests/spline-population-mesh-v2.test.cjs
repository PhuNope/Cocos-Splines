'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),
 cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-pop-mesh-v2-'));
try {
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {buildProximityTriangleMesh,sphereMeshContact}=
   require(path.join(tmp,'Core','SplineProximityMesh.js'));
 const {meshColliderWorldBvh}=require(path.join(tmp,'Core','SplineMeshColliderAdapter.js'));
 const {filterPopulationShapeCandidates}=
   require(path.join(tmp,'Core','SplinePopulationPreciseMath.js'));
 const points=[{x:0,y:0,z:0},{x:2,y:0,z:0},{x:0,y:0,z:2}];
 const mesh=buildProximityTriangleMesh(points,[0,1,2]);
 assert.equal(mesh.triangleCount,1);
 assert.equal(sphereMeshContact({x:.25,y:0,z:.25},mesh,0),true,'Point on face');
 assert.equal(sphereMeshContact({x:1.6,y:0,z:1.6},mesh,0),false,'AABB corner outside triangle');
 assert.equal(sphereMeshContact({x:.5,y:.4,z:.5},mesh,.39),false,'Sphere above face no contact');
 assert.equal(sphereMeshContact({x:.5,y:.4,z:.5},mesh,.4),true,'Tangent sphere contact');
 assert.equal(sphereMeshContact({x:1.6,y:0,z:1.6},mesh,.9),true,'Sphere reaches outer edge');
 assert.throws(()=>sphereMeshContact({x:NaN,y:0,z:0},mesh,.1));
 assert.throws(()=>sphereMeshContact({x:0,y:0,z:0},mesh,-1));
 const candidates=[
   {index:0,progress:0,position:{x:.2,y:0,z:.2}},
   {index:1,progress:.5,position:{x:1.6,y:0,z:1.6}},
   {index:2,progress:1,position:{x:3,y:0,z:3}},
 ];
 assert.deepEqual(filterPopulationShapeCandidates(candidates,[{kind:'mesh',mesh}],0,0)
   .map(x=>x.index),[1,2]);
 assert.deepEqual(filterPopulationShapeCandidates(candidates,[{kind:'mesh',mesh}],0,.9)
   .map(x=>x.index),[2]);
 const identity={
   m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,m08:0,m09:0,m10:1,
   m12:0,m13:0,m14:0
 };
 let reads=0;
 const triangleAsset={
   uuid:'triangle',hash:1,allowDataAccess:true,
   struct:{primitives:[{primitiveMode:0}]},
   readAttribute:()=>{reads++;return new Float32Array([0,0,0,2,0,0,0,0,2]);},
   readIndices:()=>new Uint16Array([0,1,2]),
   readAttributeFormat:()=>({name:'RGB32F'}),
 };
 const bounds={center:{x:1,y:0,z:1},halfExtents:{x:1,y:0,z:1}};
 const options={positionAttribute:'a_position',formatTable:{RGB32F:1},triangleListMode:0};
 const compiled=meshColliderWorldBvh(triangleAsset,identity,{x:0,y:0,z:0},bounds,options);
 assert(compiled&&compiled.triangleCount===1);
 assert.equal(sphereMeshContact({x:1.6,y:0,z:1.6},compiled,0),false);
 assert.equal(meshColliderWorldBvh({...triangleAsset,allowDataAccess:false},
   identity,{x:0,y:0,z:0},bounds,options),null);
 assert.equal(meshColliderWorldBvh(triangleAsset,identity,{x:0,y:0,z:0},{
   center:{x:99,y:0,z:99},halfExtents:{x:1,y:1,z:1}
 },options),null,'Stale native bounds must fail closed');
 class Vec3{
   constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
   clone(){return new Vec3(this.x,this.y,this.z);}
   set(x,y,z){if(x&&typeof x==='object')return this.set(x.x,x.y,x.z);
     Object.assign(this,{x,y,z});return this;}
   static add(out,a,b){return out.set(a.x+b.x,a.y+b.y,a.z+b.z);}
   static transformQuat(out,v){return out.set(v);}
 }
 class Quat{static multiply(out){return out;}static fromEuler(out){return out;}}
 class Node{
   constructor(name='node'){this.name=name;this.uuid=name;this.parent=null;
     this.children=[];this.isValid=true;this.activeInHierarchy=true;
     this.worldRotation=new Quat();this.worldPosition=new Vec3();this.scale=new Vec3(1,1,1);}
   getComponent(){return null;}
   setParent(p){this.removeFromParent();this.parent=p;if(p)p.children.push(this);}
   removeFromParent(){if(!this.parent)return;const i=this.parent.children.indexOf(this);
     if(i>=0)this.parent.children.splice(i,1);this.parent=null;}
   setWorldPosition(pos){this.worldPosition=pos.clone();}
   setWorldRotation(q){this.worldRotation=q;}
   setScale(p){this.scale=p.clone();}
   destroy(){this.isValid=false;}
 }
 class Component{constructor(){this.node=new Node();this.enabled=true;}}
 class Collider extends Component{
   constructor(){super();this.worldBounds={
     center:new Vec3(1,0,1),halfExtents:new Vec3(1,0,1)};}
 }
 class MeshCollider extends Collider{
   constructor(){super();this.mesh=triangleAsset;this.convex=false;this.center=new Vec3();
     this.node.worldMatrix={...identity};}
 }
 const made=[],cc={
   _decorator:{ccclass:()=>c=>c,property:()=>{},menu:()=>c=>c},
   Component,Node,Vec3,Quat,Collider,MeshCollider,
   Prefab:class{},Enum:x=>x,
   gfx:{AttributeName:{ATTR_POSITION:'a_position'},Format:{RGB32F:1},
     PrimitiveMode:{TRIANGLE_LIST:0}},
   instantiate:()=>{const n=new Node('clone');made.push(n);return n;}
 };
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
 try {
   const {SplineObjectController}=require(
     path.join(tmp,'Components','SplineObjectController.js'));
   const c=new SplineObjectController(),collider=new MeshCollider();
   const samples=[{x:.2,y:0,z:.2},{x:1.6,y:0,z:1.6},{x:3,y:0,z:3}];
   c.spline={count:2,closed:false,length:10,node:new Node('spline'),
     getRevision:()=>1,
     evaluateWorldPosition:t=>{const v=samples[Math.round(t*2)];return new Vec3(v.x,v.y,v.z);},
     evaluateRotation:()=>new Quat()};
   c.prefabs=[{id:'P'}];c.count=3;c.alignToSpline=false;
   c.avoidObstacleColliders=true;c.usePreciseObstacleShapes=true;
   c.obstacleColliders=[collider];c.obstacleClearance=0;
   assert.equal(c.useMeshColliderBVH,false);
   assert.equal(c.respawn(),1,'Mesh opt-out must use conservative AABB');
   assert.deepEqual(c.spawnedRoot.children.map(n=>n.name),['Spline Object 002']);
   c.useMeshColliderBVH=true;
   assert.equal(c.respawn(),2,'BVH allows a triangle AABB corner');
   assert.deepEqual(c.spawnedRoot.children.map(n=>n.name),
     ['Spline Object 001','Spline Object 002']);
   const readsBefore=reads;
   c.respawn();
   assert.equal(reads,readsBefore,'Same Collider mesh and transform reuse BVH cache');
   c.placementFootprintRadius=.9;
   assert.equal(c.respawn(),1,'Sphere footprint blocks triangle near-edge');
   c.placementFootprintRadius=0;
   collider.convex=true;
   assert.equal(c.respawn(),1,'Convex MeshCollider falls back to conservative AABB');
   collider.convex=false;collider.mesh.allowDataAccess=false;
   assert.equal(c.respawn(),1,'Unreadable MeshCollider falls back to conservative AABB');
   collider.mesh.allowDataAccess=true;
   assert.equal(c.respawn(),2,'Readable mesh restores BVH');
   collider.mesh.hash++;
   const signature=c.signature(),readsPast=reads;
   c.respawn();
   assert(reads>readsPast,'Mesh data hash must invalidate cached BVH');
   assert.equal(c.signature(),signature,'No random signature instability');
   const before=c.spawnedRoot.children.slice();
   c.placementFootprintRadius=-1;
   assert.throws(()=>c.respawn(),'Invalid radius must not clear population');
   assert.deepEqual(c.spawnedRoot.children,before);
   assert(before.every(n=>n.isValid));
   c.placementFootprintRadius=0;
   c.useMeshColliderBVH=false;
   const off=c.signature();collider.mesh.hash++;
   assert.equal(c.signature(),off,'Disabled mesh BVH hash changes do not invalidate legacy');
   assert.equal(c.respawn(),1,'Disable BVH restores AABB filtering');
 }finally{Module._load=original;}
 const pkg=require(root+'/package.json');
 assert(pkg.scripts.test.includes('spline-population-mesh-v2.test.cjs'));
 const panel=require(root+'/dist/contributions/inspector/ObjectController.js');
 assert(panel.template.includes('spl-field-useMeshColliderBVH'));
 console.log('POPULATION MESH V2 PASS: point sphere BVH, exact triangle, cache, convex/unreadable fallback and safe legacy path.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
