'use strict';
const assert=require('node:assert/strict');
let writes=0,reads=0,selection=['controller'];
const diagnostic={ok:true,validExits:3,sampledTrajectories:3,comparisons:400,
 candidates:[{firstExit:0,secondExit:1,distance:0.125,declared:false,
    samePhase:[0],uncertainDirection:false}],
 missingPairs:[{firstExit:0,secondExit:1,distance:0.125}],
 unsafePhases:[0],skipped:[{exitIndex:2,reason:'No outgoing world arc'}],
 ambiguousExits:[],warning:'warning only'};
global.Editor={
 Selection:{getSelected:()=>selection},
 Message:{request:async(channel,method,args)=>{
   assert.equal(channel,'scene');
   if(method!=='execute-scene-script'){writes++;throw Error('Unexpected write: '+method);}
   assert.equal(args.name,'cocos-splines');
   assert.equal(args.method,'queryTrafficConflicts');
   assert.deepEqual(args.args,['controller']);
   reads++;
   return diagnostic;
 }},
};
const {methods}=require('../dist/main.js');
(async()=>{
 const result=await methods.checkTrafficConflicts();
 assert(result.ok&&result.message.includes('0↔1'));
 assert(result.message.includes('1 missing'));
 assert(result.message.includes('No changes')===false);
 assert.equal(reads,1);assert.equal(writes,0);
 selection=[];
 const unavailable=await methods.checkTrafficConflicts();
 assert.equal(unavailable.ok,false);
 assert.equal(writes,0);
 console.log('TRAFFIC CONFLICT EDITOR PASS: selected read-only Scene request, condensed missing conflicts and no Scene writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
