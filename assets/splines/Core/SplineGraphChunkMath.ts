import type {RoadGeometry} from './SplineRoadMath';
/** Deterministic triangle-centroid median partitions. Caller validates all
 * source streams/indices and overall input budgets before partitioning.
 * Keep original triangle winding and all vertex attributes. No clipping,
 * simplification, welding or modification to original vertex positions.
 */
export const CHUNK_TRIANGLE_COUNTS=Object.freeze([256,1024,4096,8192]);
export const MAX_CHUNKS=128;
export function partitionGraphGeometry(g:Readonly<RoadGeometry>,maxTriangles:number,maxChunks=MAX_CHUNKS):RoadGeometry[]{
 if(!Number.isInteger(maxTriangles)||maxTriangles<256||maxTriangles>8192||maxTriangles%256!==0||!Number.isInteger(maxChunks)||maxChunks<1||maxChunks>MAX_CHUNKS)
  throw Error('Invalid chunk triangle budget or chunk count.');
 const vertices=g.positions.length/3;
 if(!Number.isInteger(vertices)||vertices<3||vertices>65536||g.normals.length!==g.positions.length||g.uvs.length!==vertices*2||g.indices.length>393216||
    [g.positions,g.normals,g.uvs].some(a=>a.some(v=>!Number.isFinite(v)))||g.indices.some(i=>!Number.isInteger(i)||i<0||i>=vertices)||
    (g.triangleMaterialSlots!==undefined&&(g.triangleMaterialSlots.length!==g.indices.length/3||g.triangleMaterialSlots.some(s=>!Number.isInteger(s)||s<0||s>3))))
  throw Error('Invalid runtime chunk geometry.');
 const count=g.indices.length/3;
 if(!Number.isInteger(count)||count<1||count>maxTriangles*maxChunks)
  throw Error('Chunk Bake exceeds chunk count budget.');
 const centers=new Float64Array(count*3);
 for(let t=0;t<count;t++)for(let axis=0;axis<3;axis++){
  centers[t*3+axis]=(g.positions[g.indices[t*3]*3+axis]+g.positions[g.indices[t*3+1]*3+axis]+g.positions[g.indices[t*3+2]*3+axis])/3;
 }
 const leaves:number[][]=[];
 function split(ids:number[]):void{
  if(ids.length<=maxTriangles){
   if(leaves.length>=maxChunks)throw Error('Chunk Bake exceeds chunk count budget.');
   leaves.push(ids);return;
  }
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const t of ids)for(let a=0;a<3;a++){
   const v=centers[t*3+a];min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v);
  }
  let axis=0;
  for(let a=1;a<3;a++)if(max[a]-min[a]>max[axis]-min[axis])axis=a;
  ids.sort((a,b)=>centers[a*3+axis]-centers[b*3+axis]||a-b);
  // Divide by the number of leaves needed, avoiding needless extra chunks.
  const needed=Math.ceil(ids.length/maxTriangles),leftCount=Math.floor(needed/2);
  const cut=Math.floor(ids.length*leftCount/needed);
  split(ids.slice(0,cut));split(ids.slice(cut));
 }
 split(Array.from({length:count},(_,i)=>i));
 return leaves.map(ids=>{
  // Within each leaf preserve source triangle order.
  ids.sort((a,b)=>a-b);
  const map=new Map<number,number>(),positions:number[]=[],normals:number[]=[],uvs:number[]=[],indices:number[]=[],triangleMaterialSlots:number[]=[];
  for(const t of ids){
   for(let k=0;k<3;k++){
    const i=g.indices[t*3+k];
    let j=map.get(i);
    if(j===undefined){
     j=map.size;map.set(i,j);
     positions.push(g.positions[i*3],g.positions[i*3+1],g.positions[i*3+2]);
     normals.push(g.normals[i*3],g.normals[i*3+1],g.normals[i*3+2]);
     uvs.push(g.uvs[i*2],g.uvs[i*2+1]);
    }
    indices.push(j);
   }
   if(g.triangleMaterialSlots!==undefined)triangleMaterialSlots.push(g.triangleMaterialSlots[t]);
  }
  return {positions,normals,uvs,indices,bands:0,ringCount:0,...(g.triangleMaterialSlots===undefined?{}:{triangleMaterialSlots})};
 });
}

