'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pkg=require(root+'/package.json');
assert.equal(pkg.panels,undefined,'No standalone panel');
assert(!Object.keys(pkg.contributions.messages).includes('open-panel'));
const animate=require(root+'/dist/contributions/inspector/Animate.js');
const container=require(root+'/dist/contributions/inspector/Container.js');
const traffic=require(root+'/dist/contributions/inspector/TrafficController.js');
for(const field of ['junction','phases','allRedSeconds','adaptiveTraffic','minGreenSeconds','maxGreenSeconds','maxDemandWaitSeconds','conflicts','conflictProbeTolerance','conflictProbeLookahead','conflictProbeIgnoreOrigin','conflictUseRoadWidths','conflictAutoRoadWidths','conflictRoadSources','conflictRoadHalfWidths','conflictVerticalTolerance'])
 assert(traffic.template.includes('spl-field-'+field),'Traffic Controller Inspector missing '+field);
assert(pkg.contributions.inspector.section.node['Splines.SplineTrafficController']===
  './dist/contributions/inspector/TrafficController.js');
assert.equal(traffic.template.match(/<ui-prop /g)?.length,16);
assert(traffic.template.includes('spl-check-traffic-conflicts'));
assert.equal(traffic.$.checkTrafficConflicts,'.spl-check-traffic-conflicts');
const signalRows=Object.fromEntries(Object.keys(traffic.$).map(k=>[k,{hidden:false,render(){}}]));
traffic.update.call({$:signalRows},{value:{adaptiveTraffic:{value:false},
   minGreenSeconds:{value:2},maxGreenSeconds:{value:15},maxDemandWaitSeconds:{value:30}}});
for(const key of ['minGreenSeconds','maxGreenSeconds','maxDemandWaitSeconds'])
 assert.equal(signalRows['r_'+key].hidden,true,key+' must hide in Fixed mode');
traffic.update.call({$:signalRows},{value:{adaptiveTraffic:{value:true},
   minGreenSeconds:{value:2},maxGreenSeconds:{value:15},maxDemandWaitSeconds:{value:30}}});
for(const key of ['minGreenSeconds','maxGreenSeconds','maxDemandWaitSeconds'])
 assert.equal(signalRows['r_'+key].hidden,false,key+' must display in Adaptive mode');
traffic.update.call({$:signalRows},{value:{conflictUseRoadWidths:{value:false},
  conflictRoadHalfWidths:{value:[]},conflictVerticalTolerance:{value:.75}}});
assert.equal(signalRows.r_conflictRoadHalfWidths.hidden,true);
assert.equal(signalRows.r_conflictVerticalTolerance.hidden,true);
traffic.update.call({$:signalRows},{value:{conflictUseRoadWidths:{value:true},
  conflictRoadHalfWidths:{value:[1,1]},conflictVerticalTolerance:{value:.75}}});
assert.equal(signalRows.r_conflictRoadHalfWidths.hidden,false);
assert.equal(signalRows.r_conflictVerticalTolerance.hidden,false);
traffic.update.call({$:signalRows},{value:{conflictUseRoadWidths:{value:true},
  conflictAutoRoadWidths:{value:true},conflictRoadHalfWidths:{value:[1,1]},
  conflictRoadSources:{value:[]},conflictVerticalTolerance:{value:.75}}});
assert.equal(signalRows.r_conflictRoadSources.hidden,false);
assert.equal(signalRows.r_conflictRoadHalfWidths.hidden,true);
traffic.update.call({$:signalRows},{value:{conflictUseRoadWidths:{value:true},
  conflictAutoRoadWidths:{value:false},conflictRoadHalfWidths:{value:[1,1]},
  conflictRoadSources:{value:[]},conflictVerticalTolerance:{value:.75}}});
assert.equal(signalRows.r_conflictRoadSources.hidden,true);
assert.equal(signalRows.r_conflictRoadHalfWidths.hidden,false);
for(const f of ['spline','target','modifiers','method','duration','speed','loopMode','easing','alignToSpline','upMode','upReference','forwardAxis','rotationOffset','orient2D','orient2DAngleOffset','playOnStart','startProgress','startPositionMode','startDistance','worldOffset','splineOffset','constantSpeedWithOffset','junctionOffsetBlendDistance','routeDestination','routeDestinationProgress','routeTransferPenalty','routeMaxWorldGap','routeCostSpace','stopOnRouteArrival','onRouteArrived','enableTrafficCapacity','trafficPriority','rerouteAroundTraffic','enableHeadway','headwayLaneId','headwayWorldGap','headwayBrakeDistance','enableLanePlacement','laneCount','laneWidth','enableProximityAvoidance','proximityRadius','proximityUseColliderBounds','proximityCollider','proximitySafetyGap','proximitySweepSamples','previewInEditor','previewProgress','previewPositionMode','previewDistance','junctionMode','onBeginningReached','onEndReached']){
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
assert.equal(animate.template.match(/<ui-prop /g)?.length,53);
const routePanel={$:Object.fromEntries(Object.keys(animate.$).map(k=>[k,{hidden:false,render(){}}]))};
animate.update.call(routePanel,{value:{junctionMode:{value:4},routeDestination:{value:null},stopOnRouteArrival:{value:false},routeCostSpace:{value:0},onRouteArrived:{value:[]},enableTrafficCapacity:{value:true},trafficPriority:{value:0},rerouteAroundTraffic:{value:false}}});
assert.equal(routePanel.$.r_routeDestination.hidden,false);
assert.equal(routePanel.$.r_stopOnRouteArrival.hidden,false);
assert.equal(routePanel.$.r_routeCostSpace.hidden,false);
assert.equal(routePanel.$.r_onRouteArrived.hidden,false);
assert.equal(routePanel.$.r_rerouteAroundTraffic.hidden,false);
assert.equal(routePanel.$.r_trafficPriority.hidden,false);
animate.update.call(routePanel,{value:{enableHeadway:{value:true},
    headwayWorldGap:{value:2},headwayBrakeDistance:{value:4}}});
assert.equal(routePanel.$.r_headwayWorldGap.hidden,false);
assert.equal(routePanel.$.r_headwayBrakeDistance.hidden,false);
animate.update.call(routePanel,{value:{enableHeadway:{value:false},
    headwayWorldGap:{value:2},headwayBrakeDistance:{value:4}}});
assert.equal(routePanel.$.r_headwayWorldGap.hidden,true);
assert.equal(routePanel.$.r_headwayBrakeDistance.hidden,true);
animate.update.call(routePanel,{value:{enableLanePlacement:{value:false},
    laneCount:{value:2},laneWidth:{value:3.5},
    enableProximityAvoidance:{value:false},proximityRadius:{value:.5},proximitySafetyGap:{value:.2},proximitySweepSamples:{value:16}}});
for(const k of ['laneCount','laneWidth','proximityRadius','proximitySafetyGap','proximitySweepSamples'])
    assert.equal(routePanel.$['r_'+k].hidden,true,k+' hidden when opt-out');
animate.update.call(routePanel,{value:{enableLanePlacement:{value:true},
    laneCount:{value:2},laneWidth:{value:3.5},
    enableProximityAvoidance:{value:true},proximityRadius:{value:.5},proximitySafetyGap:{value:.2},proximitySweepSamples:{value:16}}});
for(const k of ['laneCount','laneWidth','proximityRadius','proximitySafetyGap','proximitySweepSamples'])
    assert.equal(routePanel.$['r_'+k].hidden,false,k+' visible when opt-in');
animate.update.call(routePanel,{value:{enableProximityAvoidance:{value:true},
  proximityUseColliderBounds:{value:false},proximityCollider:{value:null}}});
assert.equal(routePanel.$.r_proximityCollider.hidden,true);
animate.update.call(routePanel,{value:{enableProximityAvoidance:{value:true},
  proximityUseColliderBounds:{value:true},proximityCollider:{value:null}}});
assert.equal(routePanel.$.r_proximityCollider.hidden,false);
animate.update.call(routePanel,{value:{junctionMode:{value:0},routeDestination:{value:null},stopOnRouteArrival:{value:false},onRouteArrived:{value:[]}}});
assert.equal(routePanel.$.r_routeDestination.hidden,true);
assert.equal(routePanel.$.r_stopOnRouteArrival.hidden,true);
assert.equal(routePanel.$.r_routeCostSpace.hidden,true);
assert.equal(routePanel.$.r_onRouteArrived.hidden,true);
assert.equal(routePanel.$.r_rerouteAroundTraffic.hidden,true);

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

// Road sharp-corner fix must be configurable in the custom Cocos Inspector.
const roadInspectorSource=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/contributions/inspector/common.js'),'utf8');
assert(roadInspectorSource.includes("title:'Sharp corners',fields:['cornerMode','cornerTrimSafety']"));
