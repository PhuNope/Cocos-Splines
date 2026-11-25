'use strict';
const assert=require('node:assert/strict');
const {formatGeometryGraphProfile}=require('../src/SplineGeometryGraphProfileReport');
const timings=[
 {id:'source',type:'spline',cached:false,durationMs:.25},
 {id:'road',type:'ribbon',cached:false,durationMs:1.125},
 {id:'outputRoad',type:'output',cached:false,durationMs:.125},
];
const success={graphVersion:2,outputId:'outputRoad',sampledFrames:16,
 cold:{totalMs:1.5,computed:3,reused:0,nodes:timings},
 warm:{totalMs:0,computed:0,reused:3,nodes:timings.map(t=>({...t,cached:true,durationMs:0}))}};
const report=formatGeometryGraphProfile(success);
assert(report.includes('Graph v2 · Output: outputRoad · sampled frames: 16'));
assert(report.includes('Cold CPU: 1.500 ms'));
assert(report.includes('Warm CPU: 0.000 ms'));
assert(report.includes('road (ribbon) | 1.125 ms | cached'));
assert(report.includes('excludes frame sampling'));
assert(!report.includes('<'));
const original=JSON.stringify(success);
formatGeometryGraphProfile(success);
assert.equal(JSON.stringify(success),original,'Formatting does not modify supplied data');
const invalid=[
 {...success,outputId:'<script>alert(1)</script>'},
 {...success,sampledFrames:999999},
 {...success,cold:{...success.cold,nodes:timings.concat(timings)}},
 {...success,cold:{...success.cold,totalMs:Infinity}},
 {...success,cold:{...success.cold,nodes:timings.map((n,i)=>i===1?{...n,durationMs:NaN}:n)}},
 {...success,warm:{...success.warm,nodes:success.warm.nodes.map((n,i)=>
  i===0?{...n,id:'wrong'}:n)}},
 {...success,warm:{...success.warm,computed:1,reused:3}},
];
for(const bad of invalid)assert.throws(()=>formatGeometryGraphProfile(bad),
 /Invalid|align/);
const large=JSON.parse(JSON.stringify(success));
large.cold.nodes=Array.from({length:33},(_,i)=>({
 id:'n'+i,type:'width',cached:false,durationMs:.125}));
large.cold.computed=33;large.warm.nodes=large.cold.nodes.map(n=>({
 ...n,cached:true,durationMs:0}));
large.warm.reused=33;
assert.throws(()=>formatGeometryGraphProfile(large),/Invalid/);
assert(require('../package.json').scripts.test.includes('geometry-graph-profile-report-v2.test.cjs'));
console.log('GRAPH PROFILE REPORT V2 PASS: bounded, aligned, text-only safe CPU timing output.');
