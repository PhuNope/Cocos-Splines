'use strict';
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let children=[];
const generated={isValid:true,get children(){return children;}};
const spawner={
    spawnedRoot:generated,
    spawn(){if(children.length)return 0;children=[{name:'clone-a'},{name:'clone-b'}];return children.length;},
    respawn(){children=[{name:'replacement-a'}];return children.length;},
    clear(){children=[];}
};
const selected={uuid:'spawner',components:[spawner],children:[]};
const scene={uuid:'scene',children:[selected],components:[]};
const cc={director:{getScene:()=>scene},js:{getClassName:x=>x===spawner?'Splines.SplineInstantiate':'unknown'}};
const orig=Module._load;
Module._load=function(id,...rest){if(id==='cc')return cc;return orig.call(this,id,...rest);};
try{
    const {methods}=require(root+'/src/scene.js');
    assert.equal(methods.spawnPrefabs('spawner','instantiate','spawn').changed,true);
    assert.equal(methods.spawnPrefabs('spawner','instantiate','spawn').changed,false);
    assert.equal(methods.spawnPrefabs('spawner','instantiate','respawn').count,1);
    assert.equal(methods.spawnPrefabs('spawner','instantiate','clear').count,0);
    assert.equal(methods.spawnPrefabs('spawner','instantiate','other').ok,false);
    assert.equal(methods.spawnPrefabs('spawner','objectController','spawn').ok,false);
    assert.equal(methods.spawnPrefabs('bad','instantiate','spawn').ok,false);
    console.log('SCENE SPAWN PASS: explicit Spawn/Respawn/Clear, no duplicates, class/action validation, snapshot change flag.');
}finally{Module._load=orig;}
