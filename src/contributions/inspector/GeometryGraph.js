'use strict';
/** Phase 4.2a Inspector node canvas. All saved data passes through Cocos
 * Creator 3.8 ui-prop.dump/change-dump, preserving native Undo/Prefab overrides.
 */
const base=require('./common').makeInspector('geometryGraph');
const graph=require('../../SplineGeometryGraphVisualModel');
const conflict=require('../../SplineGeometryGraphConflict');
const {formatGeometryGraphProfile}=require('../../SplineGeometryGraphProfileReport');
const authored=require('../../SplineGeometryProfileEditor');
const library=require('../../SplineGeometryProfileLibrary');
const template=base.template+[
 '<details class="spl-section spl-vg-panel" open>',
 '<summary>Visual Geometry Graph · typed sockets</summary>',
 '<div class="spl-note">Drag node headers. Click an output socket then a compatible input socket to connect. All edits use native Inspector property commits. For Mesh Deform imported geometry, attach Mesh Asset Input and assign Source Mesh on the Renderer.</div>',
 '<div class="spl-vg-toolbar spl-vg-asset-toolbar">',
 '<button type="button" class="spl-btn spl-vg-export">Export JSON…</button>',
 '<button type="button" class="spl-btn spl-vg-import">Import JSON → Local…</button>',
 '<button type="button" class="spl-btn spl-vg-copy-local">Copy Asset to Local</button>',
 '<button type="button" class="spl-btn spl-vg-refresh">Refresh Asset View</button>',
 '</div>',
 '<div class="spl-vg-toolbar spl-vg-shared-toolbar">',
 '<button type="button" class="spl-btn spl-vg-edit-shared">Edit Shared Asset…</button>',
 '<button type="button" class="spl-btn spl-vg-save-shared">Save Shared JSON…</button>',
 '<button type="button" class="spl-btn spl-vg-discard-shared">Discard Draft</button>',
 '<button type="button" class="spl-btn spl-vg-review-shared">Compare with Source</button>',
 '<button type="button" class="spl-btn spl-vg-rebase-shared">Rebase Safe Changes</button>',
 '</div>',
 '<div class="spl-vg-source-mode" role="status">Local graph JSON</div>',
 '<details class="spl-section spl-vg-order-section" open>',
 '<summary>Render All Outputs · material slot order</summary>',
 '<div class="spl-note">Output IDs in Material A/B/C/D slots on THIS renderer. Use arrows to reorder without editing a shared graph.</div>',
 '<div class="spl-vg-order-list" role="group" aria-label="Output material slot order"></div>',
 '<button type="button" class="spl-btn spl-vg-order-reset">Reset alphabetical order</button>',
 '</details>',
 '<details class="spl-section spl-profile-editor" open>',
 '<summary>Authored Profile Editor · JsonAsset drafts</summary>',
 '<div class="spl-note">Pick Profile Asset A/B/C; edit vertices (blue), edges (green), and UV0 seam/edge weights. UV seam is highlighted pink. Changes are draft-only until Save; Undo/Redo does NOT restore saved JsonAsset files.</div>',
 '<div class="spl-vg-toolbar">',
 '<label>Profile Slot <select class="spl-profile-slot"><option value="0">A</option><option value="1">B</option><option value="2">C</option></select></label>',
 '<button type="button" class="spl-btn spl-profile-open">Edit Profile Asset…</button>',
 '<button type="button" class="spl-btn spl-profile-save">Save Profile JSON…</button>',
 '<button type="button" class="spl-btn spl-profile-discard">Discard Profile Draft</button>',
 '<button type="button" class="spl-btn spl-profile-undo">Undo Draft</button>',
 '<button type="button" class="spl-btn spl-profile-redo">Redo Draft</button>',
 '<label>Drag Snap <select class="spl-profile-snap"><option value="0">Free</option><option value="0.01">0.01</option><option value="0.05">0.05</option><option value="0.1">0.10</option></select></label>',
 '</div>',
 '<div class="spl-vg-toolbar spl-profile-library">',
 '<label>Profile Library <select class="spl-profile-preset">'+
  library.PRESETS.map(p=>'<option value="'+p.id+'">'+p.label+'</option>').join('')+
  '</select></label>',
 '<button type="button" class="spl-btn spl-profile-apply-preset">Load Preset into Draft</button>',
 '<button type="button" class="spl-btn spl-profile-create-preset">Create Preset JSON…</button>',
 '<button type="button" class="spl-btn spl-profile-export-draft">Export Draft As New JSON…</button>',
 '<span class="spl-profile-preset-note">Load changes only the draft (Undo supported). Create / Export writes a NEW JsonAsset with confirmation; manually assign a Profile Asset slot.</span>',
 '</div>',
 '<div class="spl-profile-status" role="status" aria-live="polite">Select an authored Profile Asset slot to begin.</div>',
 '<div class="spl-profile-canvas"></div>',
 '</details>',
 '<div class="spl-vg-conflict" role="status" aria-live="polite"></div>',
 '<div class="spl-vg-toolbar">',
 '<button type="button" class="spl-btn spl-vg-add-offset">＋ Offset</button>',
 '<button type="button" class="spl-btn spl-vg-add-width">＋ Width</button>',
 '<button type="button" class="spl-btn spl-vg-switch-generator">Switch to Tube</button>',
 '<button type="button" class="spl-btn spl-vg-use-extrude">Use Extrude Profile</button>',
 '<button type="button" class="spl-btn spl-vg-use-deform">Use Mesh Deform</button>',
 '<button type="button" class="spl-btn spl-vg-attach-mesh">＋ Mesh Asset Input</button>',
 '<button type="button" class="spl-btn spl-vg-detach-mesh">✕ Mesh Asset Input</button>',
 '<button type="button" class="spl-btn spl-vg-add-output">＋ Output Branch</button>',
 '<button type="button" class="spl-btn spl-vg-default-output">Set Default Output</button>',
 '<button type="button" class="spl-btn spl-vg-remove-output">✕ Remove Output</button>',
 '<button type="button" class="spl-btn spl-vg-remove">✕ Remove</button>',
 '<button type="button" class="spl-btn spl-vg-auto-layout">⇱ Auto Layout</button>',
 '</div>',
 '<div class="spl-vg-viewport" tabindex="0" aria-label="Scrollable typed node graph">',
 '<div class="spl-vg-stage" role="group" aria-label="Geometry graph nodes"></div>',
 '</div>',
 '<div class="spl-vg-properties" aria-live="polite">Select a node to edit its parameters.</div>',
 '<div class="spl-vg-toolbar">',
 '<button type="button" class="spl-btn spl-vg-profile">Profile CPU · Cold / Warm</button>',
 '</div>',
 '<pre class="spl-vg-profile-report" role="status" aria-live="polite">Run Profile CPU to measure individual graph nodes.</pre>',
 '<div class="spl-vg-status" role="status">Ready.</div>',
 '</details>'
].join('');
const style=base.style+[
'.spl-vg-toolbar{display:flex;gap:4px;flex-wrap:wrap;margin:7px 0}',
'.spl-vg-order-row{display:flex;align-items:center;gap:5px;margin:3px 0;font-size:11px}',
'.spl-vg-order-id{flex:1;min-width:0;overflow-wrap:anywhere}',
'.spl-vg-order-row .spl-btn{padding:2px 7px}',
'.spl-profile-canvas{margin:8px 0;font-size:11px}',
'.spl-profile-coordinates{display:flex;gap:10px;margin:8px 0}',
'.spl-profile-coordinates input{width:90px;color:inherit;background:#1b3544;border:1px solid #53728a;padding:3px}',
'.spl-profile-slot,.spl-profile-snap,.spl-profile-preset,.spl-profile-uv-island-mode{color:inherit;background:#1b3544;border:1px solid #53728a;border-radius:3px}',
'.spl-profile-preset-note{font-size:10px;color:#b0c4d0;align-self:center}',
'.spl-profile-status{white-space:pre-wrap;font-size:11px;color:#a9c1cf}',
'.spl-profile-count{margin:6px 0;color:#b6d4df}',
'.spl-profile-uv-controls{margin:8px 0;padding:7px;border:1px solid #42667b;border-radius:5px}',
'.spl-profile-uv-info{font-size:11px;color:#b5d3e1;line-height:1.6}',
'.spl-profile-uv-controls input{width:80px;color:inherit;background:#1b3544;border:1px solid #53728a;padding:3px}',
'.spl-vg-viewport{overflow:auto;max-width:100%;height:360px;border:1px solid #3c6172;border-radius:6px;background:rgba(18,26,36,.65);touch-action:pan-x pan-y}',
'.spl-vg-stage{position:relative;width:860px;height:410px;min-width:860px;min-height:410px}',
'.spl-vg-wires{position:absolute;inset:0;pointer-events:none}',
'.spl-vg-wire{stroke-width:2.5;stroke:#64a8cf;opacity:.9}',
'.spl-vg-wire-mesh{stroke:#dbad69}',
'.spl-vg-card{position:absolute;width:144px;height:90px;border-radius:7px;box-sizing:border-box;border:1px solid #436477;background:#263746;color:#d2e9f0;box-shadow:0 2px 8px rgba(0,0,0,.24);overflow:hidden;user-select:none}',
'.spl-vg-card.selected{border-color:#9de0fb;box-shadow:0 0 0 1px #72baca}',
'.spl-vg-card.pending{outline:2px dashed #f0c57f}',
'.spl-vg-head{padding:4px 7px;font-size:12px;font-weight:700;background:#344e5f;cursor:grab;touch-action:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.spl-vg-head:active{cursor:grabbing}',
'.spl-vg-type{font-size:10px;color:#a9c1cf;padding:2px 8px}',
'.spl-vg-socket{position:absolute;bottom:5px;line-height:15px;height:20px;border:1px solid #53728a;border-radius:4px;background:#1d3041;color:#e1f2f8;font-size:10px;cursor:pointer;padding:1px 4px}',
'.spl-vg-socket.in{left:3px}.spl-vg-socket.out{right:3px}',
'.spl-vg-socket.mesh{border-color:#a68b63;color:#ffc98b}',
'.spl-vg-socket.meshSource{border-color:#8fb18c;color:#b7edba}',
'.spl-vg-socket.mesh-in{bottom:29px;left:3px}',
'.spl-vg-socket:hover{filter:brightness(1.3)}',
'.spl-vg-properties{margin:8px 0;padding:7px;border:1px solid #3b576b;border-radius:6px;font-size:11px}',
'.spl-vg-source,.spl-vg-note{font-size:10px;color:#b0c4d0;margin:4px 0}',
'.spl-vg-params{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;margin-top:6px}',
'.spl-vg-params label{display:flex;flex-direction:column;gap:2px}',
'.spl-vg-width-keys{margin-top:9px;border-top:1px solid #476277;padding-top:6px}',
'.spl-vg-width-svg{display:block;max-width:100%;height:auto;margin:6px 0;background:#142a38;touch-action:none;border:1px solid #45687d;border-radius:5px}',
'.spl-vg-width-svg circle{cursor:grab;touch-action:none}',
'.spl-vg-width-svg circle:active{cursor:grabbing}',
'.spl-vg-width-row{display:grid;grid-template-columns:48px 1fr 1fr 25px;gap:6px;align-items:end;margin:4px 0}',
'.spl-vg-width-row label{display:flex;flex-direction:column;font-size:10px}',
'.spl-vg-width-row input{width:100%;min-width:0;box-sizing:border-box;background:#1b3544;color:inherit;border:1px solid #53728a}',
'.spl-vg-width-row button,.spl-vg-width-keys>button{background:#28485c;color:inherit;border:1px solid #53728a;border-radius:4px;cursor:pointer}',
'.spl-vg-width-row button:disabled,.spl-vg-width-keys>button:disabled{opacity:.4;cursor:default}',
'.spl-vg-params input:not([type=checkbox]),.spl-vg-params select{min-width:0;width:100%;box-sizing:border-box;border:1px solid #546b78;border-radius:4px;background:rgba(22,37,51,.9);color:inherit;padding:4px}',
'.spl-vg-params input[type=checkbox]{align-self:flex-start}',
'.spl-vg-status{font-size:11px;white-space:pre-wrap;color:#9ad6c9;min-height:15px}',
'.spl-vg-status.error{color:#f7b2a9}',
'.spl-vg-conflict{font-size:11px;white-space:pre-wrap;color:#eacb97;margin:6px 0}',
'.spl-vg-profile-report{font:11px/1.6 ui-monospace,monospace;white-space:pre;overflow:auto;max-height:440px;margin:6px 0;padding:7px;border:1px solid #3b576b;border-radius:6px;color:#a9d8db;background:rgba(14,26,36,.5)}'
].join('\n');
const $={...base.$,
  vgExport:'.spl-vg-export',vgImport:'.spl-vg-import',
  vgCopyLocal:'.spl-vg-copy-local',vgRefresh:'.spl-vg-refresh',
  vgEditShared:'.spl-vg-edit-shared',vgSaveShared:'.spl-vg-save-shared',
  vgDiscardShared:'.spl-vg-discard-shared',
  vgReviewShared:'.spl-vg-review-shared',
  vgRebaseShared:'.spl-vg-rebase-shared',
  vgConflict:'.spl-vg-conflict',
  vgProfileSlot:'.spl-profile-slot',vgProfileOpen:'.spl-profile-open',
  vgProfileSave:'.spl-profile-save',vgProfileDiscard:'.spl-profile-discard',
  vgProfileStatus:'.spl-profile-status',vgProfileCanvas:'.spl-profile-canvas',
  vgProfileUndo:'.spl-profile-undo',vgProfileRedo:'.spl-profile-redo',
  vgProfileSnap:'.spl-profile-snap',
  vgProfilePreset:'.spl-profile-preset',vgProfileApplyPreset:'.spl-profile-apply-preset',
  vgProfileCreatePreset:'.spl-profile-create-preset',vgProfileExportDraft:'.spl-profile-export-draft',
  vgProfile:'.spl-vg-profile',vgProfileReport:'.spl-vg-profile-report',
  vgSourceMode:'.spl-vg-source-mode',
  vgOrderSection:'.spl-vg-order-section',
  vgOrderList:'.spl-vg-order-list',vgOrderReset:'.spl-vg-order-reset',
  vgStage:'.spl-vg-stage',vgViewport:'.spl-vg-viewport',
  vgProperties:'.spl-vg-properties',vgStatus:'.spl-vg-status',
  vgAddOffset:'.spl-vg-add-offset',vgAddWidth:'.spl-vg-add-width',
  vgSwitchGenerator:'.spl-vg-switch-generator',vgUseExtrude:'.spl-vg-use-extrude',
  vgUseDeform:'.spl-vg-use-deform',
  vgAttachMesh:'.spl-vg-attach-mesh',vgDetachMesh:'.spl-vg-detach-mesh',
  vgAddOutput:'.spl-vg-add-output',
  vgDefaultOutput:'.spl-vg-default-output',
  vgRemoveOutput:'.spl-vg-remove-output',
  vgRemove:'.spl-vg-remove',vgAuto:'.spl-vg-auto-layout'};
function status(panel,message,isError=false){
  panel._vgStatusError=!!isError;
  if(!panel.$?.vgStatus)return;
  panel.$.vgStatus.textContent=message;
  panel.$.vgStatus.classList?.toggle?.('error',isError);
}
function changeSummary(values){
  if(values.length===0)return 'none';
  return values.slice(0,12).join(', ')+(values.length>12?' … +'+(values.length-12):'');
}
function summarizeReview(panel){
  const draft=panel._vgSharedDraft,review=panel._vgSharedReview;
  if(!draft||!review)return '';
  const analysis=conflict.analyzeSharedGraphChanges(
    draft.initialGraphJson,draft.graphJson,review.graphJson);
  review.analysis=analysis;
  if(review.sha256===draft.sha256)return 'Source checksum unchanged since draft opened.';
  return [
    'Source changed since your draft was opened.',
    'Your edits: '+changeSummary(analysis.draftChanges),
    'Source edits: '+changeSummary(analysis.sourceChanges),
    analysis.structuralConflict?
      'Topology differs. Automatic rebase is blocked; keep draft or explicitly discard it.':
      analysis.conflicts.length>0?
        'Conflicting fields: '+changeSummary(analysis.conflicts)+'. Rebase blocked.':
        'No overlapping parameter changes. Rebase Safe Changes keeps your draft edits.',
    'This comparison does NOT save or replace either version.',
  ].join('\n');
}
/** UI mirror of the core complete-permutation validation, independent of
 * user-supplied JSON source so shared assets are never edited by slot actions.
 */
function readOutputOrder(ids,value){
  const sorted=ids.slice().sort();
  if(value==='')return sorted;
  if(typeof value!=='string'||value.length>200)
    throw Error('Output Order must be a comma-separated ID list.');
  const order=value.split(',').map(id=>id.trim());
  if(order.length!==sorted.length||new Set(order).size!==sorted.length||
     order.some(id=>!sorted.includes(id)))
    throw Error('Output Order must list every Output Node ID exactly once.');
  return order;
}
function profileStatus(panel,message,isError=false){
  if(!panel.$?.vgProfileStatus)return;
  panel.$.vgProfileStatus.textContent=message;
  panel.$.vgProfileStatus.classList?.toggle?.('error',isError);
}
function renderAuthoredProfile(panel){
  const draft=panel._vgAuthoredDraft;
  const blocked=!!panel._vgAuthoredBusy||!!panel._vgSharedBusy||
    !!panel._vgSharedDraft;
  if(panel.$?.vgProfileSlot)panel.$.vgProfileSlot.disabled=!!draft||blocked;
  if(panel.$?.vgProfileOpen)
    panel.$.vgProfileOpen.disabled=!!draft||blocked;
  if(panel.$?.vgProfileSave)
    panel.$.vgProfileSave.disabled=!draft||blocked||
      draft.profileJson===draft.initialProfileJson;
  if(panel.$?.vgProfileDiscard)
    panel.$.vgProfileDiscard.disabled=!draft||blocked;
  if(panel.$?.vgProfileUndo)
    panel.$.vgProfileUndo.disabled=!draft||blocked||!draft.undo?.length;
  if(panel.$?.vgProfileRedo)
    panel.$.vgProfileRedo.disabled=!draft||blocked||!draft.redo?.length;
  if(panel.$?.vgProfilePreset)
    panel.$.vgProfilePreset.disabled=!draft||blocked;
  if(panel.$?.vgProfileApplyPreset)
    panel.$.vgProfileApplyPreset.disabled=!draft||blocked||!!panel._vgAuthoredDrag;
  if(panel.$?.vgProfileCreatePreset)
    panel.$.vgProfileCreatePreset.disabled=blocked||!!panel._vgAuthoredDrag;
  if(panel.$?.vgProfileExportDraft)
    panel.$.vgProfileExportDraft.disabled=!draft||blocked||!!panel._vgAuthoredDrag;
  if(!panel.$?.vgProfileCanvas)return;
  if(!draft){
    panel.$.vgProfileCanvas.textContent='';
    return;
  }
  try{
    panel.$.vgProfileCanvas.innerHTML=
      authored.renderProfileControls(draft.profileJson,
        panel._vgAuthoredSelected||0,panel._vgAuthoredEdge??null);
  }catch(error){
    panel.$.vgProfileCanvas.textContent=String(error?.message||error);
  }
}
function applyAuthoredEdit(panel,action,details={}){
  const draft=panel._vgAuthoredDraft;
  if(!draft||panel._vgAuthoredBusy)return;
  try{
    const {baseProfile,...params}=details;
    const next=action==='library-preset'?
      library.applyProfilePreset(draft.profileJson,params.preset):
      authored.applyProfileEdit(baseProfile||draft.profileJson,action,
        {index:panel._vgAuthoredSelected,...params});
    if(next!==draft.profileJson){
      // One history entry per pointer drag, regardless of move event count.
      // Input/insert/remove remain individually undoable transactions.
      const drag=panel._vgAuthoredDrag;
      if(!drag||!drag.historySaved){
        draft.undo.push(drag?.baseProfile||draft.profileJson);
        if(draft.undo.length>32)draft.undo.shift();
        draft.redo.length=0;
        if(drag)drag.historySaved=true;
      }
      draft.profileJson=next;
      if(action==='library-preset'){
        panel._vgAuthoredSelected=0;
        panel._vgAuthoredEdge=null;
      }else if(action==='insert'||action==='insert-edge'){
        panel._vgAuthoredSelected=Number(params.index??panel._vgAuthoredSelected)+1;
        panel._vgAuthoredEdge=null;
      }else if(action==='remove'){
        panel._vgAuthoredSelected=Math.min(panel._vgAuthoredSelected,
          authored.parseProfile(next).points.length-1);
        panel._vgAuthoredEdge=null;
      }
    }
    renderAuthoredProfile(panel);
    profileStatus(panel,'Unsaved Profile draft: '+draft.assetName+
      ' · '+authored.parseProfile(draft.profileJson).points.length+
      ' validated points. Save explicitly to update JsonAsset.');
  }catch(error){profileStatus(panel,String(error?.message||error),true);}
}
function restoreAuthoredHistory(panel,mode){
  const draft=panel._vgAuthoredDraft;
  if(!draft||panel._vgAuthoredBusy||panel._vgAuthoredDrag)return;
  const from=mode==='undo'?draft.undo:draft.redo;
  const to=mode==='undo'?draft.redo:draft.undo;
  if(!from?.length)return;
  const prior=draft.profileJson;
  const next=authored.formatProfile(from.pop());
  to.push(prior);if(to.length>32)to.shift();
  draft.profileJson=next;
  panel._vgAuthoredSelected=Math.min(panel._vgAuthoredSelected,
    authored.parseProfile(next).points.length-1);
  panel._vgAuthoredEdge=null;
  renderAuthoredProfile(panel);
  profileStatus(panel,(mode==='undo'?'Undo':'Redo')+
    ' applied to unsaved Profile draft only.');
}
function snapProfileCoordinate(value,grid){
  return grid>0?Math.round(value/grid)*grid:value;
}
function render(panel){
  renderAuthoredProfile(panel);
  const draft=panel._vgSharedDraft;
  const reviewText=summarizeReview(panel);
  const sharedLocked=!!panel._vgShared&&!draft;
  const busy=!!panel._vgSharedBusy;
  if(panel.$?.vgProfile)
    panel.$.vgProfile.disabled=busy||!!draft||!!panel._vgProfileBusy;
  if(panel.$?.vgProfileReport)
    panel.$.vgProfileReport.textContent=panel._vgProfile?
      formatGeometryGraphProfile(panel._vgProfile):
      'Run Profile CPU to measure individual graph nodes. No Scene or JsonAsset changes.';
  if(panel.$?.vgSourceMode)panel.$.vgSourceMode.textContent=draft?
    'Shared JsonAsset · UNSAVED DRAFT. Graph edits are temporary; node layout stays locked.':
    panel._vgShared?
      'Shared JsonAsset mode · canvas is read-only until Edit Shared Asset is started.':
      'Local graph · editable Visual Canvas';
  for(const key of ['vgAddOffset','vgAddWidth','vgSwitchGenerator','vgUseExtrude','vgUseDeform','vgAttachMesh','vgDetachMesh','vgAddOutput','vgDefaultOutput','vgRemoveOutput','vgAuto','vgCopyLocal']){
    const element=panel.$?.[key];
    if(element)element.disabled=busy||(
      key==='vgCopyLocal'?(!panel._vgShared||!!draft):
      key==='vgAuto'?!!panel._vgShared:sharedLocked);
  }
  if(panel.$?.vgEditShared)panel.$.vgEditShared.disabled=!panel._vgShared||!!draft||busy;
  if(panel.$?.vgSaveShared)panel.$.vgSaveShared.disabled=!draft||busy||
    draft.graphJson===draft.initialGraphJson;
  if(panel.$?.vgDiscardShared)panel.$.vgDiscardShared.disabled=!draft||busy;
  if(panel.$?.vgReviewShared)panel.$.vgReviewShared.disabled=!draft||busy;
  if(panel.$?.vgRebaseShared)panel.$.vgRebaseShared.disabled=
    !draft||busy||!panel._vgSharedReview||
    panel._vgSharedReview.sha256===draft.sha256||
    !panel._vgSharedReview.analysis?.canRebase;
  for(const key of ['vgExport','vgImport'])if(panel.$?.[key])
    panel.$[key].disabled=!!draft||busy;
  if(panel.$?.vgConflict)panel.$.vgConflict.textContent=reviewText;
  if(panel.$?.vgRefresh)panel.$.vgRefresh.disabled=!!draft||busy;
  const stage=panel.$?.vgStage,properties=panel.$?.vgProperties;
  if(!stage||!properties)return;
  try{
    const view=graph.parseGraph(panel._vgGraphJson);
    if(panel.$?.vgOrderList){
      const enabled=panel._vgRenderAllOutputs===true&&view.graph.version===2&&
        view.outputs.length>=2;
      if(panel.$.vgOrderSection)panel.$.vgOrderSection.hidden=!enabled;
      if(panel.$.vgOrderReset)
        panel.$.vgOrderReset.disabled=!enabled||busy||!panel._vgOutputOrder;
      if(enabled){
        try{
          const ids=readOutputOrder(view.outputs,panel._vgOutputOrder??'');
          panel.$.vgOrderList.innerHTML=ids.map((id,i)=>
            '<div class="spl-vg-order-row"><span class="spl-vg-order-id">'+
            'Material '+String.fromCharCode(65+i)+' · '+id+'</span>'+
            '<button type="button" class="spl-btn" data-order-index="'+i+
            '" data-order-move="-1" '+(busy||i===0?'disabled':'')+
            ' aria-label="Move '+id+' up">↑</button>'+
            '<button type="button" class="spl-btn" data-order-index="'+i+
            '" data-order-move="1" '+(busy||i===ids.length-1?'disabled':'')+
            ' aria-label="Move '+id+' down">↓</button></div>'
          ).join('');
        }catch(error){
          panel.$.vgOrderList.textContent=String(error?.message||error)+
            ' Reset alphabetically or correct Output Order in native property.';
        }
      }else panel.$.vgOrderList.innerHTML='';
    }
    const finalGenerator=view.map.get(view.map.get(view.graph.output)?.input);
    if(panel.$?.vgSwitchGenerator){
      panel.$.vgSwitchGenerator.textContent=finalGenerator?.type==='tube'?'Switch to Ribbon':'Switch to Tube';
      panel.$.vgSwitchGenerator.disabled=sharedLocked||busy||
        !['ribbon','tube','extrude','meshDeform'].includes(finalGenerator?.type);
    }
    if(panel.$?.vgUseExtrude)
      panel.$.vgUseExtrude.disabled=sharedLocked||busy||
        !['ribbon','tube','meshDeform'].includes(finalGenerator?.type);
    if(panel.$?.vgUseDeform)
      panel.$.vgUseDeform.disabled=sharedLocked||busy||
        !['ribbon','tube','extrude'].includes(finalGenerator?.type);
    const selectedDeform=view.map.get(panel._vgSelected);
    if(panel.$?.vgAttachMesh)
      panel.$.vgAttachMesh.disabled=sharedLocked||busy||
        selectedDeform?.type!=='meshDeform'||!!selectedDeform.meshInput;
    if(panel.$?.vgDetachMesh)
      panel.$.vgDetachMesh.disabled=sharedLocked||busy||
        selectedDeform?.type!=='meshDeform'||!selectedDeform.meshInput;
    const selectedOutput=view.map.get(panel._vgSelected)?.type==='output'?
      panel._vgSelected:null;
    if(panel.$?.vgAddOutput)
      panel.$.vgAddOutput.disabled=sharedLocked||busy||
        view.outputs.length>=4||view.ordered.length>30;
    if(panel.$?.vgDefaultOutput)
      panel.$.vgDefaultOutput.disabled=sharedLocked||busy||
        !selectedOutput||selectedOutput===view.graph.output;
    if(panel.$?.vgRemoveOutput)
      panel.$.vgRemoveOutput.disabled=sharedLocked||busy||
        !selectedOutput||selectedOutput===view.graph.output;
    if(panel._vgSelected&&!view.map.has(panel._vgSelected))
      panel._vgSelected=null;
    stage.innerHTML=graph.renderGraphCanvas(panel._vgGraphJson,
      panel._vgPreviewLayout||panel._vgLayoutJson,panel._vgSelected,panel._vgPending);
    properties.innerHTML=graph.renderNodeParameters(panel._vgGraphJson,panel._vgSelected);
    if(panel.$.vgRemove)panel.$.vgRemove.disabled=
      sharedLocked||busy||!['offset','width'].includes(view.map.get(panel._vgSelected)?.type);
    if(!panel._vgDrag)
      status(panel,panel._vgPending?
        'Connecting from '+panel._vgPending+': click a matching input socket.':
        'Graph v'+view.graph.version+' valid · '+view.ordered.length+
        ' nodes · '+view.outputs.length+' output(s) · default: '+view.graph.output+
        ' · drag headers to arrange.');
  }catch(error){
    stage.textContent='Graph unavailable. Fix graphJson/layout JSON in the property Inspector.';
    properties.textContent='';
    if(panel.$?.vgOrderSection)panel.$.vgOrderSection.hidden=true;
    if(panel.$.vgRemove)panel.$.vgRemove.disabled=true;
    status(panel,String(error?.message||error),true);
  }
}
/** Native 3.8 ui-prop contract: pass a dump, change its value and dispatch
 * change-dump. Do not use low-level scene.set-property or a manual snapshot.
 */
function commitProperty(panel,key,nextValue){
  if(panel._vgSharedDraft){
    if(key!=='graphJson')throw Error('Shared asset layout is component-local and locked during a shared edit.');
    if(panel._vgSharedBusy)throw Error('Shared asset save is pending.');
    if(nextValue===panel._vgSharedDraft.graphJson)return false;
    panel._vgProfile=null;panel._vgProfileRequestToken++;
    panel._vgSharedDraft.graphJson=nextValue;
    panel._vgGraphJson=nextValue;
    return true;
  }
  if(panel._vgShared)throw Error('Shared JsonAsset is read-only: use Edit Shared Asset or Copy to Local.');
  if(!['graphJson','graphLayoutJson'].includes(key))
    throw Error('Visual Graph cannot edit '+key+'.');
  const dump=panel._splineDump?.value?.[key];
  const prop=panel.$?.['p_'+key];
  if(!dump||typeof dump.value!=='string'||!prop||
     typeof prop.dispatch!=='function')
    throw Error('Missing Cocos Inspector dump for '+key+'.');
  if(nextValue===dump.value)return false;
  panel._vgProfile=null;panel._vgProfileRequestToken++;
  const prior=dump.value;
  try{
    prop.dump=dump;
    dump.value=nextValue;
    prop.dispatch('change-dump');
  }catch(error){dump.value=prior;throw error;}
  if(key==='graphJson')panel._vgGraphJson=nextValue;
  else panel._vgLayoutJson=nextValue;
  return true;
}
/** Native component-level ui-prop commit, allowed even with shared graph
 * read-only. This does not call scene:set-property or modify Graph JSON.
 */
function commitOutputOrder(panel,value){
  if(panel._vgSharedBusy)throw Error('Shared graph operation pending.');
  const dump=panel._splineDump?.value?.outputOrder;
  const prop=panel.$?.p_outputOrder;
  if(!dump||typeof dump.value!=='string'||!prop||
     typeof prop.dispatch!=='function')
    throw Error('Missing native Cocos Inspector dump for Output Order.');
  if(value===dump.value)return false;
  const previous=dump.value;
  try{
    prop.dump=dump;dump.value=value;prop.dispatch('change-dump');
  }catch(error){dump.value=previous;throw error;}
  panel._vgOutputOrder=value;
  return true;
}
function activeOutputId(view,selectedId){
  const node=view.map.get(selectedId);
  if(node?.type==='output')return node.id;
  if(['ribbon','tube','extrude','meshDeform'].includes(node?.type)){
    const consumer=view.ordered.find(n=>n.type==='output'&&n.input===node.id);
    if(consumer)return consumer.id;
  }
  return view.graph.output;
}
function editGraph(panel,action,details){
  try{
    if(panel._vgSharedBusy)throw Error('Shared asset operation pending.');
    const prior=graph.parseGraph(panel._vgGraphJson);
    const output=graph.applyGraphEdit(panel._vgGraphJson,action,details);
    if(!commitProperty(panel,'graphJson',output))return;
    panel._vgPending=null;panel._vgPreviewLayout=null;
    if(action==='insert'||action==='add-output'){
      const next=graph.parseGraph(output);
      const created=next.ordered.find(n=>!prior.map.has(n.id)&&
        (action!=='add-output'||n.type==='output'));
      panel._vgSelected=created?.id||null;
    }else if(action==='remove'||action==='remove-output')panel._vgSelected=null;
    else if(action==='set-default-output')panel._vgSelected=details.id;
    else if(action==='replace-generator'){
      const next=graph.parseGraph(output);
      panel._vgSelected=next.map.get(next.graph.output)?.input||null;
    }else if(action==='connect')panel._vgSelected=details.target;
    render(panel);
  }catch(error){status(panel,String(error?.message||error),true);}
}
function commitLayout(panel,next){
  try{
    graph.parseLayout(next,panel._vgGraphJson);
    const changed=commitProperty(panel,'graphLayoutJson',next);
    panel._vgPreviewLayout=null;render(panel);
    if(changed)status(panel,'Layout saved via native Inspector · geometry unchanged.');
  }catch(error){
    panel._vgPreviewLayout=null;render(panel);
    status(panel,String(error?.message||error),true);
  }
}
async function refreshAsset(panel){
  if(panel._vgSharedDraft||panel._vgSharedBusy)return;
  const requestToken=(panel._vgRequestToken||0)+1;
  panel._vgRequestToken=requestToken;
  try{
    const info=await Editor.Message.request('cocos-splines','query-geometry-graph-asset');
    if(panel._vgRequestToken!==requestToken||!panel._vgShared)return;
    if(!info?.ok||!info.assetMode)throw Error(info?.error||'Shared graph unavailable.');
    graph.parseGraph(info.graphJson);
    if(panel._vgGraphJson!==info.graphJson){
      panel._vgProfile=null;
      panel._vgProfileRequestToken=(panel._vgProfileRequestToken||0)+1;
    }
    panel._vgGraphJson=info.graphJson;
    panel._vgSelected=null;panel._vgPending=null;
    render(panel);
    status(panel,'Shared JsonAsset: '+(info.assetName||'unnamed')+' · read-only view.');
  }catch(error){
    if(panel._vgRequestToken!==requestToken||!panel._vgShared)return;
    panel._vgProfile=null;
    panel._vgProfileRequestToken=(panel._vgProfileRequestToken||0)+1;
    panel._vgGraphJson='invalid shared graph';
    render(panel);
    status(panel,String(error?.message||error),true);
  }
}
function closest(target,selector){
  return target&&typeof target.closest==='function'?target.closest(selector):null;
}
const inspector={
  template,style,$,
  update(dump){
    base.update.call(this,dump);
    const graphJson=dump?.value?.graphJson?.value,
      layoutJson=dump?.value?.graphLayoutJson?.value;
    if(typeof graphJson!=='string'||typeof layoutJson!=='string'){
      status(this,'Both graphJson and graphLayoutJson are required.',true);return;
    }
    if(this._vgDrag)return;
    const profileIdentity=JSON.stringify(['profileAssetA','profileAssetB','profileAssetC']
      .map(key=>dump?.value?.[key]?.value??null));
    const changedProfiles=this._vgProfileAssetIdentity!==undefined&&
      this._vgProfileAssetIdentity!==profileIdentity;
    if(changedProfiles){
      this._vgAuthoredDraft=null;this._vgAuthoredDrag=null;
      this._vgAuthoredToken=(this._vgAuthoredToken||0)+1;
      if(this._vgAuthoredBusy)this._vgAuthoredBusy=false;
      profileStatus(this,'Profile Asset binding changed. Previous draft closed to prevent stale writes.');
    }
    this._vgProfileAssetIdentity=profileIdentity;
    const shared=dump?.value?.useGraphAsset?.value===true;
    const assetIdentity=JSON.stringify(dump?.value?.graphAsset?.value??null);
    const changedShared=this._vgShared!==shared||this._vgAssetIdentity!==assetIdentity;
    const rendererOutputId=dump?.value?.outputId?.value??'';
    const rendererOrder=dump?.value?.outputOrder?.value??'';
    const renderAllOutputs=dump?.value?.renderAllOutputs?.value===true;
    const changedOrder=this._vgOutputOrder!==rendererOrder||
      this._vgRenderAllOutputs!==renderAllOutputs;
    const changedOutput=this._vgProfileOutputId!==rendererOutputId;
    if(changedShared||changedProfiles||(!shared&&this._vgGraphJson!==graphJson)||
       changedOutput){
      this._vgProfile=null;
      this._vgProfileRequestToken=(this._vgProfileRequestToken||0)+1;
    }
    this._vgProfileOutputId=rendererOutputId;
    if(changedShared){
      this._vgSharedDraft=null;
      this._vgSharedReview=null;
      this._vgRequestToken=(this._vgRequestToken||0)+1;
    }
    const changed=this._vgGraphJson!==graphJson||
      this._vgLayoutJson!==layoutJson||changedShared||changedOutput||
      changedOrder||changedProfiles;
    this._vgShared=shared;this._vgAssetIdentity=assetIdentity;
    this._vgOutputOrder=rendererOrder;
    this._vgRenderAllOutputs=renderAllOutputs;
    this._vgLayoutJson=layoutJson;
    if(!shared)this._vgGraphJson=graphJson;
    else if(changedShared){this._vgGraphJson='Asset loading';}
    if(changed||!this._vgRendered){this._vgRendered=true;render(this);}
    if(shared&&changedShared&&this.$?.vgRefresh)void refreshAsset(this);
    if(!shared&&changedShared)this._vgRequestToken=(this._vgRequestToken||0)+1;
  },
  ready(){
    base.ready.call(this);
    this._vgSelected=null;this._vgPending=null;this._vgDrag=null;
    this._vgRendered=false;this._vgPreviewLayout=null;
    this._vgShared=false;this._vgAssetIdentity=null;this._vgRequestToken=0;
    this._vgSharedDraft=null;this._vgSharedReview=null;this._vgSharedBusy=false;
    this._vgProfile=null;this._vgProfileBusy=false;
    this._vgProfileRequestToken=0;this._vgProfileOutputId='';
    this._vgOutputOrder='';this._vgRenderAllOutputs=false;
    this._vgAuthoredDraft=null;this._vgAuthoredBusy=false;
    this._vgAuthoredToken=0;this._vgAuthoredSelected=0;
    this._vgAuthoredEdge=null;
    this._vgProfileAssetIdentity=undefined;this._vgAuthoredDrag=null;
    this.$?.vgProfileSlot?.addEventListener('change',event=>{
      const slot=Number(event.target?.value);
      if(!Number.isInteger(slot)||slot<0||slot>2)return;
      this._vgAuthoredSlot=slot;
    });
    this.$?.vgProfileOpen?.addEventListener('click',()=>void (async()=>{
      if(this._vgAuthoredDraft||this._vgAuthoredBusy||this._vgSharedBusy||
         this._vgSharedDraft)return;
      const slot=Number(this.$?.vgProfileSlot?.value??this._vgAuthoredSlot??0);
      if(!Number.isInteger(slot)||slot<0||slot>2)return;
      const token=++this._vgAuthoredToken;
      this._vgAuthoredBusy=true;render(this);
      try{
        const result=await Editor.Message.request('cocos-splines',
          'begin-geometry-profile-edit',slot);
        if(token!==this._vgAuthoredToken)return;
        if(!result?.ok)throw Error(result?.error||'Cannot open Profile Asset.');
        const canonical=authored.formatProfile(result.profileJson);
        this._vgAuthoredDraft={nodeUuid:result.nodeUuid,assetUuid:result.assetUuid,
          slot,assetName:result.assetName||'Profile',sha256:result.sha256,
          profileJson:canonical,initialProfileJson:canonical,
          undo:[],redo:[]};
        this._vgAuthoredSelected=0;this._vgAuthoredEdge=null;
        profileStatus(this,'Editing '+this._vgAuthoredDraft.assetName+
          ' in memory; no file/Scene changes until Save.');
      }catch(error){
        if(token===this._vgAuthoredToken)
          profileStatus(this,String(error?.message||error),true);
      }finally{
        if(token===this._vgAuthoredToken){
          this._vgAuthoredBusy=false;render(this);
        }
      }
    })());
    this.$?.vgProfileSave?.addEventListener('click',()=>void (async()=>{
      const draft=this._vgAuthoredDraft;
      if(!draft||this._vgAuthoredBusy||this._vgSharedBusy)return;
      if(draft.profileJson===draft.initialProfileJson)return;
      const token=this._vgAuthoredToken;
      this._vgAuthoredBusy=true;render(this);
      try{
        const response=await Editor.Message.request('cocos-splines',
          'save-geometry-profile-edit',{nodeUuid:draft.nodeUuid,
          slot:draft.slot,assetUuid:draft.assetUuid,sha256:draft.sha256,
          profileJson:draft.profileJson});
        if(token!==this._vgAuthoredToken||draft!==this._vgAuthoredDraft)return;
        if(response?.canceled){
          profileStatus(this,'Save canceled. Profile draft remains editable.');
          return;
        }
        if(!response?.ok)
          throw Error(response?.error||'Profile save failed. Draft retained.');
        draft.sha256=response.sha256||draft.sha256;
        draft.profileJson=authored.formatProfile(response.profileJson||draft.profileJson);
        draft.initialProfileJson=draft.profileJson;
        draft.undo.length=0;draft.redo.length=0;
        profileStatus(this,response.message||'Profile saved.',!!response.refreshPending);
      }catch(error){
        if(token===this._vgAuthoredToken&&draft===this._vgAuthoredDraft)
          profileStatus(this,String(error?.message||error),true);
      }finally{
        if(token===this._vgAuthoredToken){this._vgAuthoredBusy=false;render(this);}
      }
    })());
    const exportNewProfile=source=>void (async()=>{
      if(this._vgAuthoredBusy||this._vgSharedBusy||this._vgSharedDraft||
         this._vgAuthoredDrag)return;
      const draft=this._vgAuthoredDraft;
      if(source==='draft'&&!draft)return;
      const preset=this.$?.vgProfilePreset?.value;
      if(source==='preset'&&!library.PRESETS.some(x=>x.id===preset)){
        profileStatus(this,'Select a valid Profile Library preset.',true);return;
      }
      const payload=source==='preset'?{presetId:preset}:{
        nodeUuid:draft.nodeUuid,slot:draft.slot,assetUuid:draft.assetUuid,
        profileJson:draft.profileJson,
      };
      const token=this._vgAuthoredToken;
      this._vgAuthoredBusy=true;render(this);
      try{
        const result=await Editor.Message.request('cocos-splines',
          'export-geometry-profile-asset',payload);
        if(token!==this._vgAuthoredToken||
           (source==='draft'&&draft!==this._vgAuthoredDraft))return;
        if(result?.canceled)
          profileStatus(this,'Profile JSON creation canceled; nothing changed.');
        else if(!result?.ok)
          throw Error(result?.error||'Profile JSON creation failed.');
        else profileStatus(this,result.message||
          'New Profile JSON created. Manually assign it to a Profile Asset slot.',
          !!result.refreshPending);
      }catch(error){
        if(token===this._vgAuthoredToken)
          profileStatus(this,String(error?.message||error),true);
      }finally{
        if(token===this._vgAuthoredToken){
          this._vgAuthoredBusy=false;render(this);
        }
      }
    })();
    this.$?.vgProfileCreatePreset?.addEventListener('click',()=>exportNewProfile('preset'));
    this.$?.vgProfileExportDraft?.addEventListener('click',()=>exportNewProfile('draft'));
    this.$?.vgProfileApplyPreset?.addEventListener('click',()=>{
      if(!this._vgAuthoredDraft||this._vgAuthoredBusy||this._vgSharedBusy||
         this._vgAuthoredDrag)return;
      const preset=this.$?.vgProfilePreset?.value;
      if(!library.PRESETS.some(p=>p.id===preset)){
        profileStatus(this,'Choose a valid Profile Library preset.',true);return;
      }
      applyAuthoredEdit(this,'library-preset',{preset});
      profileStatus(this,'Profile Library preset '+preset+
        ' applied to the UNSAVED draft. Use Undo Draft to restore the old profile, or Save Profile JSON to commit.');
    });
    this.$?.vgProfileDiscard?.addEventListener('click',()=>{
      if(!this._vgAuthoredDraft||this._vgAuthoredBusy)return;
      this._vgAuthoredDraft=null;this._vgAuthoredDrag=null;
      this._vgAuthoredEdge=null;
      this._vgAuthoredToken++;
      render(this);profileStatus(this,'Profile draft discarded. Source JsonAsset unchanged.');
    });
    this.$?.vgProfileUndo?.addEventListener('click',()=>restoreAuthoredHistory(this,'undo'));
    this.$?.vgProfileRedo?.addEventListener('click',()=>restoreAuthoredHistory(this,'redo'));
    this.$?.vgProfileCanvas?.addEventListener('keydown',event=>{
      if(!this._vgAuthoredDraft||!event.ctrlKey||
         (event.target?.tagName==='INPUT'))return;
      if(event.key.toLowerCase()==='z'){
        event.preventDefault?.();
        restoreAuthoredHistory(this,event.shiftKey?'redo':'undo');
      }else if(event.key.toLowerCase()==='y'){
        event.preventDefault?.();restoreAuthoredHistory(this,'redo');
      }
    });
    this.$?.vgProfileCanvas?.addEventListener('click',event=>{
      const el=closest(event.target,'button');
      if(!el||!this._vgAuthoredDraft)return;
      if(el.classList?.contains('spl-profile-insert'))
        applyAuthoredEdit(this,'insert',{});
      else if(el.classList?.contains('spl-profile-remove'))
        applyAuthoredEdit(this,'remove',{});
      else if(el.classList?.contains('spl-profile-insert-edge')&&
              Number.isInteger(this._vgAuthoredEdge))
        applyAuthoredEdit(this,'insert-edge',{
          index:this._vgAuthoredEdge,t:.5,offset:.12});
      else if(el.classList?.contains('spl-profile-set-uv-seam')&&
              Number.isInteger(this._vgAuthoredEdge))
        applyAuthoredEdit(this,'set-uv-seam',{index:this._vgAuthoredEdge});
      else if(el.classList?.contains('spl-profile-reset-uv'))
        applyAuthoredEdit(this,'reset-uv',{});
      else if(el.classList?.contains('spl-profile-clear-uv-meters'))
        applyAuthoredEdit(this,'clear-u-meters-per-repeat',{});
    });
    this.$?.vgProfileCanvas?.addEventListener('change',event=>{
      if(!this._vgAuthoredDraft||!event.target)return;
      const cls=event.target.classList;
      if(cls?.contains('spl-profile-uv-island-mode')){
        const raw=event.target.value;
        if(!/^[012]$/.test(raw)){
          profileStatus(this,'Invalid side UV island mode.',true);return;
        }
        applyAuthoredEdit(this,'set-side-island-mode',{mode:Number(raw)});
        return;
      }
      if(cls?.contains('spl-profile-uv-follow-frame')){
        applyAuthoredEdit(this,'set-u-follow-frame-scale',{
          enabled:event.target.checked===true});
        return;
      }
      if(cls?.contains('spl-profile-uv-meters')){
        const raw=event.target.value;
        if(raw===''){
          applyAuthoredEdit(this,'clear-u-meters-per-repeat',{});
          return;
        }
        const meters=Number(raw);
        if(!Number.isFinite(meters)||meters<.01||meters>10000){
          profileStatus(this,'Profile UV side U meters/repeat must be in [0.01,10000].',true);
          return;
        }
        applyAuthoredEdit(this,'set-u-meters-per-repeat',{meters});
        return;
      }
      if(cls?.contains('spl-profile-uv-weight')){
        if(!Number.isInteger(this._vgAuthoredEdge))return;
        if(event.target.value===''||!Number.isFinite(Number(event.target.value))){
          profileStatus(this,'Profile UV edge weight must be finite.',true);return;
        }
        applyAuthoredEdit(this,'set-edge-weight',{
          index:this._vgAuthoredEdge,weight:Number(event.target.value)});
        return;
      }
      if(!cls?.contains('spl-profile-x')&&!cls?.contains('spl-profile-y'))return;
      const pt=authored.parseProfile(this._vgAuthoredDraft.profileJson)
        .points[this._vgAuthoredSelected];
      const value=Number(event.target.value);
      if(event.target.value===''||!Number.isFinite(value)){
        profileStatus(this,'Profile point coordinate must be finite.',true);return;
      }
      applyAuthoredEdit(this,'move',{
        x:cls.contains('spl-profile-x')?value:pt.x,
        y:cls.contains('spl-profile-y')?value:pt.y,
      });
    });
    this.$?.vgProfileCanvas?.addEventListener('pointerdown',event=>{
      if(!this._vgAuthoredDraft||this._vgAuthoredBusy)return;
      const circle=closest(event.target,'[data-profile-point]');
      const edge=circle?null:closest(event.target,'[data-profile-edge]');
      const kind=circle?'point':edge?'edge':null;
      if(!kind)return;
      const index=Number(circle?.dataset?.profilePoint??
        edge?.dataset?.profileEdge);
      if(!Number.isInteger(index)||index<0||
         index>=authored.parseProfile(this._vgAuthoredDraft.profileJson).points.length)
        return;
      this._vgAuthoredSelected=index;
      this._vgAuthoredEdge=kind==='edge'?index:null;
      this._vgAuthoredDrag={pointerId:event.pointerId,index,kind,
        startX:event.clientX,startY:event.clientY,
        baseProfile:this._vgAuthoredDraft.profileJson,historySaved:false};
      this.$.vgProfileCanvas.setPointerCapture?.(event.pointerId);
      event.preventDefault?.();
      renderAuthoredProfile(this);
    });
    this.$?.vgProfileCanvas?.addEventListener('pointermove',event=>{
      const drag=this._vgAuthoredDrag;
      if(!drag||drag.pointerId!==event.pointerId||!this._vgAuthoredDraft)return;
      const svg=this.$.vgProfileCanvas.querySelector?.('svg');
      const rect=svg?.getBoundingClientRect?.();
      if(!rect||rect.width<=0||rect.height<=0)return;
      const grid=Number(this.$?.vgProfileSnap?.value||0);
      const snap=Number.isFinite(grid)&&grid>=0&&grid<=.1?grid:0;
      if(drag.kind==='edge'){
        if(!Number.isFinite(drag.startX)||!Number.isFinite(drag.startY))return;
        const dx=snapProfileCoordinate(
          (event.clientX-drag.startX)/rect.width*240/104,snap);
        const dy=snapProfileCoordinate(
          -(event.clientY-drag.startY)/rect.height*240/104,snap);
        applyAuthoredEdit(this,'move-edge',{
          baseProfile:drag.baseProfile,index:drag.index,dx,dy});
      }else{
        const x=snapProfileCoordinate(Math.max(-1,Math.min(1,
          ((event.clientX-rect.left)/rect.width*240-120)/104)),snap);
        const y=snapProfileCoordinate(Math.max(-1,Math.min(1,
          (120-(event.clientY-rect.top)/rect.height*240)/104)),snap);
        applyAuthoredEdit(this,'move',{index:drag.index,x,y});
      }
    });
    const finishProfileDrag=event=>{
      const drag=this._vgAuthoredDrag;
      if(!drag||drag.pointerId!==event.pointerId)return;
      this._vgAuthoredDrag=null;
      this.$.vgProfileCanvas.releasePointerCapture?.(event.pointerId);
    };
    this.$?.vgProfileCanvas?.addEventListener('pointerup',finishProfileDrag);
    this.$?.vgProfileCanvas?.addEventListener('pointercancel',finishProfileDrag);
    // Legacy headless Inspector smoke mocks only provide the Rebuild button.
    // The real Cocos panel registers every selector in this module.
    if(!this.$?.vgStage||!this.$.vgProperties||!this.$.vgAddOffset||
       !this.$.vgAddWidth||!this.$.vgRemove||!this.$.vgAuto)return;
    this.$?.vgOrderList?.addEventListener('click',event=>{
      if(!this._vgRenderAllOutputs||this._vgSharedBusy)return;
      const button=closest(event.target,'button[data-order-index]');
      if(!button||button.disabled)return;
      try{
        const view=graph.parseGraph(this._vgGraphJson);
        const ids=readOutputOrder(view.outputs,this._vgOutputOrder);
        const index=Number(button.dataset?.orderIndex);
        const direction=Number(button.dataset?.orderMove);
        if(!Number.isInteger(index)||![-1,1].includes(direction)||
           index<0||index>=ids.length||index+direction<0||
           index+direction>=ids.length)
          throw Error('Invalid Output Order move request.');
        [ids[index],ids[index+direction]]=[ids[index+direction],ids[index]];
        const next=ids.join(',')===view.outputs.join(',')?'':ids.join(',');
        if(commitOutputOrder(this,next)){
          render(this);status(this,'Output-to-Material order saved on renderer.');
        }
      }catch(error){status(this,String(error?.message||error),true);}
    });
    this.$?.vgOrderReset?.addEventListener('click',()=>{
      try{
        if(commitOutputOrder(this,'')){
          render(this);status(this,'Alphabetic Output ID order restored.');
        }
      }catch(error){status(this,String(error?.message||error),true);}
    });
    const actions={
      vgExport:'export-geometry-graph-asset',
      vgImport:'import-geometry-graph-asset',
      vgCopyLocal:'copy-geometry-graph-to-local',
    };
    for(const [button,message] of Object.entries(actions)){
      this.$?.[button]?.addEventListener('click',()=>void
        Editor.Message.request('cocos-splines',message).then(result=>{
          if(!result?.ok&&!result?.canceled)status(this,
            String(result?.error||'Geometry Graph operation failed.'),true);
          else if(result?.message)status(this,result.message);
        }).catch(error=>status(this,String(error?.message||error),true)));
    }
    this.$?.vgRefresh?.addEventListener('click',()=>void refreshAsset(this));
    this.$?.vgProfile?.addEventListener('click',()=>void (async()=>{
      if(this._vgProfileBusy||this._vgSharedBusy||this._vgSharedDraft)return;
      const token=this._vgProfileRequestToken;
      let message='',isError=false;
      this._vgProfileBusy=true;render(this);
      try{
        const response=await Editor.Message.request('cocos-splines','profile-geometry-graph');
        if(token!==this._vgProfileRequestToken)return;
        if(!response?.ok)throw Error(response?.error||'Unable to profile Geometry Graph.');
        const formatted=formatGeometryGraphProfile(response.profile);
        this._vgProfile=response.profile;
        if(this.$?.vgProfileReport)this.$.vgProfileReport.textContent=formatted;
        message='Cold / Warm per-node profiling complete. No graph JSON was written.';
      }catch(error){
        if(token!==this._vgProfileRequestToken)return;
        this._vgProfile=null;
        message=String(error?.message||error);isError=true;
      }finally{
        this._vgProfileBusy=false;render(this);
        if(token===this._vgProfileRequestToken&&message)
          status(this,message,isError);
      }
    })());
    this.$?.vgEditShared?.addEventListener('click',()=>void (async()=>{
      if(!this._vgShared||this._vgSharedDraft||this._vgSharedBusy)return;
      const token=this._vgRequestToken;
      this._vgSharedBusy=true;render(this);
      try{
        const info=await Editor.Message.request('cocos-splines','begin-shared-geometry-graph-edit');
        if(token!==this._vgRequestToken||!this._vgShared)return;
        if(!info?.ok)throw Error(info?.error||'Cannot open shared asset draft.');
        graph.parseGraph(info.graphJson);
        this._vgSharedDraft={nodeUuid:info.nodeUuid,assetUuid:info.assetUuid,
          sha256:info.sha256,initialGraphJson:info.graphJson,graphJson:info.graphJson};
        this._vgProfile=null;
        this._vgProfileRequestToken=(this._vgProfileRequestToken||0)+1;
        this._vgSharedReview=null;
        this._vgGraphJson=info.graphJson;this._vgSelected=null;this._vgPending=null;
        render(this);
        status(this,'Editing a temporary shared draft. Save requires confirmation and changes the source JSON file.');
      }catch(error){
        if(token===this._vgRequestToken)status(this,String(error?.message||error),true);
      }finally{
        const message=this.$?.vgStatus?.textContent,wasError=this._vgStatusError;
        this._vgSharedBusy=false;render(this);
        if(message)status(this,message,wasError);
      }
    })());
    this.$?.vgSaveShared?.addEventListener('click',()=>void (async()=>{
      const draft=this._vgSharedDraft;
      if(!draft||this._vgSharedBusy)return;
      const token=this._vgRequestToken;
      this._vgSharedBusy=true;render(this);
      try{
        const result=await Editor.Message.request('cocos-splines',
          'save-shared-geometry-graph-edit',{nodeUuid:draft.nodeUuid,
            assetUuid:draft.assetUuid,sha256:draft.sha256,graphJson:draft.graphJson});
        if(token!==this._vgRequestToken||this._vgSharedDraft!==draft)return;
        if(result?.canceled){status(this,'Save canceled. Draft retained.');return;}
        if(!result?.ok){
          if(result?.conflict)
            throw Error('Shared JSON changed on disk. Choose Compare with Source to review differences without losing your draft.');
          throw Error(result?.error||'Shared JSON save failed.');
        }
        this._vgSharedDraft=null;
        this._vgSharedReview=null;
        this._vgGraphJson=result.graphJson;
        this._vgPending=null;
        render(this);
        status(this,result.message||'Shared JSON saved.');
      }catch(error){
        if(token===this._vgRequestToken&&this._vgSharedDraft===draft)
          status(this,String(error?.message||error),true);
      }finally{
        const message=this.$?.vgStatus?.textContent,wasError=this._vgStatusError;
        this._vgSharedBusy=false;render(this);
        if(message)status(this,message,wasError);
      }
    })());
    this.$?.vgDiscardShared?.addEventListener('click',()=>{
      if(!this._vgSharedDraft||this._vgSharedBusy)return;
      this._vgSharedDraft=null;this._vgSharedReview=null;
      this._vgPending=null;this._vgSelected=null;
      this._vgGraphJson='Asset loading';render(this);
      void refreshAsset(this);
    });
    this.$?.vgReviewShared?.addEventListener('click',()=>void (async()=>{
      const draft=this._vgSharedDraft;
      if(!draft||this._vgSharedBusy)return;
      const token=this._vgRequestToken;
      this._vgSharedBusy=true;render(this);
      try{
        const latest=await Editor.Message.request('cocos-splines',
          'begin-shared-geometry-graph-edit');
        if(token!==this._vgRequestToken||this._vgSharedDraft!==draft)return;
        if(!latest?.ok)throw Error(latest?.error||'Cannot read latest source.');
        if(latest.assetUuid!==draft.assetUuid||latest.nodeUuid!==draft.nodeUuid)
          throw Error('Graph asset selection changed. Review canceled.');
        graph.parseGraph(latest.graphJson);
        this._vgSharedReview={sha256:latest.sha256,graphJson:latest.graphJson};
        render(this);
        status(this,'Source comparison updated. Draft remains untouched.');
      }catch(error){
        if(token===this._vgRequestToken&&this._vgSharedDraft===draft)
          status(this,String(error?.message||error),true);
      }finally{
        const message=this.$?.vgStatus?.textContent,wasError=this._vgStatusError;
        this._vgSharedBusy=false;render(this);
        if(message)status(this,message,wasError);
      }
    })());
    this.$?.vgRebaseShared?.addEventListener('click',()=>{
      const draft=this._vgSharedDraft,review=this._vgSharedReview;
      if(!draft||!review||this._vgSharedBusy)return;
      try{
        if(review.sha256===draft.sha256)
          throw Error('Source has not changed. No rebase needed.');
        const analysis=conflict.analyzeSharedGraphChanges(
          draft.initialGraphJson,draft.graphJson,review.graphJson);
        if(!analysis.canRebase)throw Error('Conflicting graph changes. Automatic rebase blocked.');
        draft.initialGraphJson=review.graphJson;
        draft.graphJson=analysis.mergedGraphJson;
        draft.sha256=review.sha256;
        this._vgGraphJson=draft.graphJson;
        this._vgSharedReview=null;
        this._vgPending=null;
        render(this);
        status(this,'Draft rebased onto the reviewed source. Save Shared JSON still requires confirmation.');
      }catch(error){status(this,String(error?.message||error),true);}
    });
    const insert=type=>{
      try{
        const view=graph.parseGraph(this._vgGraphJson);
        const outputId=activeOutputId(view,this._vgSelected);
        const generator=view.map.get(view.map.get(outputId)?.input);
        if(!generator||!['ribbon','tube','extrude','meshDeform'].includes(generator.type))
          throw Error('Missing selected mesh generator.');
        editGraph(this,'insert',{type,before:generator.id});
      }catch(error){status(this,String(error?.message||error),true);}
    };
    this.$.vgAddOffset.addEventListener('click',()=>insert('offset'));
    this.$.vgAddWidth.addEventListener('click',()=>insert('width'));
    this.$?.vgSwitchGenerator?.addEventListener('click',()=>{
      if(this._vgSharedBusy||this._vgShared&&!this._vgSharedDraft)return;
      try{
        const view=graph.parseGraph(this._vgGraphJson);
        const outputId=activeOutputId(view,this._vgSelected);
        const generator=view.map.get(view.map.get(outputId)?.input);
        if(!generator||!['ribbon','tube','extrude','meshDeform'].includes(generator.type))
          throw Error('Output mesh generator is missing.');
        editGraph(this,'replace-generator',{
          type:generator.type==='tube'?'ribbon':'tube',outputId,
        });
      }catch(error){status(this,String(error?.message||error),true);}
    });
    this.$?.vgUseExtrude?.addEventListener('click',()=>{
      if(this._vgSharedBusy||this._vgShared&&!this._vgSharedDraft)return;
      const view=graph.parseGraph(this._vgGraphJson);
      editGraph(this,'replace-generator',{
        type:'extrude',outputId:activeOutputId(view,this._vgSelected),
      });
    });
    this.$?.vgAttachMesh?.addEventListener('click',()=>{
      if(this._vgSharedBusy||this._vgShared&&!this._vgSharedDraft)return;
      editGraph(this,'attach-mesh-asset',{id:this._vgSelected});
    });
    this.$?.vgDetachMesh?.addEventListener('click',()=>{
      if(this._vgSharedBusy||this._vgShared&&!this._vgSharedDraft)return;
      editGraph(this,'detach-mesh-asset',{id:this._vgSelected});
    });
    this.$?.vgUseDeform?.addEventListener('click',()=>{
      if(this._vgSharedBusy||this._vgShared&&!this._vgSharedDraft)return;
      const view=graph.parseGraph(this._vgGraphJson);
      editGraph(this,'replace-generator',{
        type:'meshDeform',outputId:activeOutputId(view,this._vgSelected),
      });
    });
    this.$?.vgAddOutput?.addEventListener('click',()=>{
      if(this._vgSharedBusy||this._vgShared&&!this._vgSharedDraft)return;
      const view=graph.parseGraph(this._vgGraphJson);
      const selected=view.map.get(this._vgSelected);
      editGraph(this,'add-output',{
        fromOutputId:selected?.type==='output'?selected.id:view.graph.output,
      });
    });
    this.$?.vgDefaultOutput?.addEventListener('click',()=>{
      if(this._vgSharedBusy||this._vgShared&&!this._vgSharedDraft)return;
      editGraph(this,'set-default-output',{id:this._vgSelected});
    });
    this.$?.vgRemoveOutput?.addEventListener('click',()=>{
      if(this._vgSharedBusy||this._vgShared&&!this._vgSharedDraft)return;
      editGraph(this,'remove-output',{id:this._vgSelected});
    });
    this.$.vgRemove.addEventListener('click',()=>{
      if(this._vgSelected)editGraph(this,'remove',{id:this._vgSelected});
    });
    this.$.vgAuto.addEventListener('click',()=>commitLayout(this,'{}'));
    this.$.vgStage.addEventListener('click',event=>{
      if(this._vgIgnoreClick){this._vgIgnoreClick=false;return;}
      if((this._vgShared&&!this._vgSharedDraft)||this._vgSharedBusy)return;
      const socket=closest(event.target,'[data-socket]');
      if(socket){
        const id=socket.dataset.node;
        if(socket.dataset.socket==='out'){
          this._vgPending=id;this._vgSelected=id;render(this);
        }else if(this._vgPending){
          editGraph(this,'connect',{source:this._vgPending,target:id});
        }else status(this,'Click an output socket first, then an input socket.',true);
        return;
      }
      const card=closest(event.target,'.spl-vg-card');
      if(card){this._vgSelected=card.dataset.node;render(this);}
    });
    this.$.vgProperties.addEventListener('click',event=>{
      const button=closest(event.target,'[data-width-action]');
      if((this._vgShared&&!this._vgSharedDraft)||this._vgSharedBusy||
         !button||!this._vgSelected||button.disabled)return;
      const kind=button.dataset.widthAction;
      if(kind==='enable')editGraph(this,'width-keys-enable',{id:this._vgSelected});
      else if(kind==='add')editGraph(this,'width-key-add',{id:this._vgSelected});
      else if(kind==='remove')editGraph(this,'width-key-remove',{
        id:this._vgSelected,index:Number(button.dataset.widthIndex)});
    });
    this.$.vgProperties.addEventListener('change',event=>{
      if((this._vgShared&&!this._vgSharedDraft)||this._vgSharedBusy||!this._vgSelected)return;
      const widthInput=closest(event.target,'[data-width-field]');
      if(widthInput){
        const keys=graph.parseGraph(this._vgGraphJson).map.get(this._vgSelected)?.widthKeys;
        const index=Number(widthInput.dataset.widthIndex);
        const field=widthInput.dataset.widthField;
        if(!keys||!Number.isInteger(index)||!keys[index]||
           !['progress','multiplier'].includes(field)||widthInput.value===''||
           !Number.isFinite(Number(widthInput.value))){
          status(this,'Invalid Width key input.',true);return;
        }
        const next={...keys[index],[field]:Number(widthInput.value)};
        editGraph(this,'width-key-set',{id:this._vgSelected,index,...next});
        return;
      }
      const input=closest(event.target,'[data-graph-param]');
      if(!input)return;
      const key=input.dataset.graphParam;
      const optionalTaper=key==='midMultiplier'||key==='endMultiplier';
      if(input.value===''&&!optionalTaper&&key!=='capEnds'){
        status(this,'Graph parameter cannot be empty.',true);return;
      }
      editGraph(this,'param',{id:this._vgSelected,key,
        value:key==='capEnds'?!!input.checked:
          (optionalTaper&&input.value==='')?null:Number(input.value)});
    });
    this.$.vgProperties.addEventListener('pointerdown',event=>{
      if(this._vgSharedBusy||this._vgShared&&!this._vgSharedDraft||
         event.button!==0||!this._vgSelected)return;
      const handle=closest(event.target,'[data-width-key]');
      if(!handle)return;
      const keys=graph.parseGraph(this._vgGraphJson).map.get(this._vgSelected)?.widthKeys;
      const index=Number(handle.dataset.widthKey);
      if(!keys||!Number.isInteger(index)||!keys[index])return;
      this._vgWidthDrag={id:this._vgSelected,index,keys,base:this._vgGraphJson,
        pointerId:event.pointerId,preview:null};
      this.$.vgProperties.setPointerCapture?.(event.pointerId);
      event.preventDefault?.();
    });
    this.$.vgProperties.addEventListener('pointermove',event=>{
      const drag=this._vgWidthDrag;
      if(!drag||drag.pointerId!==event.pointerId)return;
      const svg=this.$.vgProperties.querySelector?.('.spl-vg-width-svg');
      const rect=svg?.getBoundingClientRect?.();
      if(!rect||rect.width<=0||rect.height<=0)return;
      const rawProgress=Math.max(0,Math.min(1,
        ((event.clientX-rect.left)/rect.width*320-20)/280));
      const rawScale=.01+(124-(event.clientY-rect.top)/rect.height*140)/100*19.99;
      const scale=Math.max(.01,Math.min(20,
        Math.round(rawScale*1000)/1000));
      const i=drag.index,keys=drag.keys;
      const progress=i===0?0:i===keys.length-1?1:Math.max(
        keys[i-1].progress+.001,Math.min(keys[i+1].progress-.001,
          Math.round(rawProgress*1000)/1000));
      if(!Number.isFinite(progress)||!Number.isFinite(scale))return;
      drag.preview={progress,multiplier:scale};
      const positions=keys.map((k,j)=>j===i?drag.preview:k);
      const px=k=>(20+k.progress*280).toFixed(3);
      const py=k=>(124-(k.multiplier-.01)/19.99*100).toFixed(3);
      const circle=svg.querySelector?.('[data-width-key="'+i+'"]');
      circle?.setAttribute?.('cx',px(drag.preview));
      circle?.setAttribute?.('cy',py(drag.preview));
      svg.querySelector?.('[data-width-line]')?.setAttribute?.('points',
        positions.map(k=>px(k)+','+py(k)).join(' '));
    });
    const finishWidthDrag=event=>{
      const drag=this._vgWidthDrag;
      if(!drag||drag.pointerId!==event.pointerId)return;
      this._vgWidthDrag=null;
      this.$.vgProperties.releasePointerCapture?.(event.pointerId);
      const value=drag.preview,old=drag.keys[drag.index];
      if(event.type==='pointerup'&&value&&drag.base===this._vgGraphJson&&
         drag.id===this._vgSelected&&
         (value.progress!==old.progress||value.multiplier!==old.multiplier))
        editGraph(this,'width-key-set',{id:drag.id,index:drag.index,...value});
      else render(this);
    };
    this.$.vgProperties.addEventListener('pointerup',finishWidthDrag);
    this.$.vgProperties.addEventListener('pointercancel',finishWidthDrag);
    this.$.vgStage.addEventListener('pointerdown',event=>{
      const handle=closest(event.target,'[data-drag]');
      if(this._vgShared||!handle||event.button!==0)return;
      try{
        const id=handle.dataset.drag;
        const positions=graph.parseLayout(this._vgLayoutJson,this._vgGraphJson);
        if(!Object.hasOwn(positions,id))return;
        this._vgSelected=id;
        this._vgDrag={id,startX:event.clientX,startY:event.clientY,
          x:positions[id].x,y:positions[id].y,preview:null,moved:false,
          pointerId:event.pointerId};
        this.$.vgStage.setPointerCapture?.(event.pointerId);
        event.preventDefault?.();
      }catch(error){status(this,String(error?.message||error),true);}
    });
    this.$.vgStage.addEventListener('pointermove',event=>{
      const drag=this._vgDrag;
      if(!drag||drag.pointerId!==event.pointerId)return;
      const x=drag.x+event.clientX-drag.startX,
        y=drag.y+event.clientY-drag.startY;
      if(Math.abs(event.clientX-drag.startX)>2||
         Math.abs(event.clientY-drag.startY)>2)drag.moved=true;
      try{
        drag.preview=graph.moveGraphNode(this._vgLayoutJson,
          this._vgGraphJson,drag.id,x,y);
        this._vgPreviewLayout=drag.preview;render(this);
      }catch(error){status(this,String(error?.message||error),true);}
    });
    const finish=event=>{
      const drag=this._vgDrag;
      if(!drag||drag.pointerId!==event.pointerId)return;
      this._vgDrag=null;
      this.$.vgStage.releasePointerCapture?.(event.pointerId);
      if(event.type==='pointercancel'||!drag.moved){
        this._vgPreviewLayout=null;render(this);return;
      }
      this._vgIgnoreClick=true;
      commitLayout(this,drag.preview||this._vgLayoutJson);
    };
    this.$.vgStage.addEventListener('pointerup',finish);
    this.$.vgStage.addEventListener('pointercancel',finish);
    this.$.vgStage.addEventListener('keydown',event=>{
      if(this._vgShared||!this._vgSelected||
        !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
      const pos=graph.parseLayout(this._vgLayoutJson,this._vgGraphJson)[this._vgSelected];
      if(!pos)return;
      const step=event.shiftKey?24:8;
      const x=pos.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0);
      const y=pos.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0);
      event.preventDefault?.();
      commitLayout(this,graph.moveGraphNode(this._vgLayoutJson,
        this._vgGraphJson,this._vgSelected,x,y));
    });
  },
  close(){
    base.close.call(this);
    this._vgGraphJson=null;this._vgLayoutJson=null;
    this._vgPreviewLayout=null;this._vgSelected=null;
    this._vgPending=null;this._vgDrag=null;this._vgWidthDrag=null;this._vgRendered=false;
    this._vgShared=false;this._vgAssetIdentity=null;
    this._vgSharedDraft=null;this._vgSharedReview=null;this._vgSharedBusy=false;
    this._vgProfile=null;this._vgProfileBusy=false;
    this._vgOutputOrder='';this._vgRenderAllOutputs=false;
    this._vgAuthoredToken=(this._vgAuthoredToken||0)+1;
    this._vgAuthoredDraft=null;this._vgAuthoredDrag=null;
    this._vgAuthoredEdge=null;
    this._vgAuthoredBusy=false;this._vgProfileAssetIdentity=undefined;
    this._vgProfileRequestToken=(this._vgProfileRequestToken||0)+1;
    this._vgRequestToken=(this._vgRequestToken||0)+1;
  },
};
module.exports=inspector;
