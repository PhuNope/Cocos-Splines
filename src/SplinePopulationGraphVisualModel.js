'use strict';
/** Inspector-only schema and immutable edit operations for the V1 typed chain.
 * The runtime compiler is authoritative; regression tests check schema parity.
 */
const n=(value,min,max,integer=false)=>({kind:'number',value,min,max,integer});
const b=value=>({kind:'boolean',value});
const e=(value,options)=>({kind:'enum',value,options});
const j=(value,validate)=>({kind:'json',value,validate});
const rec=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x,allowed)=>Object.keys(x).every(k=>allowed.includes(k));
const num=(x,a,z)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=z;
const vector=(x,limit)=>rec(x)&&keys(x,['x','y','z'])&&['x','y','z'].every(k=>num(x[k],-limit,limit));
const xyz=(x=0,y=0,z=0)=>({x,y,z});
const seed=()=>n(0,-2147483647,2147483647,true);
const array=(x,max,fn)=>Array.isArray(x)&&x.length<=max&&Array.from(x).every(fn);
const densityKeys=x=>array(x,64,k=>rec(k)&&keys(k,['progress','density'])&&num(k.progress,0,1)&&num(k.density,0,1))&&new Set(x.map(k=>k.progress)).size===x.length;
const exclusions=x=>array(x,64,k=>rec(k)&&keys(k,['startProgress','endProgress'])&&num(k.startProgress,0,1)&&num(k.endProgress,0,1));
const weights=x=>array(x,128,w=>num(w,0,10000))&&x.length>=1&&x.some(w=>w>0);
const node=(label,input,output,fields,required=[])=>({label,input,output,fields,required});
const TYPES={
 spline:node('Spline Source',null,'path',{slot:n(0,0,2,true)}),
 count:node('Count','path','candidates',{count:n(10,1,2048,true),includeEnd:b(true)},['count']),
 spacing:node('Fixed Spacing','path','candidates',{spacing:n(2,.001,10000),includeEnd:b(false)},['spacing']),
 random:node('Random','path','candidates',{count:n(10,1,2048,true),seed:seed()},['count']),
 jitter:node('Jittered','path','candidates',{count:n(10,1,2048,true),seed:seed(),jitter:n(1,0,1)},['count']),
 range:node('Progress Range','candidates','candidates',{startProgress:n(0,0,1),endProgress:n(1,0,1)},['startProgress','endProgress']),
 density:node('Density / Spacing','candidates','candidates',{density:n(1,0,1),seed:seed(),densityKeys:j([],densityKeys),exclusions:j([],exclusions),minWorldSpacing:n(0,0,10000)}),
 offset:node('Position Offset','candidates','candidates',{offset:j(xyz(),v=>vector(v,10000)),space:e('frame',['frame','world'])},['offset']),
 rotation:node('Random Rotation','candidates','candidates',{minDegrees:j(xyz(),v=>vector(v,360)),maxDegrees:j(xyz(),v=>vector(v,360)),seed:seed()},['minDegrees','maxDegrees']),
 scale:node('Random Scale','candidates','candidates',{minScale:n(1,.001,100),maxScale:n(1,.001,100),seed:seed()},['minScale','maxScale']),
 align:node('Alignment','candidates','candidates',{alignment:e('upright',['upright','surface','world'])},['alignment']),
 surface:node('Surface Projection','candidates','candidates',{rayHeight:n(5,0,10000),rayDepth:n(10,0,10000),surfaceOffset:n(0,-1000,1000),minNormalY:n(0,0,1),skipMissing:b(true)}),
 obstacle:node('Obstacle Filter','candidates','candidates',{clearance:n(0,0,10000),footprintRadius:n(0,0,100)}),
 prefab:node('Weighted Prefab','candidates','instances',{weights:j([1],weights),seed:seed()},['weights']),
 output:node('Instance Output','instances','instances',{}),
};
const clone=x=>JSON.parse(JSON.stringify(x));
const id=x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(x);
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const get=t=>has(TYPES,t)?TYPES[t]:null;
function validateField(field,value){
 if(field.kind==='number')return num(value,field.min,field.max)&&(!field.integer||Number.isInteger(value));
 if(field.kind==='boolean')return typeof value==='boolean';
 if(field.kind==='enum')return field.options.includes(value);
 return field.validate(value);
}
function validateNode(item){
 const d=rec(item)&&get(item.type);
 if(!d||!id(item.id)||!keys(item,['id','type',...(d.input?['input']:[]),...Object.keys(d.fields)])||
    (d.input&&!id(item.input)))throw Error('Invalid node, input or parameter: '+String(item?.id));
 for(const [key,f] of Object.entries(d.fields)){
  if(item[key]===undefined){if(d.required.includes(key))throw Error(item.id+': missing '+key);continue;}
  if(!validateField(f,item[key]))throw Error(item.id+': invalid '+key);
 }
 if(item.type==='rotation'&&['x','y','z'].some(k=>item.minDegrees[k]>item.maxDegrees[k]))throw Error('Rotation minimum exceeds maximum.');
 if(item.type==='scale'&&item.minScale>item.maxScale)throw Error('Scale minimum exceeds maximum.');
 if(item.type==='surface'&&(item.rayHeight??5)+(item.rayDepth??10)<=1e-6)throw Error('Surface ray range must be positive.');
}
function parse(text){
 if(typeof text!=='string'||text.length<2||text.length>16384)throw Error('Population Graph JSON must be 2–16384 characters.');
 const g=JSON.parse(text);
 if(!rec(g)||!keys(g,['version','nodes','output'])||g.version!==1||!id(g.output)||!Array.isArray(g.nodes)||g.nodes.length<4||g.nodes.length>32)throw Error('Population Graph V1 requires 4–32 nodes.');
 const map=new Map();
 for(const item of g.nodes){validateNode(item);if(map.has(item.id))throw Error('Duplicate node ID.');map.set(item.id,item);}
 if(map.get(g.output)?.type!=='output'||g.nodes.filter(n=>n.type==='output').length!==1)throw Error('Exactly one Output required.');
 const ordered=[],seen=new Set();let item=map.get(g.output);
 while(item){
  if(seen.has(item.id))throw Error('Cycle detected.');
  seen.add(item.id);ordered.unshift(item);
  const descriptor=get(item.type);
  if(!descriptor.input)break;
  const parent=map.get(item.input);
  if(!parent||parent.type==='output'||get(parent.type).output!==descriptor.input)throw Error('Missing or incompatible typed input.');
  item=parent;
 }
 if(ordered.length!==map.size)throw Error('Disconnected nodes.');
 return {version:1,nodes:ordered,output:g.output};
}
const FILTERS=Object.keys(TYPES).filter(t=>TYPES[t].input==='candidates'&&TYPES[t].output==='candidates');
const DISTRIBUTIONS=Object.keys(TYPES).filter(t=>TYPES[t].input==='path');
function defaults(type){const d=get(type);if(!d)throw Error('Unknown node type.');return clone(Object.fromEntries(Object.entries(d.fields).map(([k,f])=>[k,f.value])));}
function serialize(g){const text=JSON.stringify(g,null,2);parse(text);return text;}
function edit(text,action){
 const g=parse(text),nodes=g.nodes,i=nodes.findIndex(n=>n.id===action.id),current=nodes[i];
 if(!current)throw Error('Select a node.');
 switch(action.kind){
  case 'parameters':{
   const d=get(current.type),params=action.params;
   if(!rec(params)||!keys(params,Object.keys(d.fields)))throw Error('Unsupported parameter.');
   nodes[i]={id:current.id,type:current.type,...(current.input?{input:current.input}:{}),...clone(params)};
   break;
  }
  case 'distribution':{
   if(!DISTRIBUTIONS.includes(current.type)||!DISTRIBUTIONS.includes(action.type))throw Error('Only the distribution node can change distribution type.');
   nodes[i]={id:current.id,input:current.input,type:action.type,...defaults(action.type)};
   break;
  }
  case 'insert':{
   if(!FILTERS.includes(action.type)||get(current.type).output!=='candidates'||nodes.length>=32)throw Error('Insert requires a candidate output and available node budget.');
   let suffix=1;while(nodes.some(n=>n.id===action.type+suffix))suffix++;
   nodes.splice(i+1,0,{id:action.type+suffix,type:action.type,input:current.id,...defaults(action.type)});
   break;
  }
  case 'remove':
   if(!FILTERS.includes(current.type))throw Error('Only candidate filter/transform nodes can be removed.');
   nodes.splice(i,1);break;
  case 'move':{
   if(![-1,1].includes(action.delta)||!FILTERS.includes(current.type)||!FILTERS.includes(nodes[i+action.delta]?.type))throw Error('Only adjacent candidate nodes can be reordered.');
   [nodes[i],nodes[i+action.delta]]=[nodes[i+action.delta],nodes[i]];break;
  }
  default:throw Error('Unknown graph edit.');
 }
 // Rewire the chain atomically; no temporary disconnected graph is saved.
 for(let k=1;k<nodes.length;k++)nodes[k].input=nodes[k-1].id;
 return serialize(g);
}
module.exports={TYPES,FILTERS,DISTRIBUTIONS,parse,edit,defaults};
