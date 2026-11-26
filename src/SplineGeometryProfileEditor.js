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
    Object.keys(value).some(k=>!['format','version','points','holes','outerContours','uv'].includes(k))||
    value.format!==FORMAT||value.version!==1||!Array.isArray(value.points)||
    value.points.length<3||value.points.length>MAX_POINTS)
  throw Error('Profile Asset requires cocos-splines/profile v1 with 3–16 points.');
 const readPoint=p=>{
  if(!p||typeof p!=='object'||Array.isArray(p)||
     Object.keys(p).some(k=>!['x','y'].includes(k))||
     !finite(p.x)||!finite(p.y)||Math.abs(p.x)>1||Math.abs(p.y)>1)
   throw Error('Profile point must have finite x/y in [-1,1].');
  return {x:p.x,y:p.y};
 };
 const points=value.points.map(readPoint);
 const epsilon=1e-8;
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
 const validateRing=(points,hole=false)=>{
 let area=0;const n=points.length;
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
 if(hole?area>=-.0002:area<=.0002)
  throw Error(hole?'Profile hole must be clockwise (CW).':'Profile polygon must be counter-clockwise (CCW).');
 };
 validateRing(points);
 let holes;
 if(Object.prototype.hasOwnProperty.call(value,'holes')){
  if(!Array.isArray(value.holes)||value.holes.length<1||value.holes.length>3)
   throw Error('Profile holes requires 1–3 clockwise contours.');
  holes=value.holes.map(loop=>{
   if(!Array.isArray(loop)||loop.length<3||loop.length>MAX_POINTS)
    throw Error('Profile hole requires 3–16 points.');
   const ring=loop.map(readPoint);validateRing(ring,true);return ring;
  });
  const inside=(p,ring)=>{
   let result=false;
   for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];
    if(on(a,b,p))return false;
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)
     result=!result;
   }
   return result;
  };
  const rings=[points,...holes];
  for(let i=1;i<rings.length;i++){
   const ring=rings[i];
   if(!ring.every(p=>inside(p,points)))
    throw Error('Profile hole must be strictly inside outer contour.');
   for(let j=0;j<i;j++){
    const other=rings[j];
    for(let a=0;a<ring.length;a++)for(let b=0;b<other.length;b++)
     if(intersect(ring[a],ring[(a+1)%ring.length],other[b],other[(b+1)%other.length]))
      throw Error('Profile contours intersect or touch.');
    if(j>0&&(inside(ring[0],other)||inside(other[0],ring)))
     throw Error('Profile holes overlap or are nested.');
   }
  }
 }
 let outerContours;
 if(Object.prototype.hasOwnProperty.call(value,'outerContours')){
  if(!Array.isArray(value.outerContours)||value.outerContours.length<1||value.outerContours.length>3)
   throw Error('Profile outerContours requires 1–3 additional CCW contours.');
  outerContours=value.outerContours.map(loop=>{
   if(!Array.isArray(loop)||loop.length<3||loop.length>MAX_POINTS)
    throw Error('Profile outer contour requires 3–16 points.');
   const ring=loop.map(readPoint);validateRing(ring);return ring;
  });
  const inside=(p,ring)=>{
   let result=false;
   for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];
    if(on(a,b,p))return false;
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;
   }
   return result;
  };
  const outers=[points,...outerContours];
  for(let i=1;i<outers.length;i++)for(let j=0;j<i;j++){
   const a=outers[i],b=outers[j];
   if(inside(a[0],b)||inside(b[0],a)||
      a.some((p,k)=>b.some((q,l)=>intersect(p,a[(k+1)%a.length],q,b[(l+1)%b.length]))))
    throw Error('Profile outer contours must be disjoint and not nested.');
  }
 }
 const contours={...(holes?{holes}:{}),...(outerContours?{outerContours}:{})};
 if(!Object.prototype.hasOwnProperty.call(value,'uv'))
  return {format:FORMAT,version:1,points,...contours};
 const raw=value.uv;
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).some(k=>!['seamEdge','edgeWeights','uMetersPerRepeat','uFollowFrameScale','uWorldSpace','sideIslandMode','atlasPacking','atlasPadding','atlasRotate','atlasPixelPadding','triangleUnwrap'].includes(k)))
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
 if(Object.prototype.hasOwnProperty.call(raw,'atlasRotate')){
  if(typeof raw.atlasRotate!=='boolean'||uv.atlasPacking!==true)
   throw Error('Profile UV atlasRotate requires enabled atlasPacking and a boolean.');
  uv.atlasRotate=raw.atlasRotate;
 }
 if(Object.prototype.hasOwnProperty.call(raw,'atlasPixelPadding')){
  const p=raw.atlasPixelPadding;
  if(uv.atlasPacking!==true||!p||typeof p!=='object'||Array.isArray(p)||
     Object.keys(p).some(k=>k!=='resolution'&&k!=='pixels')||
     !Number.isInteger(p.resolution)||p.resolution<16||p.resolution>16384||
     !Number.isInteger(p.pixels)||p.pixels<0||p.pixels>64||2*p.pixels>=p.resolution)
   throw Error('Profile UV atlasPixelPadding requires Atlas, resolution 16–16384 and pixels 0–64 with room for gutters.');
  uv.atlasPixelPadding={resolution:p.resolution,pixels:p.pixels};
 }
 if(Object.prototype.hasOwnProperty.call(raw,'triangleUnwrap')){
  if(typeof raw.triangleUnwrap!=='boolean')
   throw Error('Profile UV triangleUnwrap must be boolean.');
  uv.triangleUnwrap=raw.triangleUnwrap;
 }
 return {format:FORMAT,version:1,points,...contours,uv};
}
const formatProfile=value=>JSON.stringify(parseProfile(value),null,2)+'\n';
const round=v=>Math.round(v*10000)/10000;
const getProfileContours=profile=>[profile.points,...(profile.holes??[]),...(profile.outerContours??[])];
function applyProfileEdit(value,action,params={}){
 const profile=parseProfile(value),index=Number(params.index);
 const geometryActions=['move','move-edge','insert','insert-edge','remove'];
 const contour=geometryActions.includes(action)?(params.contour??0):0;
 const rings=getProfileContours(profile);
 if(!Number.isInteger(contour)||contour<0||contour>=rings.length)
  throw Error('Select a valid contour.');
 const p=rings[contour];
 if(!['reset-uv','set-u-meters-per-repeat','clear-u-meters-per-repeat','set-u-follow-frame-scale','set-u-world-space','set-side-island-mode','set-atlas-packing','set-atlas-padding','clear-atlas-padding','set-triangle-unwrap','set-atlas-rotate','set-atlas-pixel-padding','clear-atlas-pixel-padding','set-holes','add-hole','remove-hole','set-outer-contours','add-outer','remove-outer'].includes(action)&&
    (!Number.isInteger(index)||index<0||index>=p.length))
  throw Error('Select a valid Profile point index.');
 const insertedUv=at=>{
  if(contour!==0||!profile.uv)return;
  if(profile.uv.edgeWeights){
   const weight=profile.uv.edgeWeights[at];
   profile.uv.edgeWeights.splice(at+1,0,weight);
  }
  if(profile.uv.seamEdge!==undefined&&profile.uv.seamEdge>at)
   profile.uv.seamEdge++;
 };
 const removedUv=(at,oldLength)=>{
  if(contour!==0||!profile.uv)return;
  if(profile.uv.edgeWeights)profile.uv.edgeWeights.splice(at,1);
  if(profile.uv.seamEdge!==undefined){
   const seam=profile.uv.seamEdge;
   const surviving=seam===at?(at+oldLength-1)%oldLength:seam;
   profile.uv.seamEdge=surviving>at?surviving-1:surviving;
  }
 };
 if(action==='add-hole'||action==='add-outer'){
  const key=action==='add-hole'?'holes':'outerContours';
  if((profile[key]?.length??0)>=3)throw Error(key==='holes'?'Profile supports up to three holes.':'Profile supports up to three additional outer contours.');
  // Find a valid small CW square, preferring the center and larger sizes.
  // Each candidate passes the same containment/intersection validation.
  const centers=[];
  for(let y=-.9;y<=.90001;y+=.1)for(let x=-.9;x<=.90001;x+=.1)
   centers.push({x:round(x),y:round(y)});
  centers.sort((a,b)=>a.x*a.x+a.y*a.y-b.x*b.x-b.y*b.y||a.x-b.x||a.y-b.y);
  for(const radius of [.1,.05,.025]){
   for(const {x,y} of centers){
    const ring=[{x:round(x-radius),y:round(y-radius)},
     {x:round(x-radius),y:round(y+radius)},
     {x:round(x+radius),y:round(y+radius)},
     {x:round(x+radius),y:round(y-radius)}];
    if(key==='outerContours')ring.reverse();
    try{return formatProfile({...profile,[key]:[...(profile[key]??[]),ring]});}
    catch{/* Try another location. */}
   }
  }
  throw Error('No room for a new contour. Adjust the profile.');
 }else if(action==='remove-hole'){
  const hole=params.hole;
  if(!Number.isInteger(hole)||hole<0||hole>=(profile.holes?.length??0))
   throw Error('Select a hole to remove.');
  profile.holes.splice(hole,1);
  if(!profile.holes.length)delete profile.holes;
 }else if(action==='remove-outer'){
  const part=params.part;
  if(!Number.isInteger(part)||part<0||part>=(profile.outerContours?.length??0))throw Error('Select an additional outer contour.');
  profile.outerContours.splice(part,1);
  if(!profile.outerContours.length)delete profile.outerContours;
 }else if(action==='set-outer-contours'){
  if(!Array.isArray(params.outerContours))throw Error('Profile outerContours must be an array.');
  if(params.outerContours.length===0)delete profile.outerContours;
  else profile.outerContours=params.outerContours;
 }else if(action==='set-holes'){
  if(!Array.isArray(params.holes))throw Error('Profile holes must be an array.');
  if(params.holes.length===0)delete profile.holes;
  else profile.holes=params.holes;
 }else if(action==='reset-uv'){
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
 }else if(action==='set-triangle-unwrap'){
  if(typeof params.enabled!=='boolean')
   throw Error('Profile UV Triangle Unwrap requires boolean enabled.');
  if(params.enabled){
   profile.uv=profile.uv||{};
   profile.uv.triangleUnwrap=true;
  }else if(profile.uv){
   delete profile.uv.triangleUnwrap;
   if(Object.keys(profile.uv).length===0)delete profile.uv;
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
   delete profile.uv.atlasRotate;
   delete profile.uv.atlasPixelPadding;
   if(Object.keys(profile.uv).length===0)delete profile.uv;
  }
 }else if(action==='set-atlas-rotate'){
  if(profile.uv?.atlasPacking!==true||typeof params.enabled!=='boolean')
   throw Error('Profile UV Atlas rotation requires enabled Atlas and boolean.');
  if(params.enabled)profile.uv.atlasRotate=true;
  else delete profile.uv.atlasRotate;
 }else if(action==='set-atlas-pixel-padding'){
  if(profile.uv?.atlasPacking!==true)
   throw Error('Profile UV pixel padding requires enabled Atlas.');
  profile.uv.atlasPixelPadding={resolution:params.resolution,pixels:params.pixels};
 }else if(action==='clear-atlas-pixel-padding'){
  if(profile.uv)delete profile.uv.atlasPixelPadding;
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
function renderProfileControls(value,selected=0,selectedEdge=null,contour=0){
 const profile=parseProfile(value);
 const rings=getProfileContours(profile);
 const holeCount=profile.holes?.length??0,outerCount=profile.outerContours?.length??0;
 if(!Number.isInteger(contour)||contour<0||contour>=rings.length)contour=0;
 const points=rings[contour],pt=points[selected]||points[0];
 const map=point=>String(round(120+point.x*104))+','+String(round(120-point.y*104));
 const polygon=profile.points.map(map).join(' ');
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
   (selectedEdge===i?'#ffca76':contour===0&&profile.uv?.seamEdge===i?'#f49bb7':'#a7f0bb')+'" stroke="#142a37" stroke-width="1.5"/>';
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
  (profile.outerContours??[]).map(ring=>'<polygon points="'+ring.map(map).join(' ')+'" fill="#42637d" fill-opacity=".5" stroke="#8de1ed" stroke-width="2"/>').join('')+
  (profile.holes??[]).map(ring=>'<polygon points="'+ring.map(map).join(' ')+'" fill="#142a37" stroke="#f3bb78" stroke-width="2"/>').join('')+
  edges+circles+'</svg>';
 return '<div class="spl-vg-toolbar"><label>Contour <select class="spl-profile-contour">'+
  rings.map((ring,i)=>'<option value="'+i+'"'+(i===contour?' selected':'')+'>'+
   (i===0?'Outer 1':i<=holeCount?'Hole '+i:'Outer '+(i-holeCount+1))+'</option>').join('')+'</select></label>'+
  '<button type="button" class="spl-btn spl-profile-add-hole"'+(holeCount>=3?' disabled':'')+'>Add hole</button>'+
  '<button type="button" class="spl-btn spl-profile-remove-hole"'+(contour===0||contour>holeCount?' disabled':'')+'>Remove hole</button>'+
  '<button type="button" class="spl-btn spl-profile-add-outer"'+(outerCount>=3?' disabled':'')+'>Add outer</button>'+
  '<button type="button" class="spl-btn spl-profile-remove-outer"'+(contour<=holeCount?' disabled':'')+'>Remove outer</button></div>'+
  '<div class="spl-profile-count">'+points.length+(contour>0&&contour<=holeCount?' CW':' CCW')+' points · selected #'+(selected+1)+
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
  '<div class="spl-vg-toolbar"><label>Inner contours ('+(profile.holes?.length??0)+')</label></div>'+
  '<details><summary>Hole JSON</summary><textarea class="spl-profile-holes" rows="3" style="width:100%;box-sizing:border-box" aria-label="Clockwise hole contours JSON">'+
  JSON.stringify(profile.holes??[])+'</textarea></details>'+
  '<details><summary>Outer contours JSON</summary><textarea class="spl-profile-outer-contours" rows="3" style="width:100%;box-sizing:border-box">'+JSON.stringify(profile.outerContours??[])+'</textarea></details>'+
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
  '<label title="Independent UV0 for every triangle; geometry and normals unchanged">'+
   '<input type="checkbox" class="spl-profile-uv-triangle-unwrap"'+
    (profile.uv?.triangleUnwrap===true?' checked':'')+
    '> Per-triangle UV unwrap</label></div>'+
  '<div class="spl-vg-toolbar">'+
  '<label title="Fit side and cap UV0 islands into [0,1]">'+
   '<input type="checkbox" class="spl-profile-uv-atlas"'+
    (profile.uv?.atlasPacking===true?' checked':'')+
    '> Pack UV0 islands into atlas</label>'+
   '<label title="Island gutter (0–0.2)">'+
    'Atlas padding <input type="number" class="spl-profile-uv-padding" '+
    'min="0" max="0.2" step="0.005" placeholder="0.04" value="'+
    (profile.uv?.atlasPadding??'')+'"'+
    (profile.uv?.atlasPacking===true&&!profile.uv?.atlasPixelPadding?'':' disabled')+'></label></div>'+
  '<div class="spl-vg-toolbar">'+
  '<label title="Allow proper 90-degree island rotation">'+
   '<input type="checkbox" class="spl-profile-uv-atlas-rotate"'+
    (profile.uv?.atlasRotate===true?' checked':'')+
    (profile.uv?.atlasPacking===true?'':' disabled')+'> Rotate islands</label>'+
  '<label><input type="checkbox" class="spl-profile-uv-pixel-padding"'+
   (profile.uv?.atlasPixelPadding?' checked':'')+
   (profile.uv?.atlasPacking===true?'':' disabled')+'> Pixel padding</label>'+
  (profile.uv?.atlasPixelPadding?
   '<label>Resolution <input type="number" class="spl-profile-uv-atlas-resolution" min="16" max="16384" step="1" value="'+profile.uv.atlasPixelPadding.resolution+'"></label>'+
   '<label>Gutter (px) <input type="number" class="spl-profile-uv-atlas-pixels" min="0" max="64" step="1" value="'+profile.uv.atlasPixelPadding.pixels+'"></label>':'')+'</div>'+

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
   (contour!==0||selectedEdge===null?1:profile.uv?.edgeWeights?.[selectedEdge]??1)+
   '"'+(contour!==0||selectedEdge===null?' disabled':'')+'></label>'+
  '<button type="button" class="spl-btn spl-profile-set-uv-seam"'+
   (contour!==0||selectedEdge===null?' disabled':'')+'>Set UV seam at selected edge</button>'+
  '<button type="button" class="spl-btn spl-profile-reset-uv"'+
   (profile.uv===undefined?' disabled':'')+'>Reset UV mapping</button></div></div>';
}
module.exports={FORMAT,MAX_POINTS,getProfileContours,parseProfile,formatProfile,applyProfileEdit,renderProfileControls};
