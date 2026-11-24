const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const rel of ['src/main.js','src/scene.js',
 'src/contributions/inspector/common.js','src/contributions/inspector/Container.js',
 'src/contributions/inspector/Knot.js','src/contributions/inspector/Road.js','src/contributions/inspector/Trigger.js','src/contributions/inspector/Junction.js','src/contributions/inspector/TrafficController.js','src/contributions/inspector/Animate.js',
 'src/contributions/inspector/Extrude.js','src/contributions/inspector/Instantiate.js','src/contributions/inspector/Path2D.js','src/contributions/inspector/MeshDeform.js','src/contributions/inspector/Positioner.js','src/contributions/inspector/Projector.js','src/contributions/inspector/LengthMonitor.js',
 'src/contributions/inspector/Modifiers.js','src/contributions/inspector/ObjectController.js',
 'src/contributions/inspector/Bender.js','src/contributions/inspector/Morph.js',
 'src/contributions/inspector/JunctionMesh.js','src/SplineKnotEditMath.js','src/SplineConnectionMath.js','src/SplineJunctionTangentMath.js','src/SplineExampleInstaller.js','src/SplineExampleScene.js','src/SplineExampleSceneWorkflow.js','src/SplineJunctionTangentTransaction.js','src/SplineJunctionModeMath.js','src/SplineJunctionJoinMath.js','src/SplineJunctionSeamMath.js','src/SplineJunctionFanoutMath.js','src/SplineJunctionFanoutEditor.js','src/SplineJunctionRouteMath.js','src/SplineRouteSliceMath.js','src/SplineJunctionRouteEditor.js','src/SplineJunctionConversionTransaction.js','src/SplineJunctionScene.js','src/SplineTopologyCopyMath.js','src/SplineTopologyCopyPolicy.js','src/SplineSurfaceSnapMath.js','src/SplineColliderSnapMath.js','src/SplineBatchEditTransaction.js']){
 const target=rel.replace(/^src\//,'dist/');
 fs.mkdirSync(path.dirname(path.join(root,target)),{recursive:true});
 fs.copyFileSync(path.join(root,rel),path.join(root,target));
}
console.log('Editor JavaScript copied to dist/');
