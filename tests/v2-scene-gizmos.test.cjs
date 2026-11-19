'use strict';
/** Required SDK v3.0.2 adapter, fluent HUD, shared Road/Junction guides. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),
    path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'v2-gizmo-'));
try{
 cp.execFileSync('tsc',['--strict','--target','ES2020','--module','commonjs',
    '--outDir',tmp,'--rootDir',path.join(root,'assets/splines-v2'),
    '--skipLibCheck',path.join(root,'tests/types/cc.d.ts'),
    path.join(root,'assets/splines-v2/Components/SplineGizmoHandler.ts')],{stdio:'pipe'});
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
    if(req==='cc')return {Color,Vec3,Mat4:class Mat4{}};
    if(req==='cc/env')return {EDITOR_NOT_IN_PREVIEW:true};
    return originalLoad.apply(this,arguments);
 };
 try{
    const {SplineGizmoHandler,resolveSplineGizmos}=require(
        path.join(tmp,'Components/SplineGizmoHandler.js'));
    const node={isValid:true,worldMatrix:{tx:10,ty:20,tz:30}};
    const old3D=globalThis.Gizmos3D,old2D=globalThis.Gizmos2D,
        oldHud=globalThis.GizmoHUD;
    const calls=[];
    const mockHud=()=>{
      const make=(id)=>{
       const controls=[]; // Each row owns its children; never self-reference.
       return ({
        id,children:controls,
       position(){return this;},theme(){return this;},
       width(){return this;},padding(){return this;},gap(){return this;},
       text(key,text){controls.push({id:key,text,kind:'text'});return this;},
       row(key,cb){const row=make(key);cb(row);controls.push({
           id:key,kind:'row',children:row.children});return this;},
       toggle(key,text,command){controls.push({id:key,text,kind:'toggle',command});return this;},
       slider(key,text,command,opts){controls.push({
           id:key,text,kind:'slider',command,...opts});return this;},
       button(key,text,command){controls.push({id:key,text,kind:'button',command});return this;},
        build(){return {kind:'hud',id,root:{children:controls}};}
       });
      };
      return {
       createHud:make,bind:property=>({kind:'property',property}),
       action:execute=>({kind:'action',execute})
      };
    };
    const hud=mockHud();
    const sdkMock={
      Gizmos3D:{
       supportsRotationPivot:true,
       beginColor:(owner,color)=>calls.push({t:'color',owner,color}),
       drawLine:(owner,a,b)=>calls.push({t:'line',owner,a:{...a},b:{...b}}),
       drawSphere:(owner,p,r)=>calls.push({t:'sphere',owner,p:{...p},r}),
       move:(property,opts)=>{
        calls.push({t:'move',property,opts});
        return Array.from({length:6},(_,i)=>({
          id:'move-'+i,property,visual:i<3?'axis':'plane',
          axis:i<3?['x','y','z'][i]:undefined,space:opts.space,
          snap:opts.snap
        }));
       },
       rotate:(property,opts)=>['x','y','z'].map(axis=>({
        id:'ring-'+axis,property,axis,visual:'rotation',
        space:opts.space,snap:opts.snap,
        pivotProperty:opts.pivotProperty,pivotSpace:opts.pivotSpace
       }))
      },
      Gizmos2D:{
       rotate:(property,opts)=>[{property,axis:'z',visual:'rotation',
        space:opts.space,snap:opts.snap}]
      },
      GizmoHUD:hud
    };
    const handler=new SplineGizmoHandler(()=>sdkMock);
    const base={
      mode:'knots',positionSpace:'local',rotationSpace:'local',
      positionSnap:0,rotationSnap:0,activeIndex:1,knotCount:3,
      showKnots:true,multiPoints:true,pointLimit:16,selectedIndices:[0,1],
      manualTangents:true,editTangents:true,rotateTangents:true
    };
    let descriptors=handler.handles(base);
    assert.equal(descriptors.length,13,'6 move, 2 indexed points, 3 Knot rings, 2 tangents');
    assert.deepEqual(descriptors.filter(x=>x.index!==undefined).map(x=>x.index),[0,2]);
    assert.equal(descriptors.find(x=>x.index===0).color,'#72e6e0');
    assert.equal(descriptors.find(x=>x.index===2).color,'#ffb84a');
    assert.equal(descriptors.filter(x=>x.property==='pathGizmoKnotTangentEuler').length,3);
    assert(descriptors.filter(x=>x.property==='pathGizmoKnotTangentEuler')
      .every(x=>x.pivotProperty==='pathGizmoKnotPosition'&&x.pivotSpace==='local'));
    descriptors=handler.handles({...base,positionSpace:'world',rotationSpace:'world',
      positionSnap:.25,rotationSnap:15});
    assert(descriptors.every(d=>d.space==='world'));
    assert(descriptors.every(d=>d.snap===.25||d.snap===15));
    assert(descriptors.some(d=>d.property==='pathGizmoKnotPositionsWorld'));
    assert(descriptors.some(d=>d.property==='pathGizmoTangentOutWorld'));
    assert.equal(handler.handles({...base,mode:'2d'}).length,1);
    assert.deepEqual(handler.handles({...base,mode:'3d'}).map(h=>h.axis),['x','y','z']);
    assert.deepEqual(handler.handles({...base,showKnots:false}),[]);
    assert.equal(handler.handles({...base,manualTangents:false}).length,8);
    let toggled=0,cleared=0;
    const definition=handler.hud({
      activeIndex:1,knotCount:3,position:{x:2,y:0,z:4},
      positionSpace:'world',selectedIndices:[0,1],manualTangents:true,
      onToggleGroup:()=>{toggled++;},onClearGroup:()=>{cleared++;}
    });
    assert.equal(definition.kind,'hud');
    assert.equal(definition.id,'spline-path');
    const flatten=nodes=>nodes.flatMap(n=>n.children?[n,...flatten(n.children)]:[n]);
    const controls=flatten(definition.root.children);
    assert.match(controls.find(n=>n.id==='active').text,/Knot 1.*world.*X 2.00/);
    assert.equal(controls.find(n=>n.id==='roll').command.property,'pathGizmoActiveRoll');
    assert.equal(controls.find(n=>n.id==='active-knot').max,2);
    assert.equal(controls.find(n=>n.id==='position-snap').step,.05);
    controls.find(n=>n.id==='group-toggle').command.execute({});
    controls.find(n=>n.id==='group-clear').command.execute({});
    assert.deepEqual([toggled,cleared],[1,1]);
    assert.equal(controls.filter(n=>n.kind==='toggle').length,7);
    assert.equal(handler.hud({...base,knotCount:1}),null);
    const rendered=handler.drawGuide(node,guide);
    assert.equal(rendered,guide.lines.length+guide.dots.length);
    const first=calls.find(x=>x.t==='line');
    assert(Math.abs(first.a.x-(guide.lines[0].a.x+10))<1e-8);
    assert(Math.abs(first.a.z-(guide.lines[0].a.z+30))<1e-8);
    assert(calls.some(x=>x.t==='sphere'));
    assert.equal(handler.drawGuide({...node,isValid:false},guide),0);
    assert.equal(handler.drawGuide(node,{
      lines:[...guide.lines,...guide.lines,...guide.lines,...guide.lines],
      dots:[...guide.dots,...guide.dots]
    }),600+6);
    try{
      globalThis.Gizmos3D=sdkMock.Gizmos3D;
      globalThis.Gizmos2D=sdkMock.Gizmos2D;
      globalThis.GizmoHUD=sdkMock.GizmoHUD;
      assert(resolveSplineGizmos(),'Latest required SDK must resolve through Scene globals');
      globalThis.GizmoHUD=undefined;
      assert.equal(resolveSplineGizmos(),null,'Old flat HUD SDK must be rejected');
      globalThis.GizmoHUD=sdkMock.GizmoHUD;
      globalThis.Gizmos3D={...sdkMock.Gizmos3D,supportsRotationPivot:false};
      assert.equal(resolveSplineGizmos(),null,'Pivot-less SDK cannot be accepted');
    }finally{
      globalThis.Gizmos3D=old3D;globalThis.Gizmos2D=old2D;
      globalThis.GizmoHUD=oldHud;
    }
    // A missing mandatory extension reports ONE actionable Console warning,
    // never silently renders legacy handles, and never logs in Play.
    const warn=console.warn,errors=[];
    try{
      console.warn=(...args)=>errors.push(args.join(' '));
      const missing=new SplineGizmoHandler(()=>null);
      assert.deepEqual(missing.handles(base),[]);
      assert.deepEqual(missing.handles(base),[]);
      assert.equal(missing.drawGuide(node,guide),0);
      assert.equal(errors.length,1);
      assert.match(errors[0],/REQUIRED cocos-gizmos >=3.0.2/);
    }finally{console.warn=warn;}
 }finally{Module._load=originalLoad;}
 const road=fs.readFileSync(path.join(root,'assets/splines-v2/Components/SplineRoad.ts'),'utf8');
 const junction=fs.readFileSync(path.join(root,'assets/splines-v2/Components/JunctionPatch.ts'),'utf8');
 assert.match(road,/public onDrawGizmosSelected\(\):void/);
 assert(!/\bpublic onGizmoHandles\(/.test(road),'Road cannot own Knot handles');
 assert(!/\b(?:knots:Node\[\]|interpolation=|closed=false)\b/.test(road),
   'Road cannot own Path source fields');
 const pathSource=fs.readFileSync(path.join(root,'assets/splines-v2/Components/SplinePath.ts'),'utf8');
 assert.match(pathSource,/public onGizmoHandles\(/);
 assert.match(pathSource,/public onGizmoChanged\(/);
 assert.match(junction,/public onDrawGizmosSelected\(\):void/);
 assert.match(road,/if\(!EDITOR_NOT_IN_PREVIEW\|\|!this.showSceneGizmos/);
 assert.match(junction,/if\(!EDITOR_NOT_IN_PREVIEW\|\|!this.showJunctionSceneGizmos/);
 assert.match(junction,/link\.road\.sampleJunctionEnd/);
 const native=require(path.join(root,'src/contributions/inspector/RoadV2.js'));
 for(const field of ['showSceneGizmos','gizmoSteps','gizmoEdges',
     'showJunctionSceneGizmos','gizmoJunctionCurbs'])
      assert(native.makeV2Inspector?native.makeV2Inspector.toString().includes(field):
         fs.readFileSync(path.join(root,'src/contributions/inspector/RoadV2.js'),'utf8').includes(field));
 assert(fs.existsSync(path.join(root,'assets/splines-v2/Components/SplineGizmoHandler.ts.meta')));
 assert(fs.existsSync(path.join(root,'assets/splines-v2/geometry/SceneGizmoGuideV2.ts.meta')));
 // Public APIs and Inspector must use 'Gizmos', never a version-branded key.
 for(const part of ['SplinePath','SplineRoad','JunctionPatch',
    'MeshGenerator','SplineGizmoHandler']){
    const source=fs.readFileSync(path.join(root,'assets/splines-v2/Components/'+part+'.ts'),'utf8');
    assert(!/(?:gizmoV[0-9]|GizmoV[0-9]|GizmosV[0-9]|Gizmos\s+v[0-9])/i.test(source),
       part+' must not expose version-tagged Gizmos symbols');
 }
 const ui=fs.readFileSync(path.join(root,'src/contributions/inspector/RoadV2.js'),'utf8');
 assert(!/(?:gizmoV[0-9]|GizmoV[0-9]|GizmosV[0-9]|Gizmos\s+v[0-9])/i.test(ui),
    'Inspector must not present version-specific Gizmos labels');
 assert.deepEqual(fs.readdirSync(path.join(root,'assets/splines-v2/Components')).filter(n=>/^SplineGizmo.*Handler\.ts$/.test(n)),['SplineGizmoHandler.ts'],
    'Only one Editor SDK adapter must ship');

 console.log('V2 SCENE GIZMOS HANDLER PASS: required SDK gate, builder HUD commands, pivot, shared drawing and world transforms.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
