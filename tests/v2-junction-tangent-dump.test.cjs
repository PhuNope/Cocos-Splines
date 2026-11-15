'use strict';
const assert=require('node:assert/strict');
const {planJunctionTangentDump:plan}=require('../src/v2/JunctionTangentDump');
const copy=x=>JSON.parse(JSON.stringify(x)),v=(x,y,z)=>({x,y,z});
const wrap=(type,value)=>({type,value});
const knot=(p,mode,handleIn,handleOut,roll)=>wrap('SplinesV2.Knot',{
 position:wrap('cc.Vec3',p),mode:wrap('Enum',mode),
 handleIn:wrap('cc.Vec3',handleIn),handleOut:wrap('cc.Vec3',handleOut),
 tension:wrap('Float',.35),rollDegrees:wrap('Float',roll),
 extra:wrap('String','keep-this')
});
const knots=[knot(v(0,0,0),2,v(-8,0,0),v(0,0,3),18),
 knot(v(5,0,0),1,v(-1,0,0),v(1,0,0),12),
 knot(v(10,0,0),3,v(0,0,-4),v(2,0,0),-42)];
const node={__comps__:[{type:'cc.MeshRenderer',value:{}},
 {type:'SplinesV2.SplinePath',value:{
 interpolation:wrap('Enum',1),closed:wrap('Boolean',false),
 gizmoKnotIndex:wrap('Integer',0),
 knots:{type:'Array',isArray:true,elementTypeData:copy(knots[0]),
 value:copy(knots)}}}]};
const branch={pathUuid:'path',knotIndex:0,knotCount:3,
 handleSide:'out',expectedPosition:v(0,0,0),expectedHandle:v(0,0,3),
 targetLocalHandle:v(2,0,0),expectedMode:2,targetMode:1,changed:true};
const unmodified=JSON.stringify(node);
const p=plan(node,branch);
assert.equal(p.record,true);assert.equal(p.componentIndex,1);assert.equal(p.noOp,false);
assert.deepEqual(p.dump.value[0].value.handleOut.value,v(2,0,0));
assert.equal(p.dump.value[0].value.mode.value,1);
assert.deepEqual(p.dump.value[0].value.handleIn,knots[0].value.handleIn);
assert.deepEqual(p.dump.value[0].value.rollDegrees,knots[0].value.rollDegrees);
assert.deepEqual(p.dump.value[1],knots[1]);assert.deepEqual(p.dump.value[2],knots[2]);
assert.equal(JSON.stringify(node),unmodified,'Check is immutable');
const restored=copy(node);restored.__comps__[1].value.knots=p.dump;
const b2={...branch,expectedHandle:v(2,0,0),expectedMode:1,
 targetMode:1,changed:false};
assert.equal(plan(restored,b2).noOp,true);
const end=plan(node,{...branch,knotIndex:2,handleSide:'in',
 expectedPosition:v(10,0,0),expectedHandle:v(0,0,-4),
 targetLocalHandle:v(-2,0,0),expectedMode:3,targetMode:1});
assert.deepEqual(end.dump.value[2].value.handleIn.value,v(-2,0,0));
assert.deepEqual(end.dump.value[0],knots[0]);
assert.throws(()=>plan(node,{...branch,expectedHandle:v(8,0,3)}),/changed since/);
assert.throws(()=>plan(node,{...branch,knotIndex:1,handleSide:'in'}),/only update/);
assert.throws(()=>plan(node,{...branch,expectedMode:0}),/changed since/);
const notBezier=copy(node);notBezier.__comps__[1].value.interpolation.value=0;
assert.throws(()=>plan(notBezier,branch),/open Bezier/);
console.log('JUNCTION TANGENT DUMP PASS: typed CCClass history, mode changes, Roll and untouched fields, stale/no-op/Undo parity');
