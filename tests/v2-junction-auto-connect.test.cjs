'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'v2-auto-connect-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
  '--rootDir',path.join(root,'src-v2'),'--outDir',folder,
  path.join(root,'src-v2/geometry/JunctionAutoConnectV2.ts')],{stdio:'pipe'});
 const {planJunctionAutoConnectV2:plan}=
  require(path.join(folder,'geometry/JunctionAutoConnectV2.js'));
 const v=(x,y,z)=>({x,y,z}),center=v(0,0,0);
 const road=(id,dx,dz,atEnd=false,offset=v(0,0,0))=>{
  const near=offset,far=v(dx*15,0,dz*15);
  const inside=v(near.x+dx*.5,near.y,near.z+dz*.5);
  return {roadId:id,pathId:'path-'+id,componentUuid:'comp-'+id,
   start:atEnd?far:near,end:atEnd?near:far,
   startInside:atEnd?v(dx*14.5,0,dz*14.5):inside,
   endInside:atEnd?inside:v(dx*14.5,0,dz*14.5),
   length:15,halfWidth:2,currentStartTrim:0,currentEndTrim:0};
 };
 const roads=[road('N',0,1,false,v(.1,0,.1)),
  road('E',1,0,true,v(.15,0,0)),
  road('S',0,-1),road('W',-1,0,true,v(-.12,0,-.1))];
 const result=plan(roads,{center,searchRadius:.4});
 assert.equal(result.branches.length,4);
 assert(result.branches.some(b=>b.roadId==='E'&&b.atEnd));
 assert.equal(plan([roads[0],roads[1],roads[2]],
  {center,searchRadius:.4}).branches.length,3);
 assert.deepEqual(plan([...roads].reverse(),{center,searchRadius:.4}).branches,
  result.branches);
 assert.throws(()=>plan(roads.slice(0,2),{center}),/exactly 3 or 4/);
 assert.throws(()=>plan([...roads,road('X',.7,.7)],{center}),/exactly 3 or 4/);
 assert.throws(()=>plan([roads[0],roads[0],roads[2]],{center}),/duplicate/);
 assert.throws(()=>plan([roads[0],{...roads[1],pathId:roads[0].pathId},roads[2]],
  {center}),/distinct Path/);
 assert.throws(()=>plan([roads[0],roads[1],road('Z',.999,.01)],{center}),
  /overlapping Road headings/);
 const high={...roads[1],end:v(.1,1,.1)};
 assert.throws(()=>plan([roads[0],high,roads[2]],{center,searchRadius:.5}),
  /exactly 3 or 4/);
 const both={...roads[2],end:v(.2,0,.1)};
 assert.throws(()=>plan([roads[0],roads[1],both],{center}),/Both endpoints/);
 const before=JSON.stringify(roads);
 plan(roads,{center});
 assert.equal(JSON.stringify(roads),before,'Read-only planner cannot mutate geometry');
 console.log('AUTO CONNECT V2 PASS: 3/4 Way, World center, reversed Road ends, deterministic bearing order, strict ambiguity and altitude guards');
}finally{fs.rmSync(folder,{recursive:true,force:true});}
