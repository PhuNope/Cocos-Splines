'use strict';
/** Reverse De Casteljau: strict exact merge must not reshape spline or Roll. */
const assert=require('node:assert/strict');
const {planPathEditDump:edit,canMergeBezierKnot:canMerge}=
 require('../src/v2/PathV2Dump');
const {knotPosition:position,knotVec3}=require('../src/v2/PathKnotDumpCodec');
const copy=v=>JSON.parse(JSON.stringify(v));
const p=(x,y,z)=>({x,y,z});
const add=(a,b)=>p(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a,b)=>p(a.x-b.x,a.y-b.y,a.z-b.z);
const mul=(a,t)=>p(a.x*t,a.y*t,a.z*t);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const entry=(pos,mode,index)=>({type:'Spline.Knot',value:{
 position:{type:'cc.Vec3',value:pos},
 handleIn:{type:'cc.Vec3',value:p(-1.2,-.1,.1*index)},
 handleOut:{type:'cc.Vec3',value:p(1.1,.2,.4*index)},
 mode:{type:'Enum',value:mode},tension:{type:'Float',value:.2},
 rollDegrees:{type:'Float',value:10*index},
 custom:{type:'String',value:'persist-'+index}
}});
const fixture=(closed,modes)=>({__comps__:[
 {type:'cc.MeshRenderer',value:{}},
 {type:'Spline.Path',value:{
  interpolation:{type:'Enum',value:1},
  closed:{type:'Boolean',value:closed},
  gizmoKnotIndex:{type:'Integer',value:0},
  knots:{type:'Array',isArray:true,elementTypeData:entry(p(0,0,0),0,0),
   value:[entry(p(0,0,0),modes[0],0),
    entry(p(4,1,7),modes[1],1),
    entry(p(8,-1,4),modes[2],2),
    entry(p(13,0,-3),modes[3],3)]}
 }}]});
function cubic(a,b,t){
 const u=1-t,pa=position(a),pb=position(b);
 const m0=a.value.mode.value===0?mul(sub(pb,pa),1/3):knotVec3(a,'handleOut');
 const m1=b.value.mode.value===0?mul(sub(pa,pb),1/3):knotVec3(b,'handleIn');
 return add(add(mul(pa,u*u*u),mul(add(pa,m0),3*u*u*t)),
   add(mul(add(pb,m1),3*u*t*t),mul(pb,t*t*t)));
}
function pointsAgree(a,b,closed,tag){
 assert.equal(a.length,b.length);
 const segments=closed?a.length:a.length-1;
 for(let j=0;j<segments;j++)
  for(let i=0;i<=24;i++){
   const t=i/24;
   const old=cubic(a[j],a[(j+1)%a.length],t);
   const next=cubic(b[j],b[(j+1)%b.length],t);
   assert(dist(old,next)<1e-8,tag+' segment='+j+' t='+t);
  }
}
for(const closed of [false,true]){
 for(const modes of [[0,0,0,0],[0,2,3,0],[1,1,1,1]]){
  const initial=fixture(closed,modes);
  const before=copy(initial.__comps__[1].value.knots.value);
  const initialJSON=JSON.stringify(initial);
  for(let segment=0;segment<(closed?4:3);segment++){
   const split=edit(initial,'split',segment);
   const afterSplit=copy(initial);
   afterSplit.__comps__[1].value.knots=copy(split.dump);
   const mid=segment+1;
   assert(canMerge(split.dump.value,mid,closed),
    'A just-created De Casteljau Knot is always mergeable');
   assert(!canMerge(split.dump.value,-1,closed));
   const preview=JSON.stringify(afterSplit);
   const merge=edit(afterSplit,'merge',mid);
   assert.equal(merge.field,'knots');
   assert.equal(merge.record,true);
   assert.equal(merge.count,before.length);
   assert.equal(merge.index,segment);
   assert.equal(merge.selectionDump.value,segment);
   pointsAgree(before,merge.dump.value,closed,
    'Merged 50% split must preserve every point of original curve');
   assert.equal(JSON.stringify(afterSplit),preview,'Planner cannot mutate query-node dump');
   assert.equal(JSON.stringify(initial),initialJSON);
   assert.equal(merge.dump.value[segment].value.custom.value,
    before[segment].value.custom.value);
   const indexB=(segment+1)%before.length;
   assert.equal(merge.dump.value[indexB].value.custom.value,
    before[indexB].value.custom.value);
   // Roll values at every surviving Knot must remain untouched.
   for(let i=0;i<before.length;i++)
    assert.equal(merge.dump.value[i].value.rollDegrees.value,
     before[i].value.rollDegrees.value);
   // A captured single Scene set-property before/after is fully replayable.
   const prior=copy(afterSplit.__comps__[1].value.knots);
   afterSplit.__comps__[1].value.knots=copy(merge.dump);
   assert.equal(afterSplit.__comps__[1].value.knots.value.length,4);
   afterSplit.__comps__[1].value.knots=prior;
   assert.equal(JSON.stringify(afterSplit),preview);
   for(const [field,value] of [
    ['handleOut',.003],['handleIn',.003]
   ]){
    const changed=copy(afterSplit);
    const target=changed.__comps__[1].value.knots.value[mid];
    target.value[field].value.z+=value;
    assert.equal(canMerge(changed.__comps__[1].value.knots.value,mid,closed),false,
     'Edited tangent must disable Merge Exact');
    assert.throws(()=>edit(changed,'merge',mid),/no longer form/);
   }
   const changedRoll=copy(afterSplit);
   changedRoll.__comps__[1].value.knots.value[mid].value.rollDegrees.value+=2;
   assert(!canMerge(changedRoll.__comps__[1].value.knots.value,mid,closed));
   assert.throws(()=>edit(changedRoll,'merge',mid),/Roll/);
   const changedMode=copy(afterSplit);
   changedMode.__comps__[1].value.knots.value[mid].value.mode.value=2;
   assert(!canMerge(changedMode.__comps__[1].value.knots.value,mid,closed));
   assert.throws(()=>edit(changedMode,'merge',mid),/Free tangent/);
  }
 }
}
const open=fixture(false,[1,1,1,1]),knots=open.__comps__[1].value.knots.value;
assert(!canMerge(knots,0,false));
assert(!canMerge(knots,knots.length-1,false));
assert.throws(()=>edit(open,'merge',0),/interior/);
assert.throws(()=>edit(open,'merge',3),/interior/);
const nonBezier=fixture(true,[1,1,1,1]);
nonBezier.__comps__[1].value.interpolation.value=3;
assert.throws(()=>edit(nonBezier,'merge',1),/requires Bézier/);
const minimum=fixture(false,[1,1,1,1]);
minimum.__comps__[1].value.knots.value=
 minimum.__comps__[1].value.knots.value.slice(0,2);
assert(!canMerge(minimum.__comps__[1].value.knots.value,1,false));
assert.throws(()=>edit(minimum,'merge',1),/interior/);
console.log('V2 EXACT BEZIER MERGE PASS: inverse split, 3D shape, Roll, closed seam, modes, strict modified-Knot rejection and Undo.');
