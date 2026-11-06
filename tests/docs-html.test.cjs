const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),docs=path.join(root,'docs');
const files=fs.readdirSync(path.join(docs,'pages')).filter(f=>f.endsWith('.html'));
assert.equal(files.length,18,'18 topic pages + docs/index.html');
for(const file of [path.join(docs,'index.html'),...files.map(f=>path.join(docs,'pages',f))]){
 const html=fs.readFileSync(file,'utf8');assert(html.startsWith('<!doctype html>'));
 for(const match of html.matchAll(/href="([^"]+)"/g)){
  if(match[1].startsWith('http')||match[1].startsWith('#'))continue;
  assert(fs.existsSync(path.resolve(path.dirname(file),match[1])),`Broken doc link ${file}: ${match[1]}`);
 }
}
const animate=fs.readFileSync(path.join(docs,'pages/animate.html'),'utf8');
assert(animate.includes('constantSpeedWithOffset'));assert(animate.includes('Spline Offset'));assert(animate.includes('Junction Offset Blend Distance'));assert(animate.includes('Target Local'));assert(animate.includes('Up Reference'));
for(const file of [path.join(docs,'index.html'),...files.map(f=>path.join(docs,'pages',f))]){const content=fs.readFileSync(file,'utf8'); assert(!/git\.html|github\.com|không cần internet|không cần server|0\.9\.0|0\.9\.1/i.test(content),'Docs should be task-focused, not Git/version history: '+file);}
assert(!fs.existsSync(path.join(docs,'pages/git.html')));
const morph=fs.readFileSync(path.join(docs,'pages/morph.html'),'utf8');assert(morph.includes('Restore'));assert(morph.includes('world space'));
const junction=fs.readFileSync(path.join(docs,'pages/junction.html'),'utf8');for(const name of ['Preserve','Forward','Backward','PingPong'])assert(junction.includes(name));
const api=fs.readFileSync(path.join(docs,'pages/api.html'),'utf8');assert(api.includes('AddOnReachEvent'));
console.log('HTML DOCS PASS: 19 pages, relative navigation, Animate/Morph/API explanations.');
