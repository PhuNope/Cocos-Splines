'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cocos-spline-group-2d-'));
try {
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
  '--noEmit','false','--outDir',temp]);
 const {planarMovePositions}=require(path.join(temp,'Editor/SplineGroupMoveMath.js'));
 const eq=(a,b)=>assert(Math.abs(a-b)<1e-7, a+' != '+b);
 const eqVec=(a,b)=>['x','y','z'].forEach(axis=>eq(a[axis],b[axis]));
 const A={x:1,y:2,z:7},B={x:3,y:4,z:-5};
 assert.deepEqual(planarMovePositions(1,A,{x:4,y:6,z:100},[A,B]),
  [{x:4,y:6,z:7},{x:6,y:8,z:-5}]);
 assert.deepEqual(planarMovePositions(2,A,{x:4,y:100,z:9},[A,B]),
  [{x:4,y:2,z:9},{x:6,y:4,z:-3}]);
 assert.throws(()=>planarMovePositions(0,A,B,[A]),/requires XY2D/);
 assert.throws(()=>planarMovePositions(1,A,{x:Infinity,y:0,z:0},[A]),/finite/);
 assert.throws(()=>planarMovePositions(2,A,B,[]),/finite/);

 class Vec3 {
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  clone(){return new Vec3(this.x,this.y,this.z);}
  set(p){Object.assign(this,p);return this;}
  static add(out,a,b){return out.set({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});}
  static subtract(out,a,b){return out.set({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});}
  static transformQuat(out,v){return out.set(v);}
 }
 class Quat {
  constructor(){this.x=this.y=this.z=0;this.w=1;}
  clone(){return Object.assign(new Quat(),this);}
  static invert(out){return out;}
  static fromEuler(out,x,y,z){return Object.assign(out,{x,y,z});}
  static toEuler(out,q){return out.set(q);}
 }
 // Root's world transform contains non-uniform scale and an X-axis tilt.
 // A 2D local XY plane therefore does NOT coincide with world XY.
 const c=Math.SQRT1_2;
 const M=[2,0,0,0, 0,3*c,3*c,0, 0,-4*c,4*c,0, 10,20,30,1];
 const basis=[
  {x:M[0],y:M[1],z:M[2]},
  {x:M[4],y:M[5],z:M[6]},
  {x:M[8],y:M[9],z:M[10]},
 ];
 const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
 const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 const det=dot(basis[0],cross(basis[1],basis[2]));
 const world=(p)=>new Vec3(
  M[0]*p.x+M[4]*p.y+M[8]*p.z+M[12],
  M[1]*p.x+M[5]*p.y+M[9]*p.z+M[13],
  M[2]*p.x+M[6]*p.y+M[10]*p.z+M[14]);
 const local=(p)=>{
  const v={x:p.x-M[12],y:p.y-M[13],z:p.z-M[14]};
  return new Vec3(
   dot(v,cross(basis[1],basis[2]))/det,
   dot(v,cross(basis[2],basis[0]))/det,
   dot(v,cross(basis[0],basis[1]))/det);
 };
 class Node {
  constructor(uuid){this.uuid=uuid;this.isValid=true;this.parent=null;this.children=[];
   this.components=[];this.spline=null;this._local=new Vec3();this.rotation=new Quat();
   this.worldRotation=new Quat();}
  get position(){return this._local.clone();}
  set position(v){this._local=v.clone();}
  get worldPosition(){return this.parent===container?world(this._local):this._local.clone();}
  setWorldPosition(v){this._local=this.parent===container?local(v):v.clone();}
  setPosition(v){this._local=v.clone();}
  setWorldRotation(v){this.worldRotation=v.clone();}
  inverseTransformPoint(out,value){
   if(this!==container)throw Error('Unexpected transform root');
   return out.set(local(value));
  }
  getComponent(name){
   if(name==='Splines.SplineContainer')return this.spline;
   if(name==='Splines.SplineKnot')return this.components[0]||null;
   return this.components.find(component=>component instanceof name)||null;
  }
 }
 class Component{constructor(){this.enabled=true;this.isValid=true;}}
 const identity=x=>x;
 const cc={_decorator:{ccclass:()=>identity,property:()=>()=>{},
    menu:()=>identity,executeInEditMode:()=>identity},
  Component,Node,Vec3,Quat,Enum:identity};
 const previous=Module._load;
 Module._load=function(name,parent,isMain){
  if(name==='cc')return cc;
  return previous.apply(this,arguments);
 };
 try {
  const {SplineKnot}=require(path.join(temp,'Core/SplineKnot.js'));
  const {SplineKnotGizmos}=require(path.join(temp,'Editor/SplineKnotGizmos.js'));
  const container=new Node('root');
  const nodes=['a','b','c'].map(uuid=>new Node(uuid));
  const knots=nodes.map((node,index)=>{
   const knot=new SplineKnot();knot.node=node;
   node.parent=container;node.components.push(knot);
   node.setPosition([
    new Vec3(1,2,7),new Vec3(3,4,-5),new Vec3(9,-6,10)
   ][index]);
   return knot;
  });
  container.children=nodes;
  container.spline={node:container,dimension:1,count:3,enabled:true,
   knots,refresh(){},showGizmosAlways:false};
  let selection=['a','b'],snapshots=0,snapshotAllowed=true;
  globalThis.Editor={
   Selection:{getSelected(){return selection;}},
   Message:{request(channel,method){
    assert.equal(channel,'scene');assert.equal(method,'snapshot');
    snapshots++;return snapshotAllowed;
   }},
  };
  const descriptor=(property,axis,plane,visual)=>({property,axis,plane,visual});
  globalThis.Gizmos2D={move:property=>[
   descriptor(property,'x','view','axis'),
   descriptor(property,'y','view','axis'),
   descriptor(property,undefined,'xy','plane')]};
  globalThis.Gizmos3D={move:property=>[
   ...['x','y','z'].map(axis=>descriptor(property,axis,'view','axis')),
   ...['xy','xz','yz'].map(plane=>descriptor(property,undefined,plane,'plane'))],
   rotate:()=>[]};
  const a=new SplineKnotGizmos(knots[0]);
  const b=new SplineKnotGizmos(knots[1]);
  const group=handles=>handles.filter(h=>h.property==='editorGroupWorldPosition');
  let hs=group(a.onGizmoHandles());
  assert.deepEqual(hs.map(h=>h.axis||h.plane),['x','y','xy']);
  assert.equal(group(b.onGizmoHandles()).length,0,'Single group pivot');
  const originals=nodes.map(n=>n.position.clone());
  // An off-plane 3D drag (World-Z) must be projected back onto XY-local.
  const worldDrag=Vec3.add(new Vec3(),nodes[0].worldPosition,new Vec3(2,3,5));
  const requested=local(worldDrag),expected=planarMovePositions(1,
    originals[0],requested,originals.slice(0,2));
  a.onGizmoChanged('editorGroupWorldPosition','begin');
  knots[0].editorGroupWorldPosition=worldDrag;
  a.onGizmoChanged('editorGroupWorldPosition','update');
  eqVec(nodes[0].position,expected[0]);
  eqVec(nodes[1].position,expected[1]);
  eq(nodes[0].position.z,originals[0].z);
  eq(nodes[1].position.z,originals[1].z);
  eqVec(nodes[2].position,originals[2]);
  a.onGizmoChanged('editorGroupWorldPosition','cancel');
  nodes.forEach((n,i)=>eqVec(n.position,originals[i]));
  assert.equal(snapshots,0,'Cancel must not create an Undo entry');

  // End without update callback also projects into authored local 2D plane.
  a.onGizmoChanged('editorGroupWorldPosition','begin');
  knots[0].editorGroupWorldPosition=worldDrag;
  a.onGizmoChanged('editorGroupWorldPosition','end');
  eqVec(nodes[0].position,expected[0]);eqVec(nodes[1].position,expected[1]);
  assert.equal(snapshots,1);
  a.onGizmoChanged('editorGroupWorldPosition','begin');
  a.onGizmoChanged('editorGroupWorldPosition','end');
  assert.equal(snapshots,1,'A no-op never snapshots');

  // XZ2D: filtered Gizmos3D axes must exclude Y and XY/YZ planes.
  container.spline.dimension=2;
  hs=group(a.onGizmoHandles());
  assert.deepEqual(hs.map(h=>h.axis||h.plane),['x','z','xz']);
  const xzOriginals=nodes.map(n=>n.position.clone());
  const xzTarget=Vec3.add(new Vec3(),nodes[0].worldPosition,new Vec3(3,7,2));
  const xzExpected=planarMovePositions(2,xzOriginals[0],
   local(xzTarget),xzOriginals.slice(0,2));
  a.onGizmoChanged('editorGroupWorldPosition','begin');
  knots[0].editorGroupWorldPosition=xzTarget;
  a.onGizmoChanged('editorGroupWorldPosition','update');
  eqVec(nodes[0].position,xzExpected[0]);eqVec(nodes[1].position,xzExpected[1]);
  eq(nodes[0].position.y,xzOriginals[0].y);
  eq(nodes[1].position.y,xzOriginals[1].y);
  a.onGizmoChanged('editorGroupWorldPosition','end');
  assert.equal(snapshots,2);
  // Reject stale group when changing dimension during drag.
  const beforeInvalid=nodes.map(n=>n.position.clone());
  a.onGizmoChanged('editorGroupWorldPosition','begin');
  knots[0].editorGroupWorldPosition=Vec3.add(new Vec3(),nodes[0].worldPosition,
   new Vec3(6,5,4));
  a.onGizmoChanged('editorGroupWorldPosition','update');
  container.spline.dimension=1;
  a.onGizmoChanged('editorGroupWorldPosition','end');
  nodes.forEach((n,i)=>eqVec(n.position,beforeInvalid[i]));
  assert.equal(snapshots,2);

  // A rejected snapshot restores LOCAL positions, including hidden 2D axis.
  const beforeFail=nodes.map(n=>n.position.clone());
  snapshotAllowed=false;
  a.onGizmoChanged('editorGroupWorldPosition','begin');
  knots[0].editorGroupWorldPosition=Vec3.add(new Vec3(),nodes[0].worldPosition,
   new Vec3(5,6,8));
  a.onGizmoChanged('editorGroupWorldPosition','end');
  nodes.forEach((n,i)=>eqVec(n.position,beforeFail[i]));
  assert.equal(snapshots,3);
  snapshotAllowed=true;

  // Gizmos2D may not be installed in non-Canvas scenes; 3D fallback uses XY handles.
  delete globalThis.Gizmos2D;
  hs=group(a.onGizmoHandles());
  assert.deepEqual(hs.map(h=>h.axis||h.plane),['x','y','xy']);
  // Invalid scene selection fails closed rather than leaking a group gizmo.
  selection=['a'];
  assert.equal(group(a.onGizmoHandles()).length,0);
  delete globalThis.Editor;
  delete globalThis.Gizmos3D;
  console.log('GROUP MOVE 2D PASS: XY/XZ handle filtering, tilted/scaled Container, hidden-axis lock, Cancel, snapshot rollback.');
 }finally{Module._load=previous;}
}finally{fs.rmSync(temp,{recursive:true,force:true});}
