'use strict';
/** Pure, user-controlled JSON interchange. Native Cocos Creator imports JSON files
 * from the Project Assets directory as JsonAsset; we don't invent a custom
 * importer or duplicate asset UUID/meta files.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parseGraph}=require('./SplineGeometryGraphVisualModel');
const MAX_BYTES=16384;
function canonicalGraphJSON(text){
  const compiled=parseGraph(text);
  const json=JSON.stringify(compiled.graph,null,2)+'\n';
  if(Buffer.byteLength(json,'utf8')>MAX_BYTES)
    throw Error('Serialized Geometry Graph exceeds 16 KiB.');
  return json;
}
function isJsonPath(p){
  return typeof p==='string'&&path.isAbsolute(p)&&path.extname(p).toLowerCase()==='.json'&&
    path.basename(p)!=='.json';
}
function readGraphFile(file,{filesystem=fs}={}){
  if(!isJsonPath(file))throw Error('Select an absolute .json graph file.');
  const stat=filesystem.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<2||stat.size>MAX_BYTES)
    throw Error('Geometry Graph file is invalid, a symlink or exceeds 16 KiB.');
  const content=filesystem.readFileSync(file,'utf8');
  return canonicalGraphJSON(content);
}
function writeGraphFile(file,text,{filesystem=fs}={}){
  if(!isJsonPath(file))throw Error('Select an absolute .json filename.');
  // Validate before touching the destination, and never overwrite a user file.
  const content=canonicalGraphJSON(text),parent=path.dirname(file);
  const dir=filesystem.lstatSync(parent);
  if(!dir.isDirectory()||dir.isSymbolicLink())
    throw Error('Graph destination must be an existing real directory.');
  let fd;
  try{
    fd=filesystem.openSync(file,'wx',0o644);
    filesystem.writeFileSync(fd,content,'utf8');
  }catch(error){
    if(fd!==undefined){try{filesystem.unlinkSync(file);}catch{}}
    throw error;
  }finally{if(fd!==undefined)filesystem.closeSync(fd);}
  return {file,bytes:Buffer.byteLength(content,'utf8'),nodes:parseGraph(content).ordered.length};
}

/** Phase 4.2c foundation: explicitly guarded edits to an existing native
 * JsonAsset source. This is filesystem-only; the Editor must request asset-db
 * refresh after a successful write and obtain explicit user confirmation.
 * Never write a graph whose on-disk bytes changed since the initial read.
 */
function assertProjectAssetPath(file,assetsRoot,{filesystem=fs}={}){
  if(!isJsonPath(file)||typeof assetsRoot!=='string'||!path.isAbsolute(assetsRoot))
    throw Error('Shared graph requires an absolute .json file and Project Assets root.');
  const root=path.resolve(assetsRoot),target=path.resolve(file);
  const relative=path.relative(root,target);
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))
    throw Error('Shared graph must be inside the project assets directory.');
  let cursor=root;
  const segments=relative.split(path.sep);
  for(const part of [null,...segments]){
    if(part!==null)cursor=path.join(cursor,part);
    const st=filesystem.lstatSync(cursor);
    if(st.isSymbolicLink()||(part===segments.at(-1)&&cursor===target?!st.isFile():!st.isDirectory()))
      throw Error('Shared graph path must contain only real directories and a regular JSON file.');
  }
  return target;
}
function contentHash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function readSharedGraphSnapshot(file,assetsRoot,{filesystem=fs}={}){
  const target=assertProjectAssetPath(file,assetsRoot,{filesystem});
  const raw=filesystem.readFileSync(target);
  if(raw.length<2||raw.length>MAX_BYTES)throw Error('Shared graph file exceeds size limits.');
  const canonical=canonicalGraphJSON(raw.toString('utf8'));
  return {file:target,graphJson:canonical,sha256:contentHash(raw)};
}
function saveSharedGraphIfUnchanged(file,assetsRoot,text,sha256,{filesystem=fs}={}){
  const canonical=canonicalGraphJSON(text);
  if(typeof sha256!=='string'||!/^[0-9a-f]{64}$/.test(sha256))
    throw Error('Expected shared graph SHA-256 is required.');
  const target=assertProjectAssetPath(file,assetsRoot,{filesystem});
  const before=filesystem.readFileSync(target);
  if(contentHash(before)!==sha256)
    throw Error('Shared graph changed on disk; refresh before saving.');
  if(before.toString('utf8')===canonical)
    return {file:target,changed:false,sha256};
  // Exclusive sibling temp prevents accidental destination creation/overwrite
  // by this process. Re-check source immediately before rename; external
  // writers not honoring this protocol can still race the final rename.
  const temp=target+'.splines-'+crypto.randomBytes(8).toString('hex')+'.tmp';
  let created=false;
  try{
    filesystem.writeFileSync(temp,canonical,{encoding:'utf8',flag:'wx',mode:0o600});
    created=true;
    assertProjectAssetPath(target,assetsRoot,{filesystem});
    if(contentHash(filesystem.readFileSync(target))!==sha256)
      throw Error('Shared graph changed during save; refresh before retrying.');
    filesystem.renameSync(temp,target);
    created=false;
    return {file:target,changed:true,sha256:contentHash(Buffer.from(canonical,'utf8'))};
  }finally{
    if(created)try{filesystem.unlinkSync(temp);}catch{}
  }
}
module.exports={MAX_BYTES,canonicalGraphJSON,readGraphFile,writeGraphFile,
  assertProjectAssetPath,readSharedGraphSnapshot,saveSharedGraphIfUnchanged};

