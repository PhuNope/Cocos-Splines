'use strict';
const assert=require('node:assert/strict'), path=require('node:path'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'adaptive-road-v2-'));
try {
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict','--rootDir',path.join(root,'src-v2'),'--outDir',tmp,path.join(root,'src-v2/geometry/RoadStrip.ts'),path.join(root,'src-v2/geometry/ProfileSweep.ts'),path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildSplineCacheV2}=require(path.join(tmp,'core/SplineCache.js'));
 const {buildSplineFramesV2}=require(path.join(tmp,'core/SplineFrames.js'));
 const {buildRoadStripV2}=require(path.join(tmp,'geometry/RoadStrip.js'));
 const {buildRoadProfileV2}=require(path.join(tmp,'geometry/ProfileSweep.js'));
 const {exportMeshGltfV2}=require(path.join(tmp,'geometry/GltfExporter.js'));
 const p=(x,y,z)=>({position:{x,y,z}});
 const cache=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:false,knots:[p(-1.701,0,-7.206),p(-3.869,0,3.72),p(5.82,0,4.347)]});
 const step=.5,params={maxStep:step,maxAngleDegrees:6,maxChordError:.03};
 const coarse=buildSplineFramesV2(cache,{maxStep:step});
 const adaptive=buildSplineFramesV2(cache,params);
 assert(adaptive.frames.length>=coarse.frames.length);
 for(let i=1;i<adaptive.frames.length;i++){
  const a=adaptive.frames[i-1],b=adaptive.frames[i];
  assert(b.distance>a.distance);
  const d=Math.acos(Math.min(1,Math.max(-1,a.tangent.x*b.tangent.x+a.tangent.y*b.tangent.y+a.tangent.z*b.tangent.z)))*180/Math.PI;
  assert(d<=6.05,'Adaptive turn exceeds limit: '+d);
 }
 const opts={width:4,step,surfaceMode:'continuous',cornerMode:'join-trim',clearanceSafety:.98,widthSlope:.25,uvMetersPerRepeat:5,uvLongitudinalAxis:'u',adaptiveSampling:true,maxTurnAngleDegrees:6,maxChordError:.03};
 const legacy=buildRoadStripV2(cache,{...opts,uvCrossMode:'legacy'});
 const physical=buildRoadStripV2(cache,{...opts,uvCrossMode:'physical'});
 assert.equal(legacy.vertexCount,adaptive.frames.length*3);
 assert.equal(legacy.vertexCount,physical.vertexCount);
 assert.deepEqual(Array.from(legacy.positions),Array.from(physical.positions));
 assert.deepEqual(Array.from(legacy.uv2),Array.from(physical.uv2));
 let changed=0;
 for(let i=0;i<legacy.vertexCount;i++){
  const pos=3*i,uv=2*i;
  assert(Math.abs(legacy.uv0[uv]-adaptive.frames[Math.floor(i/3)].distance/5)<.00001);
  assert(Math.abs(legacy.uv0[uv]-physical.uv0[uv])<.00001,'Longitudinal U must not move');
  if(i%3===1)assert(Math.abs(legacy.uv0[uv+1]-.5)<.00001&&Math.abs(physical.uv0[uv+1]-.5)<.00001);
  if(Math.abs(legacy.uv0[uv+1]-physical.uv0[uv+1])>.005)changed++;
 }
 assert(changed>0,'Physical UV mode should compensate for width narrowing');
 const noAdaptive=buildRoadStripV2(cache,{...opts,adaptiveSampling:false});
 assert.equal(noAdaptive.vertexCount,coarse.frames.length*3);
 assert(legacy.vertexCount>=noAdaptive.vertexCount);
 const profile=buildRoadProfileV2(cache,{...opts,shoulderWidth:1,curbWidth:.3,curbHeight:.2,uvCrossMode:'physical'});
 assert.deepEqual(profile.submeshes.map(x=>x.materialSlot),[0,1,2]);
 assert(profile.vertexCount>0&&profile.positions.every(Number.isFinite));
 const baked=JSON.parse(exportMeshGltfV2(profile).json);
 assert(baked.meshes[0].primitives.every(p=>p.attributes.TEXCOORD_0!==undefined&&p.attributes.TEXCOORD_1!==undefined));
 assert.throws(()=>buildSplineFramesV2(cache,{maxStep:step,maxAngleDegrees:0}),/maxAngleDegrees/);
 assert.throws(()=>buildSplineFramesV2(cache,{maxStep:step,maxChordError:-1}),/maxChordError/);
 assert.throws(()=>buildRoadStripV2(cache,{...opts,uvCrossMode:'random'}),/UV cross/);
 console.log('ADAPTIVE ROAD UV PASS:',coarse.frames.length,'to',adaptive.frames.length,'rings; physical cross UV changed',changed,'points');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
