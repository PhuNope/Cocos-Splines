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
 const {partitionGraphGeometry}=require(dir+'/Core/SplineGraphChunkMath.js');
 const {partitionBakeGeometry}=require(root+'/dist/SplineGeometryMeshChunk.js');
 const many={positions:[],normals:[],uvs:[],indices:[],triangleMaterialSlots:[],bands:0,ringCount:0};
 for(let i=0;i<600;i++){
  const x=i%2?100+i*.01:i*.01,k=many.positions.length/3;
  many.positions.push(x,0,0,x+1,0,0,x,1,0);many.normals.push(0,0,1,0,0,1,0,0,1);many.uvs.push(0,0,1,0,0,1);many.indices.push(k,k+1,k+2);many.triangleMaterialSlots.push(i%3);
 }
 const parts=partitionGraphGeometry(many,256);
 assert.deepEqual(parts.map(({bands,ringCount,...g})=>g),partitionBakeGeometry(many,256));
 assert.throws(()=>partitionGraphGeometry(many,256,2),/chunk count/i);
 const {selectGraphLod,reduceGraphLodSource,graphLodPathDistance,supportsGraphLod}=require(dir+'/Core/SplineGraphLodMath.js');
 assert.equal(selectGraphLod(21,20,60,0),0);assert.equal(selectGraphLod(22,20,60,0),1);
 assert.equal(selectGraphLod(19,20,60,1),1);assert.equal(selectGraphLod(17,20,60,1),0);
 assert.equal(selectGraphLod(100,20,60,0),2);assert.equal(selectGraphLod(0,20,60,2),0);
 assert.throws(()=>selectGraphLod(10,20,21,0),/distances/i);
 const v=(x=0,y=0,z=0)=>({x,y,z});
 const source={revision:'a',closed:false,frames:Array.from({length:13},(_,i)=>({position:v(0,0,i),forward:v(0,0,1),right:v(1),up:v(0,1),distance:i}))};
 const lod1=reduceGraphLodSource(source,1),lod2=reduceGraphLodSource(source,2);
 assert.equal(lod1.frames.length,7);assert.equal(lod2.frames.length,4);assert.equal(lod2.frames[3],source.frames[12]);
 assert.equal(lod2.frames[1].distance,4);assert.equal(reduceGraphLodSource({...source,closed:true},2).frames.length,5);
 assert.equal(graphLodPathDistance(v(3,0,6),[source],p=>p),3);
 assert.equal(graphLodPathDistance(v(3,0,6),[source],p=>v(p.x+3,p.y,p.z)),0);
 assert(supportsGraphLod([{type:'spline'},{type:'extrude'},{type:'output'}]));assert(!supportsGraphLod([{type:'conform'}]));
 console.log('GRAPH COLLIDER V2 PASS: seam welding, degenerate rejection, bounds and immutability.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
