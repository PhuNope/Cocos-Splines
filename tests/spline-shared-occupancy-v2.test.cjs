'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'shared-occupancy-v2-'));
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {filterSharedOccupancy}=require(tmp+'/Core/SplineSharedOccupancyMath.js');
 const pos=(x=0)=>({x,y:0,z:0});
 const candidates=[0,2,4,6,8,10].map((x,index)=>({index,progress:index/5,position:pos(x),radius:.5}));
 const peers=[{position:pos(0),radius:1},{position:pos(10),radius:1}];
 assert.deepEqual(filterSharedOccupancy(candidates,peers,.5).map(x=>x.index),[2,3]);
 assert.deepEqual(filterSharedOccupancy(candidates,[],.5).map(x=>x.index),[0,1,2,3,4,5]);
 assert.deepEqual(filterSharedOccupancy([{index:0,progress:0,position:pos(-.0001),radius:0},
   {index:1,progress:1,position:pos(.0001),radius:0}],
   [{position:pos(0),radius:0}],.00011),[]);
 assert.deepEqual(filterSharedOccupancy([{index:0,progress:0,position:pos(4),radius:0}],
   [{position:pos(0),radius:0}],0).map(x=>x.index),[0]);
 for(const args of [
   [candidates,[{position:pos(),radius:-1}],0],
   [candidates,[{position:pos(NaN),radius:1}],0],
   [[{index:0,progress:0,position:pos(NaN),radius:0}],[],0],
   [[{index:0,progress:0,position:pos(),radius:-1}],[],0],
   [[candidates[0],candidates[0]],[],0],
   [candidates,[],NaN],[candidates,[],10001],
   [Array.from({length:2049},(_,index)=>({index,progress:0,position:pos(index),radius:0})),[],0],
   [candidates,Array(32769).fill(peers[0]),0],
 ])assert.throws(()=>filterSharedOccupancy(...args));
 const before=JSON.stringify({candidates,peers});
 filterSharedOccupancy(candidates,peers,.5);
 assert.equal(JSON.stringify({candidates,peers}),before,'Pure core must be read-only');
 class Vec3 {
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  clone(){return new Vec3(this.x,this.y,this.z);}
  set(x,y,z){if(x&&typeof x==='object')return this.set(x.x,x.y,x.z);Object.assign(this,{x,y,z});return this;}
  static add(o,a,b){return o.set(a.x+b.x,a.y+b.y,a.z+b.z);}
  static transformQuat(o,a){return o.set(a);}
 }
 class Quat {static multiply(o){return o;}static fromEuler(o){return o;}}
 class Node {
  constructor(name='node'){this.name=name;this.uuid=name;this.parent=null;this.children=[];
    this.components=[];this.isValid=true;this.activeInHierarchy=true;this.scale=new Vec3(1,1,1);
    this.worldPosition=new Vec3();this.worldRotation=new Quat();
    this.worldMatrix={m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,m08:0,m09:0,m10:1};}
  getComponent(c){return this.components.find(x=>x instanceof c)||null;}
  setParent(p){this.removeFromParent();this.parent=p;if(p)p.children.push(this);}
  removeFromParent(){if(!this.parent)return;const a=this.parent.children,i=a.indexOf(this);if(i>=0)a.splice(i,1);this.parent=null;}
  setWorldPosition(p){this.worldPosition=p.clone();}
  setWorldRotation(q){this.worldRotation=q;}
  setScale(s){this.scale=s.clone();}
  destroy(){this.isValid=false;}
 }
 class Component{constructor(){this.node=new Node();this.enabled=true;}}
 const cc={_decorator:{ccclass:()=>c=>c,property:()=>{},menu:()=>c=>c},Component,Node,Vec3,Quat,
   Prefab:class{},Enum:x=>x,Collider:class{},
   instantiate:()=>new Node('Instance')};
 const previousLoad=Module._load;
 Module._load=function(name,parent,isMain){
  if(name==='cc')return cc;
  if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};
  if(name==='../Core/SplineContainer')return {SplineContainer:class SplineContainer{}};
  if(name==='./SplineModifiers')return {SplineModifiers:class SplineModifiers{}};
  if(name==='./SplineNoise')return {SplineNoise:class SplineNoise{}};
  if(name==='./SplineInstantiate')return {InstantiateMethod:{Count:0,Distance:1}};
  return previousLoad.call(this,name,parent,isMain);
 };
 try {
  const {SplineObjectController}=require(tmp+'/Components/SplineObjectController.js');
  const scene=new Node('Scene'),other=new Node('Other');
  const peer=new SplineObjectController(),child=new SplineObjectController();
  peer.node=new Node('P');child.node=new Node('C');
  peer.node.components=[peer];child.node.components=[child];
  peer.node.setParent(scene);child.node.setParent(scene);
  const spline={count:2,closed:false,length:10,node:new Node('Spline'),getRevision:()=>1,
    evaluateWorldPosition:t=>new Vec3(t*10,0,0),evaluateRotation:()=>new Quat()};
  peer.spline=spline;child.spline=spline;peer.prefabs=[{}];child.prefabs=[{}];
  peer.count=2;child.count=6;peer.alignToSpline=false;child.alignToSpline=false;
  peer.occupancyPriority=0;peer.sharedOccupancyRadius=1;
  child.occupancyPriority=1;child.sharedOccupancyRadius=.5;child.peerOccupancyClearance=.5;
  child.avoidPeerPopulation=true;child.occupancyPeerNodes=[peer.node];
  assert.equal(peer.respawn(),2);
  const source=peer.spawnedRoot.children.slice();
  assert.equal(child.respawn(),2);
  assert.deepEqual(child.spawnedRoot.children.map(x=>x.name),['Spline Object 002','Spline Object 003']);
  assert.deepEqual(peer.spawnedRoot.children,source,'Follower must not mutate existing owner');
  const previous=child.spawnedRoot.children.slice();
  const reject=()=>{
    assert.throws(()=>child.respawn());
    assert.deepEqual(child.spawnedRoot.children,previous);
    assert(previous.every(n=>n.isValid),'Preflight errors preserve follower nodes');
  };
  child.occupancyPriority=0;reject();child.occupancyPriority=1;
  child.occupancyPeerNodes=[child.node];reject();
  child.occupancyPeerNodes=[peer.node,peer.node];reject();
  child.occupancyPeerNodes=[peer.node];peer.node.setParent(other);reject();peer.node.setParent(scene);
  peer.spawnedRoot.isValid=false;reject();peer.spawnedRoot.isValid=true;
  const oldSignature=child.signature();
  source[0].worldPosition.x=4;
  assert.notEqual(child.signature(),oldSignature);
  assert.equal(child.respawn(),1);
  assert.equal(child.spawnedRoot.children[0].name,'Spline Object 000');
  assert.deepEqual(peer.spawnedRoot.children,source);
  source[0].worldPosition.x=0;
  child.enablePopulationRules=true;child.minWorldSpacing=3;
  assert.equal(child.respawn(),1,'Peer occupied points filtered before World spacing');
  assert.equal(child.spawnedRoot.children[0].name,'Spline Object 002');
  child.enablePopulationRules=false;child.avoidPeerPopulation=false;
  assert.equal(child.respawn(),6,'Opt-out preserves 6 legacy candidates');
  const stableSignature=child.signature();
  peer.sharedOccupancyRadius=5;source[1].worldPosition.x=6;
  assert.equal(child.signature(),stableSignature,'Peer signature ignored while opted out');
 }finally{Module._load=previousLoad;}
 const pkg=require(root+'/package.json');
 assert(pkg.scripts.test.includes('spline-shared-occupancy-v2.test.cjs'));
 const ui=require(root+'/dist/contributions/inspector/ObjectController.js');
 for(const field of ['avoidPeerPopulation','occupancyPeerNodes','occupancyPriority','sharedOccupancyRadius','peerOccupancyClearance'])
  assert(ui.template.includes('spl-field-'+field),'Missing Shared Occupancy Inspector '+field);
 console.log('SHARED OCCUPANCY V2 PASS: spatial hash, ordered owners, Scene safety, read-only snapshots, deterministic filtering and legacy opt-out.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
