'use strict';
/** V2-only Editor bundle: no legacy component/panel/Inspector copy stage. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});
const copy=(from,to)=>{
 const source=path.join(root,from),dest=path.join(root,to);
 if(!fs.statSync(source).isFile())throw new Error('Missing '+from);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.copyFileSync(source,dest);
};
for(const file of fs.readdirSync(path.join(root,'src/v2')).filter(x=>x.endsWith('.js')))
 copy('src/v2/'+file,'dist/v2/'+file);
copy('src/v2/inspector-common-clean.js','dist/contributions/inspector/common.js');
for(const name of ['PathV2','RoadV2','ExtrudeV2','MeshDeformV2','JunctionV2'])
 copy('src/contributions/inspector/'+name+'.js',
     'dist/contributions/inspector/'+name+'.js');
console.log('BUILD PASS: V2-only Editor scripts; legacy entrypoints absent.');
