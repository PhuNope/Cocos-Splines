const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const rel of ['src/main.js','src/scene.js',
 'src/contributions/inspector/common.js','src/contributions/inspector/Container.js',
 'src/contributions/inspector/Knot.js','src/contributions/inspector/Road.js','src/contributions/inspector/Trigger.js','src/contributions/inspector/Junction.js','src/contributions/inspector/Animate.js',
 'src/contributions/inspector/Extrude.js','src/contributions/inspector/Instantiate.js','src/contributions/inspector/Path2D.js','src/contributions/inspector/MeshDeform.js','src/contributions/inspector/Positioner.js','src/contributions/inspector/Projector.js','src/contributions/inspector/LengthMonitor.js',
 'src/contributions/inspector/Modifiers.js','src/contributions/inspector/ObjectController.js',
 'src/contributions/inspector/Bender.js','src/contributions/inspector/Morph.js',
 'src/contributions/inspector/JunctionMesh.js','src/contributions/inspector/RoadV2.js']){
 const target=rel.replace(/^src\//,'dist/');
 fs.mkdirSync(path.dirname(path.join(root,target)),{recursive:true});
 fs.copyFileSync(path.join(root,rel),path.join(root,target));
}
console.log('Editor JavaScript copied to dist/');
