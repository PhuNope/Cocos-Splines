'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),
 os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-network-cache-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
   '--noEmit','false','--outDir',tmp]);
 const {SplineNetworkMemo}=require(path.join(tmp,'Core/SplineNetworkCache.js'));
 const memo=new SplineNetworkMemo(2,2);
 let builds=0,calculations=0;
 const value=k=>memo.snapshot(k,()=>{builds++;return {k}});
 const route=k=>memo.route('a',k,()=>{
   calculations++;return {steps:[{kind:'travel',splineId:'A',
     fromProgress:0,toProgress:1,direction:1,distance:10}],
     cost:10,distance:10,switchCount:0};
 });
 value('a');value('a');assert.equal(builds,1);
 let first=route('0'),second=route('0');
 assert.equal(calculations,1);
 first.steps[0].splineId='mutated';
 assert.equal(second.steps[0].splineId,'A','defensive route clone');
 memo.route('a','null',()=>null);
 assert.equal(memo.route('a','null',()=>{throw Error('No negative cache');}),null);
 route('third');route('0');assert.equal(calculations,3,'LRU evicted oldest route');
 value('b');value('a');value('c');
 assert.equal(memo.stats.snapshots,2);
 assert.equal(memo.stats.graphBuilds,3);
 assert(memo.stats.routeHits>=2);
 memo.clear();assert.equal(memo.stats.snapshots,0);
 assert.throws(()=>new SplineNetworkMemo(0,1),/capacity/);
 class Node{
    constructor(uuid){this.uuid=uuid;this.isValid=true;this.parent=null;this.events=[];}
    emit(name,payload){this.events.push({name,payload});}
    getComponent(){return null;}
 }
 class Component{constructor(){this.enabled=true;this.node=new Node('comp');}getComponent(){return null;}}
 class Color{constructor(r=0,g=0,b=0,a=0){Object.assign(this,{r,g,b,a});}}
 const decorator=(...args)=>args.length>1?undefined:()=>{};
 const cc={_decorator:{ccclass:()=>x=>x,property:decorator,menu:()=>x=>x,
   executeInEditMode:()=>x=>x},Component,Node,Color,
   Vec3:class{},Quat:class{},Enum:x=>x,EventHandler:class{}};
 const original=Module._load;
 Module._load=function(name,parent,isMain){
   if(name==='cc')return cc;
   if(name==='cc/env')return {EDITOR_NOT_IN_PREVIEW:false};
   return original.call(this,name,parent,isMain);
 };
 try{
   const {SplineJunction}=require(path.join(tmp,'Components/SplineJunction.js'));
   const {planSplineRoute,nextShortestJunctionExit,invalidateSplineNetworkCache,
     getSplineNetworkCacheStats}=require(path.join(tmp,'Core/SplineNetwork.js'));
   invalidateSplineNetworkCache();
   let evaluations=0;
   const makeSpline=(id,length,offset)=>{
     const node=new Node(id);
     node.worldMatrix={m00:1,m01:0,m02:0,m04:0,m05:1,m06:0,
       m08:0,m09:0,m10:1,m12:offset,m13:0,m14:0};
     return {node,enabled:true,count:2,length,closed:false,reversed:false,
       dimension:0,rev:'r1',getRevision(){return this.rev;},
       evaluateWorldPosition(p){evaluations++;
         return {x:p*this.length*node.worldMatrix.m00+node.worldMatrix.m12,y:0,z:0};}};
   };
   const A=makeSpline('A',10,0),B=makeSpline('B',20,5);
   const connection=(spline,progress,exitDirection=0)=>({spline,
     positionMode:0,progress,distance:0,exitDirection,getProgress(){return this.progress;}});
   const J={node:new Node('J'),enabled:true,connections:[
     connection(A,.5),connection(B,0)],
     entries(){return this.connections.map((link,index)=>({link,index}));}};
   SplineJunction.active.add(J);
   const query=(start=.1,goal=.8,options={})=>planSplineRoute(A,start,B,goal,
     {startDirection:1,transferPenalty:.01,...options});
   const before=getSplineNetworkCacheStats();
   let one=query();
   assert(one&&one.switchCount===1);
   assert.equal(evaluations,2);
   assert.equal(getSplineNetworkCacheStats().graphBuilds,before.graphBuilds+1);
   let two=query();
   assert(two&&two.switchCount===1);
   assert.equal(evaluations,2,'Route cache avoids repeated world position samples');
   assert.equal(getSplineNetworkCacheStats().routeHits,before.routeHits+1);
   one.steps[0].splineId='bad';
   one.splines.clear();one.junctions.clear();
   assert(two.steps.every(s=>s.splineId!=='bad'));
   assert(two.splines.has('A')&&two.junctions.has('J'));
   query(.2,.8);
   assert.equal(evaluations,2,'Changing start progress only reruns Dijkstra');
   const builds=getSplineNetworkCacheStats().graphBuilds;
   A.rev='geometry-2';query();
   assert.equal(getSplineNetworkCacheStats().graphBuilds,builds+1,
     'Spline geometry revision invalidates network snapshot');
   const afterRevision=evaluations;
   B.node.worldMatrix.m12+=30;
   query();
   assert(evaluations>afterRevision,'World transform change invalidates endpoints');
   assert.equal(query(.1,.8,{maxWorldGap:.1}),null,
     'No teleport when current links are farther than world gap threshold');
   B.node.worldMatrix.m12=5;
   let actual=query(.1,.8,{maxWorldGap:.1});
   assert(actual,'Moved link points should rebuild graph and restore reachability');
   J.connections[1].progress=.2;
   assert(query(.1,.8,{maxWorldGap:.1})===null,
     'Moving Junction link invalidates graph even with same spline geometry');
   J.connections[1].progress=0;
   B.length=40;B.rev='longer';
   const lengthChange=query();
   assert(lengthChange&&lengthChange.distance>two.distance,
     'Changed arc length updates network path cost');
   // Temporary traffic closures must NOT poison the cached base route.
   const blocked=query(.1,.8,{excludedExits:[{junctionId:'J',exitIndex:1}]});
   assert.equal(blocked,null);
   const unblocked=query(.1,.8);
   assert(unblocked,'Standard route remains reachable after a blocked query');
   const hitsBefore=getSplineNetworkCacheStats().routeHits;
   assert.equal(query(.1,.8,{excludedExits:[{junctionId:'J',exitIndex:1}]}),null);
   assert(getSplineNetworkCacheStats().routeHits>hitsBefore,
     'Excluded-exit query is memoized independently of normal route');
   const cached=getSplineNetworkCacheStats().routeHits;
   assert.equal(nextShortestJunctionExit(J,0,A,.5,1,B,.8,
      {transferPenalty:.01}),1);
   assert.equal(nextShortestJunctionExit(J,0,A,.5,1,B,.8,
      {transferPenalty:.01}),1);
   assert(getSplineNetworkCacheStats().routeHits>cached,
      'Multiple followers reuse the same crossing-path computation');
   J.connections[1].exitDirection=2;
   assert.equal(nextShortestJunctionExit(J,0,A,.5,1,B,.8,
      {transferPenalty:.01}),null,'Exit direction change invalidates route');
   J.connections[1].exitDirection=0;
   J.enabled=false;
   assert.equal(query(),null,'Disabled Junction removed from active graph');
   J.enabled=true;
   const prior=getSplineNetworkCacheStats().graphBuilds;
   SplineJunction.active.delete(J);
   assert.equal(query(),null,'OnDisable registration removes available routes');
   SplineJunction.active.add(J);
   // World cost is an independent snapshot. A nonuniform world transform
   // changes route distance even when local arc length stays the same.
   B.node.worldMatrix.m00=3;
   const localCost=query(.1,.8,{costSpace:'local'});
   const worldBefore=getSplineNetworkCacheStats();
   const worldCost=query(.1,.8,{costSpace:'world'});
   assert(worldCost&&localCost&&worldCost.distance>localCost.distance,
     'Nonuniform world scale affects world-distance cost');
   const sampled=evaluations;
   const worldAgain=query(.1,.8,{costSpace:'world'});
   assert.equal(worldAgain.distance,worldCost.distance);
   assert.equal(evaluations,sampled,
     'Cached world arc sampling not repeated on identical route query');
   assert(getSplineNetworkCacheStats().routeHits>worldBefore.routeHits);
   B.node.worldMatrix.m00=4;
   const changedWorld=query(.1,.8,{costSpace:'world'});
   assert(changedWorld.distance>worldCost.distance,
     'Changing world scale invalidates sampled World arc and Dijkstra');
   assert(evaluations>sampled);
   B.node.worldMatrix.m00=3;
   invalidateSplineNetworkCache();
   assert.equal(getSplineNetworkCacheStats().snapshots,0);
   assert(query(),'Manual invalidation rebuilds valid network');
   assert(getSplineNetworkCacheStats().graphBuilds>prior);
   SplineJunction.active.clear();
   console.log('NETWORK CACHE PASS: snapshot/route LRU, shared followers, negative results, revisions, transform, links and active Junction invalidation.');
 }finally{Module._load=original;}
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
