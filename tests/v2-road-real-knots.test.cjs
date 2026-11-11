'use strict';
/** Exact 3-knot road screenshot regression: continuous yellow lines and centre marks. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-v2-real-turn-'));
try{
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict',
  '--rootDir',path.join(root,'src-v2'),'--outDir',dir,
  path.join(root,'src-v2/geometry/RoadStrip.ts'),
  path.join(root,'src-v2/geometry/ProfileSweep.ts'),
  path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildSplineCacheV2}=require(path.join(dir,'core/SplineCache.js'));
 const {buildSplineFramesV2}=require(path.join(dir,'core/SplineFrames.js'));
 const {buildRoadCornerSectionsV2}=require(path.join(dir,'geometry/RoadCorners.js'));
 const {buildRoadContinuousSectionsV2}=require(path.join(dir,'geometry/RoadContinuous.js'));
 const {buildRoadStripV2}=require(path.join(dir,'geometry/RoadStrip.js'));
 const {buildRoadProfileV2}=require(path.join(dir,'geometry/ProfileSweep.js'));
 const {exportMeshGltfV2}=require(path.join(dir,'geometry/GltfExporter.js'));
 const p=(x,y,z)=>({position:{x,y,z}});
 // Repro from Cocos Creator user's actual Road Node; not the synthetic U-turn.
 const knots=[p(-1.701,0,-7.206),p(-3.869,0,3.72),p(5.82,0,4.347)];
 const cache=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:false,knots});
 const opts={width:4,cornerMode:'join-trim',cornerTrimSafety:.9,
  cornerMiterLimit:2.5,surfaceMode:'continuous',clearanceSafety:.98,
  widthSlope:2,uvLongitudinalAxis:'u',uvMetersPerRepeat:5};
 const near=(actual,expected,t=2e-5)=>assert(Math.abs(actual-expected)<=t,
  actual+' expected '+expected);
 const uvPath=(mesh,ringCount,across)=>{
  const out=[];
  for(let i=0;i<ringCount;i++){
   const k=across<=.5?across*2:(across-.5)*2;
   const first=3*i+(across<=.5?0:1),second=first+1;
   const u=3*first,v=3*second;
   out.push({x:mesh.positions[u]+(mesh.positions[v]-mesh.positions[u])*k,
    z:mesh.positions[u+2]+(mesh.positions[v+2]-mesh.positions[u+2])*k});
  }
  return out;
 };
 const cornerAngle=(a,b,c)=>{
  const x=b.x-a.x,y=b.z-a.z,X=c.x-b.x,Y=c.z-b.z;
  return Math.abs(Math.atan2(x*Y-y*X,x*X+y*Y));
 };
 const maxTurn=(path)=>{
  let max=0;
  for(let i=1;i+1<path.length;i++)max=Math.max(max,cornerAngle(path[i-1],path[i],path[i+1]));
  return max;
 };
 const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const intersects=(a,b,c,d)=>{
  const eps=1e-7,ab1=cross(a,b,c),ab2=cross(a,b,d);
  const cd1=cross(c,d,a),cd2=cross(c,d,b);
  return ab1*ab2< -eps&&cd1*cd2< -eps;
 };
 const isSimple=(path)=>{
  for(let i=0;i+1<path.length;i++)for(let j=i+2;j+1<path.length;j++){
   if(intersects(path[i],path[i+1],path[j],path[j+1]))return false;
  }
  return true;
 };
 const original=buildRoadStripV2(cache,{...opts,step:.25,surfaceMode:'clip',resolvePlanarOverlaps:false});
 assert(original.vertexCount>0);
 for(const step of [.1,.15,.25,.5]){
  for(const axis of ['u','v']){
   const frameTable=buildSplineFramesV2(cache,{maxStep:step}).frames;
   const corners=buildRoadCornerSectionsV2(frameTable,2,opts,false);
   const report=buildRoadContinuousSectionsV2(frameTable,2,{...opts,cornerSections:corners}).report;
   assert(report.curvatureConstrainedSections>0,'Local bend radius must constrain inner width');
   assert(report.minimumWidthRatio<.95,'Width must shrink on too-tight curve');
   assert.equal(report.effectiveWidthSlope,.25,'Aggressive stored slope must be safety-capped');
   assert(report.slopeSafetyCapped,'Inspector should report requested slope clamping');
   const mesh=buildRoadStripV2(cache,{...opts,step,uvLongitudinalAxis:axis});
   assert.equal(mesh.vertexCount,frameTable.length*3);
   assert.equal(mesh.triangleCount,4*(frameTable.length-1),
    'Every adjacent ring must keep its four triangles; no clipping/holes');
   assert.equal(mesh.submeshes.length,1);
   assert(Array.from(mesh.positions).every(Number.isFinite));
   for(let i=0;i<frameTable.length;i++){
    const centre=3*(3*i+1),world=frameTable[i].position;
    near(mesh.positions[centre],world.x);near(mesh.positions[centre+1],world.y);
    near(mesh.positions[centre+2],world.z);
    for(let j=0;j<3;j++){
     const uv=2*(3*i+j),across=j/2,along=frameTable[i].distance/5;
     near(mesh.uv0[uv],axis==='u'?along:across);
     near(mesh.uv0[uv+1],axis==='u'?across:along);
     near(mesh.uv2[uv],across);
     near(mesh.uv2[uv+1],frameTable[i].distance/cache.length);
    }
   }
   for(const across of [.05,.1,.5,.9,.95]){
    const line=uvPath(mesh,frameTable.length,across);
    assert(isSimple(line),'Road marking has a self crossing at UV across '+across);
    const max=maxTurn(line);
    const radiansByStep={'0.1':.24,'0.15':.24,'0.25':.28,'0.5':.47};
    assert(max<radiansByStep[String(step)],
     'Jagged UV iso-line at '+across+' with sample step '+step+': '+max);
   }
  }
 }
 const mesh=buildRoadStripV2(cache,{...opts,step:.25});
 const m2=buildRoadStripV2(cache,{...opts,step:.25,clearanceSafety:.35,widthSlope:.65});
 assert.deepEqual(Array.from(mesh.uv0),Array.from(m2.uv0));
 assert.deepEqual(Array.from(mesh.uv2),Array.from(m2.uv2));
 const gltf=JSON.parse(exportMeshGltfV2(mesh).json);
 assert(gltf.meshes[0].primitives.every(p=>p.attributes.TEXCOORD_0!==undefined&&p.attributes.TEXCOORD_1!==undefined));
 const profile=buildRoadProfileV2(cache,{...opts,step:.25,
   shoulderWidth:1,curbWidth:.3,curbHeight:.2});
 assert.deepEqual(profile.submeshes.map(s=>s.materialSlot),[0,1,2]);
 assert(profile.triangleCount>mesh.triangleCount);
 assert(profile.uv0.length===profile.uv2.length);
 const sample=buildSplineFramesV2(cache,{maxStep:.25}).frames[30];
 let found=false;
 for(let i=0;i<profile.vertexCount;i++){
  if(Math.abs(profile.positions[3*i]-sample.position.x)>1e-5||
     Math.abs(profile.positions[3*i+2]-sample.position.z)>1e-5)continue;
  if(Math.abs(profile.uv0[2*i+1]-.5)<1e-4)found=true;
 }
 assert(found,'Profile asphalt UV centre must stay on spline centreline');
 console.log('REAL ROAD KNOTS PASS: UV0 centre anchored, uncut inner yellow lines, smooth curvature width, U/V, UV2, glTF, profile bands.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
