'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const pkg=require(path.join(root,'package.json'));
assert.equal(pkg.name,'cocos-splines');assert.equal(pkg.editor,'>=3.8.2');
assert.equal(pkg.cocosSplines?.requiredExtensions?.['cocos-gizmos'],'>=3.0.2',
    'Cocos-Gizmos extension is a REQUIRED Editor dependency');
assert.deepEqual(pkg.cocosSplines?.requiredSceneApi?.slice(0,2),
    ['Gizmos3D.move','Gizmos3D.rotate']);
function checkRel(p){assert(fs.existsSync(path.join(root,p)),`Missing ${p}`);}
checkRel(pkg.main);checkRel(pkg.contributions.scene.script);if(pkg.panels)throw new Error('No standalone spline panel should ship');
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
for(const name of ['ProfileSweep','RoadStrip','RoadCorners','RoadOverlapClip','RoadContinuous','RoadFillet','RoadMarkings','SourceMeshRead','SourceMeshDeform','RoadJunctionTrim','JunctionPatchV2','JunctionProfilePatchV2','JunctionMarkingsV2','GltfExporter']) {
 checkRel('assets/splines-v2/geometry/'+name+'.ts');
 checkRel('assets/splines-v2/geometry/'+name+'.ts.meta');
}
checkRel('assets/splines-v2/Editor/SplineGizmoHandler.ts');
checkRel('assets/splines-v2/Editor/SplineGizmoHandler.ts.meta');
for(const component of ['Path','Road','Junction']){
    const name=component==='Junction'?'SplineJunctionGizmos':'Spline'+component+'Gizmos';
    checkRel('assets/splines-v2/Editor/'+name+'.ts');
    checkRel('assets/splines-v2/Editor/'+name+'.ts.meta');
}
assert(!fs.existsSync(path.join(root,
    'assets/splines-v2/Components/SplineGizmoHandler.ts')),
    'Do not retain the component-level Editor adapter');
assert(!fs.existsSync(path.join(root,
    'assets/splines-v2/Components/SplineGizmoBridge.ts')),
    'Retired SDK bridge must be deleted');
checkRel('assets/splines-v2/Components/SplineExtrude.ts');
checkRel('assets/splines-v2/Components/SplineExtrude.ts.meta');
checkRel('assets/splines-v2/Components/SplineMeshDeform.ts');
checkRel('assets/splines-v2/Components/SplineMeshDeform.ts.meta');
checkRel('assets/splines-v2/Components/JunctionPatch.ts');
checkRel('assets/splines-v2/Components/JunctionPatch.ts.meta');
checkRel('assets/splines-v2/geometry/SplineRoadNetworkV2.ts');
checkRel('assets/splines-v2/geometry/SplineRoadNetworkV2.ts.meta');
checkRel('src/v2/PathKnotDumpCodec.js');
checkRel('src/v2/PathGroupNudgeDump.js');
checkRel('src/v2/PathEndpointSnapDump.js');
checkRel('src/v2/JunctionAutoConnectDump.js');
checkRel('assets/splines-v2/geometry/JunctionAutoConnectV2.ts');
checkRel('assets/splines-v2/geometry/JunctionAutoConnectV2.ts.meta');
checkRel('assets/splines-v2/geometry/JunctionTangentAlignV2.ts');
checkRel('assets/splines-v2/geometry/JunctionTangentAlignV2.ts.meta');
checkRel('src/v2/JunctionTangentDump.js');
checkRel('assets/splines-v2/geometry/JunctionSeamAuditV2.ts');
checkRel('assets/splines-v2/geometry/JunctionSeamAuditV2.ts.meta');
checkRel('assets/splines-v2/geometry/JunctionAsphaltOverlapV2.ts');
checkRel('assets/splines-v2/geometry/JunctionAsphaltOverlapV2.ts.meta');
checkRel('assets/splines-v2/geometry/JunctionInteriorUVV2.ts');
checkRel('assets/splines-v2/geometry/JunctionInteriorUVV2.ts.meta');
console.log('VERIFY PASS: Editor manifest, scripts, asset DB and UUID metadata.');
