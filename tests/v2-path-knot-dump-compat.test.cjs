'use strict';
/**
 * Regression coverage for IProperty Vec3 representations found in Creator
 * Inspector/Scene integrations. These are compatibility fixtures; only a
 * live 3.8.8 dump can definitively identify the user's exact variant.
 */
const assert=require('node:assert/strict');
const {planPathEditDump:edit}=require('../src/v2/PathV2Dump');
const {planEndpointSnapDump:snap}=require('../src/v2/PathEndpointSnapDump');
const {planJunctionTangentDump:tangent}=require('../src/v2/JunctionTangentDump');
const {knotPosition:position,setKnotPosition:setPosition,knotDumpShape:shape}=
 require('../src/v2/PathKnotDumpCodec');
const copy=x=>JSON.parse(JSON.stringify(x));
const baseVec=(x,y,z)=>({x,y,z});
const vv=p=>({type:'cc.Vec3',value:copy(p)});
const v=(x,y,z)=>baseVec(x,y,z);
const typed=p=>({type:'Spline.Knot',value:{
 position:vv(p),mode:{type:'Enum',value:2},
 handleIn:vv(v(-2,0,1)),handleOut:vv(v(2,0,1)),
 tension:{type:'Float',value:.1},rollDegrees:{type:'Float',value:14},
 unknown:{type:'String',value:'keep'} }});
const innerObject=p=>({
 type:'Spline.Knot',value:{
 position:copy(p),mode:{type:'Enum',value:2},
 handleIn:vv(v(-2,0,1)),handleOut:vv(v(2,0,1)),
 tension:{type:'Float',value:.1},rollDegrees:{type:'Float',value:14},
 unknown:{type:'String',value:'keep'}
 }});
const wrappedClass=p=>({
 type:'Spline.Knot',value:{type:'Object',value:copy(typed(p).value)}});
const bare=p=>({
 position:copy(p),mode:{value:1},
 handleIn:vv(v(-2,0,1)),handleOut:vv(v(2,0,1)),
 rollDegrees:{value:11}
});
const scalarAxes=p=>({
 type:'Spline.Knot',value:{
 position:{type:'cc.Vec3',value:{
  x:{type:'Float',value:p.x},y:{type:'Float',value:p.y},
  z:{type:'Float',value:p.z}
 }},mode:{value:1},other:'keep'
 }});
const cases=[typed,innerObject,wrappedClass,bare,scalarAxes];
const dump=(records,elementTypeData)=>({__comps__:[
 {type:'cc.MeshRenderer',value:{}},
 {type:'Spline.Path',value:{
  gizmoKnotIndex:{type:'Integer',value:0},
  interpolation:{type:'Enum',value:1},
  knots:{type:'Array',isArray:true,
   ...(elementTypeData?{elementTypeData:copy(elementTypeData)}:{}),
   value:copy(records)}
 }}
]});
for(const make of cases){
 const original=[make(v(0,0,0)),make(v(0,0,6))];
 const input=dump(original,make(v(0,0,0)));
 assert.deepEqual(position(original[0]),v(0,0,0),make.name);
 const baseline=JSON.stringify(input);
 let plan=edit(input,'insert',0);
 assert.equal(plan.count,3,make.name);
 assert.deepEqual(position(plan.dump.value[1]),v(0,0,3),make.name);
 assert.equal(JSON.stringify(input),baseline,'Do not mutate query-node dumps');
 const endpoint=snap(input,{pathUuid:'test-path',knotIndex:0,knotCount:2,
  expectedLocal:v(0,0,0),targetLocal:v(0,0,2)});
 assert.deepEqual(position(endpoint.dump.value[0]),v(0,0,2),
  'Endpoint Snap must share the same mixed IProperty Vec3 decoder');
 assert.deepEqual(position(endpoint.dump.value[1]),v(0,0,6));
 assert.equal(JSON.stringify(input),baseline,'Snap must not mutate authored data');
 if(make!==scalarAxes){
  const {knotVec3}=require('../src/v2/PathKnotDumpCodec');
  const sourceMode=make===bare?1:2;
  const handle=knotVec3(original[0],'handleOut');
  const aligned=tangent(input,{
   pathUuid:'test-path',knotIndex:0,knotCount:2,handleSide:'out',
   expectedPosition:v(0,0,0),expectedHandle:handle,
   targetLocalHandle:v(0,0,2),expectedMode:sourceMode,targetMode:1,
   changed:true
  });
  assert.deepEqual(knotVec3(aligned.dump.value[0],'handleOut'),v(0,0,2),
   'Tangent Apply must preserve nested Vec3 handles too');
  assert.deepEqual(position(aligned.dump.value[0]),v(0,0,0));
  assert.equal(JSON.stringify(input),baseline);
 }

 const selected=edit(input,'select',1);
 assert.equal(selected.record,false);
 assert.equal(selected.dump.value,1);
 const dup=edit(input,'duplicate',0);
 assert.deepEqual(position(dup.dump.value[1]),v(1,0,0));
 assert.deepEqual(dup.dump.value[1].value?.unknown,original[0].value?.unknown,
  'Keep unrelated custom Knot properties');
 const add=edit(input,'add',0);
 assert.equal(add.count,3);
 assert.deepEqual(position(add.dump.value[2]),v(0,0,12));
 const reordered=edit(input,'down',0);
 assert.deepEqual(position(reordered.dump.value[0]),v(0,0,6));
 assert.deepEqual(position(reordered.dump.value[1]),v(0,0,0));
 const removed=edit(dump(plan.dump.value,make(v(0,0,0))),'remove',1);
 assert.deepEqual(removed.dump.value,original,'Removing middle Knot restores whole records');
 // setPosition must preserve IProperty Vec3 and scalar-axis wrappers.
 const entry=copy(original[0]);
 setPosition(entry,v(10,2,8));
 assert.deepEqual(position(entry),v(10,2,8));
 if(make===scalarAxes){
  assert.equal(entry.value.position.value.x.type,'Float');
  assert.equal(entry.value.position.value.y.value,2);
 }
}
// Some Creator versions omit the elementTypeData metadata for class arrays.
const noMetadata=dump([innerObject(v(0,0,0)),innerObject(v(0,0,4))]);
assert.deepEqual(position(edit(noMetadata,'add',0).dump.value[2]),v(0,0,8));
assert.deepEqual(position(edit(dump([]),'add',0).dump.value[0]),v(0,0,0));
// A real malformed record still must be rejected before a recorded write.
const malformed=dump([typed(v(0,0,0)),{type:'Spline.Knot',value:{
 position:{type:'cc.Vec3',value:{x:'bad',y:0,z:0}}
}}]);
const before=JSON.stringify(malformed);
assert.throws(()=>edit(malformed,'add',0),/Knot 1 has unsupported or invalid Vec3 dump/);
assert.equal(JSON.stringify(malformed),before);
assert.equal(edit(malformed,'select',0).record,false,
 'Read-only select should work even if another record is malformed');
assert.equal(shape(null),'null');
assert.throws(()=>setPosition({value:{position:null}},v(0,0,0)),/Unsupported/);
console.log('V2 PATH KNOT DUMP COMPAT PASS: multiple nested Vec3 IProperty shapes, scalar wrappers, missing template, full-record preservation, safe invalid-data guard');
