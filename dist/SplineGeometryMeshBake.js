'use strict';
/** Bounded data-only glTF encoder and exclusive project asset writer. */
const fs=require('node:fs'),path=require('node:path');
const MAX_VERTICES=65536,MAX_INDICES=393216,MAX_BYTES=8*1024*1024;
function encodeBakedGltf(snapshot){
 const outputs=snapshot?.outputs;
 if(!Array.isArray(outputs)||outputs.length<1||outputs.length>4)throw Error('Bake requires 1–4 outputs.');
 let vertices=0,indices=0,primitiveCount=0;
 const seen=new Set(),prepared=[];
 for(const {outputId,geometry:g} of outputs){
  if(typeof outputId!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(outputId)||seen.has(outputId))throw Error('Invalid Bake output ID.');
  seen.add(outputId);
  if(!g||!['positions','normals','uvs','indices'].every(k=>Array.isArray(g[k])))throw Error('Missing Bake geometry.');
  const n=g.positions.length/3;
  if(!Number.isInteger(n)||n<3||g.normals.length!==3*n||g.uvs.length!==2*n||g.indices.length<3||g.indices.length%3!==0||
     !['positions','normals','uvs'].every(k=>g[k].every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e8))||
     g.indices.some(i=>!Number.isInteger(i)||i<0||i>=n))throw Error('Invalid Bake geometry.');
  vertices+=n;indices+=g.indices.length;
  if(vertices>MAX_VERTICES||indices>MAX_INDICES)throw Error('Bake exceeds geometry budget.');
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
  prepared.push({outputId,g,groups,n});
 }
 const model={asset:{version:'2.0',generator:'Cocos Splines V2 Mesh Bake'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'BakedSpline',mesh:0}],
  meshes:[{name:'BakedSpline',primitives:[]}],materials:[],accessors:[],bufferViews:[],buffers:[]};
 const buffers=[];let offset=0;
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
 for(const {outputId,g,groups,n} of prepared){
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
   const list=groups.get(slot),material=model.materials.length;
   model.materials.push({name:outputId+'_group_'+slot,pbrMetallicRoughness:{metallicFactor:0,roughnessFactor:1}});
   model.meshes[0].primitives.push({attributes,indices:accessor(list,5123,'SCALAR',list.length,34963),material,mode:4});
  }
 }
 if(offset>MAX_BYTES)throw Error('Bake binary exceeds 8 MiB.');
 model.buffers.push({byteLength:offset,uri:'data:application/octet-stream;base64,'+Buffer.concat(buffers).toString('base64')});
 return JSON.stringify(model,null,2)+'\n';
}
function writeNewBakedMesh(file,assetsRoot,content,{filesystem=fs}={}){
 if(typeof file!=='string'||!path.isAbsolute(file)||path.extname(file).toLowerCase()!=='.gltf'||
    typeof assetsRoot!=='string'||!path.isAbsolute(assetsRoot))throw Error('Bake requires a new .gltf inside Project/assets.');
 const root=path.resolve(assetsRoot),target=path.resolve(file),rel=path.relative(root,target);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Bake destination must be inside Project/assets.');
 if(typeof content!=='string'||Buffer.byteLength(content)>12*1024*1024)throw Error('Invalid Bake content size.');
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
  filesystem.writeFileSync(fd,content,'utf8');
  return {assetUrl:'db://assets/'+rel.split(path.sep).join('/'),bytes:Buffer.byteLength(content)};
 }catch(e){if(fd!==undefined)try{filesystem.unlinkSync(target);}catch{}throw e;}
 finally{if(fd!==undefined)filesystem.closeSync(fd);}
}
module.exports={encodeBakedGltf,writeNewBakedMesh};
