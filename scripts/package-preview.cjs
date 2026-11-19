'use strict';
/**
 * Produces a TEST-ONLY Cocos Creator extension ZIP.
 * This script never calls Git, GitHub, tag, release or publishing APIs.
 */
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const cp=require('node:child_process');

const root=path.resolve(__dirname,'..');
const packageInfo=require(path.join(root,'package.json'));
const rawSha=process.env.BUILD_SHA||process.env.GITHUB_SHA||'';
const sha=/^[0-9a-f]{7,40}$/i.test(rawSha)?rawSha.toLowerCase():'local';
const short=sha==='local'?'local':sha.slice(0,7);
const outputDir=path.join(root,'builds');
const output=path.join(outputDir,'cocos-splines-v2-'+short+'.zip');
const stage=fs.mkdtempSync(path.join(os.tmpdir(),'cocos-splines-v2-'));
const extension=path.join(stage,'cocos-splines');
const allowed=[
    'package.json','README.md','README_VI.md','CHANGELOG.md','LICENSE',
    'assets','dist','docs',
];

try {
    fs.mkdirSync(extension,{recursive:true});
    for(const entry of allowed){
        const source=path.join(root,entry);
        if(!fs.existsSync(source))throw new Error('Missing build input: '+entry);
        fs.cpSync(source,path.join(extension,entry),{recursive:true});
    }
    for(const required of ['dist/main.js','dist/scene.js',
        'assets/splines/Core/SplineKnot.ts','assets/splines/Editor/SplineKnotGizmos.ts']){
        if(!fs.existsSync(path.join(extension,required)))throw new Error('Incomplete preview: '+required);
    }
    fs.writeFileSync(path.join(extension,'PREVIEW_BUILD.txt'),[
        'Cocos Splines V2 — TEST BUILD ONLY',
        'Branch: v2',
        'Commit: '+sha,
        'Extension package version: '+packageInfo.version,
        'Cocos-Gizmos v3.0.3+ is required.',
        'No tag or release has been created.',
        'This has not been certified in the Cocos Creator Editor.',
        '',
    ].join('\n'));
    fs.mkdirSync(outputDir,{recursive:true});
    fs.rmSync(output,{force:true});
    cp.execFileSync('zip',['-q','-r',output,'cocos-splines'],{cwd:stage});
    cp.execFileSync('unzip',['-t',output],{stdio:'pipe'});
    console.log('V2 TEST BUILD: '+output+' ('+fs.statSync(output).size+' bytes)');
} finally {
    fs.rmSync(stage,{force:true,recursive:true});
}
