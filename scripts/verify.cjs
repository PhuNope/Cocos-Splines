'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const pkg=require(path.join(root,'package.json'));
assert.equal(pkg.name,'cocos-splines');assert.equal(pkg.editor,'>=3.8.2');
function checkRel(p){assert(fs.existsSync(path.join(root,p)),`Missing ${p}`);}
checkRel(pkg.main);checkRel(pkg.contributions.scene.script);
checkRel('dist/SplineExampleInstaller.js');
checkRel('dist/SplineGeometryGraphVisualModel.js');
checkRel('dist/contributions/inspector/GeometryGraph.js');
checkRel('assets/splines/Core/SplineGeometryGraph.ts');
checkRel('assets/splines/Core/SplineGeometryGraph.ts.meta');
checkRel('assets/splines/Components/SplineGeometryGraphRenderer.ts');
checkRel('assets/splines/Components/SplineGeometryGraphRenderer.ts.meta');
assert.deepEqual(pkg.contributions.messages['rebuild-geometry-graph']?.methods,['rebuildGeometryGraph']);
checkRel('dist/SplineSvgConverter.js');
checkRel('dist/SplineJsonInterop.js');
checkRel('dist/contributions/inspector/Noise.js');
checkRel('assets/splines/Core/SplineNoiseMath.ts');
checkRel('assets/splines/Core/SplinePopulationMath.ts');
checkRel('assets/splines/Core/SplinePopulationMath.ts.meta');
checkRel('assets/splines/Core/SplinePopulationPlacementMath.ts');
checkRel('assets/splines/Core/SplinePopulationPlacementMath.ts.meta');
checkRel('assets/splines/Core/SplinePopulationSurfaceMath.ts');
checkRel('assets/splines/Core/SplinePopulationSurfaceMath.ts.meta');
checkRel('assets/splines/Core/SplinePopulationPreciseMath.ts');
checkRel('assets/splines/Core/SplinePopulationPreciseMath.ts.meta');
checkRel('assets/splines/Core/SplinePrefabFootprintMath.ts');
checkRel('assets/splines/Core/SplinePrefabFootprintMath.ts.meta');
checkRel('assets/splines/Core/SplineSharedOccupancyMath.ts');
checkRel('assets/splines/Core/SplineSharedOccupancyMath.ts.meta');
checkRel('assets/splines/Core/SplinePlacementDiagnostics.ts');
checkRel('assets/splines/Core/SplinePlacementDiagnostics.ts.meta');
assert.deepEqual(pkg.contributions.messages['query-placement-summary']?.methods,['queryPlacementSummary']);
checkRel('assets/splines/Editor/SplinePlacementGizmos.ts');
checkRel('assets/splines/Editor/SplinePlacementGizmos.ts.meta');
checkRel('assets/splines/Core/SplineMeshColliderAdapter.ts');
checkRel('assets/splines/Core/SplineProximityMesh.ts');
checkRel('assets/splines/Components/SplineNoise.ts');
assert.deepEqual(pkg.contributions.messages['create-noise-layers']?.methods,['createNoiseLayers']);
assert(pkg.contributions.menu.some(m=>m.message==='create-noise-layers'));
assert.equal(pkg.contributions.inspector.section.node['Splines.SplineNoise'],'./dist/contributions/inspector/Noise.js');
assert.deepEqual(pkg.contributions.messages['import-spline-json']?.methods,['importSplineJSON']);
assert.deepEqual(pkg.contributions.messages['export-spline-json']?.methods,['exportSplineJSON']);
assert.deepEqual(pkg.contributions.messages['import-svg']?.methods,['importSVG']);
assert.deepEqual(pkg.contributions.messages['export-svg']?.methods,['exportSVG']);
checkRel('dist/SplineJunctionJoinMath.js');
checkRel('dist/SplineJunctionSeamMath.js');
checkRel('dist/SplineJunctionFanoutMath.js');
checkRel('dist/SplineJunctionFanoutEditor.js');
checkRel('dist/SplineJunctionRouteMath.js');
checkRel('dist/SplineJunctionRouteCost.js');
checkRel('dist/SplineRouteAdmission.js');
checkRel('dist/SplineRouteSliceMath.js');
checkRel('dist/SplineJunctionRouteEditor.js');
assert.deepEqual(pkg.contributions.messages['join-multi-junction-route']?.methods,['joinMultiJunctionRoute']);
assert.deepEqual(pkg.contributions.messages['join-junction-fanout']?.methods,['joinJunctionFanout']);
assert.deepEqual(pkg.contributions.messages['join-junction-links']?.methods,['joinJunctionLinks']);
checkRel('examples/installable/ExampleGallery.ts');
checkRel('examples/installable/README.md');
checkRel('examples/installable/CREATE_GALLERY_IN_SCENE.md');
checkRel('dist/SplineExampleScene.js');
checkRel('dist/SplineExampleSceneWorkflow.js');
assert.deepEqual(pkg.contributions.messages['create-example-gallery']?.methods,
    ['createExampleGallery']);
assert(pkg.contributions.menu.some(m=>m.message==='create-example-gallery'&&
    m.label==='Create Example Gallery in Scene'),'Missing Example Gallery menu');
assert.deepEqual(pkg.contributions.messages['install-examples']?.methods,['installExamples']);
assert(pkg.contributions.menu.some(m=>m.message==='install-examples'&&
    m.label==='Install Examples'),'Missing Install Examples menu item');if(pkg.panels)throw new Error('No standalone spline panel should ship');
checkRel(pkg.contributions['asset-db'].mount.path);
for(const p of Object.values(pkg.contributions.inspector.section.node))checkRel(p);
for(const file of pkg.contributions.messages ? Object.keys(pkg.contributions.messages) : []) {
 assert.match(file,/^[a-z0-9-]+$/);
}
for(const dir of ['Core','Components']){
 const base=path.join(root,'assets/splines',dir);
 for(const name of fs.readdirSync(base).filter(n=>n.endsWith('.ts'))){
  checkRel(`assets/splines/${dir}/${name}.meta`);
  const meta=JSON.parse(fs.readFileSync(path.join(base,name+'.meta'),'utf8'));
  assert.equal(meta.importer,'typescript');assert.match(meta.uuid,/^[\da-f]{8}-/);
 }
}
for(const dir of ['assets','assets/splines','assets/splines/Core','assets/splines/Components'])checkRel(dir+'.meta');
console.log('VERIFY PASS: Editor manifest, scripts, asset DB and UUID metadata.');
