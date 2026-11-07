const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),docs=path.join(root,'docs');
const files=fs.readdirSync(path.join(docs,'pages')).filter(f=>f.endsWith('.html'));
assert.equal(files.length,20,'20 topic pages + docs/index.html');
for(const file of [path.join(docs,'index.html'),...files.map(f=>path.join(docs,'pages',f))]){
 const html=fs.readFileSync(file,'utf8');assert(html.startsWith('<!doctype html>'));
 for(const match of html.matchAll(/href="([^"]+)"/g)){
  if(match[1].startsWith('http')||match[1].startsWith('#'))continue;
  assert(fs.existsSync(path.resolve(path.dirname(file),match[1])),`Broken doc link ${file}: ${match[1]}`);
 }
}
const animate=fs.readFileSync(path.join(docs,'pages/animate.html'),'utf8');
assert(animate.includes('constantSpeedWithOffset'));assert(animate.includes('Spline Offset'));assert(animate.includes('Junction Offset Blend Distance'));assert(animate.includes('Target Local'));assert(animate.includes('Up Reference'));
for(const file of [path.join(docs,'index.html'),...files.map(f=>path.join(docs,'pages',f))]){const content=fs.readFileSync(file,'utf8'); assert(!/git\.html|github\.com|không cần internet|không cần server|0\.9\.0|0\.9\.1/i.test(content),'Docs should be task-focused, not Git/version history: '+file);}
assert(!fs.existsSync(path.join(docs,'pages/git.html')));
const road=fs.readFileSync(path.join(docs,'pages/road.html'),'utf8');
for(const key of ['Length Along U','Length Along V','uvDirection','uvWidthTiles','uvMetersPerRepeat','Wrap Repeat'])assert(road.includes(key),'Road UV guide missing '+key);
const morph=fs.readFileSync(path.join(docs,'pages/morph.html'),'utf8');assert(morph.includes('Restore'));assert(morph.includes('world space'));
const junction=fs.readFileSync(path.join(docs,'pages/junction.html'),'utf8');for(const name of ['Preserve','Forward','Backward','PingPong'])assert(junction.includes(name));
const api=fs.readFileSync(path.join(docs,'pages/api.html'),'utf8');assert(api.includes('AddOnReachEvent'));
const bender=fs.readFileSync(path.join(docs,'pages/bender.html'),'utf8');
for(const apiName of ['layout','SequentialMeshes','partGap','rebuild(): void','restore(): void','maxMeshes','rebuildOnChange','previewInEditor','showMeshGizmos','rangeMode'])assert(bender.includes(apiName),`Bender API missing: ${apiName}`);
const objects=fs.readFileSync(path.join(docs,'pages/objects.html'),'utf8');
for(const k of ['Spawn','Respawn','Clear Spawned','spawnOnStart','spawnedRoot','spawn(): number','respawn(): number'])assert(objects.includes(k),`Spawner docs missing ${k}`);
const train=fs.readFileSync(path.join(docs,'pages/train.html'),'utf8');
for(const apiName of ['TrainSingleSpline','TrainRouteConsist','SplinePositioner','SplineAnimate','currentDistance','evaluateWorldPositionAtDistance','Junction'])assert(train.includes(apiName),`Train guide missing: ${apiName}`);
for(const script of ['TrainSingleSpline.ts','TrainRouteConsist.ts'])assert(fs.existsSync(path.join(docs,'examples',script)),`Missing train sample: ${script}`);
for(const page of [path.join(docs,'index.html'),...files.map(f=>path.join(docs,'pages',f))])assert(fs.readFileSync(page,'utf8').includes('train.html'),`Train navigation missing: ${page}`);

// Dedicated Road / Extrude guides must mirror runtime property names, avoid false profile promises,
// include full reference tables, copyable examples and correct source lookup behavior.
const detailedRoad=fs.readFileSync(path.join(docs,'pages/road.html'),'utf8');
for(const key of ['Spline Road — Tạo đường theo spline','endWidth','shoulderWidth','curbWidth','thickness','uvMetersPerRepeat','LengthAlongU','LengthAlongV','roadMaterial','modifiers','capEnds','getSpline()','RoadUvSetup.ts','Wrap U = Repeat','Junction','rebuild()'])
  assert(detailedRoad.includes(key),'Road detailed doc missing '+key);
const detailedExtrude=fs.readFileSync(path.join(docs,'pages/extrude.html'),'utf8');
for(const key of ['Spline Extrude — Ống tròn dọc spline','endRadius','sides','segmentsPerCurve','flipNormals','uvTiling','capEnds','rangeMode','startDistance','material','rebuild()','ExtrudeTubeSetup.ts','Wrap V = Repeat','Node con'])
  assert(detailedExtrude.includes(key),'Extrude detailed doc missing '+key);
for(const script of ['RoadUvSetup.ts','ExtrudeTubeSetup.ts'])assert(fs.existsSync(path.join(docs,'examples',script)),`Missing mesh generator sample: ${script}`);
for(const page of [path.join(docs,'index.html'),...files.map(f=>path.join(docs,'pages',f))]) {
  const txt=fs.readFileSync(page,'utf8');
  assert(txt.includes('extrude.html'),'Extrude nav missing: '+page);
  assert(txt.includes('road.html'),'Road nav missing: '+page);
}

// Junction Mesh guide includes source-grounded, genuinely visual examples
// plus a local, interactive illustration and typed Inspector setup sample.
const junctionMesh=fs.readFileSync(path.join(docs,'pages/junction-mesh.html'),'utf8');
for(const marker of ['junction-diagram','junction-live-demo','junction-demo-svg',
 'junction-demo-branches','junction-demo-setback','junction-demo-width',
 'JunctionRoadPatchSetup.ts','Surface Lift','surfaceLift','setback',
 'tolerance','road.width','SplineRoad','Sơ đồ','junction-mesh-demo.js'])
 assert(junctionMesh.includes(marker),'JunctionMesh docs missing: '+marker);
for(const marker of ['junction-uv-matched','Road Matched','World Projected','uvMode','uvBlendStart','Wrap U = Repeat','UV Blend Start','JunctionUVMode'])
 assert(junctionMesh.includes(marker),'Junction Road UV docs missing '+marker);
assert((junctionMesh.match(/<svg\b/g)||[]).length>=2,'Junction Mesh needs two actual SVG illustrations');
assert(fs.existsSync(path.join(docs,'assets','junction-mesh-demo.js')),'Missing interactive junction preview JS');
const roadHelix=fs.readFileSync(path.join(docs,'pages/road.html'),'utf8');
for(const marker of ['id="helix"','parallel transport','bán kính','SplineExtrude','Join And Trim'])
 assert(roadHelix.includes(marker),'Road helix docs missing: '+marker);
assert(fs.existsSync(path.join(docs,'examples','JunctionRoadPatchSetup.ts')),'Missing typed Junction Mesh example');
cp.execFileSync('node',['--check',path.join(docs,'assets','junction-mesh-demo.js')]);
cp.execFileSync('tsc',['-p',path.join(root,'tests/tsconfig.docs-examples.json')],{stdio:'pipe'});
console.log('HTML DOCS PASS: 21 pages, Road + Extrude API, typed examples, relative navigation.');
