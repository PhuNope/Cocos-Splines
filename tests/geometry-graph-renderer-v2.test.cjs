'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
 cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-geometry-graph-renderer-'));
async function run(){
 try{
  cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json',
   '--noEmit','false','--outDir',temp],{stdio:'pipe'});
  let index=0,failCreate=false,failBind=false,frameBuilds=0;
  class Vec3{
   constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
   clone(){return new Vec3(this.x,this.y,this.z);}
   length(){return Math.hypot(this.x,this.y,this.z);}
   set(x,y,z){if(x&&typeof x==='object')return this.set(x.x,x.y,x.z);
    Object.assign(this,{x,y,z});return this;}
   static add(o,a,b){return o.set(a.x+b.x,a.y+b.y,a.z+b.z);}
   static subtract(o,a,b){return o.set(a.x-b.x,a.y-b.y,a.z-b.z);}
   static transformMat4(o,a,m){return o.set(a.x+(m.m12||0),a.y+(m.m13||0),a.z+(m.m14||0));}
  }
  class Mat4{
   constructor(){Object.assign(this,{m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,
    m08:0,m09:0,m10:1,m12:0,m13:0,m14:0});}
   static invert(out,source){Object.assign(out,source);out.m12=-source.m12;
    out.m13=-source.m13;out.m14=-source.m14;return out;}
  }
  class Node{
   constructor(name='node'){this.name=name;this.uuid=name;this.isValid=true;
    this.worldMatrix=new Mat4();this.components=[];this.children=[];this.parent=null;this.active=true;this.layer=1;}
   addComponent(cls){const c=new cls();c.node=this;this.components.push(c);return c;}
   setParent(p){this.removeFromParent();this.parent=p;if(p)p.children.push(this);}
   removeFromParent(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
   destroy(){this.removeFromParent();this.isValid=false;}
   getComponent(cls){return this.components.find(x=>x instanceof cls)||null;}
  }
  class Component{
   constructor(){this.node=new Node();}
   getComponent(cls){return this.node.getComponent(cls);}
  }
  class Material{
   constructor(){this.initialized=null;this.destroyed=false;}
   initialize(opts){this.initialized=opts;}
   destroy(){this.destroyed=true;}
  }
  class Mesh{
   constructor(data){this.data=data;this.destroyed=false;this.id=++index;this.struct=null;}
   reset(info){if(failCreate)throw Error('Injected mesh reset failure');
    this.struct=info.struct;this.data=info.data;}
   destroy(){this.destroyed=true;}
  }
  class MeshRenderer extends Component{
   constructor(){super();this.mesh=null;this.material=null;this.materials=[];}
   get mesh(){return this._mesh;}
   set mesh(value){if(failBind)throw Error('Injected renderer mesh bind failure');
    this._mesh=value;}
   getSharedMaterial(i=0){return this.materials[i]??null;}
   setSharedMaterial(m,i=0){this.materials[i]=m;this.material=this.materials[0]??null;}
  }
  let physicsQueries=0,groundY=-2,missSurface=false;
  class Collider extends Component{}
  let failCollisionBind=false;
  class MeshCollider extends Collider{
   constructor(){super();this._mesh=null;this.convex=false;this.center=new Vec3();}
   get mesh(){return this._mesh;}
   set mesh(v){if(failCollisionBind&&v!==null)throw Error('Injected collider bind failure');this._mesh=v;}
  }
  class RigidBody extends Component{}
  const physics={raycastResults:[],raycast(ray,mask,length,trigger){
   physicsQueries++;
   if(missSurface)return false;
   this.raycastResults=[{collider:this.target,distance:ray.y-groundY,
    hitPoint:new Vec3(ray.x,groundY,ray.z),hitNormal:new Vec3(0,1,0)}];
   return true;
  }};
  const cc={Collider,MeshCollider,RigidBody,PhysicsSystem:{instance:physics},
   geometry:{Ray:class Ray{constructor(x,y,z){Object.assign(this,{x,y,z});}}},
   _decorator:{
    ccclass:()=>x=>x,property:()=>{},menu:()=>x=>x,
    executeInEditMode:()=>x=>x,requireComponent:()=>x=>x,
   },Node,Component,MeshRenderer,Mesh,Material,Vec3,Mat4,
   gfx:{Attribute:class Attribute{constructor(name,format){Object.assign(this,{name,format});}},
    AttributeName:{ATTR_POSITION:'a_position',ATTR_TEX_COORD:'a_texCoord',ATTR_NORMAL:'a_normal'},
    Format:{RGB32F:1,RG32F:2},PrimitiveMode:{TRIANGLE_LIST:4}},
   Color:class Color{constructor(r,g,b,a){Object.assign(this,{r,g,b,a});}},
   utils:{createMesh:options=>{
    if(failCreate)throw Error('Injected mesh allocation failure');
    return new Mesh(options);
   }},
  };
  const original=Module._load;
  Module._load=function(name,parent,isMain){
   if(name==='cc')return cc;
   if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};
   if(name==='db://cocos-gizmos/RegisterGizmos')
    return {registerGizmos:()=>klass=>klass};
   if(name==='../Core/SplineContainer')return {SplineContainer:class SplineContainer{}};
   if(name==='./SplineContainer')return {SplineContainer:class SplineContainer{}};
   if(name==='../Core/SplineWorldFrames'){
    return {createWorldFrameField:(source,begin,end,steps)=>{
     frameBuilds++;
     const frames=Array.from({length:steps+1},(_,i)=>({
      t:i/steps,
      position:{x:source.testOffset??0,y:0,z:10*i/steps},
      tangent:{x:0,y:0,z:1},
      right:{x:1,y:0,z:0},
      up:{x:0,y:1,z:0},
     }));
     return {frames,at:()=>frames[0]};
    }};
   }
   return original.call(this,name,parent,isMain);
  };
  const previousEditor=globalThis.Editor;
  try{
   const {SplineGeometryGraphRenderer}=require(temp+'/Components/SplineGeometryGraphRenderer.js');
   const node=new Node('geometry');
   const out=new MeshRenderer();
   out.node=node;node.components=[out];
   const renderer=new SplineGeometryGraphRenderer();
   renderer.node=node;node.components.push(renderer);
   let revision=1;
   renderer.spline={
    count:2,segmentCount:1,closed:false,node:new Node('spline'),
    getRevision:()=>String(revision),
   };
   renderer.rebuild();
   const first=out.mesh;
   assert(first&&first.data.positions.length>0);
   assert.deepEqual(renderer.getGraphMetrics(),{computed:3,reused:0,nodes:3});
   assert.equal(frameBuilds,1,'Initial stable World-frame sampling occurs once');
   const geomBefore=JSON.stringify(first.data);
   renderer.rebuild();
   assert.deepEqual(renderer.getGraphMetrics(),{computed:0,reused:3,nodes:3},
    'Stable graph and revision reuses all Core nodes');
   assert.equal(frameBuilds,1,'Unchanged Geometry Graph reuses sample cache too');
   assert(first.destroyed,'Replacing an owned mesh destroys only the old generated mesh');
   assert.equal(JSON.stringify(out.mesh.data),geomBefore);
   const previous=out.mesh;
   renderer.graphJson='{broken';
   assert.throws(()=>renderer.rebuild(),/JSON syntax/i);
   assert.equal(out.mesh,previous,'Parse error retains old mesh');
   assert.equal(previous.destroyed,false);
   renderer.graphJson=JSON.stringify({
    version:1,nodes:[
     {id:'source',type:'spline'},
     {id:'offset',type:'offset',input:'source',right:1,up:1},
     {id:'ribbon',type:'ribbon',input:'offset',width:3},
     {id:'output',type:'output',input:'ribbon'},
    ],output:'output'
   });
   failCreate=true;
   assert.throws(()=>renderer.rebuild(),/allocation failure/);
   assert.equal(out.mesh,previous,'GPU/mesh failure keeps prior bound mesh');
   assert.equal(previous.destroyed,false);
   failCreate=false;
   renderer.rebuild();
   assert(previous.destroyed,'Successful commit releases previous generated mesh');
   assert.equal(renderer.getGraphMetrics().reused,4,
    'Core DAG data remains valid when renderer allocation failed');
   assert.equal(frameBuilds,1,'Graph parameter edits never resample unchanged spline');
   assert(out.mesh.data.positions.some((v,i)=>i%3===1&&v===1));
   const updated=out.mesh;
   revision++;
   renderer.rebuild();
   assert.deepEqual(renderer.getGraphMetrics(),{computed:4,reused:0,nodes:4},
    'Spline source revision invalidates the whole DAG');
   assert.equal(frameBuilds,2,'Source revision forces stable World-frame resampling');
   const beforeLive=out.mesh;
   renderer.graphJson=JSON.stringify({
    version:1,nodes:[
     {id:'source',type:'spline'},
     {id:'ribbon',type:'ribbon',input:'source',width:2},
     {id:'output',type:'output',input:'ribbon'},
    ],output:'output'
   });
   renderer.update();
   assert.notEqual(out.mesh,beforeLive,'Live update rebuilds after graph change');
   assert(beforeLive.destroyed);
   renderer.showMeshGizmos=true;
   assert(renderer.getMeshGizmoGeometry()?.edgePairs.length>0);
   // Shared native Cocos JsonAsset may be referenced by many renderers;
   // content changes must invalidate graph revision without resampling spline.
   const shared={name:'RibbonPreset',json:{
     version:1,nodes:[{id:'source',type:'spline'},
      {id:'ribbon',type:'ribbon',input:'source',width:6},
      {id:'output',type:'output',input:'ribbon'}],output:'output',
   }};
   const localSaved=renderer.graphJson;
   renderer.graphAsset=shared;renderer.useGraphAsset=true;
   assert.equal(JSON.parse(renderer.activeGraphJson()).nodes[1].width,6);
   const beforeShared=out.mesh;
   const framesBefore=frameBuilds;
   renderer.rebuild();
   assert.notEqual(out.mesh,beforeShared);
   assert(beforeShared.destroyed,'Shared mode reuses output mesh ownership protocol');
   assert.equal(frameBuilds,framesBefore,'JsonAsset edit cannot resample unchanged spline');
   const sharedMesh=out.mesh;
   shared.json.nodes[1].width=9;
   renderer.update();
   assert.notEqual(out.mesh,sharedMesh,'Editing shared JsonAsset content must invalidate graph revision');
   assert.equal(frameBuilds,framesBefore);
   const validShared=out.mesh;
   shared.json.nodes[1].width=-10;
   assert.throws(()=>renderer.rebuild(),/width/);
   assert.equal(out.mesh,validShared,'Invalid shared graph preserves previous Mesh');
   assert.equal(renderer.graphJson,localSaved,'Shared edit cannot overwrite local graph JSON');
   shared.json.nodes[1].width=6;
   renderer.graphAsset=null;
   assert.throws(()=>renderer.rebuild(),/assigned JsonAsset/);
   assert.equal(out.mesh,validShared,'Missing asset must not destroy generated mesh');
   renderer.useGraphAsset=false;
   assert.equal(renderer.graphJson,localSaved);
   renderer.rebuild();
   assert.notEqual(out.mesh,validShared,'Return to local override restores local graph');
   // Opt-in Graph V2: independent MeshRenderers may consume distinct branches
   // of the same JsonAsset, with no extra children or source mutations.
   const multiShared={name:'RoadAndPipe',json:{
    version:2,nodes:[
     {id:'source',type:'spline'},
     {id:'road',type:'ribbon',input:'source',width:3},
     {id:'pipe',type:'tube',input:'source',radius:1,radialSegments:8},
     {id:'outputRoad',type:'output',input:'road'},
     {id:'outputPipe',type:'output',input:'pipe'},
    ],output:'outputRoad',
   }};
   renderer.useGraphAsset=true;renderer.graphAsset=multiShared;renderer.outputId='';
   renderer.rebuild();
   const primary=out.mesh;
   assert.equal(renderer.getGraphMetrics().nodes,5);
   const peerNode=new Node('geometryPeer'),peerMesh=new MeshRenderer();
   peerMesh.node=peerNode;peerNode.components=[peerMesh];
   const peer=new SplineGeometryGraphRenderer();
   peer.node=peerNode;peerNode.components.push(peer);
   peer.spline=renderer.spline;
   peer.graphAsset=multiShared;peer.useGraphAsset=true;peer.outputId='outputPipe';
   peer.rebuild();
   assert(peerMesh.mesh);
   assert(peerMesh.mesh.data.positions.length>primary.data.positions.length,
    'Different output IDs select different typed meshes from the shared graph');
   assert.equal(peer.getGraphMetrics().nodes,5);
   const priorPipe=peerMesh.mesh;
   const sharedBefore=JSON.stringify(multiShared.json);
   renderer.outputId='outputPipe';
   renderer.rebuild();
   assert.equal(out.mesh.data.positions.length,priorPipe.data.positions.length,
    'Switching output ID reuses sampled path and chooses pipe output');
   assert.equal(renderer.getGraphMetrics().reused,5,
    'Changing selection does not dirty the cached graph');
   renderer.outputId='doesNotExist';
   const beforeInvalid=out.mesh;
   assert.throws(()=>renderer.rebuild(),/selected Output Node/);
   assert.equal(out.mesh,beforeInvalid,'Unknown output retains previous mesh');
   assert.equal(beforeInvalid.destroyed,false);
   renderer.outputId='outputRoad';
   renderer.rebuild();
   multiShared.json.nodes.find(n=>n.id==='pipe').radius=2;
   peer.update();
   assert.notEqual(peerMesh.mesh,priorPipe,'Shared graph branch parameter hot update');
   assert.equal(JSON.stringify(multiShared.json)===sharedBefore,false);
   renderer.rebuild();
   assert.equal(renderer.getGraphMetrics().computed,2,
    'Only changed pipe branch recomputes, while road output remains cached');
   assert.equal(JSON.stringify(renderer.graphJson),JSON.stringify(localSaved),
    'Shared V2 must not mutate local graphJson');
   peer.onDestroy();
   assert(peerMesh.mesh===null,'Peer releases only its own transient generated Mesh');
   // Phase 4.3g2 opt-in: one MeshRenderer hosts distinct material primitives
   // from both V2 outputs. Lexical Output ID order maps to material slots.
   const oldOnly=out.mesh,sourceChildren=node.components.length;
   const matPipe=new Material(),matRoad=new Material();
   renderer.material=matPipe;renderer.materialB=matRoad;
   renderer.renderAllOutputs=true;renderer.outputId='nonsense-is-ignored';
   renderer.rebuild();
   const multiMesh=out.mesh;
   assert.notEqual(multiMesh,oldOnly);
   assert(oldOnly.destroyed);
   assert.equal(multiMesh.struct.primitives.length,2);
   assert.equal(multiMesh.struct.vertexBundles.length,2);
   assert.deepEqual(renderer.getRenderedOutputIds(),['outputPipe','outputRoad']);
   assert.equal(out.getSharedMaterial(0),matPipe);
   assert.equal(out.getSharedMaterial(1),matRoad);
   assert.equal(renderer.getGraphMetrics().reused,5,
    'All outputs are reused from the same typechecked graph cache');
   assert.equal(node.components.length,sourceChildren,
    'Multi-output cannot create extra renderers, children or nodes');
   assert(renderer.getMeshGizmoGeometry()?.edgePairs.length>0);
   const multiProfile=renderer.profileGraph();
   assert.deepEqual([multiProfile.cold.computed,multiProfile.warm.reused],[5,5]);
   assert.equal(multiProfile.outputId,'outputRoad',
    'Multi-output profiling uses graph default, ignoring stale Output ID');
   assert.equal(out.mesh,multiMesh,
    'Profiling cannot replace the multi-material MeshRenderer mesh');
   renderer.outputId='also-ignored';
   renderer.update();
   assert.equal(out.mesh,multiMesh,
    'Output ID changes are irrelevant in Render All Outputs mode');
   // Phase 4.3g2b1: manual material slot order, complete-permutation
   // validation, two-phase rollback and cached geometry / frames.
   const alphabeticalMesh=out.mesh,frameBeforeOrder=frameBuilds;
   renderer.outputOrder='outputRoad, outputPipe';
   renderer.update();
   const reversedMesh=out.mesh;
   assert.notEqual(reversedMesh,alphabeticalMesh);
   assert.deepEqual(renderer.getRenderedOutputIds(),['outputRoad','outputPipe']);
   assert.equal(reversedMesh.struct.primitives.length,2);
   assert.equal(renderer.getGraphMetrics().reused,5);
   assert.equal(frameBuilds,frameBeforeOrder,'Slot reorder does not resample frames');
   assert.equal(out.getSharedMaterial(0),matPipe);
   assert.equal(out.getSharedMaterial(1),matRoad);
   for(const invalid of ['outputRoad','outputPipe,outputPipe',
     'outputRoad,unknown','outputRoad,outputPipe,unknown']){
     renderer.outputOrder=invalid;
     assert.throws(()=>renderer.rebuild(),/Output Order/);
     assert.equal(out.mesh,reversedMesh,
       'Bad Output Order cannot overwrite last committed Mesh');
     assert.deepEqual(renderer.getRenderedOutputIds(),['outputRoad','outputPipe']);
     assert.equal(reversedMesh.destroyed,false);
   }
   renderer.outputOrder='';
   renderer.update();
   assert.deepEqual(renderer.getRenderedOutputIds(),['outputPipe','outputRoad'],
     'Empty order preserves legacy alphabetic mapping');
   assert.equal(renderer.getGraphMetrics().reused,5);
   const prevCombined=multiMesh;
   multiShared.json.nodes.find(n=>n.id==='road').width=7;
   renderer.update();
   assert.notEqual(out.mesh,prevCombined,'Modifying one output rebuilds combined Mesh');
   assert.equal(renderer.getGraphMetrics().computed,2,
    'Only modified ribbon and its Output are recalculated');
   assert.equal(out.mesh.struct.primitives.length,2);
   const lastGood=out.mesh,lastOutputIds=renderer.getRenderedOutputIds();
   failCreate=true;
   assert.throws(()=>renderer.rebuild(),/mesh reset failure/);
   failCreate=false;
   assert.equal(out.mesh,lastGood,'Mesh.reset failure keeps last good multi-primitive Mesh');
   assert.equal(lastGood.destroyed,false);
   assert.deepEqual(renderer.getRenderedOutputIds(),lastOutputIds);
   failBind=true;
   assert.throws(()=>renderer.rebuild(),/mesh bind failure/);
   failBind=false;
   assert.equal(out.mesh,lastGood,'Binding failure does not overwrite previous Mesh');
   assert.equal(lastGood.destroyed,false);
   renderer.graphAsset=null;
   assert.throws(()=>renderer.rebuild(),/assigned JsonAsset/);
   assert.equal(out.mesh,lastGood);
   renderer.graphAsset=multiShared;
   // The same MeshRenderer supports 3–4 material primitives with the
   // stable lexicographically sorted V2 Output ID mapping.
   const outputsThree={...multiShared.json,nodes:[
    ...multiShared.json.nodes,
    {id:'extrude3',type:'extrude',input:'source',width:1,height:1},
    {id:'outputExtrude',type:'output',input:'extrude3'},
   ]};
   renderer.graphAsset={json:outputsThree};
   renderer.renderAllOutputs=true;renderer.outputId='ignored';
   const matThird=new Material(),matFourth=new Material();
   renderer.materialC=matThird;
   renderer.rebuild();
   assert.equal(out.mesh.struct.primitives.length,3);
   assert.deepEqual(renderer.getRenderedOutputIds(),
    ['outputExtrude','outputPipe','outputRoad']);
   assert.equal(out.getSharedMaterial(0),matPipe);
   assert.equal(out.getSharedMaterial(1),matRoad);
   assert.equal(out.getSharedMaterial(2),matThird);
   renderer.graphAsset={json:{...outputsThree,nodes:[
    ...outputsThree.nodes,
    {id:'outputTubeX',type:'output',input:'pipe'},
   ]}};
   renderer.materialD=matFourth;
   renderer.rebuild();
   assert.equal(out.mesh.struct.primitives.length,4);
   assert.deepEqual(renderer.getRenderedOutputIds(),
    ['outputExtrude','outputPipe','outputRoad','outputTubeX']);
   assert.equal(out.getSharedMaterial(3),matFourth);
   assert.equal(node.components.length,sourceChildren);
   renderer.graphAsset=multiShared;
   renderer.renderAllOutputs=false;renderer.outputId='';
   renderer.material=null;renderer.materialB=null;renderer.materialC=null;
   renderer.materialD=null;
   renderer.rebuild();
   assert.equal(out.mesh.struct,null,
    'Disabled multi-output uses the original single-primitive utils.createMesh path');
   assert.deepEqual(renderer.getRenderedOutputIds(),['outputRoad']);
   assert(lastGood.destroyed,'Switching modes releases only the former generated Mesh');
   assert.equal(node.components.length,sourceChildren);
   const beforeProfileMesh=out.mesh,profileFrameBuilds=frameBuilds;
   const oldGraphMetrics=renderer.getGraphMetrics();
   const profile=renderer.profileGraph();
   assert.equal(profile.graphVersion,2);
   assert.equal(profile.outputId,'outputRoad');
   assert.equal(profile.sampledFrames,13);
   assert.deepEqual([profile.cold.computed,profile.cold.reused],[5,0]);
   assert.deepEqual([profile.warm.computed,profile.warm.reused],[0,5]);
   assert.equal(profile.cold.nodes.length,5);
   assert(profile.warm.nodes.every(n=>n.cached));
   assert.equal(frameBuilds,profileFrameBuilds,
    'Warm/cold CPU profile must reuse sampled source frames');
   assert.equal(out.mesh,beforeProfileMesh,
    'CPU profiling cannot allocate or replace renderer-owned mesh');
   assert.deepEqual(renderer.getGraphMetrics(),oldGraphMetrics,
    'Diagnostic uses an isolated runner and does not alter live cache');
   renderer.useGraphAsset=false;renderer.graphAsset=null;renderer.outputId='';
   renderer.rebuild();
   const localMesh=out.mesh;
   const localProfile=renderer.profileGraph();
   assert.equal(localProfile.graphVersion,1);
   assert.equal(localProfile.cold.nodes.length,3);
   assert.equal(out.mesh,localMesh);
   renderer.graphJson='{invalid';
   assert.throws(()=>renderer.profileGraph(),/syntax/i);
   assert.equal(out.mesh,localMesh,'Invalid profiling graph retains last Mesh');
   renderer.graphJson=localSaved;
   // Native Mesh Asset reference belongs to the renderer, not the Graph JSON.
   const importedPos=new Float32Array([-1,0,0,1,0,0,-1,0,1,1,0,1]);
   const importedUV=new Float32Array([0,0,1,0,0,1,1,1]);
   const importedIndices=new Uint16Array([0,2,1,1,2,3]);
   const bytes=new ArrayBuffer(16),byteView=new Uint8Array(bytes);
   const imported={uuid:'readable-asset',data:bytes,allowDataAccess:true,
    struct:{primitives:[{vertexBundelIndices:[0]}],vertexBundles:[{attributes:[
      {name:'a_position',format:1},{name:'a_texCoord',format:2}]}]},
    readAttribute(_i,name){return name==='a_position'?importedPos:
      name==='a_texCoord'?importedUV:null;},
    readAttributeFormat(_i,name){return name==='a_position'?{name:'RGB32F'}:
      name==='a_texCoord'?{name:'RG32F'}:null;},
    readIndices(){return importedIndices;},
   };
   renderer.graphJson=JSON.stringify({version:1,nodes:[
    {id:'source',type:'spline'},{id:'sourceAsset',type:'meshAsset'},
    {id:'deform',type:'meshDeform',input:'source',meshInput:'sourceAsset',
     width:1,height:1,repeats:2},
    {id:'output',type:'output',input:'deform'},
   ],output:'output'});
   renderer.sourceMesh=imported;
   const beforeAsset=Array.from(importedPos),frameCountBeforeImport=frameBuilds;
   renderer.rebuild();
   assert.equal(renderer.getGraphMetrics().nodes,4);
   assert.equal(out.mesh.data.positions.length/3,8);
   assert.equal(frameBuilds,frameCountBeforeImport,'Mesh Asset change must reuse sampled spline frames');
   assert.deepEqual(Array.from(importedPos),beforeAsset,'Imported source buffer must remain unchanged');
   const graphMesh=out.mesh,previousAssetOutput=JSON.stringify(graphMesh.data);
   renderer.rebuild();
   assert.equal(renderer.getGraphMetrics().reused,4);
   importedPos[0]=-2;byteView[0]=24;
   renderer.update();
   assert.notEqual(out.mesh,graphMesh,'Reimport with same byte length invalidates graph output');
   assert.notEqual(JSON.stringify(out.mesh.data),previousAssetOutput);
   assert.equal(renderer.getGraphMetrics().computed,3);
   const goodAssetOutput=out.mesh;
   renderer.sourceMesh={...imported,allowDataAccess:false};
   assert.throws(()=>renderer.rebuild(),/Allow Data Access/);
   assert.equal(out.mesh,goodAssetOutput,'Invalid imported asset must not overwrite last Mesh');
   renderer.sourceMesh=imported;
   const cpuImport=renderer.profileGraph();
   assert(cpuImport.cold.nodes.some(n=>n.type==='meshAsset'));
   assert(cpuImport.warm.nodes.every(n=>n.cached));
   assert.equal(out.mesh,goodAssetOutput,'Profiler must not replace generated imported mesh');
   // Dual Mesh Asset slots: two imported sources are independent on one Graph.
   const slotBPos=new Float32Array([-1,0,0,1,0,0,-1,0,1,1,0,1]);
   const slotBData=new ArrayBuffer(16),slotBBytes=new Uint8Array(slotBData);
   const slotB={...imported,uuid:'readable-asset-b',data:slotBData,
    readAttribute(_i,name){return name==='a_position'?slotBPos:
      name==='a_texCoord'?importedUV:null;}};
   renderer.graphJson=JSON.stringify({version:2,nodes:[
    {id:'source',type:'spline'},
    {id:'assetA',type:'meshAsset'},
    {id:'assetB',type:'meshAsset',slot:1},
    {id:'deformA',type:'meshDeform',input:'source',meshInput:'assetA',axis:0},
    {id:'deformB',type:'meshDeform',input:'source',meshInput:'assetB',axis:2},
    {id:'outputA',type:'output',input:'deformA'},
    {id:'outputB',type:'output',input:'deformB'},
   ],output:'outputA'});
   renderer.sourceMeshB=slotB;renderer.outputId='outputA';
   const slotFrames=frameBuilds;
   renderer.rebuild();
   assert.equal(frameBuilds,slotFrames,'Changing mesh sources never resamples spline');
   assert.deepEqual(renderer.getGraphMetrics(),{computed:6,reused:1,nodes:7},
    'Shared spline source cache remains valid when upgrading to dual Mesh slots');
   const slotAMesh=JSON.stringify(out.mesh.data);
   slotBPos[0]=-1.75;slotBBytes[0]=31;
   renderer.update();
   assert.deepEqual(renderer.getGraphMetrics(),{computed:3,reused:4,nodes:7},
    'Reimport of slot B invalidates only its own branch');
   assert.equal(JSON.stringify(out.mesh.data),slotAMesh,
    'Slot A output is bit-for-bit stable when only Slot B changes');
   renderer.outputId='outputB';
   renderer.rebuild();
   assert.notEqual(JSON.stringify(out.mesh.data),slotAMesh,
    'Output B routes to the independent Mesh Asset slot');
   const outputBMesh=out.mesh;
   renderer.sourceMeshB=null;
   assert.throws(()=>renderer.rebuild(),/Source Mesh/);
   assert.equal(out.mesh,outputBMesh,'Missing slot B keeps previous bound Mesh');
   renderer.sourceMeshB=slotB;renderer.outputId='';
   // Phase 4.3g1: the *same* imported FBX Mesh with two submeshes can
   // feed slots A and B with independent native submesh selection.
   const subMeshPos=new Float32Array([-2,0,0,2,0,0,-2,0,1,2,0,1]);
   const multiImported={...imported,uuid:'readable-two-submeshes',
    struct:{...imported.struct,
     primitives:[{vertexBundelIndices:[0],primitiveMode:4},
      {vertexBundelIndices:[1],primitiveMode:4}],
     vertexBundles:[imported.struct.vertexBundles[0],imported.struct.vertexBundles[0]]},
    readAttribute(i,name){return name==='a_position'?
      (i===0?importedPos:subMeshPos):name==='a_texCoord'?importedUV:null;},
    readIndices(i){return importedIndices;},
   };
   renderer.sourceMesh=multiImported;
   renderer.sourceMeshB=multiImported;
   renderer.sourceSubMesh=0;renderer.sourceSubMeshB=1;
   renderer.outputId='outputB';
   const beforeSubMeshFrames=frameBuilds;
   renderer.rebuild();
   assert.equal(frameBuilds,beforeSubMeshFrames,
    'Submesh selector does not resample the source spline');
   const selectedSecond=JSON.stringify(out.mesh.data);
   assert.notEqual(selectedSecond,slotAMesh,
    'Selected imported submesh must affect output geometry');
   renderer.sourceSubMeshB=0;
   renderer.rebuild();
   assert.notEqual(JSON.stringify(out.mesh.data),selectedSecond,
    'Selecting a different submesh changes the dependent mesh output');
   assert.deepEqual(renderer.getGraphMetrics(),{computed:3,reused:4,nodes:7},
    'Changing submesh B dirties only asset B, deformB and outputB');
   const firstFromB=out.mesh,firstFromBData=JSON.stringify(out.mesh.data);
   renderer.sourceSubMeshB=9;
   assert.throws(()=>renderer.rebuild(),/Submesh Index/);
   assert.equal(out.mesh,firstFromB,
    'Invalid submesh selection preserves previously generated mesh');
   renderer.sourceSubMeshB=1;
   renderer.rebuild();
   assert.equal(JSON.stringify(out.mesh.data),selectedSecond);
   renderer.outputId='outputA';
   renderer.rebuild();
   const originalA=JSON.stringify(out.mesh.data);
   renderer.sourceSubMesh=1;renderer.rebuild();
   assert.notEqual(JSON.stringify(out.mesh.data),originalA,
    'Submesh A selector must be independent of submesh B');
   assert.deepEqual(renderer.getGraphMetrics(),{computed:3,reused:4,nodes:7});
   // Phase 4.3g2b2a: read shared Materials from an imported model
   // MeshRenderer, selecting the source submesh for each graph branch.
   renderer.sourceSubMesh=0;renderer.sourceSubMeshB=1;
   const importedRenderer=new MeshRenderer();
   importedRenderer.mesh=multiImported;
   const importedMatA=new Material(),importedMatB=new Material();
   importedRenderer.setSharedMaterial(importedMatA,0);
   importedRenderer.setSharedMaterial(importedMatB,1);
   renderer.materialSourceRenderer=importedRenderer;
   renderer.materialSourceRendererB=importedRenderer;
   renderer.autoBindImportedMaterials=true;
   renderer.renderAllOutputs=true;
   renderer.outputOrder='outputB,outputA';renderer.outputId='ignored';
   const beforeMaterialFrames=frameBuilds;
   renderer.rebuild();
   const importedCombined=out.mesh;
   assert.deepEqual(renderer.getRenderedOutputIds(),['outputB','outputA']);
   assert.equal(out.mesh.struct.primitives.length,2);
   assert.equal(out.getSharedMaterial(0),importedMatB);
   assert.equal(out.getSharedMaterial(1),importedMatA);
   assert.equal(frameBuilds,beforeMaterialFrames);
   assert.equal(importedRenderer.getSharedMaterial(0),importedMatA,
    'Source FBX model Materials must remain untouched');
   const importedMatHot=new Material(),metricsBeforeHot=renderer.getGraphMetrics();
   importedRenderer.setSharedMaterial(importedMatHot,1);
   renderer.update();
   assert.equal(out.mesh,importedCombined,'Hot material update never rebuilds geometry');
   assert.deepEqual(renderer.getGraphMetrics(),metricsBeforeHot);
   assert.equal(out.getSharedMaterial(0),importedMatHot);
   assert.equal(out.getSharedMaterial(1),importedMatA);
   const manualOverride=new Material();
   renderer.material=manualOverride;
   renderer.rebuild();
   assert.equal(out.getSharedMaterial(0),manualOverride,
    'Explicit Material A wins over inferred imported Material');
   renderer.material=null;renderer.rebuild();
   assert.equal(out.getSharedMaterial(0),importedMatHot);
   const beforeInvalidImport=out.mesh;
   importedRenderer.mesh=new Mesh({incorrect:true});
   assert.throws(()=>renderer.rebuild(),/does not match Source Mesh/);
   assert.equal(out.mesh,beforeInvalidImport,'Mismatched source model cannot replace last good Mesh');
   assert.equal(beforeInvalidImport.destroyed,false);
   assert.equal(out.getSharedMaterial(0),importedMatHot);
   importedRenderer.mesh=multiImported;
   importedRenderer.setSharedMaterial(null,1);
   assert.throws(()=>renderer.rebuild(),/missing Material/);
   assert.equal(out.mesh,beforeInvalidImport,'Missing source material rejects before mesh allocation');
   assert.equal(out.getSharedMaterial(1),importedMatA);
   importedRenderer.setSharedMaterial(importedMatHot,1);
   renderer.materialSourceRendererB=null;
   assert.throws(()=>renderer.rebuild(),/Material Source Renderer/);
   assert.equal(out.mesh,beforeInvalidImport);
   renderer.materialSourceRendererB=importedRenderer;
   renderer.rebuild();
   assert.equal(out.getSharedMaterial(0),importedMatHot);
   // Failure inside destination material assignment rolls back to the
   // previous Mesh + Materials before destroying only the transient Mesh.
   const committedImportedMesh=out.mesh;
   const previousSlot0=out.getSharedMaterial(0),previousSlot1=out.getSharedMaterial(1);
   const oldSet=out.setSharedMaterial.bind(out);
   let injected=false;
   out.setSharedMaterial=(material,slot)=>{
    if(slot===1&&!injected){injected=true;throw Error('Injected Material slot failure');}
    return oldSet(material,slot);
   };
   renderer.materialB=new Material();
   assert.throws(()=>renderer.rebuild(),/Injected Material slot failure/);
   out.setSharedMaterial=oldSet;
   renderer.materialB=null;
   assert.equal(out.mesh,committedImportedMesh,'Material setter failure restores previous Mesh');
   assert.equal(out.getSharedMaterial(0),previousSlot0);
   assert.equal(out.getSharedMaterial(1),previousSlot1);
   assert.equal(committedImportedMesh.destroyed,false);
   renderer.autoBindImportedMaterials=false;
   renderer.rebuild();
   assert.equal(renderer.getRenderedOutputIds().length,2);
   assert.equal(importedRenderer.getSharedMaterial(1),importedMatHot,
    'Turning off opt-in never changes source model Material');
   renderer.renderAllOutputs=false;renderer.outputOrder='';
   renderer.sourceSubMesh=0;renderer.sourceSubMeshB=0;
   renderer.sourceMesh=null;renderer.sourceMeshB=null;
   // Phase 4.3g2b2b1: renderer-owned authored polygon JsonAssets. The
   // optional per-Extrude profileSlot maps independent A/B data into one
   // multi-output mesh; pure preset nodes remain unchanged by default.
   const lProfile={format:'cocos-splines/profile',version:1,points:[
    {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:-.1},
    {x:.1,y:-.1},{x:.1,y:.5},{x:-.5,y:.5},
   ]};
   const squareProfile={format:'cocos-splines/profile',version:1,points:[
    {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},
   ]};
   const authoredGraph=JSON.stringify({version:2,nodes:[
    {id:'source',type:'spline'},
    {id:'extrudeA',type:'extrude',input:'source',width:2,height:2,
     profileSlot:0,capEnds:true},
    {id:'extrudeB',type:'extrude',input:'source',width:2,height:1,
     profileSlot:1,capEnds:true},
    {id:'outputA',type:'output',input:'extrudeA'},
    {id:'outputB',type:'output',input:'extrudeB'},
   ],output:'outputA'});
   renderer.graphJson=authoredGraph;
   renderer.useGraphAsset=false;renderer.graphAsset=null;
   renderer.renderAllOutputs=true;renderer.outputOrder='';
   renderer.profileAssetA={json:lProfile};
   renderer.profileAssetB={json:squareProfile};
   const authoredFrameBuilds=frameBuilds;
   renderer.rebuild();
   assert.deepEqual(renderer.getRenderedOutputIds(),['outputA','outputB']);
   assert.equal(out.mesh.struct.primitives.length,2);
   assert.equal(frameBuilds,authoredFrameBuilds);
   const mappedGraph=JSON.parse(authoredGraph);
   mappedGraph.nodes.find(n=>n.id==='extrudeA').profileMaterials={outer:0,startCap:1,endCap:2};
   renderer.graphJson=JSON.stringify(mappedGraph);renderer.rebuild();
   assert.equal(out.mesh.struct.primitives.length,4);
   assert.equal(out.mesh.struct.vertexBundles.length,2);
   assert.deepEqual(renderer.getRenderedMaterialGroups(),[{outputId:'outputA',slot:0},{outputId:'outputA',slot:1},{outputId:'outputA',slot:2},{outputId:'outputB',slot:0}]);
   const lastMapped=out.mesh;
   const beforeBakeMetrics=renderer.getGraphMetrics();
   const snapshot=renderer.snapshotGeometryForBake();
   assert.deepEqual(snapshot.outputs.map(o=>o.outputId),['outputA','outputB']);
   assert(snapshot.outputs[0].geometry.triangleMaterialSlots.includes(2));
   assert.equal(out.mesh,lastMapped);
   assert.deepEqual(renderer.getGraphMetrics(),beforeBakeMetrics);
   assert.equal(frameBuilds,authoredFrameBuilds);
   mappedGraph.nodes.find(n=>n.id==='extrudeB').profileMaterials={outer:0,endCap:1};
   renderer.graphJson=JSON.stringify(mappedGraph);
   assert.throws(()=>renderer.rebuild(),/four material primitives/i);
   assert.equal(out.mesh,lastMapped);
   renderer.renderAllOutputs=false;renderer.outputId='outputA';renderer.rebuild();
   assert.equal(out.mesh.struct.primitives.length,3);
   assert.deepEqual(renderer.getRenderedOutputIds(),['outputA']);
   renderer.renderAllOutputs=true;renderer.outputId='';renderer.graphJson=authoredGraph;renderer.rebuild();
   assert.equal(frameBuilds,authoredFrameBuilds);
   // UV-only Profile edits dirty only dependent Extrude + Output, never
   // source spline frames or the other authored branch.
   const uvBaseline=out.mesh;
   squareProfile.uv={seamEdge:2,edgeWeights:[1,2,1,1]};
   renderer.update();
   assert.notEqual(out.mesh,uvBaseline,'Hot Profile UV change rebuilds output');
   assert.deepEqual(renderer.getGraphMetrics(),{computed:2,reused:3,nodes:5});
   assert.equal(frameBuilds,authoredFrameBuilds);
   const uvLastGood=out.mesh;
   squareProfile.uv.edgeWeights[0]=5;
   assert.throws(()=>renderer.rebuild(),/Graph Profile Asset UV/);
   assert.equal(out.mesh,uvLastGood,'Invalid authored UV retains last-good Mesh');
   assert.equal(uvLastGood.destroyed,false);
   squareProfile.uv.edgeWeights[0]=1;
   renderer.rebuild();
   // Opt-in metric U tiling on Profile B changes UV only, not Path or A.
   const normalizedUvMesh=out.mesh;
   squareProfile.uv.uMetersPerRepeat=1.5;
   renderer.update();
   assert.notEqual(out.mesh,normalizedUvMesh,'Metric U changes output mesh');
   assert.deepEqual(renderer.getGraphMetrics(),{computed:2,reused:3,nodes:5});
   assert.equal(frameBuilds,authoredFrameBuilds,
    'Metric UV uses previous Spline frame samples');
   const lastMetricMesh=out.mesh;
   squareProfile.uv.uMetersPerRepeat=0;
   assert.throws(()=>renderer.rebuild(),/Graph Profile Asset UV/);
   assert.equal(out.mesh,lastMetricMesh,'Invalid metric UV keeps last-good Mesh');
   assert.equal(lastMetricMesh.destroyed,false);
   squareProfile.uv.uMetersPerRepeat=1.5;
   renderer.rebuild();
   // World-space Profile U consumes the renderer matrix and preserves
   // prior mesh when the JsonAsset schema is invalid.
   // Multi-output uses an interleaved vertex bundle, not Mesh.data.uvs.
   // Read UV0 from the second typed submesh vertex bundle (slot B).
   const outputBUv=mesh=>{
    const bundle=mesh.struct.vertexBundles[1];
    const bytes=mesh.data;
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const result=[];
    for(let i=0;i<bundle.view.count;i++){
     const offset=bundle.view.offset+i*bundle.view.stride;
     result.push(dv.getFloat32(offset+24,true),
      dv.getFloat32(offset+28,true));
    }
    return result;
   };
   const localUv=outputBUv(out.mesh);
   squareProfile.uv.uWorldSpace=true;
   renderer.rebuild();
   assert.deepEqual(outputBUv(out.mesh),localUv,
    'Identity renderer matrix reproduces nominal side metric U');
   assert.deepEqual(renderer.getGraphMetrics(),{computed:2,reused:3,nodes:5});
   const unchangedWorldFrames=frameBuilds;
   node.worldMatrix.m00=2;
   renderer.rebuild();
   assert.notDeepEqual(outputBUv(out.mesh),localUv,
    'Renderer Node scale adjusts opted-in World-space U');
   assert.equal(frameBuilds,unchangedWorldFrames+1,
    'Transform change invalidates cached local spline frames');
   node.worldMatrix.m00=1;
   renderer.rebuild();
   assert.deepEqual(outputBUv(out.mesh),localUv,
    'Reverting scale restores original UV metric');
   const framesAfterWorldTransforms=frameBuilds;
   const lastWorldGood=out.mesh;
   squareProfile.uv.uWorldSpace='true';
   assert.throws(()=>renderer.rebuild(),/Graph Profile Asset UV uWorldSpace/);
   assert.equal(out.mesh,lastWorldGood,'Bad world UV flag retains prior mesh');
   squareProfile.uv.uWorldSpace=true;
   renderer.rebuild();
   const authoredFirst=out.mesh;
   renderer.profileAssetC={json:{format:'bad'}};
   renderer.update();
   assert.equal(out.mesh,authoredFirst,
    'Unused author Profile Asset C cannot invalidate the renderer');
   squareProfile.points[1].x=.8;
   renderer.update();
   assert.notEqual(out.mesh,authoredFirst,'Changing active Profile B rebuilds mesh');
   assert.deepEqual(renderer.getGraphMetrics(),{computed:2,reused:3,nodes:5},
    'Only Extrude B and Output B recalculate when Profile B changes');
   assert.equal(frameBuilds,framesAfterWorldTransforms,
    'Updating authored profile reuses sampled Spline frames');
   const authoredLastGood=out.mesh;
   squareProfile.points[1].x=3;
   assert.throws(()=>renderer.rebuild(),/Graph Profile Asset/);
   assert.equal(out.mesh,authoredLastGood,
    'Invalid authored profile retains last-good generated Mesh');
   assert.equal(authoredLastGood.destroyed,false);
   squareProfile.points[1].x=.8;
   renderer.profileAssetB=null;
   assert.throws(()=>renderer.rebuild(),/Graph Profile Asset slot 1/);
   assert.equal(out.mesh,authoredLastGood);
   renderer.profileAssetB={json:squareProfile};
   renderer.rebuild();
   const authoredProfile=renderer.profileGraph();
   assert.equal(authoredProfile.graphVersion,2);
   assert.equal(authoredProfile.cold.nodes.length,5);
   assert(authoredProfile.warm.nodes.every(n=>n.cached));
   // Opt-out: remove both profileSlot bindings and restore built-in presets.
   const presetGraph=JSON.parse(authoredGraph);
   presetGraph.nodes.filter(n=>n.type==='extrude').forEach(n=>delete n.profileSlot);
   renderer.graphJson=JSON.stringify(presetGraph);
   renderer.profileAssetA=null;renderer.profileAssetB=null;
   renderer.rebuild();
   assert.equal(out.mesh.struct.primitives.length,2);
   const external=new Mesh({other:true});
   out.mesh=external;
   renderer.onDestroy();
   assert.equal(out.mesh,external,'Destroy does not clear externally assigned Mesh');
   assert.equal(external.destroyed,false,'Never destroys mesh assets not owned by graph');
   assert(renderer.getMeshGizmoGeometry()===null);
   const source=fs.readFileSync(root+'/assets/splines/Components/SplineGeometryGraphRenderer.ts','utf8');
   assert(source.includes('@registerGizmos(SplineGeometryGraphGizmos)'));
   assert(!source.includes('onDrawGizmosSelected():'));
   const pkg=require(root+'/package.json');
   assert.equal(pkg.contributions.inspector.section.node[
     'Splines.SplineGeometryGraphRenderer'],
     './dist/contributions/inspector/GeometryGraph.js');
   assert.deepEqual(pkg.contributions.messages['rebuild-geometry-graph'].methods,
    ['rebuildGeometryGraph']);
   const panel=require(root+'/dist/contributions/inspector/GeometryGraph.js');
   assert(panel.template.includes('spl-field-graphJson'));
   assert(panel.template.includes('spl-rebuild-graph'));
   assert(pkg.scripts.test.includes('geometry-graph-renderer-v2.test.cjs'));
   // Separate renderer avoids interfering with the earlier frame/cache assertions.
   const rootNode=new Node('conform-scene'),conformNode=new Node('conform-output');
   conformNode.parent=rootNode;
   const conformOut=new MeshRenderer();conformOut.node=conformNode;
   const conformRenderer=new SplineGeometryGraphRenderer();conformRenderer.node=conformNode;
   conformNode.components=[conformOut,conformRenderer];
   conformRenderer.spline={count:2,segmentCount:1,closed:false,node:new Node('conform-source'),getRevision:()=> '1'};
   const target=new Collider();target.node=new Node('terrain');target.node.parent=rootNode;
   target.enabled=true;physics.target=target;
   conformRenderer.graphJson=JSON.stringify({version:1,output:'output',nodes:[
    {id:'source',type:'spline'},{id:'conform',type:'conform',input:'source'},
    {id:'ribbon',type:'ribbon',input:'conform',width:2},{id:'output',type:'output',input:'ribbon'}]});
   assert.throws(()=>conformRenderer.rebuild(),/explicit/i);
   conformRenderer.conformColliders=[target];
   conformRenderer.rebuild();
   assert(physicsQueries>0);
   assert(conformOut.mesh.data.positions.some((v,i)=>i%3===1&&v===-2));
   const priorQueries=physicsQueries;
   groundY=-3;conformRenderer.rebuild();
   assert(physicsQueries>priorQueries,'Manual rebuild must re-query Physics even when bounds unchanged');
   assert(conformOut.mesh.data.positions.some((v,i)=>i%3===1&&v===-3));
   const conformedMesh=conformOut.mesh;missSurface=true;
   assert.throws(()=>conformRenderer.rebuild(),/missed/i);
   assert.equal(conformOut.mesh,conformedMesh);
   assert.equal(conformedMesh.destroyed,false);
   missSurface=false;conformRenderer.conformColliders=[target,target];
   assert.throws(()=>conformRenderer.rebuild(),/unique/i);
   assert.equal(conformOut.mesh,conformedMesh);
   const multiNode=new Node('multi-spline'),multiOut=new MeshRenderer();
   multiOut.node=multiNode;
   const multiRenderer=new SplineGeometryGraphRenderer();multiRenderer.node=multiNode;
   multiNode.components=[multiOut,multiRenderer];
   let revB=1;
   multiRenderer.spline={count:2,segmentCount:1,closed:false,node:new Node('slotA'),getRevision:()=> 'A1'};
   multiRenderer.splineB={count:2,segmentCount:1,closed:false,node:new Node('slotB'),getRevision:()=>String(revB),testOffset:10};
   multiRenderer.graphJson=JSON.stringify({version:2,output:'oa',nodes:[
    {id:'sa',type:'spline'},{id:'ra',type:'ribbon',input:'sa',width:2},{id:'oa',type:'output',input:'ra'},
    {id:'sb',type:'spline',slot:1},{id:'rb',type:'ribbon',input:'sb',width:2},{id:'ob',type:'output',input:'rb'}]});
   multiRenderer.outputId='ob';
   const beforeMulti=frameBuilds;
   multiRenderer.rebuild();
   assert.equal(frameBuilds,beforeMulti+2);
   assert.equal(multiOut.mesh.data.positions[0],9);
   multiRenderer.splineB.testOffset=20;revB++;
   multiRenderer.rebuild();
   assert.equal(frameBuilds,beforeMulti+3,'Only changed Spline B resamples');
   assert.equal(multiOut.mesh.data.positions[0],19);
   assert.deepEqual(multiRenderer.getGraphMetrics(),{computed:3,reused:3,nodes:6});
   const oldMulti=multiOut.mesh,oldB=multiRenderer.splineB;
   multiRenderer.splineB=null;
   assert.throws(()=>multiRenderer.rebuild(),/slot 1/i);
   assert.equal(multiOut.mesh,oldMulti);
   multiRenderer.splineB=oldB;
   multiRenderer.rebuild();
   assert.equal(frameBuilds,beforeMulti+3);
   multiRenderer.outputId='oa';multiRenderer.rebuild();
   assert.equal(multiOut.mesh.data.positions[0],-1);
   multiRenderer.renderAllOutputs=true;multiRenderer.rebuild();
   assert.deepEqual(multiRenderer.getRenderedOutputIds(),['oa','ob']);
   assert.equal(frameBuilds,beforeMulti+3);
   const collision=new MeshCollider();collision.node=multiNode;multiNode.components.push(collision);
   multiRenderer.generateCollider=true;multiRenderer.colliderTarget=collision;
   multiRenderer.rebuild();
   const collisionMesh=collision.mesh,visualMesh=multiOut.mesh;
   assert(collisionMesh&&collisionMesh!==visualMesh);
   assert.deepEqual(Object.keys(collisionMesh.data).sort(),['indices','positions']);
   assert.equal(multiRenderer.getGeneratedColliderMesh(),collisionMesh);
   revB++;failCollisionBind=true;
   assert.throws(()=>multiRenderer.rebuild(),/collider bind failure/i);
   failCollisionBind=false;
   assert.equal(collision.mesh,collisionMesh);assert.equal(multiOut.mesh,visualMesh);
   assert.equal(collisionMesh.destroyed,false);assert.equal(visualMesh.destroyed,false);
   multiRenderer.rebuild();assert(collisionMesh.destroyed);
   const owned=collision.mesh;
   const foreign=new Mesh({external:true});collision.mesh=foreign;
   assert.throws(()=>multiRenderer.rebuild(),/existing Mesh/i);
   assert.equal(collision.mesh,foreign);
   multiRenderer.generateCollider=false;multiRenderer.update();
   assert(owned.destroyed);assert.equal(foreign.destroyed,false);assert.equal(collision.mesh,foreign);
   collision.mesh=null;multiRenderer.generateCollider=true;
   collision.convex=true;assert.throws(()=>multiRenderer.rebuild(),/non-convex/i);collision.convex=false;
   const rb=new RigidBody();multiNode.components.push(rb);
   assert.throws(()=>multiRenderer.rebuild(),/RigidBody/i);multiNode.components.pop();
   multiRenderer.rebuild();const disabledMesh=collision.mesh;
   multiRenderer.onDisable();assert.equal(collision.mesh,null);assert(disabledMesh.destroyed);
   multiRenderer.onEnable();assert(collision.mesh);
   // Runtime chunk mode: independent nodes and meshes, output B-only invalidation,
   // material updates, collider/visual rollback and lifecycle.
   multiRenderer.runtimeChunking=true;multiRenderer.chunkTriangles=256;
   multiRenderer.material=new Material();multiRenderer.materialB=new Material();
   multiRenderer.rebuild();
   const chunks=multiRenderer.getRenderedChunkMeshes();
   assert.equal(chunks.length,2);assert.equal(multiOut.mesh,null);
   assert.equal(multiNode.children.length,2);
   assert.equal(multiNode.children[1].getComponent(MeshRenderer).getSharedMaterial(0),multiRenderer.materialB);
   multiRenderer.rebuild();assert.deepEqual(multiRenderer.getRenderedChunkMeshes(),chunks);
   revB++;multiRenderer.splineB.testOffset+=5;
   const stableCollider=collision.mesh;failCollisionBind=true;
   assert.throws(()=>multiRenderer.rebuild(),/collider bind failure/i);failCollisionBind=false;
   assert.deepEqual(multiRenderer.getRenderedChunkMeshes(),chunks);assert.equal(multiNode.children.length,2);
   assert.equal(collision.mesh,stableCollider);assert.equal(chunks[1].destroyed,false);
   multiRenderer.rebuild();const changed=multiRenderer.getRenderedChunkMeshes();
   assert.equal(changed[0],chunks[0]);assert.notEqual(changed[1],chunks[1]);assert(chunks[1].destroyed);
   multiRenderer.materialB=new Material();multiRenderer.update();
   assert.deepEqual(multiRenderer.getRenderedChunkMeshes(),changed);
   assert.equal(multiNode.children[1].getComponent(MeshRenderer).getSharedMaterial(0),multiRenderer.materialB);
   multiRenderer.runtimeChunking=false;multiRenderer.rebuild();assert(multiOut.mesh);assert.equal(multiNode.children.length,0);assert(changed.every(m=>m.destroyed));
   multiRenderer.runtimeChunking=true;multiRenderer.rebuild();const finalChunks=multiRenderer.getRenderedChunkMeshes();
   multiRenderer.onDisable();assert.equal(multiNode.children.length,0);assert(finalChunks.every(m=>m.destroyed));
   multiRenderer.onEnable();assert.equal(multiRenderer.getRenderedChunkMeshes().length,2);
   // LOD with full-detail collider and independent bake snapshot, including chunks.
   const observer=new Node('observer');observer.worldPosition=new Vec3(0,0,5);
   multiRenderer.runtimeLod=true;multiRenderer.lodTarget=observer;
   multiRenderer.lodNearDistance=20;multiRenderer.lodFarDistance=60;
   multiRenderer.runtimeChunking=false;multiRenderer.rebuild();
   assert.equal(multiRenderer.getRenderedLodLevel(),0);
   const fullMesh=multiOut.mesh,fullCollider=collision.mesh;
   const fullTriangles=fullMesh.struct.primitives.reduce((s,p)=>s+p.indexView.count/3,0);
   const bakeBefore=multiRenderer.snapshotGeometryForBake();
   observer.worldPosition=new Vec3(0,30,5);multiRenderer.update();
   assert.equal(multiRenderer.getRenderedLodLevel(),1);assert.equal(collision.mesh,fullCollider);
   const medium=multiOut.mesh;assert(medium.struct.primitives.reduce((s,p)=>s+p.indexView.count/3,0)<fullTriangles);
   assert.deepEqual(multiRenderer.snapshotGeometryForBake(),bakeBefore);
   observer.worldPosition=new Vec3(0,19,5);multiRenderer.update();assert.equal(multiOut.mesh,medium);
   observer.worldPosition=new Vec3(0,0,100);failCreate=true;multiRenderer.update();failCreate=false;
   assert.equal(multiOut.mesh,medium);assert.equal(multiRenderer.getRenderedLodLevel(),1);assert.equal(collision.mesh,fullCollider);
   multiRenderer.rebuild();assert.equal(multiRenderer.getRenderedLodLevel(),2);assert.equal(collision.mesh,fullCollider);
   assert(multiOut.mesh.struct.primitives.reduce((s,p)=>s+p.indexView.count/3,0)<medium.struct.primitives.reduce((s,p)=>s+p.indexView.count/3,0));
   multiRenderer.runtimeChunking=true;multiRenderer.rebuild();assert.equal(multiRenderer.getRenderedLodLevel(),2);assert.equal(multiRenderer.getRenderedChunkMeshes().length,2);
   observer.worldPosition=new Vec3(0,0,5);multiRenderer.update();assert.equal(multiRenderer.getRenderedLodLevel(),0);
   const destroyedMesh=collision.mesh;
   multiRenderer.onDestroy();assert.equal(collision.mesh,null);assert(destroyedMesh.destroyed);assert.equal(multiNode.children.length,0);
   console.log('GEOMETRY GRAPH RENDERER V2 PASS: atomic generated Mesh replacement, frame cache, source immutability, live updates, Inspector and ownership.');
  }finally{
   Module._load=original;globalThis.Editor=previousEditor;
  }
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
run().catch(err=>{console.error(err);process.exitCode=1;});
