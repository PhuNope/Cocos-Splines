'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-deform-test-'));
try{
  cp.execFileSync('tsc',['--module','commonjs','--target','ES2020','--outDir',dir,path.resolve(__dirname,'../assets/splines/Core/SplineMeshDeformMath.ts')]);
  const {deformMesh,recomputeNormals}=require(path.join(dir,'SplineMeshDeformMath.js'));
  // A 2-unit source strip with four vertices, +Z as longitudinal axis.
  const input={positions:[-1,0,0,1,0,0,-1,0,2,1,0,2],indices:[0,2,1,1,2,3],uvs:[0,0,1,0,0,1,1,1]};
  const frame=t=>({position:{x:10*t,y:0,z:0},right:{x:0,y:0,z:-1},up:{x:0,y:1,z:0},forward:{x:1,y:0,z:0}});
  const options={axis:2,repeats:1,start:0,end:1,crossScale:1,depthScale:1,uvMode:2,uvTilesPerUnit:1,length:10};
  const stretched=deformMesh(input,frame,options);
  assert.equal(stretched.positions.length,12);
  assert.equal(stretched.positions[0],0);assert.equal(stretched.positions[9],10);
  assert.equal(stretched.uvs[7],10,'UV V must be world distance for tiling');
  assert.equal(stretched.indices.length,6);
  for(const n of stretched.normals)assert(Number.isFinite(n));
  const repeat=deformMesh(input,frame,{...options,repeats:4,uvMode:1});
  assert.equal(repeat.positions.length,48);
  assert.equal(repeat.indices.length,24);
  assert.equal(repeat.positions[36],7.5);
  assert.equal(repeat.uvs.at(-1),4,'Repeated V should advance across sections');
  const shifted=deformMesh(input,frame,{...options,start:.25,end:.75});
  assert.equal(shifted.positions[0],2.5);assert.equal(shifted.positions[9],7.5);
  assert.throws(()=>deformMesh({positions:[0,0,0],indices:[0,1,2]},frame,options));
  assert.throws(()=>deformMesh({...input,positions:[-1,0,1,1,0,1,-1,0,1,1,0,1]},frame,options),/flat/);
  assert.throws(()=>deformMesh(input,frame,{...options,start:.5,end:.5}));
  const normals=recomputeNormals(input.positions,input.indices);
  assert(normals[1]>.9,'Wound triangles should produce +Y normals');
  console.log('MESH DEFORM MATH PASS: deform, repeat, UV distance, crop, normals, invalid geometry.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
