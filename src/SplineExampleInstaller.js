'use strict';
/** Installs project-owned examples only on explicit menu action.
 * Existing user edits and Cocos .meta UUIDs are preserved. Only known,
 * byte-identical older example scripts may be safely upgraded in place.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PRISTINE_GALLERY_BLOBS=new Set([
 '8409dfab478a7cb3f4be983b9dcc4b4990b87d75', // Multi Hollow 19-mode
 'fb7636bf1b0f5f4abf41a5a732465dd61df169a8', // Multi Contour 18-mode
 'c0d728b91ba6454c4b2a69f207ecfc9fd1074892', // Profile Holes 17-mode
 '13e6464755a622979bab70363166b934e8a1964d', // Advanced Atlas 16-mode
 '4ba2fcd4ddb91f49da9a577708547bbd891e06f9', // original 13-mode
 'b9cfb9cd36a5c9ebaa5d60f708a26e93fb37b02b', // UV Atlas 14-mode
 '99870b8af9ffc9899f21f6c84e3026e4bb0b5dcf', // Triangle UV 15-mode
]);
const PRISTINE_SCRIPT_BLOBS=new Map([
 ['ExampleGallery.ts',PRISTINE_GALLERY_BLOBS],
 ['Train/TrainSingleSpline.ts',new Set(['edd3be59b98d47141cdb32c49d5f80a8b75eea97'])],
 ['Train/TrainRouteConsist.ts',new Set(['f7cb7685267cc507857ee05f9d0eee23f06c9cf2'])],
]);
/** Hash the exact bytes of previously bundled scripts; user-edited files
 * must never be rewritten, and the existing Creator .meta UUID is preserved.
 */
function gitBlobSha(buffer){
 const bytes=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer);
 return crypto.createHash('sha1').update('blob '+bytes.length+String.fromCharCode(0)).update(bytes).digest('hex');
}
function upgradePristineScript(filesystem,target,source,knownBlobs){
 if(!knownBlobs)return false;
 const old=filesystem.readFileSync(target);
 if(!knownBlobs.has(gitBlobSha(old)))return false;
 const data=filesystem.readFileSync(source);
 if(data.equals(old))return false;
 // Atomic replacement of ONLY the known pristine script, never its .meta.
 const temp=target+'.cocos-splines-update-'+process.pid;
 let fd,ownsTemp=false;
 try{
  fd=filesystem.openSync(temp,'wx',0o644);ownsTemp=true;
  filesystem.writeFileSync(fd,data);
  filesystem.closeSync(fd);fd=undefined;
  // Do not overwrite an edit made after the first read.
  if(!filesystem.readFileSync(target).equals(old))
   return false;
  filesystem.renameSync(temp,target);
  return true;
 }finally{
  if(fd!==undefined)filesystem.closeSync(fd);
  if(ownsTemp&&filesystem.existsSync(temp))filesystem.unlinkSync(temp);
 }
}
const FOLDER='CocosSplinesExamples';
const FILES=Object.freeze([
 ['README.md','examples/installable/README.md'],
 ['CREATE_GALLERY_IN_SCENE.md','examples/installable/CREATE_GALLERY_IN_SCENE.md'],
 ['ExampleGallery.ts','examples/installable/ExampleGallery.ts'],
 ['Train/TrainSingleSpline.ts','docs/examples/TrainSingleSpline.ts'],
 ['Train/TrainRouteConsist.ts','docs/examples/TrainRouteConsist.ts'],
 ['Road/RoadUvSetup.ts','docs/examples/RoadUvSetup.ts'],
 ['Extrude/ExtrudeTubeSetup.ts','docs/examples/ExtrudeTubeSetup.ts'],
 ['Junction/JunctionRoadPatchSetup.ts','docs/examples/JunctionRoadPatchSetup.ts'],
 ['MeshDeform/MeshDeformSetup.ts','examples/installable/MeshDeform/MeshDeformSetup.ts'],
 ['Traffic/TrafficSignalsSetup.ts','examples/installable/Traffic/TrafficSignalsSetup.ts'],
 ['Population/PrefabSpawningSetup.ts','examples/installable/Population/PrefabSpawningSetup.ts'],
 ['GeometryGraph/BasicRibbonGraph.json','examples/installable/GeometryGraph/BasicRibbonGraph.json'],
 ['GeometryGraph/BasicTubeGraph.json','examples/installable/GeometryGraph/BasicTubeGraph.json'],
 ['GeometryGraph/TransformPathGraph.json','examples/installable/GeometryGraph/TransformPathGraph.json'],
 ['GeometryGraph/NoisePathGraph.json','examples/installable/GeometryGraph/NoisePathGraph.json'],
 ['GeometryGraph/PathProcessingGraph.json','examples/installable/GeometryGraph/PathProcessingGraph.json'],
 ['GeometryGraph/ConformPathGraph.json','examples/installable/GeometryGraph/ConformPathGraph.json'],
 ['GeometryGraph/MultiSplineGraph.json','examples/installable/GeometryGraph/MultiSplineGraph.json'],
 ['GeometryGraph/MergePathGraph.json','examples/installable/GeometryGraph/MergePathGraph.json'],
 ['GeometryGraph/MergeMeshGraph.json','examples/installable/GeometryGraph/MergeMeshGraph.json'],
 ['GeometryGraph/ProfileKeysGraph.json','examples/installable/GeometryGraph/ProfileKeysGraph.json'],
 ['GeometryGraph/ProfileMorphGraph.json','examples/installable/GeometryGraph/ProfileMorphGraph.json'],
 ['GeometryGraph/ContourMorphGraph.json','examples/installable/GeometryGraph/ContourMorphGraph.json'],
 ['GeometryGraph/ProfileUVMorphGraph.json','examples/installable/GeometryGraph/ProfileUVMorphGraph.json'],
 ['GeometryGraph/Profiles/UVMorphA.json','examples/installable/GeometryGraph/Profiles/UVMorphA.json'],
 ['GeometryGraph/Profiles/UVMorphB.json','examples/installable/GeometryGraph/Profiles/UVMorphB.json'],
 ['GeometryGraph/Profiles/ContourMorphA.json','examples/installable/GeometryGraph/Profiles/ContourMorphA.json'],
 ['GeometryGraph/Profiles/ContourMorphB.json','examples/installable/GeometryGraph/Profiles/ContourMorphB.json'],
 ['GeometryGraph/Profiles/KeySquareProfile.json','examples/installable/GeometryGraph/Profiles/KeySquareProfile.json'],
 ['GeometryGraph/Profiles/KeyWideProfile.json','examples/installable/GeometryGraph/Profiles/KeyWideProfile.json'],
 ['GeometryGraph/BasicProfileExtrudeGraph.json','examples/installable/GeometryGraph/BasicProfileExtrudeGraph.json'],
 ['GeometryGraph/TaperWidthExtrudeGraph.json','examples/installable/GeometryGraph/TaperWidthExtrudeGraph.json'],
 ['GeometryGraph/AuthoredProfileExtrudeGraph.json','examples/installable/GeometryGraph/AuthoredProfileExtrudeGraph.json'],
 ['GeometryGraph/Profiles/LProfile.json','examples/installable/GeometryGraph/Profiles/LProfile.json'],
 ['GeometryGraph/Profiles/OctagonProfile.json','examples/installable/GeometryGraph/Profiles/OctagonProfile.json'],
 ['GeometryGraph/Profiles/UVSeamProfile.json','examples/installable/GeometryGraph/Profiles/UVSeamProfile.json'],
 ['GeometryGraph/UVIslandExtrudeGraph.json','examples/installable/GeometryGraph/UVIslandExtrudeGraph.json'],
 ['GeometryGraph/Profiles/UVEdgeIslandProfile.json','examples/installable/GeometryGraph/Profiles/UVEdgeIslandProfile.json'],
 ['GeometryGraph/Profiles/UVQuadIslandProfile.json','examples/installable/GeometryGraph/Profiles/UVQuadIslandProfile.json'],
 ['GeometryGraph/Profiles/UVWorldSpaceProfile.json','examples/installable/GeometryGraph/Profiles/UVWorldSpaceProfile.json'],
 ['GeometryGraph/Profiles/UVAtlasProfile.json','examples/installable/GeometryGraph/Profiles/UVAtlasProfile.json'],
 ['GeometryGraph/Profiles/UVTriangleUnwrapProfile.json','examples/installable/GeometryGraph/Profiles/UVTriangleUnwrapProfile.json'],
 ['GeometryGraph/Profiles/UVAdvancedAtlasProfile.json','examples/installable/GeometryGraph/Profiles/UVAdvancedAtlasProfile.json'],
 ['GeometryGraph/Profiles/HollowProfile.json','examples/installable/GeometryGraph/Profiles/HollowProfile.json'],
 ['GeometryGraph/Profiles/MultiContourProfile.json','examples/installable/GeometryGraph/Profiles/MultiContourProfile.json'],
 ['GeometryGraph/Profiles/MultiHollowProfile.json','examples/installable/GeometryGraph/Profiles/MultiHollowProfile.json'],
 ['GeometryGraph/Profiles/UVAtlasPriorityProfile.json','examples/installable/GeometryGraph/Profiles/UVAtlasPriorityProfile.json'],
 ['GeometryGraph/Profiles/UVMetricProfile.json','examples/installable/GeometryGraph/Profiles/UVMetricProfile.json'],
 ['GeometryGraph/Profiles/UVTaperProfile.json','examples/installable/GeometryGraph/Profiles/UVTaperProfile.json'],
 ['GeometryGraph/BasicMeshDeformGraph.json','examples/installable/GeometryGraph/BasicMeshDeformGraph.json'],
 ['GeometryGraph/MultiOutputRoadTubeGraph.json','examples/installable/GeometryGraph/MultiOutputRoadTubeGraph.json'],
 ['GeometryGraph/ImportedMeshDeformGraph.json','examples/installable/GeometryGraph/ImportedMeshDeformGraph.json'],
 ['GeometryGraph/DualMeshAxisGraph.json','examples/installable/GeometryGraph/DualMeshAxisGraph.json'],
 ['GeometryGraph/SourceLengthTrimGraph.json','examples/installable/GeometryGraph/SourceLengthTrimGraph.json'],
 ['GeometryGraph/SubMeshSelectionGraph.json','examples/installable/GeometryGraph/SubMeshSelectionGraph.json'],
 ['GeometryGraph/MultiMaterialOutputsGraph.json','examples/installable/GeometryGraph/MultiMaterialOutputsGraph.json'],
]);
function directory(fsApi,location,create=false){
 if(create&&!fsApi.existsSync(location))fsApi.mkdirSync(location);
 const st=fsApi.lstatSync(location);
 if(!st.isDirectory()||st.isSymbolicLink())
   throw Error('Example installation requires a real directory: '+location);
}
function installSplineExamples({projectPath,extensionRoot=path.resolve(__dirname,'..'),
 filesystem=fs}={}){
 if(typeof projectPath!=='string'||!path.isAbsolute(projectPath))
   throw Error('No active Cocos Creator project path.');
 if(typeof extensionRoot!=='string'||!path.isAbsolute(extensionRoot))
   throw Error('Invalid extension example source path.');
 const root=path.resolve(projectPath),packageRoot=path.resolve(extensionRoot);
 directory(filesystem,root);
 const assets=path.join(root,'assets');
 directory(filesystem,assets); // must already be the active project asset directory
 const base=path.join(assets,FOLDER);
 // Preflight ALL inputs before changing the destination.
 const sourceFiles=FILES.map(([relative,source])=>{
   if(relative.startsWith('/')||relative.split('/').some(x=>x==='..'||x==='.'||!x)||
      source.split('/').some(x=>x==='..'||x==='.'||!x))
     throw Error('Unsafe bundled example path.');
   const absolute=path.resolve(packageRoot,source);
   if(!absolute.startsWith(packageRoot+path.sep))
     throw Error('Bundled example escapes the extension.');
   let dir=packageRoot;
   directory(filesystem,dir);
   for(const part of source.split('/').slice(0,-1)){
     dir=path.join(dir,part);directory(filesystem,dir);
   }
   const st=filesystem.lstatSync(absolute);
   if(!st.isFile()||st.isSymbolicLink()||st.size>256*1024)
     throw Error('Invalid bundled example asset: '+source);
   return {relative,absolute};
 });
 directory(filesystem,base,true);
 const installed=[],skipped=[],updated=[];
 for(const {relative,absolute} of sourceFiles){
   const parts=relative.split('/');
   let dir=base;
   for(const part of parts.slice(0,-1)){
     dir=path.join(dir,part);directory(filesystem,dir,true);
   }
   const target=path.join(dir,parts[parts.length-1]);
   if(filesystem.existsSync(target)){
     // A symlink or directory in the destination is NOT a valid installed file.
     const st=filesystem.lstatSync(target);
     if(!st.isFile()||st.isSymbolicLink())
       throw Error('Unsafe example destination path: '+target);
     if(upgradePristineScript(filesystem,target,absolute,PRISTINE_SCRIPT_BLOBS.get(relative))){
       updated.push(relative);continue;
     }
     skipped.push(relative);continue;
   }
   const data=filesystem.readFileSync(absolute);
   let fd;
   try{
     fd=filesystem.openSync(target,'wx',0o644);
     filesystem.writeFileSync(fd,data);
     installed.push(relative);
   }catch(error){
     if(error?.code==='EEXIST'){
       const st=filesystem.lstatSync(target);
       if(!st.isFile()||st.isSymbolicLink())throw error;
       skipped.push(relative);continue;
     }
     // Remove a partially written new file while preserving old files.
     if(fd!==undefined){try{filesystem.unlinkSync(target);}catch{}}
     throw error;
   }finally{if(fd!==undefined)filesystem.closeSync(fd);}
 }
 return {folder:base,assetUrl:'db://assets/'+FOLDER,
   installed:installed.length,skipped:skipped.length,updated:updated.length,
   files:installed,updatedFiles:updated,total:FILES.length};
}
module.exports={installSplineExamples,EXAMPLE_FILES:FILES,EXAMPLE_FOLDER:FOLDER};
