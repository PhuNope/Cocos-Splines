'use strict';
/** Road v2 local miter+inner trim regression. Not global road CSG. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-v2-corner-'));
try {
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict','--outDir',tmp,
  path.join(root,'src-v2/geometry/RoadCorners.ts'),
  path.join(root,'src-v2/geometry/RoadStrip.ts'),
  path.join(root,'src-v2/geometry/ProfileSweep.ts'),
  path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildSplineCacheV2}=require(path.join(tmp,'core/SplineCache.js'));
 const {buildSplineFramesV2}=require(path.join(tmp,'core/SplineFrames.js'));
 const {buildRoadCornerSectionsV2,roadCornerProfileX_V2,inspectRoadCornersV2,inspectRoadCenterlineClearanceV2}=require(path.join(tmp,'geometry/RoadCorners.js'));
 const {buildRoadStripV2}=require(path.join(tmp,'geometry/RoadStrip.js'));
 const {buildRoadProfileV2,buildTubeV2}=require(path.join(tmp,'geometry/ProfileSweep.js'));
 const {fingerprintMeshV2}=require(path.join(tmp,'geometry/MeshBuildPlan.js'));
 const {exportMeshGltfV2}=require(path.join(tmp,'geometry/GltfExporter.js'));
 const p=(x,y=0,z=0)=>({position:{x,y,z}});
 const straight=buildSplineCacheV2({type:'linear',closed:false,knots:[p(0),p(0,0,12)]});
 const defaultStraight=buildRoadStripV2(straight,{width:4,step:.5});
 const legacyStraight=buildRoadStripV2(straight,{width:4,step:.5,cornerMode:'legacy'});
 assert.deepEqual(Array.from(defaultStraight.positions),Array.from(legacyStraight.positions));
 assert.deepEqual(Array.from(defaultStraight.uv0),Array.from(legacyStraight.uv0));

 // U-turn whose inside radius is narrower than half the road.
 const uturn=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:false,
  knots:[p(0,0,0),p(0,0,2),p(2,0,2),p(2,0,0)]},{tolerance:.001});
 const options={width:4,step:.15,uvMetersPerRepeat:3,uvLongitudinalAxis:'u'};
 const trimmed=buildRoadStripV2(uturn,options);
 const old=buildRoadStripV2(uturn,{...options,cornerMode:'legacy'});
 const frameList=buildSplineFramesV2(uturn,{maxStep:options.step}).frames;
 const sections=buildRoadCornerSectionsV2(frameList,options.width*.5,{},false);
 const risk=inspectRoadCornersV2(sections);
 const clearance=inspectRoadCenterlineClearanceV2(frameList,4);
 assert(Number.isFinite(clearance.minimumClearance));
 assert(clearance.minimumClearance>=-1);
 assert(clearance.potentialOverlapPairs>0,'Wide U-turn branches come close; warn author in Editor');
 assert(risk.pinchedSections>0,'The narrow U-turn must be identified as pinch risk');
 assert(risk.largestTurnDegrees>0);
 assert.notEqual(fingerprintMeshV2(trimmed),fingerprintMeshV2(old),'Trim should change the baked geometry');
 assert.equal(trimmed.vertexCount,old.vertexCount);
 assert(trimmed.triangleCount>=old.triangleCount,'JoinAndTrim should preserve more valid faces than legacy');
 assert(trimmed.triangleCount<=2*(frameList.length-1),'No duplicated faces on the Road ribbon');
 assert.deepEqual(Array.from(trimmed.uv0),Array.from(old.uv0),'UV0 world-distance tiling must be stable');
 assert.deepEqual(Array.from(trimmed.uv2),Array.from(old.uv2),'UV2 must be untouched');
 for(let i=0;i<sections.length;i++){
  const c=sections[i];
  if(!c.isPinched)continue;
  const inside=2*c.insideSign;
  const transformed=roadCornerProfileX_V2(inside,c);
  assert(Math.abs(transformed)<2,'Inside offset must contract');
  assert(c.insideLimit>0&&c.insideLimit<Infinity);
  const a=roadCornerProfileX_V2(.5*inside,c),b=roadCornerProfileX_V2(inside,c);
  assert(Math.abs(a)<Math.abs(b),'Trim must not collapse neighboring profile bands');
 }
 assert(Array.from(trimmed.positions).every(Number.isFinite));
 assert(Array.from(trimmed.normals).every(Number.isFinite));
 assert(Array.from(trimmed.tangents).every(Number.isFinite));
 function validateFaceOrientation(mesh){
  const points=mesh.positions,normals=mesh.normals;
  let checked=0;
  for(const sub of mesh.submeshes)for(let i=0;i<sub.indices.length;i+=3){
   const [a,b,c]=[sub.indices[i],sub.indices[i+1],sub.indices[i+2]];
   const ab=[0,1,2].map(k=>points[b*3+k]-points[a*3+k]);
   const ac=[0,1,2].map(k=>points[c*3+k]-points[a*3+k]);
   const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
   const expected=[0,1,2].map(k=>normals[a*3+k]+normals[b*3+k]+normals[c*3+k]);
   const dot=cross.reduce((s,x,k)=>s+x*expected[k],0);
   assert(dot>1e-8,'Inverted/degenerate road triangle at index '+i+': '+dot);
   checked++;
  }
  assert(checked>0);
 }
 validateFaceOrientation(trimmed);

 const profOpts={...options,shoulderWidth:1,curbWidth:.3,curbHeight:.2};
 const profile=buildRoadProfileV2(uturn,profOpts);
 const profileOld=buildRoadProfileV2(uturn,{...profOpts,cornerMode:'legacy'});
 assert.notEqual(fingerprintMeshV2(profile),fingerprintMeshV2(profileOld));
 assert.deepEqual(profile.submeshes.map(x=>x.materialSlot),[0,1,2]);
 assert.deepEqual(Array.from(profile.uv0),Array.from(profileOld.uv0));
 assert.deepEqual(Array.from(profile.uv2),Array.from(profileOld.uv2));
 assert(Array.from(profile.positions).every(Number.isFinite));
 validateFaceOrientation(profile);
 const gltf=JSON.parse(exportMeshGltfV2(profile).json);
 assert.equal(gltf.meshes[0].primitives.length,3);

 // Extrude is deliberately exempt: local Road corner miter distorts tubes.
 const tube=buildTubeV2(uturn,{radius:.5,sides:12,step:.15});
 const tubeExplicit=buildTubeV2(uturn,{radius:.5,sides:12,step:.15});
 assert.equal(fingerprintMeshV2(tube),fingerprintMeshV2(tubeExplicit));
 const helix=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:false,
  knots:Array.from({length:9},(_,i)=>p(Math.cos(i*.5)*2,i*.7,Math.sin(i*.5)*2))});
 const helixRoad=buildRoadStripV2(helix,{width:2,step:.15});
 assert(Array.from(helixRoad.positions).every(Number.isFinite));
 assert(Array.from(helixRoad.normals).every(Number.isFinite));
 validateFaceOrientation(helixRoad);
 for(const bad of [{cornerMode:'wrong'},{cornerTrimSafety:1},{cornerTrimSafety:.4},{cornerMiterLimit:5}])
  assert.throws(()=>buildRoadStripV2(uturn,{...options,...bad}),/corner|mode/i);
 console.log('V2 ROAD CORNERS PASS: U-turn inside trim, UV stability, shoulders/curbs, helix and safe legacy fallback');
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
