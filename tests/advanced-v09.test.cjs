'use strict';
/** Geometry/behavior regressions for the Dreamteck-inspired v0.9 modules. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-v09-'));
const near=(a,b,eps=1e-5)=>assert(Math.abs(a-b)<=eps,`${a} != ${b}`);
try {
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 const {evaluateModifier}=require(path.join(tmp,'Core','SplineModifierMath.js'));
 const key=(progress,offset,width,speed,roll,scale)=>({progress,offset:{x:offset,y:0,z:0},width,speed,roll,scale:{x:scale,y:scale,z:scale}});
 const keys=[key(1,10,2,3,90,2),key(0,0,1,1,0,1)];
 near(evaluateModifier([],0.3).speed,1);
 near(evaluateModifier(keys,0.5).offset.x,5);
 near(evaluateModifier(keys,0.5).width,1.5);
 near(evaluateModifier(keys,0.5).roll,45);
 near(evaluateModifier(keys,-3).scale.y,1);
 near(evaluateModifier(keys,3).speed,3);
 near(evaluateModifier(keys,0.25,'smooth').offset.x,1.5625);
 const {bendHierarchyPositions,layoutSequentialMeshParts}=require(path.join(tmp,'Core','SplineHierarchyBendMath.js'));
 assert.deepEqual(layoutSequentialMeshParts([[0,0,0,0,0,5],[0,0,0,0,0,5]],2,2),[[0,0,0,0,0,5],[0,0,7,0,0,12]]);
 assert.deepEqual(layoutSequentialMeshParts([[0,0,0],[0,0,0]],2,0),[[0,0,0],[0,0,0]],'Zero-length part cannot be laid out using just its origin');
 const frame=t=>({position:{x:10*t,y:0,z:0},right:{x:0,y:0,z:1},up:{x:0,y:1,z:0}});
 const bend=bendHierarchyPositions([2,0,0,2,0,5],frame,{axis:2,min:0,max:5,start:0,end:1,widthScale:2,heightScale:3});
 assert.deepEqual(bend,[0,0,4,10,0,4]);
 assert.throws(()=>bendHierarchyPositions([0,0,0],frame,{axis:2,min:2,max:2,start:0,end:1,widthScale:1,heightScale:1}));
 const {buildJunctionPatch}=require(path.join(tmp,'Core','SplineJunctionPatchMath.js'));
 const branches=[{center:{x:0,y:0,z:0},outward:{x:0,y:0,z:-1},width:4},
                 {center:{x:0,y:0,z:0},outward:{x:-1,y:0,z:1},width:4},
                 {center:{x:0,y:0,z:0},outward:{x:1,y:0,z:1},width:4}];
 const patch=buildJunctionPatch(branches,4,0.02,2);
 assert.equal(patch.indices.length,18);
 assert.equal(patch.positions.length,21);
 assert(patch.normals.every((n,i)=>n===(i%3===1?1:0)));
 // Winding of XZ polar-angle polygon must point up.
 for(let i=0;i<patch.indices.length;i+=3){
   const index=patch.indices;const p=(k)=>patch.positions.slice(index[i+k]*3,index[i+k]*3+3);
   const [a,b,c]=[p(0),p(1),p(2)];
   const crossY=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
   assert(crossY>=-1e-7,`Patch triangle ${i/3} faces down: ${crossY}`);
 }
 assert.equal(buildJunctionPatch([],4,.01,1).indices.length,0);
 const {morphPoint}=require(path.join(tmp,'Core','SplineMorphMath.js'));
 assert.deepEqual(morphPoint({x:2,y:4,z:0},{x:4,y:10,z:8},.5),{x:3,y:7,z:4});

 class Vec3{
   constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
   clone(){return new Vec3(this.x,this.y,this.z);}
   set(x=0,y=0,z=0){if(x&&typeof x==='object'){this.x=x.x;this.y=x.y;this.z=x.z;}else{this.x=x;this.y=y;this.z=z;}return this;}
   length(){return Math.hypot(this.x,this.y,this.z);}
   lengthSqr(){return this.x*this.x+this.y*this.y+this.z*this.z;}
   static add(o,a,b){return o.set(a.x+b.x,a.y+b.y,a.z+b.z);}
   static subtract(o,a,b){return o.set(a.x-b.x,a.y-b.y,a.z-b.z);}
   static multiplyScalar(o,a,n){return o.set(a.x*n,a.y*n,a.z*n);}
   static normalize(o,a){const d=Math.hypot(a.x,a.y,a.z)||1;return o.set(a.x/d,a.y/d,a.z/d);}
   static cross(o,a,b){return o.set(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);}
   static dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z;}
   static transformQuat(o,a){return o.set(a);}
   static transformMat4(o,a,m){return o.set(a.x*(m?.m00??1)+(m?.m12??0),a.y*(m?.m05??1)+(m?.m13??0),a.z*(m?.m10??1)+(m?.m14??0));}
 }
 class Quat{constructor(x=0,y=0,z=0,w=1){Object.assign(this,{x,y,z,w});}clone(){return new Quat();}
   static multiply(o){return o;}static fromEuler(o){return o;}static invert(o){return o;}static fromAxes(o){return o;}}
 class Mat4{constructor(){Object.assign(this,{m00:1,m05:1,m10:1,m12:0,m13:0,m14:0});}static invert(o,a){return Object.assign(o,a);}}
 class Node{
   constructor(name){this.name=name;this.uuid=name;this.isValid=true;this.parent=null;this.children=[];this.components=[];this.position=new Vec3();this.scale=new Vec3(1,1,1);this.rotation=new Quat();this.worldRotation=new Quat();this.worldPosition=new Vec3();this.worldMatrix=new Mat4();}
   getComponent(type){return this.components.find(x=>x instanceof type)||null;}
   setParent(parent){this.removeFromParent();this.parent=parent;if(parent)parent.children.push(this);}
   removeFromParent(){if(this.parent){const i=this.parent.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1);this.parent=null;}}
   setScale(v){this.scale=v.clone();}setWorldPosition(v){this.worldPosition=v.clone();}
   setPosition(v){this.position=v.clone();}setWorldRotation(v){this.worldRotation=v.clone();}
   destroy(){this.isValid=false;}emit(){}
 }
 class Component{constructor(){this.node=new Node('component-node');this.enabled=true;}getComponent(t){return this.node.getComponent(t);}}
 class Mesh{constructor(data){this.data=new Uint8Array(12);this.struct={primitives:[{vertexBundelIndices:[0]}],vertexBundles:[]};this.allowDataAccess=true;this.dataset=data;this.destroyed=false;}
   readAttribute(i,name){return this.dataset[name]||null;}
   readAttributeFormat(i,name){return {name:name==='POSITION'?'RGB32F':name==='TEXCOORD'?'RG32F':'RGB32F'};}
   readIndices(){return new Uint16Array([0,1,2,0,2,3]);}destroy(){this.destroyed=true;}}
 class MeshRenderer extends Component{constructor(){super();this.mesh=null;this.material=null;}getSharedMaterial(){return this.material;}setSharedMaterial(m){this.material=m;}}
 const made=[];
 const cc={_decorator:{ccclass:()=>cl=>cl,property:()=>{},menu:()=>cl=>cl,executeInEditMode:()=>cl=>cl,requireComponent:()=>cl=>cl},
  Component,Node,Vec3,Quat,Mat4,Mesh,MeshRenderer,Color:class{},Material:class{},Enum:x=>x,
  Prefab:class{},instantiate:prefab=>{const n=new Node('clone-'+prefab.name);made.push(n);return n;},
  gfx:{AttributeName:{ATTR_POSITION:'POSITION',ATTR_TEX_COORD:'TEXCOORD',ATTR_NORMAL:'NORMAL'},Format:{RGB32F:1,RG32F:2}},
  utils:{createMesh:d=>({generated:true,geometry:d,destroyed:false,destroy(){this.destroyed=true;}})}};
 const orig=Module._load;
 Module._load=function(name,parent,isMain){if(name==='cc')return cc;if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};return orig.call(this,name,parent,isMain);};
 try {
  const {SplineModifiers,SplineModifierKey}=require(path.join(tmp,'Components','SplineModifiers.js'));
  const mods=new SplineModifiers();const m1=new SplineModifierKey();m1.progress=0;m1.speed=0.5;m1.offset=new Vec3(2,0,0);
  const m2=new SplineModifierKey();m2.progress=1;m2.speed=1.5;m2.offset=new Vec3(4,0,0);
  mods.keys=[m1,m2];near(mods.sample(.5).speed,1);near(mods.sample(.5).offset.x,3);

  const {SplineObjectController}=require(path.join(tmp,'Components','SplineObjectController.js'));
  const ctrl=new SplineObjectController();const parent=new Node('parent');ctrl.node.setParent(parent);
  ctrl.spline={count:3,length:12,closed:false,revision:'1',node:new Node('spline'),
       getRevision(){return '1'},evaluateWorldPosition:t=>new Vec3(12*t,0,0),evaluateRotation:()=>new Quat()};
  ctrl.prefabs=[{uuid:'a',name:'A'},{uuid:'b',name:'B'}];ctrl.count=5;ctrl.modifiers=mods;
  ctrl.rebuild();assert.equal(made.length,5);assert.equal(ctrl.spawnedRoot.children.length,5);near(made[4].worldPosition.x,16); // +4 offset at progress 1
  const identities=made.map(n=>n.name);ctrl.rebuild();assert.deepEqual(made.slice(5).map(n=>n.name),identities);
  assert(made.slice(0,5).every(n=>!n.isValid));
  assert.equal(ctrl.spawn(),0,'Existing manually saved children should prevent duplicate spawn');
  ctrl.spawnOnStart=false;ctrl.onEnable();assert.equal(ctrl.spawnedRoot.children.length,5);
  ctrl.onDisable();assert(made.slice(5).every(n=>!n.isValid));

  const {SplineMorph}=require(path.join(tmp,'Components','SplineMorph.js'));
  const {SplineKnot,TangentMode}=require(path.join(tmp,'Core','SplineKnot.js'));
  const shape=(shift)=>({count:2,reversed:false,node:new Node('source'),getRevision:()=>String(shift),
     getNaturalResolvedKnots:()=>[{position:{x:shift,y:0,z:0},tangentIn:{x:-1,y:0,z:0},tangentOut:{x:1,y:0,z:0}},
             {position:{x:shift+10,y:0,z:0},tangentIn:{x:-1,y:0,z:0},tangentOut:{x:1,y:0,z:0}}]});
  const outputKnots=[new SplineKnot(),new SplineKnot()];for(let i=0;i<2;i++)outputKnots[i].node=new Node('k'+i);
  const out={count:2,reversed:false,knots:outputKnots,node:new Node('out'),refreshCalls:0,refresh(){this.refreshCalls++;}};
  const morph=new SplineMorph();morph.sourceA=shape(0);morph.sourceB=shape(10);morph.outputSpline=out;morph.blend=.5;
  assert(morph.apply());near(outputKnots[0].node.position.x,5);near(outputKnots[1].node.position.x,15);
  assert.equal(outputKnots[0].mode,TangentMode.Broken);
  morph.restore();near(outputKnots[0].node.position.x,0);

  const {SplineObjectBender}=require(path.join(tmp,'Components','SplineObjectBender.js'));
  const bender=new SplineObjectBender();bender.node=new Node('bender');const child=new Node('mesh-child');child.setParent(bender.node);
  const renderer=new MeshRenderer();renderer.node=child;child.components.push(renderer);
  const sourceMesh=new Mesh({POSITION:new Float32Array([1,0,0,-1,0,0,-1,0,5,1,0,5]),TEXCOORD:new Float32Array([0,0,1,0,1,1,0,1])});
  renderer.mesh=sourceMesh;bender.spline={count:2,getRevision:()=>1,node:new Node('bender-spline'),evaluateWorldPosition:t=>new Vec3(10*t,0,0),evaluateRotation:()=>new Quat(),length:10};
  assert.doesNotThrow(()=>bender.rebuild());assert.notStrictEqual(renderer.mesh,sourceMesh);
  assert(renderer.mesh.geometry.indices.length===6);
  // Three children referencing the SAME source mesh remain separate renderer meshes.
  const child2=new Node('capsule-2'),child3=new Node('capsule-3');child2.setParent(bender.node);child3.setParent(bender.node);
  const r2=new MeshRenderer(),r3=new MeshRenderer();r2.node=child2;r3.node=child3;r2.mesh=sourceMesh;r3.mesh=sourceMesh;
  child2.components.push(r2);child3.components.push(r3);
  bender.restore();bender.rebuild();
  assert.notStrictEqual(renderer.mesh,r2.mesh);assert.notStrictEqual(r2.mesh,r3.mesh);
  const positionsKeep=[renderer.mesh,r2.mesh,r3.mesh].map(x=>x.geometry.positions);
  assert.deepEqual(positionsKeep[0],positionsKeep[1],'Coincident source meshes overlap in KeepHierarchy mode');
  const {BenderLayout}=require(path.join(tmp,'Components','SplineObjectBender.js'));
  bender.layout=BenderLayout.SequentialMeshes;bender.partGap=1;bender.rebuild();
  const positionsSequential=[renderer.mesh,r2.mesh,r3.mesh].map(x=>x.geometry.positions);
  assert.notDeepEqual(positionsSequential[0],positionsSequential[1],'Sequential mode must lay out overlapping parts');
  assert.notDeepEqual(positionsSequential[1],positionsSequential[2]);
  bender.restore();assert.strictEqual(renderer.mesh,sourceMesh);assert.strictEqual(r2.mesh,sourceMesh);assert.strictEqual(r3.mesh,sourceMesh);

  const {SplineJunctionMesh}=require(path.join(tmp,'Components','SplineJunctionMesh.js'));
  const patchNode=new Node('patch');const patchRenderer=new MeshRenderer();patchRenderer.node=patchNode;patchNode.components.push(patchRenderer);
  const jmesh=new SplineJunctionMesh();jmesh.node=patchNode;
  jmesh.material={uuid:'shared-mat'};
  jmesh.junction={entries:()=>branches.map((b,i)=>({link:{spline:{count:2,node:new Node('s'+i),getRevision:()=>1,
      evaluateWorldPosition:(t)=>new Vec3(b.center.x+b.outward.x*t,b.center.y,b.center.z+b.outward.z*t)},getProgress:()=>0}})),connections:[]};
  assert.doesNotThrow(()=>jmesh.rebuild());assert(patchRenderer.mesh.geometry.indices.length>=12);
  assert.strictEqual(patchRenderer.material,jmesh.material);jmesh.onDestroy();

  const cfg=require(path.join(root,'package.json'));
  for(const [name,ui] of [['SplineModifiers','Modifiers'],['SplineObjectController','ObjectController'],['SplineObjectBender','Bender'],['SplineMorph','Morph'],['SplineJunctionMesh','JunctionMesh']]){
    assert(cfg.contributions.inspector.section.node['Splines.'+name]);
    const inspector=require(path.join(root,'dist/contributions/inspector/'+ui+'.js'));
    assert(inspector.template.includes('type="dump"'));
  }
  assert(cfg.contributions.messages['create-modifiers']);
  assert(cfg.contributions.messages['create-object-controller']);
  assert(cfg.contributions.messages['create-junction-mesh']);
  console.log('ADVANCED v0.9 PASS: modifier interpolation, deterministic multi-prefab distribution, morph/restore, hierarchy bend/restore, patch winding and shared material, Inspector manifest.');
 } finally {Module._load=orig;}
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
