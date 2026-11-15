'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),
 os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'junction-overlap-v2-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
 '--rootDir',path.join(root,'src-v2'),'--outDir',out,
 path.join(root,'src-v2/geometry/JunctionAsphaltOverlapV2.ts'),
 path.join(root,'src-v2/geometry/MeshData.ts')],{stdio:'pipe'});
 const {buildMeshV2:build}=require(path.join(out,'geometry/MeshData.js'));
 const {inspectJunctionAsphaltOverlapV2:scan}=
  require(path.join(out,'geometry/JunctionAsphaltOverlapV2.js'));
 const v=(x,y,z)=>({x,y,z});
 const make=(positions,triangles,materialSlot=0)=>build({positions,
  uv0:positions.map(p=>({x:p.x,y:p.z})),
  submeshes:[{materialSlot,indices:triangles}]});
 const square=make([v(0,0,0),v(2,0,0),v(0,0,2),v(2,0,2)],
  [0,1,2,1,3,2]);
 const ok=scan(square);
 assert.equal(ok.checked,true);
 assert.equal(ok.asphaltTriangles,2);
 assert.equal(ok.overlappingPairs,0,'Sharing a diagonal/vertices cannot count as overlap');
 const intersect=make([v(-2,0,-2),v(2,0,-2),v(0,0,2),
  v(-2,0,0),v(2,0,0),v(0,0,-2)],[0,1,2,3,4,5]);
 const report=scan(intersect);
 assert.equal(report.overlappingPairs,1);
 assert(report.maximumOverlapArea>1e-3);
 assert.deepEqual(scan(intersect),report,'Overlap scan deterministic');
 const above=make([v(-2,0,-2),v(2,0,-2),v(0,0,2),
  v(-2,2,0),v(2,2,0),v(0,2,-2)],[0,1,2,3,4,5]);
 assert.equal(scan(above).overlappingPairs,0,'Vertically separated crossing is not a collision');
 const duplicate=make([v(0,0,0),v(2,0,0),v(0,0,2)],[0,1,2,0,1,2]);
 assert.equal(scan(duplicate).overlappingPairs,1);
 assert.equal(scan(duplicate,{asphaltSlot:1}).asphaltTriangles,0);
 assert.equal(scan(intersect,{maxTriangles:1}).checked,false);
 const reversed=make([v(-2,0,-2),v(2,0,-2),v(0,0,2),
  v(-2,0,0),v(2,0,0),v(0,0,-2)],[2,1,0,5,4,3]);
 assert.equal(scan(reversed).overlappingPairs,1,'Clockwise/counterclockwise should agree');
 assert.throws(()=>scan(square,{maxTriangles:0}),/Invalid/);
 console.log('JUNCTION ASPHALT OVERLAP PASS: shared edges, crossing positive area, vertically separated, duplicate faces, bounded scan, winding-independent clipping');
}finally{fs.rmSync(out,{recursive:true,force:true});}
