'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const model=require(root+'/dist/SplineGeometryProfileEditor.js');
const workflow=require(root+'/dist/SplineGeometryProfileAssetWorkflow.js');
const profile={format:'cocos-splines/profile',version:1,points:[
 {x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:-.1},
 {x:.1,y:-.1},{x:.1,y:.5},{x:-.5,y:.5},
]};
const before=JSON.stringify(profile);
const selected=model.parseProfile(profile);
assert.notEqual(selected.points,profile.points,'Editor must copy source polygon');
assert.deepEqual(selected,profile);
const formatted=model.formatProfile(profile);
assert.match(model.renderProfileControls(formatted,2),/Profile point 3/);
assert.match(model.renderProfileControls(formatted,2),/Remove selected point/);
const inserted=model.applyProfileEdit(formatted,'insert',{index:0});
assert.equal(model.parseProfile(inserted).points.length,7);
const removed=model.applyProfileEdit(inserted,'remove',{index:1});
assert.equal(removed,formatted,'Insert/remove returns original profile geometry');
const modified=model.applyProfileEdit(formatted,'move',{index:1,x:.8,y:-.4});
assert.notEqual(modified,formatted);
// Edge-aware editor: moving a segment changes its two vertices atomically.
const edgeMoved=model.applyProfileEdit(formatted,'move-edge',
 {index:0,dx:0,dy:-.1});
assert.deepEqual(model.parseProfile(edgeMoved).points.slice(0,2),[
 {x:-.5,y:-.6},{x:.5,y:-.6}]);
assert.equal(model.parseProfile(edgeMoved).points.length,6);
assert.notDeepEqual(model.parseProfile(edgeMoved).points,
 model.parseProfile(formatted).points);
// CCW input stays immutable and non-self-intersecting on invalid edge drag.
for(const invalid of [{dx:2,dy:0},{dx:0,dy:3},{dx:NaN,dy:0},
 {dx:0,dy:1.2}])
 assert.throws(()=>model.applyProfileEdit(formatted,'move-edge',
  {index:0,...invalid}),/Profile/);
const edgeInserted=model.applyProfileEdit(formatted,'insert-edge',
 {index:0,t:.25,offset:.12});
assert.equal(model.parseProfile(edgeInserted).points.length,7);
assert.notEqual(edgeInserted,formatted);
assert.match(model.renderProfileControls(edgeInserted,0,0),/Insert at selected edge/);
assert.match(model.renderProfileControls(edgeInserted,0,0),/data-profile-edge="0"/);
assert.match(model.renderProfileControls(edgeInserted,0,0),/edge #1 selected/);
assert.match(model.renderProfileControls(formatted,0),/disabled>Insert at selected edge/);
assert.equal(model.applyProfileEdit(edgeInserted,'remove',{index:1}),formatted);
for(const invalid of [{t:0,offset:.1},{t:.5,offset:0},
 {t:.5,offset:NaN},{t:.5,offset:1}])
 assert.throws(()=>model.applyProfileEdit(formatted,'insert-edge',
  {index:0,...invalid}),/Profile/);
assert.equal(model.parseProfile(modified).points[1].x,.8);
assert.equal(JSON.stringify(profile),before,'Draft operations never mutate author asset');
for(const action of ['insert','remove','move'])for(const index of [-1,6,1.2,'bad'])
 assert.throws(()=>model.applyProfileEdit(formatted,action,{index,x:0,y:0}),/point index/);
assert.throws(()=>model.applyProfileEdit(formatted,'move',{index:0,x:100,y:0}));
assert.throws(()=>model.applyProfileEdit(formatted,'move',{index:1,x:-.5,y:-.5}));
const reduced=model.applyProfileEdit(formatted,'remove',{index:2});
assert.equal(model.parseProfile(reduced).points.length,5);
const cw={...profile,points:[...profile.points].reverse()};
const bow={...profile,points:[
 {x:-.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5},{x:.5,y:-.5},
]};
for(const bad of [cw,bow,{format:'bad',version:1,points:profile.points},
 {...profile,points:[{x:1,y:0}]},{...profile,points:profile.points.concat(
  Array.from({length:11},(_,i)=>({x:0,y:i/100})))},
 {...profile,points:[{x:0,y:0},{x:0,y:1},{x:1,y:1},{x:0,y:1}]}])
 assert.throws(()=>model.formatProfile(bad),/Profile/);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-profile-editor-'));
try{
 const assets=path.join(temp,'assets');fs.mkdirSync(assets);
 const file=path.join(assets,'LProfile.json');
 const meta=file+'.meta';
 fs.writeFileSync(file,formatted);
 fs.writeFileSync(meta,'{"uuid":"unchanged"}');
 const first=workflow.readProfileSnapshot(file,assets);
 assert.equal(first.profileJson,formatted);
 const written=workflow.saveProfileIfUnchanged(file,assets,modified,first.sha256);
 assert.equal(written.changed,true);
 assert.equal(fs.readFileSync(file,'utf8'),modified);
 assert.equal(fs.readFileSync(meta,'utf8'),'{"uuid":"unchanged"}');
 assert.equal(workflow.saveProfileIfUnchanged(file,assets,modified,written.sha256).changed,false);
 assert.throws(()=>workflow.saveProfileIfUnchanged(file,assets,formatted,first.sha256),/changed/);
 const second=workflow.readProfileSnapshot(file,assets);
 assert.throws(()=>workflow.saveProfileIfUnchanged(file,assets,'{invalid',second.sha256));
 assert.equal(fs.readFileSync(file,'utf8'),modified);
 assert.equal(fs.readdirSync(assets).filter(x=>x.includes('.tmp')).length,0);
 const outside=path.join(temp,'outside.json');
 fs.writeFileSync(outside,formatted);
 assert.throws(()=>workflow.readProfileSnapshot(outside,assets),/project assets/);
 const link=path.join(assets,'linked.json');
 fs.symlinkSync(outside,link);
 assert.throws(()=>workflow.readProfileSnapshot(link,assets),/regular|real|symbolic/);
 assert.equal(fs.readFileSync(file,'utf8'),modified);
 const pkg=require(root+'/package.json');
 assert(pkg.scripts.test.includes('geometry-profile-editor-v2.test.cjs'));
 console.log('PROFILE EDITOR MODEL V2 PASS: draft edit/validation, immutable input, SHA-guarded writes, symlinks, unchanged source meta.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
