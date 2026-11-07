'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..','assets','splines');
let checked=0;
for(const area of ['Components','Core']){
  for(const file of fs.readdirSync(path.join(root,area)).filter(name=>name.endsWith('.ts'))){
    const source=fs.readFileSync(path.join(root,area,file),'utf8');
    for(const match of source.matchAll(/console\.warn\s*\(/g)){
      const prefix=source.slice(Math.max(0,match.index-100),match.index);
      assert.match(prefix,/if\s*\(\s*EDITOR_NOT_IN_PREVIEW\s*(?:\)|&&)/,
        `${area}/${file}:${source.slice(0,match.index).split('\n').length}: warn must be Editor-only`);
      checked++;
    }
  }
}
assert(checked>=8,`Expected runtime warning sites to be covered, found ${checked}`);
console.log(`EDITOR-ONLY WARNINGS PASS: ${checked} Cocos runtime warning calls are guarded.`);
