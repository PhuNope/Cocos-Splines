'use strict';
const assert=require('node:assert/strict'),os=require('node:os'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-v2-frames-'));
try{
cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--strict','--outDir',dir,...['SplineCurves','SplineCache','SplineFrames'].map(n=>path.resolve(__dirname,'../src-v2/core/'+n+'.ts'))]);
const {buildSplineCacheV2,sampleSplineDistanceV2,parameterAtCachedDistanceV2}=require(path.join(dir,'SplineCache.js'));
const {buildSplineFramesV2,frameAtDistanceV2}=require(path.join(dir,'SplineFrames.js'));
const p=(x,y=0,z=0)=>({x,y,z}),k=(x,y=0,z=0,e={})=>({position:p(x,y,z),...e});
const near=(a,b,t=1e-5)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const length=a=>Math.hypot(a.x,a.y,a.z);
const check=f=>{for(const axis of ['position','tangent','right','up'])for(const coord of ['x','y','z'])assert(Number.isFinite(f[axis][coord]));for(const axis of ['tangent','right','up'])near(length(f[axis]),1,2e-5);near(dot(f.tangent,f.right),0,2e-5);near(dot(f.tangent,f.up),0,2e-5);near(dot(f.right,f.up),0,2e-5);};
const sc=buildSplineCacheV2({type:'bezier',closed:false,knots:[k(0,0,0,{handleOut:p(3,14,0)}),k(10,0,0,{handleIn:p(-3,-14,0)})]},{tolerance:.00005});
assert(sc.length>13,'S curve length underestimated');near(parameterAtCachedDistanceV2(sc,sc.length/2),.5,.015);
const knots=[k(0),k(4),k(10)];const cache=buildSplineCacheV2({type:'linear',closed:false,knots});
near(cache.segments[0].length,4);near(cache.segments[1].length,6);
knots[1].position.x=100;near(sampleSplineDistanceV2(cache,6).position.x,6);
assert.throws(()=>buildSplineFramesV2(cache,{maxStep:0}),/maxStep/);
const helix=[];for(let i=0;i<=12;i++){const a=i*Math.PI/4;helix.push(k(Math.cos(a)*2,i*1.7,Math.sin(a)*2));}
const hc=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:false,knots:helix});
const hf=buildSplineFramesV2(hc,{maxStep:.12});hf.frames.forEach((f,i)=>{check(f);if(i)assert(dot(f.right,hf.frames[i-1].right)>.9,'frame flip');});
for(let i=0;i<64;i++)check(frameAtDistanceV2(hc,hf,hc.length*i/63));
const ring=[];for(let i=0;i<16;i++){const a=i*Math.PI/8;ring.push(k(Math.cos(a)*4,Math.sin(2*a),Math.sin(a)*4));}
const rc=buildSplineCacheV2({type:'catmull-rom-centripetal',closed:true,knots:ring});
const rf=buildSplineFramesV2(rc,{maxStep:.13});rf.frames.forEach(check);
near(dot(rf.frames[0].right,rf.frames.at(-1).right),1,1e-10);
let seed=0xc0c05eed;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
for(let trial=0;trial<80;trial++){
const ks=[];let x=0,y=0,z=0;
for(let i=0;i<3+Math.floor(rand()*10);i++){x+=(rand()-.5)*3;y+=(rand()-.5)*6;z+=(rand()-.5)*3;
if(i&&rand()<.08){const last=ks.at(-1).position;x=last.x;y=last.y;z=last.z;}
ks.push(k(x,y,z,{handleOut:p((rand()-.5)*8,(rand()-.5)*8,(rand()-.5)*8),handleIn:p((rand()-.5)*8,(rand()-.5)*8,(rand()-.5)*8),tension:rand()}));}
for(const type of ['linear','bezier','catmull-rom','catmull-rom-centripetal']){
const c=buildSplineCacheV2({type,closed:rand()>.5,knots:ks},{tolerance:.02,maxDepth:8});
assert(Number.isFinite(c.length));const f=buildSplineFramesV2(c,{maxStep:Math.max(.08,c.length/64)});
f.frames.forEach(check);for(let j=0;j<8;j++)check(frameAtDistanceV2(c,f,rand()*c.length));
}}
console.log('V2 FRAMES/CACHE PASS: S-curve, helix, loop seam and 320 seeded fuzz splines');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
