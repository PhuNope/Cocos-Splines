'use strict';
/**
 * Compact pure-Vec3 Path authoring. No Knot Nodes, custom bottom log
 * or legacy Inspector. ui-prop renders serialized Cocos Knot records
 * (position, tangent mode/offsets and tension) and owns field Undo.
 * Topology buttons route through the active Scene process.
 */
const {style,callEditor}=require('./common');
const simple=['interpolation','closed','gizmoKnotIndex',
    'gizmoShowPath','gizmoEditKnots','gizmoMultiKnotPoints',
    'gizmoPointLimit','gizmoEditTangents',
    'gizmoRotationMode','gizmoRotationSnap',
    'gizmoShowRollGuide','gizmoRollGuideSize'];
const $={knots:'.spl-path-knots',items:'.spl-path-items',
    count:'.spl-path-count',add:'.spl-path-add'};
for(const field of simple)$[field]='.spl-path-'+field;
const sections=[
 ['Spline',['interpolation','closed']],
 ['Gizmos',['gizmoKnotIndex','gizmoShowPath','gizmoEditKnots',
     'gizmoMultiKnotPoints','gizmoPointLimit','gizmoEditTangents',
     'gizmoRotationMode','gizmoRotationSnap',
     'gizmoShowRollGuide','gizmoRollGuideSize']]
];
const rows=sections.map(([name,fields])=>
    '<details open class="spl-section"><summary>'+name+'</summary>'+
    fields.map(field=>
        '<ui-prop type="dump" class="spl-prop spl-path-'+field+'"></ui-prop>'
    ).join('')+'</details>'
).join('');
const names=['select','insert','duplicate','remove','up','down'];
function escapeText(s){
    return String(s).replace(/[&<>"']/g,c=>({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
}
function valueFromEntry(entry,name){
    const prop=entry?.value?.[name];
    return prop?.value??null;
}
function pointLabel(entry){
    const p=valueFromEntry(entry,'position');
    if(!p||typeof p!=='object')return 'Vec3';
    const f=n=>Number.isFinite(Number(n))?Number(n).toFixed(2):'?';
    return 'X '+f(p.x)+' · Y '+f(p.y)+' · Z '+f(p.z);
}
async function action(operation,index){
    if(!names.includes(operation)&&operation!=='add')return;
    const result=await callEditor(null,'edit-v2-path',operation,index);
    if(!result?.ok)
        console.warn('[Cocos Splines V2] Knot edit:',String(result?.error||'Failed'));
}
const button=(operation,index,label)=>`<button type="button" class="spl-btn"
    data-operation="${operation}" data-index="${index}">${label}</button>`;
module.exports={
 style:style+`
 .spl-path-items{display:grid;gap:6px;margin:7px 0}
 .spl-path-knot{border:1px solid var(--color-border-normal,#384858);border-radius:7px;padding:8px}
 .spl-path-knot.active{border-color:#70c7e5}
 .spl-path-knot-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
 .spl-path-knot-head strong{font-size:12px}
 .spl-path-position{font-size:11px;opacity:.8}
 .spl-path-actions{display:flex;gap:4px;flex-wrap:wrap;margin:5px 0}
 .spl-path-items ui-prop{display:block;margin-top:5px}
 `,
 template:`<div class="spl-inspector">
   <div class="spl-header"><strong>∿ Spline Path</strong></div>
   ${rows}
   <details open class="spl-section"><summary>Vec3 Knots
       <small class="spl-path-count"></small></summary>
      <div class="spl-btns">
         <button type="button" class="spl-btn spl-path-add">+ Add Knot</button>
      </div>
      <div class="spl-path-items"></div>
      <details><summary>Raw Knot Data</summary>
        <ui-prop type="dump" class="spl-prop spl-path-knots"></ui-prop>
      </details>
   </details>
 </div>`,
 $,
 update(dump){
    for(const field of simple){
        const property=dump?.value?.[field];
        if(property&&this.$[field])this.$[field].render(property);
    }
    const prop=dump?.value?.knots;
    if(prop&&this.$.knots)this.$.knots.render(prop);
    const entries=Array.isArray(prop?.value)?prop.value:[];
    const selected=Number(dump?.value?.gizmoKnotIndex?.value)||0;
    this.$.count.textContent='('+entries.length+')';
    const html=entries.map((entry,i)=>
      '<div class="spl-path-knot'+(i===selected?' active':'')+'">'+
        '<div class="spl-path-knot-head"><strong>Knot '+i+'</strong>'+
        '<span class="spl-path-position">'+escapeText(pointLabel(entry))+'</span></div>'+
        '<div class="spl-path-actions">'+
          button('select',i,'Select')+
          button('insert',i,'+ After')+
          button('duplicate',i,'Duplicate')+
          button('up',i,'↑')+button('down',i,'↓')+
          button('remove',i,'× Remove')+
        '</div>'+
        '<ui-prop type="dump" class="spl-prop spl-path-entry-'+i+'"></ui-prop>'+
      '</div>'
    ).join('');
    // Recreate DOM only when cards/selection change: frequent Inspector
    // refresh must not steal focus from an in-progress Vec3 numeric edit.
    if(this._cardCount!==entries.length||this._cardSelected!==selected){
        this.$.items.innerHTML=html;
        this._cardCount=entries.length;
        this._cardSelected=selected;
    }
    entries.forEach((entry,i)=>{
        const card=this.$.items.querySelectorAll('.spl-path-knot')[i];
        const label=card?.querySelector('.spl-path-position');
        if(label)label.textContent=pointLabel(entry);
        const prop=card?.querySelector('ui-prop');
        if(prop&&entry&&typeof prop.render==='function')prop.render(entry);
    });
 },
 ready(){
    this.$.add.addEventListener('click',()=>void action('add',0));
    this.$.items.addEventListener('click',event=>{
        const button=event.target?.closest?.('button[data-operation]');
        if(!button)return;
        const index=Number(button.dataset.index);
        if(!Number.isSafeInteger(index)||index<0)return;
        void action(button.dataset.operation,index);
    });
 }
};
