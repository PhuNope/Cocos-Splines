'use strict';
/** Guard external JsonAsset writes using the same path + checksum contract
 * as shared Graph files. Never edits a .meta file or creates Scene Undo state.
 */
const fs=require('node:fs'),crypto=require('node:crypto');
const {assertProjectAssetPath}=require('./SplineGeometryGraphAssetWorkflow');
const {formatProfile}=require('./SplineGeometryProfileEditor');
const MAX_BYTES=8192;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function readProfileSnapshot(file,assetsRoot,{filesystem=fs}={}){
 const target=assertProjectAssetPath(file,assetsRoot,{filesystem});
 const bytes=filesystem.readFileSync(target);
 if(bytes.length<2||bytes.length>MAX_BYTES)
  throw Error('Profile Asset must be 2–8192 bytes.');
 return {file:target,profileJson:formatProfile(bytes.toString('utf8')),sha256:hash(bytes)};
}
function saveProfileIfUnchanged(file,assetsRoot,text,sha256,{filesystem=fs}={}){
 if(typeof sha256!=='string'||!/^[0-9a-f]{64}$/.test(sha256))
  throw Error('Expected Profile Asset SHA-256 is required.');
 const target=assertProjectAssetPath(file,assetsRoot,{filesystem});
 const next=formatProfile(text);
 if(Buffer.byteLength(next,'utf8')>MAX_BYTES)
  throw Error('Profile Asset output exceeds 8 KiB.');
 const previous=filesystem.readFileSync(target);
 if(hash(previous)!==sha256)throw Error('Profile Asset changed on disk; reload before saving.');
 if(previous.toString('utf8')===next)return {file:target,changed:false,sha256};
 const temp=target+'.splines-'+crypto.randomBytes(8).toString('hex')+'.tmp';
 let created=false;
 try{
  filesystem.writeFileSync(temp,next,{encoding:'utf8',flag:'wx',mode:0o600});
  created=true;
  assertProjectAssetPath(target,assetsRoot,{filesystem});
  if(hash(filesystem.readFileSync(target))!==sha256)
   throw Error('Profile Asset changed while saving; reload before retrying.');
  filesystem.renameSync(temp,target);
  created=false;
  return {file:target,changed:true,sha256:hash(Buffer.from(next,'utf8'))};
 }finally{if(created)try{filesystem.unlinkSync(temp);}catch{}}
}
module.exports={MAX_BYTES,readProfileSnapshot,saveProfileIfUnchanged};
