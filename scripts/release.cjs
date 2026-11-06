'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'..',`cocos-splines-${require(path.join(root,'package.json')).version}.zip`);
const staged=fs.mkdtempSync('/tmp/cocos-splines-release-');
const target=path.join(staged,'cocos-splines');fs.mkdirSync(target);
const allowed=['package.json','README.md','README_VI.md','CHANGELOG.md','LICENSE','assets','dist','docs'];
for(const file of allowed){fs.cpSync(path.join(root,file),path.join(target,file),{recursive:true});}
// Delete an earlier ZIP before packaging; zip -r otherwise keeps obsolete entries.
fs.rmSync(out,{force:true});
cp.execFileSync('zip',['-q','-r',out,'cocos-splines'],{cwd:staged});
cp.execFileSync('unzip',['-t',out],{stdio:'pipe'});
fs.rmSync(staged,{recursive:true,force:true});
console.log(`Release: ${out} (${fs.statSync(out).size} bytes)`);
