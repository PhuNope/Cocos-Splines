'use strict';
// Fixed physical tile length; partial last segment must be clipped, NOT squeezed.
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-natural-'));
try{
  cp.execFileSync('tsc',['--module','commonjs','--target','ES2020','--outDir',dir,path.resolve(__dirname,'../assets/splines/Core/SplineMeshDeformMath.ts')]);
  const {deformMesh,clipMeshAtFraction}=require(path.join(dir,'SplineMeshDeformMath.js'));
  const src={
    positions:[-1,0,0, 1,0,0, -1,0,2, 1,0,2],
    indices:[0,2,1,1,2,3],
    // Deliberately a non-tiling UV atlas with a V island confined to 0.32..0.56.
    uvs:[.12,.32,.75,.32,.12,.56,.75,.56],
    normals:[0,1,0,0,1,0,0,1,0,0,1,0]
  };
  const frame=t=>({position:{x:9*t,y:0,z:0},right:{x:0,y:0,z:-1},up:{x:0,y:1,z:0},forward:{x:1,y:0,z:0}});
  const base={axis:2,repeats:99,repeatLayout:1,start:0,end:1,crossScale:1,depthScale:1,uvMode:0,uvTilesPerUnit:1,length:9};
  const output=deformMesh(src,frame,base);
  // Nine units / two units per tile => four complete source meshes + one 1-unit crop.
  assert.equal(output.positions.length/3,21,'Expected 4 full tiles and 1 cropped (clipping may add a diagonal-intersection vertex)');
  assert.equal(output.indices.length,33,'Each section is a valid clipped strip');
  const x=output.positions.filter((_,i)=>i%3===0);
  assert(Math.abs(Math.max(...x)-9)<1e-8,'No geometry exceeds the endpoint');
  assert(Math.abs(Math.min(...x))<1e-8,'Geometry covers the range start');
  assert(x.some(v=>Math.abs(v-8)<1e-8));
  assert(x.some(v=>Math.abs(v-6)<1e-8));
  assert(x.some(v=>Math.abs(v-4)<1e-8));
  assert(x.some(v=>Math.abs(v-2)<1e-8));
  assert(output.uvs.every(v=>v>=.12-1e-8&&v<=.75+1e-8), 'Original UV atlas must never receive repeated out-of-range V');
  const uvAtEnd=[];
  for(let i=0;i<x.length;i++)if(Math.abs(x[i]-9)<1e-8)uvAtEnd.push(output.uvs[i*2+1]);
  assert(uvAtEnd.length>=2);
  for(const uv of uvAtEnd)assert(Math.abs(uv-.44)<1e-7,'Last tile interpolates UV instead of resetting or stretching V');
  for(const value of [...output.positions,...output.normals,...output.tangents])assert(Number.isFinite(value));
  assert.equal(output.tangents.length,(output.positions.length/3)*4,'PBR needs 4-component tangents');
  assert(output.normals.every((v,i)=>i%3===1?Math.abs(v-1)<1e-8:Math.abs(v)<1e-8));
  const clipped=clipMeshAtFraction(src,2,.5);
  assert.equal(clipped.indices.length,9);
  assert(Math.abs(Math.max(...clipped.positions.filter((_,i)=>i%3===2))-1)<1e-8);
  assert(clipped.uvs.some(v=>Math.abs(v-.44)<1e-8));
  const manual=deformMesh(src,frame,{...base,repeatLayout:0,repeats:2});
  assert.equal(manual.positions.length/3,8,'Legacy count remains available');
  assert(Math.abs(Math.max(...manual.positions.filter((_,i)=>i%3===0))-9)<1e-8,'Legacy count fills range by stretching');
  const override=deformMesh(src,frame,{...base,tileLength:3});
  assert.equal(override.positions.length/3,12,'User override tile length respected');
  assert(Math.abs(Math.max(...override.positions.filter((_,i)=>i%3===0))-9)<1e-8);
  const small=deformMesh(src,frame,{...base,length:1});
  assert(Math.abs(Math.max(...small.positions.filter((_,i)=>i%3===0))-9)<1e-8,'Test frame parameter still has fixed total 9');
  assert.equal(small.positions.length/3,5,'Spline shorter than one tile: one clipped section');
  // Axis X file, with large original pivot coordinate; UV atlas must survive axis swaps.
  const alongX={positions:[100,0,-1,100,0,1,102,0,-1,102,0,1],indices:[0,2,1,1,2,3],uvs:[.12,.32,.75,.32,.12,.56,.75,.56]};
  const xOut=deformMesh(alongX,frame,{...base,axis:0});
  assert.equal(xOut.positions.length/3,21);
  assert(xOut.uvs.every(v=>v>=.12-1e-8&&v<=.75+1e-8));
  assert.equal(xOut.tangents.length,xOut.positions.length/3*4);
  assert.throws(()=>deformMesh(src,frame,{...base,tileLength:0.001,length:999}),/Too many natural-length repeats/);
  console.log('NATURAL REPEAT PASS: FBX UV atlas, physical length, partial clipping, tangents, axis X, manual legacy, tile override.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
