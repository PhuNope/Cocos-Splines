'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),
  cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-placement-v2-'));
try {
  cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
    '--noEmit','false','--outDir',tmp],{stdio:'pipe'});
  const {selectWeightedPrefab,validatePrefabWeights,filterObstacleCandidates}=
    require(path.join(tmp,'Core','SplinePopulationPlacementMath.js'));
  assert.equal(selectWeightedPrefab([1,0,3],0),0);
  assert.equal(selectWeightedPrefab([1,0,3],.249999),0);
  assert.equal(selectWeightedPrefab([1,0,3],.25),2);
  assert.equal(selectWeightedPrefab([1,0,3],.9999999),2);
  assert.equal(selectWeightedPrefab([0,1],.1),1);
  for(const weights of [[],[0,0],[1,-1],[1,Infinity],[NaN,1],[1,10001]]){
    assert.throws(()=>selectWeightedPrefab(weights,.5),'Reject invalid prefab weights');
  }
  assert.throws(()=>validatePrefabWeights([1,2],3));
  assert.throws(()=>selectWeightedPrefab([1],1),'One is not a valid RNG sample');
  const candidates=[0,1,2,3].map(index=>({
    index,progress:index/3,position:{x:index*2,y:0,z:0}
  }));
  const box={center:{x:2,y:0,z:0},halfExtents:{x:.2,y:.5,z:.5}};
  assert.deepEqual(filterObstacleCandidates(candidates,[box],0).map(c=>c.index),[0,2,3]);
  assert.deepEqual(filterObstacleCandidates(candidates,[box],1.8).map(c=>c.index),[3]);
  assert.deepEqual(filterObstacleCandidates(candidates,[],0).map(c=>c.index),[0,1,2,3]);
  assert.deepEqual(filterObstacleCandidates([
    {index:0,progress:.1,position:{x:.5,y:.5,z:.5}},
    {index:1,progress:.3,position:{x:1.2,y:1.2,z:0}},
    {index:2,progress:.7,position:{x:2,y:2,z:0}}
  ],[{center:{x:0,y:0,z:0},halfExtents:{x:1,y:1,z:1}}],.25).map(c=>c.index),
    [1,2], 'Sphere vs AABB must use shortest vector, not bounding cube');
  for(const bad of [
    [{center:{x:NaN,y:0,z:0},halfExtents:{x:1,y:1,z:1}}],
    [{center:{x:0,y:0,z:0},halfExtents:{x:-1,y:1,z:1}}],
    Array(65).fill(box)
  ])assert.throws(()=>filterObstacleCandidates(candidates,bad,0));
  assert.throws(()=>filterObstacleCandidates(candidates,[box],-1));
  assert.throws(()=>filterObstacleCandidates([{index:0,progress:0,
    position:{x:Infinity,y:0,z:0}}],[box],0));

  class Vec3{
    constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
    clone(){return new Vec3(this.x,this.y,this.z);}
    set(x,y,z){if(x&&typeof x==='object')return this.set(x.x,x.y,x.z);
      Object.assign(this,{x,y,z});return this;}
    static add(out,a,b){return out.set(a.x+b.x,a.y+b.y,a.z+b.z);}
    static transformQuat(out,p){return out.set(p);}
  }
  class Quat{static multiply(out){return out;}static fromEuler(out){return out;}}
  class Node{
    constructor(name='node'){this.name=name;this.uuid=name;this.children=[];
      this.parent=null;this.isValid=true;this.activeInHierarchy=true;
      this.worldRotation=new Quat();this.scale=new Vec3(1,1,1);this.worldPosition=new Vec3();}
    setParent(p){this.removeFromParent();this.parent=p;if(p)p.children.push(this);}
    removeFromParent(){if(!this.parent)return;
      const kids=this.parent.children,index=kids.indexOf(this);
      if(index>=0)kids.splice(index,1);this.parent=null;}
    setWorldPosition(p){this.worldPosition=p.clone();}
    setWorldRotation(q){this.worldRotation=q;}
    setScale(p){this.scale=p.clone();}
    getComponent(){return null;}
    destroy(){this.isValid=false;}
  }
  class Component{constructor(){this.node=new Node();this.enabled=true;}}
  class Collider extends Component{constructor(worldBounds){super();this.worldBounds=worldBounds;}}
  const made=[],cc={_decorator:{ccclass:()=>cl=>cl,property:()=>{},menu:()=>cl=>cl},
    Component,Node,Vec3,Quat,Collider,Prefab:class{},Enum:x=>x,
    instantiate:(prefab)=>{const n=new Node('template-'+prefab.id);
      n.templateId=prefab.id;made.push(n);return n;}};
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
    const {SplineObjectController}=require(path.join(tmp,'Components','SplineObjectController.js'));
    const controller=new SplineObjectController();
    const spline={count:2,closed:false,length:10,node:new Node('spline'),
      getRevision:()=>1,evaluateWorldPosition:p=>new Vec3(p*10,0,0),
      evaluateRotation:()=>new Quat()};
    controller.spline=spline;controller.prefabs=[{id:'A'},{id:'B'},{id:'C'}];
    controller.count=6;controller.alignToSpline=false;
    assert.equal(controller.usePrefabWeights,false);
    assert.equal(controller.avoidObstacleColliders,false);
    assert.equal(controller.respawn(),6);
    const baseline=made.slice(-6).map(n=>n.templateId);
    controller.prefabWeights=[0,0,1];controller.usePrefabWeights=true;
    const weightedSignature=controller.signature();
    assert.equal(controller.respawn(),6);
    assert(made.slice(-6).every(n=>n.templateId==='C'),
      'Weight zero disables a variant and weight one chooses C');
    controller.prefabWeights=[1,2,3];
    assert.notEqual(controller.signature(),weightedSignature,'Weights invalidate rebuild signature');
    const weightedCount=controller.respawn();
    assert.equal(weightedCount,6);
    const sampleWeighted=made.slice(-6).map(n=>n.templateId);
    controller.respawn();
    assert.deepEqual(made.slice(-6).map(n=>n.templateId),sampleWeighted,
      'Weighted selection must remain deterministic across regeneration');
    const previousNodes=controller.spawnedRoot.children.slice();
    controller.prefabWeights=[0,0,0];assert.throws(()=>controller.respawn(),
      'Reject all-zero weights before cleanup');
    assert.deepEqual(controller.spawnedRoot.children,previousNodes);
    assert(previousNodes.every(node=>node.isValid));
    controller.usePrefabWeights=false;
    controller.prefabWeights=[];
    controller.respawn();
    assert.deepEqual(made.slice(-6).map(n=>n.templateId),baseline,
      'Disabling weighting restores exact legacy prefab choices');

    const obstacle=new Collider({center:new Vec3(0,0,0),
      halfExtents:new Vec3(.25,.25,.25)});
    controller.avoidObstacleColliders=true;controller.obstacleColliders=[obstacle];
    controller.obstacleClearance=0;
    assert.equal(controller.respawn(),5,'Explicit collider blocks center x=0');
    assert.deepEqual(controller.spawnedRoot.children.map(n=>n.name),[
      'Spline Object 001','Spline Object 002','Spline Object 003',
      'Spline Object 004','Spline Object 005'
    ]);
    const beforeMove=controller.signature();
    obstacle.worldBounds.center.x=4;
    assert.notEqual(controller.signature(),beforeMove,'Moving obstacle invalidates signature');
    controller.enablePopulationRules=true;controller.minWorldSpacing=3;
    controller.respawn();
    assert.deepEqual(controller.spawnedRoot.children.map(n=>n.name),
      ['Spline Object 000','Spline Object 003','Spline Object 005'],
      'World spacing is applied only after obstacle filtering');
    // With x4 blocked and spacing3: x0, x6, x10 survive (indexes 0,3,5).
    const previous=controller.spawnedRoot.children.slice();
    obstacle.worldBounds.halfExtents.x=-1;
    assert.throws(()=>controller.respawn(),'Reject malformed obstacle bound preflight');
    assert.deepEqual(controller.spawnedRoot.children,previous,
      'Existing spawned population preserved on malformed bounds');
    assert(previous.every(n=>n.isValid));
    obstacle.worldBounds.halfExtents.x=.25;
    obstacle.enabled=false;
    controller.enablePopulationRules=false;
    controller.respawn();
    assert.equal(controller.spawnedRoot.children.length,6,
      'Explicit inactive Collider is ignored');
    controller.avoidObstacleColliders=false;
    controller.respawn();
    assert.deepEqual(made.slice(-6).map(n=>n.templateId),baseline,
      'No obstacle refs reproduces legacy output');
  }finally{Module._load=orig;}
  const pkg=require(root+'/package.json');
  assert(pkg.scripts.test.includes('spline-population-placement-v2.test.cjs'));
  const panel=require(root+'/dist/contributions/inspector/ObjectController.js');
  for(const field of ['usePrefabWeights','prefabWeights','avoidObstacleColliders',
    'obstacleColliders','obstacleClearance'])
    assert(panel.template.includes('spl-field-'+field),'Inspector missing '+field);
  console.log('POPULATION PLACEMENT V2 PASS: weighted variants, AABB clearance, safe preflight and legacy opt-out.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
