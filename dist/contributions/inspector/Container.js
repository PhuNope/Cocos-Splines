'use strict';
/** SplineContainer is edited entirely inside Cocos's standard Inspector. */
const {style,callEditor}=require('./common');
const NAME='cocos-splines';
const fields=['closed','reversed','samplesPerCurve','dimension','showGizmos','showGizmosAlways','showTangentGizmos','gizmoSteps','gizmoColor'];
const $={info:'.spl-info',knots:'.spl-knots',add:'.spl-add',refresh:'.spl-refresh',reverse:'.spl-reverse',status:'.spl-status',json:'.spl-json',import:'.spl-import',list:'.spl-knot-list',road:'.spl-create-road',trigger:'.spl-create-trigger',junction:'.spl-create-junction',positioner:'.spl-create-positioner',projector:'.spl-create-projector',length:'.spl-create-length',path2d:'.spl-create-2d-path',deform:'.spl-create-deform',modifiers:'.spl-create-modifiers',objectController:'.spl-create-objectcontroller',morph:'.spl-create-morph',bender:'.spl-create-bender',junctionMesh:'.spl-create-junctionmesh'};
for(const field of fields)$['p_'+field]='.spl-field-'+field;
const template=`<div class="spl-inspector spl-container-inspector">
  <div class="spl-header"><strong>∿ Spline Container</strong><p>Chỉnh toàn bộ đường cong trong Inspector. Kéo Knot bằng Move Gizmo (W) hoặc sửa tọa độ bên dưới.</p></div>
  <details class="spl-section" open><summary>Spline settings</summary>
    <ui-prop type="dump" class="spl-prop spl-field-closed"></ui-prop>
    <ui-prop type="dump" class="spl-prop spl-field-reversed"></ui-prop>
    <ui-prop type="dump" class="spl-prop spl-field-samplesPerCurve"></ui-prop>
    <ui-prop type="dump" class="spl-prop spl-field-dimension"></ui-prop>
  </details>
  <details class="spl-section" open><summary>Scene Gizmos (Cocos-Gizmos extension)</summary>
    <ui-prop type="dump" class="spl-prop spl-field-showGizmos"></ui-prop>
    <ui-prop type="dump" class="spl-prop spl-field-showGizmosAlways"></ui-prop>
    <ui-prop type="dump" class="spl-prop spl-field-showTangentGizmos"></ui-prop>
    <ui-prop type="dump" class="spl-prop spl-field-gizmoSteps"></ui-prop>
    <ui-prop type="dump" class="spl-prop spl-field-gizmoColor"></ui-prop>
    <p class="spl-note">Bật Cocos-Gizmos v2.0.3+. Chọn Knot sẽ luôn hiện tangent dù Show Tangent Gizmos tắt. Knot có handles: bật Edit Handles để luôn thấy đường + tangent khi chỉnh, không cần bật Show Gizmos Always.</p>
  </details>
  <div class="spl-info">Đang tải knots…</div>
  <div class="spl-btns"><button type="button" class="spl-btn spl-add">＋ Add Knot</button><button type="button" class="spl-btn spl-refresh">↻ Refresh mesh</button><button type="button" class="spl-btn spl-reverse">⇄ Reverse direction</button></div>
  <details class="spl-section" open><summary>Road · Trigger · Junction</summary>
    <p class="spl-note">Dựng road mesh bằng Inspector, không cần code. Gắn Trigger để nhận event; Junction dùng để nối nhiều Spline.</p>
    <div class="spl-btns"><button type="button" class="spl-btn spl-create-2d-path">＋ Add 2D Path</button><button type="button" class="spl-btn spl-create-deform">＋ Add Mesh Deform</button></div>
    <div class="spl-btns"><button type="button" class="spl-btn spl-create-positioner">＋ Positioner</button><button type="button" class="spl-btn spl-create-projector">＋ Projector</button><button type="button" class="spl-btn spl-create-length">＋ Length Monitor</button></div>
    <div class="spl-btns"><button type="button" class="spl-btn spl-create-modifiers">＋ Modifiers</button><button type="button" class="spl-btn spl-create-objectcontroller">＋ Object Controller</button></div>
    <div class="spl-btns"><button type="button" class="spl-btn spl-create-morph">＋ Morph</button></div>
    <div class="spl-btns"><button type="button" class="spl-btn spl-create-road">＋ Add Road</button><button type="button" class="spl-btn spl-create-trigger">＋ Add Trigger</button><button type="button" class="spl-btn spl-create-junction">＋ Add Junction</button></div>
  </details>
  <details class="spl-section" open><summary>Bezier knots · chỉnh trực tiếp</summary><div class="spl-knot-list spl-knots"></div></details>
  <details class="spl-section"><summary>Import Unity Splines JSON</summary>
    <p class="spl-note">Dán JSON từ UnitySplineJsonExporter.cs. Tạo spline mới cùng cấp với spline đang chọn, không ghi đè knot cũ.</p>
    <textarea class="spl-json" rows="5" spellcheck="false" placeholder='{"closed":false,"knots":[...]}'></textarea>
    <div class="spl-btns"><button type="button" class="spl-btn spl-import">Import as new spline</button></div>
  </details><div class="spl-status" role="status"></div>
</div>`;
const ownStyle=style+`
.spl-info{font-size:11px;opacity:.85;margin:9px 0}
.spl-json{width:100%;box-sizing:border-box;min-height:70px;background:var(--color-normal-fill-emphasis,#202c38);color:inherit;border:1px solid #4b6678;border-radius:4px;padding:7px;resize:vertical}
.spl-knots{display:flex;flex-direction:column;gap:6px;min-width:0}
.spl-knot{padding:6px 7px;border:1px solid var(--color-border-normal,#415162);background:rgba(60,110,146,.07);border-radius:5px;min-width:0}
.spl-knot summary{font-size:11px;font-weight:600;cursor:pointer;user-select:none}
.spl-knot .spl-btns{margin:5px 0}.spl-knot-grid{display:grid;grid-template-columns:60px minmax(0,1fr);gap:5px;align-items:center;margin-top:7px}
.spl-knot-grid label{font-size:10px;color:var(--color-normal,#aebbc5)}
.spl-vec{display:flex;gap:3px;min-width:0}.spl-axis{display:flex;flex:1;min-width:0;align-items:center;gap:2px}
.spl-axis span{font-size:10px;color:#8cbdd4}.spl-axis input{min-width:0;width:100%;box-sizing:border-box}
.spl-knot-grid input,.spl-knot-grid select{background:var(--color-normal-fill-emphasis,#202c38);color:inherit;border:1px solid #536471;border-radius:4px;padding:4px 3px;font-size:11px}
.spl-knot-grid input:disabled{opacity:.5;cursor:not-allowed}.spl-knot-grid input:focus{outline:1px solid #6baac9}
.spl-knot .spl-btn{padding:3px 6px;font-size:10px}
`;
function createButton(label,action,cls=''){
    const b=document.createElement('button');b.type='button';b.className='spl-btn '+cls;b.textContent=label;b.addEventListener('click',action);return b;
}
function xyzRow(panel,root,grid,label,key,value,knotUuid,disabled=false){
    const lbl=document.createElement('label');lbl.textContent=label;grid.append(lbl);
    const wrap=document.createElement('div');wrap.className='spl-vec';
    const coords=['x','y','z'];
    for(const axis of coords){
        const unit=document.createElement('label');unit.className='spl-axis';
        const a=document.createElement('span');a.textContent=axis.toUpperCase();
        const input=document.createElement('input');input.type='number';input.step='0.01';input.value=Number(value?.[axis]||0).toFixed(3);input.setAttribute('aria-label',`${label} ${axis}`);input.dataset.axis=axis;input.disabled=disabled;
        unit.append(a,input);wrap.append(unit);
        input.addEventListener('change',async()=>{
            const next={x:Number(wrap.querySelector('input[data-axis="x"]').value),y:Number(wrap.querySelector('input[data-axis="y"]').value),z:Number(wrap.querySelector('input[data-axis="z"]').value)};
            if(Object.values(next).some(n=>!Number.isFinite(n)))return show(panel,'Tọa độ phải là số hữu hạn.',true);
            await submit(panel,knotUuid,key,next);
        });
    }
    grid.append(wrap);
}
function numberRow(panel,grid,label,key,value,knotUuid,disabled=false){
    const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.type='number';input.step='0.01';input.min=0;input.value=String(value);input.disabled=disabled;grid.append(l,input);
    input.addEventListener('change',async()=>{const v=Number(input.value);if(!Number.isFinite(v)||v<0)return show(panel,'Tension phải ≥ 0.',true);await submit(panel,knotUuid,key,v);});
}
function modeRow(panel,grid,value,knotUuid){
    const l=document.createElement('label');l.textContent='Tangent';const select=document.createElement('select');
    ['AutoSmooth','Linear','Mirrored','Continuous','Broken'].forEach((name,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=name;select.append(option);});
    select.value=String(value);grid.append(l,select);select.addEventListener('change',()=>void submit(panel,knotUuid,'mode',Number(select.value)));
}
function checkboxRow(panel,grid,label,key,value,knotUuid){
    const l=document.createElement('label');l.textContent=label;
    const input=document.createElement('input');input.type='checkbox';input.checked=!!value;
    grid.append(l,input);
    input.addEventListener('change',()=>void submit(panel,knotUuid,key,input.checked));
}
function show(panel,msg,error=false){if(panel?.$.status){panel.$.status.className=error?'spl-error':'spl-status';panel.$.status.textContent=msg||'';}}
async function submit(panel,id,key,value){
    const r=await callEditor(panel,'set-knot-field',id,key,value);
    if(r?.ok){show(panel,'Đã cập nhật '+key+'.');if(!panel._editing)await refresh(panel);}
}
function renderKnots(panel,data){
    // Never destroy focused native numeric inputs mid-edit.
    if(panel._editing)return;
    const host=panel.$.knots;host.replaceChildren();
    if(!data.knots.length){host.textContent='Spline chưa có knot. Nhấn Add Knot.';return;}
    for(const knot of data.knots){
        const details=document.createElement('details');details.className='spl-knot';
        details.open=panel._openedKnots?.has(knot.uuid)||false;
        const summary=document.createElement('summary');summary.textContent=`${knot.index+1}. ${knot.name}`;details.append(summary);
        details.addEventListener('toggle',()=>{if(!panel._openedKnots)panel._openedKnots=new Set();if(details.open)panel._openedKnots.add(knot.uuid);else panel._openedKnots.delete(knot.uuid);});
        const buttons=document.createElement('div');buttons.className='spl-btns';
        buttons.append(createButton('◎ Select',()=>void callEditor(panel,'select-knot-id',knot.uuid)));
        const canSplit=data.closed||knot.index<data.knots.length-1;
        const splitButton=createButton('⊕ Split after',async()=>{
            const result=await callEditor(panel,'split-after-knot',knot.uuid);
            if(result?.ok){show(panel,'Đã chia đoạn Bezier không đổi hình dáng.');await refresh(panel);}
        });
        splitButton.disabled=!canSplit;
        splitButton.title=canSplit?'Split cubic Bezier tại giữa đoạn sau knot, giữ nguyên curve.':'Knot cuối của spline mở không có segment sau.';
        buttons.append(splitButton);
        const moveUp=createButton('↑',async()=>{const r=await callEditor(panel,'move-knot-id',knot.uuid,'up');if(r?.ok)await refresh(panel);});
        moveUp.disabled=knot.index===0;moveUp.title='Đưa knot lên trước trong Hierarchy';buttons.append(moveUp);
        const moveDown=createButton('↓',async()=>{const r=await callEditor(panel,'move-knot-id',knot.uuid,'down');if(r?.ok)await refresh(panel);});
        moveDown.disabled=knot.index===data.knots.length-1;moveDown.title='Đưa knot xuống sau trong Hierarchy';buttons.append(moveDown);
        buttons.append(createButton('− Delete',async()=>{
            if(data.knots.length<=2)return show(panel,'Cần ít nhất hai knot.',true);
            if(typeof confirm==='function'&&!confirm(`Xóa ${knot.name}?`))return;
            const result=await callEditor(panel,'delete-knot-id',knot.uuid);
            if(result?.ok)await refresh(panel);
        },'spl-danger'));
        details.append(buttons);
        const grid=document.createElement('div');grid.className='spl-knot-grid';
        xyzRow(panel,details,grid,'Position','position',knot.position,knot.uuid);
        modeRow(panel,grid,knot.mode,knot.uuid);
        checkboxRow(panel,grid,'Knot Local','tangentsInKnotSpace',knot.tangentsInKnotSpace,knot.uuid);
        if(knot.hasHandles)checkboxRow(panel,grid,'Edit Handles','editTangentHandles',knot.editTangentHandles,knot.uuid);
        numberRow(panel,grid,'Tension','tension',knot.tension,knot.uuid,knot.mode!==0);
        xyzRow(panel,details,grid,'Tangent In','tangentIn',knot.tangentIn,knot.uuid,knot.mode!==4);
        xyzRow(panel,details,grid,'Tangent Out','tangentOut',knot.tangentOut,knot.uuid,knot.mode===0||knot.mode===1);
        details.append(grid);host.append(details);
    }
}
async function refresh(panel){
    if(panel._closed)return;
    const token=panel._requestToken=(panel._requestToken||0)+1;
    try{
        const s=await Editor.Message.request(NAME,'get-spline');
        if(panel._closed||token!==panel._requestToken)return;
        if(!s||!s.found){panel.$.info.textContent=s?.message||s?.error||'Chọn một SplineContainer';panel.$.knots.textContent='';return;}
        panel.$.info.textContent=`${s.knots.length} knots · ${s.segments} curves · ${Number(s.length).toFixed(2)} units`;
        renderKnots(panel,s);
    }catch(e){if(!panel._closed&&token===panel._requestToken)show(panel,String(e?.message||e),true);}
}
module.exports={
    template,style:ownStyle,$,
    ready(){
        this._closed=false;this._openedKnots=new Set();this._editing=false;
        // Only native input widgets should block a list redraw; buttons such as
        // Select/Split still need the list to refresh immediately after clicking.
        const isInput=el=>el&&typeof el.matches==='function'&&el.matches('input,select,textarea');
        this.$.knots.addEventListener('focusin',e=>{if(isInput(e.target))this._editing=true;});
        this.$.knots.addEventListener('focusout',e=>{
            if(isInput(e.target)){this._editing=false;void refresh(this);}
        });
        for(const [key,msg] of [['modifiers','create-modifiers'],['objectController','create-object-controller'],
            ['morph','create-morph']]){
            this.$[key].addEventListener('click',()=>void callEditor(this,msg));
        }
        this.$.path2d.addEventListener('click' ,async()=>{const r=await callEditor(this,'create-2d-path');if(r?.ok)show(this,'Đã thêm 2D Path dưới spline (yêu cầu Canvas).');});
        this.$.deform.addEventListener('click',async()=>{const r=await callEditor(this,'create-mesh-deform');if(r?.ok)show(this,'Đã thêm Mesh Deform. Kéo imported Mesh vào Source Mesh.');});
        this.$.road.addEventListener('click',async()=>{const r=await callEditor(this,'create-road');if(r?.ok)show(this,'Đã thêm Road vào spline. Chọn node Road để chỉnh mặt đường.');});
        this.$.trigger.addEventListener('click',async()=>{const r=await callEditor(this,'create-trigger');if(r?.ok)show(this,'Trigger được tạo. Chọn node Trigger để cài progress và event.');});
        this.$.junction.addEventListener('click',async()=>{const r=await callEditor(this,'create-junction');if(r?.ok)show(this,'Junction được tạo. Chọn node Junction để liên kết các spline.');});
        this.$.positioner.addEventListener('click',async()=>{const r=await callEditor(this,'create-positioner');if(r?.ok)show(this,'Đã thêm Spline Positioner.');});
        this.$.projector.addEventListener('click',async()=>{const r=await callEditor(this,'create-projector');if(r?.ok)show(this,'Đã thêm Spline Projector.');});
        this.$.length.addEventListener('click',async()=>{const r=await callEditor(this,'create-length-monitor');if(r?.ok)show(this,'Đã thêm Spline Length Monitor.');});
        this.$.add.addEventListener('click',async()=>{const r=await callEditor(this,'add-knot');if(r?.ok)await refresh(this);});
        this.$.refresh.addEventListener('click',async()=>{const r=await callEditor(this,'refresh-preview');if(r?.ok){show(this,'Mesh đã cập nhật.');await refresh(this);}});
        this.$.reverse.addEventListener('click',async()=>{const r=await callEditor(this,'reverse-direction');if(r?.ok)await refresh(this);});
        this.$.import.addEventListener('click',async()=>{const r=await callEditor(this,'import-json',this.$.json.value);if(r?.ok){show(this,`Imported ${r.knots} knots.`);await refresh(this);}});
        void refresh(this);
    },
    update(dump){
        for(const field of fields){const p=dump?.value?.[field],widget=this.$['p_'+field];if(p&&widget?.render)widget.render(p);}
        void refresh(this);
    },
    close(){this._closed=true;this._requestToken=(this._requestToken||0)+1;},
};
