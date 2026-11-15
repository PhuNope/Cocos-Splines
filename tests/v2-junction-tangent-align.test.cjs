'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),
 fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-junction-tangents-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
 '--rootDir',path.join(root,'src-v2'),'--outDir',temp,
 path.join(root,'src-v2/geometry/JunctionTangentAlignV2.ts')],{stdio:'pipe'});
 const {planJunctionTangentAlignmentV2:plan}=require(path.join(temp,'geometry/JunctionTangentAlignV2.js'));
 const vec=(x,y,z)=>({x,y,z}),center=vec(0,0,0);
 const arms=[
  {roadId:'E',pathId:'PE',atEnd:false,endpoint:center,neighbor:vec(12,0,0),
   mode:1,activeHandle:vec(0,0,2)},
  {roadId:'N',pathId:'PN',atEnd:true,endpoint:center,neighbor:vec(0,0,12),
   mode:2,activeHandle:vec(2,0,0)},
  {roadId:'W',pathId:'PW',atEnd:false,endpoint:center,neighbor:vec(-10,0,0),
   mode:0,activeHandle:vec(4,0,0)}
 ];
 const snapshot=JSON.stringify(arms);
 let p=plan(arms,{center});
 assert.equal(p.changedCount,2);
 assert.equal(p.branches[0].handleSide,'out');
 assert.equal(p.branches[1].handleSide,'in');
 assert.equal(p.branches[1].targetMode,1,'Aligned becomes Free only when edited');
 assert.equal(p.branches[2].targetMode,0,'Auto mode remains Auto');
 assert.equal(p.branches[2].changed,false);
 assert(Math.abs(p.branches[0].targetHandle.x-2)<1e-8);
 assert(Math.abs(p.branches[1].targetHandle.z-2)<1e-8);
 assert.equal(JSON.stringify(arms),snapshot,'Read-only planner must never edit records');
 const corrected=arms.map((x,i)=>({...x,mode:p.branches[i].targetMode,
  activeHandle:p.branches[i].targetHandle}));
 assert.equal(plan(corrected,{center}).changedCount,0,'Applying twice is a no-op');
 assert.throws(()=>plan([...arms,arms[0]],{center}),/distinct Road and Path/);
 assert.throws(()=>plan(arms.slice(0,2),{center}),/exactly 3 or 4/);
 assert.throws(()=>plan([{...arms[0],endpoint:vec(.1,0,0)},arms[1],arms[2]],
  {center}),/not snapped/);
 assert.throws(()=>plan([{...arms[0],neighbor:vec(0,15,0)},arms[1],arms[2]],
  {center}),/vertical/);
 assert.throws(()=>plan([{...arms[0],neighbor:vec(1,3,0)},arms[1],arms[2]],
  {center}),/too steep/);
 const banked=plan([{...arms[0],neighbor:vec(12,1,0)},arms[1],arms[2]],{center});
 assert(banked.branches[0].targetHandle.y>0);
 const long=plan([{...arms[0],activeHandle:vec(80,0,0)},arms[1],arms[2]],{center});
 assert(long.branches[0].handleLength<=4+1e-6);
 console.log('JUNCTION TANGENT ALIGN PASS: 3/4 Path preflight, end handle orientation, Auto preservation, repeat no-op, grade/spacing guards');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
