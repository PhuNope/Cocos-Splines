'use strict';
/**
 * Built-in, data-only Profile Library for the Geometry Graph Inspector.
 * Applying a template edits an in-memory draft; saving is handled ONLY by
 * the existing, explicit, checksum-guarded native JsonAsset workflow.
 * No Cocos Scene writes, asset creation, arbitrary code or hidden migration.
 */
const {parseProfile,formatProfile}=require('./SplineGeometryProfileEditor');
const RAW=[
 {id:'rectangle',label:'Rectangle',detail:'4-point solid section',
  points:[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]},
 {id:'beveled',label:'Beveled Rectangle',detail:'8-point clipped corners',
  points:[[-.4,-.5],[.4,-.5],[.5,-.4],[.5,.4],[.4,.5],[-.4,.5],[-.5,.4],[-.5,-.4]]},
 {id:'u-channel',label:'U Channel',detail:'8-point concave open-top shape',
  points:[[-.5,-.5],[.5,-.5],[.5,.5],[.3,.5],[.3,-.2],[-.3,-.2],[-.3,.5],[-.5,.5]]},
 {id:'l-section',label:'L Section',detail:'6-point concave corner',
  points:[[-.5,-.5],[.5,-.5],[.5,-.1],[.1,-.1],[.1,.5],[-.5,.5]]},
 {id:'octagon',label:'Octagon',detail:'8-point beveled column',
  points:[[-.3,-.5],[.3,-.5],[.5,-.3],[.5,.3],[.3,.5],[-.3,.5],[-.5,.3],[-.5,-.3]]},
 {id:'uv-seam-demo',label:'UV Seam Example',detail:'rectangle with seam and weighted U',
  points:[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]],
  uv:{seamEdge:2,edgeWeights:[1,2,1,1]}},
];
const TEMPLATE_MAP=new Map();
const PRESETS=Object.freeze(RAW.map(raw=>{
 const json={format:'cocos-splines/profile',version:1,
  points:raw.points.map(([x,y])=>({x,y})),
  ...(raw.uv?{uv:raw.uv}:{}),
 };
 const canonical=formatProfile(json);
 if(TEMPLATE_MAP.has(raw.id))throw Error('Duplicate Profile Library ID');
 TEMPLATE_MAP.set(raw.id,canonical);
 return Object.freeze({id:raw.id,label:raw.label,detail:raw.detail,
  vertices:raw.points.length,hasUV:!!raw.uv});
}));
/** Return a fresh canonical JsonAsset payload. */
function createProfilePreset(id){
 if(typeof id!=='string'||!TEMPLATE_MAP.has(id))
  throw Error('Unknown Profile Library preset.');
 return formatProfile(TEMPLATE_MAP.get(id));
}
/** Replacing a preset is explicitly staged; caller records one Undo step. */
function applyProfilePreset(current,id){
 parseProfile(current); // fail closed if current draft is malformed
 return createProfilePreset(id);
}
module.exports={PRESETS,createProfilePreset,applyProfilePreset};
