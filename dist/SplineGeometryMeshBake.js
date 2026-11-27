'use strict';
/** Bounded data-only glTF encoder and exclusive project asset writer. */
const fs=require('node:fs'),path=require('node:path');
const {partitionBakeGeometry,CHUNK_TRIANGLE_COUNTS,MAX_CHUNKS}=require('./SplineGeometryMeshChunk');
const {optimizeBakeGeometry,inspectBakeGeometry}=require('./SplineGeometryMeshOptimize');
const MAX_VERTICES=65536,MAX_INDICES=393216,MAX_BYTES=8*1024*1024;
const MAX_CHUNK_BYTES=16*1024*1024;
function buildBakedModel(snapshot,{chunkTriangles,optimize=false,format='gltf'}={}){
 if(typeof optimize!=='boolean'||!['gltf','glb'].includes(format))throw Error('Invalid Bake export options.');
 const chunked=chunkTriangles!==undefined;
 if(chunked&&!CHUNK_TRIANGLE_COUNTS.includes(chunkTriangles))throw Error('Invalid chunk triangle budget.');
 const outputs=snapshot?.outputs;
 if(!Array.isArray(outputs)||outputs.length<1||outputs.length>4)throw Error('Bake requires 1–4 outputs.');
 let vertices=0,indices=0,primitiveCount=0;
 const seen=new Set(),prepared=[];
 const inputStats={vertices:0,triangles:0,degenerateTriangles:0,unreferencedVertices:0};
 for(const {outputId,geometry:g} of outputs){
  if(typeof outputId!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(outputId)||seen.has(outputId))throw Error('Invalid Bake output ID.');
  seen.add(outputId);
  if(!g||!['positions','normals','uvs','indices'].every(k=>Array.isArray(g[k])))throw Error('Missing Bake geometry.');
  const n=g.positions.length/3;
  if(!Number.isInteger(n)||n<3||g.normals.length!==3*n||g.uvs.length!==2*n||g.indices.length<3||g.indices.length%3!==0||
     !['positions','normals','uvs'].every(k=>g[k].every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e8))||
     g.indices.some(i=>!Number.isInteger(i)||i<0||i>=n))throw Error('Invalid Bake geometry.');
  vertices+=n;indices+=g.indices.length;
  if(n>MAX_VERTICES||g.indices.length>MAX_INDICES||vertices>MAX_VERTICES*(chunked?4:1)||indices>MAX_INDICES*(chunked?4:1))throw Error('Bake exceeds geometry budget.');
  const slots=g.triangleMaterialSlots;
  if(slots!==undefined&&(!Array.isArray(slots)||slots.length!==g.indices.length/3||Array.from(slots).some(s=>!Number.isInteger(s)||s<0||s>3)))throw Error('Invalid Bake material groups.');
  const groups=new Map();
  for(let t=0;t<g.indices.length/3;t++){
   const slot=slots?.[t]??0;
   if(!groups.has(slot))groups.set(slot,[]);
   groups.get(slot).push(g.indices[t*3],g.indices[t*3+1],g.indices[t*3+2]);
  }
  primitiveCount+=groups.size;
  if(primitiveCount>4)throw Error('Bake exceeds four material primitives.');
  const stats=inspectBakeGeometry(g);for(const key of Object.keys(inputStats))inputStats[key]+=stats[key];
  prepared.push({outputId,g,groups,n});
 }
 // Keep one material table in physical output/group order, reused across chunks.
 const model={asset:{version:'2.0',generator:'Cocos Splines V2 Mesh Bake'},scene:0,scenes:[{nodes:[0]}],nodes:chunked?[{name:'BakedSpline',children:[]}]:[{name:'BakedSpline',mesh:0}],
  meshes:chunked?[]:[{name:'BakedSpline',primitives:[]}],materials:[],accessors:[],bufferViews:[],buffers:[]};
 const materialIds=new Map();
 for(const {outputId,groups} of prepared)for(const slot of [...groups.keys()].sort((a,b)=>a-b)){
  materialIds.set(outputId+':'+slot,model.materials.length);
  model.materials.push({name:outputId+'_group_'+slot,pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:1}});
 }
 const work=[];
 if(chunked){
  let chunkCount=0,totalBytes=0;
  // Count the actual remapped streams (including duplicated border vertices)
  // before constructing binary buffers; keep the serialized asset bounded.
  for(const {outputId,g} of prepared){
   const leaves=partitionBakeGeometry(g,chunkTriangles,MAX_CHUNKS-chunkCount);
   for(let i=0;i<leaves.length;i++){
    const geometry=leaves[i],groups=new Map(),n=geometry.positions.length/3;
    for(let t=0;t<geometry.indices.length/3;t++){
     const slot=geometry.triangleMaterialSlots?.[t]??0;
     if(!groups.has(slot))groups.set(slot,[]);
     groups.get(slot).push(geometry.indices[t*3],geometry.indices[t*3+1],geometry.indices[t*3+2]);
    }
    totalBytes+=n*32+geometry.indices.length*2+groups.size*4;
    if(totalBytes>MAX_CHUNK_BYTES)throw Error('Chunk Bake binary exceeds 16 MiB.');
    const name=outputId+'_chunk_'+String(i).padStart(3,'0');
    const meshIndex=model.meshes.length,nodeIndex=model.nodes.length;
    model.meshes.push({name,primitives:[]});
    model.nodes.push({name,mesh:meshIndex});model.nodes[0].children.push(nodeIndex);
    work.push({outputId,g:geometry,groups,n,meshIndex});chunkCount++;
   }
   if(chunkCount>MAX_CHUNKS)throw Error('Chunk Bake exceeds chunk count budget.');
  }
 }else for(const p of prepared)work.push({...p,meshIndex:0});
 const buffers=[];let offset=0;
 let beforeVertices=0,afterVertices=0,outputTriangles=0,primitives=0;
 const outputStats=[];
 function accessor(values,componentType,type,count,target,min,max){
  const bytes=componentType===5123?2:4;
  const pad=(4-offset%4)%4;
  if(pad){buffers.push(Buffer.alloc(pad));offset+=pad;}
  const buf=Buffer.alloc(values.length*bytes);
  values.forEach((v,i)=>componentType===5123?buf.writeUInt16LE(v,i*2):buf.writeFloatLE(v,i*4));
  const view=model.bufferViews.length;
  model.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buf.length,target});
  offset+=buf.length;buffers.push(buf);
  const id=model.accessors.length;
  model.accessors.push({bufferView:view,componentType,count,type,...(min?{min,max}:{})});
  return id;
 }
 for(const item of work){
  const {outputId,meshIndex}=item;
  beforeVertices+=item.n;
  const g=optimize?optimizeBakeGeometry(item.g):item.g,n=g.positions.length/3;
  const groups=optimize?new Map():item.groups;
  if(optimize)for(let t=0;t<g.indices.length/3;t++){
   const slot=g.triangleMaterialSlots?.[t]??0;
   if(!groups.has(slot))groups.set(slot,[]);
   groups.get(slot).push(g.indices[t*3],g.indices[t*3+1],g.indices[t*3+2]);
  }
  afterVertices+=n;outputTriangles+=g.indices.length/3;primitives+=groups.size;
  outputStats.push({outputId,mesh:model.meshes[meshIndex].name,beforeVertices:item.n,vertices:n,triangles:g.indices.length/3,primitives:groups.size});
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const pos=g.positions.map((v,i)=>{const f=Math.fround(v),k=i%3;min[k]=Math.min(min[k],f);max[k]=Math.max(max[k],f);return f;});
  const normals=[];
  for(let i=0;i<n;i++){
   const x=g.normals[i*3],y=g.normals[i*3+1],z=g.normals[i*3+2],l=Math.hypot(x,y,z);
   if(l<1e-10)throw Error('Bake contains degenerate normal.');
   normals.push(x/l,y/l,z/l);
  }
  // glTF and Creator both use right-handed, Y-up geometry; UV V is converted
  // for glTF's top-origin convention. Native round-trip acceptance is separate.
  const uv=g.uvs.map((v,i)=>i%2?1-v:v);
  const attributes={POSITION:accessor(pos,5126,'VEC3',n,34962,min,max),
   NORMAL:accessor(normals,5126,'VEC3',n,34962),TEXCOORD_0:accessor(uv,5126,'VEC2',n,34962)};
  for(const slot of [...groups.keys()].sort((a,b)=>a-b)){
   const list=groups.get(slot),material=materialIds.get(outputId+':'+slot);
   model.meshes[meshIndex].primitives.push({attributes,indices:accessor(list,5123,'SCALAR',list.length,34963),material,mode:4});
  }
 }
 if(offset>(chunked?MAX_CHUNK_BYTES:MAX_BYTES))throw Error('Bake binary exceeds byte budget.');
 const binary=Buffer.concat(buffers);
 const report={format,optimize,chunked,input:inputStats,beforeVertices,vertices:afterVertices,
  removedVertices:beforeVertices-afterVertices,triangles:outputTriangles,meshCount:model.meshes.length,primitives,materialCount:model.materials.length,
  binaryBytes:offset,vertexBytesSaved:(beforeVertices-afterVertices)*32,outputs:outputStats};
 model.buffers.push({byteLength:offset,...(format==='gltf'?{uri:'data:application/octet-stream;base64,'+binary.toString('base64')}:{})});
 // glTF extras are informational, not used to render or import the model.
 if(optimize||format==='glb')model.extras={cocosSplinesBake:report};
 let content;
 if(format==='glb'){
  const json=Buffer.from(JSON.stringify(model),'utf8'),jsonPad=(4-json.length%4)%4,binPad=(4-binary.length%4)%4;
  const total=12+8+json.length+jsonPad+8+binary.length+binPad;
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);
  header.writeUInt32LE(json.length+jsonPad,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length+binPad,0);binHeader.writeUInt32LE(0x004e4942,4);
  content=Buffer.concat([header,json,Buffer.alloc(jsonPad,0x20),binHeader,binary,Buffer.alloc(binPad)]);
 }else content=JSON.stringify(model,null,2)+'\n';
 return {content,report:{...report,fileBytes:Buffer.byteLength(content)}};
}
function encodeBakedGltf(snapshot,options={}){return buildBakedModel(snapshot,{...options,format:'gltf'}).content;}
function writeNewBakedMesh(file,assetsRoot,content,{filesystem=fs}={}){
 if(typeof file!=='string'||!path.isAbsolute(file)||!['.gltf','.glb'].includes(path.extname(file).toLowerCase())||
    typeof assetsRoot!=='string'||!path.isAbsolute(assetsRoot))throw Error('Bake requires a new .gltf or .glb inside Project/assets.');
 const root=path.resolve(assetsRoot),target=path.resolve(file),rel=path.relative(root,target);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Bake destination must be inside Project/assets.');
 const isGlb=path.extname(target).toLowerCase()==='.glb';
 if((isGlb?!Buffer.isBuffer(content):typeof content!=='string')||Buffer.byteLength(content)>24*1024*1024)throw Error('Invalid Bake content type or size.');
 if(isGlb&&(content.length<20||content.readUInt32LE(0)!==0x46546c67||content.readUInt32LE(4)!==2||content.readUInt32LE(8)!==content.length))throw Error('Invalid GLB header.');
 let cursor=root;
 for(const segment of ['',...rel.split(path.sep).slice(0,-1)]){
  cursor=path.join(cursor,segment);
  const info=filesystem.lstatSync(cursor);
  if(!info.isDirectory()||info.isSymbolicLink())throw Error('Bake requires existing real asset directories.');
 }
 // lstat catches dangling .meta symlinks as well as ordinary files.
 try{filesystem.lstatSync(target+'.meta');throw Error('Bake destination already has a .meta file.');}catch(e){if(e?.code!=='ENOENT')throw e;}
 let fd;
 try{
  fd=filesystem.openSync(target,'wx',0o644);
  filesystem.writeFileSync(fd,content);
  return {assetUrl:'db://assets/'+rel.split(path.sep).join('/'),bytes:Buffer.byteLength(content)};
 }catch(e){if(fd!==undefined)try{filesystem.unlinkSync(target);}catch{}throw e;}
 finally{if(fd!==undefined)filesystem.closeSync(fd);}
}
module.exports={encodeBakedGltf,buildBakedModel,writeNewBakedMesh};
