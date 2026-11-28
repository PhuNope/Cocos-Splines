'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {installSplineExamples,EXAMPLE_FILES,EXAMPLE_FOLDER}=
    require('../dist/SplineExampleInstaller');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cocos-examples-install-'));
try {
 const project=path.join(temp,'My Cocos Project'),assets=path.join(project,'assets');
 fs.mkdirSync(assets,{recursive:true});
 const first=installSplineExamples({projectPath:project,extensionRoot:root});
 assert.equal(first.installed,EXAMPLE_FILES.length);
 assert.equal(first.skipped,0);
 assert.equal(first.assetUrl,'db://assets/CocosSplinesExamples');
 assert.equal(first.folder,path.join(assets,EXAMPLE_FOLDER));
 assert(fs.existsSync(path.join(first.folder,'ExampleGallery.ts')));
 assert(fs.readFileSync(path.join(first.folder,'README.md'),'utf8')
     .includes('CocosSplinesExampleGalleryV2'));
 for(const [relative] of EXAMPLE_FILES){
     const target=path.join(first.folder,...relative.split('/'));
     assert(fs.statSync(target).isFile(),relative);
     assert(!fs.existsSync(target+'.meta'), 'No extension UUIDs should be copied');
 }
 assert(fs.readFileSync(path.join(first.folder,'Train/TrainControllerSetup.ts'),'utf8').includes('SplineTrainController'));
 assert(fs.readFileSync(path.join(first.folder,'Route/RouteControllerSetup.ts'),'utf8').includes('SplineRouteController'));
 assert(fs.readFileSync(path.join(first.folder,'Group/GroupControllerSetup.ts'),'utf8').includes('SplineGroupController'));
 const demo=JSON.parse(fs.readFileSync(
   path.join(first.folder,'GeometryGraph/BasicRibbonGraph.json'),'utf8'));
 assert.equal(demo.version,1);
 assert.equal(demo.output,'output');
 assert.deepEqual(demo.nodes.map(n=>n.type),
   ['spline','offset','width','ribbon','output']);
 for(const [file,type] of [['SpacingPopulationGraph','spacing'],['RandomPopulationGraph','random'],['JitterPopulationGraph','jitter'],['TransformPopulationGraph','rotation'],['SurfacePopulationGraph','surface']]){
  const g=JSON.parse(fs.readFileSync(path.join(first.folder,'Population/'+file+'.json'),'utf8'));
  assert(g.nodes.some(n=>n.type===type));
 }
 assert(fs.readFileSync(path.join(first.folder,'Population/PopulationGraphSetup.ts'),'utf8').includes('populationGraphAsset'));
 const populationGraph=JSON.parse(fs.readFileSync(path.join(first.folder,'Population/BasicPopulationGraph.json'),'utf8'));
 assert.equal(populationGraph.version,1);assert.equal(populationGraph.nodes.find(n=>n.type==='prefab').weights.length,2);
 const tube=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/BasicTubeGraph.json'),'utf8'));
 assert.equal(tube.version,1);
 assert.deepEqual(tube.nodes.map(n=>n.type),['spline','offset','width','tube','output']);
 assert.equal(tube.nodes.find(n=>n.type==='tube').radialSegments,16);
 for(const [file,type] of [['TransformPathGraph','transform'],['NoisePathGraph','noise']]){
  const graph=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/'+file+'.json'),'utf8'));
  assert(graph.nodes.some(n=>n.type===type));
 }
 const processing=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/PathProcessingGraph.json'),'utf8'));
 assert.deepEqual(processing.nodes.map(n=>n.type),['spline','reverse','clip','resample','tube','output']);
 const conform=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/ConformPathGraph.json'),'utf8'));
 assert(conform.nodes.some(n=>n.type==='conform'));
 const multiSpline=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/MultiSplineGraph.json'),'utf8'));
 assert.equal(multiSpline.version,2);
 assert.deepEqual(multiSpline.nodes.filter(n=>n.type==='spline').map(n=>n.slot??0),[0,1]);
 const mergePath=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/MergePathGraph.json'),'utf8'));
 assert.equal(mergePath.nodes.find(n=>n.type==='mergePath').pathInputB,'sourceB');
 const mergeMesh=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/MergeMeshGraph.json'),'utf8'));
 assert.equal(mergeMesh.nodes.find(n=>n.type==='mergeMesh').meshInputB,'tube');
 const keyedGraph=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/ProfileKeysGraph.json'),'utf8'));
 assert.equal(keyedGraph.nodes.find(n=>n.type==='extrude').profileKeys.length,3);
 const morphGraph=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/ProfileMorphGraph.json'),'utf8'));
 assert.equal(morphGraph.nodes.find(n=>n.type==='extrude').profileInterpolation,2);
 const contourMorph=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/ContourMorphGraph.json'),'utf8'));
 assert.equal(contourMorph.nodes.find(n=>n.type==='extrude').profileInterpolation,2);
 const materialGraph=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/ProfileMaterialsGraph.json'),'utf8'));
 assert.equal(materialGraph.nodes.find(n=>n.type==='extrude').profileMaterials.inner,1);
 const uvMorph=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/ProfileUVMorphGraph.json'),'utf8'));
 assert.equal(uvMorph.nodes.find(n=>n.type==='extrude').profileInterpolation,2);
 const uvProfiles=['UVMorphA','UVMorphB'].map(file=>JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/Profiles/'+file+'.json'),'utf8')));
 assert.deepEqual(uvProfiles[0].uv,uvProfiles[1].uv);
 for(const file of ['ContourMorphA','ContourMorphB']){
  const p=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/Profiles/'+file+'.json'),'utf8'));
  assert.equal(p.holes.length,1);assert.equal(p.outerContours.length,1);assert.equal(p.outerHoles[0].length,1);
 }
 for(const file of ['KeySquareProfile','KeyWideProfile']){
  const p=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/Profiles/'+file+'.json'),'utf8'));
  assert.equal(p.points.length,4);
 }
 const extrude=JSON.parse(fs.readFileSync(
   path.join(first.folder,'GeometryGraph/BasicProfileExtrudeGraph.json'),'utf8'));
 assert.equal(extrude.version,1);
 assert.deepEqual(extrude.nodes.map(n=>n.type),
   ['spline','offset','width','extrude','output']);
 assert.equal(extrude.nodes.find(n=>n.type==='extrude').profileShape,2);
 const taperGraph=JSON.parse(fs.readFileSync(path.join(first.folder,
  'GeometryGraph/TaperWidthExtrudeGraph.json'),'utf8'));
 assert.equal(taperGraph.version,1);
 assert.deepEqual(taperGraph.nodes.map(n=>n.type),
  ['spline','width','extrude','output']);
 const taperWidth=taperGraph.nodes.find(n=>n.type==='width');
 assert.equal(taperWidth.midMultiplier,.35);
 assert.equal(taperWidth.endMultiplier,1);
 assert.equal(taperWidth.taperMode,1);
 assert.equal(taperGraph.nodes.find(n=>n.type==='extrude').profileSlot,0);
 const authored=JSON.parse(fs.readFileSync(
  path.join(first.folder,'GeometryGraph/AuthoredProfileExtrudeGraph.json'),'utf8'));
 assert.equal(authored.version,2);
 assert.deepEqual(authored.nodes.filter(n=>n.type==='extrude').map(n=>n.profileSlot),
  [0,1]);
 const islandsGraph=JSON.parse(fs.readFileSync(path.join(first.folder,
  'GeometryGraph/UVIslandExtrudeGraph.json'),'utf8'));
 assert.equal(islandsGraph.version,1);
 assert.equal(islandsGraph.nodes.find(n=>n.type==='extrude').profileSlot,0);
 for(const [filename,mode] of [
  ['UVEdgeIslandProfile',1],['UVQuadIslandProfile',2],['UVWorldSpaceProfile',1],
 ]){
  const asset=JSON.parse(fs.readFileSync(path.join(first.folder,
   'GeometryGraph/Profiles/'+filename+'.json'),'utf8'));
  assert.equal(asset.version,1);
  assert.equal(asset.uv.sideIslandMode,mode);
  assert.equal(asset.points.length,4);
  if(filename==='UVWorldSpaceProfile'){
   assert.equal(asset.uv.uWorldSpace,true);
   assert.equal(asset.uv.uMetersPerRepeat,1.5);
  }
 }
 const atlasProfile=JSON.parse(fs.readFileSync(path.join(first.folder,
  'GeometryGraph/Profiles/UVAtlasProfile.json'),'utf8'));
 assert.equal(atlasProfile.version,1);
 assert.equal(atlasProfile.uv.sideIslandMode,2);
 assert.equal(atlasProfile.uv.atlasPacking,true);
 assert.equal(atlasProfile.uv.atlasPadding,.06);
 const triangles=JSON.parse(fs.readFileSync(path.join(first.folder,
  'GeometryGraph/Profiles/UVTriangleUnwrapProfile.json'),'utf8'));
 assert.equal(triangles.format,'cocos-splines/profile');
 assert.equal(triangles.uv.sideIslandMode,2);
 assert.equal(triangles.uv.triangleUnwrap,true);
 assert.equal(triangles.uv.atlasPacking,true);
 assert.equal(triangles.uv.atlasPadding,.06);
 const advancedAtlas=JSON.parse(fs.readFileSync(path.join(first.folder,
  'GeometryGraph/Profiles/UVAdvancedAtlasProfile.json'),'utf8'));
 assert.equal(advancedAtlas.uv.atlasRotate,true);
 assert.deepEqual(advancedAtlas.uv.atlasPixelPadding,{resolution:1024,pixels:4});
 const hollowProfile=JSON.parse(fs.readFileSync(path.join(first.folder,
  'GeometryGraph/Profiles/HollowProfile.json'),'utf8'));
 assert.equal(hollowProfile.holes.length,2);
 assert.equal(hollowProfile.points.length,4);
 const multiProfile=JSON.parse(fs.readFileSync(path.join(first.folder,
  'GeometryGraph/Profiles/MultiContourProfile.json'),'utf8'));
 assert.equal(multiProfile.outerContours.length,2);
 const multiHollow=JSON.parse(fs.readFileSync(path.join(first.folder,
  'GeometryGraph/Profiles/MultiHollowProfile.json'),'utf8'));
 assert.equal(multiHollow.holes.length,1);
 assert.deepEqual(multiHollow.outerHoles.map(list=>list.length),[1,1]);
 const priority=JSON.parse(fs.readFileSync(path.join(first.folder,'GeometryGraph/Profiles/UVAtlasPriorityProfile.json'),'utf8'));
 assert.deepEqual(priority.uv.atlasPriority,{outer:2,inner:.5,cap:1});
 const uvExample=JSON.parse(fs.readFileSync(path.join(first.folder,
  'GeometryGraph/Profiles/UVSeamProfile.json'),'utf8'));
 assert.equal(uvExample.format,'cocos-splines/profile');
 assert.equal(uvExample.uv.seamEdge,2);
 assert.deepEqual(uvExample.uv.edgeWeights,[1,2,1,1]);
 assert.equal(uvExample.uv.edgeWeights.length,uvExample.points.length);
 const metricExample=JSON.parse(fs.readFileSync(path.join(first.folder,
  'GeometryGraph/Profiles/UVMetricProfile.json'),'utf8'));
 assert.equal(metricExample.format,'cocos-splines/profile');
 assert.equal(metricExample.version,1);
 assert.equal(metricExample.uv.seamEdge,2);
 assert.deepEqual(metricExample.uv.edgeWeights,[1,2,1,1]);
 assert.equal(metricExample.uv.uMetersPerRepeat,1.5);
 assert.equal(metricExample.uv.edgeWeights.length,metricExample.points.length);
 const taperExample=JSON.parse(fs.readFileSync(path.join(first.folder,
  'GeometryGraph/Profiles/UVTaperProfile.json'),'utf8'));
 assert.equal(taperExample.uv.uFollowFrameScale,true);
 assert.equal(taperExample.uv.uMetersPerRepeat,1.5);
 assert.equal(taperExample.uv.edgeWeights.length,taperExample.points.length);
 for(const file of ['LProfile','OctagonProfile']){
  const source=JSON.parse(fs.readFileSync(
   path.join(first.folder,'GeometryGraph/Profiles/'+file+'.json'),'utf8'));
  assert.equal(source.format,'cocos-splines/profile');
  assert.equal(source.version,1);
  assert(source.points.length>=3&&source.points.length<=16);
 }
 const deform=JSON.parse(fs.readFileSync(
   path.join(first.folder,'GeometryGraph/BasicMeshDeformGraph.json'),'utf8'));
 assert.equal(deform.version,1);
 assert.deepEqual(deform.nodes.map(n=>n.type),
   ['spline','offset','width','meshDeform','output']);
 assert.equal(deform.nodes.find(n=>n.type==='meshDeform').repeats,4);
 const multi=JSON.parse(fs.readFileSync(
   path.join(first.folder,'GeometryGraph/MultiOutputRoadTubeGraph.json'),'utf8'));
 assert.equal(multi.version,2);
 assert.equal(multi.output,'outputRoad');
 assert.deepEqual(multi.nodes.filter(n=>n.type==='output').map(n=>n.id),
   ['outputRoad','outputPipe']);
 assert.deepEqual(multi.nodes.filter(n=>['ribbon','tube'].includes(n.type)).map(n=>n.type),
   ['ribbon','tube']);
 const imported=JSON.parse(fs.readFileSync(
   path.join(first.folder,'GeometryGraph/ImportedMeshDeformGraph.json'),'utf8'));
 assert.equal(imported.version,1);
 assert.equal(imported.nodes.find(n=>n.type==='meshDeform').meshInput,'meshAsset');
 assert.equal(imported.nodes.find(n=>n.type==='meshAsset').id,'meshAsset');
 const dual=JSON.parse(fs.readFileSync(
   path.join(first.folder,'GeometryGraph/DualMeshAxisGraph.json'),'utf8'));
 assert.equal(dual.version,2);
 assert.deepEqual(dual.nodes.filter(n=>n.type==='meshAsset').map(n=>n.slot),[0,1]);
 assert.deepEqual(dual.nodes.filter(n=>n.type==='meshDeform').map(n=>n.axis),[0,1]);
 assert.deepEqual(dual.nodes.filter(n=>n.type==='output').map(n=>n.id),
   ['outputA','outputB']);
 const trim=JSON.parse(fs.readFileSync(
   path.join(first.folder,'GeometryGraph/SourceLengthTrimGraph.json'),'utf8'));
 assert.equal(trim.version,1);
 const trimNode=trim.nodes.find(n=>n.type==='meshDeform');
 assert.equal(trimNode.repeatLayout,1);
 assert.equal(trimNode.tileLength,0);
 assert.equal(trimNode.uvMode,0);
 assert.equal(trimNode.meshInput,'meshAsset');
 const submeshGraph=JSON.parse(fs.readFileSync(
   path.join(first.folder,'GeometryGraph/SubMeshSelectionGraph.json'),'utf8'));
 assert.equal(submeshGraph.version,2);
 assert.deepEqual(submeshGraph.nodes.filter(n=>n.type==='meshAsset').map(n=>n.slot),[0,1]);
 assert.deepEqual(submeshGraph.nodes.filter(n=>n.type==='output').map(n=>n.id),
   ['outputA','outputB']);
 const allOutputs=JSON.parse(fs.readFileSync(
   path.join(first.folder,'GeometryGraph/MultiMaterialOutputsGraph.json'),'utf8'));
 assert.equal(allOutputs.version,2);
 assert.equal(allOutputs.output,'outputRoad');
 assert.deepEqual(allOutputs.nodes.filter(n=>n.type==='output')
   .map(n=>n.id).sort(),['outputExtrude','outputRoad','outputTube']);
 assert.deepEqual(allOutputs.nodes.filter(n=>
   ['ribbon','tube','extrude'].includes(n.type)).map(n=>n.type),
   ['ribbon','tube','extrude']);
 const custom=path.join(first.folder,'ExampleGallery.ts');
 fs.appendFileSync(custom,'\n// USER MODIFICATION PRESERVED\n');
 const second=installSplineExamples({projectPath:project,extensionRoot:root});
 assert.equal(second.installed,0);
 assert.equal(second.skipped,EXAMPLE_FILES.length);
 assert(fs.readFileSync(custom,'utf8').includes('USER MODIFICATION PRESERVED'));
 // Partial re-install only restores missing files, never rewrites user changes.
 fs.unlinkSync(path.join(first.folder,'Road/RoadUvSetup.ts'));
 const third=installSplineExamples({projectPath:project,extensionRoot:root});
 assert.equal(third.installed,1);
 assert.equal(third.skipped,EXAMPLE_FILES.length-1);
 assert(fs.readFileSync(custom,'utf8').includes('USER MODIFICATION PRESERVED'));
 // Upgrade ONLY an unchanged legacy gallery, retaining Creator's .meta
 // UUID for serialized Scene components. Never replace a user-edited file.
 const galleryProject=path.join(temp,'Pristine Gallery Project');
 const galleryAssets=path.join(galleryProject,'assets');
 const galleryFolder=path.join(galleryAssets,EXAMPLE_FOLDER);
 fs.mkdirSync(galleryFolder,{recursive:true});
 const legacy=fs.readFileSync(path.join(root,
  'tests/fixtures/ExampleGallery-v2-legacy.ts'));
 const legacyPath=path.join(galleryFolder,'ExampleGallery.ts');
 fs.writeFileSync(legacyPath,legacy);
 const galleryMeta='{"ver":"4.0.24","uuid":"existing-scene-script-uuid"}';
 fs.writeFileSync(legacyPath+'.meta',galleryMeta);
 const upgraded=installSplineExamples({projectPath:galleryProject,extensionRoot:root});
 assert.equal(upgraded.updated,1,'Pristine legacy gallery should be upgraded');
 assert.deepEqual(upgraded.updatedFiles,['ExampleGallery.ts']);
 assert.equal(upgraded.installed,EXAMPLE_FILES.length-1);
 assert.equal(upgraded.skipped,0);
 assert.equal(fs.readFileSync(legacyPath+'.meta','utf8'),galleryMeta);
 const upgradedSource=fs.readFileSync(legacyPath,'utf8');
 assert(upgradedSource.includes('GeometryGraphUVAtlas=13'));
 assert(upgradedSource.includes('GeometryGraphTriangleUV=14'));
 const idempotent=installSplineExamples({projectPath:galleryProject,extensionRoot:root});
 assert.equal(idempotent.updated,0);
 assert.equal(idempotent.installed,0);
 assert.equal(idempotent.skipped,EXAMPLE_FILES.length);
 fs.writeFileSync(legacyPath,Buffer.concat([legacy,Buffer.from('\n// USER CODE\n')]));
 const customized=installSplineExamples({projectPath:galleryProject,extensionRoot:root});
 assert.equal(customized.updated,0);
 assert.equal(customized.skipped,EXAMPLE_FILES.length);
 assert(fs.readFileSync(legacyPath,'utf8').includes('// USER CODE'));
 assert.equal(fs.readFileSync(legacyPath+'.meta','utf8'),galleryMeta);
 // A clean 14-mode Gallery from the immediately preceding build is also
 // eligible for safe upgrade without losing the component's existing UUID.
 const priorProject=path.join(temp,'Previous UV Atlas Gallery Project');
 const priorFolder=path.join(priorProject,'assets',EXAMPLE_FOLDER);
 fs.mkdirSync(priorFolder,{recursive:true});
 const previousPath=path.join(priorFolder,'ExampleGallery.ts');
 const previous=fs.readFileSync(path.join(root,
  'tests/fixtures/ExampleGallery-v2-uv-atlas.ts'));
 fs.writeFileSync(previousPath,previous);
 fs.writeFileSync(previousPath+'.meta',galleryMeta);
 const previousResult=installSplineExamples({projectPath:priorProject,extensionRoot:root});
 assert.equal(previousResult.updated,1);
 assert.equal(fs.readFileSync(previousPath+'.meta','utf8'),galleryMeta);
 assert(fs.readFileSync(previousPath,'utf8').includes('GeometryGraphTriangleUV=14'));
 assert.equal(installSplineExamples({projectPath:priorProject,extensionRoot:root}).updated,0);
 fs.writeFileSync(previousPath,Buffer.concat([previous,Buffer.from('\n// project edit\n')]));
 const untouched=installSplineExamples({projectPath:priorProject,extensionRoot:root});
 assert.equal(untouched.updated,0);
 assert(fs.readFileSync(previousPath,'utf8').includes('project edit'));
 // Cocos 3.8.8 reported undefined type metadata for the four Boolean
 // fields in the original Train scripts. Upgrade only exact legacy bytes.
 const trainProject=path.join(temp,'Legacy Train Project');
 const trainFolder=path.join(trainProject,'assets',EXAMPLE_FOLDER,'Train');
 fs.mkdirSync(trainFolder,{recursive:true});
 const scripts={
  'TrainSingleSpline.ts':['wrapClosed'],
  'TrainRouteConsist.ts':['backwards','loopRoute','playOnStart'],
 };
 const originalTrains={};
 for(const [name,fields] of Object.entries(scripts)){
  const current=fs.readFileSync(path.join(root,'docs/examples',name),'utf8');
  assert.match(current,/import \{ _decorator, CCBoolean,/);
  assert(!current.includes('@property()'));
  for(const field of fields)
   assert(current.includes('@property({ type: CCBoolean }) '+field+': boolean = '));
  const old=current.replace(' _decorator, CCBoolean,',' _decorator,')
   .replace(/@property\(\{ type: CCBoolean \}\) (\w+): boolean = /g,'@property() $1 = ');
  originalTrains[name]=old;
  fs.writeFileSync(path.join(trainFolder,name),old);
  fs.writeFileSync(path.join(trainFolder,name+'.meta'),galleryMeta);
 }
 const trainUpgrade=installSplineExamples({projectPath:trainProject,extensionRoot:root});
 assert.equal(trainUpgrade.updated,2);
 assert.deepEqual(trainUpgrade.updatedFiles,['Train/TrainSingleSpline.ts','Train/TrainRouteConsist.ts']);
 for(const name of Object.keys(scripts)){
  assert.equal(fs.readFileSync(path.join(trainFolder,name),'utf8'),
   fs.readFileSync(path.join(root,'docs/examples',name),'utf8'));
  assert.equal(fs.readFileSync(path.join(trainFolder,name+'.meta'),'utf8'),galleryMeta);
 }
 assert.equal(installSplineExamples({projectPath:trainProject,extensionRoot:root}).updated,0);
 // Modified scripts must never be overwritten, even if their decorators are old.
 for(const name of Object.keys(scripts))
  fs.writeFileSync(path.join(trainFolder,name),originalTrains[name]+'\n// user customization\n');
 assert.equal(installSplineExamples({projectPath:trainProject,extensionRoot:root}).updated,0);
 for(const name of Object.keys(scripts)){
  assert(fs.readFileSync(path.join(trainFolder,name),'utf8').includes('// user customization'));
  assert.equal(fs.readFileSync(path.join(trainFolder,name+'.meta'),'utf8'),galleryMeta);
 }
 // Directories must never be allowed to escape via symlinks.
 fs.rmSync(path.join(first.folder,'Train'),{recursive:true,force:true});
 const outside=path.join(temp,'outside');fs.mkdirSync(outside);
 fs.symlinkSync(outside,path.join(first.folder,'Train'),'dir');
 assert.throws(()=>installSplineExamples({projectPath:project,extensionRoot:root}),
   /real directory|Unsafe/);
 assert.equal(fs.readdirSync(outside).length,0);
 fs.unlinkSync(path.join(first.folder,'Train'));
 fs.symlinkSync(outside,path.join(first.folder,'README.md')+'.evil');
 // Even the Assets root must be a normal project directory.
 const unsafe=path.join(temp,'Unsafe Project');
 fs.mkdirSync(unsafe);
 fs.symlinkSync(assets,path.join(unsafe,'assets'),'dir');
 assert.throws(()=>installSplineExamples({projectPath:unsafe,extensionRoot:root}),
   /real directory/);
 assert.throws(()=>installSplineExamples({projectPath:'relative-path',extensionRoot:root}),
   /project path/);
 const empty=path.join(temp,'Empty Project');fs.mkdirSync(empty);
 assert.throws(()=>installSplineExamples({projectPath:empty,extensionRoot:root}),
   /ENOENT/);
 assert.equal(fs.existsSync(path.join(empty,'assets')),false);
 // Main-menu dispatch must install into the ACTIVE Editor.Project.path only.
 const other=path.join(temp,'Another Project');
 fs.mkdirSync(path.join(other,'assets'),{recursive:true});
 const messages=[];
 global.Editor={
   Project:{path:other},
   Selection:{getSelected:()=>[]},
   Message:{
     send(...args){messages.push(args);},
     request:async()=>{throw Error('Unexpected scene mutation during installation');},
   },
 };
 const {methods}=require('../dist/main.js');
 (async()=>{
   const result=await methods.installExamples();
   assert(result.ok,result.message);
   assert.equal(result.installed,EXAMPLE_FILES.length);
   assert.equal(result.updated,0);
   assert.deepEqual(messages,[['asset-db','refresh-asset','db://assets']]);
   const again=await methods.installExamples();
   assert(again.ok&&!again.installed);
   assert.equal(messages.length,2);
   assert(fs.existsSync(path.join(other,'assets',EXAMPLE_FOLDER,'ExampleGallery.ts')));
   const manifest=require('../package.json').contributions;
   assert.deepEqual(manifest.messages['install-examples'].methods,['installExamples']);
   assert(manifest.menu.some(m=>m.label==='Install Examples'&&m.message==='install-examples'));
   console.log('INSTALL EXAMPLES PASS: menu, content, safe copy, re-install, non-overwrite, symlink/path checks, asset refresh.');
 })().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
}catch(error){fs.rmSync(temp,{recursive:true,force:true});throw error;}
