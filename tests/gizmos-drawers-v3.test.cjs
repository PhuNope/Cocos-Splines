'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const container=read('assets/splines/Core/SplineContainer.ts');
const knot=read('assets/splines/Core/SplineKnot.ts');
const containerDrawer=read('assets/splines/Editor/SplineContainerGizmos.ts');
const knotDrawer=read('assets/splines/Editor/SplineKnotGizmos.ts');
for(const text of [container,knot]){
    assert(text.includes("from 'db://cocos-gizmos/RegisterGizmos'"));
    assert.match(text, /@registerGizmos\(/);
    assert.doesNotMatch(text,/onDrawGizmos(?:Selected)?\s*\(/);
}
assert.doesNotMatch(container,/drawCurveGizmos|drawKnotGizmos|globalThis/);
assert.doesNotMatch(knot,/globalThis/);
assert.match(containerDrawer,/onDrawGizmosSelected\(\)/);
assert.match(knotDrawer,/onGizmoHandles\(\)/);
assert.match(knotDrawer,/editorTangentIn/);
assert.match(knotDrawer,/editorTangentOut/);
assert.match(knotDrawer,/editorWorldEuler/);
assert.match(knotDrawer,/phase==='cancel'/);
for(const name of ['SplineContainerGizmos','SplineKnotGizmos']){
    const base='assets/splines/Editor/'+name+'.ts';
    assert(read(base).length>300);
    assert.match(JSON.parse(read(base+'.meta')).uuid,/^[a-f\d-]{36}$/);
}
for(const name of ['SplineRoad','SplineExtrude','SplineMeshDeform','SplineObjectBender','SplineJunctionMesh','SplineModifiers']){
    const file=read('assets/splines/Components/'+name+'.ts');
    assert.match(file,/@registerGizmos\(/);
    assert.doesNotMatch(file,/onDrawGizmos(?:Selected)?\s*\(/);
}
const coreMesh=read('assets/splines/Core/SplineMeshGizmos.ts');
assert.doesNotMatch(coreMesh,/globalThis|drawMeshGizmoLines/);
const meshDrawer=read('assets/splines/Editor/SplineMeshDrawers.ts');
const modifierDrawer=read('assets/splines/Editor/SplineModifierGizmos.ts');
assert(meshDrawer.includes('drawMeshGizmoLines'));
assert(modifierDrawer.includes('onDrawGizmosSelected'));
console.log('GIZMOS DRAWER V3 PASS: official decorator, isolated core/mesh/modifier Gizmos.');
