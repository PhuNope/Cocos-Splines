'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const extrude=fs.readFileSync(path.join(root,'assets/splines/Components/SplineExtrude.ts'),'utf8');
assert(!/\.getMaterial\s*\(/.test(extrude),'getMaterial is deprecated in Cocos 3.8 and must not be used');
assert(/\.getSharedMaterial\s*\(/.test(extrude),'Renderer should check shared material');
const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');
assert(/Editor\.Selection\.clear\('node'\)/.test(main),'Clear node selection before selecting a new knot');
console.log('DEPRECATION PASS: no deprecated renderer getter; single-select helper present.');
