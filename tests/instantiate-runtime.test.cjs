'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-instantiate-'));
try{
  cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',out],{stdio:'pipe'});
  class Vec3 {
    constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
    clone(){return new Vec3(this.x,this.y,this.z);}
    static add(o,a,b){o.x=a.x+b.x;o.y=a.y+b.y;o.z=a.z+b.z;return o;}
    static transformQuat(o,a){return o===a?o:Object.assign(o,a);}
    static multiplyScalar(o,a,s){o.x=a.x*s;o.y=a.y*s;o.z=a.z*s;return o;}
  }
  class Quat {
    constructor(x=0,y=0,z=0,w=1){this.x=x;this.y=y;this.z=z;this.w=w;}
    static fromEuler(o){return o;}
    static multiply(o,a,b){return o;}
  }
  class Node {
    constructor(name='node'){
      this.uuid=name;this.name=name;this.isValid=true;this.parent=null;this.children=[];this.scale=new Vec3(1,1,1);
      this.worldPosition=new Vec3();this.worldRotation=new Quat();
      this.worldMatrix={m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,m08:0,m09:0,m10:1,m12:0,m13:0,m14:0};
    }
    setParent(parent){this.removeFromParent();this.parent=parent;if(parent)parent.children.push(this);}
    removeFromParent(){if(this.parent){const i=this.parent.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1);this.parent=null;}}
    setWorldPosition(position){this.worldPosition=position.clone();}
    setWorldRotation(rotation){this.worldRotation=rotation;}
    setScale(scale){this.scale=scale.clone();}
    destroy(){this.isValid=false;}
    getComponent(){return null;}
  }
  const noOp=()=>{};
  const decorator=(...args)=>args.length>1?undefined:noOp;
  const cc={_decorator:{ccclass:()=>cls=>cls,property:decorator,menu:()=>cls=>cls,executeInEditMode:()=>cls=>cls},
    Enum:o=>o,Vec3,Quat,Node,Component:class Component{getComponent(){return null;}},Prefab:class Prefab{},
    instantiate:()=>new Node('instance')};
  const original=Module._load;
  Module._load=function(req,parent,isMain){if(req==='cc')return cc;if(req==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};return original.call(this,req,parent,isMain);};
  try{
    const {SplineInstantiate,InstantiateMethod}=require(path.join(out,'Components','SplineInstantiate.js'));
    const pathNode=new Node('spline');
    const spline={node:pathNode,count:2,closed:false,length:10,getRevision:()=>"constant",
      distanceAtT:t=>10*t*t,evaluateWorldPosition:t=>new Vec3(t*10,0,0),evaluateRotation:()=>new Quat()};
    const inst=new SplineInstantiate();inst.node=new Node('parent');inst.prefab={uuid:'prefab'};inst.spline=spline;
    inst.count=4;inst.rebuild();
    assert.equal(inst._generated.length,4);
    assert(Math.abs(inst._generated.at(-1).worldPosition.x-10)<1e-6);
    inst.method=InstantiateMethod.Distance;inst.spacing=3;
    inst.rebuild();assert.deepEqual(inst._generated.map(n=>n.worldPosition.x),[0,3,6,9]);
    inst.startProgress=.2;inst.endProgress=.8;inst.rebuild();
    assert.deepEqual(inst._generated.map(n=>n.worldPosition.x),[2,5,8]);
    inst.startProgress=0;inst.endProgress=1;
    spline.closed=true;inst.spacing=5;inst.rebuild();
    assert.deepEqual(inst._generated.map(n=>n.worldPosition.x),[0,5],'No duplicate full closed loop endpoint');
    spline.closed=false;inst.method=InstantiateMethod.Count;inst.count=5;
    inst.randomOffset=new Vec3(1,2,3);inst.seed=111;inst.scaleMultiplier=2;
    inst.rebuild();const offsetA=inst._generated.map(n=>n.worldPosition.x);
    inst.rebuild();assert.deepEqual(inst._generated.map(n=>n.worldPosition.x),offsetA,'Seeded jitter must be stable');
    assert.equal(inst._generated[0].scale.x,2);
    const {SplinePositionMode}=require(path.join(out,'Core','SplinePosition.js'));
    inst.randomOffset=new Vec3();inst.method=InstantiateMethod.Count;inst.count=3;
    inst.rangeMode=SplinePositionMode.Distance;inst.startDistance=1;inst.endDistance=6;
    inst.rebuild();assert.deepEqual(inst._generated.map(n=>n.worldPosition.x),[1,3.5,6]);
    inst.rangeMode=SplinePositionMode.SplineT;inst.startProgress=.5;inst.endProgress=1;
    inst.rebuild();assert.deepEqual(inst._generated.map(n=>n.worldPosition.x),[2.5,6.25,10]);
    assert.equal(inst.spawn(),0,'Existing generated scene nodes prevent duplicates');
    const existing=inst.spawnedRoot.children.slice();
    inst._runtimeSpawned=false;inst.onEnable();
    assert.deepEqual(inst.spawnedRoot.children,existing,'Play must not duplicate manual scene instances');
    assert.equal(inst._generated.length,3);
    inst.clear();assert.equal(inst._generated.length,0);assert.equal(inst.spawnedRoot.children.length,0);
    assert.equal(inst.spawn(),3,'Spawn should work after clearing');
    const clones=inst.spawnedRoot.children.slice();inst.onDisable();
    assert(clones.every(n=>!n.isValid),'Runtime owned clones are cleared on disable');
    console.log('INSTANTIATE MOCK PASS: Count/Distance, ranges, closed endpoint, deterministic offsets, scale and lifecycle.');
  }finally{Module._load=original;}
}finally{fs.rmSync(out,{recursive:true,force:true});}
