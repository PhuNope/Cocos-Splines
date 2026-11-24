'use strict';
/** Catalog contract for project-owned examples.
 * This covers source completeness, install payload, and old enum values.
 * Cocos runtime scene rendering still requires native Creator smoke tests.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'examples/installable/ExampleGallery.ts'),'utf8');
const readme=fs.readFileSync(path.join(root,'examples/installable/README.md'),'utf8');
const file=ts.createSourceFile('ExampleGallery.ts',source,ts.ScriptTarget.Latest,true,
    ts.ScriptKind.TS);
assert.equal(file.parseDiagnostics.length,0,'Invalid TypeScript Gallery syntax');
const enums=[],cases=[],methods=[];
function walk(node){
    if(ts.isEnumDeclaration(node)&&node.name.text==='SplineExampleKind'){
        for(const item of node.members){
            const name=item.name.text;
            const v=Number(item.initializer?.getText(file));
            enums.push([name,v]);
        }
    }
    if(ts.isCaseClause(node)&&ts.isPropertyAccessExpression(node.expression)&&
       node.expression.expression.getText(file)==='SplineExampleKind'){
        const name=node.expression.name.text;
        cases.push(name);
        const call=source.slice(node.getStart(file),node.getEnd());
        assert(/this\.show[A-Za-z]+\(\)/.test(call),
            'Gallery case '+name+' does not invoke a setup method');
    }
    if(ts.isMethodDeclaration(node)&&node.name&&ts.isIdentifier(node.name))
        methods.push(node.name.text);
    ts.forEachChild(node,walk);
}
walk(file);
const catalog=[
    'Follower','Road','Extrude','Junction','Proximity','Positioner',
    'Projector','Triggers','Modifiers','Morph',
];
assert.deepEqual(enums,catalog.map((name,i)=>[name,i]),
    'The original enum serialization IDs must remain unchanged');
assert.deepEqual(cases,catalog,'Every example must have one dispatch case');
const expectedMethods=[
    'showFollower','showRoad','showExtrude','showJunction','showProximity',
    'showPositioner','showProjector','showTriggers','showModifiers','showMorph',
];
for(const method of expectedMethods){
    assert(methods.includes(method),'Missing gallery handler '+method);
    assert(new RegExp('private\\s+'+method+'\\s*\\(').test(source),
        'Missing declared private gallery handler '+method);
}
for(const [name] of enums){
    assert(readme.includes('| '+name+' |'),'No guide row for '+name);
}
const {EXAMPLE_FILES}=require('../dist/SplineExampleInstaller');
assert(EXAMPLE_FILES.some(([target,src])=>target==='ExampleGallery.ts'&&
    src==='examples/installable/ExampleGallery.ts'));
assert(EXAMPLE_FILES.some(([target,src])=>target==='CREATE_GALLERY_IN_SCENE.md'&&
    src==='examples/installable/CREATE_GALLERY_IN_SCENE.md'));
assert(readme.includes('skips existing files'));
assert(readme.includes('Deleting a script referenced by saved Scenes'));
const dispatch=source.slice(source.indexOf('switch(this.example)'),source.indexOf('private child('));
assert.equal((dispatch.match(/case SplineExampleKind\./g)||[]).length,10);
console.log('EXAMPLE CATALOG PASS: ten preserved enum values, setup methods, dispatch and safe-update documentation.');
