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
copy('src/v2/PathV2Dump.js','dist/v2/PathV2Dump.js');
copy('src/v2/BezierCurveSplit.js','dist/v2/BezierCurveSplit.js');
copy('src/v2/PathGroupNudgeDump.js','dist/v2/PathGroupNudgeDump.js');
copy('src/v2/PathKnotDumpCodec.js','dist/v2/PathKnotDumpCodec.js');
copy('src/v2/PathEndpointSnapDump.js','dist/v2/PathEndpointSnapDump.js');
copy('src/v2/JunctionAutoConnectDump.js','dist/v2/JunctionAutoConnectDump.js');
copy('src/v2/JunctionTangentDump.js','dist/v2/JunctionTangentDump.js');
copy('src/v2/clean-scene.js','dist/v2/clean-scene.js');
copy('dist/v2/EditorAssetBind.js');
copy('src/v2/inspector-common-clean.js','dist/contributions/inspector/common.js');
for(const name of ['RoadV2','ExtrudeV2','MeshDeformV2','JunctionV2'])
    copy('dist/contributions/inspector/'+name+'.js');
copy('src/contributions/inspector/PathV2.js','dist/contributions/inspector/PathV2.js');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
pkg.version=version;
pkg.description='Clean BREAKING V2 development test extension; requires Cocos-Gizmos >=3.0.2';
assert.equal(pkg.cocosSplines?.requiredExtensions?.['cocos-gizmos'],'>=3.0.2',
    'The installable manifest must declare required Gizmos extension API');
pkg.main='./dist/v2/clean-main.js';
pkg.contributions={
    scene:{script:'./dist/v2/clean-scene.js'},
    'asset-db':{mount:{path:'./assets',readonly:true}},
    messages:{
        'rebuild-v2-road':{methods:['rebuildV2Road']},
        'restore-v2-road-baked':{methods:['restoreV2RoadBaked']},
        'check-v2-road-bake':{methods:['checkV2RoadBake']},
        'bake-v2-road':{methods:['bakeV2Road']},
        'bind-v2-road-mesh':{methods:['bindV2RoadMesh']},
        'edit-v2-path':{methods:['editV2Path']},
        'edit-v2-path-group':{methods:['editV2PathGroup']},
        'nudge-v2-path-group':{methods:['nudgeV2PathGroup']},
        'plan-v2-junction-auto-trim':{methods:['planV2JunctionAutoTrim']},
        'apply-v2-junction-auto-trim':{methods:['applyV2JunctionAutoTrim']},
        'plan-v2-junction-endpoint-snap':{methods:['planV2JunctionEndpointSnap']},
        'apply-v2-junction-endpoint-snap':{methods:['applyV2JunctionEndpointSnap']},
        'inspect-v2-road-network':{methods:['inspectV2RoadNetwork']},
        'plan-v2-junction-auto-connect':{methods:['planV2JunctionAutoConnect']},
        'apply-v2-junction-auto-connect':{methods:['applyV2JunctionAutoConnect']},
        'plan-v2-junction-tangents':{methods:['planV2JunctionTangents']},
        'apply-v2-junction-tangents':{methods:['applyV2JunctionTangents']},
        'inspect-v2-junction-seams':{methods:['inspectV2JunctionSeams']}
    },
    inspector:{section:{node:{
        'Spline.Path':'./dist/contributions/inspector/PathV2.js',
        'Spline.Road':'./dist/contributions/inspector/RoadV2.js',
        'Spline.Extrude':'./dist/contributions/inspector/ExtrudeV2.js',
        'Spline.MeshDeform':'./dist/contributions/inspector/MeshDeformV2.js',
        'Spline.Junction':'./dist/contributions/inspector/JunctionV2.js'
    }}}
};
delete pkg.scripts;
delete pkg.panels;
fs.writeFileSync(path.join(target,'package.json'),
    JSON.stringify(pkg,null,2)+'\n','utf8');
fs.writeFileSync(path.join(target,'README.md'),
    '# Cocos Splines '+version+' (breaking test build)\n\n'+
    'Only Spline.* components are shipped. No old Splines.SplineContainer, legacy assets, legacy .meta, legacy menus, or scene migration.\n\n'+
    '1. Add Spline.Path and edit pure Vec3 Knot records in its custom Inspector.\n'+
    '2. Add Spline.Road / SplineExtrude / SplineMeshDeform, link Path Source.\n'+
    '3. Add Spline.Junction and linked Roads if needed.\n'+
    '4. In Inspector use Rebuild Preview, Bake glTF Asset and Bind Imported Mesh.\n'+
    '5. REQUIRED: install/enable Cocos-Gizmos >=3.0.2 BEFORE Cocos-Splines; restart Creator.\n'+
    '   The latest GizmoHUD builder and rotation-pivot APIs are mandatory.\n'+
    '   Components use the SDK @registerGizmos decorator via db://cocos-gizmos/RegisterGizmos.\n'+
    '   Project/Global Gizmos must mount its readonly RegisterGizmos.ts asset before import.\n'+
    '   Missing dependency is an explicit Creator import error; no local shim.\n\n'+
    '**This is a test artifact, not a release. Existing legacy scenes are not supported.**\n'+
    'Full instructions: docs/v2/TEST_BUILD.md and docs/v2/REBUILD_BREAKING.md.\n','utf8');
// Smoke load the packed Editor topology planner, not just its own file.
 // Missing relative dependencies must fail CI rather than ship a ZIP
 // that crashes when the user clicks any Knot Inspector action.
const packedPathPlanner=require(path.join(target,'dist/v2/PathV2Dump.js'));
assert.equal(typeof packedPathPlanner.planPathEditDump,'function',
    'Packed Path planner must load all of its runtime dependencies');
const assertFile=rel=>assert(fs.statSync(path.join(target,rel)).isFile(),
    'Missing required clean bundle file '+rel);
for(const rel of [
 'dist/v2/clean-main.js','dist/v2/clean-scene.js',
 'dist/v2/EditorAssetBind.js','dist/contributions/inspector/common.js',
 'assets/splines-v2/Components/SplinePath.ts',
 'assets/splines-v2/Editor/SplineGizmoHandler.ts',
 'assets/splines-v2/Editor/SplineGizmoHandler.ts.meta',
 'assets/splines-v2/Editor/SplinePathGizmos.ts',
 'assets/splines-v2/Editor/SplinePathGizmos.ts.meta',
 'assets/splines-v2/Editor/SplineRoadGizmos.ts',
 'assets/splines-v2/Editor/SplineRoadGizmos.ts.meta',
 'assets/splines-v2/Editor/SplineJunctionGizmos.ts',
 'assets/splines-v2/Editor/SplineJunctionGizmos.ts.meta',
 'dist/v2/PathV2Dump.js',
 'dist/v2/BezierCurveSplit.js',
 'dist/v2/PathGroupNudgeDump.js',
 'dist/v2/PathKnotDumpCodec.js',
 'dist/v2/PathEndpointSnapDump.js',
 'dist/v2/JunctionAutoConnectDump.js',
 'dist/v2/JunctionTangentDump.js',
 'dist/contributions/inspector/PathV2.js',
 'assets/splines-v2/Components/SplineFollower.ts',
 'assets/splines-v2/Components/SplineFollower.ts.meta',
 'assets/splines-v2/Components/SplineProjector.ts',
 'assets/splines-v2/Components/SplineProjector.ts.meta',
 'assets/splines-v2/core/SplineProjection.ts',
 'assets/splines-v2/core/SplineProjection.ts.meta',
 'assets/splines-v2/core/SplineTraversal.ts',
 'assets/splines-v2/core/SplineTraversal.ts.meta',
 'assets/splines-v2/Components/MeshGenerator.ts',
 'assets/splines-v2/Components/MeshGenerator.ts.meta',
 'assets/splines-v2/Components/GeometrySettings.ts',
 'assets/splines-v2/Components/GeometrySettings.ts.meta',
 'assets/splines-v2/Components/SplineRoad.ts',
 'assets/splines-v2/Components/SplineMeshDeform.ts',
 'assets/splines-v2/Components/SplineExtrude.ts',
 'assets/splines-v2/Components/JunctionPatch.ts',
 'assets/splines-v2/geometry/RoadFillet.ts',
 'assets/splines-v2/geometry/JunctionAutoTrimV2.ts',
 'assets/splines-v2/geometry/JunctionAutoTrimV2.ts.meta',
 'assets/splines-v2/geometry/SplineRoadNetworkV2.ts',
 'assets/splines-v2/geometry/SplineRoadNetworkV2.ts.meta',
 'assets/splines-v2/geometry/JunctionAutoConnectV2.ts',
 'assets/splines-v2/geometry/JunctionAutoConnectV2.ts.meta',
 'assets/splines-v2/geometry/JunctionTangentAlignV2.ts',
 'assets/splines-v2/geometry/JunctionTangentAlignV2.ts.meta',
 'assets/splines-v2/geometry/JunctionSeamAuditV2.ts',
 'assets/splines-v2/geometry/JunctionSeamAuditV2.ts.meta',
 'assets/splines-v2/geometry/JunctionAsphaltOverlapV2.ts',
 'assets/splines-v2/geometry/JunctionAsphaltOverlapV2.ts.meta',
 'assets/splines-v2/geometry/JunctionInteriorUVV2.ts',
 'assets/splines-v2/geometry/JunctionInteriorUVV2.ts.meta'
])assertFile(rel);
assert(!fs.existsSync(path.join(target,'assets/splines')),
    'Legacy Spline assets must NOT ship');
assert(!fs.existsSync(path.join(root,'assets/splines')),
    'Legacy Spline assets must be deleted from repository');
assert(!fs.existsSync(path.join(root,'scripts/release.cjs')),
    'Legacy release pipeline must be removed');
assert(!fs.existsSync(path.join(root,'src/main.js')),
    'Legacy main entrypoint must be removed');

assert(!fs.existsSync(path.join(target,'assets/splines.meta')),
    'Legacy asset UUID metadata must NOT ship');
assert(!fs.existsSync(path.join(target,
    'assets/splines-v2/Components/SplineGizmoHandler.ts')),
    'Obsolete component-level handler must not ship');
assert(!fs.existsSync(path.join(target,
    'assets/splines-v2/Components/SplineGizmoBridge.ts')),
    'Retired optional Gizmos bridge must not ship');
assert(!fs.existsSync(path.join(target,
    'assets/splines-v2/Components/SplineGizmoBridge.ts.meta')),
    'Retired optional bridge metadata must not ship');
assert(!fs.existsSync(path.join(target,'dist/main.js'))&&
       !fs.existsSync(path.join(target,'dist/scene.js')),
    'Legacy Editor entrypoints must NOT ship');
assert(Object.keys(pkg.contributions.inspector.section.node).every(n=>
    n.startsWith('Spline.')));
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
