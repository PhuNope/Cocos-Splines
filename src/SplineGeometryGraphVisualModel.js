'use strict';
/**
 * Phase 4.2a: dependency-free Visual Graph editor model.
 * Mirrors typed DAG v1 contracts. Every graph mutation is validated BEFORE
 * the Inspector changes the serialized Cocos property dump.
 *
 * Graph geometry and canvas layout are SEPARATE serialized strings: dragging
 * a card only changes graphLayoutJson and never invalidates renderer caches.
 */
const TYPES=Object.freeze({
  spline:{input:null,output:'path',params:['slot']},
  meshAsset:{input:null,output:'meshSource',params:['slot']},
  offset:{input:'path',output:'path',params:['right','up']},
  transform:{input:'path',output:'path',params:['translateX','translateY','translateZ','rotateX','rotateY','rotateZ','pathScale']},
  noise:{input:'path',output:'path',params:['noiseRight','noiseUp','noiseForward','noiseFrequency','noiseOctaves','noisePersistence','noisePhase','noiseSeed','noiseFadeEnds']},
  reverse:{input:'path',output:'path',params:[]},
  clip:{input:'path',output:'path',params:['clipStart','clipEnd']},
  resample:{input:'path',output:'path',params:['resampleSegments']},
  conform:{input:'path',output:'path',params:['conformRayHeight','conformRayDepth','conformOffset','conformMinNormalY','conformMissing','conformAlign']},
  mergePath:{input:'path',output:'path',params:['mergeDirection','mergeMaxGap','mergeMaxAngle']},
  width:{input:'path',output:'path',params:['multiplier','midMultiplier','endMultiplier','taperMode']},
  ribbon:{input:'path',output:'mesh',params:['width','endWidth','uvMetersPerRepeat','thickness','capEnds','cornerMode']},
  tube:{input:'path',output:'mesh',params:['radius','radialSegments','uvMetersPerRepeat','capEnds']},
  extrude:{input:'path',output:'mesh',params:['width','height','profileShape','profileSlot','profileInterpolation','uvMetersPerRepeat','capEnds']},
  meshDeform:{input:'path',output:'mesh',params:['width','height','axis','deformShape','segments','repeats','repeatLayout','tileLength','uvMode','uvMetersPerRepeat']},
  mergeMesh:{input:'mesh',output:'mesh',params:[]},
  output:{input:'mesh',output:'mesh',params:[]},
});
/** Mirror the Core named port registry. Preserve TYPES.input for existing
 * callers; all traversal, validation and socket rendering use descriptors. */
function inputPorts(type){
  const info=TYPES[type];
  if(!info||!info.input)return [];
  const primary={key:'input',type:info.input,required:true,socket:'in',label:info.input,offset:75};
  if(type==='mergeMesh')return [{...primary,label:'Mesh A'},{key:'meshInputB',type:'mesh',required:true,socket:'mesh-b-in',label:'Mesh B',offset:51}];
  if(type==='mergePath')return [{...primary,label:'Path A'},{key:'pathInputB',type:'path',required:true,socket:'path-b-in',label:'Path B',offset:51}];
  return type==='meshDeform'?[primary,{key:'meshInput',type:'meshSource',required:false,
    socket:'mesh-in',label:'asset',offset:51}]:[primary];
}
function inputLinks(node){
  return inputPorts(node.type).filter(port=>typeof node[port.key]==='string')
    .map(port=>({port,sourceId:node[port.key]}));
}
const LIMITS=Object.freeze({
  right:[-1000,1000,0],up:[-1000,1000,0],
  translateX:[-1000,1000,0],translateY:[-1000,1000,0],translateZ:[-1000,1000,0],
  rotateX:[-360,360,0],rotateY:[-360,360,0],rotateZ:[-360,360,0],pathScale:[.01,100,1],
  noiseRight:[-1000,1000,0],noiseUp:[-1000,1000,0],noiseForward:[-1000,1000,0],
  noiseFrequency:[1,64,4],noiseOctaves:[1,6,2],noisePersistence:[0,1,.5],noisePhase:[-1000,1000,0],
  noiseSeed:[-2147483647,2147483647,12345],noiseFadeEnds:[0,.5,.1],
  clipStart:[0,1,0],clipEnd:[0,1,1],resampleSegments:[3,1024,32],
  conformRayHeight:[0,10000,10],conformRayDepth:[0,10000,50],conformOffset:[-1000,1000,0],
  conformMinNormalY:[0,1,.3],conformMissing:[0,1,0],conformAlign:[0,1,1],
  mergeDirection:[0,2,0],mergeMaxGap:[0,10000,.05],mergeMaxAngle:[0,179,120],
  multiplier:[.01,20,1],midMultiplier:[.01,20,1],
  endMultiplier:[.01,20,1],taperMode:[0,1,0],
  width:[.05,100,4],endWidth:[0,100,0],
  uvMetersPerRepeat:[.01,10000,5],thickness:[0,20,0],
  cornerMode:[0,1,0],radius:[.025,50,1],radialSegments:[3,32,12],
  height:[.05,100,1],profileShape:[0,2,0],profileSlot:[0,2,0],profileInterpolation:[0,2,0],
  deformShape:[0,1,0],axis:[0,2,2],slot:[0,2,0],segments:[2,64,12],repeats:[1,16,1],
  repeatLayout:[0,1,0],tileLength:[0,10000,0],uvMode:[0,2,2],
});
const NODE_KEYS=new Set(['id','type','input','meshInput','meshInputB','pathInputB','mergeDirection','mergeMaxGap','mergeMaxAngle','right','up','translateX','translateY','translateZ','rotateX','rotateY','rotateZ','pathScale','noiseRight','noiseUp','noiseForward','noiseFrequency','noiseOctaves','noisePersistence','noisePhase','noiseSeed','noiseFadeEnds','clipStart','clipEnd','resampleSegments','conformRayHeight','conformRayDepth','conformOffset','conformMinNormalY','conformMissing','conformAlign','multiplier','midMultiplier','endMultiplier','taperMode','width','widthKeys',
  'endWidth','uvMetersPerRepeat','thickness','capEnds','cornerMode','radius','radialSegments',
  'height','profileShape','profileSlot','profileKeys','profileInterpolation','deformShape','axis','slot','segments','repeats','repeatLayout','tileLength','uvMode']);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeId=s=>typeof s==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(s);
const clone=v=>JSON.parse(JSON.stringify(v));
function validateWidthKeys(keys){
  if(!Array.isArray(keys)||keys.length<2||keys.length>16)
    throw Error('Width curve requires 2–16 ordered keys.');
  let prev=-1;
  keys.forEach((key,i)=>{
    if(!object(key)||Object.keys(key).length!==2||
      Object.keys(key).some(k=>k!=='progress'&&k!=='multiplier')||
      !finite(key.progress)||key.progress<0||key.progress>1||
      !finite(key.multiplier)||key.multiplier<.01||key.multiplier>20||
      (i===0&&key.progress!==0)||
      (i===keys.length-1&&key.progress!==1)||
      (i>0&&key.progress-prev<.001-1e-9))
      throw Error('Invalid Width keys: endpoints 0/1, 0.001 minimum gap, multiplier .01–20.');
    prev=key.progress;
  });
}
function validateProfileKeys(keys){
  if(!Array.isArray(keys)||keys.length<2||keys.length>16)
    throw Error('Profile keys require 2–16 ordered keys.');
  let prev=-1;
  keys.forEach((key,i)=>{
    if(!object(key)||Object.keys(key).length!==2||Object.keys(key).some(k=>k!=='progress'&&k!=='slot')||
       !finite(key.progress)||key.progress<0||key.progress>1||!Number.isInteger(key.slot)||key.slot<0||key.slot>2||
       (i===0&&key.progress!==0)||(i===keys.length-1&&key.progress!==1)||(i>0&&key.progress-prev<.001-1e-9))
      throw Error('Profile keys require endpoints 0/1, integer slots 0–2 and gaps >= 0.001.');
    prev=key.progress;
  });
}
const escapeHtml=text=>String(text).replace(/[&<>"']/g,
  ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function validateGraph(graph) {
  if(!object(graph)||![1,2].includes(graph.version)||!Array.isArray(graph.nodes)||
    graph.nodes.length<3||graph.nodes.length>32||!safeId(graph.output)||
    Object.keys(graph).some(k=>!['version','nodes','output'].includes(k)))
    throw Error('Graph V1 requires 3–32 nodes, version=1 and a valid output.');
  const map=new Map();
  let sources=0,outputs=0,meshAssets=0;
  const occupiedSlots=new Set(),occupiedSplineSlots=new Set();
  for(const node of graph.nodes){
    if(!object(node)||!safeId(node.id)||!Object.hasOwn(TYPES,node.type)||
      map.has(node.id))throw Error('Unknown, duplicate or invalid Graph node.');
    const info=TYPES[node.type];
    const allowed=new Set(['id','type',...inputPorts(node.type).map(p=>p.key),
      ...(node.type==='width'?['widthKeys']:node.type==='extrude'?['profileKeys']:[]),...info.params]);
    if(Object.keys(node).some(k=>!allowed.has(k)||!NODE_KEYS.has(k)))
      throw Error('Unsupported Graph node parameter.');
    if(node.type==='spline'){
      sources++;
      const slot=node.slot===undefined?0:node.slot;
      if(!Number.isInteger(slot)||slot<0||slot>2||occupiedSplineSlots.has(slot))
        throw Error('Spline source slot must be a unique integer 0–2.');
      occupiedSplineSlots.add(slot);
    }
    if(node.type==='meshAsset'){
      meshAssets++;
      const slot=node.slot??0;
      if(!Number.isInteger(slot)||slot<0||slot>2||occupiedSlots.has(slot))
        throw Error('Mesh Asset slot must be a unique integer 0–2.');
      occupiedSlots.add(slot);
    }
    if(node.type==='output')outputs++;
    for(const key of info.params){
      const value=node[key];
      if(value===undefined)continue;
      if(key==='capEnds'){
        if(typeof value!=='boolean')throw Error('Graph capEnds requires Boolean.');
      }else{
        const [lo,hi]=LIMITS[key];
        if(!finite(value)||value<lo||value>hi||
          (['cornerMode','radialSegments','profileShape','profileSlot','deformShape','axis','slot','segments','repeats','repeatLayout','uvMode','taperMode','noiseFrequency','noiseOctaves','noiseSeed','resampleSegments','conformMissing','conformAlign','mergeDirection','profileInterpolation'].includes(key)&&!Number.isInteger(value)))
          throw Error('Invalid Graph parameter '+key+'.');
      }
    }
    if(node.type==='conform'&&(node.conformRayHeight??10)+(node.conformRayDepth??50)<=1e-6)
      throw Error('Conform requires a nonzero ray range.');
    if(node.type==='mergeMesh'&&node.input===node.meshInputB)
      throw Error('Merge Mesh requires distinct input nodes.');
    if(node.type==='mergePath'&&node.input===node.pathInputB)
      throw Error('Merge Path requires distinct input nodes.');
    if(node.type==='clip'&&(node.clipEnd??1)-(node.clipStart??0)<.001-1e-12)
      throw Error('Clip end must be at least 0.001 above start.');
    if(node.type==='extrude'&&node.profileInterpolation!==undefined&&node.profileKeys===undefined)
      throw Error('Profile interpolation requires Profile Keys.');
    if(node.type==='extrude'&&node.profileKeys!==undefined){
      if(node.profileSlot!==undefined)throw Error('Profile keys cannot mix with profileSlot.');
      validateProfileKeys(node.profileKeys);
    }
    if(node.type==='width'&&node.widthKeys!==undefined){
      if(['multiplier','midMultiplier','endMultiplier'].some(k=>node[k]!==undefined))
        throw Error('Width keys cannot mix with legacy multipliers.');
      validateWidthKeys(node.widthKeys);
    }
    if(node.type==='meshDeform'&&node.tileLength!==undefined&&
       node.tileLength>0&&node.tileLength<.01)
      throw Error('Graph tileLength must be 0 or >= 0.01.');
    map.set(node.id,node);
  }
  if(sources<1||sources>3||meshAssets>3||(graph.version===1&&outputs!==1)||
     (graph.version===2&&(outputs<2||outputs>4))||
     map.get(graph.output)?.type!=='output')
    throw Error('Graph requires 1–3 Splines and one v1 Output or 2–4 v2 Outputs.');
  for(const node of map.values()){
    for(const port of inputPorts(node.type)){
      const sourceId=node[port.key];
      if(sourceId===undefined&&!port.required)continue;
      if(!safeId(sourceId)||!map.has(sourceId))
        throw Error('Missing input for node '+node.id+'.'+port.key+'.');
      if(TYPES[map.get(sourceId).type].output!==port.type)
        throw Error('Port type mismatch at '+node.id+'.'+port.key+'.');
    }
  }
  const state=new Map(),ordered=[];
  function visit(id){
    const stateValue=state.get(id)||0;
    if(stateValue===1)throw Error('Graph cycle detected at '+id+'.');
    if(stateValue===2)return;
    state.set(id,1);
    const node=map.get(id);
    for(const link of inputLinks(node))visit(link.sourceId);
    state.set(id,2);ordered.push(node);
  }
  visit(graph.output);
  const outputIds=graph.nodes.filter(n=>n.type==='output').map(n=>n.id).sort();
  if(graph.version===2)for(const id of outputIds)visit(id);
  if(ordered.length!==map.size)
    throw Error('Graph contains disconnected nodes. Remove or reconnect them.');
  return {graph,ordered,map,outputs:outputIds};
}
function parseGraph(json){
  if(typeof json!=='string'||json.length<2||json.length>16384)
    throw Error('Graph JSON must be 2–16384 characters.');
  let value;
  try{value=JSON.parse(json);}catch{throw Error('Malformed Graph JSON.');}
  return validateGraph(value);
}
const formatGraph=graph=>JSON.stringify(graph,null,2);
function applyGraphEdit(json,action,details={}) {
  const {graph,map}=parseGraph(json);
  const next=clone(graph);
  const find=id=>next.nodes.find(n=>n.id===id);
  const unique=prefix=>{
    let id=prefix,i=1;
    while(find(id))id=prefix+String(i++);
    if(i>100)throw Error('Graph node ID limit reached.');
    return id;
  };
  const pruneUnused=()=>{
    const live=new Set();
    function mark(id){
      if(live.has(id))return;
      const n=find(id);if(!n)throw Error('Missing graph dependency.');
      live.add(id);for(const link of inputLinks(n))mark(link.sourceId);
    }
    for(const n of next.nodes)if(n.type==='output')mark(n.id);
    next.nodes=next.nodes.filter(n=>live.has(n.id));
  };
  if(action==='add-merge-mesh'){
    const target=find(details.before||next.output);
    if(!target||target.type!=='output')throw Error('Select an Output Node for Merge Mesh.');
    const first=find(target.input);
    let second=details.sourceId?find(details.sourceId):null;
    if(details.sourceId&&!second)throw Error('Unknown second Mesh source.');
    if(!second){
      if(!first||!['ribbon','tube','extrude','meshDeform'].includes(first.type))
        throw Error('Select an existing second Mesh generator to extend a merged output.');
      // Create a distinct procedural generator on the same input path.
      // Use different geometry rather than duplicating identical triangles.
      const type=first.type==='ribbon'?'tube':'ribbon';
      second={id:unique(type),type,input:first.input};
      next.nodes.push(second);
    }
    if(!first||second.type==='output'||TYPES[second.type].output!=='mesh'||first.id===second.id)
      throw Error('Merge Mesh requires a distinct generated Mesh source.');
    if(next.nodes.length>=32)throw Error('Graph node limit reached.');
    const created={id:unique('mergeMesh'),type:'mergeMesh',input:first.id,meshInputB:second.id};
    next.nodes.push(created);target.input=created.id;
  }else if(action==='add-merge-path'){
    const target=find(details.before);
    if(!target||TYPES[target.type].input!=='path'||!target.input)
      throw Error('Select a Path consumer for Merge Path.');
    let second=details.sourceId?find(details.sourceId):null;
    if(details.sourceId&&!second)throw Error('Unknown second Path source.');
    if(!second){
      const used=new Set(next.nodes.filter(n=>n.type==='spline').map(n=>n.slot??0));
      const slot=[0,1,2].find(i=>!used.has(i));
      if(slot===undefined)throw Error('All Spline slots used; select an existing Path source.');
      second={id:unique('splineSource'),type:'spline',slot};next.nodes.push(second);
    }
    if(TYPES[second.type].output!=='path'||target.input===second.id)
      throw Error('Merge Path requires a distinct second Path source.');
    if(next.nodes.length>=32)throw Error('Graph node limit reached.');
    const created={id:unique('mergePath'),type:'mergePath',input:target.input,pathInputB:second.id};
    next.nodes.push(created);target.input=created.id;
  }else if(action==='attach-mesh-asset'){
    const target=find(details.id);
    if(!target||target.type!=='meshDeform')
      throw Error('Select a Mesh Deform node to attach a Mesh Asset.');
    if(target.meshInput)return json;
    const taken=new Set(next.nodes.filter(n=>n.type==='meshAsset').map(n=>n.slot??0));
    const slot=[0,1,2].find(i=>!taken.has(i));
    if(slot===undefined)throw Error('All three Mesh Asset slots are used. Connect an existing source socket instead.');
    if(next.nodes.length>=32)throw Error('Graph node limit reached.');
    const source={id:unique('meshAsset'),type:'meshAsset',...(slot?{slot}:{})};
    next.nodes.push(source);
    target.meshInput=source.id;
  }else if(action==='detach-mesh-asset'){
    const target=find(details.id);
    if(!target||target.type!=='meshDeform'||!target.meshInput)
      throw Error('Select a Mesh Deform node with a Mesh Asset input.');
    const sourceId=target.meshInput;
    delete target.meshInput;
    if(!next.nodes.some(n=>n.meshInput===sourceId))
      next.nodes=next.nodes.filter(n=>n.id!==sourceId);
  }else if(action==='add-output'||action==='add-spline-output'){
    const existing=next.nodes.filter(n=>n.type==='output');
    if(existing.length>=4||next.nodes.length>(action==='add-spline-output'?29:30))
      throw Error('Multi-output Graph requires at most four outputs and 32 nodes.');
    const target=find(details.fromOutputId||next.output);
    if(!target||target.type!=='output')
      throw Error('Select an existing output to branch from.');
    const producer=find(target.input);
    if(!producer||!['ribbon','tube','extrude','meshDeform','mergeMesh'].includes(producer.type)||
       (action==='add-spline-output'&&producer.type==='mergeMesh'))
      throw Error('Output must be connected to a mesh generator.');
    const meshId=unique(producer.type+'Branch');
    const outputId=unique('outputBranch');
    let branch={...producer,id:meshId};
    if(action==='add-spline-output'){
      const occupied=new Set(next.nodes.filter(n=>n.type==='spline').map(n=>n.slot??0));
      const slot=[0,1,2].find(i=>!occupied.has(i));
      if(slot===undefined)throw Error('All three Spline source slots are used.');
      const sourceId=unique('splineSource');
      next.nodes.push({id:sourceId,type:'spline',slot});
      branch={...branch,input:sourceId};
    }
    next.nodes.push(branch,{id:outputId,type:'output',input:meshId});
    next.version=2;
  }else if(action==='remove-output'){
    if(next.version!==2||details.id===next.output)
      throw Error('Cannot remove the default output. Select another default first.');
    const target=find(details.id);
    if(!target||target.type!=='output')
      throw Error('Select a non-default Output Node.');
    next.nodes=next.nodes.filter(n=>n.id!==target.id);
    // Remove dead private generator/path nodes without mutating any shared
    // upstream node still referenced by another output.
    const live=new Set();
    const mark=id=>{
      if(live.has(id))return;
      const node=find(id);
      if(!node)throw Error('Output branch dependency is missing.');
      live.add(id);
      for(const link of inputLinks(node))mark(link.sourceId);
    };
    for(const node of next.nodes)if(node.type==='output')mark(node.id);
    next.nodes=next.nodes.filter(n=>live.has(n.id));
    if(next.nodes.filter(n=>n.type==='output').length===1)next.version=1;
  }else if(action==='set-default-output'){
    const target=find(details.id);
    if(!target||target.type!=='output')
      throw Error('Default output must refer to an Output Node.');
    if(next.output===target.id)return json;
    if(next.version!==2)throw Error('Graph v1 has one immutable default output.');
    next.output=target.id;
  }else if(action==='insert'){
    const type=details.type,target=find(details.before||'ribbon');
    if(!['offset','transform','noise','reverse','clip','resample','conform','width'].includes(type)||!target||!target.input||
       TYPES[target.type].input!=='path')
      throw Error('Only path-transform nodes may be inserted before a Path consumer.');
    const prefix=type;
    let id='',i=1;
    do{id=prefix+String(i++);}while(map.has(id)&&i<=100);
    if(map.has(id)||next.nodes.length>=32)throw Error('Graph node limit reached.');
    const created={id,type,input:target.input};
    target.input=id;next.nodes.push(created);
  }else if(action==='remove'){
    const id=details.id,target=find(id);
    if(!target||!['offset','transform','noise','reverse','clip','resample','conform','mergePath','mergeMesh','width'].includes(target.type))
      throw Error('Cannot delete required Spline, Ribbon or Output node.');
    for(const node of next.nodes)for(const link of inputLinks(node))
      if(link.sourceId===id)node[link.port.key]=target.input;
    next.nodes=next.nodes.filter(n=>n.id!==id);
    if(target.type==='mergePath'||target.type==='mergeMesh')pruneUnused();
  }else if(action==='connect'){
    const target=find(details.target),source=find(details.source);
    if(!target||!source)throw Error('Select a valid input and output socket.');
    if(target.id===source.id)throw Error('Cannot connect a node to itself.');
    const outputType=TYPES[source.type].output,ports=inputPorts(target.type);
    const matches=ports.filter(p=>p.type===outputType);
    // Legacy programmatic calls without a port work only when the match is
    // unambiguous. Inspector always supplies the clicked named input.
    const port=details.port===undefined?(matches.length===1?matches[0]:null):
      ports.find(p=>p.key===details.port);
    if(!port||port.type!==outputType)
      throw Error('Cannot connect '+source.type+' to '+target.type+': incompatible socket type or ambiguous port.');
    if(target[port.key]===source.id)return json;
    const previous=target[port.key];
    if(port.key==='meshInput'){
      target[port.key]=source.id;
      if(previous&&!next.nodes.some(n=>inputLinks(n).some(l=>l.sourceId===previous)))
        next.nodes=next.nodes.filter(n=>n.id!==previous);
    }else{
      // Preserve old single-path reorder behavior. Never silently move
      // a transform shared by multiple consumers or change a secondary port.
      const transforms=['offset','transform','noise','reverse','clip','resample','conform','width'];
      if(target.type!=='mergePath'&&port.key==='input'&&source.input&&transforms.includes(source.type)){
        const consumers=next.nodes.flatMap(n=>inputLinks(n).filter(l=>l.sourceId===source.id)
          .map(l=>({node:n,key:l.port.key})));
        if(consumers.length===1&&consumers[0].key==='input'){
          consumers[0].node.input=source.input;
          source.input=previous;
        }
      }
      target[port.key]=source.id;
      if(target.type==='mergePath'||target.type==='mergeMesh')pruneUnused();
    }
  }else if(action==='replace-generator'){
    const kind=details.type;
    if(!['ribbon','tube','extrude','meshDeform'].includes(kind))
      throw Error('Only Ribbon, Tube, Extrude and Mesh Deform generators can be selected.');
    const output=find(details.outputId||next.output);
    if(output?.type!=='output')throw Error('Selected branch is not an Output Node.');
    const current=find(output.input);
    if(!current||!['ribbon','tube','extrude','meshDeform'].includes(current.type))
      throw Error('Output must connect to an existing mesh generator.');
    if(current.type===kind)return json;
    const reserved=new Set(next.nodes.map(n=>n.id));
    let name=kind,i=1;
    while(reserved.has(name))name=kind+String(i++);
    const replacement={id:name,type:kind,input:current.input,
      uvMetersPerRepeat:current.uvMetersPerRepeat??5};
    if(kind!=='meshDeform')replacement.capEnds=current.capEnds??false;
    if(['ribbon','extrude','meshDeform'].includes(kind)&&
       typeof current.width==='number')replacement.width=current.width;
    if(['extrude','meshDeform'].includes(kind)&&
       typeof current.height==='number')replacement.height=current.height;
    // Multi-output may share a producer. Preserve it if another output uses
    // that mesh; otherwise replace in place without orphaning the graph.
    const shared=next.nodes.some(n=>n.id!==output.id&&inputLinks(n).some(l=>l.sourceId===current.id));
    if(shared)next.nodes.push(replacement);
    else next.nodes=next.nodes.map(n=>n.id===current.id?replacement:n);
    if(next.nodes.length>32)throw Error('Graph node limit reached.');
    output.input=name;
    if(current.type==='meshDeform'&&current.meshInput&&
       !next.nodes.some(n=>n.meshInput===current.meshInput))
      next.nodes=next.nodes.filter(n=>n.id!==current.meshInput);
  }else if(['profile-keys-enable','profile-keys-disable','profile-key-add','profile-key-remove','profile-key-set'].includes(action)){
    const target=find(details.id);
    if(!target||target.type!=='extrude')throw Error('Select an Extrude node.');
    if(action==='profile-keys-enable'){
      if(!target.profileKeys){
        const slot=target.profileSlot??0;
        target.profileKeys=[{progress:0,slot},{progress:1,slot}];delete target.profileSlot;
      }
    }else{
      const keys=target.profileKeys;
      if(!keys)throw Error('Enable Profile Keys first.');
      if(action==='profile-keys-disable'){
        target.profileSlot=keys[0].slot;delete target.profileKeys;delete target.profileInterpolation;
      }else if(action==='profile-key-add'){
        if(keys.length>=16)throw Error('Profile keys maximum is 16.');
        let index=1;
        for(let i=2;i<keys.length;i++)if(keys[i].progress-keys[i-1].progress>keys[index].progress-keys[index-1].progress)index=i;
        keys.splice(index,0,{progress:(keys[index-1].progress+keys[index].progress)/2,slot:keys[index-1].slot});
      }else{
        const index=details.index;
        if(!Number.isInteger(index)||index<0||index>=keys.length)throw Error('Invalid Profile key index.');
        if(action==='profile-key-remove'){
          if(index===0||index===keys.length-1)throw Error('Profile endpoint keys cannot be removed.');
          keys.splice(index,1);
        }else keys[index]={progress:details.progress,slot:details.slot};
      }
    }
  }else if(action==='width-keys-enable'){
    const target=find(details.id);
    if(!target||target.type!=='width')throw Error('Select a Width node.');
    if(!target.widthKeys){
      const start=target.multiplier??1,end=target.endMultiplier??start;
      const middle=target.midMultiplier??(start+end)/2;
      target.widthKeys=[{progress:0,multiplier:start},
        {progress:.5,multiplier:middle},{progress:1,multiplier:end}];
      delete target.multiplier;delete target.midMultiplier;delete target.endMultiplier;
    }
  }else if(['width-key-add','width-key-remove','width-key-set'].includes(action)){
    const target=find(details.id);
    if(!target||target.type!=='width'||!Array.isArray(target.widthKeys))
      throw Error('Enable multi-key Width editing first.');
    const keys=target.widthKeys;
    if(action==='width-key-add'){
      if(keys.length>=16)throw Error('Width curve maximum is 16 keys.');
      let largest=-1,index=1;
      for(let i=1;i<keys.length;i++){
        const gap=keys[i].progress-keys[i-1].progress;
        if(gap>largest){largest=gap;index=i;}
      }
      keys.splice(index,0,{progress:(keys[index-1].progress+keys[index].progress)/2,
        multiplier:(keys[index-1].multiplier+keys[index].multiplier)/2});
    }else{
      const index=details.index;
      if(!Number.isInteger(index)||index<0||index>=keys.length)
        throw Error('Invalid Width key index.');
      if(action==='width-key-remove'){
        if(index===0||index===keys.length-1)
          throw Error('Width endpoint keys cannot be removed.');
        keys.splice(index,1);
      }else keys[index]={progress:details.progress,multiplier:details.multiplier};
    }
  }else if(action==='param'){
    const target=find(details.id),key=details.key;
    if(!target||!TYPES[target.type].params.includes(key)||
      (target.type==='extrude'&&target.profileKeys&&['profileSlot','profileShape'].includes(key))||
      (key==='profileInterpolation'&&!target.profileKeys)||
      target.type==='width'&&target.widthKeys&&
      ['multiplier','midMultiplier','endMultiplier'].includes(key))
      throw Error('Selected node does not support '+key+'.');
    let value=details.value;
    if(target.type==='width'&&['midMultiplier','endMultiplier'].includes(key)&&
       value===null){
      delete target[key];
      validateGraph(next);
      return formatGraph(next);
    }
    if(key==='profileSlot'&&value===-1){
      delete target.profileSlot;
      validateGraph(next);
      return formatGraph(next);
    }
    if(key==='capEnds'){if(typeof value!=='boolean')throw Error('capEnds must be Boolean.');}
    else {
      if(typeof value!=='number'||!finite(value))throw Error('Non-finite Graph parameter.');
      const [lo,hi]=LIMITS[key];
      if(value<lo||value>hi||(['cornerMode','radialSegments','profileShape','profileSlot','deformShape','segments','repeats','repeatLayout','uvMode','axis','slot','taperMode','noiseFrequency','noiseOctaves','noiseSeed','resampleSegments','conformMissing','conformAlign','mergeDirection','profileInterpolation'].includes(key)&&!Number.isInteger(value)))
        throw Error(key+' out of range ('+lo+'–'+hi+').');
    }
    if(key==='tileLength'&&value>0&&value<.01)
      throw Error('tileLength must be 0 or >= 0.01.');
    target[key]=value;
  }else throw Error('Unknown Graph operation.');
  validateGraph(next);
  return formatGraph(next);
}
/** Bounded logical coordinate space; actual viewport content grows with
 * graph depth, branch width and saved positions. No runtime/geometry writes. */
const STAGE=Object.freeze({width:6600,height:4400,minWidth:860,minHeight:410,
  cardWidth:144,cardHeight:90,margin:12,columnStep:196,rowStep:128});
function autoGraphLayout(view){
  const depths=new Map(),layers=new Map(),positions={};
  for(const node of view.ordered){
    const links=inputLinks(node);
    const depth=links.length?1+Math.max(...links.map(l=>depths.get(l.sourceId))):0;
    depths.set(node.id,depth);
    if(!layers.has(depth))layers.set(depth,[]);
    layers.get(depth).push(node);
  }
  const maxRows=Math.max(...Array.from(layers.values(),nodes=>nodes.length));
  const centerY=Math.max(STAGE.minHeight/2,STAGE.margin+STAGE.cardHeight/2+
    (maxRows-1)*STAGE.rowStep/2);
  for(const [depth,nodes] of layers){
    // Parent barycenter groups related paths before assigning nonoverlapping
    // rows. ID tie break makes layout independent of serialized node order.
    const score=n=>{
      const links=inputLinks(n);
      return links.length?links.reduce((sum,l)=>sum+positions[l.sourceId].y,0)/links.length:0;
    };
    nodes.sort((a,b)=>score(a)-score(b)||(a.id<b.id?-1:a.id>b.id?1:0));
    nodes.forEach((node,i)=>{
      positions[node.id]={
        x:STAGE.margin+depth*STAGE.columnStep,
        y:Math.round(centerY-STAGE.cardHeight/2+(i-(nodes.length-1)/2)*STAGE.rowStep),
      };
    });
  }
  return positions;
}
const overlaps=(a,b)=>a.x<b.x+STAGE.cardWidth+8&&a.x+STAGE.cardWidth+8>b.x&&
  a.y<b.y+STAGE.cardHeight+8&&a.y+STAGE.cardHeight+8>b.y;
function parseLayout(layoutJson,graphJson){
  const view=parseGraph(graphJson),defaults=autoGraphLayout(view);
  let parsed;
  if(layoutJson===undefined||layoutJson===null||layoutJson==='')parsed={};
  else {
    if(typeof layoutJson!=='string'||layoutJson.length>8192)
      throw Error('Graph layout JSON too large.');
    try{parsed=JSON.parse(layoutJson);}catch{throw Error('Graph layout JSON syntax error.');}
    if(!object(parsed))throw Error('Graph layout must be a JSON object.');
  }
  const positions={},occupied=[];
  // Preserve explicitly saved positions, even intentionally overlapping cards.
  for(const node of view.ordered){
    if(!Object.hasOwn(parsed,node.id))continue;
    const saved=parsed[node.id];
    if(!object(saved)||!finite(saved.x)||!finite(saved.y)||
       saved.x<0||saved.x>STAGE.width-STAGE.cardWidth||
       saved.y<0||saved.y>STAGE.height-STAGE.cardHeight)
      throw Error('Invalid canvas position for '+node.id+'.');
    positions[node.id]={x:saved.x,y:saved.y};occupied.push(positions[node.id]);
  }
  // Newly added nodes avoid existing saved cards without moving those cards.
  for(const node of view.ordered){
    if(Object.hasOwn(positions,node.id))continue;
    const ideal=defaults[node.id];
    let placed=null;
    const available=p=>!occupied.some(other=>overlaps(p,other));
    if(available(ideal))placed=ideal;
    else{
      for(let y=ideal.y+STAGE.rowStep;y<=STAGE.height-STAGE.cardHeight;y+=STAGE.rowStep){
        const p={x:ideal.x,y};if(available(p)){placed=p;break;}
      }
      if(!placed)for(let y=STAGE.margin;y<ideal.y;y+=STAGE.rowStep){
        const p={x:ideal.x,y};if(available(p)){placed=p;break;}
      }
      if(!placed)for(let x=STAGE.margin;x<=STAGE.width-STAGE.cardWidth&&!placed;x+=STAGE.columnStep)
        for(let y=STAGE.margin;y<=STAGE.height-STAGE.cardHeight;y+=STAGE.rowStep){
          const p={x,y};if(available(p)){placed=p;break;}
        }
    }
    if(!placed)throw Error('Graph canvas has no free node position.');
    positions[node.id]=placed;occupied.push(placed);
  }
  // Unknown layout IDs are ignored; stable key order simplifies undo/redo.
  return Object.fromEntries(view.ordered.map(n=>[n.id,positions[n.id]]));
}
function graphCanvasSize(positions){
  const values=Object.values(positions);
  return {
    width:Math.min(STAGE.width,Math.max(STAGE.minWidth,...values.map(p=>Math.ceil(p.x+STAGE.cardWidth+STAGE.columnStep)))),
    height:Math.min(STAGE.height,Math.max(STAGE.minHeight,...values.map(p=>Math.ceil(p.y+STAGE.cardHeight+STAGE.rowStep)))),
  };
}
/** Determine which outputs consume a selected node via any named input.
 * Prefer the explicit default for a shared node, otherwise stable output ID.
 * Selecting an Output itself is always unambiguous. */
function graphOutputIdsForNode(view,id){
  if(!view.map.has(id))return [];
  return view.outputs.filter(outputId=>{
    const visited=new Set();
    function contains(current){
      if(current===id)return true;
      if(visited.has(current))return false;
      visited.add(current);
      return inputLinks(view.map.get(current)).some(link=>contains(link.sourceId));
    }
    return contains(outputId);
  });
}
function activeGraphOutputId(view,id){
  const outputs=graphOutputIdsForNode(view,id);
  return outputs.includes(view.graph.output)?view.graph.output:outputs[0]??view.graph.output;
}
function moveGraphNode(layoutJson,graphJson,id,x,y){
  if(!safeId(id)||!finite(x)||!finite(y))throw Error('Invalid Graph node move.');
  const layout=parseLayout(layoutJson,graphJson);
  if(!Object.hasOwn(layout,id))throw Error('Cannot move an unknown Graph node.');
  layout[id]={
    x:Math.min(STAGE.width-STAGE.cardWidth,Math.max(0,Math.round(x))),
    y:Math.min(STAGE.height-STAGE.cardHeight,Math.max(0,Math.round(y))),
  };
  return JSON.stringify(layout);
}
function cleanGraphLayout(layoutJson,graphJson){
  return JSON.stringify(parseLayout(layoutJson,graphJson));
}
function renderGraphCanvas(graphJson,layoutJson,selectedId,pendingSource){
  const {ordered,map}=parseGraph(graphJson),positions=parseLayout(layoutJson,graphJson);
  const size=graphCanvasSize(positions);
  const links=ordered.flatMap(n=>inputLinks(n).map(link=>({node:n,fromId:link.sourceId,port:link.port}))).map(({node,fromId,port})=>{
    const from=positions[fromId],to=positions[node.id];
    const sx=from.x+STAGE.cardWidth,sy=from.y+75,
      tx=to.x,ty=to.y+port.offset;
    const dx=Math.max(28,Math.abs(tx-sx)*.42);
    return '<path class="spl-vg-wire spl-vg-wire-'+TYPES[map.get(fromId).type].output+
      '" data-source-node="'+fromId+'" data-target-node="'+node.id+'" data-target-port="'+port.key+'" d="M '+sx+' '+sy+' C '+(sx+dx)+' '+sy+' '+(tx-dx)+' '+ty+' '+tx+' '+ty+
      '" fill="none"/>';
  }).join('');
  const nodes=ordered.map(n=>{
    const p=positions[n.id],info=TYPES[n.type],selected=n.id===selectedId,
      src=n.id===pendingSource;
    return '<div class="spl-vg-card'+(selected?' selected':'')+(src?' pending':'')+
      '" data-node="'+n.id+'" style="left:'+p.x+'px;top:'+p.y+'px" tabindex="0">'+
      '<div class="spl-vg-head" data-drag="'+n.id+'">'+escapeHtml(n.id)+'</div>'+
      '<div class="spl-vg-type">'+escapeHtml(n.type)+'</div>'+
      inputPorts(n.type).map(port=>'<button type="button" class="spl-vg-socket '+port.socket+' '+port.type+
        '" data-socket="'+port.socket+'" data-node="'+n.id+'" data-port="'+port.key+
        '" title="Input '+port.key+' ('+port.type+')">◀ '+port.label+'</button>').join('')+
      '<button type="button" class="spl-vg-socket out '+info.output+
        '" data-socket="out" data-node="'+n.id+'" title="Output '+info.output+'">'+info.output+' ▶</button>'+
      '</div>';
  }).join('');
  return '<svg class="spl-vg-wires" width="'+size.width+'" height="'+size.height+
    '" viewBox="0 0 '+size.width+' '+size.height+'" aria-hidden="true">'+links+'</svg>'+nodes;
}
function renderWidthKeyControls(n){
  if(!n.widthKeys)return '<button type="button" data-width-action="enable">'+
    'Enable Multi-key Width Curve (2–16 keys)</button>';
  const keys=n.widthKeys;
  const px=k=>(20+k.progress*280).toFixed(3);
  const py=k=>(124-(k.multiplier-.01)/19.99*100).toFixed(3);
  const points=keys.map(k=>px(k)+','+py(k)).join(' ');
  return '<div class="spl-vg-width-keys">'+
    '<div class="spl-vg-note">Closed spline: start/end scale must match.</div>'+
    '<svg class="spl-vg-width-svg" viewBox="0 0 320 140" width="320" height="140" '+
      'role="img" aria-label="Width curve key editor">'+
    '<path d="M20 12V124H300" fill="none" stroke="#647c8b"/>'+
    '<polyline data-width-line="1" points="'+points+'" fill="none" stroke="#72c8e9" stroke-width="2"/>'+
    keys.map((k,i)=>'<circle data-width-key="'+i+'" cx="'+px(k)+'" cy="'+py(k)+
      '" r="6" fill="#e7bf7f" stroke="#233640" stroke-width="2"/>').join('')+
    '</svg>'+
    '<div class="spl-vg-width-table">'+keys.map((k,i)=>
      '<div class="spl-vg-width-row"><span>Key '+(i+1)+'</span>'+
      '<label>Progress <input type="number" data-width-field="progress" data-width-index="'+i+
      '" min="0" max="1" step="0.001" value="'+k.progress+'"'+
      (i===0||i===keys.length-1?' disabled':'')+'></label>'+
      '<label>Scale <input type="number" data-width-field="multiplier" data-width-index="'+i+
      '" min="0.01" max="20" step="any" value="'+k.multiplier+'"></label>'+
      '<button type="button" data-width-action="remove" data-width-index="'+i+'"'+
      (i===0||i===keys.length-1?' disabled':'')+'>×</button></div>'
    ).join('')+'</div>'+
    '<button type="button" data-width-action="add"'+(keys.length>=16?' disabled':'')+
      '>＋ Insert key in largest interval</button></div>';
}
function renderProfileKeyControls(n){
  if(!n.profileKeys)return '<button type="button" data-profile-action="enable">Enable Profile Keys (2–16)</button>';
  const keys=n.profileKeys;
  return '<div class="spl-vg-width-keys"><strong>Profile Keys · '+['Step','Linear','Smoothstep'][n.profileInterpolation??0]+'</strong>'+
    '<div>Normalized path distance. Assign Profile Assets A/B/C with matching ordered contours, holes and vertex counts. Custom UV metadata not supported yet. Same first/last slot on closed paths.</div>'+
    keys.map((k,i)=>'<div class="spl-vg-width-row"><label>Progress <input type="number" min="0" max="1" step=".001" data-profile-field="progress" data-profile-index="'+i+'" value="'+k.progress+'"'+
      (i===0||i===keys.length-1?' disabled':'')+'></label><label>Slot <select data-profile-field="slot" data-profile-index="'+i+'">'+
      ['A','B','C'].map((s,j)=>'<option value="'+j+'"'+(j===k.slot?' selected':'')+'>'+s+'</option>').join('')+
      '</select></label><button type="button" data-profile-action="remove" data-profile-index="'+i+'"'+(i===0||i===keys.length-1?' disabled':'')+'>Remove</button></div>').join('')+
    '<button type="button" data-profile-action="add"'+(keys.length>=16?' disabled':'')+'>＋ Key</button> '+
    '<button type="button" data-profile-action="disable">Use First Slot Only</button></div>';
}
function renderNodeParameters(graphJson,id){
  const {map}=parseGraph(graphJson),n=map.get(id);
  if(!n)return '<div>Select a node to edit its parameters.</div>';
  const info=TYPES[n.type];
  const rows=info.params.filter(key=>!(key==='profileInterpolation'&&!n.profileKeys)&&!(n.type==='extrude'&&n.profileKeys&&['profileSlot','profileShape'].includes(key))&&!(n.type==='width'&&n.widthKeys&&
    ['multiplier','midMultiplier','endMultiplier'].includes(key))).map(key=>{
    const value=n[key]??(key==='capEnds'?false:LIMITS[key][2]);
    if(key==='capEnds')
      return '<label>'+escapeHtml(key)+' <input type="checkbox" data-graph-param="'+key+'"'+
        (value?' checked':'')+'></label>';
    const [min,max]=LIMITS[key];
    if(n.type==='width'&&['midMultiplier','endMultiplier'].includes(key))
      return '<label>'+escapeHtml(key)+' <input type="number" data-graph-param="'+key+
        '" min="'+min+'" max="'+max+'" step="any" placeholder="'+
        (key==='midMultiplier'?'Auto (linear midpoint)':'Same as Start')+
        '" value="'+(n[key]??'')+'"></label>';
    if(n.type==='width'&&key==='taperMode')
      return '<label>Interpolation <select data-graph-param="taperMode">'+
        ['Linear','Smoothstep (ease in/out)'].map((name,i)=>
          '<option value="'+i+'"'+(value===i?' selected':'')+'>'+name+'</option>').join('')+
        '</select></label>';
    if(key==='profileInterpolation')return '<label>Profile Interpolation <select data-graph-param="profileInterpolation">'+['Step (legacy)','Linear','Smoothstep (ease in/out)'].map((name,i)=>'<option value="'+i+'"'+(value===i?' selected':'')+'>'+name+'</option>').join('')+'</select></label>';
    if(key==='mergeDirection')return '<label>Direction B <select data-graph-param="mergeDirection">'+['Forward','Reverse','Nearest endpoint'].map((name,i)=>'<option value="'+i+'"'+(value===i?' selected':'')+'>'+name+'</option>').join('')+'</select></label>';
    if(key==='conformMissing'||key==='conformAlign')return '<label>'+escapeHtml(key)+
      ' <select data-graph-param="'+key+'">'+(key==='conformMissing'?['Fail on missing hit','Keep source sample']:['Source up hint','Surface normal hint']).map((name,i)=>
       '<option value="'+i+'"'+(value===i?' selected':'')+'>'+name+'</option>').join('')+'</select></label>';
    if(key==='axis'||key==='slot')return '<label>'+escapeHtml(key)+
      ' <select data-graph-param="'+key+'">'+
      (key==='axis'?['X','Y','Z']:n.type==='spline'?['A (Spline)','B (Spline B)','C (Spline C)']:['A (Source Mesh)','B (Source Mesh B)','C (Source Mesh C)'])
       .map((name,i)=>'<option value="'+i+'"'+(value===i?' selected':'')+'>'+
         escapeHtml(name)+'</option>').join('')+
      '</select></label>';
    if(key==='repeatLayout'||key==='uvMode')return '<label>'+escapeHtml(key)+
      ' <select data-graph-param="'+key+'">'+
      (key==='repeatLayout'?
       ['Count (stretch per section)','Source Length (trim last tile)']:
       ['Original UV atlas','Continuous repeat UV','Spline distance UV'])
        .map((name,i)=>'<option value="'+i+'"'+(value===i?' selected':'')+'>'+
          escapeHtml(name)+'</option>').join('')+
      '</select></label>';
    if(key==='deformShape')return '<label>'+escapeHtml(key)+
      ' <select data-graph-param="'+key+'">'+
      ['Strip','Box Shell'].map((name,i)=>
        '<option value="'+i+'"'+(value===i?' selected':'')+'>'+name+'</option>').join('')+
      '</select></label>';
    if(key==='profileSlot')return '<label>Profile Asset Slot'+
      ' <select data-graph-param="profileSlot">'+
      '<option value="-1"'+(n.profileSlot===undefined?' selected':'')+'>Built-in preset (default)</option>'+
      ['A (Profile Asset A)','B (Profile Asset B)','C (Profile Asset C)']
        .map((name,i)=>'<option value="'+i+'"'+(n.profileSlot===i?' selected':'')+'>'+name+'</option>').join('')+
      '</select></label>';
    if(key==='profileShape')return '<label>'+escapeHtml(key)+
      ' <select data-graph-param="'+key+'">'+
      ['Rectangle','Beveled','U Channel'].map((name,i)=>
        '<option value="'+i+'"'+(value===i?' selected':'')+'>'+name+'</option>').join('')+
      '</select></label>';
    if(key==='cornerMode')return '<label>'+escapeHtml(key)+
      ' <select data-graph-param="'+key+'"><option value="0"'+(value===0?' selected':'')+
      '>Legacy</option><option value="1"'+(value===1?' selected':'')+'>Join &amp; Trim</option></select></label>';
    return '<label>'+escapeHtml(key)+' <input type="number" data-graph-param="'+key+
      '" min="'+min+'" max="'+max+'" step="'+(['radialSegments','segments','repeats','noiseFrequency','noiseOctaves','noiseSeed','resampleSegments','conformMissing','conformAlign','mergeDirection','profileInterpolation'].includes(key)?'1':'any')+'" value="'+value+'"></label>';
  }).join('');
  return '<strong>'+escapeHtml(n.id)+' · '+escapeHtml(n.type)+'</strong>'+
    (n.input?'<div class="spl-vg-source">Input: '+escapeHtml(n.input)+'</div>':'')+
    (n.meshInput?'<div class="spl-vg-source">Imported mesh: '+escapeHtml(n.meshInput)+'</div>':'')+
    (n.type==='mergeMesh'?'<div class="spl-vg-note">One output material; positions, normals and UVs preserved. No vertex welding.</div>':'')+
    (rows?'<div class="spl-vg-params">'+rows+'</div>':'')+
    (n.type==='width'?renderWidthKeyControls(n):n.type==='extrude'?renderProfileKeyControls(n):'');
}
module.exports={TYPES,LIMITS,STAGE,inputPorts,inputLinks,parseGraph,validateGraph,applyGraphEdit,
  autoGraphLayout,graphCanvasSize,graphOutputIdsForNode,activeGraphOutputId,
  parseLayout,moveGraphNode,cleanGraphLayout,renderGraphCanvas,renderNodeParameters};
