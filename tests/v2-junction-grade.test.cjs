'use strict';
/** Opt-in shallow longitudinal grade on Junction 3/4 arms; no banking. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'v2-junction-grade-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
  '--rootDir',path.join(root,'src-v2'),'--outDir',tmp,
  path.join(root,'src-v2/geometry/JunctionPatchV2.ts')],{stdio:'pipe'});
 const {buildJunctionPatchV2}=require(path.join(tmp,'geometry/JunctionPatchV2.js'));
 const edge=(x,y,z,u,v)=>({position:{x,y,z},uv0:{x:u,y:v}});
 const branches=(count,grade=.08)=>Array.from({length:count},(_,i)=>{
  const theta=i*2*Math.PI/count,rad={x:Math.sin(theta),z:Math.cos(theta)},
   right={x:rad.z,z:-rad.x},height=(i%2?1:-1)*grade*4;
  const at=x=>edge(rad.x*4+right.x*x,height,rad.z*4+right.z*x,4/5,(x+2)/4);
  return {endpoint:{x:0,y:0,z:0},left:at(-2),middle:at(0),right:at(2)};
 });
 const near=(a,b)=>Math.abs(a-b)<2e-5;
 for(const count of [3,4]){
  const input=branches(count),output=buildJunctionPatchV2(input,{gradeMode:'gentle',maxGrade:.1});
  const mesh=output.mesh;
  assert.equal(output.report.branches,count);
  assert.equal(mesh.vertexCount,1+6*count);
  assert(mesh.positions.every(Number.isFinite)&&mesh.normals.every(Number.isFinite));
  assert(mesh.normals.some((_,i)=>i%3!==1&&Math.abs(mesh.normals[i])>.0001),
   'Sloped patch should have tilted normals');
  for(const branch of input)for(const edge of [branch.left,branch.middle,branch.right]){
   let matched=false;
   for(let i=0;i<mesh.vertexCount;i++){
    if(near(mesh.positions[3*i],edge.position.x)&&near(mesh.positions[3*i+1],edge.position.y)&&
       near(mesh.positions[3*i+2],edge.position.z)){
      const u=mesh.uv0[2*i]-edge.uv0.x,v=mesh.uv0[2*i+1]-edge.uv0.y;
      if(near(u,Math.round(u))&&near(v,Math.round(v)))matched=true;
    }
   }
   assert(matched,'Junction grade boundary must match exact Road position and Repeat UV0');
  }
  for(const group of mesh.submeshes)for(let i=0;i<group.indices.length;i+=3){
   const [a,b,c]=Array.from(group.indices.slice(i,i+3),k=>({
    x:mesh.positions[3*k],y:mesh.positions[3*k+1],z:mesh.positions[3*k+2]}));
   const crossY=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);
   assert(crossY>1e-7,'Gentle grade must not reverse projected triangle winding: '+JSON.stringify({count,i,crossY,a,b,c}));
  }
  assert.throws(()=>buildJunctionPatchV2(input),/flat only/);
  assert.throws(()=>buildJunctionPatchV2(input,{gradeMode:'gentle',maxGrade:.03}),/grade exceeds/);
  const banked=input.map((b,i)=>i!==0?b:{
   ...b,left:{...b.left,position:{...b.left.position,y:b.left.position.y+.08}}});
  assert.throws(()=>buildJunctionPatchV2(banked,{gradeMode:'gentle'}),/banked/);
  assert.deepEqual(
   Array.from(buildJunctionPatchV2(input,{gradeMode:'gentle',maxGrade:.1}).mesh.uv0),
   Array.from(mesh.uv0),'UV must be deterministic across rebuilds');
 }
 assert.throws(()=>buildJunctionPatchV2(branches(3),{gradeMode:'gentle',maxGrade:.8}),/Invalid Junction/);
 console.log('V2 JUNCTION GRADE PASS: 3/4 arms, normals, exact UV seams, flat default, grade/bank limits.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
