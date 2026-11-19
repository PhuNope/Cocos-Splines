'use strict';
/** Strict v2-only installation and source layout invariants. */
const fs=require('node:fs'),path=require('node:path'),
 assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
const exists=(p)=>fs.existsSync(path.join(root,p));
const file=(p)=>assert(exists(p),'Missing V2 source '+p);
assert.equal(pkg.name,'cocos-splines');
assert.equal(pkg.editor,'>=3.8.2');
assert.match(pkg.version,/^2\.0\.0/);
assert.equal(pkg.main,'./dist/v2/clean-main.js');
assert.equal(pkg.contributions.scene.script,'./dist/v2/clean-scene.js');
assert.equal(pkg.contributions['asset-db'].mount.path,'./assets');
assert.equal(pkg.cocosSplines?.requiredExtensions?.['cocos-gizmos'],'>=3.0.2');
assert(!pkg.panels&&!pkg.contributions.menu,
 'No standalone legacy Spline panel/menu');
assert(Object.keys(pkg.contributions.inspector.section.node)
 .every(k=>/^Spline\.(Path|Road|Extrude|MeshDeform|Junction)$/.test(k)));
assert(Object.keys(pkg.contributions.messages).every(k=>k.includes('-v2-')));
for(const entry of [pkg.main,pkg.contributions.scene.script,
 ...Object.values(pkg.contributions.inspector.section.node)])file(entry);
for(const name of ['Path','Road','Extrude','MeshDeform','Junction']){
 const f=name==='Junction'?'JunctionPatch':'Spline'+name;
 file('assets/splines-v2/Components/'+f+'.ts');
 file('assets/splines-v2/Components/'+f+'.ts.meta');
}
for(const name of ['SplineFollower','SplineProjector','MeshGenerator',
 'GeometrySettings']){
 file('assets/splines-v2/Components/'+name+'.ts');
 file('assets/splines-v2/Components/'+name+'.ts.meta');
}
for(const name of ['SplineProjection','SplineTraversal']){
 file('src-v2/core/'+name+'.ts');
 file('assets/splines-v2/core/'+name+'.ts');
 file('assets/splines-v2/core/'+name+'.ts.meta');
 assert.equal(fs.readFileSync(path.join(root,'src-v2/core/'+name+'.ts'),'utf8'),
  fs.readFileSync(path.join(root,'assets/splines-v2/core/'+name+'.ts'),'utf8'),
  'Duplicated engine-local source drift '+name);
}
for(const name of ['SplinePathGizmos','SplineRoadGizmos',
 'SplineJunctionGizmos','SplineGizmoHandler']){
 file('assets/splines-v2/Editor/'+name+'.ts');
 file('assets/splines-v2/Editor/'+name+'.ts.meta');
}
for(const p of ['assets/splines-v2.meta','assets/splines-v2/Editor.meta',
 'dist/contributions/inspector/common.js'])file(p);
for(const p of ['assets/splines','assets/splines.meta','src/main.js',
 'src/scene.js','dist/main.js','dist/scene.js','scripts/release.cjs',
 'tsconfig.runtime.json','docs/index.html',
 'assets/splines-v2/Components/SplineGizmoHandler.ts']){
 assert(!exists(p),'Legacy file remains in clean V2 repository: '+p);
}
for(const p of ['src/v2/PathV2Dump.js','src/v2/clean-main.js',
 'src/v2/clean-scene.js','src/v2/EditorAssetBind.js'])file(p);
const seen=new Set();
const walk=(directory)=>{
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const target=path.join(directory,entry.name);
  if(entry.isDirectory())walk(target);
  else if(entry.name.endsWith('.meta')){
   const meta=JSON.parse(fs.readFileSync(target,'utf8'));
   if(!meta.uuid)continue;
   assert(!seen.has(meta.uuid),'Duplicated asset UUID '+meta.uuid);
   seen.add(meta.uuid);
  }
 }
};
walk(path.join(root,'assets'));
console.log('VERIFY PASS: clean V2 layout, component metadata, official Gizmos decorator and no legacy runtime.');
