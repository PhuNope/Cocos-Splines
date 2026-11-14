'use strict';
/**
 * Real TS Path compiled against Cocos mocks: authored Bezier tangents,
 * Path/consumer coordinate conversion, modes, Gizmos Escape, source order,
 * Editor world-transform watcher and Play safety.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os');
const path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-v2-tangent-'));
try {
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs',
   '--strict','--experimentalDecorators','--skipLibCheck',
   '--useDefineForClassFields','false','--rootDir',
   path.join(root,'assets/splines-v2'),'--outDir',dir,
   path.join(root,'assets/splines-v2/Components/SplinePathV2.ts'),
   path.join(root,'tests/types/cc.d.ts')],{stdio:'pipe'});
 const env={EDITOR_NOT_IN_PREVIEW:true};
 class Vec3 {
   constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
   static transformMat4(out,v,m){
     out.x=v.x*m.sx+m.tx;out.y=v.y*m.sy+m.ty;out.z=v.z*m.sz+m.tz;return out;
   }
 }
 class Mat4 {
   constructor(){this.sx=1;this.sy=1;this.sz=1;this.tx=0;this.ty=0;this.tz=0;}
   static invert(out,m){
     out.sx=1/m.sx;out.sy=1/m.sy;out.sz=1/m.sz;
     out.tx=-m.tx/m.sx;out.ty=-m.ty/m.sy;out.tz=-m.tz/m.sz;
     return out;
   }
 }
 class Color{constructor(r,g,b,a=255){Object.assign(this,{r,g,b,a});}}
 class Component{}
 class Node{
   constructor(name){this.name=name;this.isValid=true;this.components=[];this.worldPosition=new Vec3();this.worldMatrix=new Mat4();}
   addComponent(Type){const v=new Type();v.node=this;this.components.push(v);return v;}
   setWorldPosition(p){this.worldPosition=new Vec3(p.x,p.y,p.z);}
 }
 const decorators={ccclass:()=>target=>target,menu:()=>target=>target,
   executeInEditMode:()=>target=>target,property:()=>()=>{}};
 const cc={_decorator:decorators,Node,Vec3,Mat4,Color,Component,Enum:x=>x};
 const original=Module._load;
 Module._load=function(id,parent,isMain){
   if(id==='cc')return cc;
   if(id==='cc/env')return env;
   return original.apply(this,arguments);
 };
 let SplinePathV2,SplinePathCurveModeV2,SplineBezierTangentModeV2,SplineBezierTangentV2,evaluateSplineV2;
 try{
   ({SplinePathV2,SplinePathCurveModeV2,SplineBezierTangentModeV2,
     SplineBezierTangentV2}=require(path.join(dir,'Components/SplinePathV2.js')));
   ({evaluateSplineV2}=require(path.join(dir,'core/SplineCurves.js')));
 }finally{Module._load=original;}
 const eq=(a,b,e=1e-5)=>assert(Math.abs(a-b)<=e,`expected ${a} ~ ${b}`);
 const pathNode=new Node('AuthoritativePath'),consumer=new Node('Road');
 pathNode.worldMatrix.sx=2;pathNode.worldMatrix.sy=2;pathNode.worldMatrix.tx=10;
 consumer.worldMatrix.tx=-2;
 const k0=new Node('K0'),k1=new Node('K1');
 k0.worldPosition=new Vec3(10,0,0);k1.worldPosition=new Vec3(22,0,0);
 const pathComp=pathNode.addComponent(SplinePathV2);
 pathComp.knots=[k0,k1];pathComp.interpolation=SplinePathCurveModeV2.Bezier;
 // Auto tangents exactly match core's natural 1/3 chord fallback.
 const auto=pathComp.getSplineDataV2(consumer);
 assert.equal(auto.type,'bezier');
 assert.equal(auto.knots[0].handleOut,undefined);
 assert.equal(auto.knots[1].handleIn,undefined);
 eq(evaluateSplineV2(auto,.5).position.y,0);
 pathComp.gizmoKnotIndex=0;
 assert.deepEqual({...pathComp.pathGizmoTangentOut},{x:2,y:0,z:0});
 const sourceMap=new Map();
 const calls=[];
 const consumerA={onSharedSplinePathEditBegin(){calls.push('startA');},
   onSharedSplinePathEdited(force){calls.push('A'+force);}};
 const consumerB={onSharedSplinePathEditBegin(){calls.push('startB');},
   onSharedSplinePathEdited(force){calls.push('B'+force);}};
 pathComp.registerPreviewConsumer(consumerA);pathComp.registerPreviewConsumer(consumerB);
 const originalGizmos=globalThis.Gizmos3D;
 const colors=[],lines=[];
 globalThis.Gizmos3D={beginColor:(owner,color)=>colors.push(color),
   drawLine:(owner,a,b)=>lines.push({a:{...a},b:{...b}}),
   drawSphere:()=>{},move:(property,opts)=>Array.from({length:6},(_,i)=>({
     id:property+i,property,space:opts.space,visual:'axis',plane:'xy'
   }))};
 try{
   const hs=pathComp.onGizmoHandles();
   assert.equal(hs.length,9,'6 move, 1 other Knot and two tangent points');
   assert.deepEqual(hs.slice(-2).map(h=>h.property),
     ['pathGizmoTangentIn','pathGizmoTangentOut']);
   assert(hs.slice(-2).every(h=>h.visual==='point'&&h.plane==='view'));
   assert.equal(pathComp.onGizmoHudControls().length,3);
   pathComp.onDrawGizmosSelected();
   assert(lines.length>2,'Selected Bezier Path draws tangent control segments');
   assert(colors.some(c=>c.r===181&&c.g===140),'incoming control has distinct color');
   // Editing a missing Auto entry materializes a manual pair; Cancel
   // must remove the newly-created record (restoring Auto semantics).
   pathComp.onGizmoChanged('pathGizmoTangentOut','begin');
   assert(calls.includes('startA')&&calls.includes('startB'));
   pathComp.pathGizmoTangentOut=new Vec3(2,3,0);
   assert.equal(pathComp.bezierTangents.length,1);
   assert.equal(pathComp.bezierTangents[0].mode,SplineBezierTangentModeV2.Free);
   pathComp.onGizmoChanged('pathGizmoTangentOut','update');
   assert(calls.includes('Afalse')&&calls.includes('Bfalse'));
   pathComp.pathGizmoTangentOut=new Vec3(2,0,0);
   pathComp.onGizmoChanged('pathGizmoTangentOut','cancel');
   assert.equal(pathComp.bezierTangents.length,0,
     'Escape restores the absence of an authored tangent record');
   assert.equal(pathComp.getSplineDataV2(consumer).knots[0].handleOut,undefined);
   assert(calls.includes('Atrue')&&calls.includes('Btrue'));
   // Commit explicit tangents and verify actual core Bezier math in
   // consumer-local coordinates (Path sx=2, sy=2, consumer tx=-2).
   pathComp.onGizmoChanged('pathGizmoTangentOut','begin');
   pathComp.pathGizmoTangentOut=new Vec3(2,3,0);
   pathComp.onGizmoChanged('pathGizmoTangentOut','end');
   pathComp.gizmoKnotIndex=1;
   pathComp.onGizmoChanged('pathGizmoTangentIn','begin');
   pathComp.pathGizmoTangentIn=new Vec3(4,3,0);
   pathComp.onGizmoChanged('pathGizmoTangentIn','end');
   assert.equal(pathComp.bezierTangents.length,2);
   const shaped=pathComp.getSplineDataV2(consumer);
   assert.deepEqual(shaped.knots[0].handleOut,{x:4,y:6,z:0});
   assert.deepEqual(shaped.knots[1].handleIn,{x:-4,y:6,z:0});
   eq(evaluateSplineV2(shaped,.5).position.y,4.5);
   // Tangents follow source Node identities, not Path array indices.
   pathComp.knots=[k1,k0];
   const reordered=pathComp.getSplineDataV2(consumer);
   assert.deepEqual(reordered.knots[0].handleIn,{x:-4,y:6,z:0});
   assert.deepEqual(reordered.knots[1].handleOut,{x:4,y:6,z:0});
   pathComp.knots=[k0,k1];
   // Aligned retains the opposite length and flips its direction.
   pathComp.setBezierTangentMode(0,SplineBezierTangentModeV2.Aligned);
   pathComp.gizmoKnotIndex=0;
   const oppositeBefore=pathComp.bezierTangents[0].handleIn;
   const lenBefore=Math.hypot(oppositeBefore.x,oppositeBefore.y,oppositeBefore.z);
   pathComp.pathGizmoTangentOut=new Vec3(1,4,0);
   const aligned=pathComp.bezierTangents[0];
   eq(Math.hypot(aligned.handleIn.x,aligned.handleIn.y,aligned.handleIn.z),lenBefore);
   eq(aligned.handleIn.x*aligned.handleOut.y-aligned.handleIn.y*aligned.handleOut.x,0);
   assert(aligned.handleIn.x*aligned.handleOut.x+
          aligned.handleIn.y*aligned.handleOut.y<=0);
   // Mirrored keeps equal lengths, and Escape restores both offsets.
   pathComp.setBezierTangentMode(0,SplineBezierTangentModeV2.Mirrored);
   pathComp.onGizmoChanged('pathGizmoTangentOut','begin');
   const savedIn={...aligned.handleIn},savedOut={...aligned.handleOut};
   pathComp.pathGizmoTangentOut=new Vec3(1,5,0);
   eq(pathComp.bezierTangents[0].handleIn.y,
      -pathComp.bezierTangents[0].handleOut.y);
   pathComp.onGizmoChanged('pathGizmoTangentOut','cancel');
   assert.deepEqual({...aligned.handleIn},savedIn);
   assert.deepEqual({...aligned.handleOut},savedOut);
   assert.equal(aligned.mode,SplineBezierTangentModeV2.Mirrored);
   // Duplicated control records must reject ambiguous authoring.
   const duplicate=new SplineBezierTangentV2();duplicate.knot=k0;
   pathComp.bezierTangents.push(duplicate);
   assert.throws(()=>pathComp.getSplineDataV2(consumer),/duplicate/i);
   pathComp.bezierTangents.pop();
   // Inspector mutations are observed without Gizmos callbacks.
   const realDate=Date.now;let now=realDate();Date.now=()=>now;
   try{
     pathComp.update(0);
     const before=calls.length;
     pathComp.bezierTangents[0].handleIn.x+=.5;
     now+=70;pathComp.update(0);
     assert(calls.length>before&&calls.includes('Afalse'));
     now+=190;pathComp.update(0);
     assert.equal(calls.at(-2),'Atrue');
     assert.equal(calls.at(-1),'Btrue');
   }finally{Date.now=realDate;}
   // Runtime must never let an Editor-only tangent gizmo mutate source.
   env.EDITOR_NOT_IN_PREVIEW=false;
   const snapshot=JSON.stringify(pathComp.bezierTangents);
   pathComp.pathGizmoTangentOut=new Vec3(100,0,0);
   pathComp.onGizmoChanged('pathGizmoTangentOut','update');
   assert.equal(JSON.stringify(pathComp.bezierTangents),snapshot);
   assert.equal(pathComp.onGizmoHandles().length,0);
   env.EDITOR_NOT_IN_PREVIEW=true;
 }finally{
   globalThis.Gizmos3D=originalGizmos;
   env.EDITOR_NOT_IN_PREVIEW=true;
   pathComp.unregisterPreviewConsumer(consumerA);
   pathComp.unregisterPreviewConsumer(consumerB);
 }
 console.log('V2 BEZIER TANGENTS PASS: local/world transforms, modes, stable Knot binding, Gizmos/Cancel, Inspector watcher, Play safety.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
