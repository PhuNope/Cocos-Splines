'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..');
const w=require(root+'/dist/SplineGeometryGraphAssetWorkflow.js');
const g=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const base=path.join(os.tmpdir(),'spline-graph-assets-');
const sandbox=fs.mkdtempSync(base);
try{
 const original=JSON.stringify({version:1,nodes:[
  {id:'source',type:'spline'},
  {id:'offset',type:'offset',input:'source',right:1},
  {id:'ribbon',type:'ribbon',input:'offset',width:3},
  {id:'output',type:'output',input:'ribbon'}
 ],output:'output'});
 const normalized=w.canonicalGraphJSON(original);
 assert.deepEqual(g.parseGraph(normalized).ordered.map(n=>n.id),
  ['source','offset','ribbon','output']);
 const target=path.join(sandbox,'SharedRibbon.json');
 const result=w.writeGraphFile(target,original);
 assert.equal(result.file,target);
 assert.equal(result.nodes,4);
 assert.equal(w.readGraphFile(target),normalized);
 assert.throws(()=>w.writeGraphFile(target,original),/EEXIST/,
  'Must never overwrite a user-modified JsonAsset');
 fs.writeFileSync(target,'CUSTOM DATA');
 assert.throws(()=>w.readGraphFile(target),/Malformed|Graph JSON/);
 assert.equal(fs.readFileSync(target,'utf8'),'CUSTOM DATA');
 const unsafe=path.join(sandbox,'Invalid.json');
 assert.throws(()=>w.writeGraphFile(unsafe,'{broken'),/Malformed/);
 assert(!fs.existsSync(unsafe),'Invalid input should not create a file');
 assert.throws(()=>w.writeGraphFile(unsafe,JSON.stringify({
  version:1,nodes:[],output:'missing'
 })),/Graph/);
 assert(!fs.existsSync(unsafe));
 assert.throws(()=>w.writeGraphFile(path.join(sandbox,'not-json.txt'),original),/json/);
 assert.throws(()=>w.readGraphFile(path.join(sandbox,'not-json.txt')),/json/);
 assert.throws(()=>w.writeGraphFile(path.join(sandbox,'sub','missing.json'),original),/ENOENT/);
 const huge=path.join(sandbox,'huge.json');
 fs.writeFileSync(huge,'x'.repeat(w.MAX_BYTES+1));
 assert.throws(()=>w.readGraphFile(huge),/16 KiB/);
 const symlink=path.join(sandbox,'link.json');
 fs.symlinkSync(target,symlink);
 assert.throws(()=>w.readGraphFile(symlink),/symlink/);
 const dest=path.join(sandbox,'new.json');
 fs.writeFileSync(dest,'DO NOT TOUCH');
 assert.throws(()=>w.writeGraphFile(dest,original),/EEXIST/);
 assert.equal(fs.readFileSync(dest,'utf8'),'DO NOT TOUCH');
 const parsed=JSON.parse(normalized);
 parsed.nodes[2].width=-12;
 assert.throws(()=>w.canonicalGraphJSON(JSON.stringify(parsed)),/width/);
 parsed.nodes[2].width=3;
 parsed.nodes[2].unknown='arbitrary code';
 assert.throws(()=>w.canonicalGraphJSON(JSON.stringify(parsed)),/Unsupported/);
 const pkg=require(root+'/package.json');
 assert(pkg.scripts.test.includes('geometry-graph-asset-v2.test.cjs'));
 console.log('GEOMETRY GRAPH ASSET V2 PASS: canonical strict JSON, bounded import, exclusive export, no symlink, no overwrite, invalid input atomicity.');
}finally{fs.rmSync(sandbox,{recursive:true,force:true});}
