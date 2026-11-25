'use strict';
/**
 * Stages a TEST-ONLY, directly installable Cocos Creator extension directory.
 * GitHub Actions upload-artifact creates the ONE downloadable ZIP.
 * DO NOT generate a ZIP here: uploading it would wrap ZIP inside another ZIP.
 * No Git tags, releases, asset publishing or native Editor interactions.
 */
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pkg=require(path.join(root,'package.json'));
const rawSha=process.env.BUILD_SHA||process.env.GITHUB_SHA||'';
const sha=/^[0-9a-f]{7,40}$/i.test(rawSha)?rawSha.toLowerCase():'local';
const outputDir=path.join(root,'builds');
const extension=path.join(outputDir,'cocos-splines');
const allowed=[
    'package.json','README.md','README_VI.md','CHANGELOG.md','LICENSE',
    'assets','dist','docs','examples',
];
const required=[
    'package.json','dist/main.js','dist/scene.js',
    'assets/splines/Core/SplineKnot.ts',
    'assets/splines/Editor/SplineKnotGizmos.ts',
    'dist/SplineExampleInstaller.js','examples/installable/ExampleGallery.ts',
];
function checkPackageTree(base){
    const pending=[base];
    while(pending.length){
        const dir=pending.pop();
        for(const item of fs.readdirSync(dir,{withFileTypes:true})){
            const file=path.join(dir,item.name);
            if(item.isSymbolicLink())throw Error('Preview contains a symlink: '+file);
            if(item.isDirectory())pending.push(file);
            else if(!item.isFile())throw Error('Preview contains unsupported file: '+file);
            else if(/\.(?:zip|7z|rar|tar|tgz|gz)$/i.test(item.name))
                throw Error('Nested archive is not allowed inside preview: '+file);
        }
    }
}
fs.mkdirSync(outputDir,{recursive:true});
// Always start clean: stale files cannot leak into the installable extension.
fs.rmSync(extension,{recursive:true,force:true});
fs.mkdirSync(extension,{recursive:true});
for(const entry of allowed){
    const src=path.join(root,entry);
    if(!fs.existsSync(src))throw Error('Missing preview build input: '+entry);
    fs.cpSync(src,path.join(extension,entry),{recursive:true});
}
for(const file of required)
    if(!fs.statSync(path.join(extension,file)).isFile())
        throw Error('Incomplete preview: '+file);
fs.writeFileSync(path.join(extension,'PREVIEW_BUILD.txt'),[
    'Cocos Splines V2 — TEST BUILD ONLY',
    'Branch: v2',
    'Commit: '+sha,
    'Extension package version: '+pkg.version,
    'Cocos-Gizmos v3.0.3+ or matching development build is required.',
    'Download is one GitHub Actions ZIP. No ZIP is nested inside this package.',
    'Extract the downloaded ZIP directly into <project>/extensions/cocos-splines/.',
    'No tag or release has been created.',
    'Native Cocos Creator Editor acceptance is not yet certified.',
    '',
].join('\n'));
checkPackageTree(extension);
console.log('V2 SINGLE-LAYER PREVIEW: '+extension);
console.log('GitHub Actions uploads this directory as ONE ZIP; it contains no ZIP.');
