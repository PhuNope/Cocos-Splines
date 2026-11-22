'use strict';
const assert=require('node:assert/strict'),cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const {planArcDistribution,transformFrame}=require('../src/SplineKnotEditMath');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-arc-metric-'));
const p=(x,y,z=0)=>({x,y,z});
const near=(a,b)=>assert(Math.abs(a-b)<0.01,String(a)+' != '+String(b));
try{
 cp.execFileSync('tsc',['-p','tsconfig.runtime.json','--noEmit','false','--outDir',tmp],{cwd:path.resolve(__dirname,'..')});
 const M=require(path.join(tmp,'Core/SplineMath.js'));
 const positions=[p(0,0),p(2,0),p(2,2),p(0,2),p(0,1)];
 const raw=positions.map((position,i)=>({uuid:String(i),position:{...position,z:i+1}}));
 const data=positions.map(position=>({position,tangentIn:p(0,0),tangentOut:p(0,0),mode:1}));
 const evaluator=(data,closed,metric)=>{
  const lut=M.buildArcLUT(data,closed,256,metric);
  return {segmentCount:lut.segments,distanceAtT:t=>M.distanceAtParameter(lut,t),evaluateAtDistance:d=>M.sampleDistance(lut,d)};
 };
 const local=evaluator(data,true);
 const all=planArcDistribution(raw,raw.map(k=>k.uuid),1,true,local);
 assert(!all.some(e=>e.uuid==='0'));
 for(let i=1;i<5;i++){
  const pos=all.find(e=>e.uuid===String(i))?.after||raw[i].position;
  const expected=local.evaluateAtDistance(8*i/5).position;
  near(pos.x,expected.x);near(pos.y,expected.y);assert.equal(pos.z,i+1);
 }
 const wrap=planArcDistribution(raw,['4','0','1'],1,true,local);
 assert.equal(wrap.length,1);assert.equal(wrap[0].uuid,'0');near(wrap[0].after.x,0.5);near(wrap[0].after.y,0);
 assert.throws(()=>planArcDistribution(raw,['0','2','4'],1,true,local),/contiguous/);
 const reverse=planArcDistribution([...raw].reverse(),['4','0','1'],1,true,evaluator([...data].reverse(),true));
 near(reverse[0].after.x,wrap[0].after.x);near(reverse[0].after.y,wrap[0].after.y);
 const matrix=[0,3,0,0,-1,0,0,0,0,0,2,0,100,200,300,1];
 const world=evaluator(data,true,transformFrame(matrix).toWorld);
 near(world.distanceAtT(1),16);
 const ids=['0','1','2'];
 const a=planArcDistribution(raw,ids,1,false,evaluator(data,false));
 assert.equal(a.length,0,'Already even in local distance');
 const b=planArcDistribution(raw,ids,1,false,evaluator(data,false,transformFrame(matrix).toWorld));
 assert.equal(b.length,1);near(b[0].after.x,4/3);near(b[0].after.y,0);assert.equal(b[0].after.z,2);
 const curved=[{position:p(0,0),tangentIn:p(0,0),tangentOut:p(0,4),mode:4},
 {position:p(4,0),tangentIn:p(0,4),tangentOut:p(0,0),mode:4}];
 const ev=evaluator(curved,false,transformFrame(matrix).toWorld);
 assert(ev.distanceAtT(1)>12);near(ev.evaluateAtDistance(ev.distanceAtT(1)/2).position.y,3);
 let current=matrix.slice(),rev='geometry';
 const nodes=raw.map(k=>({uuid:k.uuid,position:k.position,rotation:{x:0,y:0,z:0,w:1},children:[],components:[]}));
 const root={uuid:'root',parent:null,children:nodes,components:[],
 get worldMatrix(){return Object.fromEntries(current.map((v,i)=>['m'+String(i).padStart(2,'0'),v]));}};
 nodes.forEach(n=>{n.parent=root;n.components=[{kind:'Splines.SplineKnot',node:n,enabled:true}];});
 const spline={kind:'Splines.SplineContainer',enabled:true,dimension:1,closed:true,get knots(){return nodes.map(n=>n.components[0]);},getRevision:()=>rev,createArcDistributionEvaluator:metric=>evaluator(data,true,metric)};
 root.components=[spline];
 const load=Module._load;Module._load=function(name,...args){if(name==='cc')return {director:{getScene:()=>root},js:{getClassName:c=>c.kind}};return load.call(this,name,...args);};
 try{
  const scene=require('../src/scene.js').methods;
  const r=scene.queryArcDistribution('root',['4','0','1'],'world');
  assert(r.ok,r.error);
  assert(scene.queryKnotBatchState('root',['0'],r.revision,'world').ok);
  current[1]=4;assert(!scene.queryKnotBatchState('root',['0'],r.revision,'world').ok);
  current=matrix.slice();nodes.reverse();assert(!scene.queryKnotBatchState('root',['0'],r.revision,'world').ok);
  nodes.reverse();current[1]=0;assert.match(scene.queryArcDistribution('root',['4','0','1'],'world').error,/singular/);
  assert(!scene.queryArcDistribution('root',['4','0','1'],'bad').ok);
 }finally{Module._load=load;}
 console.log('ARC METRIC PASS: Bezier LUT, cyclic selection, full loop, reverse, nonuniform world metric, 2D lock, revision and matrix guards.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
