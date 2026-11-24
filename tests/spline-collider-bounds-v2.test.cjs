'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-collider-bounds-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',out],{stdio:'pipe'});
 const {colliderProximityRadius,colliderWorldObb,colliderWorldCapsule}=require(path.join(out,'Core/SplineColliderBounds.js'));
 const p=(x,y=0,z=0)=>({x,y,z});
 const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<t,a+' != '+b);
 const box={center:p(0),halfExtents:p(1,.5,.25)};
 let report=colliderProximityRadius(box,p(0),.5);
 near(report.radius,Math.hypot(1,.5,.25));
 assert(report.valid&&report.source==='collider');
 report=colliderProximityRadius(box,p(2),.5);
 near(report.radius,Math.hypot(1,.5,.25)+2);
 assert(report.valid,'Collider center offset must inflate the target-centered sphere');
 report=colliderProximityRadius({center:p(0),halfExtents:p(2,1,.5)},p(0),.5);
 near(report.radius,Math.hypot(2,1,.5)); // nonuniform World extents
 for(const invalid of [
   null,undefined,{center:p(NaN),halfExtents:p(1)},
   {center:p(0),halfExtents:p(-1,1,1)},
   {center:p(0),halfExtents:p(0,0,0)},
   {center:p(500),halfExtents:p(100,100,100)}
 ]){
   const fallback=colliderProximityRadius(invalid,p(0),.5);
   assert.deepEqual(fallback,{radius:.5,valid:false,source:'fallback'});
 }
 assert.deepEqual(colliderProximityRadius(box,null,.5),
   {radius:.5,valid:false,source:'fallback'});
 assert.throws(()=>colliderProximityRadius(box,p(0),-1),/Invalid/);
 // Rotated box, off-center geometry, orthogonal nonuniform scale.
 const k=Math.SQRT1_2,m={m00:2*k,m01:0,m02:2*k,m04:0,m05:3,m06:0,
    m08:-k,m09:0,m10:k,m12:10,m13:2,m14:4};
 const local=p(1,0,0),size=p(2,2,2);
 const world={center:p(10+2*k,2,4+2*k),halfExtents:p(3*k,3,3*k)};
 const obb=colliderWorldObb(local,size,m,world);
 assert(obb);near(obb.half.x,2);near(obb.half.y,3);near(obb.half.z,1);
 near(obb.center.x,world.center.x);near(obb.axes[0].z,k);
 assert.equal(colliderWorldObb(local,size,{...m,m04:.4},world),null,'shear');
 assert.equal(colliderWorldObb(local,size,{...m,m05:-3},world),null,'reflection');
 assert.equal(colliderWorldObb(local,size,{...m,m05:0},world),null,'singular');
 assert.equal(colliderWorldObb(local,size,m,{...world,center:p(0)}),null,'stale center');
 assert.equal(colliderWorldObb(local,size,m,{...world,halfExtents:p(1,3,1)}),null,'backend extents mismatch');
 assert.equal(colliderWorldObb(local,p(-2,2,2),m,world),null);
 assert.equal(colliderWorldObb(local,size,{...m,m00:NaN},world),null);
 const uniform={m00:0,m01:2,m02:0,m04:-2,m05:0,m06:0,
    m08:0,m09:0,m10:2,m12:10,m13:2,m14:4};
 const capCenter=p(10,4,4);
 for(const direction of [0,1,2]){
    const half=[p(1,3,1),p(3,1,1),p(1,1,3)][direction];
    const wb={center:capCenter,halfExtents:half};
    const cap=colliderWorldCapsule(p(1),.5,2,direction,uniform,wb);
    assert(cap,'axis '+direction);near(cap.radius,1);
    near(Math.hypot(cap.b.x-cap.a.x,cap.b.y-cap.a.y,cap.b.z-cap.a.z),4);
    near((cap.a.y+cap.b.y)/2,4);
    assert.equal(colliderWorldCapsule(p(1),.5,2,direction,{...uniform,m10:3},wb),null);
    assert.equal(colliderWorldCapsule(p(1),.5,2,direction,{...uniform,m10:-2},wb),null);
    assert.equal(colliderWorldCapsule(p(1),.5,2,direction,{...uniform,m00:.1},wb),null);
    assert.equal(colliderWorldCapsule(p(1),.5,2,direction,uniform,{...wb,center:p(0)}),null);
 }
 const sphere=colliderWorldCapsule(p(1),.5,0,1,uniform,{center:capCenter,halfExtents:p(1,1,1)});
 assert(sphere);assert.deepEqual(sphere.a,sphere.b);
 assert.equal(colliderWorldCapsule(p(1),.5,2,3,uniform,{center:capCenter,halfExtents:p(1,1,1)}),null);
 // Native MeshCollider reader: indexed local positions -> WORLD triangles.
 const {meshColliderWorldBvh}=require(path.join(out,'Core/SplineMeshColliderAdapter.js'));
 const {sweptSphereMeshEntry}=require(path.join(out,'Core/SplineProximityMesh.js'));
 const worldMatrix={m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,
   m08:0,m09:0,m10:1,m12:3,m13:0,m14:0};
 const settings={positionAttribute:'a_position',
   formatTable:{RGB32F:1,RGB16F:2},triangleListMode:4};
 const rawPositions=new Float32Array([1,-1,-1,1,1,-1,1,0,1]);
 const nativeMesh={allowDataAccess:true,struct:{primitives:[{primitiveMode:4}]},
   readAttribute:()=>rawPositions,readAttributeFormat:()=>({name:'RGB32F'}),
   readIndices:()=>new Uint16Array([0,1,2])};
 const worldBounds={center:p(4),halfExtents:p(0,1,1)};
 let built=meshColliderWorldBvh(nativeMesh,worldMatrix,p(0),worldBounds,settings);
 assert(built&&built.triangleCount===1);
 near(sweptSphereMeshEntry(p(0),p(10),built,.5),.35,1e-5);
 const shifted=meshColliderWorldBvh(nativeMesh,{...worldMatrix,m12:2},p(1),worldBounds,settings);
 assert(shifted);near(sweptSphereMeshEntry(p(0),p(10),shifted,.5),.35);
 assert.equal(meshColliderWorldBvh({...nativeMesh,allowDataAccess:false},
   worldMatrix,p(0),worldBounds,settings),null);
 assert.equal(meshColliderWorldBvh({...nativeMesh,struct:{primitives:[{primitiveMode:5}]}},
   worldMatrix,p(0),worldBounds,settings),null,'Unsupported triangle strips');
 assert.equal(meshColliderWorldBvh(nativeMesh,worldMatrix,p(0),
   {center:p(3),halfExtents:p(0,1,1)},settings),null,'Stale physics bounds');
 assert.equal(meshColliderWorldBvh({...nativeMesh,readIndices:()=>new Uint16Array([0,1,8])},
   worldMatrix,p(0),worldBounds,settings),null,'Invalid vertex index');
 assert.equal(meshColliderWorldBvh({...nativeMesh,readAttributeFormat:()=>({name:'RGB8UN'})},
   worldMatrix,p(0),worldBounds,settings),null,'Unsupported packed format');
 // Half floats are stored as raw Uint16 IEEE754 bits, never numeric uint values.
 const half={...nativeMesh,readAttribute:()=>new Uint16Array([
   0x3c00,0xbc00,0xbc00,0x3c00,0x3c00,0xbc00,0x3c00,0,0x3c00]),
   readAttributeFormat:()=>({name:'RGB16F'})};
 built=meshColliderWorldBvh(half,worldMatrix,p(0),worldBounds,settings);
 assert(built);near(sweptSphereMeshEntry(p(0),p(10),built,.5),.35);
 // Multiple primitive index buffers must use submesh-local indices.
 const multi={...nativeMesh,struct:{primitives:[{primitiveMode:4},{primitiveMode:4}]},
   readAttribute:(i)=>i?new Float32Array([4,-1,-1,4,1,-1,4,0,1]):rawPositions,
   readIndices:()=>new Uint16Array([0,1,2])};
 built=meshColliderWorldBvh(multi,worldMatrix,p(0),
   {center:p(5.5),halfExtents:p(1.5,1,1)},settings);
 assert(built&&built.triangleCount===2);
 near(sweptSphereMeshEntry(p(0),p(10),built,.5),.35);
 console.log('COLLIDER BOUNDS PASS: conservative WORLD AABB sphere, off-center shapes, nonuniform scale, disabled/unavailable bounds and safe fallback.');
}finally{fs.rmSync(out,{recursive:true,force:true});}
