'use strict';
/**
 * Cocos 3.8 Inspector: a ui-prop must have stable identity during the edit.
 * Calling replaceChildren() on every update destroys focused input widgets and
 * breaks some object-reference/enum editors.  Each ui-prop is declared in the
 * template and its dump rendered by Cocos, which owns commits, undo and prefab overrides.
 * https://docs.cocos.com/creator/3.8/manual/en/editor/extension/inspector.html
 */
const NAME='cocos-splines';
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const style=`
:host{display:block;color:var(--color-normal-contrast,#d8e4ee)}
.spl-inspector{padding:3px 0 9px;font-size:12px;line-height:1.5}
.spl-header{padding:9px 10px;border:1px solid var(--color-border-normal,#374b5c);background:rgba(42,140,177,.09);border-radius:7px;margin:4px 0 9px}
.spl-header strong{font-size:13px;color:#82cae6}.spl-header p{margin:4px 0 0;opacity:.78;font-size:11px}
.spl-section{margin:7px 0;border:1px solid var(--color-border-normal,#364551);border-radius:6px;padding:6px 8px}
.spl-section>summary{cursor:pointer;font-weight:600;user-select:none;margin:0 0 6px}
.spl-prop{display:block;margin:5px 0;width:100%}
.spl-row[hidden],.spl-section[hidden]{display:none!important}
.spl-note{font-size:11px;color:var(--color-normal,#aebbc5);line-height:1.5;margin:8px 1px}
.spl-btns{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0}
.spl-btn{background:rgba(52,102,131,.22);border:1px solid #4c7182;border-radius:5px;padding:5px 8px;font-size:11px;color:inherit;cursor:pointer}
.spl-btn:hover{background:rgba(73,141,172,.27)}.spl-btn:disabled{opacity:.4;cursor:default}
.spl-danger{border-color:#a05f63}.spl-error{color:#f9a9a5;white-space:pre-wrap;font-size:11px}
.spl-status{font-size:11px;min-height:14px;color:#8ad6bb}
`;
const configs={
  modifiers:{title:'Spline Modifiers',note:'Keyframes theo normalized ARC progress. Empty Keys = no change. Speed/Offset/Roll ảnh hưởng Animate (nếu gán Modifiers); Width ảnh hưởng Road; Scale/Offset ảnh hưởng Object Controller.',groups:[{title:'Keyed spline modifiers',fields:['spline','interpolation','keys']}]},
  objectController:{title:'Spline Object Controller',note:'Rải nhiều prefab theo Count/Distance, có random ổn định theo seed. Chỉ tạo game objects khi Play, không ghi clone vào Scene Editor.',groups:[{title:'Source',fields:['spline','prefabs','parentNode','modifiers']},{title:'Placement',fields:['method','count','spacing','startProgress','endProgress','includeEndPoint','alignToSpline','offset']},{title:'Variants & jitter',fields:['randomPosition','randomRotation','randomScale','scaleMultiplier','seed','rebuildOnChange']}]},
  junctionMesh:{title:'Spline Junction Mesh',note:'Bản 0.9: Surface patch trên mặt phẳng XZ, hỗ trợ 2-4 nhánh coplanar; không phải union/weld road meshes. Link từ Junction phải trùng world position, sử dụng chung Material asset với Roads. Có thể cần tắt Road cap để giảm overlap.',groups:[{title:'Junction',fields:['junction','material']},{title:'Patch geometry',fields:['setback','defaultWidth','surfaceLift','uvMetersPerRepeat','tolerance','rebuildOnChange']}]},
  bender:{title:'Spline Object Bender',note:'Uốn tất cả readable single-submesh MeshRenderer của hierarchy, giữ Material và source Mesh. Root chứa Bender không được là parent của Spline source. Bật Preview in Editor, Apply rồi Restore; cần Allow Data Access cho từng mesh.',groups:[{title:'Source',fields:['spline','axis']},{title:'Range',fields:['rangeMode','startProgress','endProgress','startDistance','endDistance']},{title:'Mesh & Preview',fields:['widthScale','heightScale','maxMeshes','previewInEditor','rebuildOnChange']}]},
  morph:{title:'Spline Morph',note:'Hai spline nguồn phải khác output. Output phải có >=2 Knot không dùng Tangent Handle Node. Cùng số knot => blend chính xác cubic tangents; khác số knot => resample xấp xỉ. Preview in Editor là opt-in, Restore hoàn nguyên output.',groups:[{title:'Sources & output',fields:['sourceA','sourceB','outputSpline']},{title:'Morph',fields:['blend','previewInEditor','updateOnChange']}]},
  knot:{title:'Spline Knot',note:'Bật Edit Tangent Handles khi có Node handles để luôn thấy curve/tangent trong Scene. Tắt để ẩn hiển thị liên tục; chọn Knot vẫn luôn thấy hai tangent, kể cả Container tắt Show Tangents. Kéo handle bằng W; thao tác chỉ ảnh hưởng hiển thị, không xóa handle Node.',groups:[{title:'Tangent mode',fields:['mode','tension','tangentIn','tangentOut','tangentsInKnotSpace']},{title:'Optional handles',fields:['tangentInHandle','tangentOutHandle','editTangentHandles']}]},
  extrude:{title:'Spline Extrude',note:'Spline để trống nếu SplineExtrude cùng Node với SplineContainer.',groups:[{title:'Source & geometry',fields:['spline','radius','endRadius','rangeMode','startProgress','endProgress','startDistance','endDistance','sides','segmentsPerCurve','capEnds','flipNormals','uvTiling']},{title:'Material & update',fields:['material','rebuildOnChange']}]},
  road:{title:'Spline Road',note:'Road là node con của SplineContainer (MeshRenderer riêng, không xung đột Extrude). Chỉnh Width/Shoulder/Curbs, vật liệu và UV ngay trong Inspector. Kéo các Knot ở Scene để uốn đường. Nút Rebuild cập nhật kể cả khi Editor không chạy main loop.',groups:[{title:'Source & Road Surface',fields:['spline','modifiers','width','endWidth','rangeMode','startProgress','endProgress','startDistance','endDistance','samplesPerCurve']},{title:'Shoulders & Curbs',fields:['shoulderWidth','shoulderDrop','curbWidth','curbHeight']},{title:'Volume & UV',fields:['thickness','capEnds','uvMetersPerRepeat']},{title:'Material & live update',fields:['roadMaterial','asphaltColor','rebuildOnChange']}]},
  trigger:{title:'Spline Trigger',note:'Spline để trống sẽ tìm Container ở parent. Chọn Position Mode: Normalized Distance (legacy), Distance (units) hoặc Spline t (Bezier). Khi follower đi ngang marker, phát Cocos EventHandler + node.emit(\'spline-trigger\', payload).',groups:[{title:'Marker',fields:['spline','positionMode','progress','distance','direction','workOnce','oncePerFollower']},{title:'Events',fields:['onCross']}]},
  junction:{title:'Spline Junction',note:'Thêm ít nhất 2 Connections. Gán mỗi link SplineContainer + Position Mode; nhập Progress 0..1 hoặc Distance theo chiều dài spline. SplineAnimate chọn Junction Mode: First Other / Round Robin / Manual. Event payload cung cấp follower để gọi requestJunctionExit(index).',groups:[{title:'Routes',fields:['connections']},{title:'Events',fields:['onReach','onSwitch']}]},
  instantiate:{title:'Spline Instantiate',note:'Prefab chỉ được sinh trong gameplay, không tự ghi Prefab vào Scene Editor.',groups:[{title:'Source',fields:['spline','prefab','parentNode']},{title:'Distribution',fields:['count','method','spacing','rangeMode','startProgress','endProgress','startDistance','endDistance','includeEndPoint','alignToSpline','positionOffset','rotationOffset','randomOffset','seed','scaleMultiplier','rebuildOnChange']}]},
  path2d:{title:'Spline 2D Path',note:'Sử dụng dưới Canvas/RenderRoot2D + UITransform, thuộc tính Dimension của spline phải là XY2D. Đường được vẽ bằng Graphics; không cần MeshRenderer.',groups:[{title:'Spline & appearance',fields:['spline','lineWidth','strokeColor','stepsPerCurve','rebuildOnChange']}]},
  deform:{title:'Spline Mesh Deform',note:'Gán một imported Mesh có chiều dài theo trục X/Y/Z và Allow Data Access. Mesh phải đủ segments dọc trục uốn, chỉ hỗ trợ 1 submesh non-skinned. Hệ trục X/Y đã tự sửa chiều mặt (winding). Nếu mesh nguồn vẫn đảo mặt, bật Flip Faces (đảo cả index và normal). UV Distance dùng material/shader ngoài plugin; texture nên Wrap Repeat. Plugin xuất smooth normals và tangents để dùng được builtin-standard/normal map. Axis X/Y đã tự sửa mặt: nếu lật Flip Faces ON có thể làm vật thể tối/mất mặt trước.',groups:[{title:'Source mesh',fields:['spline','sourceMesh','material']},{title:'Deform axis & distribution',fields:['axis','mode','repeatCount','flipFaces','widthScale','heightScale','rangeMode','startProgress','endProgress','startDistance','endDistance']},{title:'UV & rebuild',fields:['uvMode','uvTilesPerUnit','rebuildOnChange']}]},
  positioner:{title:'Spline Positioner',note:'Dreamteck-inspired. Đặt node vào t hoặc Distance mà không cần Animate. Follow Target sẽ project node tham chiếu lên spline, rồi cộng Follow Distance. Trong Editor, bật Preview in Editor mới di chuyển node và tắt để Restore.',groups:[{title:'Source & target',fields:['spline','target']},{title:'Placement',fields:['positionMode','progress','distance','followTarget','followDistance','wrapClosed','splineOffset','alignToSpline','rotationOffset']},{title:'Preview & runtime',fields:['followOnUpdate','previewInEditor']}]},
  projector:{title:'Spline Projector',note:'Chiếu vị trí Source Node đến điểm gần nhất của spline trong WORLD space, kể cả non-uniform scale. Projected Node là marker di chuyển khi Snap to Spline bật. Để tránh Source và Marker tự khóa vào nhau, sử dụng 2 Node khác nhau. On Enter/Exit sử dụng bán kính world units.',groups:[{title:'Source & projection',fields:['spline','sourceNode','projectedNode','samples','autoProject','snapToSpline','alignToSpline','splineOffset']},{title:'Proximity events',fields:['enterExitRadius','notifyOnProject','onProject','onEnter','onExit']},{title:'Editor preview',fields:['previewInEditor']}]},
  length:{title:'Spline Length Monitor',note:'Tương tự Dreamteck LengthCalculator: theo dõi chiều dài spline trong local units, phát On Changed / Growing / Shrinking và event khi vượt qua threshold. Có thể Measure Length trong Inspector. Editor không tự phát gameplay events.',groups:[{title:'Length check',fields:['spline','threshold','tolerance','autoCheck']},{title:'Events',fields:['onChanged','onGrowing','onShrinking','onCrossAbove','onCrossBelow']}]},
  animate:{title:'Spline Animate' ,note:'Kéo Node chứa SplineContainer vào trường Spline. Target để trống sẽ di chuyển chính Node gắn SplineAnimate. Nếu Animate đặt trên chính Container, hãy gán Target là Node khác. Bật Preview in Editor để xem vị trí mà không cần Play. Start/Preview hỗ trợ Normalized Distance, Distance và Spline t.',groups:[
    {title:'Spline source',fields:['spline','target','modifiers','worldOffset','splineOffset','constantSpeedWithOffset']},
    {title:'Playback',fields:['method','duration','speed','loopMode','easing','alignToSpline','upMode','forwardAxis','rotationOffset','orient2D','orient2DAngleOffset','playOnStart','startPositionMode','startProgress','startDistance']},
    {title:'Junction routing & follower events',fields:['junctionMode','onBeginningReached','onEndReached']},
    {title:'Editor preview',fields:['previewInEditor','previewPositionMode','previewProgress','previewDistance']},
  ]},
};
function makeInspector(type){
    const config=configs[type];if(!config)throw Error('Unknown inspector '+type);
    const selectors={status:'.spl-status'};
    let groups='';
    config.groups.forEach((g,i)=>{
        const items=g.fields.map(field=>{
            if(selectors['p_'+field])throw Error('Duplicate field '+field);
            selectors['p_'+field]='.spl-field-'+field;
            selectors['r_'+field]='.spl-row-'+field;
            return `<div class="spl-row spl-row-${field}"><ui-prop type="dump" class="spl-prop spl-field-${field}"></ui-prop></div>`;
        }).join('');
        groups+=`<details class="spl-section" open><summary>${escapeHtml(g.title)}</summary>${items}</details>`;
    });
    if(type==='junction'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-add-junction-mesh">＋ Add XZ Road Patch</button></div>`;
        selectors.addJunctionMesh='.spl-add-junction-mesh';
    }
    if(type==='road'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-rebuild-road">↻ Rebuild Road</button></div>`;
        selectors.rebuildRoad='.spl-rebuild-road';
    }
    if(type==='deform'||type==='path2d'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-rebuild-geometry">↻ Rebuild ${type==='deform'?'Mesh':'2D Path'}</button></div>`;
        selectors.rebuildGeometry='.spl-rebuild-geometry';
    }
    if(type==='junctionMesh'||type==='bender'||type==='morph'){
        const names={junctionMesh:['Rebuild Patch','rebuild-junction-patch'],bender:['Apply Bend','apply-bender'],morph:['Apply Morph','apply-morph']};
        const actions=names[type];
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-action">${actions[0]}</button>`+
            (type!=='junctionMesh'?'<button type="button" class="spl-btn spl-unapply">↶ Restore</button>':'')+'</div>';
        selectors.action='.spl-action';
        if(type!=='junctionMesh')selectors.unapply='.spl-unapply';
    }
    if(type==='animate'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-preview">▶ Preview position</button><button type="button" class="spl-btn spl-restore">↶ Stop / Restore</button></div>`;
        selectors.preview='.spl-preview';selectors.restore='.spl-restore';
    }
    if(type==='positioner'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-apply-pos">▶ Preview position</button><button type="button" class="spl-btn spl-restore-pos">↶ Restore</button></div>`;
        selectors.applyPositioner='.spl-apply-pos';selectors.restorePositioner='.spl-restore-pos';
    }
    if(type==='projector'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-project">◎ Project Now</button></div>`;
        selectors.projectNow='.spl-project';
    }
    if(type==='length'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-length">↔ Measure Length</button></div>`;
        selectors.measureLength='.spl-length';
    }
    if(type==='knot'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-handles">＋ Create Tangent Handles</button><button type="button" class="spl-btn spl-in">✥ Edit Tangent In</button><button type="button" class="spl-btn spl-out">✥ Edit Tangent Out</button><button type="button" class="spl-btn spl-container">↑ Select Container</button></div>`;
        selectors.handles='.spl-handles';
        selectors.selectIn='.spl-in';selectors.selectOut='.spl-out';
        selectors.container='.spl-container';
    }
    const template=`<div class="spl-inspector"><div class="spl-header"><strong>∿ ${escapeHtml(config.title)}</strong></div>${groups}<p class="spl-note">${escapeHtml(config.note)}</p><div class="spl-status" role="status"></div></div>`;
    const fields=config.groups.flatMap(g=>g.fields);
    function shouldShow(field,dump){
        const raw=dump?.value||{};
        const v=name=>raw[name]?.value;
        // The editing switch is meaningful only when one or both handle Nodes
        // are assigned. Hiding the ui-prop does not reset its serialized value.
        if((type==='positioner')&&field==='progress'&&Number(v('positionMode'))===1)return false;
        if((type==='positioner')&&field==='distance'&&Number(v('positionMode'))!==1)return false;
        if(type==='projector'&&['alignToSpline','splineOffset'].includes(field)&&!v('snapToSpline'))return false;
        if(type==='knot'&&field==='editTangentHandles')return !!(v('tangentInHandle')||v('tangentOutHandle'));
        // Progress is backward-compatible normalized ARC length; 'Spline t' uses
        // the same 0..1 input but passes through the cubic arc lookup table.
        if(type==='trigger'){
            if(field==='progress')return Number(v('positionMode'))!==1;
            if(field==='distance')return Number(v('positionMode'))===1;
        }
        if(['road','extrude','instantiate','deform','bender'].includes(type)){
            if(['startProgress','endProgress'].includes(field))return Number(v('rangeMode'))!==1;
            if(['startDistance','endDistance'].includes(field))return Number(v('rangeMode'))===1;
        }
        if(type==='animate'){
            if(field==='startProgress')return Number(v('startPositionMode'))!==1;
            if(field==='startDistance')return Number(v('startPositionMode'))===1;
            if(field==='previewProgress')return Number(v('previewPositionMode'))!==1;
            if(field==='previewDistance')return Number(v('previewPositionMode'))===1;
        }
        if(type==='animate'){
            if(field==='duration')return Number(v('method'))===0;
            if(field==='speed')return Number(v('method'))===1;
            if(['upMode','forwardAxis','rotationOffset'].includes(field))return v('alignToSpline')===true;
        }
        if(type==='deform'){
            if(field==='repeatCount')return Number(v('mode'))===1;
            if(field==='uvTilesPerUnit')return Number(v('uvMode'))===2;
        }
        if(type==='objectController'){
            if(field==='count')return Number(v('method'))===0;
            if(field==='spacing')return Number(v('method'))===1;
        }
        if(type==='instantiate'){
            if(field==='count')return Number(v('method'))===0;
            if(field==='spacing')return Number(v('method'))===1;
        }
        return true;
    }
    return {
        template,style,$:selectors,
        update(dump){
            this._splineDump=dump;
            if(type==='knot'){
                const v=key=>dump?.value?.[key]?.value;
                if(this.$.handles)this.$.handles.disabled=!!(v('tangentInHandle')||v('tangentOutHandle'));
                if(this.$.selectIn)this.$.selectIn.disabled=!v('tangentInHandle');
                if(this.$.selectOut)this.$.selectOut.disabled=!v('tangentOutHandle');
            }
            for(const field of fields){
                const prop=dump&&dump.value&&dump.value[field];
                const row=this.$['r_'+field], widget=this.$['p_'+field];
                if(row)row.hidden=!prop||!shouldShow(field,dump);
                if(prop&&widget&&typeof widget.render==='function')widget.render(prop);
            }
            // An Editor with scene mainloop disabled still needs a redraw on slider commit.
            if(type==='road'||type==='deform'||type==='path2d'){
                const propValues=dump&&dump.value||{};
                const key=fields.map(f=>JSON.stringify(propValues[f]?.value??null)).join('|');
                if(this._roadSignature!==key){this._roadSignature=key;void callEditor(this,type==='road'?'rebuild-road':type==='deform'?'rebuild-mesh-deform':'rebuild-2d-path');}
            }
            if(type==='animate'){
                const enabled=dump&&dump.value&&dump.value.previewInEditor?.value;
                const progress=dump&&dump.value&&dump.value.previewProgress?.value;
                const previewMode=dump?.value?.previewPositionMode?.value;
                const previewDistance=dump?.value?.previewDistance?.value;
                const key=String(enabled)+'|'+String(progress)+'|'+String(previewMode)+'|'+String(previewDistance);
                if(key!==this._previewState){
                    this._previewState=key;
                    if(enabled===true)void callEditor(this,'preview-animate');
                    else if(this._previewWasOn)void callEditor(this,'stop-preview-animate');
                    this._previewWasOn=enabled===true;
                }
            }
        },
        ready(){
            if(type==='junctionMesh'||type==='bender'||type==='morph'){
                const name=type==='junctionMesh'?'rebuild-junction-patch':type==='bender'?'apply-bender':'apply-morph';
                this.$.action.addEventListener('click',()=>void callEditor(this,name));
                if(this.$.unapply)this.$.unapply.addEventListener('click',()=>void callEditor(this,type==='bender'?'restore-bender':'restore-morph'));
            }
            if(type==='junction')this.$.addJunctionMesh.addEventListener('click',()=>void callEditor(this,'create-junction-mesh'));
            if(type==='road')this.$.rebuildRoad.addEventListener('click',()=>void callEditor(this,'rebuild-road'));
            if(type==='deform'||type==='path2d')this.$.rebuildGeometry.addEventListener('click',()=>void callEditor(this,type==='deform'?'rebuild-mesh-deform':'rebuild-2d-path'));
            if(type==='animate'){
                this.$.preview.addEventListener('click',()=>void callEditor(this,'preview-animate'));
                this.$.restore.addEventListener('click',()=>void callEditor(this,'stop-preview-animate'));
            }
            if(type==='positioner'){
                this.$.applyPositioner.addEventListener('click',()=>void callEditor(this,'apply-positioner'));
                this.$.restorePositioner.addEventListener('click',()=>void callEditor(this,'restore-positioner'));
            }
            if(type==='projector')this.$.projectNow.addEventListener('click',()=>void callEditor(this,'project-now'));
            if(type==='length')this.$.measureLength.addEventListener('click',()=>void callEditor(this,'measure-length'));
            if(type==='knot'){
                this.$.container.addEventListener('click',()=>void callEditor(this,'select-container'));
                this.$.handles.addEventListener('click',()=>void callEditor(this,'create-tangent-handles'));
                this.$.selectIn.addEventListener('click',()=>void callEditor(this,'select-tangent-handle','in'));
                this.$.selectOut.addEventListener('click',()=>void callEditor(this,'select-tangent-handle','out'));
            }
        },
        close(){this._splineDump=null;this._previewState=null;this._previewWasOn=false;},
    };
}
async function callEditor(inspector,message,...args){
    try{
        const result=await Editor.Message.request(NAME,message,...args);
        if(inspector?.$.status){
            inspector.$.status.className=result?.ok===false?'spl-error':'spl-status';
            inspector.$.status.textContent=result?.ok===false?(result.error||'Thao tác thất bại'):(result?.message||'');
        }
        return result;
    }catch(e){
        if(inspector?.$.status){inspector.$.status.className='spl-error';inspector.$.status.textContent=String(e?.message||e);}
        return {ok:false,error:String(e)};
    }
}
module.exports={makeInspector,style,callEditor,escapeHtml};
