'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'spline-road-'));
try{
    cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--outDir',output,path.join(root,'assets/splines/Core/SplineRoadMath.ts')]);
    const {buildRoadGeometry,crossSection,capTriangles,roadUV,RoadUvDirection}=require(path.join(output,'SplineRoadMath.js'));
    const frame=(z,bank=0)=>({position:{x:0,y:0,z},right:{x:Math.cos(bank),y:Math.sin(bank),z:0},up:{x:-Math.sin(bank),y:Math.cos(bank),z:0},forward:{x:0,y:0,z:1},distance:z});
    const opts={width:6,endWidth:-1,shoulderWidth:.5,shoulderDrop:.03,curbWidth:.2,curbHeight:.15,thickness:.3,capEnds:true,uvLength:5,startProgress:0,endProgress:1};
    const p=crossSection(6,opts),tris=capTriangles(p);
    assert.equal(p.length,10);
    assert.equal(tris.length,p.length-2,'nonconvex curb end-caps triangulate all profile points');
    const g=buildRoadGeometry([frame(0),frame(5),frame(10)],opts);
    assert.equal(g.ringCount,3);
    assert.equal(g.bands,p.length);
    assert.equal(g.positions.length/3,3*p.length*2+2*p.length);
    assert.equal(g.indices.length/3,2*2*p.length+2*(p.length-2));
    assert(Math.abs(g.normals[1]-1)<1e-7,'flat road surface faces upward');
    assert(Math.abs(g.uvs[2*2+1]-1)<1e-7,'UV repeats longitudinally every 5 units');
    for(let i=0;i<g.positions.length;i++)assert(Number.isFinite(g.positions[i]));
    for(let i=0;i<g.normals.length;i++)assert(Number.isFinite(g.normals[i]));
    for(let i=0;i<g.indices.length;i++)assert(g.indices[i]>=0&&g.indices[i]<g.positions.length/3);
    // Rotating a horizontal road atlas should not require editing the source image.
    assert.deepEqual(roadUV(.25,3,{...opts,uvDirection:RoadUvDirection.LengthAlongU}),[3,.25]);
    assert.deepEqual(roadUV(.25,3,{...opts,uvDirection:RoadUvDirection.LengthAlongV}),[.25,3]);
    assert.deepEqual(roadUV(.25,3,{...opts,uvDirection:RoadUvDirection.LengthAlongU,uvWidthTiles:2,uvReverseAcross:true,uvOffsetU:.5,uvOffsetV:-.25}),[3.5,1.25]);
    assert.deepEqual(roadUV(.25,3,{...opts,uvDirection:RoadUvDirection.LengthAlongU,uvReverseLength:true}),[-3,.25]);
    // Rotation preserves geometry and source sampling, changing UV only.
    const rotated=buildRoadGeometry([frame(0),frame(5),frame(10)],{...opts,uvDirection:RoadUvDirection.LengthAlongU});
    assert.deepEqual(rotated.positions,g.positions,'UV orientation does not distort road geometry');
    assert.deepEqual(rotated.indices,g.indices,'UV orientation does not change triangle winding');
    for(let i=0;i<g.uvs.length;i+=2){
        assert(Math.abs(rotated.uvs[i]-g.uvs[i+1])<1e-9,`longitudinal UV should be U at index ${i}`);
        assert(Math.abs(rotated.uvs[i+1]-g.uvs[i])<1e-9,`cross-road UV should be V at index ${i}`);
    }
    assert.equal(rotated.uvs[2*2],1,'5 meters of road = one longitudinal U repeat');
    assert.equal(rotated.uvs[2*2+1],g.uvs[2*2],'across-road atlas coordinate is preserved in V');
    const backwards=buildRoadGeometry([frame(0),frame(5)],{...opts,uvDirection:RoadUvDirection.LengthAlongU,uvReverseLength:true});
    assert.equal(backwards.uvs[2*2],-1,'reverse length direction applies to the chosen UV axis');
    const flat={...opts,shoulderWidth:0,shoulderDrop:0,curbWidth:0,curbHeight:0,thickness:0};
    const strip=buildRoadGeometry([frame(0),frame(3)],flat);
    assert.equal(strip.indices.length,6,'single flat surface band');
    const closed=buildRoadGeometry([frame(0),frame(5),frame(0)],opts,true);
    assert.equal(closed.indices.length/3,2*2*p.length,'closed loop does not add end caps');
    const bank=buildRoadGeometry([frame(0,Math.PI/6),frame(5,Math.PI/6)],flat);
    assert(bank.normals[0]<-.4&&bank.normals[1]>.8,'road banks with knot up');
    const taper=buildRoadGeometry([frame(0),frame(5)],{...flat,endWidth:10});
    assert.notEqual(taper.positions[0],taper.positions[6],'taper changes cross section width');
    const empty=buildRoadGeometry([frame(0)],opts);assert.equal(empty.indices.length,0);
    console.log('ROAD MATH PASS: cross section, normals, rotating U/V longitudinal texture, mirrored UV, caps, bank, tapered width, closed loop.');
}finally{fs.rmSync(output,{recursive:true,force:true});}
