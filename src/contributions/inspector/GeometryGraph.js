'use strict';
/** Phase 4.2a Inspector node canvas. All saved data passes through Cocos
 * Creator 3.8 ui-prop.dump/change-dump, preserving native Undo/Prefab overrides.
 */
const base=require('./common').makeInspector('geometryGraph');
const graph=require('../../SplineGeometryGraphVisualModel');
const conflict=require('../../SplineGeometryGraphConflict');
const {formatGeometryGraphProfile}=require('../../SplineGeometryGraphProfileReport');
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
  vgProfile:'.spl-vg-profile',vgProfileReport:'.spl-vg-profile-report',
  vgSourceMode:'.spl-vg-source-mode',
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
function render(panel){
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
    const shared=dump?.value?.useGraphAsset?.value===true;
    const assetIdentity=JSON.stringify(dump?.value?.graphAsset?.value??null);
    const changedShared=this._vgShared!==shared||this._vgAssetIdentity!==assetIdentity;
    const rendererOutputId=dump?.value?.outputId?.value??'';
    const changedOutput=this._vgProfileOutputId!==rendererOutputId;
    if(changedShared||(!shared&&this._vgGraphJson!==graphJson)||
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
      this._vgLayoutJson!==layoutJson||changedShared||changedOutput;
    this._vgShared=shared;this._vgAssetIdentity=assetIdentity;
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
    // Legacy headless Inspector smoke mocks only provide the Rebuild button.
    // The real Cocos panel registers every selector in this module.
    if(!this.$?.vgStage||!this.$.vgProperties||!this.$.vgAddOffset||
       !this.$.vgAddWidth||!this.$.vgRemove||!this.$.vgAuto)return;
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
    this.$.vgProperties.addEventListener('change',event=>{
      const input=closest(event.target,'[data-graph-param]');
      if((this._vgShared&&!this._vgSharedDraft)||this._vgSharedBusy||!input||!this._vgSelected)return;
      const key=input.dataset.graphParam;
      editGraph(this,'param',{id:this._vgSelected,key,
        value:key==='capEnds'?!!input.checked:Number(input.value)});
    });
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
    this._vgPending=null;this._vgDrag=null;this._vgRendered=false;
    this._vgShared=false;this._vgAssetIdentity=null;
    this._vgSharedDraft=null;this._vgSharedReview=null;this._vgSharedBusy=false;
    this._vgProfile=null;this._vgProfileBusy=false;
    this._vgProfileRequestToken=(this._vgProfileRequestToken||0)+1;
    this._vgRequestToken=(this._vgRequestToken||0)+1;
  },
};
module.exports=inspector;
