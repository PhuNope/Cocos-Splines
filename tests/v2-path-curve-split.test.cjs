'use strict';
/** Exact De Casteljau Knot insertion through Creator native IProperty dumps. */
const assert=require('node:assert/strict');
const {planPathEditDump:plan}=require('../src/v2/PathV2Dump');
const {knotPosition:position,knotVec3}=require('../src/v2/PathKnotDumpCodec');
const copy=v=>JSON.parse(JSON.stringify(v));
const v=(x,y=0,z=0)=>({x,y,z});
const plus=(a,b)=>v(a.x+b.x,a.y+b.y,a.z+b.z);
const mul=(a,t)=>v(a.x*t,a.y*t,a.z*t);
const lerp=(a,b,t)=>plus(mul(a,1-t),mul(b,t));
const delta=(a,b)=>v(a.x-b.x,a.y-b.y,a.z-b.z);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const entry=(pos,mode,seed)=>({type:'Spline.Knot',value:{
 position:{type:'cc.Vec3',value:copy(pos)},
 mode:{type:'Enum',value:mode},
 handleIn:{type:'cc.Vec3',value:v(-1-seed*.3,.15*seed,-.7)},
 handleOut:{type:'cc.Vec3',value:v(1+seed*.4,.2*seed,1.1)},
 tension:{type:'Float',value:.1*seed},
 rollDegrees:{type:'Float',value:seed*8},
 privateMetadata:{type:'String',value:'retain-'+seed}
}});
const fixture=(closed,modes=[0,2,3,0])=>({
 __comps__:[{type:'cc.MeshRenderer',value:{}},
  {type:'Spline.Path',value:{
    interpolation:{type:'Enum',value:1},
    closed:{type:'Boolean',value:closed},
    gizmoKnotIndex:{type:'Integer',value:0},
    knots:{type:'Array',elementTypeData:entry(v(0),0,0),value:[
      entry(v(0,0,0),modes[0],1),
      entry(v(4,1,5),modes[1],2),
      entry(v(9,0,1),modes[2],3),
      entry(v(13,1,-3),modes[3],4)
    ]}
  }}]
});
function cubic(records,i,closed,t){
 const a=records[i],b=records[(i+1)%records.length];
 const p0=position(a),p3=position(b);
 const modeA=a.value.mode.value,modeB=b.value.mode.value;
 const h0=modeA===0?mul(delta(p3,p0),1/3):knotVec3(a,'handleOut');
 const h1=modeB===0?mul(delta(p0,p3),1/3):knotVec3(b,'handleIn');
 const p1=plus(p0,h0),p2=plus(p3,h1);
 const u=1-t;
 return plus(plus(mul(p0,u*u*u),mul(p1,3*u*u*t)),
   plus(mul(p2,3*u*t*t),mul(p3,t*t*t)));
}
for(const closed of [false,true]){
 for(const modes of [[0,2,3,0],[0,0,0,0],[1,1,1,1]]){
  const before=fixture(closed,modes);
  const source=before.__comps__[1].value.knots.value;
  const initial=JSON.stringify(before);
  const count=closed?source.length:source.length-1;
  for(let splitIndex=0;splitIndex<count;splitIndex++){
   const result=plan(before,'split',splitIndex);
   assert.equal(result.field,'knots');
   assert.equal(result.componentIndex,1);
   assert.equal(result.record,true);
   assert.equal(result.count,source.length+1);
   assert.equal(result.index,splitIndex+1);
   assert.equal(result.selectionDump.value,splitIndex+1);
   assert.equal(result.dump.type,'Array');
   const next=result.dump.value;
   assert.equal(next.length,source.length+1);
   assert.equal(JSON.stringify(before),initial,'Planning must be read-only');
   const middle=next[splitIndex+1];
   assert.equal(middle.type,'Spline.Knot');
   assert.equal(middle.value.mode.value,1);
   assert.equal(middle.value.privateMetadata.value,'retain-0');
   const start=source[splitIndex],end=source[(splitIndex+1)%source.length];
   assert.equal(next[splitIndex].value.privateMetadata.value,
    start.value.privateMetadata.value);
   assert.equal(next[(splitIndex+2)%next.length].value.privateMetadata.value,
    end.value.privateMetadata.value);
   assert.equal(middle.value.rollDegrees.value,
    (start.value.rollDegrees.value+end.value.rollDegrees.value)/2);
   for(let j=0;j<count;j++){
    for(let n=0;n<=32;n++){
     const t=n/32,old=cubic(source,j,closed,t);
     let after;
     if(j===splitIndex){
      after=t<=.5?cubic(next,j,closed,t*2):
       cubic(next,j+1,closed,(t-.5)*2);
     }else{
      const newSeg=j>splitIndex?j+1:j;
      after=cubic(next,newSeg,closed,t);
     }
     assert(dist(old,after)<1e-8,
      'Split must retain exact old Bezier geometry (closed='+closed+
       ', modes='+modes+', split='+splitIndex+', segment='+j+
       ', t='+t+'); drift='+dist(old,after));
    }
   }
   // One serialized Knot array update gives one native Undo checkpoint.
   const replay=copy(before);
   const previous=copy(replay.__comps__[1].value.knots);
   replay.__comps__[1].value.knots=copy(result.dump);
   assert.equal(replay.__comps__[1].value.knots.value.length,source.length+1);
   replay.__comps__[1].value.knots=previous;
   assert.equal(JSON.stringify(replay),initial);
  }
 }
}
const a=fixture(false),original=JSON.stringify(a);
assert.throws(()=>plan(a,'split',3),/existing Bézier segment/);
a.__comps__[1].value.interpolation.value=3;
assert.throws(()=>plan(a,'split',0),/requires Bézier interpolation/);
a.__comps__[1].value.interpolation.value=1;
a.__comps__[1].value.knots.value[0].value.handleOut.value.x=NaN;
a.__comps__[1].value.knots.value[0].value.mode.value=1;
assert.throws(()=>plan(a,'split',0),/valid Bezier handles/);
assert.equal(original.includes('privateMetadata'),true);
const full=fixture(true);
while(full.__comps__[1].value.knots.value.length<128)
 full.__comps__[1].value.knots.value.push(entry(v(100,0,0),0,0));
assert.throws(()=>plan(full,'split',0),/2\.\.127 Knots/);
const bad=fixture(true);
bad.__comps__[1].value.knots.value[1].value.handleIn=null;
bad.__comps__[1].value.knots.value[1].value.mode.value=1;
assert.throws(()=>plan(bad,'split',0),/valid Bezier handles/);
console.log('V2 EXACT BEZIER SPLIT PASS: open/closed, Auto/Aligned/Mirrored, 50% geometry parity, typed Undo replay, invalid data.');
