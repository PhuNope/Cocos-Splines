'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const name of ['SplineInstantiate', 'SplineObjectController']) {
    const source = fs.readFileSync(path.join(root, 'assets/splines/Components', name + '.ts'), 'utf8');
    assert.match(source, /public\s+spawn\(\):number\s*\{/);
    assert.match(source, /public\s+respawn\(\):number\s*\{/);
    assert.doesNotMatch(source, /public\s+rebuild\(\)/, 'No legacy spawner aliases');
}
for (const [file,receiver] of [['instantiate-runtime.test.cjs','inst'],['advanced-v09.test.cjs','ctrl']]) {
    const source = fs.readFileSync(path.join(root, 'tests', file), 'utf8');
    assert.doesNotMatch(source, new RegExp(receiver + '\\.rebuild\\(\\)'), 'Tests must use canonical respawn()');
}
console.log('LEGACY API PASS: spawner rebuild aliases removed and tests use respawn().');
