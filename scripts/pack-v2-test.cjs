'use strict';
/**
 * Stage an installable Cocos Creator extension for a GitHub Actions TEST
 * artifact. Does not create tags, GitHub Releases, or publish packages.
 * The repository manifest remains v0.9.12 until the user approves release.
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const buildRoot=path.join(root,'test-build');
const target=path.join(buildRoot,'cocos-splines');
const fullSha=(process.env.GITHUB_SHA||cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim());
assert.match(fullSha,/^[0-9a-f]{40}$/,'A real commit SHA is required for test packaging');
const shortSha=fullSha.slice(0,8);
const version='2.0.0-test.g'+shortSha;
const allowed=['package.json','README.md','README_VI.md','CHANGELOG.md','LICENSE','assets','dist','docs'];
fs.rmSync(buildRoot,{recursive:true,force:true});
fs.mkdirSync(target,{recursive:true});
for(const rel of allowed) {
    const from=path.join(root,rel),to=path.join(target,rel);
    assert(fs.existsSync(from),'Missing required build input: '+rel);
    fs.cpSync(from,to,{recursive:true});
}
const pkgPath=path.join(target,'package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
assert.equal(pkg.name,'cocos-splines');
assert.equal(pkg.editor,'>=3.8.2');
pkg.version=version;
pkg.description='TEST BUILD of Cocos Splines v2, not a stable release. '+pkg.description;
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n','utf8');
const notes=fs.readFileSync(path.join(root,'docs/v2/TEST_BUILD.md'),'utf8');
fs.writeFileSync(path.join(target,'TEST_BUILD.md'),
    '# Cocos Splines '+version+'\n\n'+
    '**Commit:** `'+fullSha+'`  \n'+
    '**Status:** Development test build only; no tag or Release.\n\n'+notes,'utf8');
function assertFile(rel){
    const filename=path.join(target,rel);
    assert(fs.statSync(filename).isFile(),'Missing packaged file: '+rel);
}
assertFile('dist/main.js');
assertFile('dist/scene.js');
assertFile('dist/v2/EditorAssetBind.js');
assertFile('dist/contributions/inspector/RoadV2.js');
assertFile('dist/contributions/inspector/ExtrudeV2.js');
assertFile('assets/splines-v2/Components/SplineRoadV2.ts');
assertFile('assets/splines-v2/Components/SplineRoadV2.ts.meta');
assertFile('assets/splines-v2/Components/SplineExtrudeV2.ts');
assertFile('assets/splines-v2/Components/SplineExtrudeV2.ts.meta');
assertFile('assets/splines-v2/geometry/ProfileSweep.ts');
for(const mapped of Object.values(pkg.contributions.inspector.section.node)){
    assertFile(mapped.replace(/^\.\//,''));
}
assertFile(pkg.main.replace(/^\.\//,''));
assertFile(pkg.contributions.scene.script.replace(/^\.\//,''));
assert.equal(pkg.contributions['asset-db'].mount.path,'./assets');
assert.equal(pkg.contributions['asset-db'].mount.readonly,true);
assert.equal(pkg.contributions.inspector.section.node['SplinesV2.SplineRoad'],
    './dist/contributions/inspector/RoadV2.js');
assert.equal(pkg.contributions.inspector.section.node['SplinesV2.SplineExtrude'],
    './dist/contributions/inspector/ExtrudeV2.js');
const stats={files:0,bytes:0};
function count(current){
    for(const item of fs.readdirSync(current,{withFileTypes:true})){
        const file=path.join(current,item.name);
        if(item.isDirectory())count(file);
        else if(item.isFile()){stats.files++;stats.bytes+=fs.statSync(file).size;}
        else throw new Error('Unexpected package symlink or special file: '+file);
    }
}
count(target);
assert(stats.files>100,'Insufficient number of extension files');
console.log('V2 TEST PACKAGE PASS: version='+version+', commit='+fullSha+
    ', files='+stats.files+', bytes='+stats.bytes);
console.log('GitHub Actions uploads test-build/cocos-splines/ as a downloadable ZIP artifact.');
