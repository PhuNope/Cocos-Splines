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
     const angle=m.rz||0,c=Math.cos(angle),s=Math.sin(angle);
     out.x=(v.x*c-v.y*s)*m.sx+m.tx;
     out.y=(v.x*s+v.y*c)*m.sy+m.ty;
     out.z=v.z*m.sz+m.tz;return out;
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
   constructor(name){
     this.name=name;this.isValid=true;this.components=[];
     this.worldPosition=new Vec3();this.worldMatrix=new Mat4();
     this._euler=new Vec3();
   }
   get eulerAngles(){return this._euler;}
   set eulerAngles(v){
     this._euler=new Vec3(v.x,v.y,v.z);
     this.worldMatrix.rz=v.z*Math.PI/180;
   }
   setRotationFromEuler(v){this.eulerAngles=v;}
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
 let SplinePathV2,SplinePathCurveModeV2,SplineBezierTangentModeV2,SplineKnotRecordV2,SplinePathRotationModeV2,evaluateSplineV2;
 try{
   ({SplinePathV2,SplinePathCurveModeV2,SplineBezierTangentModeV2,
     SplineKnotRecordV2,SplinePathRotationModeV2}=require(path.join(dir,'Components/SplinePathV2.js')));
   ({evaluateSplineV2}=require(path.join(dir,'core/SplineCurves.js')));
 }finally{Module._load=original;}
 const eq=(a,b,e=1e-5)=>assert(Math.abs(a-b)<=e,`expected ${a} ~ ${b}`);
 const pathNode=new Node('AuthoritativePath'),consumer=new Node('Road');
 pathNode.worldMatrix.sx=2;pathNode.worldMatrix.sy=2;pathNode.worldMatrix.tx=10;
 consumer.worldMatrix.tx=-2;
 const k0=new SplineKnotRecordV2(),k1=new SplineKnotRecordV2();
 k0.position=new Vec3(0,0,0);k1.position=new Vec3(6,0,0);
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
 const originalGizmos2D=globalThis.Gizmos2D;
 const colors=[],lines=[];
 globalThis.Gizmos3D={beginColor:(owner,color)=>colors.push(color),
   drawLine:(owner,a,b)=>lines.push({a:{...a},b:{...b}}),
   drawSphere:()=>{},move:(property,opts)=>Array.from({length:6},(_,i)=>({
     id:property+i,property,space:opts.space,visual:'axis',plane:'xy'
   })),
   rotate:(property,opts)=>['x','y','z'].map(axis=>({
     property,axis,visual:'rotation',snap:opts.snap,space:opts.space
   }))};
 globalThis.Gizmos2D={
   rotate:(property,opts)=>[{property,axis:'z',visual:'rotation',
     snap:opts.snap,space:opts.space}]
 };
 try{
   const hs=pathComp.onGizmoHandles();
   assert.equal(hs.length,9,'6 move, 1 other Knot and two tangent points');
   assert.deepEqual(hs.slice(-2).map(h=>h.property),
     ['pathGizmoTangentIn','pathGizmoTangentOut']);
   assert(hs.slice(-2).every(h=>h.visual==='point'&&h.plane==='view'));
   assert.equal(pathComp.onGizmoHudControls().length,5);
   const rollHud=pathComp.onGizmoHudControls().find(x=>x.property==='pathGizmoActiveRoll');
   assert.deepEqual({min:rollHud.min,max:rollHud.max,step:rollHud.step},
     {min:-180,max:180,step:1});
   pathComp.onDrawGizmosSelected();
   assert(lines.length>2,'Selected Bezier Path draws tangent control segments');
   assert(colors.some(c=>c.r===181&&c.g===140),'incoming control has distinct color');
   assert(colors.some(c=>c.r===255&&c.g===174),
     'Selected Knot roll right vector should draw as orange crossbar');
   assert(colors.some(c=>c.r===115&&c.g===255),
     'Selected Knot roll up vector should draw in green');
   const baseGuideLines=lines.length;
   pathComp.gizmoShowRollGuide=false;
   lines.length=0;
   pathComp.onDrawGizmosSelected();
   assert.equal(lines.length,baseGuideLines-2,
     'Disabling the bank guide should remove exactly two visual guide lines');
   pathComp.gizmoShowRollGuide=true;
   const rollCallsBefore=calls.length;
   pathComp.gizmoKnotIndex=0;
   pathComp.onGizmoHudChanged('pathGizmoActiveRoll','begin',0);
   assert.throws(()=>pathComp.editKnot('duplicate',0),/during a Gizmos drag/,
     'Path topology must remain stable during a HUD roll gesture');
   pathComp.pathGizmoActiveRoll=35;
   assert.equal(k0.rollDegrees,35);
   pathComp.gizmoKnotIndex=1;
   assert.equal(pathComp.pathGizmoActiveRoll,35,
     'HUD slider pins Knot identity despite Inspector index changes');
   pathComp.pathGizmoActiveRoll=40;
   assert.equal(k0.rollDegrees,40);
   assert.equal(k1.rollDegrees,0);
   pathComp.onGizmoHudChanged('pathGizmoActiveRoll','update',40);
   pathComp.onGizmoHudChanged('pathGizmoActiveRoll','cancel',0);
   assert.equal(k0.rollDegrees,0,'Escape restores original bank');
   assert.equal(k1.rollDegrees,0,'Escape never modifies another Knot');
   assert(calls.length>rollCallsBefore&&calls.at(-1)==='Btrue');
   pathComp.gizmoKnotIndex=0;
   pathComp.onGizmoHudChanged('pathGizmoActiveRoll','begin',0);
   pathComp.pathGizmoActiveRoll=-22;
   pathComp.onGizmoHudChanged('pathGizmoActiveRoll','update',-22);
   pathComp.onGizmoHudChanged('pathGizmoActiveRoll','end',-22);
   assert.equal(k0.rollDegrees,-22,'HUD End commits bank to actual Knot');
   assert.equal(pathComp.getSplineDataV2(consumer).knots[0].rollDegrees,-22);
   pathComp.pathGizmoActiveRoll=181;
   assert.equal(k0.rollDegrees,-22,'HUD roll rejects out-of-range values');
   pathComp.pathGizmoActiveRoll=-Infinity;
   assert.equal(k0.rollDegrees,-22,'HUD roll rejects nonfinite values');
   k0.rollDegrees=0;
   // Editing a missing Auto entry materializes a manual pair; Cancel
   // must remove the newly-created record (restoring Auto semantics).
   pathComp.onGizmoChanged('pathGizmoTangentOut','begin');
   assert(calls.includes('startA')&&calls.includes('startB'));
   pathComp.pathGizmoTangentOut=new Vec3(2,3,0);
   assert.equal(pathComp.knots.length,2);
   assert.equal(k0.mode,SplineBezierTangentModeV2.Free);
   pathComp.onGizmoChanged('pathGizmoTangentOut','update');
   assert(calls.includes('Afalse')&&calls.includes('Bfalse'));
   pathComp.pathGizmoTangentOut=new Vec3(2,0,0);
   pathComp.onGizmoChanged('pathGizmoTangentOut','cancel');
   assert.equal(k0.mode,SplineBezierTangentModeV2.Auto,
     'Escape restores Auto tangent behavior without creating another record');
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
   assert.equal(k0.mode,SplineBezierTangentModeV2.Free);
   assert.equal(k1.mode,SplineBezierTangentModeV2.Free);
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
   const oppositeBefore=k0.handleIn;
   const lenBefore=Math.hypot(oppositeBefore.x,oppositeBefore.y,oppositeBefore.z);
   pathComp.pathGizmoTangentOut=new Vec3(1,4,0);
   const aligned=k0;
   eq(Math.hypot(aligned.handleIn.x,aligned.handleIn.y,aligned.handleIn.z),lenBefore);
   eq(aligned.handleIn.x*aligned.handleOut.y-aligned.handleIn.y*aligned.handleOut.x,0);
   assert(aligned.handleIn.x*aligned.handleOut.x+
          aligned.handleIn.y*aligned.handleOut.y<=0);
   // Mirrored keeps equal lengths, and Escape restores both offsets.
   pathComp.setBezierTangentMode(0,SplineBezierTangentModeV2.Mirrored);
   pathComp.onGizmoChanged('pathGizmoTangentOut','begin');
   const savedIn={...aligned.handleIn},savedOut={...aligned.handleOut};
   pathComp.pathGizmoTangentOut=new Vec3(1,5,0);
   eq(k0.handleIn.y,-k0.handleOut.y);
   pathComp.onGizmoChanged('pathGizmoTangentOut','cancel');
   assert.deepEqual({...aligned.handleIn},savedIn);
   assert.deepEqual({...aligned.handleOut},savedOut);
   assert.equal(aligned.mode,SplineBezierTangentModeV2.Mirrored);
   // Duplicated control records must reject ambiguous authoring.
   pathComp.knots.push(k0);
   assert.throws(()=>pathComp.getSplineDataV2(consumer),/not be reused/i);
   pathComp.knots.pop();
   // Inspector mutations are observed without Gizmos callbacks.
   const realDate=Date.now;let now=realDate();Date.now=()=>now;
   try{
     pathComp.update(0);
     const before=calls.length;
     k0.handleIn.x+=.5;
     now+=70;pathComp.update(0);
     assert(calls.length>before&&calls.includes('Afalse'));
     now+=190;pathComp.update(0);
     assert.equal(calls.at(-2),'Atrue');
     assert.equal(calls.at(-1),'Btrue');
   }finally{Date.now=realDate;}
   // Rotation presets use native SDK descriptors around the selected
   // Path Node. They must never pretend to pivot about a non-Node Knot.
   pathComp.gizmoRotationMode=SplinePathRotationModeV2.Planar2D;
   pathComp.gizmoRotationSnap=15;
   assert.deepEqual(pathComp.onGizmoHandles().map(h=>h.axis),['z']);
   assert(pathComp.onGizmoHandles().every(h=>h.snap===15));
   assert.equal(pathComp.pathGizmoRotationEuler.z,0);
   const beforeRotate=pathComp.getKnotWorldPosition(1);
   pathComp.onGizmoChanged('pathGizmoRotationEuler','begin');
   pathComp.pathGizmoRotationEuler=new Vec3(90,60,90);
   assert.deepEqual({...pathNode.eulerAngles},{x:0,y:0,z:90},
       '2D Rotate only modifies Path Node Z Euler');
   assert.notDeepEqual({...pathComp.getKnotWorldPosition(1)},{...beforeRotate});
   pathComp.onGizmoChanged('pathGizmoRotationEuler','update');
   assert(calls.includes('Afalse')&&calls.includes('Bfalse'));
   pathComp.onGizmoChanged('pathGizmoRotationEuler','cancel');
   assert.deepEqual({...pathNode.eulerAngles},{x:0,y:0,z:0},
       'Escape restores the entire Path Node Euler value');
   assert.deepEqual({...pathComp.getKnotWorldPosition(1)},{...beforeRotate});
   pathComp.gizmoRotationMode=SplinePathRotationModeV2.Spatial3D;
   pathComp.gizmoRotationSnap=0;
   assert.deepEqual(pathComp.onGizmoHandles().map(h=>h.axis),['x','y','z']);
   assert(pathComp.onGizmoHandles().every(h=>h.snap===undefined));
   pathComp.onGizmoChanged('pathGizmoRotationEuler','begin');
   pathComp.pathGizmoRotationEuler=new Vec3(10,20,30);
   pathComp.onGizmoChanged('pathGizmoRotationEuler','end');
   assert.deepEqual({...pathNode.eulerAngles},{x:10,y:20,z:30});
   assert(calls.at(-1)==='Btrue','3D rotation end forces final consumer preview');
   pathComp.gizmoRotationMode=SplinePathRotationModeV2.Planar2D;
   pathComp.pathGizmoRotationEuler=new Vec3(99,99,40);
   assert.deepEqual({...pathNode.eulerAngles},{x:10,y:20,z:40},
       '2D rotates Z while preserving existing 3D X/Y Euler');
   pathComp.gizmoRotationMode=SplinePathRotationModeV2.Knots;
   assert(pathComp.onGizmoHandles().some(h=>h.property==='pathGizmoKnotPosition'));
   pathNode.eulerAngles=new Vec3();
   // Roll lives on the Knot value, not Node rotation; changing it must
   // reach every mesh consumer through the Path source snapshot.
   k0.rollDegrees=35;k1.rollDegrees=-10;
   assert.deepEqual(pathComp.getSplineDataV2(consumer).knots.map(k=>k.rollDegrees),
      [35,-10]);
   k0.rollDegrees=0;k1.rollDegrees=0;
   // Creator Undo/deserializer may replace Knot value objects during
   // an in-flight gesture: onRestore must discard stale proxy targets.
   pathComp.gizmoKnotIndex=0;
   const staleKnot=k0;
   pathComp.onGizmoChanged('pathGizmoKnotPosition','begin');
   const revived=new SplineKnotRecordV2();
   revived.position=new Vec3(2,2,2);
   const revivedOther=new SplineKnotRecordV2();
   revivedOther.position=new Vec3(6,0,0);
   pathComp.knots=[revived,revivedOther];
   const restoresBefore=calls.length;
   pathComp.onRestore();
   assert.equal(calls.length,restoresBefore+2);
   assert(calls.at(-1)==='Btrue',
     'Creator restore must force final refresh for all linked generators');
   pathComp.pathGizmoKnotPosition=new Vec3(3,3,3);
   assert.deepEqual({...revived.position},{x:3,y:3,z:3});
   assert.notDeepEqual({...staleKnot.position},{x:3,y:3,z:3},
     'Restored Path must not write to a stale Knot record');
   pathComp.onGizmoHudChanged('pathGizmoActiveRoll','begin',0);
   const revivedAgain=new SplineKnotRecordV2();
   revivedAgain.position=new Vec3(4,4,4);
   pathComp.knots=[revivedAgain,revivedOther];
   pathComp.onRestore();
   pathComp.pathGizmoActiveRoll=30;
   assert.equal(revivedAgain.rollDegrees,30);
   assert.equal(revived.rollDegrees,0,
     'Restored Path must not retain old HUD Roll target');
   // Restore fixture to test runtime guard and topology independently.
   pathComp.knots=[k0,k1];
   pathComp.onRestore();
   // Runtime must never let an Editor-only tangent gizmo mutate source.
   env.EDITOR_NOT_IN_PREVIEW=false;
   const snapshot=JSON.stringify(pathComp.knots);
   pathComp.pathGizmoActiveRoll=60;
   pathComp.onGizmoHudChanged('pathGizmoActiveRoll','begin',60);
   pathComp.onGizmoHudChanged('pathGizmoActiveRoll','update',60);
   assert.equal(JSON.stringify(pathComp.knots),snapshot,
     'HUD bank edits are disabled in Play');
   pathComp.pathGizmoTangentOut=new Vec3(100,0,0);
   pathComp.onGizmoChanged('pathGizmoTangentOut','update');
   assert.equal(JSON.stringify(pathComp.knots),snapshot);
   assert.equal(pathComp.onGizmoHandles().length,0);
   env.EDITOR_NOT_IN_PREVIEW=true;
 }finally{
   globalThis.Gizmos3D=originalGizmos;
   globalThis.Gizmos2D=originalGizmos2D;
   env.EDITOR_NOT_IN_PREVIEW=true;
   pathComp.unregisterPreviewConsumer(consumerA);
   pathComp.unregisterPreviewConsumer(consumerB);
 }
 // Custom Inspector topology operations act only on pure Vec3 records.
 // No Node for Knot storage, no independent per-Node tangent components.
 assert(pathComp.knots.every(k=>k instanceof SplineKnotRecordV2&&!(k instanceof Node)));
 assert.deepEqual({...pathComp.getKnotWorldPosition(1)},{x:22,y:0,z:0});
 const between=pathComp.editKnot('insert',0);
 assert.equal(between,1);
 assert.deepEqual({...pathComp.knots[1].position},{x:3,y:0,z:0},
   'Insert After chooses midpoint of local segment');
 const same=pathComp.knots[1];
 assert.equal(pathComp.editKnot('up',1),0);
 assert.strictEqual(pathComp.knots[0],same,'Move Up preserves whole Knot record');
 assert.equal(pathComp.editKnot('down',0),1);
 assert.strictEqual(pathComp.knots[1],same);
 assert.equal(pathComp.editKnot('duplicate',1),2);
 assert.notStrictEqual(pathComp.knots[2],same);
 assert.equal(pathComp.knots[2].position.x,same.position.x+1,
   'Duplicate offsets its position and avoids a degenerate zero-length segment');
 assert.equal(pathComp.editKnot('remove',2),2);
 assert.equal(pathComp.editKnot('remove',1),1);
 assert.throws(()=>pathComp.editKnot('remove',1),/at least two/);
 assert.equal(pathComp.editKnot('add',0),2);
 assert.deepEqual({...pathComp.knots[2].position},{x:12,y:0,z:0},
   'Add extrapolates last Path segment in local coordinates');
 assert.throws(()=>pathComp.editKnot('bad',0),/Unknown/);
 env.EDITOR_NOT_IN_PREVIEW=false;
 assert.throws(()=>pathComp.editKnot('add',0),/Editor-only/);
 env.EDITOR_NOT_IN_PREVIEW=true;
 assert.equal(pathComp.knots.length,3);
 console.log('V2 PURE VEC3 KNOTS & BEZIER PASS: local/world transforms, modes, stable Knot binding, Gizmos/Cancel, Inspector watcher, Play safety.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
