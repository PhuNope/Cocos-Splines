'use strict';
// Regression for the original issue: source capsule/cylinder with long Axis Y
// was mirrored by the deformation mapping and the visible front faces became
// back faces. Check geometry AND generated normals for all 3 axes.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-mesh-winding-'));
try {
  cp.execFileSync('tsc',['--module','commonjs','--target','ES2020','--outDir',dir,path.resolve(__dirname,'../assets/splines/Core/SplineMeshDeformMath.ts')]);
  const {deformMesh,recomputeNormals}=require(path.join(dir,'SplineMeshDeformMath.js'));
  const frame=t=>({position:{x:0,y:0,z:t*10},right:{x:1,y:0,z:0},up:{x:0,y:1,z:0},forward:{x:0,y:0,z:1}});
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  function makeOutwardStrip(axis){
    // x/y/z = source coords; the strip is at sideways=+1 and spans up=-1 to +1.
    const sideways=axis===0?2:0,upwards=axis===1?2:1;
    function vert(long,up){const p=[0,0,0];p[axis]=long;p[sideways]=1;p[upwards]=up;return p;}
    const vs=[vert(0,-1),vert(0,1),vert(2,-1),vert(2,1)];
    const side=[0,0,0];side[sideways]=1;
    let tri=[0,1,2];
    if(dot(cross(sub(vs[1],vs[0]),sub(vs[2],vs[0])),side)<0)tri=[0,2,1];
    const inds=[...tri,...(tri[1]===1?[1,3,2]:[2,3,1])];
    const src={positions:vs.flat(),indices:inds,uvs:[0,0,1,0,0,1,1,1]};
    const norms=recomputeNormals(src.positions,src.indices);
    assert(dot(norms.slice(0,3),side)>.9,'Source mesh has outward front faces');
    return src;
  }
  const opt={repeats:1,start:0,end:1,crossScale:1,depthScale:1,uvMode:2,uvTilesPerUnit:1,length:10};
  for(const axis of [0,1,2]){
    const input=makeOutwardStrip(axis);
    for(const repeats of [1,3]){
      const out=deformMesh(input,frame,{...opt,axis,repeats});
      assert.equal(out.indices.length,input.indices.length*repeats);
      // All 'radial' normals should point to +right = +X, not -X (inward).
      for(let i=0;i<out.normals.length;i+=3){
        assert(out.normals[i]>.9,`Axis=${axis} repeats=${repeats} vertex=${i/3} normalX=${out.normals[i]}`);
      }
      // CPU normals must agree with final triangle winding: fixing normals
      // without fixing indices doesn't solve back-face culling.
      const recomputed=recomputeNormals(out.positions,out.indices);
      for(let i=0;i<out.normals.length;i++)assert(Math.abs(out.normals[i]-recomputed[i])<1e-9);
      const inverted=deformMesh(input,frame,{...opt,axis,repeats,flipFaces:true});
      assert.deepEqual(inverted.positions,out.positions,'Flip Faces must not move geometry');
      assert.deepEqual(inverted.uvs,out.uvs,'Flip Faces must not change UV tiling');
      for(let i=0;i<inverted.normals.length;i+=3)assert(inverted.normals[i]<-.9,'manual face flip must point -right');
      for(let i=0;i<out.indices.length;i+=3){
        assert.equal(inverted.indices[i],out.indices[i]);
        assert.equal(inverted.indices[i+1],out.indices[i+2]);
        assert.equal(inverted.indices[i+2],out.indices[i+1]);
      }
    }
  }
  console.log('MESH WINDING PASS: outward-facing triangles/normals on X,Y,Z; Stretch+Repeat; optional Flip Faces.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
