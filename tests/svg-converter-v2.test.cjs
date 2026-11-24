'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {parseSvg,exportSvg,MAX_SEGMENTS}=require('../src/SplineSvgConverter');
const approx=(a,b,eps=1e-7)=>assert(Math.abs(a-b)<eps,a+' differs from '+b);
const simple=parseSvg('M 0 0 L 30 0 L 30 10');
assert.equal(simple.closed,false);
assert.equal(simple.dimension,1);
assert.equal(simple.knots.length,3);
approx(simple.knots[0].tangentOut.x,10);
approx(simple.knots[1].tangentIn.x,-10);
approx(simple.knots[2].position.y,-10);
assert(simple.knots.every(k=>k.mode===4&&k.position.z===0));
const cubic=parseSvg('m 10 20 c 5 0 10 10 15 10 s 10 -10 20 -10');
assert.equal(cubic.knots.length,3);
approx(cubic.knots[0].position.y,-20);
approx(cubic.knots[1].tangentOut.x,5); // reflected outgoing c2 across knot
const quad=parseSvg('M 0 0 Q 6 6 12 0 T 24 0');
assert.equal(quad.knots.length,3);
approx(quad.knots[0].tangentOut.x,4);
approx(quad.knots[1].tangentOut.x,4);
const lines=parseSvg('M 2 3 H 8 V 7 h -3 v -2 Z',.5);
assert.equal(lines.closed,true);
assert.equal(lines.knots.length,5);
approx(lines.knots[0].position.x,1);
approx(lines.knots[0].position.y,-1.5);
const original=parseSvg('M 0 0 C 5 10 10 10 15 0 L 20 10 Z');
const svg=exportSvg(original);
assert(svg.includes('viewBox=')&&svg.includes(' C ')&&svg.includes(' Z"'));
const recovered=parseSvg(svg);
assert.equal(recovered.closed,true);
assert.equal(recovered.knots.length,original.knots.length);
for(let i=0;i<original.knots.length;i++){
  for(const name of ['position','tangentIn','tangentOut'])
    for(const axis of ['x','y','z'])
      approx(recovered.knots[i][name][axis],original.knots[i][name][axis]);
}
const xz=exportSvg({dimension:2,closed:false,knots:[
  {position:{x:0,y:100,z:3},tangentIn:{x:0,y:0,z:0},tangentOut:{x:1,y:0,z:2}},
  {position:{x:10,y:100,z:6},tangentIn:{x:-1,y:0,z:-2},tangentOut:{x:0,y:0,z:0}},
]});
assert(xz.includes('M 0 -3 C 1 -5 9 -4 10 -6'));
const invalid=[
  'M 0 0 A 10 10 0 1 1 20 0',
  'M 0 0 L 1',
  'M 0 0 L 1 1 M 2 2 L 3 3',
  '<svg transform="scale(2)"><path d="M 0 0 L 2 2"/></svg>',
  '<svg><script>alert(1)</script><path d="M 0 0 L 2 2"/></svg>',
  '<svg><path d="M 0 0 L 2 2"/><path d="M 0 0 L 3 3"/></svg>',
  '<svg><rect width="20" height="20"/><path d="M 0 0 L 2 2"/></svg>',
  'M 0 0 L 1e400 0',
];
for(const input of invalid)assert.throws(()=>parseSvg(input),'Must reject '+input.slice(0,30));
assert.throws(()=>parseSvg('M 0 0 L 10 0',0));
assert.throws(()=>parseSvg('M 0 0 L 10 0',1e8));
assert.throws(()=>parseSvg('M 0 0 L 1 1 '.repeat(MAX_SEGMENTS+1)));
assert.throws(()=>exportSvg({dimension:0,knots:simple.knots}));
const calls=[];
let selection=['selected-spline'],created=0,failPosition=false,removed=0,shots=0;
global.Editor={
 Selection:{getSelected(){return selection;},clear(){selection=[];},select(_type,id){selection=[id];}},
 Message:{request:async (channel,method,payload)=>{
   assert.equal(channel,'scene');calls.push([method,payload]);
   if(method==='query-component-has-script')return true;
   if(method==='execute-scene-script'){
     if(payload.method==='querySpline')return {found:true,rootUuid:'selected-spline',parentUuid:'parent',knots:simple.knots};
     if(payload.method==='querySvgGeometry')return {ok:true,dimension:1,closed:true,knots:original.knots};
     if(payload.method==='refreshPreview')return {ok:true};
     throw Error('Unexpected scene method: '+payload.method);
   }
   if(method==='create-node')return 'svg-node-'+(++created);
   if(method==='create-component')return true;
   if(method==='query-node')return {__comps__:[{type:'Splines.SplineKnot',value:{
       mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},tangentOut:{type:'cc.Vec3'},
       tangentsInKnotSpace:{type:'Boolean'}
   }}]};
   if(method==='set-property'){
     if(failPosition&&payload.path==='position'){failPosition=false;return false;}
     return true;
   }
   if(method==='snapshot'){shots++;return true;}
   if(method==='remove-node'){removed++;return true;}
   throw Error('Unexpected editor message: '+method);
 }}
};
const methods=require(path.resolve(__dirname,'../dist/main.js')).methods;
(async()=>{
    let result=await methods.exportSVG();
    assert(result.ok,result.error);
    assert.deepEqual(parseSvg(result.svg).knots.length,original.knots.length);
    assert.equal(shots,0,'Export is read-only');
    assert.equal(created,0,'Export creates no Node');
    result=await methods.importSVG('M 0 0 L 100 0',.1);
    assert(result.ok,result.error);
    assert.equal(result.knots,2);
    assert.equal(shots,1,'Import creates one snapshot');
    assert(calls.some(x=>x[0]==='set-property'&&x[1].path==='__comps__.0.dimension'&&x[1].dump.value===1));
    assert(calls.some(x=>x[0]==='set-property'&&x[1].path==='__comps__.0.tangentsInKnotSpace'&&x[1].dump.value===false));
    assert(calls.some(x=>x[0]==='set-property'&&x[1].path==='position'&&x[1].dump.value.x===10));
    result=await methods.importSVG('M 0 0 L 5 0 Z');
    assert(result.ok&&result.closed);
    assert.equal(shots,2);
    assert(calls.some(x=>x[0]==='set-property'&&x[1].path==='__comps__.0.closed'&&x[1].dump.value===true));
    const count=created,previous=shots;
    result=await methods.importSVG('M 0 0 A 5 5 0 0 0 1 1');
    assert.equal(result.ok,false);
    assert.equal(created,count,'Invalid paths must not create Nodes');
    assert.equal(shots,previous,'Invalid paths must not snapshot');
    selection=['selected-spline'];failPosition=true;
    result=await methods.importSVG('M 0 0 L 5 5');
    assert.equal(result.ok,false);
    assert.equal(removed,1,'Partial import must clean created root');
    assert.equal(shots,previous,'Partial import must not snapshot');
    const manifest=require('../package.json').contributions.messages;
    assert.deepEqual(manifest['import-svg'].methods,['importSVG']);
    assert.deepEqual(manifest['export-svg'].methods,['exportSVG']);
    const panel=require('../dist/contributions/inspector/Container.js');
    for(const selector of ['spl-svg','spl-svg-scale','spl-svg-import','spl-svg-export'])
      assert(panel.template.includes(selector),'Missing SVG Inspector control '+selector);
    console.log('SVG CONVERTER V2 PASS: cubic/line/relative/closed/scale/roundtrip, Editor import/export, rollback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
