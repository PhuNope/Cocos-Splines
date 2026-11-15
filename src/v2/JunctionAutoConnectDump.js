'use strict';
/**
 * Pure Creator 3.8 IProperty array dump planner. No Scene or Node mutation.
 * Existing connected branches retain ordering/marking flags. New branches
 * are appended in deterministic angular order from the geometry proposal.
 */
const clone=x=>JSON.parse(JSON.stringify(x));
const reference=dump=>{
 const x=dump?.value;
 if(typeof x==='string')return x;
 if(typeof x?.uuid==='string')return x.uuid;
 if(typeof x?.uuid?.value==='string')return x.uuid.value;
 return '';
};
const isJunction=c=>c?.type==='SplinesV2.JunctionPatch'||
 (!!c?.value?.branches&&!!c?.value?.junctionUVMode&&!!c?.value?.endpointTolerance);
const linkInfo=entry=>({
 componentUuid:reference(entry?.value?.road),
 atEnd:entry?.value?.atEnd?.value===true
});
const template=raw=>{
 if(raw?.elementTypeData?.value?.road&&raw?.elementTypeData?.value?.atEnd)
  return clone(raw.elementTypeData);
 const existing=raw?.value?.find(x=>x?.value?.road&&x?.value?.atEnd);
 if(existing)return clone(existing);
 // Empty Cocos typed CCClass arrays can lack elementTypeData in some
 // Creator dump versions. Use only the documented fields of JunctionRoadLink.
 return {type:'SplinesV2.JunctionRoadLink',value:{
  road:{type:'SplinesV2.SplineRoad',value:{uuid:''}},
  atEnd:{type:'Boolean',value:false},
  stopBarEnabled:{type:'Boolean',value:true},
  crosswalkEnabled:{type:'Boolean',value:true}
 }};
};
function planJunctionAutoConnectDump(nodeDump,proposal){
 if(!proposal||!Array.isArray(proposal.branches)||
    (proposal.branches.length!==3&&proposal.branches.length!==4)||
    !Array.isArray(proposal.expectedLinks))
  throw new Error('Invalid Junction Auto Connect proposal');
 const components=nodeDump?.__comps__;
 if(!Array.isArray(components))throw new Error('Junction node dump unavailable');
 const indexes=components.map((c,i)=>isJunction(c)?i:-1).filter(i=>i>=0);
 if(indexes.length!==1)
  throw new Error('Auto Connect requires exactly one Junction Patch component');
 const componentIndex=indexes[0],properties=components[componentIndex].value;
 const raw=properties.branches;
 if(!raw||!Array.isArray(raw.value))
  throw new Error('Junction serialized branches dump unavailable');
 const current=raw.value,actual=current.map(linkInfo);
 const expected=proposal.expectedLinks.map(x=>({
  componentUuid:x?.componentUuid||'',atEnd:!!x?.atEnd
 }));
 if(JSON.stringify(actual)!==JSON.stringify(expected))
  throw new Error('Junction links changed since Auto Connect proposal; Check again');
 const ids=new Set(),paths=new Set(),desired=new Map();
 for(const branch of proposal.branches){
  if(typeof branch.componentUuid!=='string'||!branch.componentUuid||
     typeof branch.roadId!=='string'||!branch.roadId||
     typeof branch.pathId!=='string'||!branch.pathId||
     typeof branch.atEnd!=='boolean'||
     ids.has(branch.componentUuid)||paths.has(branch.pathId))
   throw new Error('Auto Connect has invalid or duplicated Road/Path reference');
  ids.add(branch.componentUuid);paths.add(branch.pathId);
  desired.set(branch.componentUuid,branch);
 }
 const newEntries=[],used=new Set();
 for(const entry of current){
  const id=reference(entry?.value?.road);
  if(!id)continue; // Empty Inspector placeholders may be dropped.
  if(used.has(id))throw new Error('Junction contains duplicate existing Road links');
  if(!desired.has(id))
   throw new Error('Junction contains an existing Road outside Auto Connect radius; unlink it manually before applying');
  used.add(id);
  const out=clone(entry);
  out.value.atEnd.value=desired.get(id).atEnd;
  newEntries.push(out);
 }
 const seed=template(raw);
 for(const branch of proposal.branches){
  const id=branch.componentUuid;
  if(used.has(id))continue;
  used.add(id);
  const entry=clone(seed);
  if(!entry?.value?.road||!entry.value.atEnd)
   throw new Error('Invalid JunctionRoadLink typed dump template');
  // CC Component references use the component UUID, not the Node UUID.
  // Preserve additional reference metadata if supplied by Creator.
  if(!entry.value.road.type)entry.value.road.type='SplinesV2.SplineRoad';
  entry.value.road.value={uuid:id};
  entry.value.atEnd.value=branch.atEnd;
  newEntries.push(entry);
 }
 if(newEntries.length<3||newEntries.length>4)
  throw new Error('Auto Connect must produce exactly 3 or 4 branches');
 const noOp=JSON.stringify(newEntries)===JSON.stringify(current);
 if(!noOp){
  for(const field of ['turnGuides','curbRamps']){
   const records=properties[field]?.value;
   if(Array.isArray(records)&&records.length>0)
    throw new Error('Auto Connect cannot change Branches while '+field+
     ' uses index-based routes; remove or remap those guides first');
  }
 }
 const dump=clone(raw);dump.value=newEntries;
 return {componentIndex,field:'branches',dump,record:true,noOp,
  count:newEntries.length,componentUuids:[...used]};
}
module.exports={planJunctionAutoConnectDump};
