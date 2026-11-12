'use strict';
/** v2 Cocos bridge: TypeScript road + glTF export plus Play-mode source safety. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'cocos-v2-bridge-'));
try{
 const inputs=['core/SplineCurves','core/SplineCache','core/SplineFrames','geometry/MeshData',
  'geometry/MeshProcessing','geometry/MeshBuildPlan','geometry/RoadCorners','geometry/RoadOverlapClip','geometry/RoadContinuous','geometry/RoadFillet','geometry/SourceMeshRead','geometry/SourceMeshDeform','geometry/RoadMarkings','geometry/RoadStrip','geometry/ProfileSweep','geometry/GltfExporter']
    .map(n=>path.join(root,'src-v2',n+'.ts'));
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict','--outDir',temp,...inputs],{stdio:'pipe'});
 const curves=require(path.join(temp,'core/SplineCurves.js'));
 const cache=require(path.join(temp,'core/SplineCache.js'));
 const {buildRoadStripV2}=require(path.join(temp,'geometry/RoadStrip.js'));
 const {exportMeshGltfV2}=require(path.join(temp,'geometry/GltfExporter.js'));
 const {buildMeshV2}=require(path.join(temp,'geometry/MeshData.js'));
 const knots=[{position:{x:0,y:0,z:0}},{position:{x:0,y:0,z:8}},{position:{x:8,y:0,z:8}}];
 const curve=cache.buildSplineCacheV2({knots,closed:false,type:'catmull-rom-centripetal'});
 const mesh=buildRoadStripV2(curve,{width:4,step:.33,uvMetersPerRepeat:3});
 assert(mesh.vertexCount>20);assert.equal(mesh.submeshes.length,1);assert(mesh.uv2?.length===mesh.vertexCount*2);
 const data=exportMeshGltfV2(mesh);
 const gltf=JSON.parse(data.json);
 assert.equal(gltf.asset.version,'2.0');
 assert.equal(gltf.meshes[0].primitives.length,1);
 assert.equal(gltf.meshes[0].primitives[0].mode,4);
 const attrs=gltf.meshes[0].primitives[0].attributes;
 assert(Number.isInteger(attrs.TEXCOORD_0));assert(Number.isInteger(attrs.TEXCOORD_1));
 assert(Number.isInteger(attrs.TANGENT));assert(Number.isInteger(attrs.NORMAL));
 const binary=Buffer.from(gltf.buffers[0].uri.split(',')[1],'base64');
 assert.equal(binary.byteLength,gltf.buffers[0].byteLength);
 assert(gltf.bufferViews.every(v=>v.byteOffset%4===0 && v.byteOffset+v.byteLength<=binary.byteLength));
 assert(gltf.accessors.every(a=>Number.isInteger(a.count)&&a.count>0));
 assert.equal(gltf.accessors[attrs.POSITION].count,mesh.vertexCount);
 assert.equal(gltf.accessors[gltf.meshes[0].primitives[0].indices].componentType,5123);
 const at=gltf.accessors[attrs.TEXCOORD_1],view=gltf.bufferViews[at.bufferView];
 assert(Math.abs(binary.readFloatLE(view.byteOffset)-0)<1e-6);
 const uv2Values=Array.from({length:at.count*2},(_,i)=>binary.readFloatLE(view.byteOffset+4*i));
 assert(uv2Values.some((v,i)=>i%2===0&&Math.abs(v-1)<1e-6),'UV2 across coordinate lost');
 assert(uv2Values.some((v,i)=>i%2===1&&v>0),'UV2 distance coordinate lost');
 assert.equal(gltf.extras.cocosSplinesV2.fingerprint,data.fingerprint);
 // Multi-material geometry must remain separate glTF primitives.
 const multi=buildMeshV2({positions:[
   {x:0,y:0,z:0},{x:1,y:0,z:0},{x:1,y:0,z:1},{x:0,y:0,z:1}
 ],uv0:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],
 uv2:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],
 submeshes:[{materialSlot:5,indices:[0,2,1]},{materialSlot:17,indices:[0,3,2]}]});
 const gltf2=JSON.parse(exportMeshGltfV2(multi).json);
 assert.equal(gltf2.meshes[0].primitives.length,2);
 assert.deepEqual(gltf2.meshes[0].primitives.map(p=>p.material),[0,1]);
 assert.deepEqual(gltf2.extras.cocosSplinesV2.materialSlots,[5,17]);
 assert(gltf2.meshes[0].primitives.every(p=>p.attributes.TEXCOORD_1!==undefined));
 // Mirror source files exist as Cocos asset-db TypeScript scripts.
 for(const name of inputs.map(p=>path.relative(path.join(root,'src-v2'),p))){
   const asset=path.join(root,'assets/splines-v2',name);
   assert.equal(fs.readFileSync(asset,'utf8'),fs.readFileSync(path.join(root,'src-v2',name),'utf8'),name+' bridge mirror drift');
   assert(fs.existsSync(asset+'.meta'),name+' missing import metadata');
 }
 const component=fs.readFileSync(path.join(root,'assets/splines-v2/Components/SplineRoadV2.ts'),'utf8');
 assert(component.includes('this.meshMode===SplineV2MeshMode.Dynamic'),'No Dynamic gate');
 assert(component.includes('else this.showSavedMesh();'),'Manual/Baked should restore saved Mesh');
 assert(component.includes('if(!EDITOR_NOT_IN_PREVIEW)'), 'No Editor bake guard');
 const inspector=require(path.join(root,'src/contributions/inspector/RoadV2.js'));
 assert.match(inspector.template,/Rebuild preview/i);assert.match(inspector.template,/Bake glTF asset/i);
 assert.match(inspector.template,/Bind Imported Mesh/i);
 const deformInspector=require(path.join(root,'src/contributions/inspector/MeshDeformV2.js'));
 assert.match(deformInspector.template,/spl-v2-sourceMesh/);
 assert.match(deformInspector.template,/spl-v2-repeatCount/);
 assert(fs.existsSync(path.join(root,'assets/splines-v2/Components/SplineMeshDeformV2.ts.meta')));
 console.log('V2 COCOS BRIDGE PASS: road generator, glTF embedded UV2/multi-material, runtime gate, TS mirror and Inspector');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
