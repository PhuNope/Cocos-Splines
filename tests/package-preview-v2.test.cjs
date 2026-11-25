'use strict';
/** CI packaging contract: artifact contents are extension files, not a ZIP.
 * upload-artifact@v4 then supplies the SINGLE outer downloadable ZIP.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const stage=path.join(root,'builds','cocos-splines');
const pkg=require(root+'/package.json');
assert(fs.statSync(stage).isDirectory(),'Preview package must be an installable folder');
const manifest=JSON.parse(fs.readFileSync(path.join(stage,'package.json'),'utf8'));
assert.equal(manifest.name,'cocos-splines');
assert.equal(manifest.version,pkg.version);
assert.equal(manifest.main,'./dist/main.js');
assert(fs.statSync(path.join(stage,'dist','main.js')).isFile());
assert(fs.statSync(path.join(stage,'dist','scene.js')).isFile());
assert(fs.statSync(path.join(stage,'assets','splines','Core','SplineKnot.ts.meta')).isFile());
const build=fs.readFileSync(path.join(stage,'PREVIEW_BUILD.txt'),'utf8');
const sha=process.env.BUILD_SHA||process.env.GITHUB_SHA||'local';
assert(build.includes('Commit: '+sha));
assert(build.includes('one GitHub Actions ZIP')||build.includes('ONE ZIP')||
 build.includes('ONE downloadable ZIP')||build.includes('ONE ZIP layer')||
 build.includes('ONE ZIP. No ZIP'));
const check=dir=>{
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  const abs=path.join(dir,item.name);
  assert(!item.isSymbolicLink(),'No package symlinks: '+abs);
  if(item.isDirectory())check(abs);
  else{
   assert(item.isFile(),'Regular package files only: '+abs);
   assert(!/\.(zip|7z|tar|tgz|gz|rar)$/i.test(item.name),
    'No archive file inside outer GitHub Artifact ZIP: '+abs);
  }
 }
};
check(stage);
for(const forbidden of ['node_modules','.git','.github','tests','src','builds'])
 assert(!fs.existsSync(path.join(stage,forbidden)),forbidden+' cannot ship');
assert(!fs.readdirSync(path.join(root,'builds')).some(n=>n.endsWith('.zip')),
 'No preview ZIP should be generated prior to GitHub upload-artifact');
console.log('SINGLE-LAYER PREVIEW PASS: stage is directly installable, no nested archives.');
