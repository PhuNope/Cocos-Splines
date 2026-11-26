'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const common=require(root+'/dist/contributions/inspector/common.js');
const container=require(root+'/dist/contributions/inspector/Container.js');
const geometry=require(root+'/dist/contributions/inspector/GeometryGraph.js');
const graphModel=require(root+'/dist/SplineGeometryGraphVisualModel.js');
const profileEditor=require(root+'/dist/SplineGeometryProfileEditor.js');
const types=[
 'noise','modifiers','geometryGraph','objectController','junctionMesh',
 'bender','morph','knot','extrude','road','trigger','trafficController',
 'junction','instantiate','path2d','deform','positioner','projector',
 'length','animate',
];
for(const type of types){
 const panel=common.makeInspector(type);
 assert(panel.template.includes('ui-prop type="dump"'),
   type+' must retain native Inspector properties');
 assert(panel.template.includes('spl-status'),
   type+' must retain actionable status and validation feedback');
 assert(!panel.template.includes('<p class="spl-note">'),
   type+' must not append an explanatory paragraph below fields');
 assert(!/Phase\s+\d+(?:\.\d+)*[a-z]?\s+(?:adds?|supports?|introduces?)/i.test(panel.template),
   type+' must not render roadmap text');
}
assert(geometry.template.includes('spl-vg-stage'),
 'Graph drag/connect functionality must remain');
assert(geometry.template.includes('spl-profile-canvas'));
assert(geometry.template.includes('spl-vg-save-shared'));
assert(geometry.template.includes('spl-profile-save'));
assert(!geometry.template.includes('Phase 4.2b supports'),
 'The long Phase 4.2b note must not be rendered');
assert(!geometry.template.includes('Load changes only the draft'));
assert(!geometry.template.includes('Drag node headers.'));
assert(!geometry.template.includes('Choose a readable MeshRenderer'));
assert(!geometry.template.includes('<div class="spl-note">'));
assert(container.template.includes('spl-knot-list'));
assert(container.template.includes('spl-surface-align-normal'),
 'Interactive surface alignment checkbox must not be removed with notes');
assert(container.template.includes('spl-resample-create'));
assert(container.template.includes('spl-svg-import'));
assert(container.template.includes('spl-add'));
assert(!container.template.includes('Versioned Cocos geometry JSON:'));
assert(!container.template.includes('Resample fits cubics'));
assert(!container.template.includes('Bật Cocos-Gizmos v3.0.3+'));
assert(!container.template.includes('Chỉnh toàn bộ đường cong trong Inspector'));
const width={version:1,nodes:[
 {id:'src',type:'spline'},
 {id:'width',type:'width',input:'src'},
 {id:'ribbon',type:'ribbon',input:'width'},
 {id:'output',type:'output',input:'ribbon'},
],output:'output'};
const rendered=graphModel.renderNodeParameters(JSON.stringify(width),'width');
assert(rendered.includes('data-graph-param="multiplier"'));
assert(rendered.includes('data-width-action="enable"'));
assert(!rendered.includes('Multiplier = Start scale.'));
const profile={format:'cocos-splines/profile',version:1,
 points:[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}],
 uv:{sideIslandMode:2,atlasPacking:true}};
const html=profileEditor.renderProfileControls(profileEditor.formatProfile(profile));
assert(html.includes('spl-profile-uv-atlas'));
assert(html.includes('spl-profile-uv-padding'));
assert(html.includes('spl-profile-uv-island-mode'));
assert(!html.includes('Atlas uses one shared UV scale'));
const dir=path.join(root,'assets/splines/Components');
const tsFiles=fs.readdirSync(dir).filter(name=>name.endsWith('.ts'));
tsFiles.push('SplineContainer.ts','SplineKnot.ts');
let inspected=0,tooltips=0;
for(const filename of tsFiles){
 const file=filename==='SplineContainer.ts'||filename==='SplineKnot.ts'?
  path.join(root,'assets/splines/Core',filename):path.join(dir,filename);
 const source=fs.readFileSync(file,'utf8');
 for(const line of source.split('\n'))
  if(line.includes('tooltip:'))
   assert(!line.includes(String.fromCharCode(92,92,39)),
    filename+' has an invalid double-escaped apostrophe in tooltip');

 for(const item of source.matchAll(/tooltip:'((?:\\.|[^'\\])*)'/g)){
  tooltips++;
  assert(item[1].length<=100,filename+' contains an overly long Cocos tooltip ('+
   item[1].length+' chars)');
  assert(!/Phase\s+\d/.test(item[1]),filename+' contains a roadmap tooltip');
 }
 inspected++;
}
assert(inspected>=21&&tooltips>=200,'All runtime component tooltips must be audited');
console.log('COMPACT INSPECTOR COPY V2 PASS: 20 custom panels, Container, Graph, native tooltip length, property/action preservation.');
