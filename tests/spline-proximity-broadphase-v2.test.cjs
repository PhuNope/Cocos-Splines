'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-broadphase-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
   '--noEmit','false','--outDir',out],{stdio:'pipe'});
 const {SplineSpatialHash3D}=require(path.join(out,'Core/SplineSpatialHash3D.js'));
 const {SplineProximityRegistry,planSplineProximity}=require(path.join(out,'Core/SplineProximity.js'));
 const {splineTrafficGate}=require(path.join(out,'Core/SplineTrafficGate.js'));
 const {splineHeadwayRegistry}=require(path.join(out,'Core/SplineHeadway.js'));
 const {splineProximityRegistry}=require(path.join(out,'Core/SplineProximity.js'));
 const {getSplineTrafficTelemetry}=require(path.join(out,'Core/SplineTrafficTelemetry.js'));
 const p=(x,y=0,z=0)=>({x,y,z}),near=(a,b,t=.002)=>assert(Math.abs(a-b)<t,a+' != '+b);
 const grid=new SplineSpatialHash3D(8,8),a={},b={},c={};
 grid.set(a,p(-1));grid.set(b,p(30));grid.set(c,p(31));
 assert.equal(grid.size,3);assert.equal(grid.cellCount,2);
 assert(grid.query(p(-8,-1,-1),p(0,1,1)).owners.has(a));
 assert(!grid.query(p(-8,-1,-1),p(0,1,1)).owners.has(b));
 grid.set(a,p(30));assert.equal(grid.cellCount,1);
 assert.equal(grid.query(p(30,-1,-1),p(32,1,1)).owners.size,3);
 grid.remove(c);assert.equal(grid.size,2);
 const fallback=grid.query(p(-200,0,0),p(200,0,0));
 assert.equal(fallback.fallback,true);
 assert.equal(fallback.owners.size,2);
 assert.throws(()=>new SplineSpatialHash3D(0),/Invalid/);
 assert.throws(()=>grid.query(p(2),p(1)),/Invalid/);
 grid.clear();assert.equal(grid.cellCount,0);
 // The pure API also samples geometry exactly once per query (not once
 // per nearby vehicle), keeping old behavior and deterministic collisions.
 let calls=0;
 const many=new Map();
 for(let i=0;i<70;i++)many.set({i},{position:p(4+i*.01),radius:.1});
 const metrics={segmentTests:0};
 let result=planSplineProximity({},t=>{calls++;return p(t*10);},many,.4,0,16,metrics);
 assert.equal(calls,17,'One path evaluation per sample, not per obstacle');
 assert(result.limited);assert(metrics.segmentTests>0);
 const reg=new SplineProximityRegistry();
 const owners=[],all=new Map(),moving={};
 for(let i=0;i<250;i++){
   const owner={i},position=p(100+i*35,100,0);
   owners.push(owner);reg.set(owner,position,.5);
   all.set(owner,{position,radius:.5});
 }
 const target={},targetPosition=p(5);
 reg.set(target,targetPosition,.5);all.set(target,{position:targetPosition,radius:.5});
 let probes=0;
 result=reg.limit(moving,t=>{probes++;return p(t*10);},.5,.2);
 const brute=planSplineProximity(moving,t=>p(t*10),all,.5,.2);
 near(result.fraction,brute.fraction);
 assert.equal(result.obstacle,target);
 let stats=reg.getTelemetry();
 assert.equal(stats.occupants,251);
 assert.equal(stats.queries,1);
 assert.equal(probes,17);
 assert.equal(stats.lastSamplePoints,17);
 assert.equal(stats.lastCandidates,1,'Distant 250 occupants must not reach narrowphase');
 assert(stats.lastSegmentTests<=16);
 assert(stats.lastVisitedCells>0);
 assert.equal(stats.lastFallback,false);
 // Moving an occupant invalidates its old cell; subsequent queries cannot see
 // its stale center and must retain exact behavior.
 reg.set(target,p(5000),.5);
 result=reg.limit(moving,t=>p(t*10),.5,.2);
 assert(!result.limited);
 assert.equal(reg.getTelemetry().lastCandidates,0);
 reg.set(target,p(5),.5);
 result=reg.limit(moving,t=>p(t*10),.5,.2);
 assert(result.limited);
 // Curved excursion: two matching endpoints should NOT cause broadphase
 // to ignore the middle of the swept polyline.
 reg.set(target,p(5,5),.5);
 result=reg.limit(moving,t=>p(10*t,5*Math.sin(Math.PI*t)),.5,.2);
 assert(result.limited,'Sampled curved path broadphase encloses the bend');
 // Huge swept boxes fall back to scanning ALL occupants, not to skipping
 // collisions or attempting unbounded triple loops.
 reg.set(target,p(5),.5);
 result=reg.limit(moving,t=>p(t*1000000),.5,0);
 assert(result.limited);
 stats=reg.getTelemetry();
 assert.equal(stats.lastFallback,true);
 assert.equal(stats.fallbackQueries,1);
 assert.equal(stats.lastCandidates,251);
 assert(stats.totalCandidates>=253);
 // Large occupied sphere center is indexed only once; expanding the query
 // bounds by the largest registered radius avoids false-negative overlaps.
 reg.clear();
 const huge={};
 reg.set(huge,p(90),100);
 result=reg.limit(moving,t=>p(t*10),.5,0);
 assert(result.stopped&&result.limited);
 reg.remove(huge);
 const after=reg.getTelemetry();
 assert.equal(after.occupants,0);
 assert.equal(after.spatialCells,0);
 assert.equal(reg.limit(moving,t=>p(t*10),.5,0).limited,false);
 assert.throws(()=>reg.limit(moving,t=>p(NaN),.5,0),/Invalid/);
 assert.throws(()=>reg.limit(moving,t=>p(0),.5,0,65),/Invalid/);
 reg.clear();assert.equal(reg.getTelemetry().queries,0);
 // Cross-subsystem read-only telemetry, no scene traversal / owner identity.
 splineTrafficGate.clear();splineHeadwayRegistry.clear();splineProximityRegistry.clear();
 const junction={},occupant={},waiter={},vehicle={},spline={};
 assert(splineTrafficGate.move(occupant,junction,3,1));
 assert(!splineTrafficGate.move(waiter,junction,3,1));
 splineHeadwayRegistry.set(vehicle,spline,.5,1,0);
 splineProximityRegistry.set(vehicle,p(2),.5);
 const traffic=getSplineTrafficTelemetry();
 assert.deepEqual(traffic.junction,{occupied:1,waiting:1,
   activeJunctions:1,occupiedExits:1,queuedExits:1});
 assert.equal(traffic.headwayFollowers,1);
 assert.equal(traffic.proximity.occupants,1);
 assert.equal(traffic.proximity.queries,0);
 assert(!('owners' in traffic.junction));
 splineTrafficGate.release(occupant);splineTrafficGate.release(waiter);
 splineHeadwayRegistry.clear();splineProximityRegistry.clear();
 console.log('SPATIAL BROADPHASE PASS: sparse cells, moving occupants, curved paths, large-step fallback, radius safety, narrowphase efficiency and telemetry.');
}finally{fs.rmSync(out,{recursive:true,force:true});}
