'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),
      cp=require('node:child_process'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'splines-population-v2-'));
const approx=(a,b)=>assert(Math.abs(a-b)<1e-9,a+' != '+b);
try{
  cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
    '--noEmit','false','--outDir',tmp],{stdio:'pipe'});
  const {planPopulation,populationGate,validatePopulationPolicy}=
    require(path.join(tmp,'Core','SplinePopulationMath.js'));
  const policy=(override={})=>({
    density:1,densityKeys:[],exclusions:[],minWorldSpacing:0,seed:1234,closed:false,...override
  });
  const candidates=(positions)=>positions.map((x,index)=>({
    index,progress:positions.length===1?0:index/(positions.length-1),
    position:{x,y:0,z:0}
  }));
  const all=candidates([0,1,2,3,4]);
  assert.deepEqual(planPopulation(all,policy()),[0,1,2,3,4],
    'Density 1 without rules retains all original indexes');
  assert.deepEqual(planPopulation(all,policy({density:0})),[]);
  const gradient=planPopulation(all,policy({densityKeys:[
    {progress:0,density:0},{progress:1,density:1}
  ]}));
  assert(!gradient.includes(0)&&gradient.includes(4),
    'Linear density mask has zero start and fully retained end');
  for(const item of all)
    assert.equal(gradient.includes(item.index),
      populationGate(1234,item.index)<item.progress || item.progress===1);
  const masked=planPopulation(all,policy({density:.5}));
  assert.deepEqual(masked,planPopulation(all,policy({density:.5})),
    'Fixed seed yields a fixed population');
  for(const item of all){
    const included=masked.includes(item.index);
    assert.equal(included,populationGate(1234,item.index)<.5);
  }
  assert.deepEqual(planPopulation(all,policy({exclusions:[
    {startProgress:.25,endProgress:.75}
  ]})),[0,3,4], 'Half-open forbidden span removes only interval interior');
  const closed={...policy({closed:true}),exclusions:[{startProgress:.75,endProgress:.25}]};
  assert.deepEqual(planPopulation(all,closed),[1,2],
    'Wrapped exclusion removes ends on closed path');
  assert.throws(()=>validatePopulationPolicy(policy({exclusions:[
    {startProgress:.75,endProgress:.25}]})),'Open splines cannot wrap exclusion');
  const center=(t)=>[{index:0,progress:t,position:{x:10,y:0,z:0}}];
  const seamKeys=[{progress:.2,density:.1},{progress:.8,density:.9}];
  assert.deepEqual(planPopulation(center(0),policy({closed:true,densityKeys:seamKeys})),
    planPopulation(center(1),policy({closed:true,densityKeys:seamKeys})),
    'Density masks must match at 0/1 on closed splines');
  assert.deepEqual(planPopulation([
    {index:0,progress:0,position:{x:0,y:0,z:0}},
    {index:1,progress:.25,position:{x:.4,y:0,z:0}},
    {index:2,progress:.5,position:{x:1.2,y:0,z:0}},
    {index:3,progress:.75,position:{x:2.3,y:0,z:0}},
    {index:4,progress:1,position:{x:0,y:0,z:0}},
  ],policy({closed:true,minWorldSpacing:1})),[0,2,3],
  'Final WORLD centers and seam-neighbor collisions are filtered');
  for(const opts of [
    {density:NaN},{density:-.1},{density:2},{seed:1.5},
    {minWorldSpacing:-1},{minWorldSpacing:Infinity},
    {densityKeys:[{progress:.2,density:1},{progress:.2,density:0}]},
    {closed:true,densityKeys:[{progress:0,density:1},{progress:1,density:1}]},
    {exclusions:[{startProgress:NaN,endProgress:.5}]},
    {densityKeys:Array(65).fill({progress:.2,density:.5})},
    {exclusions:Array(65).fill({startProgress:.2,endProgress:.3})},
  ])assert.throws(()=>planPopulation(all,policy(opts)));
  assert.throws(()=>planPopulation([{index:0,progress:.5,position:{x:NaN,y:0,z:0}}],policy()));
  assert.throws(()=>planPopulation([{index:0,progress:0,position:{x:0,y:0,z:0}},
    {index:0,progress:1,position:{x:1,y:0,z:0}}],policy()));
  assert.throws(()=>planPopulation(Array.from({length:2049},(_,index)=>({
    index,progress:index/2048,position:{x:index,y:0,z:0}
  })),policy()));
  class Vec3{
    constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
    clone(){return new Vec3(this.x,this.y,this.z);}
    set(x,y,z){if(x&&typeof x==='object')return this.set(x.x,x.y,x.z);
      Object.assign(this,{x,y,z});return this;}
    static add(out,a,b){return out.set(a.x+b.x,a.y+b.y,a.z+b.z);}
    static transformQuat(out,p){return out.set(p);}
  }
  class Quat{static multiply(out){return out;}static fromEuler(out){return out;}}
  class Node{
    constructor(name='node'){this.name=name;this.uuid=name;this.children=[];this.parent=null;
      this.isValid=true;this.scale=new Vec3(1,1,1);this.worldPosition=new Vec3();
      this.worldRotation=new Quat();}
    setParent(p){this.removeFromParent();this.parent=p;if(p)p.children.push(this);}
    removeFromParent(){if(!this.parent)return;const i=this.parent.children.indexOf(this);
      if(i>=0)this.parent.children.splice(i,1);this.parent=null;}
    setWorldPosition(pos){this.worldPosition=pos.clone();}
    setWorldRotation(rot){this.worldRotation=rot;}
    setScale(scale){this.scale=scale.clone();}
    destroy(){this.isValid=false;}
    getComponent(){return null;}
  }
  class Component{constructor(){this.node=new Node();this.enabled=true;}}
  const created=[],cc={_decorator:{ccclass:()=>cl=>cl,property:()=>{},
    menu:()=>cl=>cl},Component,Vec3,Quat,Node,Prefab:class{},Enum:x=>x,
    instantiate:(prefab)=>{const obj=new Node('clone-'+prefab.id);created.push(obj);return obj;}};
  const original=Module._load;
  Module._load=function(name,parent,isMain){
    if(name==='cc')return cc;
    if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};
    if(name==='../Core/SplineContainer')return {SplineContainer:class SplineContainer{}};
    if(name==='./SplineModifiers')return {SplineModifiers:class SplineModifiers{}};
    if(name==='./SplineNoise')return {SplineNoise:class SplineNoise{}};
    if(name==='./SplineInstantiate')return {InstantiateMethod:{Count:0,Distance:1}};
    return original.call(this,name,parent,isMain);
  };
  try{
    const {SplineObjectController,SplinePopulationDensityKey,SplinePopulationExclusion}=
      require(path.join(tmp,'Components','SplineObjectController.js'));
    assert.equal(new SplinePopulationDensityKey().density,1);
    assert.equal(new SplinePopulationExclusion().startProgress,0);
    const controller=new SplineObjectController();
    const spline={count:3,closed:false,length:10,node:new Node('spline'),
      getRevision:()=>1,evaluateWorldPosition:t=>new Vec3(10*t,0,0),
      evaluateRotation:()=>new Quat()};
    controller.spline=spline;controller.prefabs=[{id:'A'},{id:'B'}];
    controller.count=6;controller.alignToSpline=false;
    assert.equal(controller.enablePopulationRules,false);
    assert.equal(controller.respawn(),6);
    const legacy=created.slice(-6).map(node=>({
      name:node.name,worldPosition:node.worldPosition,template:node.name
    }));
    assert.deepEqual(legacy.map(x=>x.name),[
      'Spline Object 000','Spline Object 001','Spline Object 002',
      'Spline Object 003','Spline Object 004','Spline Object 005'
    ]);
    controller.enablePopulationRules=true;controller.density=1;
    assert.equal(controller.respawn(),6,'Enabled neutral rules have no effect');
    assert.deepEqual(created.slice(-6).map(node=>node.worldPosition),
      legacy.map(x=>x.worldPosition));
    controller.minWorldSpacing=2.1;controller.respawn();
    assert.deepEqual(created.slice(-3).map(node=>node.name),
      ['Spline Object 000','Spline Object 002','Spline Object 004'],
      'World spacing preserves original candidate index and RNG channel');
    controller.minWorldSpacing=0;controller.exclusions=[{startProgress:.2,endProgress:.8}];
    assert.equal(controller.respawn(),3,'Exclude progress 0.2–0.8');
    assert.deepEqual(created.slice(-3).map(n=>n.name),
      ['Spline Object 000','Spline Object 004','Spline Object 005']);
    const before=controller.spawnedRoot.children.slice();
    controller.density=-1;assert.throws(()=>controller.respawn());
    assert.deepEqual(controller.spawnedRoot.children,before,
      'Malformed policy cannot delete previous population');
    assert(before.every(n=>n.isValid));
    controller.density=1;controller.exclusions=[];
    spline.evaluateWorldPosition=()=>new Vec3(NaN,0,0);
    assert.throws(()=>controller.respawn(),'Invalid final World centers rejected');
    assert(before.every(n=>n.isValid));
    spline.evaluateWorldPosition=t=>new Vec3(10*t,0,0);
    controller.enablePopulationRules=false;controller.respawn();
    assert.deepEqual(created.slice(-6).map(n=>n.name),legacy.map(x=>x.name),
      'Turning rules off restores legacy population output');
  }finally{Module._load=original;}
  const pkg=require(root+'/package.json');
  assert(pkg.scripts.test.includes('tests/spline-population-v2.test.cjs'));
  const ui=require(root+'/dist/contributions/inspector/ObjectController.js');
  for(const key of ['enablePopulationRules','density','densityKeys','exclusions','minWorldSpacing'])
    assert(ui.template.includes('spl-field-'+key),'Missing Advanced Population Inspector '+key);
  console.log('SPLINE POPULATION V2 PASS: density keys, seeded thinning, wrapped exclusion, World center gap, safe preflight, legacy opt-out.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
