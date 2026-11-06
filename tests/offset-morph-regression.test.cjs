'use strict';
/** Checks world-distance speed compensation through the real compiled follower,
 * and preview Restore->Blend against the real Morph component. Cocos mocks only. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cocos-splines-offset-'));
try {
  cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),'--noEmit','false','--outDir',tmp],{stdio:'pipe'});
  class Vec3 {
    constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
    clone(){return new Vec3(this.x,this.y,this.z);}
    set(x,y,z){if(typeof x==='object'){this.x=x.x;this.y=x.y;this.z=x.z;}else{this.x=x;this.y=y;this.z=z;}return this;}
    static add(o,a,b){return o.set(a.x+b.x,a.y+b.y,a.z+b.z);}
    static subtract(o,a,b){return o.set(a.x-b.x,a.y-b.y,a.z-b.z);}
    static multiplyScalar(o,a,n){return o.set(a.x*n,a.y*n,a.z*n);}
    static transformQuat(o,a,q){
      const t=q?.heading||0,tilt=q?.tilt||0;
      const x=a.x*Math.sin(t)+a.z*Math.cos(t),z=-a.x*Math.cos(t)+a.z*Math.sin(t);
      return o.set(x,a.y*Math.cos(tilt)-z*Math.sin(tilt),a.y*Math.sin(tilt)+z*Math.cos(tilt));
    }
    static normalize(o,a){const d=Math.hypot(a.x,a.y,a.z)||1;return o.set(a.x/d,a.y/d,a.z/d);}
    static cross(o,a,b){return o.set(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);}
    static transformMat4(o,a,m){return o.set(a.x+(m?.m12||0),a.y+(m?.m13||0),a.z+(m?.m14||0));}
  }
  class Quat {
    constructor(){this.heading=0;}
    clone(){const q=new Quat();q.heading=this.heading;return q;}
    static multiply(o,a,b){o.heading=(a?.heading||0)+(b?.heading||0);return o;}
    static fromEuler(o){return o;}
    static fromAxes(o,right,up,forward){o.up=up.clone();o.forward=forward.clone();return o;}
  }
  class Mat4 {constructor(){Object.assign(this,{m00:1,m05:1,m10:1,m12:0,m13:0,m14:0});}static invert(out,inMat){return Object.assign(out,inMat);}}
  class Node {
    constructor(name='node'){this.uuid=name;this.isValid=true;this.parent=null;this.worldMatrix=new Mat4();this.worldRotation=new Quat();this.worldPosition=new Vec3();this.worldRotation=new Quat();this.position=new Vec3();}
    getComponent(){return null;}setWorldPosition(p){this.worldPosition=p.clone();}setWorldRotation(q){this.worldRotation=q.clone();}
    setPosition(p){this.position=p.clone();}emit(){}
  }
  class Component {constructor(){this.node=new Node();this.enabled=true;}getComponent(){return null;}}
  class EventHandler{static emitEvents(events,...args){for(const e of events||[])if(typeof e==='function')e(...args);}}
  const env={EDITOR_NOT_IN_PREVIEW:false};
  const cc={_decorator:{ccclass:()=>cls=>cls,property:()=>{},menu:()=>cls=>cls,executeInEditMode:()=>cls=>cls},Component,Node,Vec3,Quat,Mat4,Enum:x=>x,EventHandler};
  const original=Module._load;
  Module._load=function(n,parent,isMain){if(n==='cc')return cc;if(n==='cc/env')return env;return original.call(this,n,parent,isMain);};
  try {
    const {SplineAnimate,AnimateMethod,LoopMode,Easing,JunctionMode,SplineUpMode}=require(path.join(tmp,'Components/SplineAnimate.js'));
    const {SplineJunction,JunctionExitDirection}=require(path.join(tmp,'Components/SplineJunction.js'));
    const {buildOffsetArcLUT,offsetDistanceFractionToProgress,offsetProgressToDistanceFraction}=require(path.join(tmp,'Core/SplineTraversal.js'));
    const a=buildOffsetArcLUT(p=>({x:5*Math.cos(p*Math.PI/2),y:0,z:5*Math.sin(p*Math.PI/2)}),512);
    assert(Math.abs(a.length-5*Math.PI/2)<.00002);
    for(const p of [.05,.2,.48,.76,.97]){
      assert(Math.abs(offsetDistanceFractionToProgress(a,offsetProgressToDistanceFraction(a,p))-p)<1e-8);
    }
    // Target Local Up preserves initial Target local +Y; independent guide updates live.
    const orientSpline={node:new Node('up-path'),evaluateRotation:()=>new Quat(),
      evaluateTangent:()=>new Vec3(0,0,1),evaluateUp:()=>new Vec3(0,1,0)};
    const upFollower=new SplineAnimate();upFollower.node=new Node('up-follower');upFollower.target=new Node('up-target');
    upFollower.upMode=SplineUpMode.TargetLocal;upFollower.target.worldRotation.tilt=Math.PI/4;
    const firstRotation=upFollower.alignRotation(orientSpline,.2);
    assert(Math.abs(firstRotation.up.y-Math.SQRT1_2)<1e-8);
    assert(Math.abs(firstRotation.up.z-Math.SQRT1_2)<1e-8);
    upFollower.target.worldRotation.tilt=0;
    assert(Math.abs(upFollower.alignRotation(orientSpline,.3).up.z-firstRotation.up.z)<1e-8);
    const upGuide=new Node('up-reference');upGuide.worldRotation.tilt=Math.PI/6;upFollower.upReference=upGuide;
    assert(Math.abs(upFollower.alignRotation(orientSpline,.2).up.z-.5)<1e-8);
    upGuide.worldRotation.tilt=Math.PI/3;
    assert(Math.abs(upFollower.alignRotation(orientSpline,.2).up.z-Math.sqrt(3)/2)<1e-8);
    upFollower.upReference=upFollower.target;
    assert(Math.abs(upFollower.alignRotation(orientSpline,.2).up.z-Math.SQRT1_2)<1e-8);
    upFollower.upMode=SplineUpMode.World;
    assert(Math.abs(upFollower.alignRotation(orientSpline,.2).up.y-1)<1e-8);
    const radius=5,straight=10,arc=radius*Math.PI/2,total=straight+arc;
    const worldAt=(p)=>{
      const distance=p*total;
      if(distance<=straight)return new Vec3(distance,0,0);
      const angle=(distance-straight)/radius;
      return new Vec3(straight+radius*Math.sin(angle),0,radius*(1-Math.cos(angle)));
    };
    const rotAt=(p)=>{const r=new Quat();r.heading=Math.max(0,(p*total-straight)/radius);return r;};
    const spline={node:new Node('curved-spline'),count:3,segmentCount:2,length:total,dimension:0,
      evaluateWorldPosition:worldAt,evaluateRotation:rotAt,getRevision:()=> 'unchanged',tAtProgress:p=>p};
    function simulate(compensate,method){
      const anim=new SplineAnimate();anim.node=new Node('follower');anim.target=new Node('target');
      anim.spline=spline;anim.alignToSpline=false;anim.splineOffset=new Vec3(2,0,0);
      anim.constantSpeedWithOffset=compensate;anim.method=method;anim.speed=3;
      anim.duration=6;anim.easing=Easing.Linear;anim.loopMode=LoopMode.Once;
      anim.onEnable();const points=[anim.target.worldPosition.clone()];
      for(let i=0;i<120;i++){
        anim.update(.05);points.push(anim.target.worldPosition.clone());
        if(anim.currentProgress>=1-1e-8)break;
      }
      const steps=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.z-points[i].z));
      // Last frame may be a partial timestep: ignore it.
      if(steps.length>2)steps.pop();
      return {anim,steps};
    }
    for(const method of [AnimateMethod.Speed,AnimateMethod.Time]){
      const fixed=simulate(true,method),bad=simulate(false,method);
      const variation=arr=>Math.max(...arr)/Math.min(...arr);
      assert(variation(fixed.steps)<1.04,`Fixed steps should be uniform; variation=${variation(fixed.steps)}`);
      assert(variation(bad.steps)>1.15,`Legacy centerline speed should vary; variation=${variation(bad.steps)}`);
    }
    const f=new SplineAnimate();f.node=new Node('f');f.target=new Node('t');f.spline=spline;
    f.alignToSpline=false;f.splineOffset=new Vec3(2,0,0);f.onEnable();
    f.seekDistance(total*.6);assert(Math.abs(f.currentProgress-.6)<.0001);
    f.setCurrentSpline(spline,.8);assert(Math.abs(f.currentProgress-.8)<.0001);

    // Two connected centerlines with different local right directions.
    // Previously a +X splineOffset teleported at their shared junction.
    const makeBranch=(name,positionAt,heading)=>({node:new Node(name),count:2,segmentCount:1,length:10,dimension:0,
      evaluateWorldPosition:positionAt,evaluateRotation:()=>{const q=new Quat();q.heading=heading;return q;},
      getRevision:()=>name,tAtProgress:p=>p});
    const branchA=makeBranch('inbound',p=>new Vec3(p*10,0,0),0);
    const branchB=makeBranch('outbound',p=>new Vec3(10,0,p*10),Math.PI/2);
    const branchC=makeBranch('reverse-out',p=>new Vec3(0,0,(p-1)*10),Math.PI/2);
    const distance=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z);
    const frameOffset=(sp,p)=>{const q=sp.evaluateRotation(p);return Vec3.add(new Vec3(),sp.evaluateWorldPosition(p),Vec3.transformQuat(new Vec3(),new Vec3(1,0,0),q));};
    function useJunction(startSpline,startProgress,direction,exitSpline,exitProgress,exitDirection,blendDistance){
      const follower=new SplineAnimate();follower.node=new Node('follower');follower.target=new Node('offset-model');
      follower.spline=startSpline;follower.alignToSpline=false;follower.splineOffset=new Vec3(1,0,0);
      follower.constantSpeedWithOffset=true;follower.junctionOffsetBlendDistance=blendDistance;
      follower.loopMode=LoopMode.Once;follower.junctionMode=JunctionMode.FirstOther;
      follower.method=AnimateMethod.Speed;follower.speed=2;
      const initialLink={spline:startSpline,getProgress:()=>startProgress};
      const finalLink={spline:exitSpline,getProgress:()=>exitProgress,exitDirection};
      const junction={enabled:true,entries:()=>[{index:0,link:initialLink}],
        reaches:()=>{},pick:()=>({index:1,link:finalLink}),switched:()=>{}};
      SplineJunction.active.add(junction);
      follower.onEnable();follower.setCurrentSpline(startSpline,startProgress+(direction===1?-.1:.1),direction);
      const before=frameOffset(startSpline,startProgress);
      follower.update(.5); // travel exactly 1 world unit to the marker
      assert.equal(follower.currentSpline,exitSpline,'Must route to new spline');
      const after=follower.target.worldPosition.clone();
      SplineJunction.active.delete(junction);
      return {follower,before,after};
    }
    const forward=useJunction(branchA,1,1,branchB,0,JunctionExitDirection.Forward,2);
    assert(distance(forward.before,forward.after)<1e-5,'Offset transition must preserve world point at Junction');
    assert(distance(forward.after,frameOffset(branchB,0))>.5,'Destination local offset differs in world space');
    let last=forward.after.clone();
    for(let i=0;i<70;i++){
      forward.follower.update(.05);
      const next=forward.follower.target.worldPosition.clone();
      assert(distance(last,next)<.3,'No frame may teleport during offset blend');
      last=next;
    }
    assert(distance(last,frameOffset(branchB,forward.follower.currentProgress))<.002,
      'After blend distance, world position should match destination local offset');
    const backward=useJunction(branchA,0,-1,branchC,1,JunctionExitDirection.Backward,2);
    assert(distance(backward.before,backward.after)<1e-5,'Backward switch must preserve world position');
    const instant=useJunction(branchA,1,1,branchB,0,JunctionExitDirection.Forward,0);
    assert(distance(instant.before,instant.after)>.5,'Blend Distance=0 retains immediate local-frame offset');
    assert(distance(instant.after,frameOffset(branchB,0))<1e-5);
    // Explicit manual spline change intentionally bypasses junction smoothing.
    forward.follower.setCurrentSpline(branchA,.5);
    assert(distance(forward.follower.target.worldPosition,frameOffset(branchA,.5))<1e-5);

    const {SplineMorph}=require(path.join(tmp,'Components/SplineMorph.js'));
    const {SplineKnot}=require(path.join(tmp,'Core/SplineKnot.js'));
    const shape=shift=>({count:2,reversed:false,node:new Node('source'+shift),getRevision:()=>String(shift),
      getNaturalResolvedKnots:()=>[
        {position:{x:shift,y:0,z:0},tangentIn:{x:-1,y:0,z:0},tangentOut:{x:1,y:0,z:0}},
        {position:{x:shift+10,y:0,z:0},tangentIn:{x:-1,y:0,z:0},tangentOut:{x:1,y:0,z:0}}]});
    const knots=[new SplineKnot(),new SplineKnot()];
    for(let i=0;i<2;i++)knots[i].node=new Node('k'+i);
    const output={count:2,reversed:false,knots,node:new Node('out'),refresh(){}};
    const morph=new SplineMorph();morph.sourceA=shape(0);morph.sourceB=shape(10);morph.outputSpline=output;
    morph.previewInEditor=true;env.EDITOR_NOT_IN_PREVIEW=true;
    morph.blend=.2;morph.onEnable();assert.equal(knots[0].node.position.x,2);
    morph.restore();assert.equal(knots[0].node.position.x,0);
    morph.update();assert.equal(knots[0].node.position.x,0,'Restore should not immediately override itself');
    morph.blend=.7;morph.update();assert(Math.abs(knots[0].node.position.x-7)<1e-8,'Blend must reapply after Restore');
    morph.blend=.3;morph.update();assert(Math.abs(knots[0].node.position.x-3)<1e-8);
    morph.previewInEditor=false;morph.update();assert.equal(knots[0].node.position.x,0,'Preview off restores original');
    console.log('OFFSET + MORPH REGRESSION PASS: world-distance uniformity (Speed/Time), legacy comparison, LUT inverse, seek, Junction offset continuity forward/backward & zero-blend, Restore -> Blend -> Preview off.');
  }finally{Module._load=original;}
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
