const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),docs=path.join(root,'docs');
const files=fs.readdirSync(path.join(docs,'pages')).filter(f=>f.endsWith('.html'));
assert.equal(files.length,19,'19 topic pages + docs/index.html');
for(const file of [path.join(docs,'index.html'),...files.map(f=>path.join(docs,'pages',f))]){
 const html=fs.readFileSync(file,'utf8');assert(html.startsWith('<!doctype html>'));
 for(const match of html.matchAll(/href="([^"]+)"/g)){
  if(match[1].startsWith('http')||match[1].startsWith('#'))continue;
  assert(fs.existsSync(path.resolve(path.dirname(file),match[1])),`Broken doc link ${file}: ${match[1]}`);
 }
}
const animate=fs.readFileSync(path.join(docs,'pages/animate.html'),'utf8');
assert(animate.includes('constantSpeedWithOffset'));assert(animate.includes('Spline Offset'));
const morph=fs.readFileSync(path.join(docs,'pages/morph.html'),'utf8');assert(morph.includes('Restore'));
const api=fs.readFileSync(path.join(docs,'pages/api.html'),'utf8');assert(api.includes('AddOnReachEvent'));
console.log('HTML DOCS PASS: 20 pages, relative navigation, Animate/Morph/API explanations.');
