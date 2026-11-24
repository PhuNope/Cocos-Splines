'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),
  cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-visual-model-'));
try{
 cp.execFileSync('tsc',['-p',root+'/tsconfig.runtime.json','--noEmit',
   'false','--outDir',temp],{stdio:'pipe'});
 const core=require(temp+'/Core/SplineGeometryGraph.js');
 const m=require(root+'/dist/SplineGeometryGraphVisualModel.js');
 const source=core.DEFAULT_GEOMETRY_GRAPH;
 assert.equal(m.parseGraph(source).ordered.length,3);
 assert.deepEqual(m.parseGraph(source).ordered.map(n=>n.id),
   core.parseGeometryGraph(source).nodes.map(n=>n.id));
 let json=m.applyGraphEdit(source,'insert',{type:'offset',before:'ribbon'});
 assert.deepEqual(m.parseGraph(json).ordered.map(n=>n.type),
  ['spline','offset','ribbon','output']);
 assert.deepEqual(core.parseGeometryGraph(json).nodes.map(n=>n.id),
   m.parseGraph(json).ordered.map(n=>n.id));
 json=m.applyGraphEdit(json,'param',{id:'offset1',key:'right',value:5});
 assert.equal(m.parseGraph(json).map.get('offset1').right,5);
 assert.equal(m.parseGraph(json).map.get('ribbon').input,'offset1');
 json=m.applyGraphEdit(json,'insert',{type:'width',before:'ribbon'});
 assert.deepEqual(m.parseGraph(json).ordered.map(n=>n.type),
  ['spline','offset','width','ribbon','output']);
 json=m.applyGraphEdit(json,'param',{id:'width1',key:'multiplier',value:2});
 json=m.applyGraphEdit(json,'param',{id:'ribbon',key:'capEnds',value:true});
 json=m.applyGraphEdit(json,'param',{id:'ribbon',key:'cornerMode',value:1});
 assert.equal(m.parseGraph(json).map.get('ribbon').capEnds,true);
 assert.equal(m.parseGraph(json).map.get('ribbon').cornerMode,1);
 const before=json;
 assert.throws(()=>m.applyGraphEdit(json,'connect',{
   source:'ribbon',target:'offset1'
 }),/type|socket/i);
 assert.throws(()=>m.applyGraphEdit(json,'connect',{
   source:'width1',target:'offset1'
 }),/cycle/i);
 assert.throws(()=>m.applyGraphEdit(json,'connect',{
   source:'source',target:'width1'
 }),/disconnected/i);
 assert.throws(()=>m.applyGraphEdit(json,'param',{
   id:'width1',key:'multiplier',value:100
 }),/range/i);
 assert.throws(()=>m.applyGraphEdit(json,'param',{
   id:'ribbon',key:'width',value:NaN
 }),/Non-finite/);
 assert.throws(()=>m.applyGraphEdit(json,'param',{
   id:'output',key:'width',value:4
 }),/does not support/);
 assert.throws(()=>m.applyGraphEdit(json,'param',{
   id:'ribbon',key:'cornerMode',value:.5
 }),/range/i);
 assert.throws(()=>m.applyGraphEdit(json,'remove',{id:'source'}),/Cannot delete/);
 assert.throws(()=>m.applyGraphEdit(json,'remove',{id:'ribbon'}),/Cannot delete/);
 assert.throws(()=>m.applyGraphEdit(json,'insert',{type:'ribbon',before:'ribbon'}));
 assert.equal(json,before,'Rejected edits must not change source JSON');
 const positions=m.parseLayout('{}',json);
 assert.equal(Object.keys(positions).length,5);
 const originalGraph=JSON.stringify(m.parseGraph(json).graph);
 const moved=m.moveGraphNode('{}',json,'width1',100,240);
 assert.equal(m.parseLayout(moved,json).width1.x,100);
 assert.equal(m.parseLayout(moved,json).width1.y,240);
 assert.equal(JSON.stringify(m.parseGraph(json).graph),originalGraph,
  'Moving node positions cannot alter graph geometry JSON');
 const clamped=m.moveGraphNode(moved,json,'width1',999,999);
 assert.equal(m.parseLayout(clamped,json).width1.x,
   m.STAGE.width-m.STAGE.cardWidth);
 assert.equal(m.parseLayout(clamped,json).width1.y,
   m.STAGE.height-m.STAGE.cardHeight);
 assert.throws(()=>m.moveGraphNode('{}',json,'missing',10,10));
 assert.throws(()=>m.moveGraphNode('{}',json,'width1',Infinity,10));
 assert.throws(()=>m.parseLayout('{"width1":{"x":-1,"y":1}}',json));
 assert.throws(()=>m.parseLayout('{"width1":{"x":1,"y":"nan"}}',json));
 assert.throws(()=>m.parseLayout('{bad',json));
 assert.deepEqual(m.parseLayout('{"obsolete":{"x":1,"y":1}}',json),positions,
  'Removed node layout is ignored on read');
 const cleaned=JSON.parse(m.cleanGraphLayout('{"obsolete":{"x":1,"y":1}}',json));
 assert.equal(cleaned.obsolete,undefined);
 const canvas=m.renderGraphCanvas(json,moved,'width1','offset1');
 assert(canvas.includes('<svg'));
 assert(canvas.includes('spl-vg-wire-path'));
 assert(canvas.includes('spl-vg-wire-mesh'));
 assert(canvas.includes('class="spl-vg-card selected"'));
 assert(canvas.includes('class="spl-vg-card pending"'));
 assert(canvas.includes('data-node="width1"'));
 const panel=m.renderNodeParameters(json,'ribbon');
 for(const name of ['width','endWidth','uvMetersPerRepeat','thickness',
   'cornerMode','capEnds'])assert(panel.includes('data-graph-param="'+name+'"'));
 assert(!m.renderNodeParameters(json,'unknown').includes('data-graph-param'));
 assert.throws(()=>m.parseGraph('{"version":1,"nodes":[],"output":"o"}'));
 assert.throws(()=>m.parseGraph('{'));
 assert.throws(()=>m.parseGraph(' '.repeat(16385)));
 // The model and runtime compiler must reject the same invalid DAG categories.
 const g=JSON.parse(json);
 const invalid=[
  {...g,version:2},
  {...g,output:'missing'},
  {...g,nodes:g.nodes.map(n=>n.id==='offset1'?{...n,input:'width1'}:n)},
  {...g,nodes:g.nodes.map(n=>n.id==='ribbon'?{...n,input:'output'}:n)},
  {...g,nodes:g.nodes.map(n=>n.id==='ribbon'?{...n,width:-2}:n)},
  {...g,nodes:g.nodes.map(n=>n.id==='ribbon'?{...n,width:2,unsafeJS:'alert(1)'}:n)},
  {...g,nodes:[...g.nodes,{id:'missingNode',type:'width',input:'source'}]},
  {...g,nodes:[...g.nodes,g.nodes[0]]},
 ];
 for(const item of invalid){
   assert.throws(()=>m.validateGraph(item));
   assert.throws(()=>core.compileGeometryGraph(item));
 }
 // Editor must not accept untrusted properties or code in canvas labels.
 assert.throws(()=>m.validateGraph({...g,nodes:g.nodes.map(n=>
  n.id==='offset1'?{...n,id:'<img onerror=alert(1)>'}:n)}));
 const many={version:1,nodes:[{id:'source',type:'spline'}],
  output:'output'};
 let previous='source';
 for(let i=0;i<29;i++){
   const id='w'+i;many.nodes.push({id,type:'width',input:previous});
   previous=id;
 }
 many.nodes.push({id:'ribbon',type:'ribbon',input:previous},
  {id:'output',type:'output',input:'ribbon'});
 assert.equal(m.validateGraph(many).ordered.length,32);
 assert.throws(()=>m.applyGraphEdit(JSON.stringify(many),'insert',
   {type:'width',before:'ribbon'}),/limit/i);
 assert(m.renderGraphCanvas(JSON.stringify(many),'{}','w3',null).length<30000);
 const pkg=require(root+'/package.json');
 assert(pkg.scripts.test.includes('geometry-graph-visual-model-v2.test.cjs'));
 console.log('GEOMETRY VISUAL MODEL V2 PASS: typed insertion/removal, connections, parameter bounds, layout isolation, safe markup and core parity.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
