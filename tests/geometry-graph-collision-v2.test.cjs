'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'graph-collision-'));
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false','--outDir',dir],{stdio:'pipe'});
 const {buildGraphCollisionGeometry:build}=require(dir+'/Core/SplineGraphCollisionMath.js');
 const a={positions:[0,0,0,1,0,0,0,1,0,9,9,9],indices:[0,1,2,0,0,3]};
 const b={positions:[0,0,0,0,1,0,-1,0,0,0,2,0],indices:[0,1,2,0,1,3]};
 const before=JSON.stringify([a,b]);
 assert.deepEqual(build([a,b]),{positions:[0,0,0,1,0,0,0,1,0,-1,0,0],indices:[0,1,2,0,2,3]});
 assert.equal(JSON.stringify([a,b]),before);
 assert.throws(()=>build([{...a,indices:[0,0,0]}]),/nondegenerate/i);
 assert.throws(()=>build([{...a,indices:[0,1,99]}]),/invalid/i);
 assert.throws(()=>build([{...a,positions:[NaN,...a.positions.slice(1)]}]),/invalid/i);
 assert.throws(()=>build([{positions:Array(65537*3).fill(0),indices:[0,1,2]}]),/budget/i);
 console.log('GRAPH COLLIDER V2 PASS: seam welding, degenerate rejection, bounds and immutability.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
