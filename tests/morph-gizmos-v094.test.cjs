'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-v094-'));
try {
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',tmp],{stdio:'pipe'});
 class Vec3 {
   constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
   clone(){return new Vec3(this.x,this.y,this.z);}
   set(a,b,c){if(typeof a==='object')return this.set(a.x,a.y,a.z);this.x=a;this.y=b;this.z=c;return this;}
   static transformMat4(o,p,m){return o.set(p.x+(m?.m12||0),p.y+(m?.m13||0),p.z+(m?.m14||0));}
   static subtract(o,a,b){return o.set(a.x-b.x,a.y-b.y,a.z-b.z);}
   static add(o,a,b){return o.set(a.x+b.x,a.y+b.y,a.z+b.z);}
   static multiplyScalar(o,a,n){return o.set(a.x*n,a.y*n,a.z*n);}
 }
 class Mat4 {constructor(shift=0){this.m12=shift;}static invert(out,original){out.m12=-(original?.m12||0);return out;}}
 class Node {
   constructor(shift=0){this.worldMatrix=new Mat4(shift);this.isValid=true;this.position=new Vec3();}
   setPosition(p){this.position=p.clone();}
 }
 class Component {constructor(){this.node=new Node();}}
 class Color {constructor(...values){this.values=values;}}
 const cc={_decorator:{ccclass:()=>x=>x,property:()=>{},menu:()=>x=>x,executeInEditMode:()=>x=>x},Vec3,Mat4,Node,Component,Color,Enum:x=>x};
 const orig=Module._load;
 Module._load=function(n,parent,isMain){if(n==='cc')return cc;if(n==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};return orig.call(this,n,parent,isMain);};
 try {
  const {buildMeshGizmoLines,drawMeshGizmoLines}=require(path.join(tmp,'Core/SplineMeshGizmos.js'));
  const positions=[],indices=[];
  for(let k=0;k<120;k++){
   const base=positions.length/3;
   positions.push(k,0,0,k,1,0,k+1,0,0);
   indices.push(base,base+1,base+2);
  }
  const lines=buildMeshGizmoLines(positions,indices,90);
  assert(lines.edgePairs.length<=180);assert(lines.edgePairs.length>0);
  assert(lines.positions.some((x,i)=>i%3===0&&x>100),'sample the whole mesh not just first triangles');
  assert.equal(buildMeshGizmoLines(positions,indices,0).edgePairs.length,0);
  assert.equal(buildMeshGizmoLines([0,0,0],[0,0,0],99).edgePairs.length,0);
  const oldGizmos=globalThis.Gizmos3D;
  const drawCalls=[];
  globalThis.Gizmos3D={beginColor:(n,c)=>drawCalls.push(['color',c]),drawLine:(n,a,b)=>drawCalls.push(['line',a,b])};
  drawMeshGizmoLines(new Node(),new Node(5),lines,new Color(255,0,0));
  assert.equal(drawCalls.filter(c=>c[0]==='line').length,lines.edgePairs.length/2);
  assert(drawCalls.find(c=>c[0]==='line')[1].x>=5,'transform preview edges by renderer world transform');
  globalThis.Gizmos3D=undefined;
  assert.doesNotThrow(()=>drawMeshGizmoLines(new Node(),new Node(),lines,new Color()));
  globalThis.Gizmos3D=oldGizmos;

  const {SplineMorph,MorphSpace}=require(path.join(tmp,'Components/SplineMorph.js'));
  function source(localX,worldX){return {count:2,reversed:false,node:new Node(worldX),getRevision:()=>String(localX),
   getNaturalResolvedKnots:()=>[0,1].map(i=>({position:new Vec3(localX+i*10,0,0),tangentIn:new Vec3(-2,0,0),tangentOut:new Vec3(2,0,0)})),
   evaluatePosition:t=>new Vec3(localX+t*10,0,0),evaluateWorldPositionAtT:t=>new Vec3(localX+t*10+worldX,0,0)};}
  function knot(){return {node:new Node(),tangentIn:new Vec3(),tangentOut:new Vec3(),mode:0,tangentsInKnotSpace:false,hasTangentHandles:false};}
  const output={count:2,reversed:false,node:new Node(50),knots:[knot(),knot()],refreshCalls:0,refresh(){this.refreshCalls++;}};
  const morph=new SplineMorph();morph.sourceA=source(0,10);morph.sourceB=source(0,30);morph.outputSpline=output;morph.blend=.5;
  assert.equal(morph.space,MorphSpace.World);assert.equal(morph.apply(),true);
  // A world position = 10, B world = 30; merged = 20; output world offset = 50.
  assert.equal(output.knots[0].node.position.x,-30);assert.equal(output.knots[1].node.position.x,-20);
  morph.restore();assert.equal(output.knots[0].node.position.x,0);
  morph.space=MorphSpace.Local;assert.equal(morph.apply(),true);
  // Both source local knot positions are 0 and 10 regardless of source Node translations.
  assert.equal(output.knots[0].node.position.x,0);assert.equal(output.knots[1].node.position.x,10);
  assert.equal(output.knots[0].tangentOut.x,2);
  morph.restore();
  // Changing space must invalidate the Restore hold key in editor preview.
  morph.previewInEditor=true;morph.space=MorphSpace.World;morph.update();assert.equal(output.knots[0].node.position.x,-30);
  const inspector=require(path.join(root,'src/contributions/inspector/common.js'));
  const configText=fs.readFileSync(path.join(root,'src/contributions/inspector/common.js'),'utf8');
  assert(configText.includes("fields:['blend','space','previewInEditor'"));
  for(const type of ['junctionMesh','bender','extrude','road','deform']){
   assert(configText.includes(`${type}:{`),`missing ${type} inspector`);
   const section=configText.substring(configText.indexOf(`${type}:{`),configText.indexOf('},\n ',configText.indexOf(`${type}:{`))+1);
   assert(section.includes('showMeshGizmos')&&section.includes('gizmoEdgeLimit'),`${type} missing preview fields`);
  }
  for(const type of ['SplineRoad','SplineExtrude','SplineMeshDeform','SplineJunctionMesh','SplineObjectBender']){
   const s=fs.readFileSync(path.join(root,'assets/splines/Components',type+'.ts'),'utf8');
   assert(s.includes('onDrawGizmosSelected()')&&s.includes('drawMeshGizmoLines('));
  }
  console.log('MORPH + MESH GIZMOS v0.9.4 PASS: Local/World, transform/restore, bounded wireframes, no gizmos fallback, Inspector fields.');
 } finally {Module._load=orig;}
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
