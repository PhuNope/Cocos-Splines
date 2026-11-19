'use strict';
/** Sorted, complete v2 test discovery. No legacy v0.9 assertions run. */
const fs=require('node:fs'),path=require('node:path'),
 cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'tests');
const scripts=fs.readdirSync(dir).filter(n=>/^v2-[\w-]+\.test\.cjs$/.test(n)).sort();
if(scripts.length<45)throw new Error('Incomplete V2 regression suite: '+scripts.length);
let passed=0;
for(const file of scripts){
 process.stdout.write('[v2] '+file+'\n');
 const result=cp.spawnSync(process.execPath,[path.join(dir,file)],{
  cwd:root,stdio:'inherit',env:process.env
 });
 if(result.status!==0)throw new Error(
  'Regression failed: '+file+' ('+(result.status??String(result.error))+')');
 passed++;
}
console.log('V2 REGRESSION PASS: '+passed+' tests');
