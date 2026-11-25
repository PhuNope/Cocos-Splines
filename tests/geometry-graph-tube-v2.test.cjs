'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
 path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-graph-tube-'));
const almost=(a,b,e=1e-5)=>assert(Math.abs(a-b)<e,a+' != '+b);
const vec=(x=0,y=0,z=0)=>({x,y,z});
const frame=(z=0,right=vec(1),up=vec(0,1),forward=vec(0,0,1))=>({
 position:vec(0,0,z),right,up,forward,distance:z,widthFactor:1,
});
const tube=(override={})=>({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'tube',type:'tube',input:'source',radius:1,radialSegments:8,...override},
 {id:'output',type:'output',input:'tube'}],output:'output'});
const xyz=(arr,i)=>arr.slice(i*3,i*3+3);
const cross=(a,b)=>vec(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
function winding(mesh,index){
 const [a,b,c]=mesh.indices.slice(index*3,index*3+3).map(i=>xyz(mesh.positions,i));
 return cross(sub(b,a),sub(c,a));
}
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false','--outDir',temp],{stdio:'pipe'});
 const {buildTubeGeometry}=require(temp+'/Core/SplineTubeMath.js');
 const {compileGeometryGraph,GeometryGraphRunner}=require(temp+'/Core/SplineGeometryGraph.js');
 const {parseGraph,applyGraphEdit,renderNodeParameters}=require(root+'/dist/SplineGeometryGraphVisualModel.js');
 const input=[frame(0),frame(2)],source=JSON.stringify(input);
 const raw=buildTubeGeometry(input,{radius:1,radialSegments:8,uvMetersPerRepeat:2,capEnds:false},false);
 assert.equal(raw.ringCount,2);assert.equal(raw.bands,8);
 assert.equal(raw.positions.length/3,18,'duplicate angular seam per ring');
 assert.equal(raw.indices.length,8*6);
 almost(raw.positions[0],1);
 almost(raw.positions[1],0);
 almost(raw.positions[2],0);
 almost(raw.positions[8*3],1,'duplicate ring seam');
 almost(raw.uvs[16],1,'angular seam UV');
 almost(raw.uvs[(9*2)+1],1,'distance-based UV');
 assert.deepEqual(xyz(raw.normals,0),[1,0,0]);
 almost(dot(winding(raw,0),xyz(raw.normals,0))>0?1:0,1,'side triangles face outwards');
 assert.equal(JSON.stringify(input),source,'source frames must remain immutable');
 const cap=buildTubeGeometry(input,{radius:1,radialSegments:8,uvMetersPerRepeat:2,capEnds:true},false);
 assert.equal(cap.positions.length/3,18+2*9);
 assert.equal(cap.indices.length,8*6+2*8*3);
 assert.deepEqual(xyz(cap.normals,18),[0,0,-1]);
 assert.deepEqual(xyz(cap.normals,27),[0,0,1]);
 assert(dot(winding(cap,16),xyz(cap.normals,18))>0,'start cap faces outside');
 assert(dot(winding(cap,24),xyz(cap.normals,27))>0,'end cap faces outside');
 const closed=buildTubeGeometry(input,{radius:1,radialSegments:8,uvMetersPerRepeat:2,capEnds:true},true);
 assert.equal(closed.positions.length,raw.positions.length,'closed path ignores end caps');
 assert.equal(closed.indices.length,raw.indices.length);
 const skew=[frame(0,vec(2),vec(0,.5)),frame(2,vec(2),vec(0,.5))];
 const scaled=buildTubeGeometry(skew,{radius:1,radialSegments:8,uvMetersPerRepeat:2,capEnds:false},false);
 const oblique=xyz(scaled.normals,1);
 const nx=1/2,ny=1/.5,d=Math.hypot(nx,ny);
 almost(oblique[0],nx/d);almost(oblique[1],ny/d);
 const mirrored=[frame(0,vec(-1)),frame(2,vec(-1))];
 const reflected=buildTubeGeometry(mirrored,{radius:1,radialSegments:8,uvMetersPerRepeat:2,capEnds:true},false);
 assert.deepEqual(xyz(reflected.normals,0),[-1,0,0]);
 assert(dot(winding(reflected,0),xyz(reflected.normals,0))>0,'mirrored side winding faces out');
 assert(dot(winding(reflected,16),xyz(reflected.normals,18))>0,'mirrored cap winding faces out');
 const graph=compileGeometryGraph(tube());
 const runner=new GeometryGraphRunner();
 const ctx={frames:input,closed:false,revision:'tube-rev-1'};
 let result=runner.evaluate(graph,ctx);
 assert.equal(result.positions.length,raw.positions.length);
 assert.deepEqual(runner.metrics,{computed:3,reused:0,nodes:3});
 const good=JSON.stringify(result);
 result.positions[0]=999;
 assert.equal(JSON.stringify(runner.evaluate(graph,ctx)),good,'cache clones output mesh arrays');
 assert.deepEqual(runner.metrics,{computed:0,reused:3,nodes:3});
 const modified=compileGeometryGraph(tube({radius:2}));
 runner.evaluate(modified,ctx);
 assert.deepEqual(runner.metrics,{computed:2,reused:1,nodes:3},
   'Editing Tube parameters only dirties Tube/Output');
 const valid=JSON.stringify(runner.evaluate(modified,ctx));
 for(const bad of [{radius:-1},{radialSegments:2},{radialSegments:4.5},
  {radialSegments:33},{uvMetersPerRepeat:0},{capEnds:'yes'},{unsafe:1}]){
  assert.throws(()=>compileGeometryGraph(tube(bad)));
 }
 assert.throws(()=>runner.evaluate(modified,{...ctx,revision:'invalid',
  frames:[input[0],{...input[1],right:vec(0)}]}),/degenerate/);
 assert.equal(JSON.stringify(runner.evaluate(modified,ctx)),valid,
   'Failed Tube evaluation cannot change successful graph cache');
 const model=JSON.stringify({version:1,nodes:[
  {id:'source',type:'spline'},
  {id:'ribbon',type:'ribbon',input:'source',width:4},
  {id:'output',type:'output',input:'ribbon'},
 ],output:'output'});
 const swapped=applyGraphEdit(model,'replace-generator',{type:'tube'});
 assert.deepEqual(parseGraph(swapped).ordered.map(n=>n.type),['spline','tube','output']);
 assert.deepEqual(compileGeometryGraph(JSON.parse(swapped)).nodes.map(n=>n.type),
  ['spline','tube','output']);
 assert(renderNodeParameters(swapped,'tube').includes('data-graph-param="radialSegments"'));
 assert.equal(parseGraph(swapped).map.get('output').input,'tube');
 const withWidth=applyGraphEdit(swapped,'insert',{type:'width',before:'tube'});
 assert.deepEqual(parseGraph(withWidth).ordered.map(n=>n.type),
  ['spline','width','tube','output']);
 const restored=applyGraphEdit(withWidth,'replace-generator',{type:'ribbon'});
 assert.deepEqual(parseGraph(restored).ordered.map(n=>n.type),
  ['spline','width','ribbon','output']);
 assert.equal(parseGraph(restored).map.get('output').input,'ribbon');
 assert.equal(model,JSON.stringify(JSON.parse(model)),'Existing Ribbon graph not mutated');
 assert.throws(()=>parseGraph(JSON.stringify(tube({radialSegments:2.5}))));
 assert(require(root+'/package.json').scripts.test.includes('geometry-graph-tube-v2.test.cjs'));
 console.log('GEOMETRY TUBE V2 PASS: cap/open/closed, anisotropic/mirrored normals/winding, graph cache, typed editor switching and bound rejection.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
