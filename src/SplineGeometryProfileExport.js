'use strict';
/** Explicit, new-file-only authored Profile export into Project/assets.
 * Native Creator imports it as JsonAsset; Scene and .meta are never modified.
 * All validation is performed BEFORE opening a file; exclusive create makes
 * overwrites impossible even if another writer creates the same path.
 */
const fs=require('node:fs'),path=require('node:path');
const {formatProfile}=require('./SplineGeometryProfileEditor');
const {MAX_BYTES}=require('./SplineGeometryProfileAssetWorkflow');

function planProfileExport(file,assetsRoot,profile,{filesystem=fs}={}){
 if(typeof file!=='string'||!path.isAbsolute(file)||
    typeof assetsRoot!=='string'||!path.isAbsolute(assetsRoot)||
    path.extname(file).toLowerCase()!=='.json'||path.basename(file).length<6)
  throw Error('Profile export requires a new absolute .json file inside Project/assets.');
 const root=path.resolve(assetsRoot),target=path.resolve(file);
 const relative=path.relative(root,target);
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||
    path.isAbsolute(relative))
  throw Error('Profile export destination must be inside Project/assets.');
 // Never follow symlinks from root through destination parent. Revalidate
 // immediately before creation; atomic wx prevents destination overwrite.
 let cursor=root;
 if(!filesystem.lstatSync(cursor).isDirectory()||
     filesystem.lstatSync(cursor).isSymbolicLink())
  throw Error('Profile export Project/assets must be a real directory.');
 for(const segment of relative.split(path.sep).slice(0,-1)){
  cursor=path.join(cursor,segment);
  const info=filesystem.lstatSync(cursor);
  if(!info.isDirectory()||info.isSymbolicLink())
   throw Error('Profile export directories must be existing real directories.');
 }
 // An orphan .meta file may retain a UUID from a deleted asset. Never
 // adopt it silently when creating a new project-owned Profile JsonAsset.
 if(filesystem.existsSync(target+'.meta'))
  throw Error('Profile export destination already has an existing .meta file.');
 const content=formatProfile(profile);
 const bytes=Buffer.byteLength(content,'utf8');
 if(bytes<2||bytes>MAX_BYTES)
  throw Error('Profile export exceeds 8 KiB.');
 return {file:target,assetUrl:'db://assets/'+relative.split(path.sep).join('/'),
  content,bytes,assetsRoot:root};
}
function writeNewProfileAsset(file,assetsRoot,profile,{filesystem=fs}={}){
 const planned=planProfileExport(file,assetsRoot,profile,{filesystem});
 // The parent can change between planning and writing; fail if the path has
 // already changed during the validation/read phase before doing any write.
 const second=planProfileExport(file,assetsRoot,profile,{filesystem});
 if(second.file!==planned.file||second.assetUrl!==planned.assetUrl)
  throw Error('Profile export destination changed.');
 let fd;
 try{
  fd=filesystem.openSync(planned.file,'wx',0o644);
  filesystem.writeFileSync(fd,planned.content,'utf8');
  return {file:planned.file,assetUrl:planned.assetUrl,bytes:planned.bytes};
 }catch(error){
  if(fd!==undefined){
   try{filesystem.unlinkSync(planned.file);}catch{}
  }
  throw error;
 }finally{if(fd!==undefined)filesystem.closeSync(fd);}
}
module.exports={planProfileExport,writeNewProfileAsset};
