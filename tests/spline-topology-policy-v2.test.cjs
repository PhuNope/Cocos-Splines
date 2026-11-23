'use strict';
const assert=require('node:assert/strict');
const {captureContainerAppearance,validateContainerAppearance,appearanceWrites,
 omittedDataSummary}=require('../dist/SplineTopologyCopyPolicy');
const appearance={showGizmos:false,showGizmosAlways:true,
 showTangentGizmos:false,gizmoSteps:24,gizmoColor:{r:8,g:120,b:230,a:255}};
const original=JSON.stringify(appearance);
const result=captureContainerAppearance(appearance);
assert.deepEqual(result,appearance);
assert.notEqual(result,appearance);
assert.notEqual(result.gizmoColor,appearance.gizmoColor,'Color is value-copied');
const writes=appearanceWrites(result);
assert.equal(writes.length,5);
assert.deepEqual(writes.map(w=>[w.key,w.type]),[
 ['showGizmos','Boolean'],['showGizmosAlways','Boolean'],
 ['showTangentGizmos','Boolean'],['gizmoSteps','Integer'],['gizmoColor','cc.Color'],
]);
assert.deepEqual(validateContainerAppearance({}),{});
assert.equal(JSON.stringify(appearance),original,'No source modifications');
assert.throws(()=>validateContainerAppearance({customComponent:{uuid:'old-node'}}),/Unknown/);
assert.throws(()=>validateContainerAppearance({gizmoColor:{r:1,g:2,b:3,a:NaN}}),/color/i);
assert.throws(()=>validateContainerAppearance({gizmoColor:{r:1,g:2,b:3,a:256}}),/color/i);
assert.throws(()=>validateContainerAppearance({showGizmos:1}),/flag/i);
assert.throws(()=>validateContainerAppearance({gizmoSteps:65}),/gizmoSteps/);
assert.throws(()=>validateContainerAppearance({gizmoSteps:1.5}),/gizmoSteps/);
assert.throws(()=>validateContainerAppearance([]),/Invalid/);
const root={components:[{name:'SplineContainer'},{name:'A'},{name:'B'}],
 children:[]};
const node1={components:[{name:'SplineKnot'},{name:'Extra'}],children:[]};
const node2={components:[{name:'SplineKnot'}],children:[]};
const handle={name:'Tangent Out'};
const other={name:'Mesh child'};
node1.children=[handle,other];
node2.children=[{name:'Unrelated'}];
root.children=[node1,node2];
assert.deepEqual(omittedDataSummary(root,[
 {node:node1,tangentOutHandle:handle,tangentInHandle:null},
 {node:node2,tangentInHandle:null,tangentOutHandle:null},
]),{extraRootComponents:2,extraKnotComponents:1,extraKnotChildren:2});
assert.throws(()=>omittedDataSummary(root,[{node:{}}]),/Invalid/);
console.log('TOPOLOGY POLICY PASS: explicit primitive metadata allowlist, color validation, omit report, no opaque references.');
