'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-shape-narrowphase-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
     '--noEmit','false','--outDir',out],{stdio:'pipe'});
 const {sweptSphereAabbEntry,aabbFromCenterHalfExtents,sweptSphereObbEntry,validProximityObb,sweptSphereCapsuleEntry,validProximityCapsule}=
     require(path.join(out,'Core/SplineProximityShapes.js'));
 const {SplineProximityRegistry}=require(path.join(out,'Core/SplineProximity.js'));
 const p=(x,y=0,z=0)=>({x,y,z});
 const near=(v,expected,epsilon=1e-5)=>assert(Math.abs(v-expected)<=epsilon,
     v+' != '+expected);
 const box=aabbFromCenterHalfExtents(p(5,0,0),p(1,.2,.2));
 assert.deepEqual(box,{min:p(4,-.2,-.2),max:p(6,.2,.2)});
 near(sweptSphereAabbEntry(p(0),p(10),box,.5),.35);
 assert.equal(sweptSphereAabbEntry(p(0,1.2),p(10,1.2),box,.5),null,
   'Long, thin World Collider must not have spherical false-positive off to one side');
 assert.equal(sweptSphereAabbEntry(p(0,1.2,1.2),p(10,1.2,1.2),box,.5),null,
   'Diagonal inflated-AABB corner is not inside a rounded sphere sweep');
 near(sweptSphereAabbEntry(p(0,0,0),p(10,0,0),box,.5),.35);
 assert.equal(sweptSphereAabbEntry(p(4.2,0,0),p(5,0,0),box,.5),0);
 assert.equal(sweptSphereAabbEntry(p(0),p(-10),box,.5),null);
 assert.equal(sweptSphereAabbEntry(p(0,4),p(10,4),box,.5),null);
 near(sweptSphereAabbEntry(p(10),p(0),box,.5),.35);
 assert.equal(aabbFromCenterHalfExtents(p(NaN),p(1)),null);
 assert.equal(aabbFromCenterHalfExtents(p(0),p(-1)),null);
 assert.throws(()=>sweptSphereAabbEntry(p(0),p(1),
     {min:p(2),max:p(1)},.5),/Invalid/);

 const registry=new SplineProximityRegistry();
 const obstacle={},mover={};
 const radius=Math.hypot(1,.2,.2);
 registry.set(obstacle,p(5),radius,box);
 let frames=0;
 let report=registry.limit(mover,t=>{frames++;return p(10*t,1.2);},.5,0);
 assert.equal(report.limited,false,'AABB shape resolves false positive from bounding sphere');
 assert.equal(frames,17,'Swept path samples once per query');
 assert.equal(registry.getTelemetry().lastCandidates,1,
   'Conservative sphere broadphase must retain collider candidate');
 const oldSphere=new SplineProximityRegistry();
 oldSphere.set(obstacle,p(5),radius);
 assert(oldSphere.limit(mover,t=>p(10*t,1.2),.5,0).limited,
   'Legacy sphere broadphase intentionally remains conservative');
 report=registry.limit(mover,t=>p(10*t),.5,0);
 assert(report.limited);near(report.fraction,.35,3e-4);
 const readonly=registry.get(obstacle);
 readonly.bounds.min.x=-99;
 assert.equal(registry.get(obstacle).bounds.min.x,4,
   'World bounds cannot be mutated through registry snapshots');
 // Moving or resized Colliders update the existing spatial record without leaking cells.
 const relocated=aabbFromCenterHalfExtents(p(100,3),p(1,.2,.2));
 registry.set(obstacle,p(100,3),radius,relocated);
 assert(!registry.limit(mover,t=>p(10*t),.5,0).limited);
 registry.set(obstacle,p(5),radius,box);
 assert(registry.limit(mover,t=>p(10*t),.5,0).limited);
 registry.remove(obstacle);
 assert.equal(registry.size,0);
 assert.equal(registry.getTelemetry().spatialCells,0);
 assert.throws(()=>registry.set({},p(0),.5,{min:p(1),max:p(0)}),/Invalid/);

 // Rotated long thin obstacle: the world AABB includes empty corners.
 const k=Math.SQRT1_2;
 const obb={center:p(5,0,0),half:p(2,.2,.2),axes:[p(k,0,k),p(0,1,0),p(-k,0,k)]};
 const world=(x,y,z)=>p(5+k*(x-z),y,k*(x+z));
 assert(validProximityObb(obb));
 near(sweptSphereObbEntry(world(-5,0,0),world(5,0,0),obb,.5),.25);
 near(sweptSphereObbEntry(world(5,0,0),world(-5,0,0),obb,.5),.25);
 assert.equal(sweptSphereObbEntry(world(-5,0,1),world(5,0,1),obb,.5),null);
 assert.equal(sweptSphereObbEntry(world(0,0,0),world(0,0,0),obb,.5),0);
 assert.equal(sweptSphereObbEntry(world(0,0,1),world(0,0,1),obb,.5),null);
 near(sweptSphereObbEntry(world(-5,0,0),world(-2.5,0,0),obb,.5),1);
 const bad={...obb,axes:[p(1),p(1),p(0,0,1)]};
 assert(!validProximityObb(bad));
 assert.throws(()=>registry.setObb(obstacle,bad),/Invalid/);
 registry.setObb(obstacle,obb);
 assert.equal(registry.limit(mover,t=>world(-5+10*t,0,1),.5,0).limited,false);
 assert.equal(registry.getTelemetry().lastCandidates,1);
 report=registry.limit(mover,t=>world(-5+10*t,0,0),.5,0);
 assert(report.limited);near(report.fraction,.25,3e-4);
 // Input and read-back are independent snapshots, including nested axes.
 obb.center.x=500;obb.axes[0].x=0;
 const copy=registry.get(obstacle);
 assert.equal(copy.obb.center.x,5);near(copy.obb.axes[0].x,k);
 copy.obb.axes[0].x=123;
 near(registry.get(obstacle).obb.axes[0].x,k);
 registry.set(obstacle,p(5),2);
 assert.equal(registry.get(obstacle).obb,undefined);
 // Combined moving sphere radius and safety gap may legally exceed 100.
 registry.set(obstacle,p(5),2,box);
 assert(registry.limit(mover,t=>p(10*t),80,80).stopped);
 // Endpoint-only touch must still apply the conservative stop margin.
 registry.set(obstacle,p(5),1);
 assert(registry.limit(mover,t=>p(3.5*t),.5,0).limited);

 // Stationary capsule: side, rounded caps, tangent, axial/reverse and sphere limit.
 const cap={a:p(3),b:p(7),radius:.5};
 assert(validProximityCapsule(cap));
 near(sweptSphereCapsuleEntry(p(0),p(10),cap,.5),.2);
 near(sweptSphereCapsuleEntry(p(10),p(0),cap,.5),.2);
 near(sweptSphereCapsuleEntry(p(5,3),p(5,-3),cap,.5),1/3);
 near(sweptSphereCapsuleEntry(p(0,1),p(10,1),cap,.5),.3,1e-5);
 assert.equal(sweptSphereCapsuleEntry(p(0,1.01),p(10,1.01),cap,.5),null);
 assert.equal(sweptSphereCapsuleEntry(p(5),p(5),cap,.5),0);
 assert.equal(sweptSphereCapsuleEntry(p(5,2),p(5,2),cap,.5),null);
 near(sweptSphereCapsuleEntry(p(0),p(2),cap,.5),1);
 near(sweptSphereCapsuleEntry(p(0),p(10),{a:p(5),b:p(5),radius:.5},.5),.4);
 const diagonal={a:p(3,0,3),b:p(7,0,7),radius:.5};
 near(sweptSphereCapsuleEntry(p(5,3,5),p(5,-3,5),diagonal,.5),1/3);
 assert.throws(()=>registry.setCapsule(obstacle,{...cap,radius:-1}),/Invalid/);
 registry.setCapsule(obstacle,cap);
 report=registry.limit(mover,t=>p(t*10),.5,0);
 assert(report.limited);near(report.fraction,.2,3e-4);
 assert(!registry.limit(mover,t=>p(t*10,1.2),.5,0).limited);
 assert.equal(registry.getTelemetry().lastCandidates,1);
 report=registry.limit(mover,t=>p(t*10),.5,.5);
 near(report.fraction,.15,3e-4);
 cap.a.x=99;
 assert.equal(registry.get(obstacle).capsule.a.x,3);
 registry.get(obstacle).capsule.b.x=99;
 assert.equal(registry.get(obstacle).capsule.b.x,7);
 registry.setCapsule(obstacle,{a:p(103),b:p(107),radius:.5});
 assert(!registry.limit(mover,t=>p(t*10),.5,0).limited);
 registry.set(obstacle,p(5),1);
 assert.equal(registry.get(obstacle).capsule,undefined);
 registry.remove(obstacle);assert.equal(registry.size,0);
 assert.equal(registry.getTelemetry().spatialCells,0);
 oldSphere.clear();registry.clear();
 console.log('PROXIMITY SHAPES PASS: swept Sphere–World-AABB/OBB/capsule, rounded corners and caps, no long-box false positive, conservative broadphase and registry cleanup.');
}finally{fs.rmSync(out,{recursive:true,force:true});}
