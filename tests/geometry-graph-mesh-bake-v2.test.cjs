'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {encodeBakedGltf,buildBakedModel,writeNewBakedMesh}=require('../dist/SplineGeometryMeshBake');
const geometry={positions:[0,0,0,1,0,0,0,1,0,1,1,0],normals:Array(4).fill([0,0,1]).flat(),uvs:[0,0,1,0,0,1,1,1],indices:[0,1,2,1,3,2],triangleMaterialSlots:[2,0]};
const snapshot={outputs:[{outputId:'road',geometry}]};
const before=JSON.stringify(snapshot),content=encodeBakedGltf(snapshot),m=JSON.parse(content);
assert.equal(JSON.stringify(snapshot),before);
assert.equal(m.asset.version,'2.0');assert.equal(m.meshes[0].primitives.length,2);
assert.deepEqual(m.materials.map(x=>x.name),['road_group_0','road_group_2']);
const buffer=Buffer.from(m.buffers[0].uri.split(',')[1],'base64');
assert.equal(buffer.length,m.buffers[0].byteLength);
const read=id=>{const a=m.accessors[id],v=m.bufferViews[a.bufferView],n=a.count*({VEC3:3,VEC2:2,SCALAR:1}[a.type]);return Array.from({length:n},(_,i)=>a.componentType===5123?buffer.readUInt16LE(v.byteOffset+i*2):buffer.readFloatLE(v.byteOffset+i*4));};
const p=m.meshes[0].primitives;
assert.deepEqual(p[0].attributes,p[1].attributes);
assert.deepEqual(read(p[0].attributes.POSITION),geometry.positions);
assert.deepEqual(read(p[0].attributes.NORMAL),geometry.normals);
assert.deepEqual(read(p[0].attributes.TEXCOORD_0),[0,1,1,1,0,0,1,0]);
assert.deepEqual(read(p[0].indices),[1,3,2]);assert.deepEqual(read(p[1].indices),[0,1,2]);
assert.deepEqual(m.accessors[p[0].attributes.POSITION].max,[1,1,0]);
for(const g of [{...geometry,indices:[0,1,99]},{...geometry,triangleMaterialSlots:[9,0]},{...geometry,normals:Array(12).fill(0)}])assert.throws(()=>encodeBakedGltf({outputs:[{outputId:'bad',geometry:g}]}));
assert.throws(()=>encodeBakedGltf({outputs:['a','b','c'].map(outputId=>({outputId,geometry}))}),/four material/i);
// Spatially separated, interleaved source triangles, shared vertices within
// each quad. Check exact triangle multiset, attribute tuples and materials.
const {partitionBakeGeometry}=require('../dist/SplineGeometryMeshChunk');
const grid={positions:[],normals:[],uvs:[],indices:[],triangleMaterialSlots:[]};
for(let i=0;i<300;i++){
 const x=i%2===0?i*.01:100+i*.01,base=grid.positions.length/3;
 grid.positions.push(x,0,0,x+.005,0,0,x,1,0,x+.005,1,0);
 grid.normals.push(...Array(4).fill([0,0,1]).flat());
 grid.uvs.push(i,0,i+.5,0,i,1,i+.5,1);
 grid.indices.push(base,base+1,base+2,base+1,base+3,base+2);
 grid.triangleMaterialSlots.push(i%2,2);
}
const gridBefore=JSON.stringify(grid),chunks=partitionBakeGeometry(grid,256);
assert.equal(chunks.length,3);
const triKeys=g=>Array.from({length:g.indices.length/3},(_,t)=>JSON.stringify([g.triangleMaterialSlots?.[t]??0,...g.indices.slice(t*3,t*3+3).map(i=>[...g.positions.slice(i*3,i*3+3),...g.normals.slice(i*3,i*3+3),...g.uvs.slice(i*2,i*2+2)])]));
assert.deepEqual(chunks.flatMap(triKeys).sort(),triKeys(grid).sort());
assert(chunks.every(c=>c.indices.length/3<=256&&c.positions.length/3<=768));
assert(chunks.some(c=>Math.max(...c.positions.filter((_,i)=>i%3===0))<10),'Spatial partition must isolate at least one cluster');
assert.deepEqual(partitionBakeGeometry(grid,256),chunks);
assert.equal(JSON.stringify(grid),gridBefore);
const chunkSnapshot={outputs:[{outputId:'road',geometry:grid}]};
const chunkText=encodeBakedGltf(chunkSnapshot,{chunkTriangles:256}),cm=JSON.parse(chunkText);
assert.equal(cm.meshes.length,3);assert.deepEqual(cm.nodes[0].children,[1,2,3]);
assert.equal(cm.nodes[0].mesh,undefined);
assert.deepEqual(cm.materials.map(m=>m.name),['road_group_0','road_group_1','road_group_2']);
assert.deepEqual(cm.nodes.slice(1).map(n=>n.mesh),[0,1,2]);
assert(cm.meshes.every(m=>m.primitives.reduce((n,p)=>n+cm.accessors[p.indices].count/3,0)<=256));
assert.equal(cm.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+cm.accessors[p.indices].count,0),grid.indices.length);
assert.equal(encodeBakedGltf(chunkSnapshot,{chunkTriangles:256}),chunkText);
assert.throws(()=>partitionBakeGeometry(grid,256,2),/chunk count/i);
assert.throws(()=>encodeBakedGltf(chunkSnapshot,{chunkTriangles:12}),/triangle budget/i);
assert.throws(()=>encodeBakedGltf({outputs:['a','b'].map(outputId=>({outputId,geometry:grid}))},{chunkTriangles:256}),/four material/i);
// Exact attribute welding only: same positions with distinct normals/UVs
// stay separate, unreferenced vertex drops, triangle order and groups survive.
const {optimizeBakeGeometry}=require('../dist/SplineGeometryMeshOptimize');
const dup={positions:[...geometry.positions,0,0,0,0,0,0,0,0,0,50,50,50],
 normals:[...geometry.normals,0,0,1,0,0,-1,0,0,1,0,0,1],
 uvs:[...geometry.uvs,0,0,0,0,1,0,0,0],
 indices:[0,1,2,4,1,2,5,1,2,6,1,2,0,0,1],triangleMaterialSlots:[0,0,1,2,3]};
const dupBefore=JSON.stringify(dup),compact=optimizeBakeGeometry(dup);
assert.equal(compact.positions.length/3,5);
assert.deepEqual(triKeys(compact),triKeys(dup));
assert.equal(JSON.stringify(dup),dupBefore);
const production=buildBakedModel({outputs:[{outputId:'mesh',geometry:dup}]},{optimize:true,format:'glb'});
assert.equal(production.report.removedVertices,3);
assert.equal(production.report.input.unreferencedVertices,2);
assert.equal(production.report.input.degenerateTriangles,1);
assert.equal(production.report.triangles,5);
assert.equal(production.report.vertexBytesSaved,96);
const glb=production.content;
assert.equal(glb.readUInt32LE(0),0x46546c67);assert.equal(glb.readUInt32LE(4),2);assert.equal(glb.readUInt32LE(8),glb.length);
const jsonLen=glb.readUInt32LE(12),binStart=20+jsonLen;
assert.equal(jsonLen%4,0);assert.equal(glb.readUInt32LE(16),0x4e4f534a);
const glbModel=JSON.parse(glb.subarray(20,binStart).toString('utf8'));
assert.equal(glbModel.buffers[0].uri,undefined);
assert.equal(glb.readUInt32LE(binStart+4),0x004e4942);
assert.equal(glb.readUInt32LE(binStart)%4,0);
assert.equal(glb.length,binStart+8+glb.readUInt32LE(binStart));
assert.equal(glbModel.extras.cocosSplinesBake.removedVertices,3);
const glbData=glb.subarray(binStart+8,binStart+8+glbModel.buffers[0].byteLength);
const asJson=buildBakedModel({outputs:[{outputId:'mesh',geometry:dup}]},{optimize:true,format:'gltf'});
assert.deepEqual(glbData,Buffer.from(JSON.parse(asJson.content).buffers[0].uri.split(',')[1],'base64'));
const optChunks=buildBakedModel(chunkSnapshot,{chunkTriangles:256,optimize:true,format:'glb'});
assert.equal(optChunks.report.meshCount,3);assert.equal(optChunks.report.triangles,600);
assert.equal(optChunks.report.materialCount,3);
assert.throws(()=>buildBakedModel(snapshot,{format:'obj'}),/options/i);
assert.throws(()=>buildBakedModel(snapshot,{optimize:1}),/options/i);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-bake-'));
try{
 const assets=path.join(temp,'assets');fs.mkdirSync(assets);
 const target=path.join(assets,'road.gltf');
 assert.equal(writeNewBakedMesh(target,assets,content).assetUrl,'db://assets/road.gltf');
 assert.equal(fs.readFileSync(target,'utf8'),content);
 assert.throws(()=>writeNewBakedMesh(target,assets,content));
 const binaryTarget=path.join(assets,'road.glb');
 assert.equal(writeNewBakedMesh(binaryTarget,assets,glb).bytes,glb.length);
 assert.deepEqual(fs.readFileSync(binaryTarget),glb);
 assert.throws(()=>writeNewBakedMesh(binaryTarget,assets,glb));
 assert.throws(()=>writeNewBakedMesh(path.join(assets,'bad.glb'),assets,content),/type/i);
 assert.throws(()=>writeNewBakedMesh(path.join(assets,'invalid.glb'),assets,Buffer.alloc(20)),/header/i);
 assert.throws(()=>writeNewBakedMesh(path.join(temp,'outside.gltf'),assets,content),/inside/i);
 fs.writeFileSync(path.join(assets,'orphan.gltf.meta'),'{}');
 assert.throws(()=>writeNewBakedMesh(path.join(assets,'orphan.gltf'),assets,content),/meta/i);
 assert.throws(()=>writeNewBakedMesh(path.join(assets,'bad.json'),assets,content),/gltf/i);
 assert.deepEqual(require('../package.json').contributions.messages['bake-geometry-graph-mesh'].methods,['bakeGeometryGraphMesh']);
 console.log('MESH BAKE V2 PASS: embedded binary, material grouping, exclusive asset creation.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
