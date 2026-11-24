'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {FORMAT,VERSION,MAX_KNOTS,parseSplineJSON,serializeSplineJSON}=
    require('../src/SplineJsonInterop');
const V=(x,y,z)=>({x,y,z});
const identity={position:V(1,2,3),rotation:{x:0,y:0,z:0,w:1},scale:V(2,1,-1)};
const scene={dimension:0,closed:true,reversed:true,samplesPerCurve:48,localTransform:identity,
    knots:[
        {position:V(0,0,0),tangentIn:V(-2,-1,0),tangentOut:V(2,1,0)},
        {position:V(6,3,-1),tangentIn:V(-2,0,1),tangentOut:V(1,0,2)},
        {position:V(6,5,4),tangentIn:V(0,-1,-1),tangentOut:V(0,2,0)},
    ]};
const text=serializeSplineJSON(scene);
const round=parseSplineJSON(text);
assert.equal(round.format,FORMAT);assert.equal(round.version,VERSION);
assert.equal(round.space,'container-local');
assert.equal(round.dimension,0);assert.equal(round.closed,true);assert.equal(round.reversed,true);
assert.equal(round.samplesPerCurve,48);
assert.deepEqual(round.localTransform.position,[1,2,3]);
assert.deepEqual(round.localTransform.rotation,[0,0,0,1]);
assert.deepEqual(round.localTransform.scale,[2,1,-1]);
assert.deepEqual(round.knots[2].position,[6,5,4]);
const cubic=(knots,i,u)=>{
  const a=knots[i],b=knots[(i+1)%knots.length],s=1-u;
  return ['x','y','z'].map((axis,j)=>{
    const v=x=>Array.isArray(x)?x[j]:x[axis];
    const a0=v(a.position),a1=a0+v(a.tangentOut),
      b0=v(b.position),b1=b0+v(b.tangentIn);
    return s*s*s*a0+3*s*s*u*a1+3*s*u*u*b1+u*u*u*b0;
  });
};
for(let i=0;i<3;i++)for(const u of [0,.1,.25,.5,.75,.9,1]){
  const before=cubic(scene.knots,i,u),after=cubic(round.knots,i,u);
  for(let j=0;j<3;j++)assert(Math.abs(before[j]-after[j])<1e-9,'Bezier control points must round-trip exactly');
}
for(const dimension of [1,2]){
  const axis=dimension===1?'z':'y';
  const input={...scene,dimension,knots:scene.knots.map(k=>({
    position:{...k.position,[axis]:0},tangentIn:{...k.tangentIn,[axis]:0},
    tangentOut:{...k.tangentOut,[axis]:0}
  }))};
  assert.equal(parseSplineJSON(serializeSplineJSON(input)).dimension,dimension);
}
const mutate=(fn)=>{const obj=JSON.parse(text);fn(obj);return JSON.stringify(obj);};
const bad=[
  mutate(x=>x.version=2),
  mutate(x=>x.format='curvy-spline'),
  mutate(x=>x.space='world'),
  mutate(x=>x.closed='true'),
  mutate(x=>x.reversed=null),
  mutate(x=>x.dimension=3),
  mutate(x=>x.samplesPerCurve=2),
  mutate(x=>x.localTransform.rotation=[0,0,0,0]),
  mutate(x=>x.localTransform.position=[1,2]),
  mutate(x=>x.knots[0].tangentOut[0]=1e99),
  mutate(x=>x.knots=[]),
  mutate(x=>x.knots=Array.from({length:MAX_KNOTS+1},()=>x.knots[0])),
  mutate(x=>{x.dimension=1;x.knots[0].position[2]=1;}),
  mutate(x=>{x.dimension=2;x.knots[1].tangentIn[1]=.01;}),
  '{not json}', '[]', '{}', ' '.repeat(200001)
];
for(const invalid of bad)assert.throws(()=>parseSplineJSON(invalid),'Reject malformed JSON model');
assert.throws(()=>serializeSplineJSON({...scene,knots:[scene.knots[0]]}));
assert.throws(()=>serializeSplineJSON({...scene,knots:[{...scene.knots[0],position:V(NaN,0,0)},...scene.knots.slice(1)]}));
const commands=[];let selected=['source'],next=0,removed=0,snapshots=0;
let failWrite=false,failSnapshot=false,failRefresh=false;
global.Editor={
 Selection:{getSelected:()=>selected,clear(){selected=[];},select(_kind,id){selected=[id];}},
 Message:{request:async (channel,method,payload)=>{
   assert.equal(channel,'scene');commands.push({method,payload});
   if(method==='query-component-has-script')return true;
   if(method==='execute-scene-script'){
     if(payload.method==='querySpline')return {found:true,rootUuid:'source',parentUuid:'parent',knots:[]};
     if(payload.method==='queryJsonGeometry')return {ok:true,...scene};
     if(payload.method==='refreshPreview'){
       if(failRefresh)throw Error('Preview unavailable');
       return {ok:true};
     }
     throw Error('Unexpected Scene request '+payload.method);
   }
   if(method==='create-node')return 'new-'+(++next);
   if(method==='create-component')return true;
   if(method==='query-node')return {__comps__:[{type:'Splines.SplineKnot',value:{
       mode:{type:'Enum'},tangentIn:{type:'cc.Vec3'},tangentOut:{type:'cc.Vec3'},
       tangentsInKnotSpace:{type:'Boolean'}
   }}]};
   if(method==='set-property'){
     if(failWrite&&payload.path==='__comps__.0.tangentIn'){
       failWrite=false;return false;
     }
     return true;
   }
   if(method==='snapshot'){
     snapshots++;
     return !failSnapshot;
   }
   if(method==='remove-node'){removed++;return true;}
   throw Error('Unexpected Editor request '+method);
 }}
};
const methods=require(path.resolve(__dirname,'../dist/main.js')).methods;
(async()=>{
  let result=await methods.exportSplineJSON();
  assert(result.ok,result.error);assert.equal(result.knots,scene.knots.length);
  assert.equal(result.json,text);
  assert.equal(next,0,'Read-only export must not mutate Scene');
  assert.equal(snapshots,0,'Read-only export does not snapshot');
  result=await methods.importSplineJSON(text);
  assert(result.ok,result.error);assert.equal(result.knots,scene.knots.length);
  assert.equal(result.closed,true);assert.equal(result.reversed,true);assert.equal(result.dimension,0);
  assert.equal(snapshots,1);
  assert(commands.some(c=>c.method==='create-node'&&c.payload.parent==='parent'),'Create sibling');
  assert(commands.some(c=>c.method==='set-property'&&c.payload.path==='rotation'&&c.payload.dump.type==='cc.Quat'));
  assert(commands.some(c=>c.method==='set-property'&&c.payload.path==='scale'&&c.payload.dump.value.z===-1));
  assert(commands.some(c=>c.method==='set-property'&&c.payload.path==='__comps__.0.samplesPerCurve'&&c.payload.dump.value===48));
  assert(commands.some(c=>c.method==='set-property'&&c.payload.path==='__comps__.0.dimension'&&c.payload.dump.value===0));
  assert(commands.some(c=>c.method==='set-property'&&c.payload.path==='__comps__.0.reversed'&&c.payload.dump.value===true));
  assert(commands.some(c=>c.method==='set-property'&&c.payload.path==='__comps__.0.tangentsInKnotSpace'&&c.payload.dump.value===false));
  const oldNodes=next,oldSnapshots=snapshots;
  const badResult=await methods.importSplineJSON('{"format":"unknown"}');
  assert.equal(badResult.ok,false);assert.equal(next,oldNodes);assert.equal(snapshots,oldSnapshots);
  selected=['source'];failWrite=true;
  result=await methods.importSplineJSON(text);
  assert.equal(result.ok,false);assert.equal(removed,1);
  assert.equal(snapshots,oldSnapshots,'Failed writes must not snapshot');
  selected=['source'];failSnapshot=true;
  result=await methods.importSplineJSON(text);
  assert.equal(result.ok,false);assert.equal(removed,2,'Failed snapshot attempts cleanup');
  failSnapshot=false;
  selected=['source'];failRefresh=true;
  result=await methods.importSplineJSON(text);
  assert(result.ok,'Refresh failure after commit must not delete imported spline');
  assert.equal(removed,2);failRefresh=false;
  const cfg=require('../package.json').contributions.messages;
  assert.deepEqual(cfg['import-spline-json'].methods,['importSplineJSON']);
  assert.deepEqual(cfg['export-spline-json'].methods,['exportSplineJSON']);
  const panel=require('../dist/contributions/inspector/Container.js');
  for(const selector of ['spl-native-json','spl-native-json-import','spl-native-json-export'])
    assert(panel.template.includes(selector),'Inspector missing JSON control '+selector);
  assert(commands.filter(c=>c.method==='remove-node').every(c=>c.payload.uuid!=='source'),
    'Only newly constructed root may be removed');
  console.log('JSON ROUNDTRIP V2 PASS: exact cubics, dimensions, settings, transforms, validation, Editor rollback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
