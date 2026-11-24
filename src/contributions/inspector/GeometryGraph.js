'use strict';
/** Phase 4.2a Inspector node canvas. All saved data passes through Cocos
 * Creator 3.8 ui-prop.dump/change-dump, preserving native Undo/Prefab overrides.
 */
const base=require('./common').makeInspector('geometryGraph');
const graph=require('../../SplineGeometryGraphVisualModel');
const template=base.template+[
 '<details class="spl-section spl-vg-panel" open>',
 '<summary>Visual Geometry Graph · typed sockets</summary>',
 '<div class="spl-note">Drag node headers. Click an output socket then a compatible input socket to connect. All edits use native Inspector property commits.</div>',
 '<div class="spl-vg-toolbar spl-vg-asset-toolbar">',
 '<button type="button" class="spl-btn spl-vg-export">Export JSON…</button>',
 '<button type="button" class="spl-btn spl-vg-import">Import JSON → Local…</button>',
 '<button type="button" class="spl-btn spl-vg-copy-local">Copy Asset to Local</button>',
 '<button type="button" class="spl-btn spl-vg-refresh">Refresh Asset View</button>',
 '</div>',
 '<div class="spl-vg-source-mode" role="status">Local graph JSON</div>',
 '<div class="spl-vg-toolbar">',
 '<button type="button" class="spl-btn spl-vg-add-offset">＋ Offset</button>',
 '<button type="button" class="spl-btn spl-vg-add-width">＋ Width</button>',
 '<button type="button" class="spl-btn spl-vg-remove">✕ Remove</button>',
 '<button type="button" class="spl-btn spl-vg-auto-layout">⇱ Auto Layout</button>',
 '</div>',
 '<div class="spl-vg-viewport" tabindex="0" aria-label="Scrollable typed node graph">',
 '<div class="spl-vg-stage" role="group" aria-label="Geometry graph nodes"></div>',
 '</div>',
 '<div class="spl-vg-properties" aria-live="polite">Select a node to edit its parameters.</div>',
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
'.spl-vg-socket:hover{filter:brightness(1.3)}',
'.spl-vg-properties{margin:8px 0;padding:7px;border:1px solid #3b576b;border-radius:6px;font-size:11px}',
'.spl-vg-source,.spl-vg-note{font-size:10px;color:#b0c4d0;margin:4px 0}',
'.spl-vg-params{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;margin-top:6px}',
'.spl-vg-params label{display:flex;flex-direction:column;gap:2px}',
'.spl-vg-params input:not([type=checkbox]),.spl-vg-params select{min-width:0;width:100%;box-sizing:border-box;border:1px solid #546b78;border-radius:4px;background:rgba(22,37,51,.9);color:inherit;padding:4px}',
'.spl-vg-params input[type=checkbox]{align-self:flex-start}',
'.spl-vg-status{font-size:11px;white-space:pre-wrap;color:#9ad6c9;min-height:15px}',
'.spl-vg-status.error{color:#f7b2a9}'
].join('\n');
const $={...base.$,
  vgExport:'.spl-vg-export',vgImport:'.spl-vg-import',
  vgCopyLocal:'.spl-vg-copy-local',vgRefresh:'.spl-vg-refresh',
  vgSourceMode:'.spl-vg-source-mode',
  vgStage:'.spl-vg-stage',vgViewport:'.spl-vg-viewport',
  vgProperties:'.spl-vg-properties',vgStatus:'.spl-vg-status',
  vgAddOffset:'.spl-vg-add-offset',vgAddWidth:'.spl-vg-add-width',
  vgRemove:'.spl-vg-remove',vgAuto:'.spl-vg-auto-layout'};
function status(panel,message,isError=false){
  if(!panel.$?.vgStatus)return;
  panel.$.vgStatus.textContent=message;
  panel.$.vgStatus.classList?.toggle?.('error',isError);
}
function render(panel){
  if(panel.$?.vgSourceMode)panel.$.vgSourceMode.textContent=panel._vgShared?
    'Shared JsonAsset mode · canvas is read-only. Export or Copy Asset to Local to edit.':
    'Local graph · editable Visual Canvas';
  for(const key of ['vgAddOffset','vgAddWidth','vgAuto','vgCopyLocal']){
    const element=panel.$?.[key];
    if(element)element.disabled=key==='vgCopyLocal'?!panel._vgShared:!!panel._vgShared;
  }
  const stage=panel.$?.vgStage,properties=panel.$?.vgProperties;
  if(!stage||!properties)return;
  try{
    const view=graph.parseGraph(panel._vgGraphJson);
    if(panel._vgSelected&&!view.map.has(panel._vgSelected))
      panel._vgSelected=null;
    stage.innerHTML=graph.renderGraphCanvas(panel._vgGraphJson,
      panel._vgPreviewLayout||panel._vgLayoutJson,panel._vgSelected,panel._vgPending);
    properties.innerHTML=graph.renderNodeParameters(panel._vgGraphJson,panel._vgSelected);
    if(panel.$.vgRemove)panel.$.vgRemove.disabled=
      !!panel._vgShared||!['offset','width'].includes(view.map.get(panel._vgSelected)?.type);
    if(!panel._vgDrag)
      status(panel,panel._vgPending?
        'Connecting from '+panel._vgPending+': click a matching input socket.':
        'Graph valid · '+view.ordered.length+' nodes · drag headers to arrange.');
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
  if(panel._vgShared)throw Error('Shared JsonAsset is read-only: use Copy Asset to Local first.');
  if(!['graphJson','graphLayoutJson'].includes(key))
    throw Error('Visual Graph cannot edit '+key+'.');
  const dump=panel._splineDump?.value?.[key];
  const prop=panel.$?.['p_'+key];
  if(!dump||typeof dump.value!=='string'||!prop||
     typeof prop.dispatch!=='function')
    throw Error('Missing Cocos Inspector dump for '+key+'.');
  if(nextValue===dump.value)return false;
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
function editGraph(panel,action,details){
  try{
    const prior=graph.parseGraph(panel._vgGraphJson);
    const output=graph.applyGraphEdit(panel._vgGraphJson,action,details);
    if(!commitProperty(panel,'graphJson',output))return;
    panel._vgPending=null;panel._vgPreviewLayout=null;
    if(action==='insert'){
      const next=graph.parseGraph(output);
      const created=next.ordered.find(n=>!prior.map.has(n.id));
      panel._vgSelected=created?.id||null;
    }else if(action==='remove')panel._vgSelected=null;
    else if(action==='connect')panel._vgSelected=details.target;
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
  const requestToken=(panel._vgRequestToken||0)+1;
  panel._vgRequestToken=requestToken;
  try{
    const info=await Editor.Message.request('cocos-splines','query-geometry-graph-asset');
    if(panel._vgRequestToken!==requestToken||!panel._vgShared)return;
    if(!info?.ok||!info.assetMode)throw Error(info?.error||'Shared graph unavailable.');
    graph.parseGraph(info.graphJson);
    panel._vgGraphJson=info.graphJson;
    panel._vgSelected=null;panel._vgPending=null;
    render(panel);
    status(panel,'Shared JsonAsset: '+(info.assetName||'unnamed')+' · read-only view.');
  }catch(error){
    if(panel._vgRequestToken!==requestToken||!panel._vgShared)return;
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
    const changed=this._vgGraphJson!==graphJson||
      this._vgLayoutJson!==layoutJson||changedShared;
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
    const insert=type=>{
      try{
        const nodes=graph.parseGraph(this._vgGraphJson).ordered;
        const ribbon=nodes.find(n=>n.type==='ribbon');
        if(!ribbon)throw Error('Missing Ribbon node.');
        editGraph(this,'insert',{type,before:ribbon.id});
      }catch(error){status(this,String(error?.message||error),true);}
    };
    this.$.vgAddOffset.addEventListener('click',()=>insert('offset'));
    this.$.vgAddWidth.addEventListener('click',()=>insert('width'));
    this.$.vgRemove.addEventListener('click',()=>{
      if(this._vgSelected)editGraph(this,'remove',{id:this._vgSelected});
    });
    this.$.vgAuto.addEventListener('click',()=>commitLayout(this,'{}'));
    this.$.vgStage.addEventListener('click',event=>{
      if(this._vgIgnoreClick){this._vgIgnoreClick=false;return;}
      if(this._vgShared)return;
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
      if(this._vgShared||!input||!this._vgSelected)return;
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
    this._vgRequestToken=(this._vgRequestToken||0)+1;
  },
};
module.exports=inspector;
