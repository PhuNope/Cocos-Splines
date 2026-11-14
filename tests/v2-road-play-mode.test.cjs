'use strict';
/** v2 playback contract, exercising the actual compiled component with Cocos fakes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'cocos-v2-road-runtime-'));
try{
 const types=path.join(root,'tests/types/cc.d.ts');
 const file=path.join(root,'assets/splines-v2/Components/SplineRoadV2.ts');
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict','--experimentalDecorators',
  '--skipLibCheck','--useDefineForClassFields','false','--rootDir',path.join(root,'assets/splines-v2'),
  '--outDir',temp,file,path.join(root,'assets/splines-v2/Components/SplineExtrudeV2.ts'),path.join(root,'assets/splines-v2/Components/SplineMeshDeformV2.ts'),path.join(root,'assets/splines-v2/Components/SplineJunctionPatchV2.ts'),types],{stdio:'pipe'});
 const generated=[];
 const env={EDITOR_NOT_IN_PREVIEW:false};
 const identity={};
 class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  static transformMat4(out,v){out.x=v.x;out.y=v.y;out.z=v.z;return out;}
 }
 class Mat4{static invert(out){return out;}}
 class Mesh{
  constructor(){this.isValid=true;this.destroyed=false;this.subMeshCount=1;this.attributes={};this.localIndices=null;}
  readAttribute(i,name){return this.attributes[name]??null;}
  readIndices(i){return this.localIndices;}
  destroy(){this.isValid=false;this.destroyed=true;}
 }
 class Material{}
 class Component{constructor(){this.node=null;}getComponent(cls){return this.node?.getComponent(cls)??null;}}
 class MeshRenderer extends Component{
  constructor(){super();this.mesh=null;this.materials=[];}
  setSharedMaterial(material,index){this.materials[index]=material;}
 }
 class Node{
  constructor(name=''){this.name=name;this.parent=null;this.children=[];this.components=[];this.worldPosition=new Vec3();this.worldMatrix=identity;this.isValid=true;this.hideFlags=0;}
  addComponent(cls){const c=new cls();c.node=this;this.components.push(c);return c;}
  getComponent(cls){return this.components.find(c=>c instanceof cls)??null;}
  setParent(parent){this.parent=parent;parent.children.push(this);}
  setWorldPosition(point){this.worldPosition=new Vec3(point.x,point.y,point.z);}
  destroy(){this.isValid=false;for(const c of this.components)if(c.mesh)c.mesh=null;this.children=[];}
 }
 const passthrough=()=>cls=>cls;
 const decorator={ccclass:passthrough,menu:passthrough,requireComponent:passthrough,
  executeInEditMode:passthrough,property:()=>()=>{}};
 class Attribute{constructor(name,format){this.name=name;this.format=format;}}
 const cc={_decorator:decorator,Component,Node,Mesh,MeshRenderer,Material,Vec3,Mat4,
  CCObject:{Flags:{DontSave:8,HideInHierarchy:1024}},Enum:x=>x,
  gfx:{Attribute,AttributeName:{ATTR_TEX_COORD1:'a_texCoord1',ATTR_POSITION:'a_position',ATTR_TEX_COORD:'a_texCoord',ATTR_NORMAL:'a_normal',ATTR_TANGENT:'a_tangent'},Format:{RG32F:3}},
  utils:{createMesh(data){const mesh=new Mesh();mesh.geometry=data;generated.push(mesh);return mesh;}}
 };
 const originalLoad=Module._load;
 Module._load=function(request,parent,isMain){
  if(request==='cc')return cc;
  if(request==='cc/env')return env;
  return originalLoad.apply(this,arguments);
 };
 let SplineRoadV2,SplineV2MeshMode,SplineExtrudeV2,SplineMeshDeformV2,SplineJunctionPatchV2,JunctionRoadLinkV2,JunctionTurnGuideV2;
 try{({SplineRoadV2,SplineV2MeshMode}=require(path.join(temp,'Components/SplineRoadV2.js')));
  ({SplineExtrudeV2}=require(path.join(temp,'Components/SplineExtrudeV2.js')));
  ({SplineMeshDeformV2}=require(path.join(temp,'Components/SplineMeshDeformV2.js')));
  ({SplineJunctionPatchV2,JunctionRoadLinkV2,JunctionTurnGuideV2}=require(path.join(temp,'Components/SplineJunctionPatchV2.js')));}
 finally{Module._load=originalLoad;}
 const roadNode=new Node('RoadV2'),renderer=roadNode.addComponent(MeshRenderer),road=roadNode.addComponent(SplineRoadV2);
 const a=new Node('K0'),b=new Node('K1');
 b.worldPosition=new Vec3(0,0,10);
 road.knots=[a,b];road.interpolation=0;road.sampleStep=1;road.width=4;
 const saved=new Mesh();road.bakedMesh=saved;
 const originalGenerate=road.generate;
 road.generate=()=>{throw new Error('Manual/Baked must never generate');};
 for(const mode of [SplineV2MeshMode.Manual,SplineV2MeshMode.Baked]){
  road.meshMode=mode;road.onEnable();
  assert.equal(renderer.mesh,saved);assert.equal(generated.length,0);
 }
 // Regression for an Inspector UI bug: plain Road must forward Continuous
 // to the geometry builder, not silently generate the Clip Overlaps mesh.
 road.generate=originalGenerate;
 road.surfaceMode=0;
 assert.equal(road.adaptiveSampling,true);
 const continuous=road.generate().geometry;
 road.surfaceMode=1;
 const clipped=road.generate().geometry;
 assert(continuous.vertexCount>clipped.vertexCount,
   'Plain Road component must forward Continuous mode (3 versus 2 vertices per ring)');
 road.surfaceMode=0;
 road.generateMarkings=true;
 const overlay=road.generate().geometry;
 assert.deepEqual(overlay.submeshes.map(s=>s.materialSlot),[0,3,4]);
 road.generateMarkings=false;
 // Constant Width Fillet must be selectable from the actual Cocos component.
 const originalKnots=road.knots,originalA=a.worldPosition,originalB=b.worldPosition;
 const k2=new Node('K2');
 a.worldPosition=new Vec3(-1.701,0,-7.206);
 b.worldPosition=new Vec3(-3.869,0,3.72);
 k2.worldPosition=new Vec3(5.82,0,4.347);
 road.knots=[a,b,k2];road.surfaceMode=2;road.interpolation=3;
 road.width=4;road.sampleStep=.25;
 const filletRoad=road.generate().geometry;
 assert(filletRoad.vertexCount>100);
 assert.equal(filletRoad.triangleCount,4*(filletRoad.vertexCount/3-1),
   'Cocos component fillet must preserve every quad on the exact 3-Knot road');
 env.EDITOR_NOT_IN_PREVIEW=true;
 const filletStatus=road.inspectCornerRisk();
 assert.equal(filletStatus.filletReport.filletedCorners,1);
 assert(filletStatus.filletReport.minimumRadius>2);
 // Regression from Editor: Knot 0-1 distance = sqrt(5) = 2.236,
 // fillet minimum radius = 1.35, and a sharp bend requires >2.236.
 // Old default ConstantWidth threw and produced no visible Road.
 const oldPositions=road.knots.map(k=>new Vec3(k.worldPosition.x,k.worldPosition.y,k.worldPosition.z));
 a.worldPosition=new Vec3(0,0,0);
 b.worldPosition=new Vec3(0,0,Math.sqrt(5));
 k2.worldPosition=new Vec3(-5,0,Math.sqrt(5)-3.236);
 road.width=2;road.sampleStep=.2;road.interpolation=0;road.surfaceMode=2;
 road.shortKnotMode=0;road.resolvePlanarOverlaps=true;
 for(const uvAxis of [0,1]){
   road.uvLongitudinalAxis=uvAxis;
   const auto=road.generate().geometry;
   assert(auto.triangleCount>0,'Auto Continuous must generate a valid Road');
   assert(auto.positions.every(Number.isFinite)&&auto.uv0.every(Number.isFinite));
   assert(auto.uv2.every(Number.isFinite));
   assert(road.getShortKnotFallback()?.includes('spacing 2.236'));
   assert(road.getShortKnotFallback()?.includes('radius 1.350'));
   const risk=road.inspectCornerRisk();
   assert.equal(risk.filletReport,undefined,
     'Fallback diagnostics must not claim it is a constant-width fillet');
   assert(risk.continuousReport?.minimumWidthRatio<1,
     'Tight 3-Knot turn must clearly be reported as adaptive width');
   const axis=uvAxis===1?0:1;
   const first=auto.uv0[axis];
   const last=auto.uv0[auto.uv0.length-2+axis];
   assert(last>first,'No truncated UV or clipped topology in short-Knot fallback');
   assert.equal(auto.vertexCount%3,0,'Continuous strip must contain centerline UV row');
   for(let i=3;i<auto.vertexCount;i+=3){
      const previous=auto.uv0[2*(i-2)+axis];
      const next=auto.uv0[2*(i+1)+axis];
      assert(next>=previous-1e-4,'Longitudinal UV phase must never reset at a bend');
   }
 }
 road.shortKnotMode=1;
 assert.throws(()=>road.generate(),/Knot 0-1 spacing 2[.]236 is too short for radius 1[.]350/,
    'Strict ConstantWidth must preserve safe failure');
 road.shortKnotMode=0;
 road.junctionStartTrim=1;
 assert.throws(()=>road.generate(),/too short for radius/,
    'Junction Road may not silently change width at a trim seam');
 road.junctionStartTrim=0;road.roadSidewalkWidth=1;
 assert.throws(()=>road.generate(),/too short for radius/,
    'Sidewalk Road may not silently change full-width curb geometry');
 road.roadSidewalkWidth=0;
 road.knots.forEach((k,i)=>{k.worldPosition=oldPositions[i];});
 road.width=4;road.sampleStep=.25;road.interpolation=3;
 road.uvLongitudinalAxis=0;road.shortKnotMode=0;
 // Native Cocos-Gizmos v3: scene.js supplies global Gizmos3D;
 // Gizmos3D.move reads/writes the Road's live Knot proxy Vec3.
 const originalSdk=globalThis.Gizmos3D;
 const mockV3={beginColor:()=>{},drawLine:()=>{},
   move:(property,options)=>Array.from({length:6},(_,i)=>({
     property,id:'move-'+i,visual:i<3?'axis':'plane',plane:'xy',
     space:options.space}))};
 globalThis.Gizmos3D=mockV3;
 try{
   road.gizmoV3EditKnot=true;road.gizmoV3KnotIndex=1;
   road.gizmoV3MultiKnotPoints=true;road.gizmoV3PointLimit=16;
   const multiHandles=road.onGizmoHandles();
   assert.equal(multiHandles.length,8,'6 active move handles + 2 independent Knot points');
   const hud=road.onGizmoHudControls();
   assert.equal(hud.length,2);
   assert.deepEqual(hud.map(x=>x.property),['gizmoV3KnotIndex','gizmoV3MultiKnotPoints']);
   assert.equal(hud[0].max,2,'HUD slider must use current Knot count');
   assert.equal(hud[0].step,1);
   assert.deepEqual(multiHandles.slice(6).map(h=>h.index),[0,2]);
   assert(multiHandles.slice(6).every(h=>h.property==='gizmoKnotPositions'));
   assert.equal(Array.isArray(road.gizmoKnotPositions),true,
     'v3 PositionHandles.writeField requires a real array-compatible Vec3[]');
   assert.equal(road.gizmoKnotPositions.length,3);
   const shortKnots=road.knots;
   const extended=[...shortKnots,...Array.from({length:37},(_,i)=>new Node('ExtraKnot'+i))];
   road.knots=extended;road.gizmoV3PointLimit=16;
   assert.equal(road.gizmoKnotPositions.length,16,'Gizmo Proxy caps indexed Knots');
   assert.equal(road.onGizmoHandles().length,21,'Six active handles + 15 other points');
   road.gizmoV3PointLimit=NaN;
   assert.equal(road.gizmoKnotPositions.length,16,
     'Malformed editor slider value must not allocate an invalid proxy array');
   assert.equal(road.onGizmoHandles().length,21);
   road.gizmoV3PointLimit=16;road.knots=shortKnots;
   const firstOriginal=new Vec3(a.worldPosition.x,a.worldPosition.y,a.worldPosition.z);
   road.gizmoKnotPositions[0]=new Vec3(NaN,0,0);
   assert.deepEqual({...a.worldPosition},{...firstOriginal},
     'Non-finite interactive values cannot move scene Knots');
   const pointProxy=road.gizmoKnotPositions;
   pointProxy[0]=new Vec3(-7,2,1);
   assert.deepEqual({...a.worldPosition},{x:-7,y:2,z:1},
     'Indexed v3 point write must move original Knot Node immediately');
   pointProxy[0]=firstOriginal;
   assert.deepEqual({...a.worldPosition},{...firstOriginal},
     'v3 indexed point rollback via writeField must restore Node');
   // The SDK notifies begin AFTER snapshot and BEFORE any update, then
   // invokes writeField(snapshot) BEFORE the cancel callback.
   const originalKnot2=new Vec3(k2.worldPosition.x,k2.worldPosition.y,k2.worldPosition.z);
   road.onGizmoChanged('gizmoKnotPositions','begin',2);
   const reordered=road.knots;
   road.knots=[k2,b,a];
   road.gizmoKnotPositions[2]=new Vec3(6,4,-2);
   assert.deepEqual({...k2.worldPosition},{x:6,y:4,z:-2},
     'The original indexed Knot is pinned when Road Knot array is reordered during drag');
   assert.deepEqual({...a.worldPosition},{...firstOriginal},
     'Reordering the Inspector Knot array must never redirect an active drag');
   road.gizmoKnotPositions[2]=originalKnot2;
   road.onGizmoChanged('gizmoKnotPositions','cancel',2);
   assert.deepEqual({...k2.worldPosition},{...originalKnot2},
     'Escape restores the original indexed Knot even after Road array reorder');
   road.knots=reordered;
   // SDK's active Vec3 proxy must similarly pin Node when active index
   // changes during the gesture; then release that pin on end/cancel.
   road.gizmoV3MultiKnotPoints=false;
   assert.equal(road.onGizmoHandles().length,6);
   assert.equal(road.onGizmoHandles()[0].property,'gizmoKnotPosition');
   assert.deepEqual({...road.gizmoKnotPosition},{...b.worldPosition});
   const undoPosition=new Vec3(b.worldPosition.x,b.worldPosition.y,b.worldPosition.z);
   road.onGizmoChanged('gizmoKnotPosition','begin');
   road.gizmoV3KnotIndex=0;
   road.gizmoKnotPosition=new Vec3(-2.5,1.5,4.25);
   assert.deepEqual({...b.worldPosition},{x:-2.5,y:1.5,z:4.25},
     'Gizmos v3 writes real Knot Node positions, not a duplicate Vec3 field');
   assert.deepEqual({...a.worldPosition},{...firstOriginal},
     'Switching active index while dragging cannot mutate a different Knot');
   road.gizmoKnotPosition=undoPosition;
   road.onGizmoChanged('gizmoKnotPosition','cancel');
   road.gizmoV3KnotIndex=1;
   assert.deepEqual({...b.worldPosition},{...undoPosition},
     'Gizmos cancel restores Knot Node via the same live proxy setter');
   road.gizmoV3KnotIndex=999;
   assert.equal(road.onGizmoHandles().length,0,'Out-of-range Knot must hide handles');
   road.gizmoV3KnotIndex=1;road.gizmoV3EditKnot=false;
   assert.equal(road.onGizmoHandles().length,0,'Move handles opt-in only');
   road.gizmoKnotPosition=new Vec3(90,90,90);
   assert.deepEqual({...b.worldPosition},{...undoPosition},
     'Disabled Gizmo setter cannot mutate Knot Node');
   road.gizmoV3EditKnot=true;delete globalThis.Gizmos3D;
   assert.equal(road.onGizmoHandles().length,0,'Missing v3 package must not break Scene');
 }finally{globalThis.Gizmos3D=originalSdk;road.gizmoV3EditKnot=false;}
 env.EDITOR_NOT_IN_PREVIEW=false;
 assert.equal(road.onGizmoHudControls().length,0,'No Editor HUD in Play');
 assert.equal(road.onGizmoHandles().length,0,'No Gizmos handles when playing');
 const beforePlayMulti={...a.worldPosition};
 road.gizmoKnotPositions[0]=new Vec3(500,500,500);
 assert.deepEqual({...a.worldPosition},beforePlayMulti,
    'Indexed Knot proxy cannot modify Nodes in Play');
 const preserved={...b.worldPosition};
 road.gizmoKnotPosition=new Vec3(88,77,66);
 assert.deepEqual({...b.worldPosition},preserved,
    'Road Gizmo write cannot modify Knot Node during Play');
 road.knots=originalKnots;a.worldPosition=originalA;b.worldPosition=originalB;
 road.surfaceMode=0;road.interpolation=0;road.sampleStep=1;road.width=4;
 // Switching to Dynamic creates one new mesh and preserves UV2 as custom attribute.
 road.meshMode=SplineV2MeshMode.Dynamic;road.onEnable();
 assert.equal(generated.length,1);
 assert.equal(renderer.mesh,generated[0]);
 const attribute=generated[0].geometry.customAttributes?.find(a=>a.attr.name==='a_texCoord1');
 assert(attribute);assert.equal(attribute.values.length,generated[0].geometry.uvs.length);
 const first=generated[0];
 road.onDisable();assert.equal(renderer.mesh,null);assert(first.destroyed);
 assert.equal(saved.destroyed,false,'Do not destroy imported Mesh assets');
 road.onEnable();assert.equal(generated.length,2);
 assert.notEqual(renderer.mesh,first);
 road.meshMode=SplineV2MeshMode.Baked;road.onEnable();
 assert(generated[1].destroyed);assert.equal(renderer.mesh,saved);
 // Editor-only preview/Bake never persist temporary GPU assets.
 assert.throws(()=>road.rebuildPreview(),/Editor-only/);
 assert.throws(()=>road.prepareBake(),/Editor-only/);
 assert.throws(()=>road.restoreBakedPreview(),/Editor-only/);
 env.EDITOR_NOT_IN_PREVIEW=true;
 road.rebuildPreview();assert.equal(generated.length,3);
 const baked=road.prepareBake();assert.equal(JSON.parse(baked.content).asset.version,'2.0');
 road.bakedSourceFingerprint=baked.fingerprint;
 assert.equal(road.inspectBake().stale,false);
 road.uvLongitudinalAxis=1;assert.equal(road.inspectBake().stale,true,'Switching to U must invalidate baked UV0');
 road.uvLongitudinalAxis=0;assert.equal(road.inspectBake().stale,false,'Restoring V keeps previous mapping');
 road.width=5;assert.equal(road.inspectBake().stale,true);
 const report=road.inspectCornerRisk();
 assert.equal(report.pinchedSections,0,'Straight road needs no pinch warning');
 road.restoreBakedPreview();
 assert.equal(renderer.mesh,saved,'Baked asset must be visible after preview is cleared');
 assert(generated[2].destroyed,'Old temporary preview must be destroyed');
 road.onDisable();assert(generated[2].destroyed);
 assert.equal(saved.destroyed,false);
 const extrudeNode=new Node('ExtrudeV2'),extrudeRenderer=extrudeNode.addComponent(MeshRenderer);
 const extrude=extrudeNode.addComponent(SplineExtrudeV2);
 extrude.knots=[a,b];extrude.interpolation=0;extrude.sampleStep=1;extrude.radius=.75;
 extrude.uvLongitudinalAxis=1;
 extrude.sides=8;extrude.capEnds=true;extrude.bakedMesh=saved;
 const countBefore=generated.length;
 env.EDITOR_NOT_IN_PREVIEW=false;extrude.meshMode=SplineV2MeshMode.Baked;extrude.onEnable();
 assert.equal(generated.length,countBefore);assert.equal(extrudeRenderer.mesh,saved);
 extrude.meshMode=SplineV2MeshMode.Dynamic;extrude.onEnable();
 assert.equal(generated.length,countBefore+1);
 assert(generated.at(-1).geometry.indices.length>100,'Tube should contain side and end cap faces');
 extrude.onDisable();
 assert(generated.at(-1).destroyed);assert(!saved.destroyed);
 env.EDITOR_NOT_IN_PREVIEW=true;
 assert.equal(extrude.inspectCornerRisk(),null);
 const tubeBake=extrude.prepareBake();assert.equal(JSON.parse(tubeBake.content).meshes[0].primitives.length,1);
  // New v2 source Mesh Deformer: Baked/Manual modes must never read source
 // geometry, and transient previews must not destroy the source Mesh.
 const deformNode=new Node('SourceDeformV2'),deformRenderer=deformNode.addComponent(MeshRenderer);
 const deform=deformNode.addComponent(SplineMeshDeformV2);
 deform.knots=[a,b];deform.interpolation=0;deform.sampleStep=.5;
 deform.surfaceMode=2;deform.meshMode=SplineV2MeshMode.Baked;deform.bakedMesh=saved;
 const dAsset=new Mesh();
 dAsset.attributes={
  a_position:new Float32Array([-1,0,0,1,0,0,-1,0,10,1,0,10]),
  a_texCoord:new Float32Array([0,0,1,0,0,1,1,1]),
  a_texCoord1:new Float32Array([0,0,1,0,0,1,1,1]),
  a_normal:new Float32Array([0,1,0,0,1,0,0,1,0,0,1,0]),
 };
 dAsset.localIndices=new Uint16Array([0,2,1,1,2,3]);
 deform.sourceMesh=dAsset;
 const originalRead=dAsset.readAttribute;
 dAsset.readAttribute=()=>{throw new Error('Baked mode touched source Mesh');};
 env.EDITOR_NOT_IN_PREVIEW=false;
 const beforeBaked=generated.length;
 deform.onEnable();assert.equal(generated.length,beforeBaked);assert.equal(deformRenderer.mesh,saved);
 dAsset.readAttribute=originalRead;
 env.EDITOR_NOT_IN_PREVIEW=true;
 const data=deform.generate().geometry;
 assert.deepEqual(data.submeshes.map(x=>x.materialSlot),[0]);
 assert.deepEqual(Array.from(data.uv0),Array.from(dAsset.attributes.a_texCoord));
 assert.deepEqual(Array.from(data.uv2),Array.from(dAsset.attributes.a_texCoord1));
 const prepared=deform.prepareBake();
 assert.equal(JSON.parse(prepared.content).meshes[0].primitives.length,1);
 deform.rebuildPreview();assert.equal(generated.length,beforeBaked+1);
 assert.equal(dAsset.destroyed,false);assert.equal(deformRenderer.mesh,generated.at(-1));
 deform.restoreBakedPreview();assert.equal(deformRenderer.mesh,saved);
 deform.repeatCount=2;
 assert.equal(deform.inspectBake().stale,true);
 assert(!dAsset.destroyed);
 // Junction Patch must preserve Manual/Baked runtime gate and use exactly
 // the Road's trimmed end ring, with no hidden runtime mesh generation.
 const patchNode=new Node('JunctionV2'),patchRenderer=patchNode.addComponent(MeshRenderer);
 const patch=patchNode.addComponent(SplineJunctionPatchV2);
 patch.meshMode=SplineV2MeshMode.Baked;patch.bakedMesh=saved;
 const savedCount=generated.length;
 env.EDITOR_NOT_IN_PREVIEW=false;
 patch.onEnable();assert.equal(generated.length,savedCount);
 assert.equal(patchRenderer.mesh,saved,'Junction Baked Play must not generate geometry');
 const shared=new Node('CommonKnot');
 const arms=[];
 for(let i=0;i<3;i++){
  const angle=2*Math.PI*i/3,out=new Node('ArmEnd'+i);
  out.worldPosition=new Vec3(Math.sin(angle)*12,0,Math.cos(angle)*12);
  const n=new Node('Arm'+i);n.addComponent(MeshRenderer);
  const arm=n.addComponent(SplineRoadV2);
  arm.knots=[shared,out];arm.surfaceMode=2;arm.junctionStartTrim=3;
  arm.sampleStep=.25;arm.interpolation=0;arm.width=4;
  const link=new JunctionRoadLinkV2();link.road=arm;link.atEnd=false;arms.push(link);
 }
 patch.branches=arms;
 env.EDITOR_NOT_IN_PREVIEW=true;
 const boundary=arms[0].road.sampleJunctionEndV2(false);
 assert(Math.abs(boundary.left.uv0.y-.6)<1e-5,'Road UV must retain 3m original path distance');
 const {geometry:patchMesh}=patch.generate();
 assert.equal(patchMesh.triangleCount,27);
 assert.equal(patchMesh.submeshes[0].materialSlot,0);
 assert.equal(patch.inspectJunction().branches,3);
 patch.rebuildPreview();
 assert.equal(generated.length,savedCount+1);
 const junctionBake=patch.prepareBake();
 assert.equal(JSON.parse(junctionBake.content).meshes[0].primitives.length,1);
 patch.bakedSourceFingerprint=junctionBake.fingerprint;
 assert.equal(patch.inspectBake().stale,false);
 // Paint toggles must update the same Junction preview/Bake lifecycle, with
 // zero changes to the linked Roads' geometry or unpainted material slot.
 patch.generateJunctionMarkings=true;
 patch.generateStopBars=true;
 patch.generateCrosswalks=true;
 const guide=new JunctionTurnGuideV2();
 guide.fromBranch=0;guide.toBranch=1;
 patch.turnGuides=[guide];
 assert.equal(patch.inspectBake().stale,true,'Paint settings invalidate baked geometry');
 const painted=patch.generate().geometry;
 assert.deepEqual(painted.submeshes.map(s=>s.materialSlot),[0,3,4]);
 assert.equal(patch.inspectJunction().markings.stopBars,3);
 assert.equal(patch.inspectJunction().markings.zebraStripes,9);
 assert.equal(patch.inspectJunction().markings.guideRoutes,1);
 const paintedBake=patch.prepareBake();
 assert.equal(JSON.parse(paintedBake.content).meshes[0].primitives.length,3);
 patch.rebuildPreview();
 // Each material primitive is rendered through its own Cocos MeshRenderer:
 // slot 0 asphalt, slot 3 white paint, slot 4 yellow turn guide.
 assert.equal(generated.length,savedCount+4);
 assert.equal(patchNode.children.length,2,'Paint creates two auxiliary renderers');
 const paintedAssets=generated.slice(-3);
 patch.generateJunctionMarkings=false;
 patch.rebuildPreview();
 assert.equal(generated.length,savedCount+5);
 assert(paintedAssets.every(mesh=>mesh.destroyed),
     'All old painted draw-parts are disposed, no transient GPU mesh leak');
 patch.restoreBakedPreview();assert.equal(patchRenderer.mesh,saved);
 assert.equal(patch.inspectCornerRisk(),null);
 patch.branches=arms.slice(0,2);
 assert.throws(()=>patch.generate(),/3 or 4/);
 patch.branches=arms;
 // Profiled Junction regression through REAL SplineRoadV2 sampled rings.
 // All profile UVs must be copied at the authored trim edge, including
 // left/right height-duplicate curb wall vertices.
 for(const link of arms){
  link.road.shoulderWidth=.45;link.road.curbWidth=.22;
  link.road.curbHeight=.16;link.road.junctionStartTrim=4;
 }
 const ring=arms[0].road.sampleJunctionEndV2(false);
 assert(ring.profile&&ring.profile.vertices.length>3);
 assert(ring.profile.edgeMaterials.includes(1));
 assert(ring.profile.edgeMaterials.includes(2));
 const profileGeometry=patch.generate().geometry;
 assert.deepEqual(profileGeometry.submeshes.map(s=>s.materialSlot),[0,1,2]);
 assert(patch.inspectJunction().profileBands.curb>0);
 const profileBake=patch.prepareBake();
 assert.equal(JSON.parse(profileBake.content).meshes[0].primitives.length,3);
 patch.generateJunctionMarkings=true;
 patch.generateStopBars=true;patch.generateCrosswalks=false;patch.turnGuides=[];
 const profilePainted=patch.generate().geometry;
 assert.deepEqual(profilePainted.submeshes.map(s=>s.materialSlot),[0,1,2,3]);
 assert.equal(patch.inspectJunction().markings.stopBars,3);
 patch.generateJunctionMarkings=false;
 // Flat Junctions intentionally refuse giant curb lips.
 patch.maxCurbHeight=.05;
 assert.throws(()=>patch.generate(),/curb height/);
 patch.maxCurbHeight=.6;
 env.EDITOR_NOT_IN_PREVIEW=false;
 patch.onDisable();
 assert.equal(patchRenderer.mesh,saved,'Baked asset stays on renderer');
 console.log('V2 ROAD PLAY PASS: Manual/Baked zero generation, Dynamic meshes dispose, UV2 bridge, Editor-only bake and stale checks.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
