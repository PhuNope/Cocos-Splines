'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {readSharedGraphSnapshot,saveSharedGraphIfUnchanged,assertProjectAssetPath}=
 require('../src/SplineGeometryGraphAssetWorkflow');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-shared-graph-'));
const assets=path.join(temp,'assets');fs.mkdirSync(assets);
const graph=width=>JSON.stringify({version:1,nodes:[
 {id:'spline',type:'spline'},
 {id:'ribbon',type:'ribbon',input:'spline',width},
 {id:'output',type:'output',input:'ribbon'}],output:'output'});
const source=path.join(assets,'shared.json');
try{
 fs.writeFileSync(source,graph(3));
 const snapshot=readSharedGraphSnapshot(source,assets);
 assert.equal(JSON.parse(snapshot.graphJson).nodes[1].width,3);
 assert.match(snapshot.sha256,/^[0-9a-f]{64}$/);
 assert.equal(saveSharedGraphIfUnchanged(source,assets,snapshot.graphJson,snapshot.sha256).changed,true,
   'Canonical JSON rewrite is intentionally explicit');
 const canonical=readSharedGraphSnapshot(source,assets);
 assert.equal(saveSharedGraphIfUnchanged(source,assets,canonical.graphJson,canonical.sha256).changed,false);
 const saved=saveSharedGraphIfUnchanged(source,assets,graph(7),canonical.sha256);
 assert.equal(saved.changed,true);
 assert.equal(JSON.parse(fs.readFileSync(source,'utf8')).nodes[1].width,7);
 assert.throws(()=>saveSharedGraphIfUnchanged(source,assets,graph(9),canonical.sha256),/changed/);
 assert.equal(JSON.parse(fs.readFileSync(source,'utf8')).nodes[1].width,7);
 assert.throws(()=>saveSharedGraphIfUnchanged(source,assets,'{bad',saved.sha256),/JSON|graph|Unexpected|parse/i);
 assert.equal(JSON.parse(fs.readFileSync(source,'utf8')).nodes[1].width,7);
 const outside=path.join(temp,'outside.json');fs.writeFileSync(outside,graph(4));
 assert.throws(()=>assertProjectAssetPath(outside,assets),/inside/);
 const directory=path.join(assets,'dir');fs.mkdirSync(directory);
 const link=path.join(directory,'link.json');fs.symlinkSync(outside,link);
 assert.throws(()=>readSharedGraphSnapshot(link,assets),/real directories|regular JSON/);
 const dirLink=path.join(assets,'shortcut');fs.symlinkSync(directory,dirLink,'dir');
 assert.throws(()=>readSharedGraphSnapshot(path.join(dirLink,'link.json'),assets),/real directories|regular JSON/);
 assert.deepEqual(fs.readdirSync(assets).sort(),['dir','shared.json','shortcut'].sort(),
   'No temporary file must remain after saves.');
 console.log('GEOMETRY GRAPH SHARED SAVE V2 PASS: snapshots, conflicts, path guards, invalid graph, no-op.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
