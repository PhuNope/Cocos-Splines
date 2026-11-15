'use strict';
const assert=require('node:assert/strict');
const {planPathGroupNudgeDump:plan}=require('../src/v2/PathGroupNudgeDump');
const {knotPosition}=require('../src/v2/PathKnotDumpCodec');
const copy=x=>JSON.parse(JSON.stringify(x));
const v=(x,y,z)=>({x,y,z});
const wrap=(type,value)=>({type,value});
const knot=(p,roll)=>wrap('Spline.Knot',{
 position:wrap('cc.Vec3',p),
 mode:wrap('Enum',2),handleIn:wrap('cc.Vec3',v(-2,0,0)),
 handleOut:wrap('cc.Vec3',v(2,1,0)),
 tension:wrap('Float',.25),rollDegrees:wrap('Float',roll),
 extra:wrap('String','preserve')});
const knots=[knot(v(0,0,0),11),knot(v(3,1,0),-10),knot(v(6,2,0),40)];
const node=()=>({__comps__:[
 {type:'cc.MeshRenderer',value:{}},
 {type:'Spline.Path',value:{
 interpolation:wrap('Enum',1),gizmoKnotIndex:wrap('Integer',0),
 knots:{type:'Array',isArray:true,elementTypeData:copy(knots[0]),
 value:copy(knots)} }}]});
const source=node(),original=JSON.stringify(source);
const proposal={indices:[0,2],knotCount:3,
 expectedPositions:[v(0,0,0),v(6,2,0)],deltaLocal:v(1,.5,0)};
const result=plan(source,proposal);
assert.equal(result.componentIndex,1);
assert.equal(result.field,'knots');
assert.equal(result.record,true);
assert.equal(result.count,2);
assert.deepEqual(knotPosition(result.dump.value[0]),v(1,.5,0));
assert.deepEqual(knotPosition(result.dump.value[1]),v(3,1,0));
assert.deepEqual(knotPosition(result.dump.value[2]),v(7,2.5,0));
assert.deepEqual(result.dump.value[1],knots[1]);
for(const index of proposal.indices){
 const originalEntry=knots[index].value,changed=result.dump.value[index].value;
 for(const field of ['mode','handleIn','handleOut','tension','rollDegrees','extra'])
  assert.deepEqual(changed[field],originalEntry[field],
   'Group Nudge cannot change '+field);
}
assert.deepEqual(result.dump.elementTypeData,knots[0]);
assert.equal(JSON.stringify(source),original,'Read-only planner may not mutate query-node');
assert.equal(plan(source,{...proposal,deltaLocal:v(0,0,0)}).record,false);
for(const bad of [
 {...proposal,indices:[0,0]},
 {...proposal,indices:[1]},
 {...proposal,indices:[0,3]},
 {...proposal,knotCount:4},
 {...proposal,expectedPositions:[v(1,0,0),v(6,2,0)]},
 {...proposal,deltaLocal:v(Infinity,0,0)},
 {...proposal,deltaLocal:v(21,0,0)}
])assert.throws(()=>plan(source,bad),/Invalid|changed|topology/);
assert.equal(JSON.stringify(source),original);
const changedNode=node();
changedNode.__comps__[1].value.knots.value[2].value.position.value.x+=.1;
assert.throws(()=>plan(changedNode,proposal),/Knot 2 changed since/);
console.log('GROUP NUDGE DUMP PASS: one typed recordable array, 2-Knot translation, unchanged tangents/Roll/custom fields, stale/no-op and bounds');
