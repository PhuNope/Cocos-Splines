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
.spl-status{font-size:11px;min-height:14px;color:#8ad6bb;white-space:pre-wrap}
.spl-placement-results{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;line-height:1.65;padding:8px;margin:6px 0;background:rgba(90,126,149,.07);border:1px solid var(--color-border-normal,#374b5c);border-radius:5px;user-select:text}
.spl-index-input{width:57px;max-width:57px;background:transparent;border:1px solid var(--color-border-normal,#364551);color:inherit;border-radius:4px;padding:3px}
`;
const configs={
  noise:{title:'Spline Noise Layers',note:'Deterministic multi-octave offset field, sample(progress) returns spline-frame Right/Up/Forward displacement. Add 1–16 layers; amplitude zero or no layer = no change. Integer cycles tile exactly on closed splines. Noise does NOT deform Knot positions or Road meshes. Assign this component to Object Controller → Noise to opt in.',groups:[{title:'Source & seed',fields:['spline','seed']},{title:'Noise layers',fields:['layers']}]},
  modifiers:{title:'Spline Modifiers',note:'Keyframes theo normalized ARC progress. Empty Keys = no change. Speed/Offset/Roll ảnh hưởng Animate (nếu gán Modifiers); Width ảnh hưởng Road; Scale/Offset ảnh hưởng Object Controller.',groups:[{title:'Keyed spline modifiers',fields:['spline','interpolation','keys']},{title:'Scene gizmos (selected)',fields:['showGizmos','gizmoSamples','showOffsetGizmos','showWidthGizmos','gizmoBaseWidth','showKeyGizmos','showFrameGizmos']}]},
  geometryGraph:{title:'Procedural Geometry Graph · V1/V2',
    note:'Phase 4.2b supports a shared native Cocos JsonAsset. Enable Use Graph Asset and drag a project .json into Graph Asset. Export writes a new JSON file; Import reads one into a local override; Copy Asset to Local preserves the source. Phase 4.2a adds an interactive typed Graph canvas below the properties. Drag node headers, click an output then input socket to reconnect, edit parameters on a selected card, insert Offset/Width and remove transforms. All graph/layout commits use native ui-prop dumps so Save/Undo/Prefab overrides remain Editor-owned. Graph V1 stays compatible. Opt-in Graph V2 has 2–4 Output Nodes. Use Add Output Branch / Set Default / Remove Output in the canvas, then set Output ID on each renderer to choose its own mesh from a shared JsonAsset. Empty Output ID selects the default. No children or extra MeshRenderers are created. Layout edits do not invalidate mesh caches. Phase 4.3e adds on-demand Profile CPU Cold/Warm in Visual Graph: read-only timing for individual nodes, excluding sampling, mesh upload and GPU. Shared Asset drafts must be saved or discarded before profiling; no Scene/JsonAsset property is written. Phase 4.3f1 adds a typed meshAsset → meshDeform.meshInput port: assign a readable native Mesh to Source Mesh (Allow Data Access, 1–4 submeshes, max 4096 vertices per selected submesh), then use ＋ Mesh Asset Input on the Mesh Deform card. Existing preset graphs stay unchanged. Phase 4.3f2b adds Mesh Deform Repeat Layout = Source Length (clip final tile), Tile Length = 0 to use source-axis bounds (or positive local-unit override) and UV Mode Original/Continuous/Distance. Count and distance-based UV remain defaults for old graphs. Phase 4.3g1 permits selecting Submesh 0–3 for Source Mesh A/B/C on each Renderer (native properties). Only that indexed submesh is deformed into one selected mesh output; materials remain manually owned by MeshRenderer and no child or extra renderer is created. Phase 4.3g2 adds opt-in Render All Outputs: the V2 graph 2–4 Output Nodes are rendered as distinct material primitives on the same MeshRenderer, ordered by sorted Output ID by default. Output Order provides a per-renderer comma-separated complete permutation; use the slot arrows below Visual Graph to remap Material A/B/C/D without editing a shared JsonAsset. Invalid orders preserve the last committed Mesh. Phase 4.3g2b2a adds optional Auto Bind Imported Materials: assign Source Mesh A/B/C, select the original source Submesh index, and drag the matching imported FBX/glTF model MeshRenderer into Material Source Renderer A/B/C. Material is read from sourceRenderer.getSharedMaterial(sourceSubMesh), not from the Mesh asset itself. Only branches backed by meshAsset import materials; generated branches keep manual/fallback. Explicit Material A/B/C/D overrides always win; mismatched source Mesh or missing referenced material rejects rebuilding without replacing the last successful Mesh. Imported source renderer is never written. Materials A/B/C/D correspond to indices 0–3; Output ID is ignored while enabled. Existing single-output rendering stays default.',
    groups:[
        {title:'Spline & graph asset source',fields:['spline','useGraphAsset','graphAsset','outputId','renderAllOutputs','outputOrder','sourceMesh','sourceSubMesh','sourceMeshB','sourceSubMeshB','sourceMeshC','sourceSubMeshC','samplesPerCurve']},
        {title:'Local graph JSON & canvas layout',fields:['graphJson','graphLayoutJson']},
        {title:'Material & live update',fields:['material','materialB','materialC','materialD','autoBindImportedMaterials','materialSourceRenderer','materialSourceRendererB','materialSourceRendererC','rebuildOnChange']},
        {title:'Selected-only geometry wireframe',fields:['showMeshGizmos','gizmoEdgeLimit']},
    ]},
  objectController:{title:'Spline Object Controller',note:'Rải nhiều prefab theo Count/Distance, có random ổn định theo seed. Spawn / Respawn tạo clone ngay trong Hierarchy và có thể lưu vào Scene. Spawn On Start chỉ tạo khi chưa có object lưu sẵn. Rebuild On Change chỉ tác động lên bản spawn runtime. Optional SplineNoise adds deterministic Right/Up/Forward offsets; no Knot or mesh deformation. Advanced Population is disabled by default: uniform Density × linear Density Keys mask, exclusion intervals (closed-wrap allowed) and final World-center minimum spacing. Optional weighted prefab selection uses one nonnegative weight per prefab slot (zero disables a variant). Explicit assigned Collider World AABBs can reject candidates with a clearance radius. Optional Precise Obstacle Shapes uses validated BoxCollider OBB and CapsuleCollider shapes; optional MeshCollider BVH uses readable non-convex mesh triangles for center-sphere contact. Convex, unreadable or unsupported meshes fall back to conservative AABB. Placement Footprint Radius is a manual sphere around the prefab center. Optional Auto Prefab Footprint infers a conservative per-variant sphere from static Prefab.data Collider/MeshRenderer bounds plus nested transforms and actual placement scale; unsupported geometry rejects Respawn without clearing previous instances. Optional Surface/Terrain Conform casts downward against explicit Physics 3D Collider targets, projects final prefab centers, optionally aligns local Up with the hit normal, and supports missing-hit rejection. Surface projection occurs before obstacle/spacing filtering. Shared Occupancy is explicitly opt-in: reference lower Occupancy Priority controller Nodes already spawned in the same Scene, compare final World centers against their published sphere radii + your own radius/clearance, and reject collisions before World spacing. No peer is auto-respawned or modified; peers may be empty but must have a generated root. Optional selected-only Placement Debug Gizmos uses the exact non-mutating preflight used by Respawn and colors kept / Surface / Collider / Peer / Exclusion / Density / Spacing rejections. Markers are capped in Scene view and gizmo preview is disabled by default. The candidate plan is validated before any existing instances are cleared.',groups:[{title:'Source',fields:['spline','prefabs','parentNode','modifiers','noise']},{title:'Placement',fields:['method','count','spacing','startProgress','endProgress','includeEndPoint','alignToSpline','offset']},{title:'Variants & jitter',fields:['randomPosition','randomRotation','randomScale','scaleMultiplier','seed','spawnOnStart','rebuildOnChange']},{title:'Weighted prefab selection · opt-in',fields:['usePrefabWeights','prefabWeights']},{title:'Collider obstacle avoidance · opt-in',fields:['avoidObstacleColliders','obstacleColliders','obstacleClearance','usePreciseObstacleShapes','placementFootprintRadius','autoPrefabFootprint','useMeshColliderBVH']},{title:'Surface / Terrain Conform · opt-in',fields:['conformToSurface','surfaceColliders','surfaceRayHeight','surfaceRayDepth','surfaceOffset','minSurfaceNormalY','skipMissingSurface','alignToSurfaceNormal']},{title:'Shared Occupancy · opt-in',fields:['avoidPeerPopulation','occupancyPriority','occupancyPeerNodes','sharedOccupancyRadius','peerOccupancyClearance']},{title:'Advanced Population · opt-in',fields:['enablePopulationRules','density','densityKeys','exclusions','minWorldSpacing']},{title:'Placement Debug Gizmos · selected only',fields:['showPlacementGizmos','placementGizmoLimit','placementGizmoSize','showPlacementFootprints']}]},
  junctionMesh:{title:'Spline Junction Mesh',note:'Surface patch 2-4 nhánh gần đồng phẳng. UV Mode = Road Matched đọc hai vòng asphalt và UV thực tế từ SplineRoad, trộn UV tại tâm, cần chung shared Material + Repeat wrapping. Không Boolean/weld mesh hoặc làm vạch làn liên tục tự động.',groups:[{title:'Junction',fields:['junction','material','showMeshGizmos','gizmoEdgeLimit']},{title:'Patch geometry',fields:['setback','defaultWidth','surfaceLift','uvMode','uvBlendStart','uvMetersPerRepeat','tolerance','rebuildOnChange']}]},
  bender:{title:'Spline Object Bender',note:'Uốn tất cả readable single-submesh MeshRenderer của hierarchy, giữ Material và source Mesh. Root chứa Bender không được là parent của Spline source. Bật Preview in Editor, Apply rồi Restore; cần Allow Data Access cho từng mesh.',groups:[{title:'Source',fields:['spline','axis','layout','partGap']},{title:'Range',fields:['rangeMode','startProgress','endProgress','startDistance','endDistance']},{title:'Mesh & Preview',fields:['widthScale','heightScale','maxMeshes','previewInEditor','rebuildOnChange','showMeshGizmos','gizmoEdgeLimit']}]},
  morph:{title:'Spline Morph',note:'Hai spline nguồn phải khác output. Output phải có >=2 Knot không dùng Tangent Handle Node. World dùng vị trí/tangent thế giới; Local dùng tọa độ knot/tangent local, không phụ thuộc transform của hai source. Cùng số knot => blend chính xác cubic tangents; khác số knot => resample xấp xỉ. Preview in Editor là opt-in, Restore hoàn nguyên output.',groups:[{title:'Sources & output',fields:['sourceA','sourceB','outputSpline']},{title:'Morph',fields:['blend','space','previewInEditor','updateOnChange']}]},
  knot:{title:'Spline Knot',note:'Bật Edit Tangent Handles khi có Node handles để luôn thấy curve/tangent trong Scene. Tắt để ẩn hiển thị liên tục; chọn Knot vẫn luôn thấy hai tangent, kể cả Container tắt Show Tangents. Kéo handle bằng W; thao tác chỉ ảnh hưởng hiển thị, không xóa handle Node.',groups:[{title:'Tangent mode',fields:['mode','tension','tangentIn','tangentOut','tangentsInKnotSpace']},{title:'Optional handles',fields:['tangentInHandle','tangentOutHandle','editTangentHandles']}]},
  extrude:{title:'Spline Extrude',note:'Spline để trống nếu SplineExtrude cùng Node với SplineContainer.',groups:[{title:'Source & geometry',fields:['spline','radius','endRadius','rangeMode','startProgress','endProgress','startDistance','endDistance','sides','segmentsPerCurve','capEnds','flipNormals','uvTiling']},{title:'Material & update',fields:['material','rebuildOnChange','showMeshGizmos','gizmoEdgeLimit']}]},
  road:{title:'Spline Road',note:'Road là node con của SplineContainer (MeshRenderer riêng, không xung đột Extrude). Chỉnh Width/Shoulder/Curbs, vật liệu và UV ngay trong Inspector. Kéo các Knot ở Scene để uốn đường. Nút Rebuild cập nhật kể cả khi Editor không chạy main loop.',groups:[{title:'Source & Road Surface',fields:['spline','modifiers','width','endWidth','rangeMode','startProgress','endProgress','startDistance','endDistance','samplesPerCurve']},{title:'Sharp corners',fields:['cornerMode','cornerTrimSafety']},{title:'Shoulders & Curbs',fields:['shoulderWidth','shoulderDrop','curbWidth','curbHeight']},{title:'Volume & UV',fields:['thickness','capEnds','uvDirection','uvMetersPerRepeat','uvWidthTiles','uvReverseAcross','uvReverseLength','uvOffsetU','uvOffsetV']},{title:'Material & live update',fields:['roadMaterial','asphaltColor','rebuildOnChange','showMeshGizmos','gizmoEdgeLimit']}]},
  trigger:{title:'Spline Trigger',note:'Spline để trống sẽ tìm Container ở parent. Chọn Position Mode: Normalized Distance (legacy), Distance (units) hoặc Spline t (Bezier). Khi follower đi ngang marker, phát Cocos EventHandler + node.emit(\'spline-trigger\', payload).',groups:[{title:'Marker',fields:['spline','positionMode','progress','distance','direction','workOnce','oncePerFollower']},{title:'Events',fields:['onCross']}]},
  trafficController:{title:'Spline Traffic Controller',
    note:'Tự động điều khiển Junction theo Phase. Gán Junction (hoặc gắn cùng Node), nhập Phases[] với các Connections index cho phép Green. Yellow chặn xe mới, All-Red Clearance bắt buộc giữa pha. Nếu khai báo Conflict Pairs[], hai exit xung đột không được Green cùng lúc. Khi cấu hình sai tất cả exit bị Red; tắt Component để khôi phục tín hiệu thủ công. Chỉ áp dụng follower Enable Traffic Capacity. Không tự động suy ra xung đột từ hình học. Adaptive Traffic (tắt mặc định) ưu tiên các phase có nhiều follower đang xếp hàng; Min Green/Max Green và Max Demand Wait chỉ áp dụng Adaptive. Không bảo đảm thời gian chờ tuyệt đối khi exit bị giữ slot.',
    groups:[{title:'Target Junction',fields:['junction']},
      {title:'Automatic phases',fields:['phases','allRedSeconds']},
      {title:'Adaptive queue demand (opt-in)',fields:['adaptiveTraffic','minGreenSeconds','maxGreenSeconds','maxDemandWaitSeconds']},
      {title:'Explicit forbidden Green pairs',fields:['conflicts']},
      {title:'Read-only 3D conflict probe',fields:['conflictProbeTolerance','conflictProbeLookahead','conflictProbeIgnoreOrigin','conflictUseRoadWidths','conflictAutoRoadWidths','conflictRoadSources','conflictRoadHalfWidths','conflictVerticalTolerance']}]},
  junction:{title:'Spline Junction',note:'Connector Check đo gap/hướng tangent theo World. Snap Endpoint chỉ dịch chuyển một Knot đầu/cuối của spline mở, không tự xoay tangent hoặc chỉnh Junction links. Thêm ít nhất 2 Connections. Gán mỗi link SplineContainer + Position Mode; nhập Progress 0..1 hoặc Distance theo chiều dài spline. SplineAnimate chọn Junction Mode: First Other / Round Robin / Manual. Exit Direction ở từng link đích: Preserve giữ chiều đến, Forward tăng Progress về 1, Backward giảm Progress về 0. Event payload cung cấp follower để gọi requestJunctionExit(index).',groups:[{title:'Routes',fields:['connections']},{title:'Events',fields:['onReach','onSwitch']}]},
  instantiate:{title:'Spline Instantiate',note:'Spawn / Respawn tạo prefab ngay trong Scene Hierarchy; Spawn On Start không tạo trùng nếu các instance đã được lưu trong Scene.',groups:[{title:'Source',fields:['spline','prefab','parentNode']},{title:'Distribution',fields:['count','method','spacing','rangeMode','startProgress','endProgress','startDistance','endDistance','includeEndPoint','alignToSpline','positionOffset','rotationOffset','randomOffset','seed','scaleMultiplier','spawnOnStart','rebuildOnChange']}]},
  path2d:{title:'Spline 2D Path',note:'Sử dụng dưới Canvas/RenderRoot2D + UITransform, thuộc tính Dimension của spline phải là XY2D. Đường được vẽ bằng Graphics; không cần MeshRenderer.',groups:[{title:'Spline & appearance',fields:['spline','lineWidth','strokeColor','stepsPerCurve','rebuildOnChange']}]},
  deform:{title:'Spline Mesh Deform',note:'Gán một imported Mesh có chiều dài theo trục X/Y/Z và Allow Data Access. Mesh phải đủ segments dọc trục uốn, chỉ hỗ trợ 1 submesh non-skinned. Hệ trục X/Y đã tự sửa chiều mặt (winding). Nếu mesh nguồn vẫn đảo mặt, bật Flip Faces (đảo cả index và normal). UV KeepOriginal giữ nguyên atlas cho từng tile (khuyên dùng cho FBX ray/tà vẹt). Repeat Layout = SourceLength tự tính số đoạn theo kích thước mesh và cắt phần cuối, không ép giãn. UV Distance/ContinuousRepeat có thể làm sai màu UV atlas; texture Wrap Repeat chỉ hợp với UV được thiết kế để tile. Plugin xuất smooth normals và tangents để dùng được builtin-standard/normal map. Axis X/Y đã tự sửa mặt: nếu lật Flip Faces ON có thể làm vật thể tối/mất mặt trước.',groups:[{title:'Source mesh',fields:['spline','sourceMesh','material']},{title:'Deform axis & distribution',fields:['axis','mode','repeatLayout','repeatCount','tileLength','flipFaces','widthScale','heightScale','rangeMode','startProgress','endProgress','startDistance','endDistance']},{title:'UV & rebuild',fields:['uvMode','uvTilesPerUnit','rebuildOnChange','showMeshGizmos','gizmoEdgeLimit']}]},
  positioner:{title:'Spline Positioner',note:'Dreamteck-inspired. Đặt node vào t hoặc Distance mà không cần Animate. Follow Target sẽ project node tham chiếu lên spline, rồi cộng Follow Distance. Trong Editor, bật Preview in Editor mới di chuyển node và tắt để Restore.',groups:[{title:'Source & target',fields:['spline','target']},{title:'Placement',fields:['positionMode','progress','distance','followTarget','followDistance','wrapClosed','splineOffset','alignToSpline','rotationOffset']},{title:'Preview & runtime',fields:['followOnUpdate','previewInEditor']}]},
  projector:{title:'Spline Projector',note:'Chiếu vị trí Source Node đến điểm gần nhất của spline trong WORLD space, kể cả non-uniform scale. Projected Node là marker di chuyển khi Snap to Spline bật. Để tránh Source và Marker tự khóa vào nhau, sử dụng 2 Node khác nhau. On Enter/Exit sử dụng bán kính world units.',groups:[{title:'Source & projection',fields:['spline','sourceNode','projectedNode','samples','autoProject','snapToSpline','alignToSpline','splineOffset']},{title:'Proximity events',fields:['enterExitRadius','notifyOnProject','onProject','onEnter','onExit']},{title:'Editor preview',fields:['previewInEditor']}]},
  length:{title:'Spline Length Monitor',note:'Tương tự Dreamteck LengthCalculator: theo dõi chiều dài spline trong local units, phát On Changed / Growing / Shrinking và event khi vượt qua threshold. Có thể Measure Length trong Inspector. Editor không tự phát gameplay events.',groups:[{title:'Length check',fields:['spline','threshold','tolerance','autoCheck']},{title:'Events',fields:['onChanged','onGrowing','onShrinking','onCrossAbove','onCrossBelow']}]},
  animate:{title:'Spline Animate' ,note:'Kéo Node chứa SplineContainer vào trường Spline. Target để trống sẽ di chuyển chính Node gắn SplineAnimate. Nếu Animate đặt trên chính Container, hãy gán Target là Node khác. Bật Preview in Editor để xem vị trí mà không cần Play. Start/Preview hỗ trợ Normalized Distance, Distance và Spline t.',groups:[
    {title:'Spline source',fields:['spline','target','modifiers','worldOffset','splineOffset','constantSpeedWithOffset']},
    {title:'Playback',fields:['method','duration','speed','loopMode','easing','alignToSpline','upMode','upReference','forwardAxis','rotationOffset','orient2D','orient2DAngleOffset','playOnStart','startPositionMode','startProgress','startDistance']},
    {title:'Follower lane & headway (opt-in)',fields:['headwayLaneId','enableHeadway','headwayWorldGap','headwayBrakeDistance']},
    {title:'Physical lane position (opt-in)',fields:['enableLanePlacement','laneCount','laneWidth']},
    {title:'3D proximity sweep (opt-in)',fields:['enableProximityAvoidance','proximityRadius','proximityUseColliderBounds','proximityUseBoxObb','proximityUseCapsule','proximityUseMeshCollider','proximityCollider','proximitySafetyGap','proximitySweepSamples','proximityPredictAgents','proximityPredictionHorizon','proximityPredictAcceleration','proximityPredictRotationEnvelope']},
    {title:'Junction routing & follower events',fields:['junctionMode','routeDestination','routeDestinationProgress','routeTransferPenalty','routeMaxWorldGap','routeCostSpace','stopOnRouteArrival','onRouteArrived','enableTrafficCapacity','trafficPriority','rerouteAroundTraffic','junctionOffsetBlendDistance','onBeginningReached','onEndReached']},
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
    if(type==='trafficController'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-check-traffic-conflicts">Check 3D Conflict Candidates</button></div>`;
        selectors.checkTrafficConflicts='.spl-check-traffic-conflicts';
    }
    if(type==='junction'){
        groups+=`<details class="spl-section"><summary>Connector validation / endpoint snap</summary>
          <p class="spl-note">Check geometry in world units. Snap moves a target endpoint position only. Join creates a NEW independent spline from two exact open-spline endpoints (Snap first if separated); sources are not changed. Join uses resolved source tangents and does not preserve extra Knot components. Choose Preserve (exact source cubic segments), G1 (align outgoing only, keep its magnitude) or C1 (align outgoing and match incoming magnitude); smoothing changes only the NEW output segment, not source splines. Degenerate seam tangents reject optional smoothing. Fan-out makes a separate independent Joined Spline per exit; a Junction with branches cannot be represented by one Bezier chain without duplicate backtracks. Across Junctions chooses a deterministic minimum-switch route between a selected Anchor link and a destination Spline Node UUID (at least two distinct Junctions). Full mode (default) preserves earlier endpoint-only behavior; opt-in Partial mode slices exact Bezier portions at mid-spline Junction links, with explicit start/finish sides, preserving source splines. Requires physically coincident link points. Route optimization defaults to fewest switches; optional shortest World-distance or distance plus a custom penalty per Junction switch uses bounded geometric sampling. Optional route exit policy can respect Junction Exit Direction and currently Green signals (Editor snapshot only). Configured admission can check Max Followers and possible Green phases, but not live occupancy or queues. Align Tangent (G1/C1) changes only a Broken-mode target tangent. Interior links and closed splines cannot Join.</p>
          <div class="spl-btns"><button type="button" class="spl-btn spl-check-connections">Check Connectors</button></div>
          <div class="spl-btns">
            <label>Join seam treatment
              <select class="spl-index-input spl-join-seam-mode" style="max-width:220px;width:220px">
                <option value="preserve">Preserve source curves (default)</option>
                <option value="g1">G1 · align outgoing direction</option>
                <option value="c1">C1 · align direction + magnitude</option>
              </select>
            </label>
          </div>
          <div class="spl-btns">
            <label>Anchor link # <input type="number" class="spl-index-input spl-connector-anchor" min="0" max="63" step="1" value="0"></label>
            <label>Target link # <input type="number" class="spl-index-input spl-connector-target" min="0" max="63" step="1" value="1"></label>
            <button type="button" class="spl-btn spl-snap-connector">Snap Target Endpoint</button>
            <button type="button" class="spl-btn spl-join-connector">Join Links → New Spline</button>
          </div>
          <div class="spl-btns">
            <label>Fan-out target links (comma-separated, 2–8)
              <input type="text" class="spl-index-input spl-fanout-targets" value="1,2" style="width:115px" placeholder="1,2,3">
            </label>
            <button type="button" class="spl-btn spl-join-fanout">Join Fan-out → New Splines</button>
          </div>
          <div class="spl-btns">
            <label>Destination Spline Node UUID
              <input type="text" class="spl-index-input spl-route-destination" style="width:170px" placeholder="Paste destination Node UUID">
            </label>
            <button type="button" class="spl-btn spl-join-route">Join Across Junctions → New Spline</button>
          </div>
          <div class="spl-btns">
            <label>Route traversal
              <select class="spl-index-input spl-route-mode" style="width:165px">
                <option value="full">Full splines (default)</option>
                <option value="partial">Allow mid-spline slicing</option>
              </select>
            </label>
            <label>Start from
              <select class="spl-index-input spl-route-start-side" style="width:95px">
                <option value="0">Start (0)</option><option value="1">End (1)</option>
              </select>
            </label>
            <label>Finish at
              <select class="spl-index-input spl-route-goal-side" style="width:95px">
                <option value="1">End (1)</option><option value="0">Start (0)</option>
              </select>
            </label>
          </div>
          <div class="spl-btns">
            <label>Route optimization
              <select class="spl-index-input spl-route-cost-mode" style="width:200px">
                <option value="switches">Fewest switches (default)</option>
                <option value="distance">Shortest world distance</option>
                <option value="balanced">Distance + switch penalty</option>
              </select>
            </label>
            <label>Switch penalty (world units)
              <input type="number" class="spl-index-input spl-route-switch-penalty"
                min="0" max="100000" step="0.5" value="10" style="width:95px">
            </label>
          </div>
          <div class="spl-btns">
            <label>Route exit policy
              <select class="spl-index-input spl-route-policy" style="width:235px">
                <option value="ignore">Ignore exit restrictions (default)</option>
                <option value="direction">Respect Preserve / Forward / Backward</option>
                <option value="direction-green">Respect direction + Green signal only</option>
              </select>
            </label>
          </div>
          <div class="spl-btns">
            <label>Configured admission (Editor estimate)
              <select class="spl-index-input spl-route-admission" style="width:235px">
                <option value="ignore">Ignore capacity (default)</option>
                <option value="capacity">Respect configured Max Followers</option>
                <option value="capacity-phases">Max Followers + potential Green phases</option>
              </select>
            </label>
            <label>Required followers
              <input type="number" class="spl-index-input spl-route-required-followers"
                min="1" max="4096" step="1" value="1" style="width:90px">
            </label>
          </div>
          <div class="spl-btns">
            <label>Tangent <select class="spl-index-input spl-tangent-mode" style="max-width:120px;width:120px"><option value="g1">G1 · direction</option><option value="c1">C1 · magnitude</option></select></label>
            <label>Forward <select class="spl-index-input spl-tangent-direction" style="max-width:125px;width:125px"><option value="same">Same</option><option value="opposed">Opposed</option></select></label>
            <button type="button" class="spl-btn spl-convert-connector-mode">Convert Target → Broken</button>
            <button type="button" class="spl-btn spl-align-connector">Align Tangent</button>
          </div>
        </details><div class="spl-btns"><button type="button" class="spl-btn spl-add-junction-mesh">＋ Add XZ Road Patch</button></div>`;
        selectors.addJunctionMesh='.spl-add-junction-mesh';
        selectors.checkConnections='.spl-check-connections';
        selectors.connectorAnchor='.spl-connector-anchor';
        selectors.connectorTarget='.spl-connector-target';
        selectors.snapConnector='.spl-snap-connector';
        selectors.joinConnector='.spl-join-connector';
        selectors.fanoutTargets='.spl-fanout-targets';
        selectors.joinFanout='.spl-join-fanout';
        selectors.routeDestination='.spl-route-destination';
        selectors.joinRoute='.spl-join-route';
        selectors.routeMode='.spl-route-mode';
        selectors.routeStartSide='.spl-route-start-side';
        selectors.routeGoalSide='.spl-route-goal-side';
        selectors.routeCostMode='.spl-route-cost-mode';
        selectors.routePolicy='.spl-route-policy';
        selectors.routeAdmission='.spl-route-admission';
        selectors.routeRequiredFollowers='.spl-route-required-followers';
        selectors.routeSwitchPenalty='.spl-route-switch-penalty';
        selectors.joinSeamMode='.spl-join-seam-mode';
        selectors.alignConnector='.spl-align-connector';
        selectors.convertConnectorMode='.spl-convert-connector-mode';
        selectors.tangentMode='.spl-tangent-mode';
        selectors.tangentDirection='.spl-tangent-direction';
    }
    if(type==='road'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-rebuild-road">↻ Rebuild Road</button></div>`;
        selectors.rebuildRoad='.spl-rebuild-road';
    }
    if(type==='deform'||type==='path2d'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-rebuild-geometry">↻ Rebuild ${type==='deform'?'Mesh':'2D Path'}</button></div>`;
        selectors.rebuildGeometry='.spl-rebuild-geometry';
    }
    if(type==='instantiate'||type==='objectController'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-spawn">＋ Spawn</button><button type="button" class="spl-btn spl-respawn">↻ Respawn</button><button type="button" class="spl-btn spl-clear-spawned spl-danger">✕ Clear Spawned</button></div>`;
        selectors.spawn='.spl-spawn';selectors.respawn='.spl-respawn';selectors.clearSpawned='.spl-clear-spawned';
    }
    if(type==='objectController'){
        groups+=`<details class="spl-section" open><summary>Placement statistics · read-only</summary>
          <div class="spl-btns"><button type="button" class="spl-btn spl-placement-analyze">Analyze Placement</button></div>
          <div class="spl-note">Exact candidate totals; not limited by Gizmo marker count. Manual snapshot: click after changing settings or peers. No Scene mutation.</div>
          <div class="spl-placement-results" role="status">Chưa phân tích. Nhấn Analyze Placement.</div>
        </details>`;
        selectors.placementAnalyze='.spl-placement-analyze';
        selectors.placementSummary='.spl-placement-results';
    }
    if(type==='geometryGraph'){
        groups+=`<div class="spl-btns"><button type="button" class="spl-btn spl-rebuild-graph">↻ Rebuild Graph</button></div>`;
        selectors.rebuildGraph='.spl-rebuild-graph';
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
        if(type==='modifiers'){
            if(['gizmoSamples','showOffsetGizmos','showWidthGizmos','gizmoBaseWidth','showKeyGizmos','showFrameGizmos'].includes(field)&&v('showGizmos')===false)return false;
            if(field==='gizmoBaseWidth'&&v('showWidthGizmos')===false)return false;
        }
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
        if(type==='trafficController'&&['minGreenSeconds','maxGreenSeconds','maxDemandWaitSeconds'].includes(field))return v('adaptiveTraffic')===true;
        if(type==='trafficController'&&field==='conflictAutoRoadWidths')return v('conflictUseRoadWidths')===true;
        if(type==='trafficController'&&field==='conflictRoadSources')
            return v('conflictUseRoadWidths')===true&&v('conflictAutoRoadWidths')===true;
        if(type==='trafficController'&&field==='conflictRoadHalfWidths')
            return v('conflictUseRoadWidths')===true&&v('conflictAutoRoadWidths')!==true;
        if(type==='trafficController'&&field==='conflictVerticalTolerance')
            return v('conflictUseRoadWidths')===true;
        if(type==='animate'){
            if(['routeDestination','routeDestinationProgress','routeTransferPenalty','routeMaxWorldGap','routeCostSpace','stopOnRouteArrival','onRouteArrived'].includes(field))
                return Number(v('junctionMode'))===4;
            if(field==='rerouteAroundTraffic')return Number(v('junctionMode'))===4&&v('enableTrafficCapacity')===true;
            if(field==='trafficPriority')return v('enableTrafficCapacity')===true;
            if(['headwayWorldGap','headwayBrakeDistance'].includes(field))return v('enableHeadway')===true;
            if(['laneCount','laneWidth'].includes(field))return v('enableLanePlacement')===true;
            if(['proximityRadius','proximitySafetyGap','proximitySweepSamples','proximityUseColliderBounds','proximityPredictAgents'].includes(field))return v('enableProximityAvoidance')===true;
            if(['proximityPredictionHorizon','proximityPredictAcceleration','proximityPredictRotationEnvelope'].includes(field))return v('enableProximityAvoidance')===true&&v('proximityPredictAgents')===true;
            if(['proximityCollider','proximityUseBoxObb','proximityUseCapsule','proximityUseMeshCollider'].includes(field))return v('enableProximityAvoidance')===true&&v('proximityUseColliderBounds')===true;
            if(field==='startProgress')return Number(v('startPositionMode'))!==1;
            if(field==='startDistance')return Number(v('startPositionMode'))===1;
            if(field==='previewProgress')return Number(v('previewPositionMode'))!==1;
            if(field==='previewDistance')return Number(v('previewPositionMode'))===1;
        }
        if(type==='animate'){
            if(field==='duration')return Number(v('method'))===0;
            if(field==='speed')return Number(v('method'))===1;
            if(['upMode','forwardAxis','rotationOffset'].includes(field))return v('alignToSpline')===true;
            if(field==='upReference')return v('alignToSpline')===true&&Number(v('upMode'))===2;
        }
        if(type==='bender'&&field==='partGap')return Number(v('layout'))===1;
        if(type==='deform'){
            if(field==='repeatLayout')return Number(v('mode'))===1;
            if(field==='repeatCount')return Number(v('mode'))===1&&Number(v('repeatLayout'))===0;
            if(field==='tileLength')return Number(v('mode'))===1&&Number(v('repeatLayout'))===1;
            if(field==='uvTilesPerUnit')return Number(v('uvMode'))===2;
        }
        if(type==='geometryGraph'&&field==='graphLayoutJson')return false;
        if(type==='geometryGraph'&&field==='outputOrder')return v('renderAllOutputs')===true;
        if(type==='geometryGraph'&&field==='autoBindImportedMaterials')
            return v('renderAllOutputs')===true;
        if(type==='geometryGraph'&&['materialSourceRenderer','materialSourceRendererB',
           'materialSourceRendererC'].includes(field))
            return v('renderAllOutputs')===true&&v('autoBindImportedMaterials')===true;
        if(type==='geometryGraph'&&field==='graphAsset')return v('useGraphAsset')===true;
        if(type==='geometryGraph'&&field==='graphJson')return v('useGraphAsset')!==true;
        if(type==='objectController'){
            if(field==='count')return Number(v('method'))===0;
            if(field==='spacing')return Number(v('method'))===1;
            if(field==='prefabWeights')return v('usePrefabWeights')===true;
            if(['placementGizmoLimit','placementGizmoSize','showPlacementFootprints'].includes(field))return v('showPlacementGizmos')===true;
            if(['obstacleColliders','obstacleClearance','usePreciseObstacleShapes'].includes(field))
                return v('avoidObstacleColliders')===true;
            if(['placementFootprintRadius','useMeshColliderBVH','autoPrefabFootprint'].includes(field))
                return v('avoidObstacleColliders')===true&&v('usePreciseObstacleShapes')===true&&
                    (field!=='placementFootprintRadius'||v('autoPrefabFootprint')!==true);
            if(['density','densityKeys','exclusions','minWorldSpacing'].includes(field))
                return v('enablePopulationRules')===true;
            if(['occupancyPeerNodes','occupancyPriority','sharedOccupancyRadius','peerOccupancyClearance'].includes(field))
                return v('avoidPeerPopulation')===true||field==='occupancyPriority'||field==='sharedOccupancyRadius';
            if(['surfaceColliders','surfaceRayHeight','surfaceRayDepth','surfaceOffset',
                'minSurfaceNormalY','skipMissingSurface','alignToSurfaceNormal'].includes(field))
                return v('conformToSurface')===true&&
                    (field!=='alignToSurfaceNormal'||v('alignToSpline')!==false);
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
            if(type==='instantiate'||type==='objectController'){
                this.$.spawn.addEventListener('click',()=>void callEditor(this,'spawn-prefabs',type,'spawn'));
                this.$.respawn.addEventListener('click',()=>void callEditor(this,'spawn-prefabs',type,'respawn'));
                this.$.clearSpawned.addEventListener('click',()=>void callEditor(this,'spawn-prefabs',type,'clear'));
            }
            if(type==='objectController'){
                this.$.placementAnalyze.addEventListener('click',async()=>{
                    const button=this.$.placementAnalyze,output=this.$.placementSummary;
                    if(button.disabled)return;
                    button.disabled=true;
                    output.textContent='Đang tính thống kê (không tạo prefab)...';
                    try{
                        const result=await callEditor(this,'query-placement-summary');
                        output.textContent=result?.ok===true?
                            formatPlacementSummary(result.summary):
                            'Không thể phân tích: '+String(result?.error||'Unknown error');
                    }catch(error){
                        output.textContent='Không thể phân tích: '+String(error?.message||error);
                    }finally{button.disabled=false;}
                });
            }
            if(type==='geometryGraph'){
                this.$.rebuildGraph.addEventListener('click',()=>
                    void callEditor(this,'rebuild-geometry-graph'));
            }
    if(type==='junctionMesh'||type==='bender'||type==='morph'){
                const name=type==='junctionMesh'?'rebuild-junction-patch':type==='bender'?'apply-bender':'apply-morph';
                this.$.action.addEventListener('click',()=>void callEditor(this,name));
                if(this.$.unapply)this.$.unapply.addEventListener('click',()=>void callEditor(this,type==='bender'?'restore-bender':'restore-morph'));
            }
            if(type==='trafficController'){
                this.$.checkTrafficConflicts.addEventListener('click',()=>
                    void callEditor(this,'check-traffic-conflicts'));
            }
            if(type==='junction'){
                this.$.addJunctionMesh.addEventListener('click',()=>void callEditor(this,'create-junction-mesh'));
                this.$.checkConnections.addEventListener('click',()=>void callEditor(this,'check-junction-connections'));
                this.$.joinRoute.addEventListener('click',()=>void callEditor(this,
                    'join-multi-junction-route',Number(this.$.connectorAnchor.value),
                    this.$.routeDestination.value.trim(),this.$.joinSeamMode.value,
                    this.$.routeMode.value,Number(this.$.routeStartSide.value),
                    Number(this.$.routeGoalSide.value),this.$.routeCostMode.value,
                    Number(this.$.routeSwitchPenalty.value),
                    this.$.routePolicy.value,this.$.routeAdmission.value,
                    Number(this.$.routeRequiredFollowers.value)));
                this.$.joinFanout.addEventListener('click',()=>void callEditor(this,
                    'join-junction-fanout',Number(this.$.connectorAnchor.value),
                    this.$.fanoutTargets.value,this.$.joinSeamMode.value));
                this.$.joinConnector.addEventListener('click',()=>void callEditor(this,
                    'join-junction-links',Number(this.$.connectorAnchor.value),Number(this.$.connectorTarget.value),
                    this.$.joinSeamMode.value));
                this.$.snapConnector.addEventListener('click',()=>void callEditor(this,
                    'snap-junction-endpoint',Number(this.$.connectorAnchor.value),Number(this.$.connectorTarget.value)));
                this.$.convertConnectorMode.addEventListener('click',()=>void callEditor(this,
                     'convert-junction-tangent-mode',Number(this.$.connectorTarget.value)));
                this.$.alignConnector.addEventListener('click',()=>void callEditor(this,
                    'align-junction-tangent',Number(this.$.connectorAnchor.value),
                    Number(this.$.connectorTarget.value),this.$.tangentMode.value,
                    this.$.tangentDirection.value));
            }
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
/** Text-only snapshot formatter. Never inject values into HTML. */
function formatPlacementSummary(stats){
    if(!stats||!Number.isInteger(stats.total)||stats.total<0||
       stats.total>2048||!Number.isInteger(stats.accepted)||
       stats.accepted<0||stats.accepted>stats.total||
       !Number.isInteger(stats.rejected)||stats.rejected!==stats.total-stats.accepted)
        throw Error('Invalid placement summary returned from Scene.');
    const legend=[
        ['accepted','✓ Accepted'],['surface','● Surface'],['collider','● Collider'],
        ['peer','● Peer'],['exclusion','● Exclusion'],['density','● Density'],
        ['spacing','● Spacing']
    ];
    let sum=0;
    const rows=legend.map(([reason,label])=>{
        const count=stats.byReason?.[reason];
        if(!Number.isInteger(count)||count<0||count>stats.total)
            throw Error('Invalid '+reason+' placement reason count.');
        sum+=count;
        const indices=reason==='accepted'?[]:stats.examples?.[reason];
        if(reason!=='accepted'&&(!Array.isArray(indices)||indices.length>3||
            indices.some(n=>!Number.isInteger(n)||n<0||n>2047)))
            throw Error('Invalid placement rejection examples.');
        return label+': '+count+(indices?.length?'  (index '+indices.join(', ')+')':'');
    });
    if(sum!==stats.total||stats.byReason.accepted!==stats.accepted)
        throw Error('Placement reason totals do not match candidate count.');
    const pct=stats.total?Math.round(stats.accepted/stats.total*1000)/10:0;
    return 'Total: '+stats.total+'  |  Accepted: '+stats.accepted+' ('+pct+'%)  |  Rejected: '+
        stats.rejected+'\n'+rows.join('\n')+'\nSnapshot: press Analyze Placement again to refresh.';
}
module.exports={makeInspector,style,callEditor,escapeHtml,formatPlacementSummary};
