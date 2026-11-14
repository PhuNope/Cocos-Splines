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
 const {SplinePathV2,SplineKnotRecordV2}=require(path.join(temp,'Components/SplinePathV2.js'));
 // Regression fixtures now use pure serialized Knot records. The worldPosition
 // alias below keeps historical coordinate assertions readable in this mock;
 // it is NOT a Node and the real SplinePath never creates Knot Nodes.
 const knot=(x=0,y=0,z=0)=>{
   const k=new SplineKnotRecordV2();k.position=new Vec3(x,y,z);
   Object.defineProperty(k,'worldPosition',{
     get(){return this.position;},
     set(v){this.position=new Vec3(v.x,v.y,v.z);}
   });
   k.setWorldPosition=v=>{k.worldPosition=v;};
   return k;
 };
 const roadNode=new Node('RoadV2'),renderer=roadNode.addComponent(MeshRenderer),road=roadNode.addComponent(SplineRoadV2);
 const a=knot(),b=knot();
 b.worldPosition=new Vec3(0,0,10);
 const authoredNode=new Node('AuthoredPath');
 const authoredPath=authoredNode.addComponent(SplinePathV2);
 authoredPath.knots=[a,b];authoredPath.interpolation=0;
 road.pathSource=authoredPath;road.sampleStep=1;road.width=4;
 assert(!('knots' in road)&&!('interpolation' in road)&&!('closed' in road));
 assert(!('onGizmoHandles' in road)&&!('onGizmoHudControls' in road));
 const currentPath=road.pathSource;
 road.pathSource=null;
 assert.throws(()=>road.generate(),/Assign a SplinePathV2 Path Source/,
   'Road must reject geometry without its authoritative SplinePath');
 road.pathSource=currentPath;
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
 // Authored Bezier controls must flow all the way from Path into the
 // real Road tessellation, not merely into a standalone core evaluator.
 const {SplinePathCurveModeV2}=require(path.join(temp,'Components/SplinePathV2.js'));
 authoredPath.interpolation=SplinePathCurveModeV2.Bezier;
 authoredPath.gizmoKnotIndex=0;
 const defaultBezier=road.generate().geometry;
 assert(defaultBezier.positions.every((n,i)=>i%3!==1||Math.abs(n)<1e-5),
    'Auto Bezier tangents preserve a straight source Road');
 env.EDITOR_NOT_IN_PREVIEW=true;
 authoredPath.pathGizmoTangentOut=new Vec3(0,4,3);
 const curvedBezier=road.generate().geometry;
 assert(curvedBezier.positions.some((n,i)=>i%3===1&&n>1),
    'Manual Bezier tangent must bend the actual Road mesh in Y');
 assert.notEqual(JSON.stringify(curvedBezier.positions),JSON.stringify(defaultBezier.positions));
 const bezierBake=road.prepareBake();
 assert.equal(JSON.parse(bezierBake.content).asset.version,'2.0');
 authoredPath.interpolation=SplinePathCurveModeV2.Linear;
 authoredPath.knots=[a,b];authoredPath.gizmoKnotIndex=0;
 a.rollDegrees=0;b.rollDegrees=0;
 const unbankedRoad=road.generate().geometry;
 b.rollDegrees=60;
 const bankedRoad=road.generate().geometry;
 assert(bankedRoad.positions.some((n,i)=>i%3===1&&Math.abs(n)>.9),
   'Nonzero Knot roll must bank the real Road vertices, not only its source data');
 assert.deepEqual(bankedRoad.uv0,unbankedRoad.uv0,
   'Banking changes only cross-section orientation, not longitudinal UV phase');
 assert.notDeepEqual(bankedRoad.positions,unbankedRoad.positions);
 const bankBake=road.prepareBake();
 assert.equal(JSON.parse(bankBake.content).asset.version,'2.0');
 b.rollDegrees=0;
 const resetRoad=road.generate().geometry;
 assert(resetRoad.positions.every((n,i)=>i%3!==1||Math.abs(n)<1e-5),
   'Resetting bank to zero restores a flat generated Road');
 assert.notEqual(road.prepareBake().fingerprint,bankBake.fingerprint,
   'Bank edits must invalidate the explicit saved glTF geometry fingerprint');
 env.EDITOR_NOT_IN_PREVIEW=false;
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
 const originalKnots=authoredPath.knots,originalA=a.worldPosition,originalB=b.worldPosition;
 const k2=knot();
 a.worldPosition=new Vec3(-1.701,0,-7.206);
 b.worldPosition=new Vec3(-3.869,0,3.72);
 k2.worldPosition=new Vec3(5.82,0,4.347);
 authoredPath.knots=[a,b,k2];road.surfaceMode=2;authoredPath.interpolation=3;
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
 const oldPositions=authoredPath.knots.map(k=>new Vec3(k.worldPosition.x,k.worldPosition.y,k.worldPosition.z));
 a.worldPosition=new Vec3(0,0,0);
 b.worldPosition=new Vec3(0,0,Math.sqrt(5));
 k2.worldPosition=new Vec3(-5,0,Math.sqrt(5)-3.236);
 road.width=2;road.sampleStep=.2;authoredPath.interpolation=0;road.surfaceMode=2;
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
 authoredPath.knots.forEach((k,i)=>{k.worldPosition=oldPositions[i];});
 road.width=4;road.sampleStep=.25;authoredPath.interpolation=3;
 road.uvLongitudinalAxis=0;road.shortKnotMode=0;
 // The source Path owns all Knot editing; Road rebuilds as a
 // subscriber. No Road-owned Knot proxy or HUD is permitted.
 const originalSdk=globalThis.Gizmos3D;
 const mockGizmos={beginColor:()=>{},drawLine:()=>{},
   move:(property,options)=>Array.from({length:6},(_,i)=>({
     property,id:'move-'+i,visual:i<3?'axis':'plane',plane:'xy',
     space:options.space}))};
 globalThis.Gizmos3D=mockGizmos;
 try{
   authoredPath.gizmoKnotIndex=1;
   const handles=authoredPath.onGizmoHandles();
   assert.equal(handles.length,8,'Path owns active handles and two point handles');
   assert.equal(authoredPath.onGizmoHudControls().length,4,
     'Path HUD offers Knot picker, other Knot toggle, Roll slider and guide');
   assert(authoredPath.onGizmoHudControls().some(h=>h.property==='pathGizmoActiveRoll'));
   assert.deepEqual(handles.slice(6).map(h=>h.index),[0,2]);
   const firstOriginal={...a.worldPosition};
   authoredPath.pathGizmoKnotPositions[0]=new Vec3(NaN,0,0);
   assert.deepEqual({...a.worldPosition},firstOriginal);
   authoredPath.pathGizmoKnotPositions[0]=new Vec3(-7,2,1);
   assert.equal(a.worldPosition.x,-7);
   authoredPath.pathGizmoKnotPositions[0]=new Vec3(firstOriginal.x,firstOriginal.y,firstOriginal.z);
   const thirdOriginal={...k2.worldPosition};
   authoredPath.onGizmoChanged('pathGizmoKnotPositions','begin',2);
   const originalOrder=authoredPath.knots;
   authoredPath.knots=[k2,b,a];
   authoredPath.pathGizmoKnotPositions[2]=new Vec3(6,4,-2);
   assert.deepEqual({...k2.worldPosition},{x:6,y:4,z:-2},
     'Gizmo target pinned across Path Knot reorder');
   assert.deepEqual({...a.worldPosition},firstOriginal);
   authoredPath.pathGizmoKnotPositions[2]=new Vec3(thirdOriginal.x,thirdOriginal.y,thirdOriginal.z);
   authoredPath.onGizmoChanged('pathGizmoKnotPositions','cancel',2);
   authoredPath.knots=originalOrder;
 }finally{globalThis.Gizmos3D=originalSdk;}

 // Path Gizmos update a temporary Road mesh; end/cancel force a rebuild.
 road.gizmoLiveMesh=true;road.gizmoMeshIntervalMs=400;
 road.meshMode=SplineV2MeshMode.Baked;road.showSavedMesh();
 const editedPosition=new Vec3(b.worldPosition.x,b.worldPosition.y,b.worldPosition.z);
 authoredPath.gizmoKnotIndex=1;
 authoredPath.onGizmoChanged('pathGizmoKnotPosition','begin');
 authoredPath.pathGizmoKnotPosition=new Vec3(editedPosition.x+.2,editedPosition.y,editedPosition.z);
 authoredPath.onGizmoChanged('pathGizmoKnotPosition','update');
 const movingPreview=renderer.mesh;
 assert(movingPreview&&movingPreview!==saved,
   'Path edit must rebuild temporary Road mesh in Baked mode');
 authoredPath.pathGizmoKnotPosition=new Vec3(editedPosition.x+.3,editedPosition.y,editedPosition.z);
 authoredPath.onGizmoChanged('pathGizmoKnotPosition','update');
 assert.equal(renderer.mesh,movingPreview,'Road preview must throttle rapid Path edits');
 authoredPath.onGizmoChanged('pathGizmoKnotPosition','end');
 assert(renderer.mesh!==movingPreview,'Path end forces a final Road mesh');
 assert(movingPreview.destroyed&&road.bakedMesh===saved);
 const previousValid=renderer.mesh;
 authoredPath.onGizmoChanged('pathGizmoKnotPosition','begin');
 b.setWorldPosition(a.worldPosition);
 authoredPath.onGizmoChanged('pathGizmoKnotPosition','update');
 assert.equal(renderer.mesh,previousValid,'Invalid intermediate Path keeps last valid Road mesh');
 b.setWorldPosition(editedPosition);
 authoredPath.onGizmoChanged('pathGizmoKnotPosition','cancel');
 assert(renderer.mesh!==previousValid,'Path Escape rebuilds Road mesh');

 // SplinePathV2 is the preferred shared source: one Path, two Roads.
 // Road-local Knots and interpolation are ignored once it is linked.
 const pathNode=new Node('SharedSplinePath');
 const splinePath=pathNode.addComponent(SplinePathV2);
 splinePath.knots=[a,b,k2];splinePath.interpolation=0;splinePath.closed=false;
 road.pathSource=splinePath;
 assert.equal(road.source().type,'linear',
   'Road must read interpolation from the linked SplinePathV2');
 assert.equal(road.source().knots.length,3);
 const otherNode=new Node('SharedRoad2'),otherRenderer=otherNode.addComponent(MeshRenderer);
 const other=otherNode.addComponent(SplineRoadV2);
 other.pathSource=splinePath;other.surfaceMode=0;other.sampleStep=.5;other.width=1.5;
 other.rebuildPreview();road.rebuildPreview();
 const originalPrimary=renderer.mesh,originalSecondary=otherRenderer.mesh;
 assert(originalPrimary&&originalSecondary);
 assert(!('onGizmoHandles' in road),'Only Path owns Knot handles');
 const priorSDK=globalThis.Gizmos3D;
 globalThis.Gizmos3D=mockGizmos;
 try{
    splinePath.gizmoKnotIndex=1;
    const pathHandles=splinePath.onGizmoHandles();
    assert.equal(pathHandles.length,8,'SplinePath owns six XYZ/plane + two point handles');
    assert(pathHandles.some(h=>h.property==='pathGizmoKnotPosition'));
    assert.deepEqual(pathHandles.slice(6).map(h=>h.index),[0,2]);
    assert.equal(splinePath.onGizmoHudControls().length,4,
       'Shared Path HUD also exposes Knot Roll and guide toggle');
    const dragStart={...b.worldPosition};
    splinePath.onGizmoChanged('pathGizmoKnotPosition','begin');
    splinePath.pathGizmoKnotPosition=new Vec3(
        editedPosition.x+.4,editedPosition.y,editedPosition.z);
    splinePath.onGizmoChanged('pathGizmoKnotPosition','update');
    assert.notEqual(renderer.mesh,originalPrimary,
        'SplinePath Knot update must rebuild registered Road preview');
    assert.notEqual(otherRenderer.mesh,originalSecondary,
        'SplinePath must invalidate every registered consumer');
    splinePath.pathGizmoKnotPosition=editedPosition;
    const previewBeforeCancel=renderer.mesh;
    splinePath.onGizmoChanged('pathGizmoKnotPosition','cancel');
    assert(renderer.mesh!==previewBeforeCancel,'Escape restores Road mesh from Path');
    assert.deepEqual({...b.worldPosition},dragStart,
        'Cancel restores pure Vec3 Knot value from drag-begin snapshot');
    assert(otherRenderer.mesh&&renderer.mesh);
    const point=splinePath.pathGizmoKnotPositions;
    assert.equal(Array.isArray(point),true);
    const originalFirst={...a.worldPosition};
    point[0]=new Vec3(-8,0,0);
    assert.equal(a.worldPosition.x,-8);
    point[0]=new Vec3(originalFirst.x,originalFirst.y,originalFirst.z);
    splinePath.onRestore();
    assert(otherRenderer.mesh&&renderer.mesh,
       'Path Undo/Restore hook refreshes registered mesh consumers');
    // Native Transform / Inspector edit does NOT call onGizmoChanged.
    // Editor Path update() detects changed Node world transforms and
    // forces a settled final rebuild after the user stops dragging.
    const realClock=Date.now;
    let mockNow=realClock();
    Date.now=()=>mockNow;
    try{
        splinePath.update(0);
        const firstRoad=renderer.mesh,secondRoad=otherRenderer.mesh;
        const pos={...b.worldPosition};
        b.setWorldPosition(new Vec3(pos.x+.45,pos.y,pos.z));
        mockNow+=70;
        splinePath.update(0);
        assert.notEqual(renderer.mesh,firstRoad,
          'Native Knot Transform must refresh Road preview without Gizmos callback');
        assert.notEqual(otherRenderer.mesh,secondRoad,
          'Every registered Road must receive native Path world-transform edits');
        const during=renderer.mesh;
        b.setWorldPosition(new Vec3(pos.x+.5,pos.y,pos.z));
        mockNow+=60;
        splinePath.update(0);
        assert.equal(renderer.mesh,during,
           'Rapid native transform edits must be throttled');
        mockNow+=200;
        splinePath.update(0);
        assert.notEqual(renderer.mesh,during,
           'Idle native edit must force a settled final Road preview');
        const afterIdle=renderer.mesh;
        mockNow+=60;
        splinePath.update(0);
        assert.equal(renderer.mesh,afterIdle,
           'Unchanged Path must never rebuild per Editor tick');
        b.setWorldPosition(new Vec3(pos.x,pos.y,pos.z));
        mockNow+=70;
        splinePath.update(0);
        mockNow+=200;
        splinePath.update(0);
        assert(otherRenderer.mesh&&renderer.mesh,
           'Restoring Knot by native Undo-like transform remains buildable');
        const beforePlay=renderer.mesh;
        env.EDITOR_NOT_IN_PREVIEW=false;
        b.setWorldPosition(new Vec3(pos.x+.15,pos.y,pos.z));
        mockNow+=500;
        splinePath.update(0);
        assert.equal(renderer.mesh,beforePlay,
           'Native path polling must never rebuild mesh in Play');
        env.EDITOR_NOT_IN_PREVIEW=true;
        b.setWorldPosition(new Vec3(pos.x,pos.y,pos.z));
        splinePath.onRestore();
    }finally{
        Date.now=realClock;
        env.EDITOR_NOT_IN_PREVIEW=true;
    }
 }finally{globalThis.Gizmos3D=priorSDK;}
 other.onDisable();
 road.pathSource=authoredPath;authoredPath.knots=[a,b,k2];
 road.showSavedMesh();generated.length=0;

 env.EDITOR_NOT_IN_PREVIEW=false;
 assert.equal(authoredPath.onGizmoHudControls().length,0,'No Path HUD in Play');
 assert.equal(authoredPath.onGizmoHandles().length,0,'No Path handles in Play');
 const beforePlay={...a.worldPosition};
 authoredPath.pathGizmoKnotPositions[0]=new Vec3(500,500,500);
 assert.deepEqual({...a.worldPosition},beforePlay,'Path proxy must not edit in Play');
 const preserved={...b.worldPosition};
 authoredPath.pathGizmoKnotPosition=new Vec3(88,77,66);
 assert.deepEqual({...b.worldPosition},preserved,'Path gizmo must not edit in Play');
 authoredPath.knots=originalKnots;a.worldPosition=originalA;b.worldPosition=originalB;
 road.surfaceMode=0;authoredPath.interpolation=0;road.sampleStep=1;road.width=4;
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
 const generatorSourceNode=new Node('GeneratorPathV2');
 const generatorPath=generatorSourceNode.addComponent(SplinePathV2);
 generatorPath.knots=[a,b];generatorPath.interpolation=0;generatorPath.closed=false;
 const {SplineMeshGeneratorV2}=require(path.join(temp,'Components/SplineMeshGeneratorV2.js'));
 const extrudeNode=new Node('ExtrudeV2'),extrudeRenderer=extrudeNode.addComponent(MeshRenderer);
 const extrude=extrudeNode.addComponent(SplineExtrudeV2);
 assert(extrude instanceof SplineMeshGeneratorV2);
 assert(!(extrude instanceof SplineRoadV2));
 assert.equal('knots' in extrude,false,'Extrude has no duplicated Knot list');
 assert.equal('width' in extrude,false,'Extrude must not inherit Road width/curb settings');
 assert.equal('junctionStartTrim' in extrude,false);
 extrude.pathSource=generatorPath;extrude.sampleStep=1;extrude.radius=.75;
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
 assert(deform instanceof SplineMeshGeneratorV2);
 assert(!(deform instanceof SplineRoadV2));
 assert.equal('knots' in deform,false,'Deform has no Knot list');
 assert.equal('width' in deform,false);
 assert.equal('roadSidewalkWidth' in deform,false);
 deform.pathSource=generatorPath;deform.sampleStep=.5;
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
 // Shared SplinePath must invalidate independent generator types using the
 // same authoring source: neither generator inherits Road or its Knot list.
 extrude.rebuildPreview();deform.rebuildPreview();
 const tubeBefore=extrudeRenderer.mesh,deformBefore=deformRenderer.mesh;
 assert(tubeBefore&&deformBefore);
 const pathStart={...b.worldPosition};
 b.setWorldPosition(new Vec3(pathStart.x+.3,pathStart.y,pathStart.z));
 generatorPath.onRestore();
 assert.notEqual(extrudeRenderer.mesh,tubeBefore,
    'Shared Path invalidation must rebuild the standalone Extrude preview');
 assert.notEqual(deformRenderer.mesh,deformBefore,
    'Shared Path invalidation must rebuild the standalone Mesh Deform preview');
 assert.equal(extrude.bakedMesh,saved);
 assert.equal(deform.bakedMesh,saved);
 assert(!dAsset.destroyed,'Mesh Deform preview must not destroy source geometry');
 b.setWorldPosition(new Vec3(pathStart.x,pathStart.y,pathStart.z));
 generatorPath.onRestore();
 extrude.onDisable();deform.onDisable();
 assert(!saved.destroyed);
 // Junction Patch must preserve Manual/Baked runtime gate and use exactly
 // the Road's trimmed end ring, with no hidden runtime mesh generation.
 const patchNode=new Node('JunctionV2'),patchRenderer=patchNode.addComponent(MeshRenderer);
 const patch=patchNode.addComponent(SplineJunctionPatchV2);
 assert(patch instanceof SplineMeshGeneratorV2);
 assert(!(patch instanceof SplineRoadV2),'Junction must not inherit Road');
 assert.equal('width' in patch,false,'Junction must not inherit Road width');
 assert.equal('knots' in patch,false,'Junction must not own Road Knot nodes');
 assert.equal('roadSidewalkWidth' in patch,false);
 patch.meshMode=SplineV2MeshMode.Baked;patch.bakedMesh=saved;
 const savedCount=generated.length;
 env.EDITOR_NOT_IN_PREVIEW=false;
 patch.onEnable();assert.equal(generated.length,savedCount);
 assert.equal(patchRenderer.mesh,saved,'Junction Baked Play must not generate geometry');
 const shared=knot();
 const arms=[];
 for(let i=0;i<3;i++){
  const angle=2*Math.PI*i/3,out=knot();
  out.worldPosition=new Vec3(Math.sin(angle)*12,0,Math.cos(angle)*12);
  const n=new Node('Arm'+i);n.addComponent(MeshRenderer);
  const arm=n.addComponent(SplineRoadV2);
  const armPath=new Node('ArmPath'+i).addComponent(SplinePathV2);
  armPath.knots=[shared,out];armPath.interpolation=0;
  arm.pathSource=armPath;arm.surfaceMode=2;arm.junctionStartTrim=3;
  arm.sampleStep=.25;arm.width=4;
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
