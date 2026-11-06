'use strict';
// Regression for a builtin-standard rope material rendering almost black
// while the imported capsule with the same material looks correctly lit.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spline-shading-'));
try {
 const root=path.resolve(__dirname,'../assets/splines/Core');
 cp.execFileSync('tsc',['--module','commonjs','--target','ES2020','--outDir',dir,path.join(root,'SplineMeshDeformMath.ts'),path.join(root,'SplineMeshRead.ts')]);
 const {deformMesh,computeTangents}=require(path.join(dir,'SplineMeshDeformMath.js'));
 const {readNormalTriples}=require(path.join(dir,'SplineMeshRead.js'));
 const frame=t=>({position:{x:0,y:0,z:10*t},right:{x:1,y:0,z:0},up:{x:0,y:1,z:0},forward:{x:0,y:0,z:1}});
 // A smooth strip with longitudinal axis Y; source normals deliberately
 // differ from geometric face normals, so an unwanted recalc is detectable.
 const input={positions:[1,0,-1,1,2,-1,1,0,1,1,2,1],indices:[0,1,2,1,3,2],
   uvs:[0,0,0,1,1,0,1,1], normals:[0.8,0.6,0, 0.8,0.6,0, 0.8,0.6,0, 0.8,0.6,0]};
 const opt={axis:1,repeats:1,start:0,end:1,crossScale:1,depthScale:1,uvMode:2,uvTilesPerUnit:1,length:10};
 const out=deformMesh(input,frame,opt);
 assert.equal(out.tangents.length,input.positions.length/3*4,'PBR requires vec4 per-vertex tangents');
 assert.equal(out.normals.length,input.positions.length);
 assert(Math.abs(out.normals[0]-0.8)<1e-8&&Math.abs(out.normals[2]-0.6)<1e-8,
     'Source smooth normal must be transformed into spline frame, not recalculated');
 assert.equal(out.uvs[3],10,'Distance UV should use spline length');
 for(let i=0;i<out.normals.length/3;i++){
   const n=out.normals.slice(i*3,i*3+3),t=out.tangents.slice(i*4,i*4+4);
   assert(t.every(Number.isFinite),'tangent must contain only finite components');
   assert(Math.abs(Math.hypot(...t.slice(0,3))-1)<1e-8);
   assert(Math.abs(n.reduce((sum,x,j)=>sum+x*t[j],0))<1e-8,'tangent perpendicular to normal');
   assert([1,-1].includes(t[3]),'tangent.w contains binormal handedness');
 }
 const inverted=deformMesh(input,frame,{...opt,flipFaces:true});
 for(let i=0;i<out.normals.length;i++) assert(Math.abs(inverted.normals[i]+out.normals[i])<1e-8);
 assert.deepEqual(inverted.positions,out.positions,'Flip Faces must not move geometry');
 assert.deepEqual(inverted.uvs,out.uvs,'Flip Faces must not change material UVs');
 const repeated=deformMesh(input,frame,{...opt,repeats:4});
 assert.equal(repeated.tangents.length,input.positions.length/3*4*4);
 assert.equal(repeated.normals.length,input.positions.length*4);
 const noNormals=deformMesh({...input,normals:undefined},frame,opt);
 assert.equal(noNormals.tangents.length,out.tangents.length);
 const degenerates=computeTangents(out.positions,out.normals,new Array(out.uvs.length).fill(0),out.indices);
 assert(degenerates.every(Number.isFinite),'Degenerate cap UVs still need finite tangents');
 assert(Math.abs(readNormalTriples(new Int8Array([127,0,-127]),'RGB8SN')[0]-Math.SQRT1_2)<1e-12);
 assert.equal(readNormalTriples(new Int8Array([127,0,0,0]),'RGBA8SN')?.length,3);
 assert.equal(readNormalTriples(new Uint16Array([0x3c00,0,0]),'RGB16F')?.[0],1);
 assert.equal(readNormalTriples(new Int8Array([127,0,0]),'UNSUPPORTED'),null,'safe format fallback');
 const component=fs.readFileSync(path.resolve(__dirname,'../assets/splines/Components/SplineMeshDeform.ts'),'utf8');
 assert(component.includes('readNormalTriples(originalNormals,normalType)'));
 assert(component.includes('renderer.setSharedMaterial(selected,0)'),'assigned Material asset must be shared');
 assert(component.includes('this.flipFaces'));
 console.log('MESH SHADING PASS: smooth source normals, PBR tangent vec4, UV distance, Flip Faces, repeats, degenerate UV fallback.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
