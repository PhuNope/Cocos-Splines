'use strict';
const assert=require('node:assert/strict');
const {prepareSurface,snapOrigins,castDown}=require('../src/SplineSurfaceSnapMath');
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const vertices=[
    0,0,0,   // A: flat edge
    1,0,0,   // B: shared edge
    0,0,1,   // C: shared edge
    1,.35,1, // D: tilted
];
const triangles=[0,2,1,1,2,3];
const surface=prepareSurface(vertices,triangles,I);
const nearLeft={x:.495,y:3,z:.495},nearRight={x:.505,y:3,z:.505};
function hitAt(point,config={}){
    return snapOrigins(surface,[{uuid:'selected',position:point}],{
        height:0,maxDrop:10,alignNormal:true,...config,
    })[0];
}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}
function magnitude(a){return Math.hypot(a.x,a.y,a.z);}
const flatLeft=hitAt(nearLeft),flatRight=hitAt(nearRight);
assert(dist(flatLeft.normal,flatRight.normal)>.25,'Flat normals have a hard face boundary');
const smoothLeft=hitAt(nearLeft,{smoothNormal:true,creaseAngle:60});
const smoothRight=hitAt(nearRight,{smoothNormal:true,creaseAngle:60});
assert(dist(smoothLeft.normal,smoothRight.normal)<dist(flatLeft.normal,flatRight.normal)*.25,
    'Smooth normals reduce discontinuity across shared edge');
assert(smoothLeft.normal.y>.9&&smoothRight.normal.y>.85,'Smoothed normals point up');
assert(Math.abs(magnitude(smoothLeft.normal)-1)<1e-10,'Normals are normalized');
assert.deepEqual(smoothLeft.position,flatLeft.position,'Smoothing never changes hit positions');
assert.deepEqual(smoothRight.position,flatRight.position,'Smoothing never changes hit positions');
const creaseLeft=hitAt(nearLeft,{smoothNormal:true,creaseAngle:0});
const creaseRight=hitAt(nearRight,{smoothNormal:true,creaseAngle:0});
assert(dist(creaseLeft.normal,flatLeft.normal)<1e-10,'0° threshold preserves first face');
assert(dist(creaseRight.normal,flatRight.normal)<1e-10,'0° threshold preserves second face');
const defaultNormal=hitAt(nearLeft,{smoothNormal:false,creaseAngle:60});
assert.deepEqual(defaultNormal,flatLeft,'Opt-in disabled preserves default result');
const noAlign=snapOrigins(surface,[{uuid:'plain',position:nearLeft}],{
    alignNormal:false,smoothNormal:true,creaseAngle:900,
})[0];
assert(!('normal' in noAlign),'Normal smoothing cannot rotate knot when alignment disabled');
for(const bad of [-1,90,Infinity,NaN,'45'])
    assert.throws(()=>hitAt(nearLeft,{smoothNormal:true,creaseAngle:bad}),/crease angle/);
const splitSurface=prepareSurface([
    0,0,0,1,0,0,0,0,1,
    1,0,0,0,0,1,1,.35,1,
],[0,2,1,3,4,5],I);
const splitA=snapOrigins(splitSurface,[{uuid:'k',position:nearLeft}],{
    alignNormal:true,smoothNormal:true,creaseAngle:60,
})[0];
const splitB=snapOrigins(splitSurface,[{uuid:'k',position:nearRight}],{
    alignNormal:true,smoothNormal:true,creaseAngle:60,
})[0];
assert(dist(splitA.normal,splitB.normal)>.25,
    'Explicit vertex splits remain hard seams; do not weld unrelated geometry');
const translated=prepareSurface(vertices,triangles,[
    2,0,0,0, 0,1,0,0, 0,0,3,0, 10,2,-4,1,
]);
const transformed=snapOrigins(translated,[{
    uuid:'scaled',position:{x:10+.495*2,y:9,z:-4+.495*3},
}],{alignNormal:true,smoothNormal:true,creaseAngle:60})[0];
assert(transformed.position.y>1.9&&transformed.normal.y>.8,
    'World transform and nonuniform scale are applied before normal averaging');
assert.equal(castDown(surface,{x:30,y:3,z:30},0,20,true,
    {creaseCos:0,prepared:{}}),null,'No-hit path is safe with smoothing enabled');

const path=require('node:path');
const knots=[{uuid:'selected',position:{x:.495,y:3,z:.495},rotation:{x:0,y:0,z:0,w:1}}];
let lastOptions=null,rotationWrites=0,snapshots=0;
global.Editor={
 Selection:{getSelected:()=>['root']},
 Message:{request:async (channel,method,payload)=>{
    assert.equal(channel,'scene');
    if(method==='execute-scene-script'){
        if(payload.method==='querySpline')return {found:true,rootUuid:'root',dimension:0,
            knots:knots.map(k=>({uuid:k.uuid,position:{...k.position}}))};
        if(payload.method==='queryKnotEditFrame')return {ok:true,matrix:I};
        if(payload.method==='queryKnotOrientations')return {ok:true,
            parentRotation:{x:0,y:0,z:0,w:1},
            rotations:knots.map(k=>({uuid:k.uuid,rotation:{...k.rotation}}))};
        if(payload.method==='snapToSurfaceTarget'){
            lastOptions=payload.args[3];
            try{return {ok:true,hits:snapOrigins(surface,payload.args[2],lastOptions)};}
            catch(e){return {ok:false,error:e.message};}
        }
        if(payload.method==='queryKnotBatchState')return {ok:true,
        states:payload.args[1].map(uuid=>{
            const node=knots.find(k=>k.uuid===uuid);
            if(!node)throw Error('Missing Knot '+uuid);
            return {uuid,position:{...node.position},
                rotation:{...(node.rotation||{x:0,y:0,z:0,w:1})}};
        })};
    if(payload.method==='refreshPreview')return {ok:true};
        throw Error('Unexpected Scene command '+payload.method);
    }
    if(method==='set-property'){
        assert.equal(payload.record,false);
        if(payload.path==='rotation')rotationWrites++;
        knots[0][payload.path]={...payload.dump.value};
        return true;
    }
    if(method==='snapshot'){snapshots++;return true;}
    throw Error('Unexpected method '+method);
 }},
};
const methods=require(path.join(__dirname,'../dist/main.js')).methods;
(async()=>{
    let result=await methods.snapSelectedToSurface(['selected'],'surface',0,10,true,true,60);
    assert(result.ok,result.error);
    assert.equal(lastOptions.alignNormal,true);
    assert.equal(lastOptions.smoothNormal,true);
    assert.equal(lastOptions.creaseAngle,60);
    assert(rotationWrites>0,'Aligned knot is rotated to a non-flat smoothed normal');
    assert.equal(snapshots,1);
    const writes=rotationWrites;
    knots[0].position.y=3;
    result=await methods.snapSelectedToSurface(['selected'],'surface',0,10);
    assert(result.ok,result.error);
    assert.equal(lastOptions.alignNormal,false);
    assert.equal(lastOptions.smoothNormal,false);
    assert.equal(rotationWrites,writes,'Legacy default never touches rotation');
    const inspector=require('../dist/contributions/inspector/Container.js');
    for(const field of ['spl-surface-smooth-normal','spl-surface-crease-angle'])
        assert(inspector.template.includes(field),'Missing smoothing option in Inspector: '+field);
    console.log('SURFACE SMOOTHING V2 PASS: crease boundaries, split seams, transforms, defaults and editor arguments.');
})().catch(e=>{console.error(e);process.exitCode=1;});
