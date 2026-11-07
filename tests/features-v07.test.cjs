'use strict';
/** Regression tests for the v0.7.0 mesh reader and per-knot 2D gizmos.
 * These run against mocked Cocos and DO NOT substitute a live Cocos Editor test. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-v07-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',dir]);
 const {decodeHalfFloat,readPositionTriples,readUVPairs,resolveAttributeFormatName,findStoredAttributeFormat}=require(path.join(dir,'Core','SplineMeshRead.js'));
 assert.equal(decodeHalfFloat(0x3c00),1);
 assert.equal(decodeHalfFloat(0xbc00),-1);
 assert.equal(decodeHalfFloat(0x3800),.5);
 assert.equal(readPositionTriples(new Uint16Array([0x3c00,0,0,0,0x3800,0]),'RGB16F')[4],.5);
 assert.deepEqual(readPositionTriples(new Int16Array([-2,3,4,5,-6,7]),'RGB16I'),[-2,3,4,5,-6,7]);
 assert.deepEqual(readPositionTriples(new Uint16Array([1,65535,8]),'RGB16UI'),[1,65535,8]);
 assert.deepEqual(readPositionTriples(new Float32Array([1,2,3]),'RGB32F'),[1,2,3]);
 assert.deepEqual(readPositionTriples(new Int32Array([-100000,2,3]),'RGB32I'),[-100000,2,3]);
 // CRITICAL v0.7.2 regression: real Cocos 3.8.8 returns FormatInfo,
 // NOT the numeric gfx.Format enum. The old comparisons rejected every mesh.
 const enumTable={RGB32F:1,RGB16F:2,RGB16I:3,RGB16UI:4,RG32F:5,RG16F:6,RG16I:7,RG16UI:8};
 assert.equal(resolveAttributeFormatName({name:'RGB32F',size:12,count:3},enumTable),'RGB32F');
 assert.equal(resolveAttributeFormatName({name:'RGB16F',size:6,count:3},enumTable),'RGB16F');
 assert.equal(resolveAttributeFormatName(1,enumTable),'RGB32F');
 assert.equal(resolveAttributeFormatName(null,enumTable,2),'RGB16F');
 assert.equal(resolveAttributeFormatName(null,enumTable),'UNKNOWN');
 assert.equal(findStoredAttributeFormat({struct:{primitives:[{vertexBundelIndices:[2,0]}],vertexBundles:[{attributes:[{name:'POSITION',format:3}]},{attributes:[]},{attributes:[{name:'UV0',format:7}]}]}},0,'POSITION'),3);

 assert.deepEqual(readUVPairs(new Uint16Array([0,0x3c00]),'RG16F'),[0,1]);
 assert.deepEqual(readUVPairs(new Uint16Array([128,255]),'RG16UI'),[128,255]);
 assert.throws(()=>readPositionTriples(new Uint16Array([1,2,3]),'UNSUPPORTED'),/POSITION format/);
 assert.throws(()=>readPositionTriples(new Uint16Array([1,2]),'RGB16UI'),/length/);
 assert.throws(()=>readUVPairs(new Uint16Array([0x7c00,0]),'RG16F'),/invalid numeric/);

 class Vec3{
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  clone(){return new Vec3(this.x,this.y,this.z);}
  set(x,y,z){if(typeof x==='object'){this.x=x.x;this.y=x.y;this.z=x.z;}else{this.x=x;this.y=y;this.z=z;}return this;}
  length(){return Math.hypot(this.x,this.y,this.z);}
  lengthSqr(){return this.x*this.x+this.y*this.y+this.z*this.z;}
  static transformQuat(o,a){return o.set(a);}
  static transformMat4(o,a){return o.set(a);}
  static multiplyScalar(o,a,s){return o.set(a.x*s,a.y*s,a.z*s);}
  static add(o,a,b){return o.set(a.x+b.x,a.y+b.y,a.z+b.z);}
  static subtract(o,a,b){return o.set(a.x-b.x,a.y-b.y,a.z-b.z);}
  static dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z;}
  static cross(o,a,b){return o.set(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);}
  static normalize(o,a){const n=a.length();return o.set(a.x/(n||1),a.y/(n||1),a.z/(n||1));}
 }
 Vec3.UP=new Vec3(0,1,0);
 class Quat{constructor(){this.w=1;}clone(){return new Quat();}static slerp(o){return o;}static fromAxes(o){return o;}}
 class Color{constructor(r,g,b,a){Object.assign(this,{r,g,b,a});}}
 class Node{constructor(id){this.uuid=id;this.name=id;this.isValid=true;this.children=[];this.parent=null;this.position=new Vec3();this.rotation=new Quat();this.worldMatrix={};this.components=[];}
  getComponent(type){return this.components.find(c=>typeof type==='string'?c.constructor.__cocosName===type:c instanceof type)||null;}}
 class Component{constructor(){this.enabled=true;}getComponent(type){return this.node.getComponent(type);}}
 class Mat4{constructor(){Object.assign(this,{m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,m08:0,m09:0,m10:1,m12:0,m13:0,m14:0});}static invert(out,m){return out;}}
 class Material{constructor(){this.uuid='fallback';}initialize(){}destroy(){}}
 class MeshRenderer extends Component{constructor(){super();this.mesh=null;this.materials=[];}getSharedMaterial(i){return this.materials[i]||null;}setSharedMaterial(material,i){this.materials[i]=material;}setMaterial(material,i){this.setSharedMaterial(material,i);}}
 const gfx={AttributeName:{ATTR_POSITION:'POSITION',ATTR_TEX_COORD:'UV0'},Format:{RGB32F:1,RGB16F:2,RGB16I:3,RGB16UI:4,RG32F:5,RG16F:6,RG16I:7,RG16UI:8,RGB32I:9,RGB32UI:10}};
 let generated=[];
 class Mesh {constructor(positions,format,uvs,returnMode='info'){this.uuid='source';this.allowDataAccess=true;this.data=new Uint8Array([1]);this.struct={primitives:[{vertexBundelIndices:[1,0]}],vertexBundles:[{attributes:[{name:'POSITION',format}]},{attributes:[{name:'UV0',format:gfx.Format.RG16UI}]}]};this.pos=positions;this.format=format;this.uvs=uvs;this.returnMode=returnMode;}
   readAttribute(i,name){return name==='POSITION'?this.pos:this.uvs;}
   readAttributeFormat(i,name){const value=name==='POSITION'?this.format:gfx.Format.RG16UI;
     if(this.returnMode==='null')return null;
     if(this.returnMode==='number')return value;
     const formatName=Object.keys(gfx.Format).find(k=>gfx.Format[k]===value);
     return {name:formatName,size:value===gfx.Format.RGB32F?12:6,count:name==='POSITION'?3:2};}

   readIndices(){return new Uint16Array([0,2,1,1,2,3]);}}

 const noop=()=>{};const decorator=(...args)=>args.length>1?undefined:noop;
 const cc={_decorator:{ccclass:name=>cls=>{cls.__cocosName=name;return cls;},property:decorator,menu:()=>cls=>cls,executeInEditMode:()=>cls=>cls,requireComponent:()=>cls=>cls},Enum:x=>x,Node,Component,Vec3,Quat,Color,Mat4,Mesh,MeshRenderer,Material,gfx,utils:{createMesh:output=>{const mesh={output,destroy(){}};generated.push(mesh);return mesh;}}};
 const orig=Module._load;
 Module._load=function(name,parent,isMain){if(name==='cc')return cc;if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};return orig.call(this,name,parent,isMain);};
 try{
  const {SplineContainer,SplineDimension}=require(path.join(dir,'Core','SplineContainer.js'));
  const {SplineKnot,TangentMode}=require(path.join(dir,'Core','SplineKnot.js'));
  const rootNode=new Node('spline');const spline=new SplineContainer();spline.node=rootNode;rootNode.components.push(spline);
  const makeKnot=(id,x)=>{const n=new Node(id);n.parent=rootNode;n.position.x=x;rootNode.children.push(n);
    const k=new SplineKnot();k.node=n;k.mode=TangentMode.Broken;n.components.push(k);return k;};
  const a=makeKnot('knot-a',0),b=makeKnot('knot-b',10);
  a.tangentInHandle={position:new Vec3(-2,3,0),isValid:true};
  a.tangentOutHandle={position:new Vec3(2,3,0),isValid:true};
  a.tangentsInKnotSpace=true;
  spline.dimension=SplineDimension.XY2D;
  spline.showGizmos=false;spline.showGizmosAlways=false;spline.showTangentGizmos=false;
  const g2=[],g3=[];
  globalThis.Gizmos2D={beginColor(...v){g2.push(['color',...v]);},drawLine(...v){g2.push(['line',...v]);},drawCircle(...v){g2.push(['circle',...v]);}};
  globalThis.Gizmos3D={beginColor(...v){g3.push(['color',...v]);},drawLine(...v){g3.push(['line',...v]);},drawSphere(...v){g3.push(['sphere',...v]);},setDepTest(...v){g3.push(['depth',...v]);}};
  try {
   // Global tangents OFF must not hide tangents of selected knot (XY2D).
   a.onDrawGizmosSelected();
   assert(g2.filter(c=>c[0]==='circle').length>=2,'2D selected tangent point circles');
   assert(g2.filter(c=>c[0]==='line').length>=2,'2D selected tangent arms');
   assert(g3.some(c=>c[0]==='sphere'&&c[3]===5),'3D fallback visible in XY2D');
   assert(g3.some(c=>c[0]==='depth'&&c[2]===false),'2D overlay disables depth test');
   g2.length=0;g3.length=0;
   // When editing on, knot tangents are always on without touching the container fields.
   a.editTangentHandles=true;
   spline.onDrawGizmos();a.onDrawGizmos();
   assert(g2.filter(c=>c[0]==='line').length>2,'curve + selected tangent arms always visible');
   assert.equal(spline.showGizmosAlways,false,'per-knot override must not change container flag');
   assert.equal(spline.showTangentGizmos,false,'global tangent flag must not be changed');
   // Off removes the always-on visualization; selecting knot still draws it.
   g2.length=0;g3.length=0;a.editTangentHandles=false;
   spline.onDrawGizmos();a.onDrawGizmos();assert.equal(g2.length,0);
   a.onDrawGizmosSelected();assert(g2.filter(c=>c[0]==='line').length>=2);
   // A 3D-only environment still shows 2D tangents with a useful point radius.
   delete globalThis.Gizmos2D;g3.length=0;a.onDrawGizmosSelected();
   assert(g3.some(c=>c[0]==='sphere'&&c[3]===5),'fallback when Gizmos2D unavailable');
  }finally{delete globalThis.Gizmos2D;delete globalThis.Gizmos3D;}

  // Full SplineMeshDeform.rebuild() integration under Cocos mocks, not just
  // the pure attribute reader: integer POSITION must create an output mesh.
  const {SplineMeshDeform}=require(path.join(dir,'Components','SplineMeshDeform.js'));
  const source={count:2,length:10,node:{worldMatrix:new Mat4(),worldRotation:new Quat()},
    getRevision:()=>'test-curve',evaluateWorldPosition:t=>new Vec3(t*10,0,0),
    evaluateTangent:()=>new Vec3(1,0,0),evaluateUp:()=>new Vec3(0,1,0)};
  const meshNode=new Node('mesh-deformer');meshNode.worldMatrix=new Mat4();
  const renderer=new MeshRenderer();renderer.node=meshNode;meshNode.components.push(renderer);
  const component=new SplineMeshDeform();component.node=meshNode;component.spline=source;
  meshNode.components.push(component);
  const formatPositions=[
    ['RGB32F',new Float32Array([-1,0,0,1,0,0,-1,0,2,1,0,2])],
    ['RGB16I',new Int16Array([-1,0,0,1,0,0,-1,0,2,1,0,2])],
    ['RGB16UI',new Uint16Array([0,0,0,2,0,0,0,0,2,2,0,2])],
    ['RGB16F',new Uint16Array([0xbc00,0,0,0x3c00,0,0,0xbc00,0,0x4000,0x3c00,0,0x4000])],
    ['RGB32I',new Int32Array([-1,0,0,1,0,0,-1,0,2,1,0,2])],
    ['RGB32UI',new Uint32Array([0,0,0,2,0,0,0,0,2,2,0,2])]
  ];
  const warnings=[];const warn=console.warn;console.warn=(...v)=>warnings.push(v);
  try{
   for(const [name,positions] of formatPositions){
    component.sourceMesh=new Mesh(positions,gfx.Format[name],new Uint16Array([0,0,1,0,0,1,1,1]),'info');
    generated=[];component.rebuild();
    assert(renderer.mesh,`MeshDeform should generate renderer mesh for ${name}`);
    assert.equal(generated.length,1,`MeshDeform should rebuild ${name}`);
    assert.equal(renderer.mesh.output.indices.length,6);
    assert(renderer.mesh.output.positions.every(Number.isFinite));
   }
   // Legacy engine/plugin numeric output remains supported.
   component.sourceMesh=new Mesh(formatPositions[0][1],gfx.Format.RGB32F,new Uint16Array([0,0,1,0,0,1,1,1]),'number');
   component.rebuild();assert(renderer.mesh,'Legacy numeric readAttributeFormat is supported');
   // Fall back to actual vertex bundle, not primitive index: in this test
   // POSITION belongs to vertex bundle 0 but primitive is 0 and lists [1,0].
   component.sourceMesh=new Mesh(formatPositions[2][1],gfx.Format.RGB16UI,new Uint16Array([0,0,1,0,0,1,1,1]),'null');
   component.rebuild();assert(renderer.mesh,'struct attribute fallback is supported');
  }finally{console.warn=warn;component.onDestroy();}
  assert.deepEqual(warnings,[],'No attribute-format warnings for supported meshes');
 }finally{Module._load=orig;}
 console.log('FEATURES v0.7.2 PASS: Cocos 3.8.8 FormatInfo, numeric+bundle fallback, packed POSITION, UV, tangent gizmos.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
