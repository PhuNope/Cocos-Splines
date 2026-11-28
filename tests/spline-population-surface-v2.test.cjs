'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),
  cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-surface-pop-'));
const close=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' != '+b);
try{
  cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
    '--noEmit','false','--outDir',tmp],{stdio:'pipe'});
  const {projectSurfaceCandidates,surfaceBasis}=require(
    path.join(tmp,'Core','SplinePopulationSurfaceMath.js'));
  const candidate=(index,x,y=0)=>({index,progress:index/2,position:{x,y,z:0}});
  const settings=(overrides={})=>({
    rayHeight:10,rayDepth:20,surfaceOffset:.5,minNormalY:.3,
    skipMissing:true,targetCount:2,...overrides
  });
  const hits=(origin)=>origin.x===0?[
      {targetIndex:1,distance:3,point:{x:0,y:7,z:0},normal:{x:0,y:1,z:0}},
      {targetIndex:0,distance:12,point:{x:0,y:-2,z:0},normal:{x:0,y:2,z:0}},
      {targetIndex:0,distance:11,point:{x:0,y:-1,z:0},normal:{x:0,y:1,z:0}}
    ]:origin.x===5?[
      {targetIndex:0,distance:11,point:{x:5,y:-1,z:0},normal:{x:1,y:0,z:0}}
    ]:[];
  const raw=[candidate(0,0),candidate(1,5),candidate(2,10)];
  const p=projectSurfaceCandidates(raw,settings({targetCount:1}),hits);
  assert.deepEqual(p.map(x=>x.index),[0]);
  close(p[0].position.y,-.5);
  assert.deepEqual(p[0].surfaceNormal,{x:0,y:1,z:0});
  assert.deepEqual(raw[0].position,{x:0,y:0,z:0},'Input candidates immutable');
  const keep=projectSurfaceCandidates(raw,settings({targetCount:1,skipMissing:false}),hits);
  assert.deepEqual(keep.map(x=>x.index),[0,1,2]);
  assert.deepEqual(keep[1].position,raw[1].position);
  assert.equal(keep[1].surfaceNormal,null);
  const sloped=projectSurfaceCandidates([candidate(0,0)],
    settings({minNormalY:.9,targetCount:1}),
    ()=>[{targetIndex:0,distance:1,point:{x:1,y:0,z:0},
      normal:{x:1,y:0,z:0}}]);
  assert.deepEqual(sloped,[],'Steep slope rejected');
  const basis=surfaceBasis({x:0,y:1,z:0},{x:0,y:0,z:1});
  close(basis.right.x,1);close(basis.up.y,1);close(basis.forward.z,1);
  const perpendicular=surfaceBasis({x:0,y:1,z:0},{x:0,y:1,z:0});
  for(const axis of ['x','y','z'])
    assert(Number.isFinite(perpendicular.forward[axis]),'Near-parallel forward has fallback');
  assert.throws(()=>surfaceBasis({x:0,y:0,z:0},{x:0,y:0,z:1}));
  for(const invalid of [
      {rayHeight:-1},{rayDepth:NaN},{rayHeight:0,rayDepth:0},
      {targetCount:0},{targetCount:65},{minNormalY:2},
      {surfaceOffset:1001},{skipMissing:0}
  ])assert.throws(()=>projectSurfaceCandidates(raw,settings(invalid),hits));
  assert.throws(()=>projectSurfaceCandidates([candidate(0,NaN)],settings(),hits));
  assert.throws(()=>projectSurfaceCandidates(raw,settings(),()=>null));
  class Vec3 {
    constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
    clone(){return new Vec3(this.x,this.y,this.z);}
    set(x,y,z){if(x&&typeof x==='object')return this.set(x.x,x.y,x.z);
      Object.assign(this,{x,y,z});return this;}
    lengthSqr(){return this.x*this.x+this.y*this.y+this.z*this.z;}
    static subtract(out,a,b){return out.set(a.x-b.x,a.y-b.y,a.z-b.z);}
    static normalize(out,a){const length=Math.hypot(a.x,a.y,a.z);return length?out.set(a.x/length,a.y/length,a.z/length):out.set(0,0,0);}
    static add(out,a,b){return out.set(a.x+b.x,a.y+b.y,a.z+b.z);}
    static transformQuat(out,a){return out.set(a);}
  }
  class Quat{
    static multiply(out){return out;}
    static fromEuler(out){return out;}
    static fromAxes(out,x,y,z){out.axes={x,y,z};return out;}
  }
  class Node{
    constructor(name='node'){this.name=name;this.uuid=name;this.children=[];
      this.parent=null;this.isValid=true;this.activeInHierarchy=true;
      this.scale=new Vec3(1,1,1);this.worldPosition=new Vec3();this.worldRotation=new Quat();}
    setParent(p){this.removeFromParent();this.parent=p;if(p)p.children.push(this);}
    removeFromParent(){if(!this.parent)return;const i=this.parent.children.indexOf(this);
      if(i>=0)this.parent.children.splice(i,1);this.parent=null;}
    setWorldPosition(p){this.worldPosition=p.clone();}
    setWorldRotation(q){this.worldRotation=q;}
    setScale(p){this.scale=p.clone();}
    getComponent(){return null;}
    destroy(){this.isValid=false;}
  }
  class Component{constructor(){this.node=new Node();this.enabled=true;}}
  class Collider extends Component{constructor(name){super();this.node=new Node(name);}}
  class Ray{constructor(ox,oy,oz,dx,dy,dz){Object.assign(this,{ox,oy,oz,dx,dy,dz});}}
  const ground=new Collider('ground'),wrong=new Collider('not-target');
  const physics={raycastResults:[],calls:[],
    raycast(ray,mask,distance,queryTrigger){
      this.calls.push({ray,mask,distance,queryTrigger});
      const x=ray.ox;
      this.raycastResults=x===0?[
        {collider:wrong,distance:4,hitPoint:new Vec3(x,6,0),hitNormal:new Vec3(0,1,0)},
        {collider:ground,distance:12,hitPoint:new Vec3(x,-2,0),hitNormal:new Vec3(0,1,0)}
      ]:x===5?[
        {collider:ground,distance:12,hitPoint:new Vec3(x,-2,0),hitNormal:new Vec3(0,1,0)}
      ]:[];
      return this.raycastResults.length>0;
    }
  };
  const made=[],cc={_decorator:{ccclass:()=>cl=>cl,property:()=>{},menu:()=>cl=>cl},
    Component,Node,Collider,Vec3,Quat,Prefab:class{},Enum:x=>x,PhysicsSystem:{instance:physics},
    geometry:{Ray},instantiate:()=>{
      const n=new Node('clone');made.push(n);return n;
    }};
  const previous=Module._load;
  Module._load=function(name,parent,isMain){
    if(name==='cc')return cc;
    if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};
    if(name==='../Core/SplineContainer'||name==='./SplineContainer')return {SplineContainer:class SplineContainer{}};
    if(name==='./SplineModifiers')return {SplineModifiers:class SplineModifiers{}};
    if(name==='./SplineNoise')return {SplineNoise:class SplineNoise{}};
    if(name==='./SplineInstantiate')return {InstantiateMethod:{Count:0,Distance:1}};
    return previous.call(this,name,parent,isMain);
  };
  try{
    const {SplineObjectController}=require(
      path.join(tmp,'Components','SplineObjectController.js'));
    const spline={count:2,closed:false,length:10,node:new Node('spline'),
      segmentCount:1,getRevision:()=>1,evaluateWorldPosition:t=>new Vec3(t*10,0,0),
      evaluateTangent:()=>new Vec3(1,0,0),evaluateUp:()=>new Vec3(0,1,0),
      evaluateRotation:()=>new Quat()};
    const ctrl=new SplineObjectController();ctrl.spline=spline;
    ctrl.prefabs=[{id:'A'}];ctrl.count=3;ctrl.alignToSpline=true;
    ctrl.randomPosition=new Vec3();ctrl.randomRotation=new Vec3();ctrl.randomScale=0;
    ctrl.offset=new Vec3();ctrl.conformToSurface=false;
    assert.equal(ctrl.respawn(),3);
    assert.deepEqual(made.slice(-3).map(x=>x.worldPosition.x),[0,5,10]);
    assert.equal(physics.calls.length,0,'Opt-out must never query Physics');
    ctrl.conformToSurface=true;ctrl.surfaceColliders=[ground];
    ctrl.surfaceRayHeight=10;ctrl.surfaceRayDepth=20;ctrl.surfaceOffset=.5;
    ctrl.alignToSurfaceNormal=true;
    assert.equal(ctrl.respawn(),2,'No hit candidate is skipped');
    assert.deepEqual(ctrl.spawnedRoot.children.map(n=>n.name),
      ['Spline Object 000','Spline Object 001']);
    assert.deepEqual(made.slice(-2).map(x=>x.worldPosition.y),[-1.5,-1.5]);
    assert(physics.calls.every(x=>x.ray.dy===-1&&x.mask===0xffffffff&&
      x.distance===30&&x.queryTrigger===false));
    assert(made.slice(-2).every(n=>n.worldRotation.axes?.y.y===1),
      'Conformed normals must align Up');
    // Projections are used BEFORE obstacle filtering: obstacle at y=-1.5
    ctrl.avoidObstacleColliders=true;
    ctrl.obstacleColliders=[Object.assign(new Collider('obstacle'),{
      worldBounds:{center:new Vec3(0,-1.5,0),halfExtents:new Vec3(.1,.1,.1)}
    })];
    ctrl.obstacleClearance=0;
    assert.equal(ctrl.respawn(),1);
    assert.equal(ctrl.spawnedRoot.children[0].name,'Spline Object 001');
    const existing=ctrl.spawnedRoot.children.slice();
    ctrl.surfaceRayDepth=-1;
    assert.throws(()=>ctrl.respawn(),'Invalid ray settings cannot destroy old population');
    assert.deepEqual(ctrl.spawnedRoot.children,existing);
    assert(existing[0].isValid);
    ctrl.surfaceRayDepth=20;ctrl.surfaceColliders=[];
    assert.throws(()=>ctrl.respawn(),'Empty targets must fail before cleanup');
    assert.deepEqual(ctrl.spawnedRoot.children,existing);
    ctrl.surfaceColliders=[ground];ctrl.avoidObstacleColliders=false;
    ctrl.skipMissingSurface=false;
    assert.equal(ctrl.respawn(),3,'Missing surface can keep existing spline placement');
    assert.equal(ctrl.spawnedRoot.children[2].worldPosition.y,0);
    const signature=ctrl.signature();ctrl.surfaceOffset=.75;
    assert.notEqual(ctrl.signature(),signature,'Surface settings invalidate signature');
    ctrl.conformToSurface=false;assert.equal(ctrl.respawn(),3);
    assert.deepEqual(made.slice(-3).map(n=>n.worldPosition.y),[0,0,0],
      'Disable surface conform restores legacy positions');
    const signatureOff=ctrl.signature();
    ctrl.surfaceOffset=-99;
    assert.equal(ctrl.signature(),signatureOff,'Disabled surface settings ignored');
    // Graph uses real shared world-frame adapter and the same explicit-target
    // raycast path, independently of ordinary conform/avoid toggles.
    ctrl.usePopulationGraph=true;ctrl.populationGraphJson=JSON.stringify({version:1,output:'out',nodes:[
      {id:'source',type:'spline'},{id:'dist',type:'count',input:'source',count:3},
      {id:'project',type:'surface',input:'dist',rayHeight:10,rayDepth:20,surfaceOffset:.5},
      {id:'align',type:'align',input:'project',alignment:'surface'},
      {id:'filter',type:'obstacle',input:'align',clearance:0},
      {id:'prefab',type:'prefab',input:'filter',weights:[1]},
      {id:'out',type:'output',input:'prefab'}]});
    const graphPreview=ctrl.previewPopulationGraph();assert.deepEqual(graphPreview.map(p=>p.index),[1]);
    const originalNodes=ctrl.spawnedRoot.children.slice(),rayStart=physics.calls.length;
    const stats=ctrl.summarizePlacement();assert.equal(stats.total,3);assert.equal(stats.accepted,1);assert.equal(stats.byReason.surface,1);assert.equal(stats.byReason.collider,1);assert.equal(physics.calls.length,rayStart+3);
    assert.deepEqual(ctrl.spawnedRoot.children,originalNodes);assert.deepEqual(ctrl.previewPlacement().map(p=>p.reason),['collider','accepted','surface']);
    assert.equal(ctrl.respawn(),1);assert.equal(ctrl.spawnedRoot.children[0].worldPosition.y,-1.5);
    assert.equal(ctrl.spawnedRoot.children[0].worldRotation.axes.y.y,1);
    const committed=ctrl.spawnedRoot.children.slice();ctrl.surfaceColliders=[];
    assert.throws(()=>ctrl.respawn(),/surface/i);assert.deepEqual(ctrl.spawnedRoot.children,committed);
    ctrl.surfaceColliders=[ground];ctrl.obstacleColliders=[];assert.equal(ctrl.respawn(),2);
    assert.deepEqual(ctrl.spawnedRoot.children.map(n=>n.name),['Spline Object 000','Spline Object 001']);
  }finally{Module._load=previous;}
  const pkg=require(root+'/package.json');
  assert(pkg.scripts.test.includes('spline-population-surface-v2.test.cjs'));
  const panel=require(root+'/dist/contributions/inspector/ObjectController.js');
  for(const field of ['conformToSurface','surfaceColliders','surfaceRayHeight',
    'surfaceRayDepth','surfaceOffset','minSurfaceNormalY','skipMissingSurface','alignToSurfaceNormal'])
    assert(panel.template.includes('spl-field-'+field),'Missing surface Inspector '+field);
  console.log('POPULATION SURFACE V2 PASS: isolated 3D raycast hits, slope, normal, missing policy, preflight, legacy.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
