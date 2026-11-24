'use strict';
/** Pure, user-controlled JSON interchange. Native Cocos Creator imports JSON files
 * from the Project Assets directory as JsonAsset; we don't invent a custom
 * importer or duplicate asset UUID/meta files.
 */
const fs=require('node:fs'),path=require('node:path');
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
module.exports={MAX_BYTES,canonicalGraphJSON,readGraphFile,writeGraphFile};
