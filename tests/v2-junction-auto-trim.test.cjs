'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
 path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-auto-trim-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
  '--rootDir',path.join(root,'src-v2'),'--outDir',dir,
  path.join(root,'src-v2/geometry/JunctionAutoTrimV2.ts')],{stdio:'pipe'});
 const {planJunctionAutoTrimV2:plan}=require(path.join(dir,'geometry/JunctionAutoTrimV2.js'));
 const v=(x,y,z)=>({x,y,z}),c=v(0,0,0);
 const road=(id,dx,dz,reverse=false,length=20,halfWidth=2)=>{
  const outside=v(dx*length,0,dz*length),inside=v(dx*.5,0,dz*.5);
  return {roadId:id,start:reverse?outside:c,end:reverse?c:outside,
   startInside:reverse?v(dx*(length-.5),0,dz*(length-.5)):inside,
   endInside:reverse?inside:v(dx*(length-.5),0,dz*(length-.5)),
   length,halfWidth,currentStartTrim:1,currentEndTrim:1};
 };
 const cross=[road('E',1,0),road('N',0,1,true),road('W',-1,0),
  road('S',0,-1,true)];
 const result=plan(cross,{center:c});
 assert.equal(result.branches.length,4);
 assert.deepEqual(result.branches.map(b=>b.atEnd),[false,true,false,true]);
 for(const b of result.branches){
  assert(Math.abs(b.trim-2.25)<1e-4);
  assert(Math.abs(b.angleBeforeDegrees-90)<1e-6);
  assert.equal(b.centerDistance,0);
 }
 assert.deepEqual(plan([cross[2],cross[0],cross[3],cross[1]],
  {center:c}).branches.map(b=>b.roadId),['W','E','S','N']);
 const tee=plan([road('L',-1,0),road('R',1,0),road('U',0,1)],
  {center:c,minimumTrim:.7});
 assert.equal(tee.branches.length,3);
 assert(tee.branches.every(x=>x.trim>=2.25));
 const close=[road('A',1,0),road('B',Math.cos(.15),Math.sin(.15)),
  road('C',-1,0)];
 assert.throws(()=>plan(close,{center:c}),/too short|nearly identical/);
 assert.throws(()=>plan([cross[0],cross[0],cross[2]],{center:c}),/Duplicate/);
 const moved={...cross[2],start:v(2,0,0)};
 assert.throws(()=>plan([cross[0],cross[1],moved],{center:c}),/not connected|no endpoint/);
 const high={...cross[2],start:v(0,.2,0)};
 assert.throws(()=>plan([cross[0],cross[1],high],{center:c}),/not connected/);
 const short=road('short',-1,0,false,3);
 assert.throws(()=>plan([cross[0],cross[1],short],{center:c}),/too short/);
 const nonfinite={...cross[2],end:v(Infinity,0,0)};
 assert.throws(()=>plan([cross[0],cross[1],nonfinite],{center:c}),/Non-finite/);
 console.log('PASS v2: deterministic world-space junction trim/endpoint choice, T/4-way, angle and safety guards');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
