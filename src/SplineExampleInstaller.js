'use strict';
/** Installs optional, project-owned examples on demand from the Editor menu.
 * Never invoked on extension load. Never modifies the extension asset mount.
 * Exclusive writes preserve user edits and native .meta UUIDs on re-install.
 */
const fs=require('node:fs'),path=require('node:path');
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
 ['GeometryGraph/BasicProfileExtrudeGraph.json','examples/installable/GeometryGraph/BasicProfileExtrudeGraph.json'],
 ['GeometryGraph/BasicMeshDeformGraph.json','examples/installable/GeometryGraph/BasicMeshDeformGraph.json'],
 ['GeometryGraph/MultiOutputRoadTubeGraph.json','examples/installable/GeometryGraph/MultiOutputRoadTubeGraph.json'],
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
 const installed=[],skipped=[];
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
   installed:installed.length,skipped:skipped.length,
   files:installed,total:FILES.length};
}
module.exports={installSplineExamples,EXAMPLE_FILES:FILES,EXAMPLE_FOLDER:FOLDER};
