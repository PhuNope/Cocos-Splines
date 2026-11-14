'use strict';
const assert=require('node:assert/strict');
const {planEndpointSnapDump:plan}=require('../src/v2/PathEndpointSnapDump');
const deep=x=>JSON.parse(JSON.stringify(x));
const vec=p=>({type:'cc.Vec3',value:p});
const knot=(p,roll=17)=>({type:'SplinesV2.Knot',value:{
 position:vec(p),handleIn:vec({x:-3,y:2,z:1}),
 handleOut:vec({x:3,y:-1,z:0}),mode:{type:'Enum',value:2},
 tension:{type:'Float',value:.18},rollDegrees:{type:'Float',value:roll},
 custom:{type:'String',value:'keep-serialize'}}});
const before=[
 knot({x:0,y:0,z:0},50),knot({x:5,y:0,z:10},-30)
];
const dump={__comps__:[{type:'cc.MeshRenderer',value:{}},{
 type:'SplinesV2.SplinePath',value:{
 knots:{type:'Array',isArray:true,elementTypeData:deep(before[0]),value:deep(before)},
 interpolation:{type:'Enum',value:1},
 gizmoKnotIndex:{type:'Integer',value:0}
 }}]};
const baseline=JSON.stringify(dump);
const branch={pathUuid:'path-1',knotIndex:0,knotCount:2,
 expectedLocal:{x:0,y:0,z:0},targetLocal:{x:1,y:2,z:3}};
const result=plan(dump,branch);
assert.equal(result.componentIndex,1);
assert.equal(result.record,true);
assert.equal(result.noOp,false);
assert.deepEqual(result.dump.value[0].value.position.value,{x:1,y:2,z:3});
assert.deepEqual(result.dump.value[0].value.handleIn,before[0].value.handleIn);
assert.deepEqual(result.dump.value[0].value.handleOut,before[0].value.handleOut);
assert.deepEqual(result.dump.value[0].value.rollDegrees,before[0].value.rollDegrees);
assert.deepEqual(result.dump.value[1],before[1]);
assert.equal(JSON.stringify(dump),baseline,'Check must not mutate Creator dump');
const applied=deep(dump);applied.__comps__[1].value.knots=result.dump;
const restore=plan(applied,{...branch,expectedLocal:branch.targetLocal,
 targetLocal:branch.expectedLocal});
assert.deepEqual(restore.dump.value,before,'History replay must restore full records');
assert.equal(plan(dump,{...branch,targetLocal:branch.expectedLocal}).noOp,true);
assert.throws(()=>plan(dump,{...branch,expectedLocal:{x:99,y:0,z:0}}),
 /changed since/);
assert.throws(()=>plan(dump,{...branch,knotCount:3}),/topology changed/);
assert.throws(()=>plan(dump,{...branch,knotIndex:1,expectedLocal:branch.expectedLocal}),/changed since/);
assert.throws(()=>plan(dump,{...branch,knotIndex:-1}),/Invalid/);
console.log('V2 ENDPOINT SNAP DUMP PASS: typed Path Array, no mutation, preflight, full-record Undo replay');
