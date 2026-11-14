'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
    path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-network-v2-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
  '--rootDir',path.join(root,'src-v2'),'--outDir',out,
  path.join(root,'src-v2/geometry/SplineRoadNetworkV2.ts')],{stdio:'pipe'});
 const {planJunctionEndpointSnapV2:plan,buildSplineRoadNetworkV2:graph}=
  require(path.join(out,'geometry/SplineRoadNetworkV2.js'));
 const vec=(x,y,z)=>({x,y,z}),center=vec(0,0,0);
 const road=(id,dx,dz,atEnd=false,offset=vec(0,0,0))=>{
  const near=vec(offset.x,offset.y,offset.z),far=vec(dx*15,0,dz*15),
   probe=vec(near.x+dx*.5,near.y,near.z+dz*.5);
  return {roadId:id,pathId:'path-'+id,atEnd,length:15,halfWidth:2,
   start:atEnd?far:near,end:atEnd?near:far,
   startInside:atEnd?vec(dx*14.5,0,dz*14.5):probe,
   endInside:atEnd?probe:vec(dx*14.5,0,dz*14.5),
   currentStartTrim:0,currentEndTrim:0};
 };
 const inputs=[
  road('north',0,1,false,vec(.22,0,-.05)),
  road('south',0,-1,true,vec(-.13,0,.05)),
  road('east',1,0,false,vec(.1,0,-.12)),
  road('west',-1,0,true,vec(-.2,0,-.1))
 ];
 const proposal=plan(inputs,{center,maxDistance:.6});
 assert.equal(proposal.branches.length,4);
 assert.deepEqual(proposal.branches.map(b=>b.atEnd),[false,true,false,true]);
 assert(proposal.branches.every(b=>b.changed&&b.distance<.6));
 assert.deepEqual(proposal.branches[0].to,center);
 assert.equal(plan(inputs,{center,maxDistance:.6}).branches[2].roadId,'east');
 assert.throws(()=>plan([{...inputs[0],atEnd:true},...inputs.slice(1)],
   {center,maxDistance:.6}),/exceeds Snap max distance/);
 assert.throws(()=>plan([inputs[0],{...inputs[1],pathId:inputs[0].pathId},inputs[2]],
   {center,maxDistance:.6}),/distinct Path/);
 assert.throws(()=>plan([inputs[0],{...inputs[1],start:vec(0,1,0),end:vec(0,1,0)},inputs[2]],
   {center,maxDistance:.6}),/exceeds Snap height tolerance|exceeds Snap max distance/);
 assert.throws(()=>plan([inputs[0],inputs[1],{...inputs[2],start:vec(2,0,0)}],
   {center,maxDistance:.6}),/exceeds Snap max distance/);
 assert.equal(plan([inputs[0],inputs[1],inputs[2]],{center,maxDistance:.6}).branches.length,3);
 const hubs=graph(inputs,{maxDistance:.6,maxHeightDelta:.1});
 assert.equal(hubs.roadCount,4);
 assert.equal(hubs.hubCount,1);
 assert.equal(hubs.hubs[0].endpoints.length,4);
 // Chained proximity must not turn into one oversized junction.
 const line=[road('a',1,0,false,vec(0,0,0)),
  road('b',-1,0,false,vec(.2,0,0)),
  road('c',0,1,false,vec(.4,0,0))];
 const chain=graph(line,{maxDistance:.25});
 assert.equal(chain.hubs[0].endpoints.length,2);
 assert(chain.hubs.every(h=>h.maximumGap<=.25+1e-6));
 const reverse=graph([...inputs].reverse(),{maxDistance:.6});
 assert.deepEqual(reverse.hubs,hubs.hubs,'Network graph must not depend on Road discovery order');
 assert.throws(()=>graph([inputs[0],inputs[0]]),/Duplicate/);
 const unmodified=JSON.stringify(inputs);plan(inputs,{center,maxDistance:.6});
 assert.equal(JSON.stringify(inputs),unmodified,'Planning must be read-only');
 console.log('V2 NETWORK/SNAP PASS: 3-/4-way, start/end, partial gaps, deterministic hubs, strict preflight');
}finally{fs.rmSync(out,{recursive:true,force:true});}
