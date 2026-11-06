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
    static transformQuat(o,a,q){const t=q?.heading||0;return o.set(a.x*Math.sin(t)+a.z*Math.cos(t),a.y,-a.x*Math.cos(t)+a.z*Math.sin(t));}
    static transformMat4(o,a,m){return o.set(a.x+(m?.m12||0),a.y+(m?.m13||0),a.z+(m?.m14||0));}
  }
  class Quat {
    constructor(){this.heading=0;}
    clone(){const q=new Quat();q.heading=this.heading;return q;}
    static multiply(o,a,b){o.heading=(a?.heading||0)+(b?.heading||0);return o;}
    static fromEuler(o){return o;}
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
    const {SplineAnimate,AnimateMethod,LoopMode,Easing}=require(path.join(tmp,'Components/SplineAnimate.js'));
    const {buildOffsetArcLUT,offsetDistanceFractionToProgress,offsetProgressToDistanceFraction}=require(path.join(tmp,'Core/SplineTraversal.js'));
    const a=buildOffsetArcLUT(p=>({x:5*Math.cos(p*Math.PI/2),y:0,z:5*Math.sin(p*Math.PI/2)}),512);
    assert(Math.abs(a.length-5*Math.PI/2)<.00002);
    for(const p of [.05,.2,.48,.76,.97]){
      assert(Math.abs(offsetDistanceFractionToProgress(a,offsetProgressToDistanceFraction(a,p))-p)<1e-8);
    }
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
    console.log('OFFSET + MORPH REGRESSION PASS: world-distance uniformity (Speed/Time), legacy comparison, LUT inverse, seek, Restore -> Blend -> Preview off.');
  }finally{Module._load=original;}
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
