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
 let transform=m.applyGraphEdit(source,'insert',{type:'transform',before:'ribbon'});
 assert.equal(m.parseGraph(transform).map.get('ribbon').input,'transform1');
 transform=m.applyGraphEdit(transform,'param',{id:'transform1',key:'rotateY',value:90});
 transform=m.applyGraphEdit(transform,'param',{id:'transform1',key:'pathScale',value:2});
 assert.equal(m.parseGraph(transform).map.get('transform1').rotateY,90);
 for(const key of ['translateX','translateY','translateZ','rotateX','rotateY','rotateZ','pathScale'])
  assert(m.renderNodeParameters(transform,'transform1').includes('data-graph-param="'+key+'"'));
 assert.throws(()=>m.applyGraphEdit(transform,'param',{id:'transform1',key:'pathScale',value:0}));
 transform=m.applyGraphEdit(transform,'remove',{id:'transform1'});
 assert.equal(m.parseGraph(transform).map.get('ribbon').input,'source');
 let noise=m.applyGraphEdit(source,'insert',{type:'noise',before:'ribbon'});
 noise=m.applyGraphEdit(noise,'param',{id:'noise1',key:'noiseRight',value:.5});
 noise=m.applyGraphEdit(noise,'param',{id:'noise1',key:'noiseSeed',value:17});
 assert.equal(m.parseGraph(noise).map.get('noise1').noiseSeed,17);
 for(const key of ['noiseRight','noiseUp','noiseForward','noiseFrequency','noiseOctaves','noisePersistence','noisePhase','noiseSeed','noiseFadeEnds'])
  assert(m.renderNodeParameters(noise,'noise1').includes('data-graph-param="'+key+'"'));
 for(const [key,value] of [['noiseSeed',1.2],['noiseFrequency',1.5],['noiseOctaves',7],['noiseFadeEnds',.6]])
  assert.throws(()=>m.applyGraphEdit(noise,'param',{id:'noise1',key,value}));
 noise=m.applyGraphEdit(noise,'remove',{id:'noise1'});
 assert.equal(m.parseGraph(noise).map.get('ribbon').input,'source');
 for(const type of ['reverse','clip','resample']){
  let p=m.applyGraphEdit(source,'insert',{type,before:'ribbon'});
  const id=type+'1';
  assert.equal(m.parseGraph(p).map.get('ribbon').input,id);
  if(type==='clip'){
   p=m.applyGraphEdit(p,'param',{id,key:'clipStart',value:.25});
   assert.throws(()=>m.applyGraphEdit(p,'param',{id,key:'clipEnd',value:.1}));
   assert(m.renderNodeParameters(p,id).includes('data-graph-param="clipEnd"'));
  }
  if(type==='resample'){
   p=m.applyGraphEdit(p,'param',{id,key:'resampleSegments',value:64});
   assert.throws(()=>m.applyGraphEdit(p,'param',{id,key:'resampleSegments',value:4.5}));
   assert(m.renderNodeParameters(p,id).includes('data-graph-param="resampleSegments"'));
  }
  p=m.applyGraphEdit(p,'remove',{id});
  assert.equal(m.parseGraph(p).map.get('ribbon').input,'source');
 }
 let conform=m.applyGraphEdit(source,'insert',{type:'conform',before:'ribbon'});
 for(const key of ['conformRayHeight','conformRayDepth','conformOffset','conformMinNormalY','conformMissing','conformAlign'])assert(m.renderNodeParameters(conform,'conform1').includes('data-graph-param="'+key+'"'));
 conform=m.applyGraphEdit(conform,'param',{id:'conform1',key:'conformMissing',value:1});
 assert.throws(()=>m.applyGraphEdit(conform,'param',{id:'conform1',key:'conformAlign',value:.5}));
 conform=m.applyGraphEdit(conform,'remove',{id:'conform1'});
 assert.equal(m.parseGraph(conform).map.get('ribbon').input,'source');
 let multiSpline=m.applyGraphEdit(source,'add-spline-output',{fromOutputId:'output'});
 let view=m.parseGraph(multiSpline);
 assert.equal(view.graph.version,2);
 assert.equal(view.map.get('splineSource').slot,1);
 assert.equal(view.map.get(view.map.get('outputBranch').input).input,'splineSource');
 assert(m.renderNodeParameters(multiSpline,'splineSource').includes('B (Spline B)'));
 assert.throws(()=>m.applyGraphEdit(multiSpline,'param',{id:'splineSource',key:'slot',value:0}));
 multiSpline=m.applyGraphEdit(multiSpline,'add-spline-output',{fromOutputId:'outputBranch'});
 view=m.parseGraph(multiSpline);
 assert.equal(view.map.get('splineSource1').slot,2);
 assert.throws(()=>m.applyGraphEdit(multiSpline,'add-spline-output',{fromOutputId:'output'}),/slots/i);
 multiSpline=m.applyGraphEdit(multiSpline,'remove-output',{id:'outputBranch1'});
 multiSpline=m.applyGraphEdit(multiSpline,'set-default-output',{id:'outputBranch'});
 multiSpline=m.applyGraphEdit(multiSpline,'remove-output',{id:'output'});
 view=m.parseGraph(multiSpline);
 assert.equal(view.graph.version,1);
 assert.equal(view.map.get('splineSource').slot,1);
 // Named ports are mirrored between Core and the editor model.
 for(const type of Object.keys(m.TYPES)){
  assert.deepEqual(m.inputPorts(type).map(({key,type,required})=>({key,type,required})),core.geometryInputPorts(type));
 }
 assert.deepEqual(core.geometryInputLinks({id:'d',type:'meshDeform',input:'p',meshInput:'asset'}).map(l=>[l.port.key,l.sourceId]),[['input','p'],['meshInput','asset']]);
 assert.throws(()=>m.applyGraphEdit(source,'connect',{source:'source',target:'ribbon',port:'meshInput'}),/socket/i);
 assert.throws(()=>m.applyGraphEdit(source,'connect',{source:'source',target:'ribbon',port:'__proto__'}),/socket/i);
 assert.equal(m.applyGraphEdit(source,'connect',{source:'source',target:'ribbon',port:'input'}),source);
 // Add a second source and merge in one validated transaction.
 let joined=m.applyGraphEdit(source,'add-merge-path',{before:'ribbon'});
 let jview=m.parseGraph(joined);
 assert.equal(jview.graph.version,1);
 assert.equal(jview.map.get('mergePath').input,'source');
 assert.equal(jview.map.get('mergePath').pathInputB,'splineSource');
 assert.equal(jview.map.get('ribbon').input,'mergePath');
 assert.deepEqual(core.parseGeometryGraph(joined).nodes.map(n=>n.id),jview.ordered.map(n=>n.id));
 assert(m.renderGraphCanvas(joined,'{}',null,null).includes('data-port="pathInputB"'));
 assert.throws(()=>m.applyGraphEdit(joined,'connect',{source:'source',target:'mergePath'}),/ambiguous/i);
 assert.throws(()=>m.applyGraphEdit(joined,'connect',{source:'source',target:'mergePath',port:'pathInputB'}),/distinct/i);
 assert.throws(()=>m.applyGraphEdit(joined,'connect',{source:'mergePath',target:'mergePath',port:'pathInputB'}),/itself/i);
 joined=m.applyGraphEdit(joined,'param',{id:'mergePath',key:'mergeDirection',value:2});
 assert(m.renderNodeParameters(joined,'mergePath').includes('Nearest endpoint'));
 joined=m.applyGraphEdit(joined,'remove',{id:'mergePath'});
 assert.equal(m.parseGraph(joined).ordered.length,3);
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
 const reordered=m.applyGraphEdit(json,'connect',{source:'width1',target:'offset1'});
 assert.deepEqual(m.parseGraph(reordered).ordered.map(n=>n.type),
   ['spline','width','offset','ribbon','output'],
   'Typed socket relink should reorder nodes without orphaning them');
 assert.equal(core.parseGeometryGraph(reordered).nodes.length,5);
 assert.equal(m.parseGraph(reordered).map.get('ribbon').input,'offset1');
 assert.equal(m.parseGraph(reordered).map.get('width1').input,'source');
 const restored=m.applyGraphEdit(reordered,'connect',{source:'offset1',target:'width1'});
 assert.deepEqual(m.parseGraph(restored).ordered.map(n=>n.type),
   ['spline','offset','width','ribbon','output']);
 assert.throws(()=>m.applyGraphEdit(json,'connect',{
   source:'ribbon',target:'offset1'
 }),/type|socket/i);
 assert.throws(()=>m.applyGraphEdit(json,'connect',{
   source:'offset1',target:'offset1'
 }),/itself/i);
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
