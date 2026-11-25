'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
 path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-graph-profile-'));
const almost=(a,b,what='')=>assert(Math.abs(a-b)<1e-5,what||a+' != '+b);
const v=(x=0,y=0,z=0)=>({x,y,z});
const frame=(z=0,right=v(1),up=v(0,1),forward=v(0,0,1))=>({
 position:v(0,0,z),right,up,forward,distance:z,widthFactor:1,
});
const settings=(shape,overrides={})=>({
 width:2,height:1,profileShape:shape,uvMetersPerRepeat:2,capEnds:false,...overrides,
});
const xyz=(arr,i)=>arr.slice(i*3,i*3+3);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const triangle=(m,i)=>{
 const [a,b,c]=m.indices.slice(i*3,i*3+3).map(j=>xyz(m.positions,j));
 return {a,b,c,normal:cross(sub(b,a),sub(c,a))};
};
const graph=(overrides={})=>({version:1,nodes:[
 {id:'source',type:'spline'},
 {id:'width1',type:'width',input:'source',multiplier:1},
 {id:'extrude',type:'extrude',input:'width1',width:2,height:1,profileShape:0,
  uvMetersPerRepeat:2,capEnds:true,...overrides},
 {id:'output',type:'output',input:'extrude'},
],output:'output'});
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit','false',
  '--outDir',temp],{stdio:'pipe'});
 const {buildProfileExtrudeGeometry,GraphProfileShape}=require(temp+'/Core/SplineProfileExtrudeMath.js');
 const {compileGeometryGraph,GeometryGraphRunner}=require(temp+'/Core/SplineGeometryGraph.js');
 const editor=require(root+'/dist/SplineGeometryGraphVisualModel.js');
 const frames=[frame(0),frame(2)],before=JSON.stringify(frames);
 assert.equal(GraphProfileShape.Rectangle,0);
 assert.equal(GraphProfileShape.Beveled,1);
 assert.equal(GraphProfileShape.UChannel,2);
 const rect=buildProfileExtrudeGeometry(frames,settings(0),false);
 assert.equal(rect.bands,4);
 assert.equal(rect.ringCount,2);
 assert.equal(rect.positions.length/3,16,'four hard-edge bands with two vertices per ring');
 assert.equal(rect.indices.length,24,'four side quad bands');
 xyz(rect.normals,0).forEach((n,i)=>almost(n,[0,-1,0][i]));
 assert(dot(triangle(rect,0).normal,xyz(rect.normals,0))>0,
  'rectangle side faces outward');
 almost(rect.uvs[1],0);almost(rect.uvs[5],1,'distance UV along spline');
 almost(rect.uvs[2],1/3,'UV U proportions reflect physical profile width/height');
 const caps=buildProfileExtrudeGeometry(frames,settings(0,{capEnds:true}),false);
 assert.equal(caps.positions.length/3,24,'two independent cap vertex rings');
 assert.equal(caps.indices.length,36,'two rectangle caps each use two triangles');
 xyz(caps.normals,16).forEach((n,i)=>almost(n,[0,0,-1][i]));
 xyz(caps.normals,20).forEach((n,i)=>almost(n,[0,0,1][i]));
 assert(dot(triangle(caps,8).normal,xyz(caps.normals,16))>0,'start cap winding');
 assert(dot(triangle(caps,10).normal,xyz(caps.normals,20))>0,'end cap winding');
 assert.equal(JSON.stringify(frames),before,'never mutate sampled spline frames');
 const closed=buildProfileExtrudeGeometry(frames,settings(0,{capEnds:true}),true);
 assert.equal(closed.positions.length,rect.positions.length);
 assert.equal(closed.indices.length,rect.indices.length);
 const bevel=buildProfileExtrudeGeometry(frames,settings(1,{capEnds:true}),false);
 assert.equal(bevel.bands,8);
 assert.equal(bevel.positions.length/3,48,'bevel side and cap vertices');
 assert.equal(bevel.indices.length,84);
 const channel=buildProfileExtrudeGeometry(frames,settings(2,{width:1,height:1,capEnds:true}),false);
 assert.equal(channel.bands,8);
 assert.equal(channel.positions.length/3,48);
 assert.equal(channel.indices.length,84);
 // Cap triangles are actual 2D ear-clipped U-shapes, not triangle fans
 // that would incorrectly fill the open channel.
 let capArea=0;
 for(let i=16;i<22;i++){
  const t=triangle(channel,i);
  const area=(t.normal[2])/2;
  assert(area<0,'start cap must wind away from the spline');
  capArea+=Math.abs(area);
 }
 almost(capArea,.58,'U channel area must exclude the hollow .6 × .7 opening');
 const skew=[frame(0,v(2),v(0,.5)),frame(2,v(2),v(0,.5))];
 const skewBevel=buildProfileExtrudeGeometry(skew,settings(1),false);
 const actual=xyz(skewBevel.normals,4); // first vertex of second profile edge
 const expected=[.05,-.4,0],l=Math.hypot(...expected);
 almost(actual[0],expected[0]/l);almost(actual[1],expected[1]/l);
 assert(dot(triangle(skewBevel,2).normal,actual)>0,'nonuniform normal and winding');
 const reflected=[frame(0,v(-1)),frame(2,v(-1))];
 const mirror=buildProfileExtrudeGeometry(reflected,settings(2,{capEnds:true}),false);
 xyz(mirror.normals,0).forEach((n,i)=>almost(n,[0,-1,0][i]));
 assert(dot(triangle(mirror,0).normal,xyz(mirror.normals,0))>0,
  'mirrored frame side winding remains outward');
 assert(dot(triangle(mirror,16).normal,xyz(mirror.normals,32))>0,
  'mirrored frame cap winding remains outward');
 for(const invalid of [{width:0},{height:1000},{profileShape:3},
  {profileShape:.5},{uvMetersPerRepeat:0},{capEnds:'yes'}]){
  assert.throws(()=>buildProfileExtrudeGeometry(frames,settings(0,invalid),false));
 }
 assert.throws(()=>buildProfileExtrudeGeometry(
  [frames[0],{...frames[1],right:v(0)}],settings(0),false),/degenerate/);
 assert.throws(()=>buildProfileExtrudeGeometry(
  [frames[0],frame(2,v(-1))],settings(0),false),/handedness changed/);
 const runner=new GeometryGraphRunner(),ctx={frames,closed:false,revision:'r1'};
 const compiled=compileGeometryGraph(graph());
 const generated=runner.evaluate(compiled,ctx);
 assert.equal(generated.positions.length,caps.positions.length);
 assert.deepEqual(runner.metrics,{computed:4,reused:0,nodes:4});
 const checkpoint=JSON.stringify(generated);
 generated.positions[0]=999;
 assert.equal(JSON.stringify(runner.evaluate(compiled,ctx)),checkpoint,
  'rendered output clone cannot mutate internal cache');
 assert.deepEqual(runner.metrics,{computed:0,reused:4,nodes:4});
 const changed=compileGeometryGraph(graph({profileShape:2}));
 runner.evaluate(changed,ctx);
 assert.deepEqual(runner.metrics,{computed:2,reused:2,nodes:4},
  'profile parameter only dirties Extrude and Output, not source spline');
 const stable=JSON.stringify(runner.evaluate(changed,ctx));
 assert.throws(()=>runner.evaluate(changed,{
  ...ctx,revision:'bad',frames:[frames[0],frame(2,v(0))]}),/degenerate/);
 assert.equal(JSON.stringify(runner.evaluate(changed,ctx)),stable,'failed evaluation retains cache');
 const raw=JSON.stringify(graph());
 assert.deepEqual(editor.parseGraph(raw).ordered.map(n=>n.type),
  compileGeometryGraph(graph()).nodes.map(n=>n.type));
 for(const invalid of [{width:0},{height:0},{profileShape:2.5},
  {profileShape:99},{unsafe:1},{uvMetersPerRepeat:0}]){
  const sample=JSON.stringify(graph(invalid));
  assert.throws(()=>compileGeometryGraph(graph(invalid)));
  assert.throws(()=>editor.parseGraph(sample));
 }
 const selected=editor.renderNodeParameters(raw,'extrude');
 for(const param of ['width','height','profileShape','uvMetersPerRepeat','capEnds'])
  assert(selected.includes('data-graph-param="'+param+'"'));
 assert(selected.includes('U Channel'),'profile selector presents a U Channel preset');
 const ribbon=JSON.stringify({version:1,nodes:[
  {id:'source',type:'spline'},{id:'ribbon',type:'ribbon',input:'source',width:3},
  {id:'output',type:'output',input:'ribbon'}],output:'output'});
 const toExtrude=editor.applyGraphEdit(ribbon,'replace-generator',{type:'extrude'});
 assert.equal(editor.parseGraph(toExtrude).map.get('extrude').width,3,
  'switching from ribbon retains compatible width');
 const pathWidth=editor.applyGraphEdit(toExtrude,'insert',{type:'width',before:'extrude'});
 assert.deepEqual(editor.parseGraph(pathWidth).ordered.map(n=>n.type),
  ['spline','width','extrude','output']);
 const toTube=editor.applyGraphEdit(pathWidth,'replace-generator',{type:'tube'});
 assert.deepEqual(compileGeometryGraph(JSON.parse(toTube)).nodes.map(n=>n.type),
  ['spline','width','tube','output']);
 assert.equal(editor.applyGraphEdit(pathWidth,'replace-generator',{type:'extrude'}),pathWidth);
 assert(require(root+'/package.json').scripts.test.includes('geometry-graph-profile-extrude-v2.test.cjs'));
 console.log('GEOMETRY PROFILE EXTRUDE V2 PASS: hard-edge profiles, concave U caps, UV, mirrors, typed graph cache, bounded editor parity.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
