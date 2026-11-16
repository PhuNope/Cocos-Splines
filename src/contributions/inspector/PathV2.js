'use strict';
/**
 * Compact pure-Vec3 Path authoring. No Knot Nodes, custom bottom log
 * or legacy Inspector. Each Knot card renders the editable Cocos Knot fields
 * (position, tangent mode/offsets and tension) and owns field Undo.
 * Topology buttons route through the active Scene process.
 */
const {style,callEditor}=require('./common');
const {knotPosition}=require('../../v2/PathKnotDumpCodec');
const simple=['interpolation','editableCatmullTangents','closed','gizmoKnotIndex',
    'gizmoShowPath','gizmoEditKnots','gizmoMultiKnotPoints',
    'gizmoPointLimit','gizmoEditTangents','gizmoRotateKnotTangents',
    'gizmoRotationMode','gizmoRotationSnap',
    'gizmoPositionSpace','gizmoRotationSpace','gizmoPositionSnap',
    'gizmoShowRollGuide','gizmoRollGuideSize'];
const $={items:'.spl-path-items',
    count:'.spl-path-count',add:'.spl-path-add',nudge:'.spl-path-nudge',
    groupStatus:'.spl-path-group-status',groupClear:'.spl-path-group-clear',
    groupRefresh:'.spl-path-group-refresh',curveHint:'.spl-path-curve-hint'};
for(const field of simple)$[field]='.spl-path-'+field;
const sections=[
 ['Spline',['interpolation','editableCatmullTangents','closed']],
 ['Gizmos',['gizmoKnotIndex','gizmoShowPath','gizmoEditKnots',
     'gizmoMultiKnotPoints','gizmoPointLimit','gizmoEditTangents','gizmoRotateKnotTangents',
     'gizmoRotationMode','gizmoRotationSnap',
     'gizmoPositionSpace','gizmoRotationSpace','gizmoPositionSnap',
     'gizmoShowRollGuide','gizmoRollGuideSize']]
];
const rows=sections.map(([name,fields])=>
    '<details open class="spl-section"><summary>'+name+'</summary>'+
    fields.map(field=>
        '<ui-prop type="dump" class="spl-prop spl-path-'+field+'"></ui-prop>'
    ).join('')+'</details>'
).join('');
const names=['select','insert','duplicate','remove','up','down'];
const nudgeDirections=['x-','x+','y-','y+','z-','z+'];
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
    const p=knotPosition(entry);
    if(!p||typeof p!=='object')return 'Vec3';
    const f=n=>Number.isFinite(Number(n))?Number(n).toFixed(2):'?';
    return 'X '+f(p.x)+' · Y '+f(p.y)+' · Z '+f(p.z);
}
function paintGroup(inspector,indices){
    const selected=Array.isArray(indices)?indices:[];
    inspector._groupIndices=selected.slice();
    if(inspector.$.groupStatus)
        inspector.$.groupStatus.textContent=selected.length+
            ' selected'+(selected.length?' — Knots '+selected.join(', '):' (choose 2+)');
    const cards=inspector.$.items?.querySelectorAll?.('.spl-path-knot')||[];
    for(let i=0;i<cards.length;i++){
        const checked=selected.includes(i);
        cards[i].classList?.toggle?.('grouped',checked);
        const button=cards[i].querySelector?.('button[data-operation="group-toggle"]');
        if(button){
            button.textContent=checked?'✓ Grouped':'+ Group';
            button.setAttribute?.('aria-pressed',String(checked));
        }
    }
}
async function editGroup(inspector,operation,index){
    const result=await callEditor(null,'edit-v2-path-group',operation,index);
    if(!result?.ok){
        console.warn('[Cocos Splines] Group selection:',String(result?.error||'Failed'));
        return;
    }
    paintGroup(inspector,result.indices);
}
async function nudgeGroup(axis){
    if(!nudgeDirections.includes(axis))return;
    const result=await callEditor(null,'nudge-v2-path-group',axis);
    if(!result?.ok)
        console.warn('[Cocos Splines] Group Nudge:',String(result?.error||'Failed'));
}
async function action(operation,index){
    if(!names.includes(operation)&&operation!=='add')return;
    const result=await callEditor(null,'edit-v2-path',operation,index);
    if(!result?.ok)
        console.warn('[Cocos Splines] Knot edit:',String(result?.error||'Failed'));
}
const button=(operation,index,label)=>`<button type="button" class="spl-btn"
    data-operation="${operation}" data-index="${index}">${label}</button>`;
module.exports={
 style:style+`
 .spl-path-items{display:grid;gap:6px;margin:7px 0}
 .spl-path-knot{border:1px solid var(--color-border-normal,#384858);border-radius:7px;padding:8px}
 .spl-path-knot.active{border-color:#70c7e5}
 .spl-path-knot.grouped{box-shadow:inset 3px 0 0 #69b8a7}
 .spl-path-note{font-size:11px;opacity:.82;display:block;padding:3px 2px}
 .spl-path-group-status{font-size:11px;display:block;margin:4px 0 6px}
 .spl-path-knot-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
 .spl-path-knot-head strong{font-size:12px}
 .spl-path-position{font-size:11px;opacity:.8}
 .spl-path-actions{display:flex;gap:4px;flex-wrap:wrap;margin:5px 0}
 .spl-path-items ui-prop{display:block;margin-top:5px}
 .spl-path-nudge{display:flex;flex-wrap:wrap;gap:5px;padding:6px 0}
 .spl-path-nudge button{min-width:46px}
 `,
 template:`<div class="spl-inspector">
   <div class="spl-header"><strong>∿ Spline Path</strong></div>
   ${rows}
   <small class="spl-path-note">Heading/pitch follow the spline tangent.
     Planar2D/Spatial3D rotate the whole Path; Roll Degrees inside each Knot card controls its bank.</small>
   <details open class="spl-section"><summary>Group Nudge (Inspector + HUD)</summary>
      <small class="spl-path-group-status">0 selected (choose 2+)</small>
      <div class="spl-btns">
        <button type="button" class="spl-btn spl-path-group-refresh">Refresh Group</button>
        <button type="button" class="spl-btn spl-path-group-clear">Clear Group</button>
      </div>
      <small class="spl-path-note">Click + Group on two Knot cards or use HUD Toggle Active Group.</small>
      <div class="spl-path-nudge">
        ${nudgeDirections.map(axis=>
            '<button type="button" class="spl-btn" data-nudge="'+axis+'">'+axis.toUpperCase()+'</button>'
        ).join('')}
      </div>
      <small>Step: Position Snap (or 1 if disabled). One Undo step for all selected Knots.</small>
   </details>
   <details open class="spl-section"><summary>Vec3 Knots
       <small class="spl-path-count"></small></summary>
      <div class="spl-btns">
         <button type="button" class="spl-btn spl-path-add">+ Add Knot</button>
      </div>
      <small class="spl-path-curve-hint spl-path-note"></small>
      <div class="spl-path-items"></div>
   </details>
 </div>`,
 $,
 update(dump){
    for(const field of simple){
        const property=dump?.value?.[field];
        if(property&&this.$[field])this.$[field].render(property);
    }
    const prop=dump?.value?.knots;
    const entries=Array.isArray(prop?.value)?prop.value:[];
    const selected=Number(dump?.value?.gizmoKnotIndex?.value)||0;
    this.$.count.textContent='('+entries.length+')';
    if(this.$.curveHint){
        const interp=Number(dump?.value?.interpolation?.value);
        const editable=!!dump?.value?.editableCatmullTangents?.value;
        this.$.curveHint.textContent=interp===1?
            'Bézier: choose Free/Aligned/Mirrored Mode or drag the selected Knot tangent handles. Roll Degrees banks this Knot.':
            (interp===2||interp===3)?
            editable?
                'Editable Catmull/Centripetal tangents ON: automatic Knots keep the original curve. Drag an In/Out handle or Knot rotation ring to make that Knot Free. This changes only local segment tangents.':
                'Automatic Catmull/Centripetal tangents. Enable Editable Catmull Tangents above to unlock Knot tangent handles without switching interpolation.':
            'Linear paths have sharp segments; choose Centripetal/Catmull with Editable Tangents or Bézier to shape smooth turns.';
    }
    const html=entries.map((entry,i)=>
      '<div class="spl-path-knot'+(i===selected?' active':'')+'">'+
        '<div class="spl-path-knot-head"><strong>Knot '+i+'</strong>'+
        '<span class="spl-path-position">'+escapeText(pointLabel(entry))+'</span></div>'+
        '<div class="spl-path-actions">'+
          button('select',i,'Select')+
          button('group-toggle',i,'+ Group')+
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
    paintGroup(this,this._groupIndices||[]);
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
    this.$.groupClear.addEventListener('click',()=>void editGroup(this,'clear',0));
    this.$.groupRefresh.addEventListener('click',()=>void editGroup(this,'query',0));
    if(typeof Editor!=='undefined')void editGroup(this,'query',0);
    this.$.nudge.addEventListener('click',event=>{
        const button=event.target?.closest?.('button[data-nudge]');
        if(button)void nudgeGroup(button.dataset.nudge);
    });
    this.$.items.addEventListener('click',event=>{
        const button=event.target?.closest?.('button[data-operation]');
        if(!button)return;
        const index=Number(button.dataset.index);
        if(!Number.isSafeInteger(index)||index<0)return;
        if(button.dataset.operation==='group-toggle')
            void editGroup(this,'toggle',index);
        else void action(button.dataset.operation,index);
    });
 }
};
