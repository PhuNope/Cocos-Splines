'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
  path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'splines-graph-submesh-builder-'));
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json',
  '--noEmit','false','--outDir',dir],{stdio:'pipe'});
 let allocated=0,broken=false;
 class Vec3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}}
 class Attribute{constructor(name,format){Object.assign(this,{name,format});}}
 class Mesh{
  constructor(){allocated++;this.destroyed=false;this.struct=null;this.data=null;}
  reset(info){if(broken)throw Error('Injected multi-submesh reset failure');
   this.struct=info.struct;this.data=info.data;}
  destroy(){this.destroyed=true;}
 }
 const gfx={Attribute,AttributeName:{
  ATTR_POSITION:'a_position',ATTR_NORMAL:'a_normal',ATTR_TEX_COORD:'a_texCoord',
 },Format:{RGB32F:1,RG32F:2},PrimitiveMode:{TRIANGLE_LIST:4}};
 const original=Module._load;
 Module._load=function(name,parent,isMain){
  if(name==='cc')return {Mesh,Vec3,gfx};
  return original.call(this,name,parent,isMain);
 };
 try{
  const {createGraphMultiOutputMesh,checkGraphMultiMesh,
   graphMultiMeshGizmoGeometry}=
    require(dir+'/Core/SplineGeometryGraphMultiMesh.js');
  const {graphOutputMeshSourceSlots}=require(
    dir+'/Core/SplineGeometryGraphMultiMesh.js');
  const importPlan={nodes:[
   {id:'spline',type:'spline'},
   {id:'assetA',type:'meshAsset',slot:0},
   {id:'assetB',type:'meshAsset',slot:1},
   {id:'path',type:'offset',input:'spline'},
   {id:'deformA',type:'meshDeform',input:'path',meshInput:'assetA'},
   {id:'deformB',type:'meshDeform',input:'path',meshInput:'assetB'},
   {id:'ribbon',type:'ribbon',input:'path'},
   {id:'outputA',type:'output',input:'deformA'},
   {id:'outputB',type:'output',input:'deformB'},
   {id:'outputRibbon',type:'output',input:'ribbon'},
  ],output:'outputA',version:2,outputs:['outputA','outputB','outputRibbon']};
  assert.deepEqual(graphOutputMeshSourceSlots(importPlan,
    ['outputB','outputRibbon','outputA']),[1,null,0],
   'Imported Material sources follow graph dependencies, not material order');
  assert.throws(()=>graphOutputMeshSourceSlots(importPlan,['missing']),/Output Node/);
  const mergedPlan={...importPlan,nodes:[...importPlan.nodes,
   {id:'merged',type:'mergeMesh',input:'deformA',meshInputB:'deformB'},
   {id:'outputMerged',type:'output',input:'merged'}]};
  assert.deepEqual(graphOutputMeshSourceSlots(mergedPlan,['outputMerged','outputA']),[null,0],
   'Merged geometry uses manual output material even when multiple imported assets contribute');
  const road={positions:[0,0,0,2,0,0,0,0,2,2,0,2],
   normals:[0,1,0,0,1,0,0,1,0,0,1,0],
   uvs:[0,0,1,0,0,1,1,1],indices:[0,2,1,1,2,3],
   bands:1,ringCount:2};
  const pipe={positions:[-3,0,-2,0,4,0,3,0,2],
   normals:[0,0,1,0,0,1,0,0,1],
   uvs:[.1,.2,.5,.6,.9,1],indices:[0,1,2],
   bands:3,ringCount:1};
  const output=[{outputId:'outputPipe',geometry:pipe},
   {outputId:'outputRoad',geometry:road}];
  const previous=JSON.stringify(output),count=allocated;
  assert.deepEqual(checkGraphMultiMesh(output),{vertexCount:7,indexCount:9});
  const generated=createGraphMultiOutputMesh(output);
  assert.equal(allocated,count+1,'Exactly one transient Mesh owns two primitives');
  assert.equal(generated.mesh.struct.primitives.length,2);
  assert.equal(generated.mesh.struct.vertexBundles.length,2);
  assert.deepEqual(generated.outputIds,['outputPipe','outputRoad']);
  assert.equal(generated.vertexCount,7);
  assert.equal(generated.indexCount,9);
  assert.equal(generated.mesh.struct.minPosition.x,-3);
  assert.equal(generated.mesh.struct.maxPosition.y,4);
  for(let i=0;i<2;i++){
   const primitive=generated.mesh.struct.primitives[i];
   assert.deepEqual(primitive.vertexBundelIndices,[i]);
   assert.equal(primitive.primitiveMode,4);
   const bundle=generated.mesh.struct.vertexBundles[i];
   assert.equal(bundle.view.stride,32);
   assert.equal(bundle.attributes.length,3);
   assert.equal(primitive.indexView.stride,2);
   assert.equal(primitive.indexView.count,output[i].geometry.indices.length);
   assert.equal(bundle.view.count,output[i].geometry.positions.length/3);
   assert(primitive.indexView.offset%4===0,'Index view is 4-byte aligned');
  }
  const view=new DataView(generated.mesh.data.buffer);
  const bundle0=generated.mesh.struct.vertexBundles[0].view.offset;
  const bundle1=generated.mesh.struct.vertexBundles[1].view.offset;
  const primitive0=generated.mesh.struct.primitives[0].indexView.offset;
  const primitive1=generated.mesh.struct.primitives[1].indexView.offset;
  assert.equal(view.getFloat32(bundle0,true),-3);
  assert.equal(view.getFloat32(bundle0+4,true),0);
  assert.equal(view.getFloat32(bundle0+8,true),-2);
  assert.equal(view.getFloat32(bundle0+12,true),0);
  assert.equal(view.getFloat32(bundle0+20,true),1);
  assert(Math.abs(view.getFloat32(bundle0+24,true)-.1)<1e-6);
  assert.equal(view.getUint16(primitive0,true),0);
  assert.equal(view.getUint16(primitive0+2,true),1);
  assert.equal(view.getFloat32(bundle1+12,true),0);
  assert.equal(view.getFloat32(bundle1+16,true),1);
  assert.equal(view.getUint16(primitive1+2,true),2);
  assert.equal(view.getUint16(primitive1+10,true),3);
  assert.equal(JSON.stringify(output),previous,'Packing does not mutate any output geometry');
  const gizmo=graphMultiMeshGizmoGeometry(output);
  assert.equal(gizmo.positions.length/3,7);
  assert.deepEqual(gizmo.indices,[0,1,2,3,5,4,4,5,6]);
  // Validate errors happen BEFORE Mesh constructor or renderer assignment.
  for(const bad of [
   [],[output[0]],new Array(5).fill(output[0]),
   [output[0],output[0]],
   [{...output[0],outputId:'<unsafe>'},output[1]],
   [{...output[0],geometry:{...pipe,positions:[NaN,0,0]}},output[1]],
   [{...output[0],geometry:{...pipe,indices:[0,1,7]}},output[1]],
   [{...output[0],geometry:{...pipe,uvs:[0,0]}},output[1]],
   [{...output[0],geometry:{...pipe,normals:[]}},output[1]],
  ]){
   assert.throws(()=>createGraphMultiOutputMesh(bad));
  }
  assert.equal(allocated,count+1,'Invalid branches allocate no Mesh');
  broken=true;
  assert.throws(()=>createGraphMultiOutputMesh(output),/Injected/);
  assert.equal(allocated,count+2);
  assert.equal(JSON.stringify(output),previous);
  broken=false;
  assert(require(root+'/package.json').scripts.test.includes(
   'geometry-graph-multi-material-builder-v2.test.cjs'));
  console.log('MULTI-MATERIAL GRAPH BUILDER PASS: two indexed primitives, vertex packing, bounds, wireframe, atomic allocation guards.');
 }finally{Module._load=original;}
}finally{fs.rmSync(dir,{recursive:true,force:true});}
