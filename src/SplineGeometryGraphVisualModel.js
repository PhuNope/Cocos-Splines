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
  output:{input:'mesh',output:'mesh',params:[]},
});
const LIMITS=Object.freeze({
  right:[-1000,1000,0],up:[-1000,1000,0],
  multiplier:[.01,20,1],width:[.05,100,4],endWidth:[0,100,0],
  uvMetersPerRepeat:[.01,10000,5],thickness:[0,20,0],
  cornerMode:[0,1,0],
});
const NODE_KEYS=new Set(['id','type','input','right','up','multiplier','width',
  'endWidth','uvMetersPerRepeat','thickness','capEnds','cornerMode']);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeId=s=>typeof s==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(s);
const clone=v=>JSON.parse(JSON.stringify(v));
const escapeHtml=text=>String(text).replace(/[&<>"']/g,
  ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function validateGraph(graph) {
  if(!object(graph)||graph.version!==1||!Array.isArray(graph.nodes)||
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
          (key==='cornerMode'&&!Number.isInteger(value)))
          throw Error('Invalid Graph parameter '+key+'.');
      }
    }
    map.set(node.id,node);
  }
  if(sources!==1||outputs!==1||map.get(graph.output)?.type!=='output')
    throw Error('Graph requires exactly one Spline and one selected Output.');
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
  if(ordered.length!==map.size)
    throw Error('Graph contains disconnected nodes. Remove or reconnect them.');
  return {graph,ordered,map};
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
  if(action==='insert'){
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
    target.input=source.id;
  }else if(action==='param'){
    const target=find(details.id),key=details.key;
    if(!target||!TYPES[target.type].params.includes(key))
      throw Error('Selected node does not support '+key+'.');
    let value=details.value;
    if(key==='capEnds'){if(typeof value!=='boolean')throw Error('capEnds must be Boolean.');}
    else {
      if(typeof value!=='number'||!finite(value))throw Error('Non-finite Graph parameter.');
      const [lo,hi]=LIMITS[key];
      if(value<lo||value>hi||(key==='cornerMode'&&!Number.isInteger(value)))
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
    if(key==='cornerMode')return '<label>'+escapeHtml(key)+
      ' <select data-graph-param="'+key+'"><option value="0"'+(value===0?' selected':'')+
      '>Legacy</option><option value="1"'+(value===1?' selected':'')+'>Join &amp; Trim</option></select></label>';
    return '<label>'+escapeHtml(key)+' <input type="number" data-graph-param="'+key+
      '" min="'+min+'" max="'+max+'" step="any" value="'+value+'"></label>';
  }).join('');
  return '<strong>'+escapeHtml(n.id)+' · '+escapeHtml(n.type)+'</strong>'+
    (n.input?'<div class="spl-vg-source">Input: '+escapeHtml(n.input)+'</div>':'')+
    (rows?'<div class="spl-vg-params">'+rows+'</div>':'<div class="spl-vg-note">No editable properties.</div>');
}
module.exports={TYPES,LIMITS,STAGE,parseGraph,validateGraph,applyGraphEdit,
  parseLayout,moveGraphNode,cleanGraphLayout,renderGraphCanvas,renderNodeParameters};
