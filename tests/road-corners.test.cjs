'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'spline-road-corners-'));
try{
  cp.execFileSync('tsc',['--target','ES2020','--module','commonjs','--outDir',output,
    path.join(root,'assets/splines/Core/SplineRoadMath.ts')]);
  const {RoadCornerMode,buildRoadCornerFrames,buildRoadGeometry}=require(path.join(output,'SplineRoadMath.js'));
  const opts={width:6,endWidth:-1,shoulderWidth:0,shoulderDrop:0,curbWidth:0,curbHeight:0,thickness:0,
    capEnds:false,uvLength:5,startProgress:0,endProgress:1};
  const frame=(x,z,forward,right,distance)=>({position:{x,y:0,z},forward:{x:forward[0],y:0,z:forward[1]},
    right:{x:right[0],y:0,z:right[1]},up:{x:0,y:1,z:0},distance});
  const straight=[frame(0,0,[0,1],[1,0],0),frame(0,5,[0,1],[1,0],5),frame(0,10,[0,1],[1,0],10)];
  const originalStraight=buildRoadGeometry(straight,opts);
  const correctedStraight=buildRoadGeometry(straight,{...opts,cornerMode:RoadCornerMode.JoinAndTrim});
  assert.deepEqual(correctedStraight.positions,originalStraight.positions,'straight road stays byte-for-byte unchanged');
  assert.deepEqual(correctedStraight.uvs,originalStraight.uvs,'straight-road UV stays unchanged');
  assert.deepEqual(correctedStraight.indices,originalStraight.indices,'triangle topology stays unchanged');
  // 90 degree sharp corner: adjoining offset edge lines intersect at (x, z-x).
  const kink=[frame(0,0,[0,1],[1,0],0),frame(0,4,[Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,-Math.SQRT1_2],4),frame(4,4,[1,0],[0,-1],8)];
  const joins=buildRoadCornerFrames(kink,{...opts,cornerMode:RoadCornerMode.JoinAndTrim});
  assert(Math.abs(joins[1].right.x-1)<1e-7&&Math.abs(joins[1].right.z+1)<1e-7,
    'miter joins the two offset edge lines without an outer gap');
  assert.equal(joins[1].insideSign,1,'right turn trims right/inside edge');
  assert.equal(joins[0].right.x,1,'start cap frame remains in its original direction');
  // A quarter-circle radius 2 with a 6-unit road folds its inner edge in
  // legacy mode. JoinAndTrim fixes both regular and endpoint triangles.
  const quarter=Array.from({length:33},(_,i)=>{
    const t=Math.PI*.5*i/32,R=2;
    return frame(R*(1-Math.cos(t)),R*Math.sin(t),[Math.sin(t),Math.cos(t)],
      [Math.cos(t),-Math.sin(t)],R*t);
  });
  const areaSign=(a,b,c)=>(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z);
  const countFlipped=g=>{
    const pos=k=>({x:g.positions[k*3],z:g.positions[k*3+2]});
    let flipped=0;
    for(let k=0;k<g.indices.length;k+=3){
      const a=pos(g.indices[k]),b=pos(g.indices[k+1]),c=pos(g.indices[k+2]);
      if(areaSign(a,b,c)<-1e-9)flipped++;
    }
    return flipped;
  };
  const old=buildRoadGeometry(quarter,opts);
  const trimmed=buildRoadGeometry(quarter,{...opts,cornerMode:RoadCornerMode.JoinAndTrim});
  assert(countFlipped(old)>10,'legacy reproduces overlapping, inverted inner triangles');
  assert.equal(countFlipped(trimmed),0,'join and trim eliminates all inverted inner triangles (including endpoints)');
  assert.deepEqual(trimmed.uvs,old.uvs,'corner trimming preserves all original UVs');
  assert.deepEqual(trimmed.indices,old.indices,'corner trimming preserves valid indexed topology');
  assert.equal(trimmed.positions.length,old.positions.length);
  assert(trimmed.positions.every(Number.isFinite));
  // Full road profile (shoulders, curbs, and underside) must remain index-safe
  // and keep UVs across all individual mesh bands.
  const fullProfile={...opts,shoulderWidth:.5,shoulderDrop:.06,curbWidth:.2,curbHeight:.12,thickness:.25,capEnds:true};
  const fullNew=buildRoadGeometry(quarter,{...fullProfile,cornerMode:RoadCornerMode.JoinAndTrim});
  const fullOld=buildRoadGeometry(quarter,fullProfile);
  assert.equal(fullNew.positions.length,fullOld.positions.length,'all profile bands preserved');
  assert.deepEqual(fullNew.uvs,fullOld.uvs,'custom-material UVs preserved with curbs and caps');
  assert(fullNew.positions.every(Number.isFinite)&&fullNew.normals.every(Number.isFinite));
  assert(fullNew.indices.every(k=>k>=0&&k<fullNew.positions.length/3),'all indices remain in bounds');
  // Uneven hill + turn must not break the 3D profile.
  const banked=quarter.map((f,i)=>({...f,position:{...f.position,y:Math.sin(i/32*Math.PI)*1.2}}));
  const bankedGeo=buildRoadGeometry(banked,{...fullProfile,cornerMode:RoadCornerMode.JoinAndTrim});
  assert(bankedGeo.positions.every(Number.isFinite)&&bankedGeo.normals.every(Number.isFinite),
    'banked/graded turn has finite mesh and normals');
  const softlyCurved=quarter.map(f=>({...f,position:{x:f.position.x*10,y:0,z:f.position.z*10},distance:f.distance*10}));
  const softOld=buildRoadGeometry(softlyCurved,opts);
  const softNew=buildRoadGeometry(softlyCurved,{...opts,cornerMode:RoadCornerMode.JoinAndTrim});
  assert.equal(countFlipped(softNew),0,'wide-radius road stays valid');
  let difference=0;
  for(let i=0;i<softOld.positions.length;i++)difference=Math.max(difference,Math.abs(softOld.positions[i]-softNew.positions[i]));
  assert(difference<.01,'miter changes shallow bends only minimally');
  // A pitch-only bend should not be confused with a lateral curve.
  const uphill=straight.map((f,i)=>({...f,position:{...f.position,y:i===1?3:0}}));
  assert.deepEqual(buildRoadCornerFrames(uphill,{...opts,cornerMode:RoadCornerMode.JoinAndTrim}).map(f=>f.insideSign),[0,0,0]);
  const closed=[...quarter, {...quarter[0],distance:quarter.at(-1).distance+1}];
  const closedCorners=buildRoadCornerFrames(closed,{...opts,cornerMode:RoadCornerMode.JoinAndTrim},true);
  assert.deepEqual(closedCorners[0],closedCorners.at(-1),'closed road uses matching first/last join to avoid a seam');
  console.log('ROAD CORNERS PASS: miter join, tight-radius inner-edge trimming, UV, endpoints, straight, slope and loop seam.');
}finally{fs.rmSync(output,{recursive:true,force:true});}
