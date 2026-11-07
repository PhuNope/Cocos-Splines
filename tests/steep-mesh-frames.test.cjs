'use strict';
/** Regression: mesh cross sections must not flip when grade passes vertical.
 * Pure frame math + road meshing, with no Cocos Editor/GPU assumptions.
 */
const assert=require('node:assert/strict');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'spline-steep-frames-'));
try {
    cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',out]);
    const {buildStableFrames,interpolateStableFrame,estimateMinimumBendRadius}=require(path.join(out,'Core','SplineStableFrames.js'));
    const {buildRoadGeometry}=require(path.join(out,'Core','SplineRoadMath.js'));
    const V=(x,y,z)=>({x,y,z});
    const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
    const mag=v=>Math.hypot(v.x,v.y,v.z);
    const top=V(0,1,0);
    const input=[];
    // Tangent bends from horizontal to uphill vertical and back into horizontal.
    // Independent up x tangent reverses its right axis on either side of vertical.
    for(let i=0;i<=200;i++){
        const a=i/200*Math.PI;
        input.push({t:i/200,position:V(Math.sin(a),1-Math.cos(a),0),tangent:V(Math.cos(a),Math.sin(a),0),up:top});
    }
    const frames=buildStableFrames(input);
    for(let i=0;i<frames.length;i++){
        const f=frames[i];
        assert(Math.abs(mag(f.right)-1)<1e-6&&Math.abs(mag(f.up)-1)<1e-6,'unit axes');
        assert(Math.abs(dot(f.right,f.tangent))<1e-6&&Math.abs(dot(f.up,f.tangent))<1e-6,'orthogonal to tangent');
        if(i>0)assert(dot(frames[i-1].right,f.right)>.99,'no right-axis flip crossing vertical');
    }
    // Legacy independent cross product flips at the vertical apex.
    const directRight=i=>{
        const t=input[i].tangent;
        const r=V(t.z,-t.x,t.x*0-t.z*0); // use up x tangent = (t.z,0,-t.x)
        return V(t.z,0,-t.x);
    };
    assert(dot(directRight(70),directRight(130))<0,'regression reproduces old sign reversal');
    const middle=interpolateStableFrame(frames,.503,V(-.0094,.99995,0));
    assert(dot(middle.right,frames[101].right)>.98,'interpolated frame stable');
    const roadFrames=frames.map((f,i)=>({position:f.position,forward:f.tangent,right:f.right,up:f.up,distance:i*.01}));
    const geometry=buildRoadGeometry(roadFrames,{width:1,endWidth:-1,shoulderWidth:0,shoulderDrop:0,curbWidth:0,
        curbHeight:0,thickness:0,capEnds:false,uvLength:2,startProgress:0,endProgress:1});
    assert.equal(geometry.positions.length,frames.length*2*3);
    assert.equal(geometry.indices.length,(frames.length-1)*6);
    for(let i=1;i<frames.length;i++){
        const j=i*6,a=j-6;
        const left=V(geometry.positions[j],geometry.positions[j+1],geometry.positions[j+2]);
        const right=V(geometry.positions[j+3],geometry.positions[j+4],geometry.positions[j+5]);
        const across=V(right.x-left.x,right.y-left.y,right.z-left.z);
        assert(dot(across,frames[i].right)>.99,'road section keeps consistent left/right orientation');
    }
    // Closed-loop correction makes the frame on the last ring match the first.
    const loop=[];
    for(let i=0;i<=360;i++){
        const a=2*Math.PI*i/360;
        const t=V(-Math.sin(a),0,Math.cos(a));
        const up=V(0,Math.cos(a*.6),Math.sin(a*.6));
        loop.push({t:i/360,position:V(Math.cos(a),0,Math.sin(a)),tangent:t,up});
    }
    const loopFrame=buildStableFrames(loop,true);
    assert(dot(loopFrame[0].right,loopFrame.at(-1).right)>.9999,'closed seam right axis is continuous');
    assert(estimateMinimumBendRadius(frames)>0,'finite vertical bend radius');
    // A sharp hairpin with radius smaller than road half-width is structurally
    // self-overlapping, not a frame-twist regression.
    assert(estimateMinimumBendRadius(frames)<1.1,'tight turn can be diagnosed');
    // Explicit bank: smoothly rolling up hints should still be followed.
    const roll=[];
    for(let i=0;i<=100;i++){
        const a=i/100*Math.PI*.75;
        roll.push({t:i/100,position:V(0,0,i*.1),tangent:V(0,0,1),up:V(-Math.sin(a),Math.cos(a),0)});
    }
    const bank=buildStableFrames(roll);
    assert(dot(bank.at(-1).up,roll.at(-1).up)>.999,'intentional 135-degree bank preserved');
    for(let i=1;i<bank.length;i++)assert(dot(bank[i-1].up,bank[i].up)>.98,'bank rotates smoothly');
    console.log('STEEP MESH FRAMES PASS: vertical tangent continuity, orthonormal axes, road sections, interpolation and banking.');
}finally{fs.rmSync(out,{recursive:true,force:true});}
