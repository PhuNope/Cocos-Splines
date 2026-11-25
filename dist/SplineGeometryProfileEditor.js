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
    Object.keys(value).some(k=>!['format','version','points'].includes(k))||
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
 return {format:FORMAT,version:1,points};
}
const formatProfile=value=>JSON.stringify(parseProfile(value),null,2)+'\n';
const round=v=>Math.round(v*10000)/10000;
function applyProfileEdit(value,action,params={}){
 const profile=parseProfile(value),p=profile.points,index=Number(params.index);
 if(!Number.isInteger(index)||index<0||index>=p.length)
  throw Error('Select a valid Profile point index.');
 if(action==='move'){
  const x=Number(params.x),y=Number(params.y);
  if(!finite(x)||!finite(y))throw Error('Profile coordinates must be finite.');
  p[index]={x:round(x),y:round(y)};
 }else if(action==='remove'){
  if(p.length<=3)throw Error('Profile requires at least three points.');
  p.splice(index,1);
 }else if(action==='insert'){
  if(p.length>=MAX_POINTS)throw Error('Profile supports up to 16 points.');
  const a=p[index],b=p[(index+1)%p.length],dx=b.x-a.x,dy=b.y-a.y;
  p.splice(index+1,0,{x:round((a.x+b.x)/2+dy*.12),y:round((a.y+b.y)/2-dx*.12)});
 }else throw Error('Unknown Profile edit action.');
 return formatProfile(profile);
}
function renderProfileControls(value,selected=0){
 const points=parseProfile(value).points,pt=points[selected]||points[0];
 const map=point=>String(round(120+point.x*104))+','+String(round(120-point.y*104));
 const polygon=points.map(map).join(' ');
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
  circles+'</svg>';
 return '<div class="spl-profile-count">'+points.length+' CCW points · selected #'+(selected+1)+'</div>'+
  svg+'<div class="spl-profile-coordinates">'+
  '<label>X <input type="number" class="spl-profile-x" min="-1" max="1" step="0.01" value="'+pt.x+'"></label>'+
  '<label>Y <input type="number" class="spl-profile-y" min="-1" max="1" step="0.01" value="'+pt.y+'"></label></div>'+
  '<div class="spl-vg-toolbar">'+
  '<button type="button" class="spl-btn spl-profile-insert">Add point after selection</button>'+
  '<button type="button" class="spl-btn spl-profile-remove"'+(points.length<=3?' disabled':'')+
  '>Remove selected point</button></div>';
}
module.exports={FORMAT,MAX_POINTS,parseProfile,formatProfile,applyProfileEdit,renderProfileControls};
