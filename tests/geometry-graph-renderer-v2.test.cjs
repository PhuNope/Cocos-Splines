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
  let index=0,failCreate=false;
  class Vec3{
   constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
   clone(){return new Vec3(this.x,this.y,this.z);}
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
    this.worldMatrix=new Mat4();this.components=[];}
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
   constructor(data){this.data=data;this.destroyed=false;this.id=++index;}
   destroy(){this.destroyed=true;}
  }
  class MeshRenderer extends Component{
   constructor(){super();this.mesh=null;this.material=null;}
   getSharedMaterial(){return this.material;}
   setSharedMaterial(m){this.material=m;}
  }
  const cc={_decorator:{
    ccclass:()=>x=>x,property:()=>{},menu:()=>x=>x,
    executeInEditMode:()=>x=>x,requireComponent:()=>x=>x,
   },Component,MeshRenderer,Mesh,Material,Vec3,Mat4,
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
     const frames=Array.from({length:steps+1},(_,i)=>({
      t:i/steps,
      position:{x:0,y:0,z:10*i/steps},
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
   const geomBefore=JSON.stringify(first.data);
   renderer.rebuild();
   assert.deepEqual(renderer.getGraphMetrics(),{computed:0,reused:3,nodes:3},
    'Stable graph and revision reuses all Core nodes');
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
   assert(out.mesh.data.positions.some((v,i)=>i%3===1&&v===1));
   const updated=out.mesh;
   revision++;
   renderer.rebuild();
   assert.deepEqual(renderer.getGraphMetrics(),{computed:4,reused:0,nodes:4},
    'Spline source revision invalidates the whole DAG');
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
   console.log('GEOMETRY GRAPH RENDERER V2 PASS: atomic generated Mesh replacement, frame cache, source immutability, live updates, Inspector and ownership.');
  }finally{
   Module._load=original;globalThis.Editor=previousEditor;
  }
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
run().catch(err=>{console.error(err);process.exitCode=1;});
