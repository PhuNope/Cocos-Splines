'use strict';
/** Minimal, bounded, text-only formatting for Inspector CPU diagnostics.
 * Renderer data is untrusted IPC input: do not inject HTML or accept arbitrary
 * property bags. Node timing excludes Spline sampling/GPU mesh allocation.
 */
const idPattern=/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const types=new Set(['spline','offset','width','ribbon','tube',
  'extrude','meshDeform','output']);
function validTiming(t){
  return t&&typeof t==='object'&&idPattern.test(t.id)&&types.has(t.type)&&
    typeof t.cached==='boolean'&&typeof t.durationMs==='number'&&
    Number.isFinite(t.durationMs)&&t.durationMs>=0&&t.durationMs<=60000;
}
function validRun(run){
  return run&&typeof run==='object'&&Number.isInteger(run.computed)&&
    Number.isInteger(run.reused)&&Number.isFinite(run.totalMs)&&
    run.totalMs>=0&&run.totalMs<=32*60000&&Array.isArray(run.nodes)&&
    run.nodes.length>=3&&run.nodes.length<=32&&
    run.computed+run.reused===run.nodes.length&&
    run.nodes.every(validTiming)&&
    run.nodes.filter(n=>n.cached).length===run.reused&&
    new Set(run.nodes.map(n=>n.id)).size===run.nodes.length;
}
const ms=value=>value.toFixed(3)+' ms';
function formatGeometryGraphProfile(input){
  if(!input||typeof input!=='object'||![1,2].includes(input.graphVersion)||
     !idPattern.test(input.outputId)||!Number.isInteger(input.sampledFrames)||
     input.sampledFrames<2||input.sampledFrames>1025||
     !validRun(input.cold)||!validRun(input.warm)||
     input.cold.nodes.length!==input.warm.nodes.length)
    throw Error('Invalid or oversized Geometry Graph timing report.');
  const cold=input.cold,warm=input.warm;
  for(let i=0;i<cold.nodes.length;i++){
    if(cold.nodes[i].id!==warm.nodes[i].id||
       cold.nodes[i].type!==warm.nodes[i].type)
      throw Error('Geometry Graph timing nodes do not align.');
  }
  const lines=[
    'Graph v'+input.graphVersion+' · Output: '+input.outputId+
      ' · sampled frames: '+input.sampledFrames,
    'Cold CPU: '+ms(cold.totalMs)+' · computed '+cold.computed+
      ', cache hits '+cold.reused,
    'Warm CPU: '+ms(warm.totalMs)+' · computed '+warm.computed+
      ', cache hits '+warm.reused,
    'Node ID (type) | Cold | Warm',
  ];
  for(let i=0;i<cold.nodes.length;i++){
    const a=cold.nodes[i],b=warm.nodes[i];
    lines.push(a.id+' ('+a.type+') | '+
      (a.cached?'cached':ms(a.durationMs))+' | '+
      (b.cached?'cached':ms(b.durationMs)));
  }
  lines.push('CPU node evaluation only; excludes frame sampling, JSON validation, Mesh upload and gizmos. Timings are diagnostic, not frame-rate benchmarks.');
  return lines.join('\n');
}
module.exports={formatGeometryGraphProfile};
