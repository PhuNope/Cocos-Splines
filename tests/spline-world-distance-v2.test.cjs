'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spline-world-arc-'));
try{
 cp.execFileSync('tsc',['-p',path.join(root,'tsconfig.runtime.json'),
   '--noEmit','false','--outDir',tmp]);
 const {buildWorldArcLength,worldArcDistanceAt}=require(path.join(tmp,'Core/SplineWorldArcLength.js'));
 const {findNetworkRoute}=require(path.join(tmp,'Core/SplineNetworkGraph.js'));
 const near=(a,b,tolerance=1e-3)=>assert(Math.abs(a-b)<=tolerance,
     String(a)+' != '+String(b)+' tol '+String(tolerance));
 const straight=buildWorldArcLength(p=>({x:p*20,y:p*3,z:0}),1,32);
 assert(straight.length>=65);
 near(straight.at(-1).distance,Math.hypot(20,3));
 near(worldArcDistanceAt(straight,.25),Math.hypot(20,3)*.25);
 const curved=buildWorldArcLength(p=>({x:p*10,y:5*Math.sin(Math.PI*p),z:0}),2,64);
 assert(curved.at(-1).distance>10,'World arc longer than endpoint chord');
 assert(curved.at(-1).distance<25);
 const ring=buildWorldArcLength(p=>({x:2*Math.cos(2*Math.PI*p),
   y:2*Math.sin(2*Math.PI*p),z:0}),4,64);
 near(ring.at(-1).distance,4*Math.PI,.002);
 const line=id=>({id,length:10,closed:false,worldArc:[
   {progress:0,distance:0},{progress:1,distance:10}]});
 const networks=[
   line('A'),{...line('B'),length:4,worldArc:[
     {progress:0,distance:0},{progress:1,distance:40}]},
   {...line('C'),length:8,worldArc:[
     {progress:0,distance:0},{progress:1,distance:8}]},line('D')];
 const link=(splineId,progress,linkIndex)=>({splineId,progress,linkIndex});
 const junctions=[
   {id:'Start',links:[link('A',.5,0),link('B',0,1),link('C',0,2)]},
   {id:'Finish',links:[link('B',1,0),link('C',1,1),link('D',0,2)]}];
 const from={splineId:'A',progress:0},to={splineId:'D',progress:1};
 const local=findNetworkRoute(networks,junctions,from,to,{startDirection:1});
 const world=findNetworkRoute(networks,junctions,from,to,
    {startDirection:1,costSpace:'world'});
 assert(local&&world);
 assert.equal(local.steps.find(s=>s.kind==='switch').exitIndex,1,
    'Local cost selects short B path');
 assert.equal(world.steps.find(s=>s.kind==='switch').exitIndex,2,
    'World cost selects unscaled C path');
 near(local.distance,19);near(world.distance,23);
 const nonUniform=[{id:'varied',length:10,worldArc:[
   {progress:0,distance:0},{progress:.5,distance:2},{progress:1,distance:12}]}];
 const variable=findNetworkRoute(nonUniform,[],
   {splineId:'varied',progress:.25},{splineId:'varied',progress:.75},
   {startDirection:1,costSpace:'world'});
 near(variable.distance,6);
 const closedWorld=[{id:'closed',length:100,closed:true,worldArc:ring}];
 const wrapped=findNetworkRoute(closedWorld,[],
   {splineId:'closed',progress:.95},{splineId:'closed',progress:.05},
   {startDirection:1,costSpace:'world'});
 near(wrapped.distance,.1*4*Math.PI,.003);
 const missing=[{id:'missing',length:10}];
 assert.throws(()=>findNetworkRoute(missing,[],
   {splineId:'missing',progress:0},{splineId:'missing',progress:1},
   {costSpace:'world'}),/world arc/);
 assert.throws(()=>findNetworkRoute(networks,junctions,from,to,
   {costSpace:'invalid'}),/options/);
 assert.throws(()=>findNetworkRoute([{id:'bad',length:10,worldArc:[
   {progress:0,distance:0},{progress:1,distance:-1}]}],[],
   {splineId:'bad',progress:0},{splineId:'bad',progress:1},
   {costSpace:'world'}),/world arc/);
 assert.throws(()=>buildWorldArcLength(()=>({x:NaN,y:0,z:0}),1),/world position/);
 assert.throws(()=>buildWorldArcLength(()=>({x:1,y:0,z:0}),1),/zero length/);
 console.log('WORLD ARC / NETWORK COST PASS: nonuniform scale, curved arc, closed seam, local/world alternate route, validation.');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
