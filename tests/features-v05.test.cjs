'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const pkg=require(root+'/package.json');
const names=Object.keys(pkg.contributions.inspector.section.node);
for(const k of ['Splines.Spline2DPath','Splines.SplineMeshDeform'])assert(names.includes(k));
for(const p of ['create-2d-spline','create-2d-path','create-mesh-deform','create-tangent-handles','rebuild-mesh-deform'])assert(pkg.contributions.messages[p]);
const container=require(root+'/dist/contributions/inspector/Container.js');
for(const field of ['dimension','showGizmos','showGizmosAlways','showTangentGizmos','gizmoColor'])assert(container.template.includes('spl-field-'+field));
for(const btn of ['spl-create-2d-path','spl-create-deform'])assert(container.template.includes(btn));
for(const [name,fields] of [['Path2D',['spline','lineWidth','strokeColor']],['MeshDeform',['sourceMesh','axis','mode','repeatCount','uvMode','material']]]){
 const i=require(root+'/dist/contributions/inspector/'+name+'.js');
 for(const f of fields)assert(i.template.includes('spl-field-'+f),name+'.'+f);
}
const source=fs.readFileSync(root+'/assets/splines/Core/SplineContainer.ts','utf8');
assert(fs.readFileSync(root+'/assets/splines/Components/SplineMeshDeform.ts','utf8').includes('RGB16F'));
assert(source.includes('onDrawGizmosSelected()')&&source.includes('drawKnotGizmos'));
assert(fs.readFileSync(root+'/assets/splines/Components/SplineAnimate.ts','utf8').includes('spline.dimension===SplineDimension.XY2D'));
const calls=[],selection=['canvas-1'];let count=0,handlesCreated=false;
global.Editor={Selection:{getSelected(){return selection;},clear(){selection.length=0;},select(_,v){selection.push(v);}},
 Message:{request:async(channel,method,...args)=>{
  calls.push({channel,method,args});
  if(method==='query-component-has-script')return true;
  if(method==='create-node')return 'generated-'+(++count);
  if(method==='set-property'||method==='snapshot')return true;
  if(method==='query-node')return {__comps__:[{type:'Splines.SplineKnot',value:{mode:{type:'Enum'},tangentsInKnotSpace:{type:'Boolean'},tangentInHandle:{type:'cc.Node'},tangentOutHandle:{type:'cc.Node'}}}]};
  if(method==='execute-scene-script'){
   if(args[0].method==='querySpline')return {found:true,rootUuid:'spline-1',parentUuid:'canvas-1'};
   if(args[0].method==='describeHandles')return handlesCreated?{ok:true,rootUuid:'spline-1',hasHandles:true,inUuid:'tangent-in',outUuid:'tangent-out'}:{ok:true,rootUuid:'spline-1',hasHandles:false,inLocal:{x:-1,y:0,z:0},outLocal:{x:1,y:0,z:0}};
   return {ok:true};
  }
  return undefined;
 }} };
const main=require(root+'/dist/main.js').methods;
(async()=>{
 let r=await main.create2DSpline();assert(r.ok,r.error);
 assert(calls.some(x=>x.method==='set-property'&&x.args[0].path==='__comps__.0.dimension'&&x.args[0].dump.value===1));
 selection.splice(0,selection.length,'spline-1');
 r=await main.create2DPath();assert(r.ok,r.error);
 r=await main.createMeshDeform();assert(r.ok,r.error);
 assert(calls.some(x=>x.method==='create-component'&&x.args[0].component==='Splines.SplineMeshDeform'));
 selection.splice(0,selection.length,'knot-1');
 r=await main.createTangentHandles();assert(r.ok,r.error);
 assert.deepEqual(selection,[r.uuid]);
 assert(calls.some(x=>x.method==='set-property'&&x.args[0].path.endsWith('.tangentOutHandle')));
 assert(calls.some(x=>x.method==='set-property'&&x.args[0].path.endsWith('.editTangentHandles')&&x.args[0].dump.value===true));
 assert(!calls.some(x=>x.method==='set-property'&&x.args[0].path.endsWith('.showGizmosAlways')),'Handle creation must not mutate container settings');
 handlesCreated=true;selection.splice(0,selection.length,'knot-1');
 r=await main.selectTangentHandle('in');assert(r.ok,r.error);
 assert.deepEqual(selection,['tangent-in'],'Select In must clear previous knot selection');
 assert(calls.some(x=>x.method==='set-property'&&x.args[0].path.endsWith('.editTangentHandles')&&x.args[0].dump.value===true));
 console.log('FEATURES v0.5 PASS: 2D and mesh entrypoints, gizmos inspector, handle editor messages.');
})().catch(e=>{console.error(e);process.exitCode=1;});
