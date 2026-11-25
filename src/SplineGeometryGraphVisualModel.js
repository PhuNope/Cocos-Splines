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
  spline:{input:null,output:'path',params:[]},
  offset:{input:'path',output:'path',params:['right','up']},
  width:{input:'path',output:'path',params:['multiplier']},
  ribbon:{input:'path',output:'mesh',params:['width','endWidth','uvMetersPerRepeat','thickness','capEnds','cornerMode']},
  tube:{input:'path',output:'mesh',params:['radius','radialSegments','uvMetersPerRepeat','capEnds']},
  extrude:{input:'path',output:'mesh',params:['width','height','profileShape','uvMetersPerRepeat','capEnds']},
  meshDeform:{input:'path',output:'mesh',params:['width','height','deformShape','segments','repeats','uvMetersPerRepeat']},
  output:{input:'mesh',output:'mesh',params:[]},
});
const LIMITS=Object.freeze({
  right:[-1000,1000,0],up:[-1000,1000,0],
  multiplier:[.01,20,1],width:[.05,100,4],endWidth:[0,100,0],
  uvMetersPerRepeat:[.01,10000,5],thickness:[0,20,0],
  cornerMode:[0,1,0],radius:[.025,50,1],radialSegments:[3,32,12],
  height:[.05,100,1],profileShape:[0,2,0],
  deformShape:[0,1,0],segments:[2,64,12],repeats:[1,16,1],
});
const NODE_KEYS=new Set(['id','type','input','right','up','multiplier','width',
  'endWidth','uvMetersPerRepeat','thickness','capEnds','cornerMode','radius','radialSegments',
  'height','profileShape','deformShape','segments','repeats']);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeId=s=>typeof s==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(s);
const clone=v=>JSON.parse(JSON.stringify(v));
const escapeHtml=text=>String(text).replace(/[&<>"']/g,
  ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function validateGraph(graph) {
  if(!object(graph)||![1,2].includes(graph.version)||!Array.isArray(graph.nodes)||
    graph.nodes.length<3||graph.nodes.length>32||!safeId(graph.output)||
    Object.keys(graph).some(k=>!['version','nodes','output'].includes(k)))
    throw Error('Graph V1 requires 3–32 nodes, version=1 and a valid output.');
  const map=new Map();
  let sources=0,outputs=0;
  for(const node of graph.nodes){
    if(!object(node)||!safeId(node.id)||!Object.hasOwn(TYPES,node.type)||
      map.has(node.id))throw Error('Unknown, duplicate or invalid Graph node.');
    const info=TYPES[node.type];
    const allowed=new Set(['id','type',...(info.input?['input']:[]),...info.params]);
    if(Object.keys(node).some(k=>!allowed.has(k)||!NODE_KEYS.has(k)))
      throw Error('Unsupported Graph node parameter.');
    if(info.input===null) sources++;
    if(node.type==='output')outputs++;
    for(const key of info.params){
      const value=node[key];
      if(value===undefined)continue;
      if(key==='capEnds'){
        if(typeof value!=='boolean')throw Error('Graph capEnds requires Boolean.');
      }else{
        const [lo,hi]=LIMITS[key];
        if(!finite(value)||value<lo||value>hi||
          (['cornerMode','radialSegments','profileShape','deformShape','segments','repeats'].includes(key)&&!Number.isInteger(value)))
          throw Error('Invalid Graph parameter '+key+'.');
      }
    }
    map.set(node.id,node);
  }
  if(sources!==1||(graph.version===1&&outputs!==1)||
     (graph.version===2&&(outputs<2||outputs>4))||
     map.get(graph.output)?.type!=='output')
    throw Error('Graph requires one Spline and one v1 Output or 2–4 v2 Outputs.');
  for(const node of map.values()){
    const info=TYPES[node.type];
    if(info.input===null){if(node.input!==undefined)throw Error('Spline source must have no input.');}
    else{
      if(!safeId(node.input)||!map.has(node.input))
        throw Error('Missing input for node '+node.id+'.');
      if(TYPES[map.get(node.input).type].output!==info.input)
        throw Error('Port type mismatch at '+node.id+'.');
    }
  }
  const state=new Map(),ordered=[];
  function visit(id){
    const stateValue=state.get(id)||0;
    if(stateValue===1)throw Error('Graph cycle detected at '+id+'.');
    if(stateValue===2)return;
    state.set(id,1);
    const node=map.get(id);
    if(node.input)visit(node.input);
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
  if(action==='add-output'){
    const existing=next.nodes.filter(n=>n.type==='output');
    if(existing.length>=4||next.nodes.length>30)
      throw Error('Multi-output Graph requires at most four outputs and 32 nodes.');
    const target=find(details.fromOutputId||next.output);
    if(!target||target.type!=='output')
      throw Error('Select an existing output to branch from.');
    const producer=find(target.input);
    if(!producer||!['ribbon','tube','extrude','meshDeform'].includes(producer.type))
      throw Error('Output must be connected to a mesh generator.');
    const meshId=unique(producer.type+'Branch');
    const outputId=unique('outputBranch');
    next.nodes.push({...producer,id:meshId},
      {id:outputId,type:'output',input:meshId});
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
      if(node.input)mark(node.input);
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
    if(!['offset','width'].includes(type)||!target||!target.input||
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
    if(!target||!['offset','width'].includes(target.type))
      throw Error('Cannot delete required Spline, Ribbon or Output node.');
    for(const node of next.nodes)if(node.input===id)node.input=target.input;
    next.nodes=next.nodes.filter(n=>n.id!==id);
  }else if(action==='connect'){
    const target=find(details.target),source=find(details.source);
    if(!target||!source||!TYPES[target.type].input)
      throw Error('Select a valid input and output socket.');
    if(TYPES[target.type].input!==TYPES[source.type].output)
      throw Error('Cannot connect '+(source?.type||'?')+' to '+target.type+': incompatible socket types.');
    if(target.id===source.id)throw Error('Cannot connect a node to itself.');
    if(source.input&&['offset','width'].includes(source.type)&&
       target.input!==source.id){
      // V1 is one output and single-input path operations. A simple relink
      // would orphan a path node. Move the chosen transform immediately
      // before the target while preserving every other graph node instead.
      const consumer=next.nodes.find(node=>node.input===source.id);
      if(!consumer)throw Error('Cannot move disconnected Graph output.');
      consumer.input=source.input;
      source.input=target.input;
      target.input=source.id;
    }else target.input=source.id;
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
    const shared=next.nodes.some(n=>n.id!==output.id&&n.input===current.id);
    if(shared)next.nodes.push(replacement);
    else next.nodes=next.nodes.map(n=>n.id===current.id?replacement:n);
    if(next.nodes.length>32)throw Error('Graph node limit reached.');
    output.input=name;
  }else if(action==='param'){
    const target=find(details.id),key=details.key;
    if(!target||!TYPES[target.type].params.includes(key))
      throw Error('Selected node does not support '+key+'.');
    let value=details.value;
    if(key==='capEnds'){if(typeof value!=='boolean')throw Error('capEnds must be Boolean.');}
    else {
      if(typeof value!=='number'||!finite(value))throw Error('Non-finite Graph parameter.');
      const [lo,hi]=LIMITS[key];
      if(value<lo||value>hi||(['cornerMode','radialSegments','profileShape','deformShape','segments','repeats'].includes(key)&&!Number.isInteger(value)))
        throw Error(key+' out of range ('+lo+'–'+hi+').');
    }
    target[key]=value;
  }else throw Error('Unknown Graph operation.');
  validateGraph(next);
  return formatGraph(next);
}
const STAGE={width:860,height:410,cardWidth:144,cardHeight:90,margin:12};
function parseLayout(layoutJson,graphJson){
  const {ordered,map}=parseGraph(graphJson);
  let parsed;
  if(layoutJson===undefined||layoutJson===null||layoutJson==='')parsed={};
  else {
    if(typeof layoutJson!=='string'||layoutJson.length>8192)
      throw Error('Graph layout JSON too large.');
    try{parsed=JSON.parse(layoutJson);}catch{throw Error('Graph layout JSON syntax error.');}
    if(!object(parsed))throw Error('Graph layout must be a JSON object.');
  }
  const positions={};
  for(let i=0;i<ordered.length;i++){
    const node=ordered[i],saved=Object.hasOwn(parsed,node.id)?parsed[node.id]:null;
    if(saved!==null&&(!object(saved)||!finite(saved.x)||!finite(saved.y)||
      saved.x<0||saved.x>STAGE.width-STAGE.cardWidth||
      saved.y<0||saved.y>STAGE.height-STAGE.cardHeight))
      throw Error('Invalid canvas position for '+node.id+'.');
    const defaultX=Math.min(STAGE.width-STAGE.cardWidth,
      STAGE.margin+Math.round(i*(STAGE.width-STAGE.cardWidth-2*STAGE.margin)/
      Math.max(1,ordered.length-1)));
    positions[node.id]=saved?{x:saved.x,y:saved.y}:{x:defaultX,y:144};
  }
  // Unknown layout IDs are ignored on render; they'll be discarded on save.
  return positions;
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
  const links=ordered.filter(n=>n.input).map(node=>{
    const from=positions[node.input],to=positions[node.id];
    const sx=from.x+STAGE.cardWidth,sy=from.y+STAGE.cardHeight/2,
      tx=to.x,ty=to.y+STAGE.cardHeight/2;
    const dx=Math.max(28,Math.abs(tx-sx)*.42);
    return '<path class="spl-vg-wire spl-vg-wire-'+TYPES[map.get(node.input).type].output+
      '" d="M '+sx+' '+sy+' C '+(sx+dx)+' '+sy+' '+(tx-dx)+' '+ty+' '+tx+' '+ty+
      '" fill="none"/>';
  }).join('');
  const nodes=ordered.map(n=>{
    const p=positions[n.id],info=TYPES[n.type],selected=n.id===selectedId,
      src=n.id===pendingSource;
    return '<div class="spl-vg-card'+(selected?' selected':'')+(src?' pending':'')+
      '" data-node="'+n.id+'" style="left:'+p.x+'px;top:'+p.y+'px" tabindex="0">'+
      '<div class="spl-vg-head" data-drag="'+n.id+'">'+escapeHtml(n.id)+'</div>'+
      '<div class="spl-vg-type">'+escapeHtml(n.type)+'</div>'+
      (info.input?'<button type="button" class="spl-vg-socket in '+info.input+
        '" data-socket="in" data-node="'+n.id+'" title="Input '+info.input+'">◀ '+info.input+'</button>':'')+
      '<button type="button" class="spl-vg-socket out '+info.output+
        '" data-socket="out" data-node="'+n.id+'" title="Output '+info.output+'">'+info.output+' ▶</button>'+
      '</div>';
  }).join('');
  return '<svg class="spl-vg-wires" width="'+STAGE.width+'" height="'+STAGE.height+
    '" viewBox="0 0 '+STAGE.width+' '+STAGE.height+'" aria-hidden="true">'+links+'</svg>'+nodes;
}
function renderNodeParameters(graphJson,id){
  const {map}=parseGraph(graphJson),n=map.get(id);
  if(!n)return '<div>Select a node to edit its parameters.</div>';
  const info=TYPES[n.type];
  const rows=info.params.map(key=>{
    const value=n[key]??(key==='capEnds'?false:LIMITS[key][2]);
    if(key==='capEnds')
      return '<label>'+escapeHtml(key)+' <input type="checkbox" data-graph-param="'+key+'"'+
        (value?' checked':'')+'></label>';
    const [min,max]=LIMITS[key];
    if(key==='deformShape')return '<label>'+escapeHtml(key)+
      ' <select data-graph-param="'+key+'">'+
      ['Strip','Box Shell'].map((name,i)=>
        '<option value="'+i+'"'+(value===i?' selected':'')+'>'+name+'</option>').join('')+
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
      '" min="'+min+'" max="'+max+'" step="'+(['radialSegments','segments','repeats'].includes(key)?'1':'any')+'" value="'+value+'"></label>';
  }).join('');
  return '<strong>'+escapeHtml(n.id)+' · '+escapeHtml(n.type)+'</strong>'+
    (n.input?'<div class="spl-vg-source">Input: '+escapeHtml(n.input)+'</div>':'')+
    (rows?'<div class="spl-vg-params">'+rows+'</div>':'<div class="spl-vg-note">No editable properties.</div>');
}
module.exports={TYPES,LIMITS,STAGE,parseGraph,validateGraph,applyGraphEdit,
  parseLayout,moveGraphNode,cleanGraphLayout,renderGraphCanvas,renderNodeParameters};
