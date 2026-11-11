'use strict';
/** v2 playback contract, exercising the actual compiled component with Cocos fakes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'cocos-v2-road-runtime-'));
try{
 const types=path.join(root,'tests/types/cc.d.ts');
 const file=path.join(root,'assets/splines-v2/Components/SplineRoadV2.ts');
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict','--experimentalDecorators',
  '--skipLibCheck','--useDefineForClassFields','false','--rootDir',path.join(root,'assets/splines-v2'),
  '--outDir',temp,file,path.join(root,'assets/splines-v2/Components/SplineExtrudeV2.ts'),types],{stdio:'pipe'});
 const generated=[];
 const env={EDITOR_NOT_IN_PREVIEW:false};
 const identity={};
 class Vec3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  static transformMat4(out,v){out.x=v.x;out.y=v.y;out.z=v.z;return out;}
 }
 class Mat4{static invert(out){return out;}}
 class Mesh{constructor(){this.isValid=true;this.destroyed=false;}destroy(){this.isValid=false;this.destroyed=true;}}
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
  destroy(){this.isValid=false;for(const c of this.components)if(c.mesh)c.mesh=null;this.children=[];}
 }
 const passthrough=()=>cls=>cls;
 const decorator={ccclass:passthrough,menu:passthrough,requireComponent:passthrough,
  executeInEditMode:passthrough,property:()=>()=>{}};
 class Attribute{constructor(name,format){this.name=name;this.format=format;}}
 const cc={_decorator:decorator,Component,Node,Mesh,MeshRenderer,Material,Vec3,Mat4,
  CCObject:{Flags:{DontSave:8,HideInHierarchy:1024}},Enum:x=>x,
  gfx:{Attribute,AttributeName:{ATTR_TEX_COORD1:'a_texCoord1'},Format:{RG32F:3}},
  utils:{createMesh(data){const mesh=new Mesh();mesh.geometry=data;generated.push(mesh);return mesh;}}
 };
 const originalLoad=Module._load;
 Module._load=function(request,parent,isMain){
  if(request==='cc')return cc;
  if(request==='cc/env')return env;
  return originalLoad.apply(this,arguments);
 };
 let SplineRoadV2,SplineV2MeshMode,SplineExtrudeV2;
 try{({SplineRoadV2,SplineV2MeshMode}=require(path.join(temp,'Components/SplineRoadV2.js')));
  ({SplineExtrudeV2}=require(path.join(temp,'Components/SplineExtrudeV2.js')));}
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
  console.log('V2 ROAD PLAY PASS: Manual/Baked zero generation, Dynamic meshes dispose, UV2 bridge, Editor-only bake and stale checks.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
