'use strict';
/**
 * CLEAN BREAKING V2 TEST BUNDLE.
 * The repository retains historical 0.9.x sources for development history,
 * but the installable test artifact contains NO old Spline components,
 * Inspector registrations, menus, UUIDs or .meta files.
 *
 * No Git tag, Release or publication is made.
 */
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'test-build');
const target=path.join(output,'cocos-splines');
const sha=(process.env.GITHUB_SHA||
    cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim());
assert.match(sha,/^[a-f0-9]{40}$/);
const version='2.0.0-test.g'+sha.slice(0,8);
fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(target,{recursive:true});
const copy=(source,destination=source)=>{
    const from=path.join(root,source),to=path.join(target,destination);
    assert(fs.existsSync(from),'Missing clean v2 package source '+source);
    fs.mkdirSync(path.dirname(to),{recursive:true});
    fs.cpSync(from,to,{recursive:true});
};
copy('LICENSE');
copy('assets/splines-v2.meta');
copy('assets/splines-v2');
copy('docs/v2');
copy('src/v2/clean-main.js','dist/v2/clean-main.js');
copy('src/v2/clean-scene.js','dist/v2/clean-scene.js');
copy('dist/v2/EditorAssetBind.js');
copy('src/v2/inspector-common-clean.js','dist/contributions/inspector/common.js');
for(const name of ['RoadV2','ExtrudeV2','MeshDeformV2','JunctionV2'])
    copy('dist/contributions/inspector/'+name+'.js');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
pkg.version=version;
pkg.description='Clean BREAKING V2 development test extension for Cocos Creator 3.8.x';
pkg.main='./dist/v2/clean-main.js';
pkg.contributions={
    scene:{script:'./dist/v2/clean-scene.js'},
    'asset-db':{mount:{path:'./assets',readonly:true}},
    messages:{
        'rebuild-v2-road':{methods:['rebuildV2Road']},
        'restore-v2-road-baked':{methods:['restoreV2RoadBaked']},
        'check-v2-road-bake':{methods:['checkV2RoadBake']},
        'bake-v2-road':{methods:['bakeV2Road']},
        'bind-v2-road-mesh':{methods:['bindV2RoadMesh']}
    },
    inspector:{section:{node:{
        'SplinesV2.SplineRoad':'./dist/contributions/inspector/RoadV2.js',
        'SplinesV2.SplineExtrude':'./dist/contributions/inspector/ExtrudeV2.js',
        'SplinesV2.SplineMeshDeform':'./dist/contributions/inspector/MeshDeformV2.js',
        'SplinesV2.JunctionPatch':'./dist/contributions/inspector/JunctionV2.js'
    }}}
};
delete pkg.scripts;
delete pkg.panels;
fs.writeFileSync(path.join(target,'package.json'),
    JSON.stringify(pkg,null,2)+'\n','utf8');
fs.writeFileSync(path.join(target,'README.md'),
    '# Cocos Splines '+version+' (breaking test build)\n\n'+
    'Only SplinesV2 components are shipped. No old Splines.SplineContainer, legacy assets, legacy .meta, legacy menus, or scene migration.\n\n'+
    '1. Add SplinesV2.SplinePath to a Node and author Knot Node references.\n'+
    '2. Add SplinesV2.SplineRoad / SplineExtrude / SplineMeshDeform, link Path Source.\n'+
    '3. Add SplinesV2.JunctionPatch and linked Roads if needed.\n'+
    '4. In Inspector use Rebuild Preview, Bake glTF Asset and Bind Imported Mesh.\n'+
    '5. Enable Cocos-Gizmos v3 separately for Scene editing.\n\n'+
    '**This is a test artifact, not a release. Existing legacy scenes are not supported.**\n'+
    'Full instructions: docs/v2/TEST_BUILD.md and docs/v2/REBUILD_BREAKING.md.\n','utf8');
const assertFile=rel=>assert(fs.statSync(path.join(target,rel)).isFile(),
    'Missing required clean bundle file '+rel);
for(const rel of [
 'dist/v2/clean-main.js','dist/v2/clean-scene.js',
 'dist/v2/EditorAssetBind.js','dist/contributions/inspector/common.js',
 'assets/splines-v2/Components/SplinePathV2.ts',
 'assets/splines-v2/Components/SplineMeshGeneratorV2.ts',
 'assets/splines-v2/Components/SplineMeshGeneratorV2.ts.meta',
 'assets/splines-v2/Components/SplineGeometrySettingsV2.ts',
 'assets/splines-v2/Components/SplineGeometrySettingsV2.ts.meta',
 'assets/splines-v2/Components/SplineRoadV2.ts',
 'assets/splines-v2/Components/SplineMeshDeformV2.ts',
 'assets/splines-v2/Components/SplineExtrudeV2.ts',
 'assets/splines-v2/Components/SplineJunctionPatchV2.ts',
 'assets/splines-v2/geometry/RoadFillet.ts'
])assertFile(rel);
assert(!fs.existsSync(path.join(target,'assets/splines')),
    'Legacy Spline assets must NOT ship');
assert(!fs.existsSync(path.join(target,'assets/splines.meta')),
    'Legacy asset UUID metadata must NOT ship');
assert(!fs.existsSync(path.join(target,'dist/main.js'))&&
       !fs.existsSync(path.join(target,'dist/scene.js')),
    'Legacy Editor entrypoints must NOT ship');
assert(Object.keys(pkg.contributions.inspector.section.node).every(n=>
    n.startsWith('SplinesV2.')));
assert(Object.keys(pkg.contributions.messages).every(n=>
    n.includes('-v2-')));
const metadata=new Set(),seen=new Set();
const walk=dir=>{
    for(const item of fs.readdirSync(dir,{withFileTypes:true})){
        const itemPath=path.join(dir,item.name);
        if(item.isDirectory())walk(itemPath);
        else if(item.isFile()){
            seen.add(path.relative(target,itemPath));
            if(item.name.endsWith('.meta')){
                const meta=JSON.parse(fs.readFileSync(itemPath,'utf8'));
                if(typeof meta.uuid==='string'){
                    assert(!metadata.has(meta.uuid),'Duplicate GUID '+meta.uuid);
                    metadata.add(meta.uuid);
                }
            }
        }else throw new Error('Unexpected symlink/special file '+itemPath);
    }
};
walk(target);
assert(seen.size>55,'Clean V2 bundle incomplete');
for(const name of Object.values(pkg.contributions.inspector.section.node))
    assertFile(name.replace(/^\.\//,''));
const text=fs.readFileSync(path.join(target,'dist/v2/clean-main.js'),'utf8')+
    fs.readFileSync(path.join(target,'dist/v2/clean-scene.js'),'utf8');
assert(!/Splines\.Spline(Container|Knot|Road)/.test(text),
    'Legacy class referenced from clean Editor entrypoint');
console.log('CLEAN V2 TEST PACKAGE PASS: '+version+
    ', '+seen.size+' files, '+metadata.size+' unique asset UUIDs, no legacy assets.');
console.log('GitHub Actions will upload test-build as a test ZIP; no tag/Release.');
