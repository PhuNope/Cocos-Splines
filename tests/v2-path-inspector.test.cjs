'use strict';
/** Custom Path Inspector smoke without a Creator UI process. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const inspector=require(path.join(root,'src/contributions/inspector/PathV2.js'));
assert.match(inspector.template,/Vec3 Knots/);
assert.match(inspector.template,/spl-path-items/);
assert.match(inspector.template,/spl-path-add/);
assert.match(inspector.template,/Group Nudge/);
assert.match(inspector.template,/Group Nudge \(Inspector \+ HUD\)/);
assert.match(inspector.template,/spl-path-group-status/);
assert.match(inspector.template,/spl-path-curve-hint/);
assert.match(inspector.template,/spl-path-editableCatmullTangents/);
assert.match(inspector.update.toString(),/group-toggle/);
assert.match(inspector.update.toString(),/Roll Degrees/);
for(const axis of ['x-','x+','y-','y+','z-','z+'])
 assert(inspector.template.includes('data-nudge="'+axis+'"'));
assert.doesNotMatch(inspector.template,/Raw Knot Data|spl-path-knots/);
assert(!('knots' in inspector.$),'Raw Knot dump selector must not exist');
for(const field of ['gizmoPositionSpace','gizmoRotationSpace','gizmoPositionSnap']){
 assert(inspector.template.includes('spl-path-'+field),
   'The native Inspector must expose '+field+' without a raw dump panel');
}
for(const operation of ['add','insert','duplicate','remove','up','down','select'])
    assert(inspector.update.toString().includes(operation)||
        fs.readFileSync(path.join(root,'src/contributions/inspector/PathV2.js'),'utf8')
            .includes(operation==='add'?"action('add'":"button('"+operation+"'"),
        'Missing Inspector Knot action: '+operation);
const rendered={},bindings={};
const ui=()=>({render(v){rendered[v?.name||'unnamed']=v;}});
const cards=[];
const items={
    innerHTML:'',
    querySelectorAll(){return cards;},
    addEventListener(type,handler){bindings.items=handler;}
};
const count={textContent:''};
const add={addEventListener(type,handler){bindings.add=handler;}};
const nudge={addEventListener(type,handler){bindings.nudge=handler;}};
const groupClear={addEventListener(type,handler){bindings.groupClear=handler;}};
const groupRefresh={addEventListener(type,handler){bindings.groupRefresh=handler;}};
const groupStatus={textContent:''};
const curveHint={textContent:''};
const $={items,count,add,nudge,groupClear,groupRefresh,groupStatus,curveHint};
for(const name of ['interpolation','editableCatmullTangents','closed','gizmoKnotIndex',
    'gizmoShowPath','gizmoEditKnots','gizmoMultiKnotPoints',
    'gizmoPointLimit','gizmoEditTangents',
    'gizmoRotationMode','gizmoRotationSnap',
    'gizmoPositionSpace','gizmoRotationSpace','gizmoPositionSnap',
    'gizmoShowRollGuide','gizmoRollGuideSize'])$[name]=ui();
const fake={$, _cardCount:undefined,_cardSelected:undefined};
const entry=(i)=>({name:'Knot'+i,value:{
    position:{value:{x:i,y:0,z:5*i}},
    mode:{value:0},handleIn:{value:{x:-1,y:0,z:0}},
    handleOut:{value:{x:1,y:0,z:0}},tension:{value:0}}});
const dump={value:{
    knots:{name:'Knots',value:[entry(0),entry(1)]},
    interpolation:{name:'Interpolation',value:3},
    editableCatmullTangents:{name:'Editable Tangents',value:false},
    closed:{name:'Closed',value:false},
    gizmoKnotIndex:{name:'Selected',value:0}
}};
inspector.update.call(fake,dump);
assert.equal(count.textContent,'(2)');
assert.match(items.innerHTML,/Knot 0/);
assert.match(items.innerHTML,/Knot 1/);
assert.match(items.innerHTML,/data-operation="remove"/);
assert.match(items.innerHTML,/data-operation="select"/);
assert.match(items.innerHTML,/data-operation="group-toggle"/);
assert.doesNotMatch(items.innerHTML,/data-operation="split"/,
 'Exact curve split must not be offered for Centripetal');
assert.match(curveHint.textContent,/Enable Editable Catmull Tangents/);
dump.value.editableCatmullTangents.value=true;
inspector.update.call(fake,dump);
assert.match(curveHint.textContent,/Editable Catmull\/Centripetal tangents ON/);
dump.value.editableCatmullTangents.value=false;
inspector.update.call(fake,dump);
assert.match(groupStatus.textContent,/0 selected/);
const html=items.innerHTML;
inspector.update.call(fake,dump);
assert.equal(items.innerHTML,html,'Inspector cannot tear down active Vec3 editors per refresh');
assert.equal(fake._cardCount,2);
dump.value.gizmoKnotIndex.value=1;
inspector.update.call(fake,dump);
assert.equal(fake._cardSelected,1);
inspector.ready.call(fake);
assert.equal(typeof bindings.add,'function');
assert.equal(typeof bindings.items,'function');
assert.equal(typeof bindings.nudge,'function');
assert.equal(typeof bindings.groupClear,'function');
assert.equal(typeof bindings.groupRefresh,'function');
dump.value.interpolation.value=1;
inspector.update.call(fake,dump);
assert.match(curveHint.textContent,/Free\/Aligned\/Mirrored/);
assert.equal((items.innerHTML.match(/data-operation="split"/g)||[]).length,1,
 'Open two-Knot Bézier has one splittable segment');
dump.value.closed.value=true;
inspector.update.call(fake,dump);
assert.equal((items.innerHTML.match(/data-operation="split"/g)||[]).length,2,
 'Closed two-Knot Bézier has two splittable segments, including seam');
dump.value.interpolation.value=2;
inspector.update.call(fake,dump);
assert.doesNotMatch(items.innerHTML,/data-operation="split"/,
 'Do not claim Catmull segment insertion preserves curve');
console.log('V2 PATH CUSTOM INSPECTOR PASS: Vec3 cards, topology buttons, focus-stable refresh, native dump fields.');
