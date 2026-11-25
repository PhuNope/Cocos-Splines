'use strict';
/**
 * Conservative 3-way review of shared JsonAsset graph JSON.
 * Automatic rebase is allowed only for nonconflicting parameter edits against
 * identical node topology. Structural edits are never silently merged.
 * Pure model: no Editor APIs, disk writes, or mutation of input graphs.
 */
const {parseGraph,validateGraph,TYPES}=require('./SplineGeometryGraphVisualModel');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const label=(id,key)=>id+'.'+key;
const topology=g=>JSON.stringify({
  output:g.output,
  nodes:g.nodes.map(n=>({id:n.id,type:n.type,input:n.input??null,meshInput:n.meshInput??null,slot:n.type==='meshAsset'?(n.slot??0):null}))
    .sort((a,b)=>a.id.localeCompare(b.id)),
});
function changeList(before,after){
  const a=new Map(before.nodes.map(n=>[n.id,n]));
  const b=new Map(after.nodes.map(n=>[n.id,n]));
  const paths=[];
  if(before.output!==after.output)paths.push('graph.output');
  for(const id of new Set([...a.keys(),...b.keys()])){
    const left=a.get(id),right=b.get(id);
    if(!left){paths.push(id+' (added)');continue;}
    if(!right){paths.push(id+' (removed)');continue;}
    if(left.type!==right.type)paths.push(label(id,'type'));
    if(left.input!==right.input)paths.push(label(id,'input'));
    if(left.meshInput!==right.meshInput)paths.push(label(id,'meshInput'));
    for(const key of TYPES[left.type]?.params||[]){
      if(!same(left[key],right[key]))paths.push(label(id,key));
    }
  }
  return paths.sort();
}
function analyzeSharedGraphChanges(baselineJson,draftJson,latestJson){
  const base=parseGraph(baselineJson).graph,
    draft=parseGraph(draftJson).graph,
    latest=parseGraph(latestJson).graph;
  const draftChanges=changeList(base,draft);
  const sourceChanges=changeList(base,latest);
  const structureSame=topology(base)===topology(draft)&&
    topology(base)===topology(latest);
  const conflicts=[];
  let mergedGraphJson=null;
  if(structureSame){
    const merged=JSON.parse(JSON.stringify(latest));
    const left=new Map(base.nodes.map(n=>[n.id,n]));
    const right=new Map(draft.nodes.map(n=>[n.id,n]));
    for(const node of merged.nodes){
      const old=left.get(node.id),edited=right.get(node.id);
      for(const key of TYPES[node.type].params){
        if(same(old[key],edited[key]))continue;
        const theirChange=!same(old[key],node[key]);
        if(theirChange&&!same(edited[key],node[key])){
          conflicts.push(label(node.id,key));
          continue;
        }
        if(edited[key]===undefined)delete node[key];
        else node[key]=edited[key];
      }
    }
    if(conflicts.length===0){
      validateGraph(merged);
      mergedGraphJson=JSON.stringify(merged,null,2);
    }
  }
  return {
    canRebase:structureSame&&conflicts.length===0,
    structuralConflict:!structureSame,
    draftChanges,sourceChanges,conflicts,
    mergedGraphJson,
  };
}
module.exports={analyzeSharedGraphChanges};
