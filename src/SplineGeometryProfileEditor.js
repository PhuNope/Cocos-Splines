'use strict';
/** Pure profile draft editing. Mirrors bounded runtime profile polygon rules. */
const FORMAT='cocos-splines/profile';
const MAX_POINTS=16;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function parseProfile(value){
 if(typeof value==='string'){
  if(value.length<2||value.length>8192)throw Error('Profile JSON must be <= 8 KiB.');
  try{value=JSON.parse(value);}catch{throw Error('Invalid Profile JSON syntax.');}
 }
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).some(k=>!['format','version','points','uv'].includes(k))||
    value.format!==FORMAT||value.version!==1||!Array.isArray(value.points)||
    value.points.length<3||value.points.length>MAX_POINTS)
  throw Error('Profile Asset requires cocos-splines/profile v1 with 3–16 points.');
 const points=value.points.map(p=>{
  if(!p||typeof p!=='object'||Array.isArray(p)||
     Object.keys(p).some(k=>!['x','y'].includes(k))||
     !finite(p.x)||!finite(p.y)||Math.abs(p.x)>1||Math.abs(p.y)>1)
   throw Error('Profile point must have finite x/y in [-1,1].');
  return {x:p.x,y:p.y};
 });
 const epsilon=1e-8,n=points.length;
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 const on=(a,b,p)=>Math.abs(cross(a,b,p))<=epsilon&&
  p.x>=Math.min(a.x,b.x)-epsilon&&p.x<=Math.max(a.x,b.x)+epsilon&&
  p.y>=Math.min(a.y,b.y)-epsilon&&p.y<=Math.max(a.y,b.y)+epsilon;
 const intersect=(a,b,c,d)=>{
  const v=[cross(a,b,c),cross(a,b,d),cross(c,d,a),cross(c,d,b)];
  return on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)||
   (((v[0]>epsilon&&v[1]<-epsilon)||(v[0]<-epsilon&&v[1]>epsilon))&&
    ((v[2]>epsilon&&v[3]<-epsilon)||(v[2]<-epsilon&&v[3]>epsilon)));
 };
 let area=0;
 for(let i=0;i<n;i++){
  const a=points[i],b=points[(i+1)%n],c=points[(i+2)%n];
  if(Math.hypot(b.x-a.x,b.y-a.y)<.0001||Math.abs(cross(a,b,c))<=epsilon)
   throw Error('Profile polygon has zero-length or collinear edges.');
  area+=a.x*b.y-b.x*a.y;
  for(let j=i+1;j<n;j++){
   if(j===i+1||(i===0&&j===n-1))continue;
   if(intersect(a,b,points[j],points[(j+1)%n]))
    throw Error('Profile polygon self-intersects.');
  }
 }
 if(area<=.0002)throw Error('Profile polygon must be counter-clockwise (CCW).');
 if(!Object.prototype.hasOwnProperty.call(value,'uv'))
  return {format:FORMAT,version:1,points};
 const raw=value.uv;
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).some(k=>!['seamEdge','edgeWeights','uMetersPerRepeat','uFollowFrameScale','uWorldSpace','sideIslandMode','atlasPacking','atlasPadding'].includes(k)))
  throw Error('Profile UV must have only seamEdge and edgeWeights.');
 const uv={};
 if(Object.prototype.hasOwnProperty.call(raw,'seamEdge')){
  if(!Number.isInteger(raw.seamEdge)||raw.seamEdge<0||raw.seamEdge>=points.length)
   throw Error('Profile UV seamEdge must be an existing edge index.');
  uv.seamEdge=raw.seamEdge;
 }
 if(Object.prototype.hasOwnProperty.call(raw,'edgeWeights')){
  if(!Array.isArray(raw.edgeWeights)||raw.edgeWeights.length!==points.length||
     raw.edgeWeights.some(w=>!finite(w)||w<.25||w>4))
   throw Error('Profile UV edgeWeights must be 0.25–4 for each polygon edge.');
  uv.edgeWeights=raw.edgeWeights.slice();
 }
 if(Object.prototype.hasOwnProperty.call(raw,'uMetersPerRepeat')){
  if(!finite(raw.uMetersPerRepeat)||raw.uMetersPerRepeat<.01||
     raw.uMetersPerRepeat>10000)
   throw Error('Profile UV uMetersPerRepeat must be within [0.01,10000].');
  uv.uMetersPerRepeat=raw.uMetersPerRepeat;
 }
 if(Object.prototype.hasOwnProperty.call(raw,'uFollowFrameScale')){
  if(typeof raw.uFollowFrameScale!=='boolean'||
     (raw.uFollowFrameScale&&uv.uMetersPerRepeat===undefined))
   throw Error('Profile UV uFollowFrameScale requires boolean and metric Side U meters/repeat when enabled.');
  uv.uFollowFrameScale=raw.uFollowFrameScale;
 }
 if(Object.prototype.hasOwnProperty.call(raw,'uWorldSpace')){
  if(typeof raw.uWorldSpace!=='boolean'||
     (raw.uWorldSpace&&uv.uMetersPerRepeat===undefined))
   throw Error('Profile UV uWorldSpace requires boolean and metric Side U meters/repeat when enabled.');
  uv.uWorldSpace=raw.uWorldSpace;
 }
 if(Object.prototype.hasOwnProperty.call(raw,'sideIslandMode')){
  if(!Number.isInteger(raw.sideIslandMode)||
     raw.sideIslandMode<0||raw.sideIslandMode>2)
   throw Error('Profile UV sideIslandMode must be an integer 0–2.');
  uv.sideIslandMode=raw.sideIslandMode;
 }
 if(Object.prototype.hasOwnProperty.call(raw,'atlasPacking')){
  if(typeof raw.atlasPacking!=='boolean')
   throw Error('Profile UV atlasPacking must be boolean.');
  uv.atlasPacking=raw.atlasPacking;
 }
 if(Object.prototype.hasOwnProperty.call(raw,'atlasPadding')){
  if(!finite(raw.atlasPadding)||raw.atlasPadding<0||raw.atlasPadding>.2||
     uv.atlasPacking!==true)
   throw Error('Profile UV atlasPadding requires enabled atlasPacking and a value in [0,0.2].');
  uv.atlasPadding=raw.atlasPadding;
 }
 return {format:FORMAT,version:1,points,uv};
}
const formatProfile=value=>JSON.stringify(parseProfile(value),null,2)+'\n';
const round=v=>Math.round(v*10000)/10000;
function applyProfileEdit(value,action,params={}){
 const profile=parseProfile(value),p=profile.points,index=Number(params.index);
 if(!['reset-uv','set-u-meters-per-repeat','clear-u-meters-per-repeat','set-u-follow-frame-scale','set-u-world-space','set-side-island-mode','set-atlas-packing','set-atlas-padding','clear-atlas-padding'].includes(action)&&
    (!Number.isInteger(index)||index<0||index>=p.length))
  throw Error('Select a valid Profile point index.');
 const insertedUv=at=>{
  if(!profile.uv)return;
  if(profile.uv.edgeWeights){
   const weight=profile.uv.edgeWeights[at];
   profile.uv.edgeWeights.splice(at+1,0,weight);
  }
  if(profile.uv.seamEdge!==undefined&&profile.uv.seamEdge>at)
   profile.uv.seamEdge++;
 };
 const removedUv=(at,oldLength)=>{
  if(!profile.uv)return;
  if(profile.uv.edgeWeights)profile.uv.edgeWeights.splice(at,1);
  if(profile.uv.seamEdge!==undefined){
   const seam=profile.uv.seamEdge;
   const surviving=seam===at?(at+oldLength-1)%oldLength:seam;
   profile.uv.seamEdge=surviving>at?surviving-1:surviving;
  }
 };
 if(action==='reset-uv'){
  delete profile.uv;
 }else if(action==='set-side-island-mode'){
  const mode=params.mode;
  if(!Number.isInteger(mode)||mode<0||mode>2)
   throw Error('Profile UV sideIslandMode must be an integer 0–2.');
  if(mode===0){
   if(profile.uv){
    delete profile.uv.sideIslandMode;
    if(Object.keys(profile.uv).length===0)delete profile.uv;
   }
  }else{
   profile.uv=profile.uv||{};
   profile.uv.sideIslandMode=mode;
  }
 }else if(action==='set-atlas-packing'){
  if(typeof params.enabled!=='boolean')
   throw Error('Profile UV Atlas packing requires boolean enabled.');
  if(params.enabled){
   profile.uv=profile.uv||{};
   profile.uv.atlasPacking=true;
  }else if(profile.uv){
   delete profile.uv.atlasPacking;
   delete profile.uv.atlasPadding;
   if(Object.keys(profile.uv).length===0)delete profile.uv;
  }
 }else if(action==='set-atlas-padding'){
  if(!finite(params.padding)||params.padding<0||params.padding>.2||
     profile.uv?.atlasPacking!==true)
   throw Error('Profile UV Atlas padding requires enabled Atlas and [0,0.2].');
  profile.uv.atlasPadding=round(params.padding);
 }else if(action==='clear-atlas-padding'){
  if(profile.uv){
   delete profile.uv.atlasPadding;
   if(Object.keys(profile.uv).length===0)delete profile.uv;
  }
 }else if(action==='set-u-meters-per-repeat'){
  const value=params.meters;
  if(value===''||!finite(value)||value<.01||value>10000)
   throw Error('Profile UV side U meters/repeat must be within [0.01,10000].');
  profile.uv=profile.uv||{};
  profile.uv.uMetersPerRepeat=round(value);
 }else if(action==='clear-u-meters-per-repeat'){
  if(profile.uv){
   delete profile.uv.uMetersPerRepeat;
   delete profile.uv.uFollowFrameScale;
   delete profile.uv.uWorldSpace;
   if(Object.keys(profile.uv).length===0)delete profile.uv;
  }
 }else if(action==='set-u-follow-frame-scale'){
  if(typeof params.enabled!=='boolean')
   throw Error('Profile UV Follow Frame Scale requires a boolean.');
  if(params.enabled&&!profile.uv?.uMetersPerRepeat)
   throw Error('Profile UV Follow Frame Scale requires Side U meters/repeat.');
  if(params.enabled)profile.uv.uFollowFrameScale=true;
  else if(profile.uv){
   delete profile.uv.uFollowFrameScale;
   if(Object.keys(profile.uv).length===0)delete profile.uv;
  }
 }else if(action==='set-u-world-space'){
  if(typeof params.enabled!=='boolean')
   throw Error('Profile UV World-space U requires a boolean.');
  if(params.enabled&&!profile.uv?.uMetersPerRepeat)
   throw Error('Profile UV World-space U requires Side U meters/repeat.');
  if(params.enabled){
   profile.uv=profile.uv||{};
   profile.uv.uWorldSpace=true;
  }else if(profile.uv){
   delete profile.uv.uWorldSpace;
   if(Object.keys(profile.uv).length===0)delete profile.uv;
  }
 }else if(action==='set-uv-seam'){
  profile.uv=profile.uv||{};
  profile.uv.seamEdge=index;
 }else if(action==='set-edge-weight'){
  const weight=Number(params.weight);
  if(params.weight===''||!finite(weight)||weight<.25||weight>4)
   throw Error('Profile UV edge weight must be within [0.25,4].');
  profile.uv=profile.uv||{};
  if(!profile.uv.edgeWeights)profile.uv.edgeWeights=p.map(()=>1);
  profile.uv.edgeWeights[index]=round(weight);
 }else if(action==='move'){
  const x=Number(params.x),y=Number(params.y);
  if(!finite(x)||!finite(y))throw Error('Profile coordinates must be finite.');
  p[index]={x:round(x),y:round(y)};
 }else if(action==='move-edge'){
  const dx=Number(params.dx),dy=Number(params.dy);
  if(!finite(dx)||!finite(dy)||Math.abs(dx)>2||Math.abs(dy)>2)
   throw Error('Profile edge translation requires finite dx/dy within [-2,2].');
  const next=(index+1)%p.length;
  // Preserve the edge direction and length exactly until coordinate rounding;
  // invalid winding/overlap/out-of-bounds rejects the entire draft transaction.
  p[index]={x:round(p[index].x+dx),y:round(p[index].y+dy)};
  p[next]={x:round(p[next].x+dx),y:round(p[next].y+dy)};
 }else if(action==='insert-edge'){
  if(p.length>=MAX_POINTS)throw Error('Profile supports up to 16 points.');
  const t=params.t===undefined?.5:params.t;
  const offset=params.offset===undefined?.12:params.offset;
  if(!finite(t)||t<.1||t>.9||!finite(offset)||offset<-.4||offset>.4)
   throw Error('Profile edge insertion requires t in [0.1,0.9] and offset within [-0.4,0.4].');
  const a=p[index],b=p[(index+1)%p.length],dx=b.x-a.x,dy=b.y-a.y;
  const length=Math.hypot(dx,dy);
  // Outward is the right-hand normal of a CCW contour. A nonzero offset is
  // required because the runtime rejects collinear edges/zero-area cap ears.
  if(length<.0001||Math.abs(offset*length)<.0001)
   throw Error('Profile edge insertion requires a nondegenerate non-collinear point.');
  p.splice(index+1,0,{x:round(a.x+dx*t+dy*offset),
   y:round(a.y+dy*t-dx*offset)});
  insertedUv(index);
 }else if(action==='remove'){
  if(p.length<=3)throw Error('Profile requires at least three points.');
  const oldLength=p.length;
  p.splice(index,1);removedUv(index,oldLength);
 }else if(action==='insert'){
  if(p.length>=MAX_POINTS)throw Error('Profile supports up to 16 points.');
  const a=p[index],b=p[(index+1)%p.length],dx=b.x-a.x,dy=b.y-a.y;
  p.splice(index+1,0,{x:round((a.x+b.x)/2+dy*.12),y:round((a.y+b.y)/2-dx*.12)});
  insertedUv(index);
 }else throw Error('Unknown Profile edit action.');
 return formatProfile(profile);
}
function renderProfileControls(value,selected=0,selectedEdge=null){
 const profile=parseProfile(value),points=profile.points,pt=points[selected]||points[0];
 const map=point=>String(round(120+point.x*104))+','+String(round(120-point.y*104));
 const polygon=points.map(map).join(' ');
 // Wider invisible line targets enable selecting/dragging an entire edge.
 // Midpoint dots communicate edge interaction; coordinates are generated
 // only from bounded numeric polygon data, never user-provided SVG/HTML.
 const edges=points.map((point,i)=>{
  const a=map(point).split(','),b=map(points[(i+1)%points.length]).split(',');
  const mx=round((Number(a[0])+Number(b[0]))/2);
  const my=round((Number(a[1])+Number(b[1]))/2);
  return '<line data-profile-edge="'+i+'" x1="'+a[0]+'" y1="'+a[1]+
   '" x2="'+b[0]+'" y2="'+b[1]+'" stroke="transparent" stroke-width="16" '+
   'role="button" tabindex="0" aria-label="Profile edge '+(i+1)+'"/>'+
   '<circle data-profile-edge="'+i+'" cx="'+mx+'" cy="'+my+'" r="'+
   (selectedEdge===i?6:4)+'" fill="'+
   (selectedEdge===i?'#ffca76':profile.uv?.seamEdge===i?'#f49bb7':'#a7f0bb')+'" stroke="#142a37" stroke-width="1.5"/>';
 }).join('');
 const circles=points.map((point,i)=>{
  const [x,y]=map(point).split(',');
  return '<circle data-profile-point="'+i+'" cx="'+x+'" cy="'+y+
   '" r="'+(i===selected?7:5)+'" role="button" tabindex="0" '+
   'aria-label="Profile point '+(i+1)+'" fill="'+(i===selected?'#ffca76':'#7ad4e6')+
   '" stroke="#172c37" stroke-width="1.5"/>';
 }).join('');
 const svg='<svg viewBox="0 0 240 240" width="100%" height="240" '+
  'style="max-width:300px;display:block;touch-action:none;background:#142a37;border-radius:6px" '+
  'role="img" aria-label="Profile polygon: select and drag point handles">'+
  '<path d="M120 0 V240 M0 120 H240" stroke="#345365" fill="none"/>'+
  '<polygon points="'+polygon+'" fill="#42637d" fill-opacity=".5" stroke="#8de1ed" stroke-width="2"/>'+
  edges+circles+'</svg>';
 return '<div class="spl-profile-count">'+points.length+' CCW points · selected #'+(selected+1)+
  (selectedEdge===null?'':' · edge #'+(selectedEdge+1)+' selected')+'</div>'+
  svg+'<div class="spl-profile-coordinates">'+
  '<label>X <input type="number" class="spl-profile-x" min="-1" max="1" step="0.01" value="'+pt.x+'"></label>'+
  '<label>Y <input type="number" class="spl-profile-y" min="-1" max="1" step="0.01" value="'+pt.y+'"></label></div>'+
  '<div class="spl-vg-toolbar">'+
  '<button type="button" class="spl-btn spl-profile-insert">Add point after selection</button>'+
  '<button type="button" class="spl-btn spl-profile-insert-edge"'+
   (selectedEdge===null||points.length>=MAX_POINTS?' disabled':'')+
   '>Insert at selected edge</button>'+
  '<button type="button" class="spl-btn spl-profile-remove"'+(points.length<=3?' disabled':'')+
  '>Remove selected point</button></div>'+
  '<div class="spl-profile-uv-controls">'+
  '<div class="spl-profile-uv-info">UV0 side bands · '+
   (profile.uv===undefined?'Default perimeter mapping':
    'Custom mapping · seam edge #'+((profile.uv.seamEdge??0)+1))+
   ' · selected edge #'+(selectedEdge===null?'—':selectedEdge+1)+
   ' · U mode: '+(profile.uv?.uMetersPerRepeat===undefined?
    'Normalized perimeter':(profile.uv?.uWorldSpace?'World-space':
     profile.uv?.uFollowFrameScale?'Frame-local':'Nominal')+
     ' meters, repeat every '+profile.uv.uMetersPerRepeat+' m')+
   '</div>'+
  '<div class="spl-vg-toolbar">'+
  '<label>Side UV islands <select class="spl-profile-uv-island-mode" '+
   'title="Select UV island layout">'+
   ['Continuous perimeter (legacy)','Edge Islands · U per edge','Quad Islands · U/V per face']
    .map((name,i)=>'<option value="'+i+'"'+
     ((profile.uv?.sideIslandMode??0)===i?' selected':'')+'>'+name+'</option>')
    .join('')+'</select></label>'+
  '</div>'+
  '<div class="spl-vg-toolbar">'+
  '<label title="Fit side and cap UV0 islands into [0,1]">'+
   '<input type="checkbox" class="spl-profile-uv-atlas"'+
    (profile.uv?.atlasPacking===true?' checked':'')+
    '> Pack UV0 islands into atlas</label>'+
   '<label title="Island gutter (0–0.2)">'+
    'Atlas padding <input type="number" class="spl-profile-uv-padding" '+
    'min="0" max="0.2" step="0.005" placeholder="0.04" value="'+
    (profile.uv?.atlasPadding??'')+'"'+
    (profile.uv?.atlasPacking===true?'':' disabled')+'></label></div>'+

   '<div class="spl-vg-toolbar">'+
   '<label>Side U meters/repeat <input type="number" class="spl-profile-uv-meters" '+
   'min="0.01" max="10000" step="0.1" placeholder="Normalized" value="'+
   (profile.uv?.uMetersPerRepeat??'')+'"></label>'+
  '<button type="button" class="spl-btn spl-profile-clear-uv-meters"'+
   (profile.uv?.uMetersPerRepeat===undefined?' disabled':'')+
   '>Use Normalized U</button>'+
  '<label title="Scale U with spline width">'+
   '<input type="checkbox" class="spl-profile-uv-follow-frame"'+
   (profile.uv?.uFollowFrameScale===true?' checked':'')+
   (profile.uv?.uMetersPerRepeat===undefined?' disabled':'')+
   '> Follow taper / frame scale</label>'+
  '<label title="Use world-space edge lengths for U">'+
   '<input type="checkbox" class="spl-profile-uv-world-space"'+
   (profile.uv?.uWorldSpace===true?' checked':'')+
   (profile.uv?.uMetersPerRepeat===undefined?' disabled':'')+
   '> World-space side U (Node scale)</label></div>'+
  '<div class="spl-vg-toolbar">'+
  '<label>Edge UV weight <input type="number" class="spl-profile-uv-weight" '+
   'min="0.25" max="4" step="0.05" value="'+
   (selectedEdge===null?1:profile.uv?.edgeWeights?.[selectedEdge]??1)+
   '"'+(selectedEdge===null?' disabled':'')+'></label>'+
  '<button type="button" class="spl-btn spl-profile-set-uv-seam"'+
   (selectedEdge===null?' disabled':'')+'>Set UV seam at selected edge</button>'+
  '<button type="button" class="spl-btn spl-profile-reset-uv"'+
   (profile.uv===undefined?' disabled':'')+'>Reset UV mapping</button></div></div>';
}
module.exports={FORMAT,MAX_POINTS,parseProfile,formatProfile,applyProfileEdit,renderProfileControls};
