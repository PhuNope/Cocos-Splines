'use strict';
/** Smoke-test the ACTUAL GitHub Artifact after download-artifact has extracted
 * its one ZIP layer. There must be an installable extension ROOT directly;
 * a second ZIP or an extra extension/ directory fails this test.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const artifact=path.join(root,'builds','artifact-smoke');
assert(fs.existsSync(artifact),'Preview artifact was not downloaded');
const pkgPath=path.join(artifact,'package.json');
assert(fs.existsSync(pkgPath),
 'Artifact requires a SECOND unzip or wrong folder level: missing root package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
assert.equal(pkg.name,'cocos-splines');
assert.equal(pkg.main,'./dist/main.js');
for(const item of ['dist/main.js','dist/scene.js','assets/splines/Core/SplineKnot.ts.meta',
 'PREVIEW_BUILD.txt']){
 assert(fs.statSync(path.join(artifact,item)).isFile(),
  'Missing extension file after exactly one unzip: '+item);
}
const manifest=fs.readFileSync(path.join(artifact,'PREVIEW_BUILD.txt'),'utf8');
assert(manifest.includes('Commit: '+(process.env.GITHUB_SHA||'local')));
function walk(dir){
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,item.name);
  assert(!item.isSymbolicLink(),'Symlink in downloaded artifact: '+file);
  if(item.isDirectory())walk(file);
  else{
   assert(item.isFile(),'Non-file in downloaded artifact: '+file);
   assert(!/\.(zip|tar|gz|tgz|7z|rar)$/i.test(item.name),
    'Found a NESTED archive after one unzip: '+file);
  }
 }
}
walk(artifact);
assert(!fs.existsSync(path.join(artifact,'cocos-splines','package.json')),
 'Double folder nesting after download is not installable');
console.log('PREVIEW ARTIFACT ONE-ZIP ROUNDTRIP PASS: package.json at extracted root, no inner ZIP or extra folder.');
