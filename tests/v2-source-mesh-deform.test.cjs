'use strict';
/** Imported source mesh deformation: preserve authored channels and submesh slots. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'v2-source-mesh-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs','--rootDir',
  path.join(root,'src-v2'),'--outDir',temp,
  path.join(root,'src-v2/geometry/SourceMeshRead.ts'),
  path.join(root,'src-v2/geometry/SourceMeshDeform.ts'),
  path.join(root,'src-v2/geometry/GltfExporter.ts')],{stdio:'pipe'});
 const {buildMeshV2}=require(path.join(temp,'geometry/MeshData.js'));
 const {readSourceMeshV2}=require(path.join(temp,'geometry/SourceMeshRead.js'));
 const {deformSourceMeshV2}=require(path.join(temp,'geometry/SourceMeshDeform.js'));
 const {buildSplineCacheV2}=require(path.join(temp,'core/SplineCache.js'));
 const {exportMeshGltfV2}=require(path.join(temp,'geometry/GltfExporter.js'));
 const knot=(x,y,z)=>({position:{x,y,z}});
 const straight=buildSplineCacheV2({type:'linear',closed:false,knots:[knot(0,0,0),knot(0,0,12)]});
 const pts=[],uv0=[],uv2=[],normals=[];
 for(const z of [0,5,10])for(const x of [-1,0,1]){
  pts.push({x,y:0,z});uv0.push({x:(x+1)/2,y:z/10});
  uv2.push({x:(x+1)/2,y:z/10});normals.push({x:0,y:1,z:0});
 }
 const left=[0,3,1,1,3,4,3,6,4,4,6,7];
 const right=[1,4,2,2,4,5,4,7,5,5,7,8];
 const source=buildMeshV2({positions:pts,uv0,uv2,normals,
  submeshes:[{materialSlot:0,indices:left},{materialSlot:1,indices:right}]});
 const snapshot=[...source.positions,...source.uv0,...source.uv2];
 const single=deformSourceMeshV2(straight,source,{maxFrameStep:.25});
 assert.equal(single.mesh.vertexCount,source.vertexCount);
 assert.equal(single.mesh.triangleCount,source.triangleCount);
 assert.deepEqual(Array.from(single.mesh.uv0),Array.from(source.uv0));
 assert.deepEqual(Array.from(single.mesh.uv2),Array.from(source.uv2));
 assert.deepEqual(single.mesh.submeshes.map(s=>s.materialSlot),[0,1]);
 for(let i=0;i<source.vertexCount;i++){
  const point=3*i;
  assert(Math.abs(single.mesh.positions[point]-source.positions[point])<1e-5);
  assert(Math.abs(single.mesh.positions[point+2]-source.positions[point+2]*1.2)<1e-5);
 }
 const triple=deformSourceMeshV2(straight,source,{repeatCount:3,uvTileMode:'advance',
  longitudinalUVAxis:'v'});
 assert.equal(triple.mesh.vertexCount,source.vertexCount*3);
 assert.equal(triple.mesh.triangleCount,source.triangleCount*3);
 assert.deepEqual(triple.mesh.submeshes.map(s=>s.materialSlot),[0,1]);
 assert.equal(triple.report.copies,3);
 for(let tile=0;tile<3;tile++)for(let i=0;i<source.vertexCount;i++){
  const n=tile*source.vertexCount+i;
  assert(Math.abs(triple.mesh.positions[3*n+2]-(tile+source.positions[3*i+2]/10)*4)<1e-5);
  assert(Math.abs(triple.mesh.uv0[2*n+1]-(source.uv0[2*i+1]+tile))<1e-6);
  assert.equal(triple.mesh.uv2[2*n],source.uv2[2*i]);
  assert.equal(triple.mesh.uv2[2*n+1],source.uv2[2*i+1]);
 }
 const preserved=deformSourceMeshV2(straight,source,{repeatCount:3,uvTileMode:'preserve'}).mesh;
 assert.equal(preserved.uv0[2*source.vertexCount+1],source.uv0[1]);
 assert.deepEqual([...source.positions,...source.uv0,...source.uv2],snapshot,'Source must never be mutated');
 const bend=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:false,knots:[
  knot(-1.701,0,-7.206),knot(-3.869,0,3.72),knot(5.82,0,4.347)
 ]});
 const curved=deformSourceMeshV2(bend,source,{maxFrameStep:.2,maxAngleDegrees:6,maxChordError:.03});
 assert.equal(curved.mesh.vertexCount,source.vertexCount);
 assert.deepEqual(Array.from(curved.mesh.uv0),Array.from(source.uv0));
 assert.deepEqual(Array.from(curved.mesh.uv2),Array.from(source.uv2));
 assert(curved.mesh.positions.every(Number.isFinite));
 assert(curved.mesh.normals.every(Number.isFinite));
 assert(curved.mesh.tangents.every(Number.isFinite));
 assert(curved.report.sourceSectionRows===3,'Source mesh vertex distribution is tracked for warning');
 const baked=JSON.parse(exportMeshGltfV2(curved.mesh).json);
 assert.deepEqual(baked.extras.cocosSplinesV2.materialSlots,[0,1]);
 assert(baked.meshes[0].primitives.every(p=>p.attributes.TEXCOORD_0!==undefined&&p.attributes.TEXCOORD_1!==undefined));
 // Cocos primitive-local reads and authored material splits.
 const attributes={
  a_position:new Float32Array([0,0,0,1,0,0,0,0,1]),
  a_texCoord:new Float32Array([0,0,1,0,0,1]),
  a_texCoord1:new Float32Array([0,0,1,0,0,1]),
  a_normal:new Float32Array([0,1,0,0,1,0,0,1,0])
 };
 const readable={subMeshCount:2,readAttribute(i,name){return attributes[name]??null;},
  readIndices(i){return new Uint16Array([0,2,1]);}};
 const extracted=readSourceMeshV2(readable);
 assert.equal(extracted.vertexCount,6);
 assert.equal(extracted.submeshes[1].indices[0],3);
 assert.deepEqual(extracted.submeshes.map(s=>s.materialSlot),[0,1]);
 assert.equal(extracted.uv2.length,12);
 assert.throws(()=>readSourceMeshV2({...readable,readAttribute(i,n){
  return n==='a_texCoord'?null:attributes[n]??null;
 }}),/POSITION and TEXCOORD_0/);
 assert.throws(()=>readSourceMeshV2({...readable,readAttribute(i,n){
  return i===1&&n==='a_texCoord1'?null:attributes[n]??null;
 }}),/UV2 must exist on every primitive/);
 assert.throws(()=>readSourceMeshV2({...readable,readIndices(){return [0,2,9];}}),/invalid triangle indices/);
 const flat=buildMeshV2({positions:pts.map(p=>({...p,z:0})),uv0,uv2,normals,
  submeshes:[{materialSlot:0,indices:left}]});
 assert.throws(()=>deformSourceMeshV2(straight,flat),/zero length/);
 assert.throws(()=>deformSourceMeshV2(straight,source,{repeatCount:129}),/repeatCount/);
 assert.throws(()=>deformSourceMeshV2(straight,source,{longitudinalAxis:'wrong'}),/axis/);
 const xSource=buildMeshV2({positions:pts.map(p=>({x:p.z,y:p.y,z:-p.x})),uv0,uv2,normals,
  submeshes:[{materialSlot:0,indices:left}]});
 const xOutput=deformSourceMeshV2(straight,xSource,{longitudinalAxis:'x'}).mesh;
 assert(Math.abs(xOutput.positions[0]-pts[0].x)<1e-5,'X-axis source mapping must not mirror source');
 console.log('SOURCE MESH DEFORM PASS: UV0/UV2 unchanged, Cocos primitive read, multi-material, repeats, X/Z orientation, bend, glTF and negative cases.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
