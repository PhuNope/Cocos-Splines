'use strict';
/** Creator 3.8 IProperty dump / topology / history transaction contract. */
const assert=require('node:assert/strict');
const {planPathEditDump}=require('../src/v2/PathV2Dump');
const deep=v=>JSON.parse(JSON.stringify(v));
const float=(value)=>({type:'Float',value});
const vec3=(x,y,z)=>({type:'cc.Vec3',value:{x,y,z}});
const knot=(x,y,z,roll=0,tag=0)=>({type:'SplinesV2.Knot',value:{
 position:vec3(x,y,z),mode:{type:'Enum',value:tag},
 handleIn:vec3(-2,0,0),handleOut:vec3(2,0,1),
 tension:float(.2),rollDegrees:float(roll),other:{type:'String',value:'keep'}
}});
const template=knot(0,0,0);
const dump=(knots)=>({uuid:{type:'String',value:'node-id'},__comps__:[
 {type:'cc.MeshRenderer',value:{enabled:{type:'Boolean',value:true}}},
 {type:'SplinesV2.SplinePath',value:{
   gizmoKnotIndex:{type:'Integer',value:0},
   interpolation:{type:'Enum',value:3},
   knots:{type:'Array',isArray:true,elementTypeData:deep(template),value:deep(knots)}
 }}]});
const initial=dump([knot(0,0,0,12,1),knot(0,0,6,-25,2),knot(6,0,6,60,3)]);
const unmodified=JSON.stringify(initial);
let plan=planPathEditDump(initial,'insert',0);
assert.equal(plan.field,'knots');assert.equal(plan.componentIndex,1);
assert.equal(plan.record,true);assert.equal(plan.index,1);assert.equal(plan.count,4);
assert.deepEqual(plan.dump.value[1].value.position.value,{x:0,y:0,z:3});
assert.equal(plan.dump.value[1].value.rollDegrees.value,0,
    'New midpoint uses default Knot bank and copied element metadata');
assert.deepEqual(plan.dump.elementTypeData,template);
assert.equal(JSON.stringify(initial),unmodified,'Planner must never mutate queried Scene dump');
const inserted=plan.dump.value;
plan=planPathEditDump(dump(inserted),'up',1);
assert.equal(plan.index,0);
assert.equal(plan.dump.value[0].value.position.value.z,3);
assert.equal(plan.dump.value[1].value.mode.value,1,
    'Move operation transports entire CCClass record and tangent mode');
plan=planPathEditDump(initial,'duplicate',1);
assert.equal(plan.count,4);assert.equal(plan.index,2);
assert.deepEqual(plan.dump.value[2].value.position.value,{x:1,y:0,z:6});
assert.equal(plan.dump.value[2].value.rollDegrees.value,-25);
assert.equal(plan.dump.value[2].value.mode.value,2);
assert.deepEqual(plan.dump.value[2].value.handleOut.value,{x:2,y:0,z:1});
const duplicated=plan.dump.value;
plan=planPathEditDump(dump(duplicated),'remove',2);
assert.equal(plan.count,3);
assert.deepEqual(plan.dump.value,initial.__comps__[1].value.knots.value);
plan=planPathEditDump(initial,'add',0);
assert.equal(plan.index,3);assert.equal(plan.count,4);
assert.deepEqual(plan.dump.value[3].value.position.value,{x:12,y:0,z:6},
    'Add extrapolates the last two authored Knot positions');
assert.equal(plan.dump.value[3].value.other.value,'keep');
plan=planPathEditDump(initial,'select',2);
assert.equal(plan.field,'gizmoKnotIndex');assert.equal(plan.record,false);
assert.equal(plan.dump.type,'Integer');assert.equal(plan.dump.value,2);
plan=planPathEditDump(initial,'up',0);
assert.equal(plan.noOp,true);assert.equal(plan.record,false);
const two=dump(initial.__comps__[1].value.knots.value.slice(0,2));
assert.throws(()=>planPathEditDump(two,'remove',0),/at least two/);
assert.throws(()=>planPathEditDump(initial,'remove',99),/does not exist/);
assert.throws(()=>planPathEditDump(initial,'select',99),/does not exist/);
assert.throws(()=>planPathEditDump(initial,'nonsense',0),/Unsupported/);
assert.throws(()=>planPathEditDump(initial,'add',-1),/Unsupported/);
assert.throws(()=>planPathEditDump({__comps__:[]},'add',0),/SplinePath/);
const empty=dump([]),one=planPathEditDump(empty,'add',0);
assert.equal(one.count,1);
assert.equal(one.dump.value[0].type,'SplinesV2.Knot');
assert.deepEqual(one.dump.value[0].value.position.value,{x:0,y:0,z:0});
const newKnots=Array.from({length:128},(_,i)=>knot(i,0,0));
assert.throws(()=>planPathEditDump(dump(newKnots),'add',0),/at most 128/);
// Recorded dump patches can be replayed exactly by the Editor history
// without losing incoming/outgoing tangent offsets, roll or nested metadata.
const history=[];
let current=deep(initial);
function apply(tx){
 const field=tx.field,index=tx.componentIndex;
 const previous=deep(current.__comps__[index].value[field]);
 if(tx.record)history.push({field,index,previous});
 current.__comps__[index].value[field]=deep(tx.dump);
}
const start=JSON.stringify(current);
apply(planPathEditDump(current,'duplicate',0));
assert.equal(history.length,1);
assert.equal(current.__comps__[1].value.knots.value.length,4);
const recorded=history.pop();
current.__comps__[recorded.index].value[recorded.field]=recorded.previous;
assert.equal(JSON.stringify(current),start,
    'Undo restores exact original typed records, including all bank/tangent fields');
console.log('V2 PATH RECORDABLE DUMP PASS: typed CCClass, array operations, full record Undo replay, no-op, validation.');
