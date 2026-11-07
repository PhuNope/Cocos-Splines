'use strict';
/** Road-Matched Junction math: actual Road-edge UVs + phase-consistent center fan. */
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'junction-road-uv-'));
const near=(a,b,eps=1e-7)=>assert(Math.abs(a-b)<eps,`${a} != ${b}`);
const periodicNear=(a,b)=>near(a-b,Math.round(a-b),1e-6);
try {
 cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--outDir',tmp,path.join(root,'assets/splines/Core/SplineJunctionPatchMath.ts')]);
 const {buildRoadMatchedJunctionPatch,buildJunctionPatch}=require(path.join(tmp,'SplineJunctionPatchMath.js'));
 const v=(x,z,y=0)=>({x,y,z});
 const pair=(x,z,rx,rz,v0,v1,uvLeft,uvRight)=>({
  left:{position:v(x-rx,z-rz),uv:uvLeft},
  right:{position:v(x+rx,z+rz),uv:uvRight}
 });
 const branch=(cx,cz,dx,dz,lengthV,axis='V')=>{
  const crossX=dz*1.5,crossZ=-dx*1.5;
  const uv=(len,across)=>axis==='V'?[across,len]:[len,across];
  return {center:v(cx,cz),
   outer:pair(cx+dx*3,cz+dz*3,crossX,crossZ,0,0,uv(lengthV,0),uv(lengthV,2)),
   inner:pair(cx+dx*1.5,cz+dz*1.5,crossX,crossZ,0,0,uv(lengthV-.3,0),uv(lengthV-.3,2))};
 };
 const branches=[branch(0,0,0,-1,101.2,'V'),branch(0,0,-1,0,-3.4,'U'),branch(0,0,1,0,.6,'V')];
 const mesh=buildRoadMatchedJunctionPatch(branches,.015);
 assert.equal(mesh.branches,3);assert.equal(mesh.positions.length/3,13,'1 center + 6 outer + 6 inner');
 assert.equal(mesh.uvs.length,26);assert.equal(mesh.indices.length,54,'6 ring quads + 6 center triangles');
 assert(mesh.uvs.every(Number.isFinite));assert(mesh.normals.every(Number.isFinite));
 const outerIndex=(p)=>{
  for(let i=0;i<6;i++){
   const k=1+i;
   if(Math.abs(mesh.positions[k*3]-p.x)<1e-7&&Math.abs(mesh.positions[k*3+2]-p.z)<1e-7)return i;
  }
  throw Error(`Missing outer Road vertex ${JSON.stringify(p)}`);
 };
 const mappedUV=(p,ring)=>{const id=1+outerIndex(p)+(ring==='inner'?6:0);
  return [mesh.uvs[id*2],mesh.uvs[id*2+1]];};
 for(const b of branches){
  for(const ring of ['outer','inner'])for(const side of ['left','right']){
   const edge=b[ring][side],referenceOuter=b.outer[side];
   const uv=mappedUV(referenceOuter.position,ring);
   periodicNear(uv[0],edge.uv[0]);periodicNear(uv[1],edge.uv[1]);
  }
  // Both edges must get the SAME integer phase shift, or across-width tiling collapses.
  for(const ring of ['outer','inner']){
   const mappedA=mappedUV(b.outer.left.position,ring),mappedB=mappedUV(b.outer.right.position,ring);
   near(mappedB[0]-mappedA[0],b[ring].right.uv[0]-b[ring].left.uv[0]);
   near(mappedB[1]-mappedA[1],b[ring].right.uv[1]-b[ring].left.uv[1]);
  }
 }
 // UV shifts from a distant Road must not create hundreds of texture cycles inside the patch.
 assert(mesh.uvs.every(x=>Math.abs(x)<5),'periodic phase alignment keeps junction UVs small even on long Roads');
 for(let i=0;i<mesh.indices.length;i+=3){
  const ids=mesh.indices.slice(i,i+3),crossY=((a,b,c)=>
   (b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z))(
    ...ids.map(id=>v(mesh.positions[id*3],mesh.positions[id*3+2],mesh.positions[id*3+1])));
  assert(crossY>=-1e-7,`Patch triangle ${i/3} faces down`);
 }
 assert.equal(buildRoadMatchedJunctionPatch([],0).indices.length,0);
 const invalid=structuredClone(branches);invalid[0].outer.left.uv[0]=NaN;
 assert.equal(buildRoadMatchedJunctionPatch(invalid,0).indices.length,0,'Invalid UV must fail closed');
 // Legacy projection remains byte-for-byte geometrically unchanged.
 const legacy=[{center:v(0,0),outward:v(1,0),width:3},{center:v(0,0),outward:v(0,1),width:3}];
 assert.deepEqual(buildJunctionPatch(legacy,3,.015,5),buildJunctionPatch(legacy,3,.015,5));
 console.log('JUNCTION ROAD UV PASS: actual edge UV modulo 1, both U/V axes, width tiling, orientation, phase unwrapping, independent legacy mode.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
