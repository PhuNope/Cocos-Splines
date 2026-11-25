'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
 path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-graph-mesh-deform-'));
const almost=(x,y)=>assert(Math.abs(x-y)<1e-5,x+' != '+y);
const vec=(x=0,y=0,z=0)=>({x,y,z});
const frame=(z=0,right=vec(1),up=vec(0,1),forward=vec(0,0,1))=>({
 position:vec(0,0,z),right,up,forward,distance:z,widthFactor:1,
});
const settings=(overrides={})=>({
 width:2,height:1,deformShape:0,segments:4,repeats:2,
 uvMetersPerRepeat:2,...overrides,
});
const graph=(overrides={})=>({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'width1',type:'width',input:'source',multiplier:1},
 {id:'meshDeform',type:'meshDeform',input:'width1',...settings(overrides)},
 {id:'output',type:'output',input:'meshDeform'}],output:'output'});
const xyz=(a,i)=>a.slice(i*3,i*3+3);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[
 a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const facing=(mesh,triangle)=>{
 const [a,b,c]=mesh.indices.slice(triangle*3,triangle*3+3).map(i=>xyz(mesh.positions,i));
 return cross(sub(b,a),sub(c,a));
};
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false',
   '--outDir',temp],{stdio:'pipe'});
 const {createDeformPresetMesh,buildGraphMeshDeformGeometry}=
   require(temp+'/Core/SplineGraphMeshDeformMath.js');
 const {GeometryGraphRunner,compileGeometryGraph}=
   require(temp+'/Core/SplineGeometryGraph.js');
 const editor=require(root+'/dist/SplineGeometryGraphVisualModel.js');
 const original=[frame(0),frame(5),frame(10)];
 const frozen=JSON.stringify(original);
 const preset=createDeformPresetMesh(settings());
 assert.equal(preset.positions.length/3,10);
 assert.equal(preset.indices.length,24);
 assert.equal(preset.uvs.length,20);
 const result=buildGraphMeshDeformGeometry(original,settings(),false);
 assert.equal(result.ringCount,10);
 assert.equal(result.bands,1);
 assert.equal(result.positions.length/3,20);
 assert.equal(result.indices.length,48);
 almost(result.positions[0],-1);
 almost(result.positions[2],0);
 almost(result.positions[8*3+2],5);
 almost(result.positions[10*3+2],5);
 almost(result.positions[19*3+2],10);
 almost(result.uvs[1],0);almost(result.uvs[(19*2)+1],5);
 assert(dot(facing(result,0),xyz(result.normals,result.indices[0]))>0,
   'strip triangles and computed normals must agree');
 assert(result.normals.every(Number.isFinite));
 assert.equal(JSON.stringify(original),frozen,'frames remain immutable');
 const closed=buildGraphMeshDeformGeometry(original,settings(),true);
 assert.equal(closed.indices.length,result.indices.length,'closed path has no end caps');
 const box=buildGraphMeshDeformGeometry(original,settings({
  deformShape:1,segments:3,repeats:2
 }),false);
 assert.equal(box.bands,4);
 assert.equal(box.positions.length/3,4*2*4*2);
 assert.equal(box.indices.length,4*3*6*2);
 assert(dot(facing(box,0),xyz(box.normals,box.indices[0]))>0,
  'box faces outward and keep hard edges');
 const mirror=buildGraphMeshDeformGeometry([frame(0,vec(-1)),frame(10,vec(-1))],
   settings({repeats:1}),false);
 assert(dot(facing(mirror,0),xyz(mirror.normals,mirror.indices[0]))>0,
   'reflected frame normal matches reversed winding');
 assert(mirror.normals[1]>.9,'reflected strip still faces local +Y');
 const nonuniform=buildGraphMeshDeformGeometry(
  [frame(0,vec(2),vec(0,.5)),frame(10,vec(2),vec(0,.5))],
  settings({repeats:1}),false);
 almost(nonuniform.positions[0],-2);
 assert(dot(facing(nonuniform,0),xyz(nonuniform.normals,nonuniform.indices[0]))>0);
 const varying=original.map((f,i)=>({...f,widthFactor:i+1}));
 const widened=buildGraphMeshDeformGeometry(varying,settings({repeats:1,segments:2}),false);
 almost(widened.positions[0],-1);
 almost(widened.positions[(widened.positions.length/3-2)*3],-3);
 const curved=[frame(0),{...frame(5),position:vec(2,0,5)},{...frame(10),position:vec(2,0,10)}];
 const bent=buildGraphMeshDeformGeometry(curved,settings({repeats:1}),false);
 assert(bent.positions.some((n,i)=>i%3===0&&n>1),'path positions bend source mesh');
 for(const bad of [
   {width:0},{height:0},{segments:1},{segments:65},{segments:2.5},
   {repeats:0},{repeats:17},{repeats:1.5},{deformShape:2},
   {deformShape:-1},{deformShape:0.5},{uvMetersPerRepeat:0},
 ])assert.throws(()=>buildGraphMeshDeformGeometry(original,settings(bad),false));
 assert.throws(()=>buildGraphMeshDeformGeometry(
  [frame(0),frame(10,vec(0))],settings(),false),/degenerate/);
 assert.throws(()=>buildGraphMeshDeformGeometry(
  [frame(0),frame(10,vec(-1))],settings(),false),/handedness changed/);
 assert.throws(()=>buildGraphMeshDeformGeometry(
  [frame(0),frame(0)],settings(),false),/positive source arc length/);
 const runner=new GeometryGraphRunner();
 const compiled=compileGeometryGraph(graph());
 const context={frames:original,revision:'rev1',closed:false};
 const mesh=runner.evaluate(compiled,context);
 assert.deepEqual(runner.metrics,{computed:4,reused:0,nodes:4});
 assert.equal(mesh.positions.length,result.positions.length);
 const expected=JSON.stringify(mesh);
 mesh.positions[0]=999;
 assert.equal(JSON.stringify(runner.evaluate(compiled,context)),expected,
   'external mesh edits cannot mutate runner cache');
 assert.deepEqual(runner.metrics,{computed:0,reused:4,nodes:4});
 runner.evaluate(compileGeometryGraph(graph({repeats:3})),context);
 assert.deepEqual(runner.metrics,{computed:2,reused:2,nodes:4},
   'Mesh Deform parameters recompute only deform and output');
 const latest=JSON.stringify(runner.evaluate(compileGeometryGraph(graph({repeats:3})),context));
 assert.throws(()=>runner.evaluate(compiled,{...context,revision:'bad',
  frames:[frame(0),frame(10,vec(0))]}),/degenerate/);
 assert.equal(JSON.stringify(runner.evaluate(compileGeometryGraph(graph({repeats:3})),context)),
  latest,'failed evaluation must retain previous cache');
 for(const invalid of [{segments:-2},{segments:2.5},{repeats:32},
  {deformShape:5},{height:101},{customCode:'evil'}]){
  assert.throws(()=>compileGeometryGraph(graph(invalid)));
  assert.throws(()=>editor.parseGraph(JSON.stringify(graph(invalid))));
 }
 const sample=JSON.stringify(graph());
 assert.deepEqual(editor.parseGraph(sample).ordered.map(n=>n.type),
  compileGeometryGraph(graph()).nodes.map(n=>n.type));
 const controls=editor.renderNodeParameters(sample,'meshDeform');
 for(const key of ['width','height','deformShape','segments','repeats','uvMetersPerRepeat'])
  assert(controls.includes('data-graph-param="'+key+'"'));
 assert(controls.includes('Box Shell'));
 const sourceGraph=JSON.stringify({version:1,nodes:[
  {id:'source',type:'spline'},{id:'ribbon',type:'ribbon',input:'source',width:2},
  {id:'output',type:'output',input:'ribbon'}],output:'output'});
 const swapped=editor.applyGraphEdit(sourceGraph,'replace-generator',{type:'meshDeform'});
 assert.deepEqual(editor.parseGraph(swapped).ordered.map(n=>n.type),
  ['spline','meshDeform','output']);
 assert.equal(editor.parseGraph(swapped).map.get('meshDeform').width,2);
 assert(!Object.hasOwn(editor.parseGraph(swapped).map.get('meshDeform'),'capEnds'),
  'Mesh Deform must not receive unsupported capEnds during conversion');
 const inserted=editor.applyGraphEdit(swapped,'insert',{type:'offset',before:'meshDeform'});
 assert.deepEqual(editor.parseGraph(inserted).ordered.map(n=>n.type),
  ['spline','offset','meshDeform','output']);
 const restore=editor.applyGraphEdit(inserted,'replace-generator',{type:'extrude'});
 assert.deepEqual(compileGeometryGraph(JSON.parse(restore)).nodes.map(n=>n.type),
  ['spline','offset','extrude','output']);
 assert(require(root+'/package.json').scripts.test.includes('geometry-graph-mesh-deform-v2.test.cjs'));
 console.log('GEOMETRY GRAPH MESH DEFORM V2 PASS: strip, box, repeats, UV, mirrored/anisotropic frames, atomic cache, editor validation.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
