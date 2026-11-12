'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const pkg=require(path.join(root,'package.json'));
assert.equal(pkg.name,'cocos-splines');assert.equal(pkg.editor,'>=3.8.2');
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
for(const name of ['ProfileSweep','RoadStrip','RoadCorners','RoadOverlapClip','RoadContinuous','RoadFillet','RoadMarkings','SourceMeshRead','SourceMeshDeform','GltfExporter']) {
 checkRel('assets/splines-v2/geometry/'+name+'.ts');
 checkRel('assets/splines-v2/geometry/'+name+'.ts.meta');
}
checkRel('assets/splines-v2/Components/SplineExtrudeV2.ts');
checkRel('assets/splines-v2/Components/SplineExtrudeV2.ts.meta');
checkRel('assets/splines-v2/Components/SplineMeshDeformV2.ts');
checkRel('assets/splines-v2/Components/SplineMeshDeformV2.ts.meta');
console.log('VERIFY PASS: Editor manifest, scripts, asset DB and UUID metadata.');
