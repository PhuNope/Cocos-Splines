'use strict';
/** Custom Path Inspector smoke without a Creator UI process. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const inspector=require(path.join(root,'src/contributions/inspector/PathV2.js'));
assert.match(inspector.template,/Vec3 Knots/);
assert.match(inspector.template,/spl-path-items/);
assert.match(inspector.template,/spl-path-add/);
for(const operation of ['add','insert','duplicate','remove','up','down','select'])
    assert(inspector.update.toString().includes(operation)||
        fs.readFileSync(path.join(root,'src/contributions/inspector/PathV2.js'),'utf8')
            .includes("button('"+operation+"'"),
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
const $={items,count,add,knots:ui()};
for(const name of ['interpolation','closed','gizmoKnotIndex',
    'gizmoShowPath','gizmoEditKnots','gizmoMultiKnotPoints',
    'gizmoPointLimit','gizmoEditTangents'])$[name]=ui();
const fake={$, _cardCount:undefined,_cardSelected:undefined};
const entry=(i)=>({name:'Knot'+i,value:{
    position:{value:{x:i,y:0,z:5*i}},
    mode:{value:0},handleIn:{value:{x:-1,y:0,z:0}},
    handleOut:{value:{x:1,y:0,z:0}},tension:{value:0}}});
const dump={value:{
    knots:{name:'Knots',value:[entry(0),entry(1)]},
    interpolation:{name:'Interpolation',value:3},
    closed:{name:'Closed',value:false},
    gizmoKnotIndex:{name:'Selected',value:0}
}};
inspector.update.call(fake,dump);
assert.equal(count.textContent,'(2)');
assert.match(items.innerHTML,/Knot 0/);
assert.match(items.innerHTML,/Knot 1/);
assert.match(items.innerHTML,/data-operation="remove"/);
assert.match(items.innerHTML,/data-operation="select"/);
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
console.log('V2 PATH CUSTOM INSPECTOR PASS: Vec3 cards, topology buttons, focus-stable refresh, native dump fields.');
