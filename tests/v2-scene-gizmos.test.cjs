'use strict';
/** Bounded read-only Road/Junction selection guide + optional Gizmos3D bridge. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
    path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'v2-gizmo-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
    '--outDir',tmp,'--rootDir',path.join(root,'assets/splines-v2'),
    '--skipLibCheck',path.join(root,'tests/types/cc.d.ts'),
    path.join(root,'assets/splines-v2/Components/SplineGizmoBridge.ts')],{stdio:'pipe'});
 const {buildRoadSceneGuideV2,buildJunctionSceneGuideV2}=require(
    path.join(tmp,'geometry/SceneGizmoGuideV2.js'));
 const frame=(x)=>({distance:x,parameter:x/100,
    position:{x,y:0,z:2*Math.sin(x/10)},
    right:{x:0,y:0,z:1},up:{x:0,y:1,z:0},tangent:{x:1,y:0,z:0}});
 const frames=Array.from({length:320},(_,i)=>frame(i/4));
 const knots=[{x:0,y:0,z:0},{x:36,y:0,z:-2},{x:70,y:0,z:0}];
 const f=JSON.stringify(frames),k=JSON.stringify(knots);
 const guide=buildRoadSceneGuideV2(frames,knots,3.1,{maxSteps:64});
 assert(guide.lines.length>0&&guide.lines.length<=64*3+2);
 assert.equal(guide.dots.length,3);
 assert.deepEqual(guide.lines[0].group,'center');
 assert(guide.lines.some(x=>x.group==='edge'));
 assert.equal(guide.lines.filter(x=>x.group==='trim').length,2);
 assert.deepEqual(guide.lines[guide.lines.length-1].b,
    {x:frames[frames.length-1].position.x,y:0,z:frames[frames.length-1].position.z+3.1});
 assert.equal(JSON.stringify(frames),f,'Road frames changed during read-only Gizmo draw');
 assert.equal(JSON.stringify(knots),k,'Knots must stay immutable');
 assert.deepEqual(guide,buildRoadSceneGuideV2(frames,knots,3.1,{maxSteps:64}),
    'Guide generation must be deterministic');
 const minimal=buildRoadSceneGuideV2(frames,knots,3.1,
    {maxSteps:8,showEdges:false,showKnots:false});
 assert.equal(minimal.dots.length,0);
 assert(!minimal.lines.some(x=>x.group==='edge'||x.group==='trim'));
 assert.throws(()=>buildRoadSceneGuideV2(frames,knots,1,{maxSteps:500}),/Invalid/);
 assert.throws(()=>buildRoadSceneGuideV2(frames,[{x:NaN,y:0,z:0}],1),/Invalid/);
 for(const n of [3,4]){
    const branches=Array.from({length:n},(_,i)=>{
        const a=i*2*Math.PI/n,r={x:Math.cos(a),z:Math.sin(a)};
        const side={x:-r.z,z:r.x};
        const p=(u)=>({position:{x:r.x*5+side.x*u,y:0,z:r.z*5+side.z*u},
            uv0:{x:0,y:u}});
        return {endpoint:{x:0,y:0,z:0},left:p(-2),middle:p(0),right:p(2),
            profile:{vertices:[p(-3),p(-2),p(0),p(2),p(3)],edgeMaterials:[2,1,0,2]}};
    });
    const s=JSON.stringify(branches);
    const junction=buildJunctionSceneGuideV2(branches);
    assert.equal(junction.lines.length,n*4);
    assert.equal(junction.dots.length,1+n*3);
    assert.equal(junction.dots[0].group,'junction');
    assert.equal(JSON.stringify(branches),s);
    const noCurb=buildJunctionSceneGuideV2(branches,{showCurb:false});
    assert.equal(noCurb.dots.length,n+1);
    assert.throws(()=>buildJunctionSceneGuideV2(branches.slice(0,2)),/3 or 4/);
 }
 class Color {constructor(r,g,b,a=255){Object.assign(this,{r,g,b,a});}}
 class Vec3 {
    constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
    static transformMat4(out,p,m){out.x=p.x+m.tx;out.y=p.y+m.ty;out.z=p.z+m.tz;return out;}
 }
 const originalLoad=Module._load;
 Module._load=function(req,parent,isMain){
    if(req==='cc')return {Color,Vec3};
    if(req==='cc/env')return {EDITOR_NOT_IN_PREVIEW:true};
    return originalLoad.apply(this,arguments);
 };
 try{
    const {drawSplineSceneGizmos,availableGizmoBackend,
        buildSplineKnotMoveGizmos,buildSplineKnotPointGizmos}=require(
        path.join(tmp,'Components/SplineGizmoBridge.js'));
    const node={isValid:true,worldMatrix:{tx:10,ty:20,tz:30}};
    const old=globalThis.Gizmos3D;
    try{
      delete globalThis.Gizmos3D;
      assert.equal(availableGizmoBackend(),null,'Cocos-Gizmos is optional');
      assert.deepEqual(buildSplineKnotMoveGizmos('gizmoKnotPosition'),[]);
      assert.deepEqual(buildSplineKnotPointGizmos('gizmoKnotPositions',[0,1]),[]);
      assert.equal(drawSplineSceneGizmos(node,guide),0);
      const calls=[],sdkMock={beginColor:(owner,color)=>calls.push({t:'color',owner,color}),
        drawLine:(owner,a,b)=>calls.push({t:'line',owner,a:{...a},b:{...b}}),
        drawSphere:(owner,p,r)=>calls.push({t:'sphere',owner,p:{...p},r}),
        move:(property,options)=>{
          calls.push({t:'move',property,options});
          return Array.from({length:6},(_,i)=>({id:'handle-'+i,property,
            visual:i<3?'axis':'plane',space:options.space,plane:'xy'}));
        }};
      globalThis.Gizmos3D=sdkMock;
      assert.equal(availableGizmoBackend(),sdkMock,'Actual global installed by Gizmos scene.js');
      const none=buildSplineKnotPointGizmos('gizmoKnotPositions',[0,2]);
      assert.equal(none.length,2);
      assert.deepEqual(none.map(h=>h.index),[0,2]);
      assert(none.every(h=>h.property==='gizmoKnotPositions'&&h.plane==='view'&&
        h.space==='local'&&h.visual==='point'&&h.pickSize===24));
      assert.throws(()=>buildSplineKnotPointGizmos('gizmoKnotPositions',[-1]),
        /invalid indexed Knot/);
      const move=buildSplineKnotMoveGizmos('gizmoKnotPosition');
      assert.equal(move.length,6,'Gizmos move generates XYZ+three plane descriptors');
      assert(move.every(h=>h.property==='gizmoKnotPosition'));
      const moveCall=calls.find(x=>x.t==='move');
      assert.equal(moveCall.options.space,'local');
      assert.equal(moveCall.options.pickSize,28);
      const rendered=drawSplineSceneGizmos(node,guide);
      assert.equal(rendered,guide.lines.length+guide.dots.length);
      const first=calls.find(x=>x.t==='line');
      assert(Math.abs(first.a.x-(guide.lines[0].a.x+10))<1e-8);
      assert(Math.abs(first.a.z-(guide.lines[0].a.z+30))<1e-8);
      assert(calls.some(x=>x.t==='sphere'));
      assert(calls.every(x=>x.t==='move'||x.owner===node));
      globalThis.Gizmos3D={beginColor:()=>{},drawLine:null};
      assert.equal(availableGizmoBackend(),null,'Malformed SDK must fail safely');
      assert.deepEqual(buildSplineKnotMoveGizmos('gizmoKnotPosition'),[]);
      globalThis.Gizmos3D=sdkMock;
      assert.equal(drawSplineSceneGizmos({...node,isValid:false},guide),0);
      assert.equal(drawSplineSceneGizmos(node,{lines:[...guide.lines,...guide.lines,...guide.lines,...guide.lines],dots:[...guide.dots,...guide.dots]}),600+6);
    }finally{globalThis.Gizmos3D=old;}
 }finally{Module._load=originalLoad;}
 const road=fs.readFileSync(path.join(root,'assets/splines-v2/Components/SplineRoadV2.ts'),'utf8');
 const junction=fs.readFileSync(path.join(root,'assets/splines-v2/Components/SplineJunctionPatchV2.ts'),'utf8');
 assert.match(road,/public onDrawGizmosSelected\(\):void/);
 assert.match(junction,/public onDrawGizmosSelected\(\):void/);
 assert.match(road,/if\(!EDITOR_NOT_IN_PREVIEW\|\|!this.showSceneGizmos/);
 assert.match(junction,/if\(!EDITOR_NOT_IN_PREVIEW\|\|!this.showJunctionSceneGizmos/);
 assert.match(junction,/link\.road\.sampleJunctionEndV2/);
 const native=require(path.join(root,'src/contributions/inspector/RoadV2.js'));
 for(const field of ['showSceneGizmos','gizmoSteps','gizmoEdges',
     'gizmoKnots','gizmoEditKnot','gizmoKnotIndex',
     'gizmoMultiKnotPoints','gizmoPointLimit','showJunctionSceneGizmos','gizmoJunctionCurbs'])
      assert(native.makeV2Inspector?native.makeV2Inspector.toString().includes(field):
         fs.readFileSync(path.join(root,'src/contributions/inspector/RoadV2.js'),'utf8').includes(field));
 assert(fs.existsSync(path.join(root,'assets/splines-v2/Components/SplineGizmoBridge.ts.meta')));
 assert(fs.existsSync(path.join(root,'assets/splines-v2/geometry/SceneGizmoGuideV2.ts.meta')));
 // Public APIs and Inspector must use 'Gizmos', never a version-branded key.
 for(const part of ['SplinePathV2','SplineRoadV2','SplineJunctionPatchV2',
    'SplineMeshGeneratorV2','SplineGizmoBridge']){
    const source=fs.readFileSync(path.join(root,'assets/splines-v2/Components/'+part+'.ts'),'utf8');
    assert(!/(?:gizmoV[0-9]|GizmoV[0-9]|GizmosV[0-9]|Gizmos\s+v[0-9])/i.test(source),
       part+' must not expose version-tagged Gizmos symbols');
 }
 const ui=fs.readFileSync(path.join(root,'src/contributions/inspector/RoadV2.js'),'utf8');
 assert(!/(?:gizmoV[0-9]|GizmoV[0-9]|GizmosV[0-9]|Gizmos\s+v[0-9])/i.test(ui),
    'Inspector must not present version-specific Gizmos labels');
 assert.deepEqual(fs.readdirSync(path.join(root,'assets/splines-v2/Components')).filter(n=>/^SplineGizmo.*Bridge\.ts$/.test(n)),['SplineGizmoBridge.ts'],
    'Only one non-versioned Gizmos bridge must ship');

 console.log('V2 SCENE GIZMOS BRIDGE PASS: bounded guides, global move/indexed point descriptors, world draw, Editor gating.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
