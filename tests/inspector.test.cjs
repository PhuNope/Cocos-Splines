'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pkg=require(root+'/package.json');
assert.equal(pkg.panels,undefined,'No standalone panel');
assert(!Object.keys(pkg.contributions.messages).includes('open-panel'));
const animate=require(root+'/dist/contributions/inspector/Animate.js');
const container=require(root+'/dist/contributions/inspector/Container.js');
for(const f of ['spline','target','modifiers','method','duration','speed','loopMode','easing','alignToSpline','upMode','upReference','forwardAxis','rotationOffset','orient2D','orient2DAngleOffset','playOnStart','startProgress','startPositionMode','startDistance','worldOffset','splineOffset','constantSpeedWithOffset','junctionOffsetBlendDistance','previewInEditor','previewProgress','previewPositionMode','previewDistance','junctionMode','onBeginningReached','onEndReached']){
 assert(animate.template.includes('spl-field-'+f),`Missing stable animate ui-prop: ${f}`);
}
for(const f of ['closed','reversed','samplesPerCurve','dimension','showGizmos','showGizmosAlways','gizmoSteps','gizmoColor'])assert(container.template.includes('spl-field-'+f));
assert(container.template.includes('spl-knots'));
assert(container.template.includes('spl-json'));
assert(container.template.includes('spl-reverse'));
assert(container.toString().includes('')); // Inspector exports stable template/handlers.
assert(animate.template.includes('type="dump"'));
assert(animate.template.includes('spl-field-junctionOffsetBlendDistance'),'Blend Distance must be visible in custom Animate Inspector');
assert(animate.template.includes('spl-field-upReference'),'TargetLocal Up Reference must be visible in custom Animate Inspector');
const selectors={};const rendered=[];
for(const [name] of Object.entries(animate.$)){selectors[name]={render:(d)=>rendered.push(d),textContent:'',addEventListener(){}};}
const panel={$:selectors,_previewState:'false|undefined'};
const dump={value:{duration:{value:3,type:'Number'},spline:{value:null,type:'cc.Object'},previewInEditor:{value:false},previewProgress:{value:0.2}}};
animate.update.call(panel,dump);
assert(rendered.includes(dump.value.duration));assert(rendered.includes(dump.value.spline));
assert.equal(animate.template.match(/<ui-prop /g)?.length,30);
for(const [type,names] of [['Road',['spline','width','shoulderWidth','curbHeight','thickness','roadMaterial','uvDirection','uvWidthTiles','uvReverseAcross','uvReverseLength','uvOffsetU','uvOffsetV']],['Trigger',['progress','direction','workOnce','onCross']],['Junction',['connections','onReach','onSwitch']]]){
 const inspector=require(root+'/dist/contributions/inspector/'+type+'.js');
 for(const name of names)assert(inspector.template.includes('spl-field-'+name),type+' missing '+name);
}
for(const b of ['spl-create-road','spl-create-trigger','spl-create-junction','spl-create-positioner','spl-create-projector','spl-create-length'])assert(container.template.includes(b),'Container needs '+b);
for(const [name,fields] of Object.entries({
  Trigger:['positionMode','progress','distance'],
  Junction:['connections'],
  Road:['rangeMode','startProgress','endProgress','startDistance','endDistance'],
  Extrude:['rangeMode','startProgress','endProgress','startDistance','endDistance'],
  Instantiate:['rangeMode','startProgress','endProgress','startDistance','endDistance'],
  MeshDeform:['rangeMode','startProgress','endProgress','startDistance','endDistance'],
})){
 const panel=require(root+'/dist/contributions/inspector/'+name+'.js');
 for(const field of fields)assert(panel.template.includes('spl-field-'+field),`${name}.${field} missing`);
 const rows=Object.fromEntries(Object.keys(panel.$).map(k=>[k,{hidden:false,render(){},addEventListener(){}}]));
 if(name==='Trigger'){
  panel.update.call({$:rows},{value:{positionMode:{value:1},progress:{value:.5},distance:{value:3}}});
  assert.equal(rows.r_progress.hidden,true);assert.equal(rows.r_distance.hidden,false);
 }else if(name!=='Junction'){
  panel.update.call({$:rows},{value:{rangeMode:{value:1},startDistance:{value:2},endDistance:{value:5},startProgress:{value:0},endProgress:{value:1}}});
  assert.equal(rows.r_startProgress.hidden,true);assert.equal(rows.r_startDistance.hidden,false);
 }
}
for(const kind of ['Instantiate','ObjectController']){
 const panel=require(root+'/dist/contributions/inspector/'+kind+'.js');
 for(const k of ['spawnOnStart','spl-spawn','spl-respawn','spl-clear-spawned'])assert(panel.template.includes(k),`${kind} missing ${k}`);
}
const benderPanel=require(root+'/dist/contributions/inspector/Bender.js');
for(const k of ['spl-field-layout','spl-field-partGap'])assert(benderPanel.template.includes(k),`Bender missing ${k}`);
console.log('INSPECTOR PASS: no dockable panel; stable native ui-prop rendering; inline spline controls + T/Distance.');
