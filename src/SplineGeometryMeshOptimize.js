'use strict';
/** Lossless vertex compaction in authored attribute space. No epsilon weld,
 * face deletion, material merging or vertex-cache reordering. All triangles
 * remain in original order and winding, even duplicate/degenerate faces.
 * Caller validates bounded geometry before invoking.
 */
function optimizeBakeGeometry(g){
 const map=new Map(),byOld=new Map(),positions=[],normals=[],uvs=[],indices=[];
 for(const i of g.indices){
  let j=byOld.get(i);
  if(j===undefined){
   const p=g.positions.slice(i*3,i*3+3),n=g.normals.slice(i*3,i*3+3),uv=g.uvs.slice(i*2,i*2+2);
   // Number-to-string roundtrips exactly for finite doubles; signed zero
   // is intentionally equivalent (no effect on exported mesh attributes).
   const key=[...p,...n,...uv].join(',');
   j=map.get(key);
   if(j===undefined){j=map.size;map.set(key,j);positions.push(...p);normals.push(...n);uvs.push(...uv);}
   byOld.set(i,j);
  }
  indices.push(j);
 }
 return {positions,normals,uvs,indices,...(g.triangleMaterialSlots===undefined?{}:{triangleMaterialSlots:g.triangleMaterialSlots.slice()})};
}
/** Diagnostics only. Exact degenerate geometry detected at exported Float32
 * precision. Keep faces by default, including coincident/two-sided geometry. */
function inspectBakeGeometry(g){
 let degenerateTriangles=0;
 for(let t=0;t<g.indices.length;t+=3){
  const a=g.indices[t]*3,b=g.indices[t+1]*3,c=g.indices[t+2]*3;
  const p=g.positions;
  const x=Math.fround(p[b])-Math.fround(p[a]),y=Math.fround(p[b+1])-Math.fround(p[a+1]),z=Math.fround(p[b+2])-Math.fround(p[a+2]);
  const u=Math.fround(p[c])-Math.fround(p[a]),v=Math.fround(p[c+1])-Math.fround(p[a+1]),w=Math.fround(p[c+2])-Math.fround(p[a+2]);
  if(y*w-z*v===0&&z*u-x*w===0&&x*v-y*u===0)degenerateTriangles++;
 }
 return {vertices:g.positions.length/3,triangles:g.indices.length/3,degenerateTriangles,
  unreferencedVertices:g.positions.length/3-new Set(g.indices).size};
}
module.exports={optimizeBakeGeometry,inspectBakeGeometry};
