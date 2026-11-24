# Kế hoạch Unity parity — Cocos Splines

## Nguồn và giới hạn

- **Dreamteck.zip**: bản gửi có `Splines/Examples` (Following/Junctions/LengthEvents/Projection/RollerCoaster), không chứa Dreamteck runtime core. Đối chiếu theo ví dụ, không suy ra API đầy đủ.
- **SplineArchitect.zip**: có Spline/Segment, SplineConnector, SnapSettings, NoiseLayer/NoiseGroup, Population, Deformation và Editor Handles.
- **ToolBuddy.zip**: có Curvy Splines, Curvy Generator/CG Modules, controllers, JSON/SVG converters, ConformPath và các module processing.
- Chỉ đối chiếu hành vi. Không sao chép code/asset thương mại của Unity.

## Inventory code Cocos hiện tại (0.9.12)

Đã có: `SplineContainer/Knot`, `SplineAnimate`, `SplineJunction`, `SplineTrigger`, `SplinePositioner`, `SplineProjector`, `SplineRoad`, `SplineExtrude`, `SplineMeshDeform`, `Spline2DPath`, `SplineJunctionMesh`, `SplineInstantiate`, `SplineObjectController`, `SplineObjectBender`, `SplineMorph`, `SplineModifiers`. Chức năng hiện diện không đồng nghĩa parity hoàn toàn.

| Reference feature | Gap / next step | Phase |
| --- | --- | --- |
| SplineArchitect Editor handles, rotate, multi-knot selection | Chưa có workflow tương đương hoàn chỉnh | 1–2 |
| SplineArchitect SnapSettings / align / snapping | Thiếu tool tích hợp editor | 2 |
| SplineArchitect Noise/Population | Chưa có cùng mô hình noise + distribution | 3–4 |
| SplineArchitect connectors / Curvy connections | Có Junction cơ bản; thiếu network graph operations | 3/5 |
| Curvy JSON/SVG converters | Có JSON import; thiếu SVG và round-trip | 3 |
| Curvy ConformPath, BuildVolumeCaps/Spots | Một phần qua geometry hiện có | 4 |
| Curvy Generator / CG module graph | Chưa có typed module graph + dirty propagation | 4 |
| Curvy advanced controllers | Animate/Positioner mới hỗ trợ một phần | 5 |
| Dreamteck example trains, switching, projection, length events | Kiểm chứng theo workflow ví dụ | 5 |

## Triển khai theo thứ tự phụ thuộc

### Phase 1 — Cleanup & Gizmos architecture

- [x] Slice 1.1: xóa alias `rebuild()` ở hai prefab spawners, cập nhật tests và migration.
- [x] Slice 1.2a: migrate Container/Knot drawers, tangent/rotation gizmo ports (chưa smoke test Editor).
- [ ] Slice 1.2b: tách Gizmos Drawer khỏi Component theo SOLID, dùng `@registerGizmos(Drawer)` Cocos-Gizmos v3. Kiểm tra resolve Asset DB và build Editor/Preview trước khi hard import.
- [ ] Slice 1.3: bỏ direct Gizmos callbacks từng nhóm sau khi chuyển xong; kiểm chứng selection và Undo/Redo.
- **Exit:** `npm test`, `npm run check:runtime`, smoke test Cocos Creator 3.8.8. Không giữ hai cơ chế Gizmos cùng chạy.

### Phase 2 — Spline Editor

- [x] Phase 2.1: Knot mark/select, local grid snap, axis align và batch snapshot (chưa smoke test Editor).
- [x] Phase 2.2a: World snap/align 3D + Local/World group Move bằng delta, kiểm tra affine worldMatrix, giữ 2D constraints.
- [ ] Phase 2.2b: interactive multi-knot drag, native Undo/Redo cho tangent/rotation, snap to surface.

Multi-select, Move/Rotate knots, kéo tangent trực tiếp, insert/split/join, snap grid/surface, align và Undo transaction. **Exit:** curve continuity, knot rotation, 2D/3D drag, undo.

### Phase 3 — Core & interoperability

Deterministic sampling/cache, nearest point, spline data, noise layers, connector graph, JSON/SVG round-trip. **Exit:** numerical and serialization regression tests.

- [x] Phase 3.1 — Network graph + direction-aware shortest routes across existing Junction links, seam support, optional world-gap validation, route preview API and SplineAnimate ShortestRoute (new enum 4; modes 0–3 unchanged).
- [x] Phase 3.2a — Editor Check Connectors (world gap + tangent axis-angle), safe position-only snap of an open spline endpoint to a link, Scene lease/revision preflight, serialized transaction + rollback and regression tests.
- [x] Phase 3.2b1 — G1/C1 endpoint tangent alignment for Broken target knots, including handle-node overrides, Knot rotation, nonuniform scale, Reversed spline side mapping, Scene guard and single-snapshot rollback.
- [x] Phase 3.3 — ShortestRoute On Arrived + opt-in auto-stop at exact normalized arc progress (including same-frame junction switch, reverse, boundary and editor/runtime event subscriptions), with rearm and regression tests.
- [x] Phase 3.4 — Shared bounded graph/route LRU with automatic invalidation on spline getRevision/worldMatrix/active Junction/links, negative-result caching, explicit clear/stats APIs and mock regression coverage.
- [x] Phase 3.5 — Opt-in World-distance shortest routes (sampled cumulative world arc, scale/rotation-aware, bounded 4096 samples/spline), Route Cost Space Inspector, independent world/local cache snapshots and regression tests.
- [x] Phase 3.6a — Route diagnostics (reachable/unreachable/invalid), opt-in per-Junction-exit Max Followers admission, waiting at marker + retry, occupied slot release on lifecycle/teleport, runtime & pure regression tests.
- [x] Phase 3.6b1 — FIFO per-exit admission queues, queue visibility + diagnostics, opt-in congestion-aware alternate path planning, independent route memo keys and runtime regression tests.
- [x] Phase 3.6b2a — Opt-in centerline world-arc headway and soft braking on shared spline, closed seam/reverse/nonuniform-scale support, blocked/cleared events, lifecycle cleanup and regression tests.
- [x] Phase 3.6b2b1 — Manual per-exit Green/Red signal (including unlimited exits), opted-in 0..10 priority admission with FIFO within tier, signal-aware reroute, diagnostics and runtime regression.
- [x] Phase 3.6b2b2a — Opt-in SplineTrafficController with deterministic Green/Yellow/All-Red phase scheduling, explicit conflict-pair validation, manual-state restoration, single-controller lease, runtime lifecycle and mock regression tests.
- [x] Phase 3.6b2b2b1 — Adaptive queue-demand SplineTrafficController with minimum/maximum Green, time-aged demand priority, explicit fixed-mode fallback, bounded dt, Yellow/All-Red safety and regression tests.
- [x] Phase 3.6b2b2b2a — Read-only bounded sampled 3D exit proximity diagnostics (candidate/missing/same-Green/uncertain, Editor Inspector action) and opt-in logical headway Lane ID (0–31) with regression tests.
- [x] Phase 3.6b2b2b2b1 — Opt-in physical lane centers using spline-frame offset and World sweep-sphere proximity against other opt-in followers (including cross-spline), offset-speed integration and mock regression.
- [x] Phase 3.6b2b2b2b2a — Sparse 3D spatial-hash broadphase for opt-in proximity, cached sampled sweep, safe oversized-query fallback, configurable sweep precision and read-only cross-system traffic telemetry with regression tests.
- [x] Phase 3.6b2b2b2b2b1 — Opt-in Cocos 3D Collider.worldBounds-derived conservative bounding-sphere proximity and explicit per-exit World asphalt half-width 3D conflict diagnostics (with vertical clearance), Inspector and mock regression.
- [x] Phase 3.6b2b2b2b2b2a — World-AABB obstacle narrowphase for swept follower spheres; read-only sampled nominal SplineRoad asphalt widths (taper/range/modifiers), auto-by-connection index Inspector and mock regression.
- [x] Phase 3.6b2b2b2b2b2b1 — Explicit stationary World OBB narrowphase for swept spheres, orthonormal basis validation, conservative registry broadphase radius, immutable snapshots and regression coverage. API-only; native Collider auto-adapter remains pending.
- [x] Phase 3.6b2b2b2b2b2b2a — Opt-in 3D BoxCollider World OBB preview adapter in SplineAnimate + Inspector, local center/size and orthogonal nonuniform world scale, bounds consistency check, fallback AABB, mock regression.
- [x] Phase 3.6b2b2b2b2b2b2b1 — Explicit stationary World Capsule narrowphase (swept sphere against cylinder and rounded caps), conservative registry broadphase, copy isolation, regression tests. Fixed BoxCollider Inspector test contract.
- [x] Phase 3.6b2b2b2b2b2b2b2a — Opt-in CapsuleCollider adapter, X/Y/Z and uniform world scale, bounds consistency check, AABB fallback, runtime and Inspector mock coverage. Native backend validation pending.
- [x] Phase 3.6b2b2b2b2b2b2b2b1 — Explicit WORLD mesh triangle swept sphere narrowphase with double-sided face/edge/corner contact, bounded immutable BVH, opt-in SplineProximityRegistry.setMesh and triangle test telemetry. Mock regression coverage; not yet a native MeshCollider adapter.
- [x] Phase 3.6b2b2b2b2b2b2b2b2a — Opt-in 3D MeshCollider → World triangle BVH adapter, supported triangle-list submeshes and half-float position reader, center + affine transform, worldBounds sanity check, convex/readability fallback, cached BVH on unchanged mesh hash/pose and tests.
- [x] Phase 3.6b2b2b2b2b2b2b2b2b1 — Opt-in bounded constant-WORLD-velocity prediction for registered follower shapes; relative-space segment sweeps, motion-expanded broadphase, pause/seek/disable lifecycle, telemetry and offline regression tests.
- [x] Phase 3.6b2b2b2b2b2b2b2b2b2a — Headless profiling harness + deterministic broadphase/BVH complexity gates, opt-in in-runtime limit() sampler (p50/p95, counters), CI JSON artifacts and manual Creator 3.8.8 acceptance checklist. **Native validation NOT executed.**
- [x] Phase 3.6b2b2b2b2b2b2b2b2b2b — Opt-in bounded constant-acceleration relative sweeps with per-segment quadratic chord error, acceleration-expanded broadphase and conservative rotation-envelope collision for non-spherical shapes, Inspector + offline tests. Native 3.8.8 validation pending.
- [ ] Phase 3.6b2b2b2b2b2b2b2b2b2c — Exact rotating geometry narrowphase, native Creator 3.8.8 physics validation/profiling, physical collision resolution and server-authoritative multiplayer traffic.
- [x] Phase 3.2b2a — Explicit Junction target endpoint AutoSmooth/Linear/Mirrored/Continuous → Broken conversion preserving currently evaluated tangents, including Knot-space vectors and handle nodes, read-only Scene planner + fingerprint/transaction, best-effort rollback, single snapshot and regression tests. Native Creator 3.8.8 undo/prefab acceptance pending.
- [ ] Phase 3.2b2b — Non-destructive connector merge graph / geometric Join workflow with independent source-spline preservation and native Editor acceptance.
- [x] Phase 6.1 — Extension menu **Install Examples**: optional project-local examples in assets/CocosSplinesExamples, six runtime gallery modes, reusable Train/Road/Extrude/Junction sample scripts; idempotent, no overwrite, asset-db refresh and security/regression tests. **Native Creator 3.8.8 compile/scene smoke test pending.**
- [x] Phase 6.2 — **Create Example Gallery in Scene** menu: native Editor Scene messages for a compiled Gallery component, duplicate-safe read-only Scene lookup, Scene lease guard, single snapshot, guarded cleanup, project-local quick-start guide and offline Editor regression tests. Saving an actual .scene remains a manual Creator operation; native 3.8.8 smoke test pending.
- [x] Phase 6.3 — Example Gallery 10-feature catalog: four additional runtime demos (Projection, Trigger callbacks, Modifier speed/width, source-to-output Morph), TypeScript static catalog coverage, installation/update safety guide. Native Creator 3.8.8 visual test pending.
- [x] Phase 6.4 — Installable Example Gallery expanded to 13 feature modes (Mesh Deform with procedural input, two-phase Junction Traffic signals, runtime Prefab Spawning), three project-owned imported-asset setup scripts, additive no-overwrite installation, offline TypeScript/catalog tests; native Creator 3.8.8 visual/physics/prefab acceptance pending.
- [ ] Native Creator Editor 3.8.8 Junction array, Prefab, save/reopen and runtime smoke test.

### Phase 4 — Procedural geometry

Road không biến dạng asset nguồn, stable frames, extrusion, caps, terrain conform, mesh/profile/volume, module graph typed IO với cache và dirty propagation. **Exit:** UV, winding, normals, material/source immutability tests.

### Phase 5 — Runtime networks & controllers

Follower speeds, junction routing, trains/wagons, projection, triggers và connection constraints. **Exit:** deterministic routing/event tests.

### Phase 6 — Quality & release

Editor 3.8.8 smoke checks, example scenes, docs, performance, breaking-change migration review. Chỉ release khi manual Editor validation hoàn tất.

## Chính sách legacy

Chỉ xóa khi đã xác định call sites, API thay thế, tests và migration. Không tự ý đổi enum/default đã serialize (`cornerMode=Legacy`, `repeatLayout=Count`, `SplineMorph.space=World`...) khi chưa có data migration. Các hàm `rebuild()` tạo geometry vẫn canonical, không phải legacy alias.

### Phase 1.3 — Đã chuyển mesh/modifier drawers

- [x] Road, Extrude, MeshDeform, JunctionMesh, ObjectBender cùng dùng SplineMeshDrawers.
- [x] SplineModifiers vẽ hoàn toàn trong Editor/SplineModifierGizmos.
- [x] Core/SplineMeshGizmos chỉ xây dựng dữ liệu wireframe, không truy cập globalThis.
- [ ] Manual Cocos Creator Scene validation: draw depth, selected components, nested model transforms và Undo/Redo.

### Phase 2.2b — Interactive group Move (preview)

- [x] Thêm Move handle World trên Knot đầu tiên trong nhóm được chọn (Cocos-Gizmos v3; không dùng legacy direct callbacks).
- [x] Dịch nhóm theo cùng delta World, giữ Knot ngoài selection đứng yên, Cancel rollback, no-op không snapshot.
- [x] Node mock tests cho multi-select, bất biến vị trí, nhóm thuộc spline khác và 2D constraints.
- [ ] Native Undo/Redo, prefab overrides và Scene mouse picking cần smoke test Cocos Creator 3.8.8.
- [ ] Surface snap/align, drag nhóm trong XY2D/XZ2D và materialization/migration tangent-handle nodes.

### Phase 2.3 — CPU Surface Snapping (preview)

- [x] Raycast MeshRenderer đích được chọn, World-Y, CPU triangles, hỗ trợ mesh transform và toàn batch rollback/snapshot.
- [x] UI chọn surface target, refresh, cast height/drop; không phụ thuộc Collider hoặc copy Unity code.
- [ ] Surface snapping lên Physics Terrain/Collider tùy chọn, surface normal orientation, 2D projected snap và Cocos Editor 3.8.8 smoke tests.

### Phase 2.4 — Surface Normal Alignment (preview)

- [x] Triangulated World normal với winding correction; từ chối tam giác quá dốc khi Align bật.
- [x] Opt-in checkbox (mặc định tắt); Knot +Y theo normal, giữ hướng heading +Z nhiều nhất có thể.
- [x] Đồng bộ position / local rotation trong một batch, snapshot + rollback, không thay rotation ở chế độ cũ.
- [x] Unit + integration tests cho orientation với parent rotation, rotation-only, cancel khi lỗi.
- [ ] Cocos Editor 3.8.8 smoke tests, bảo toàn hình dạng spline khi dùng Knot-space tangent (hiện cần kiểm tra thủ công).

### Phase 2.5 — Crease-aware Smooth Surface Normals

- [x] Barycentric smoothing normals tại các đỉnh **chung chỉ số** theo trọng số diện tích, có crease threshold 0–89 độ.
- [x] Mặc định tắt; tránh thay đổi path Surface Snap cũ, không tác động vị trí hit.
- [x] Unit tests cho ranh giới tam giác, crease=0, hard seam, mesh nonuniform scale, opt-in và Scene contract.
- [ ] Làm mượt qua UV split (cần mesh topology welding option riêng); native Cocos Creator 3.8.8 acceptance vẫn chờ test.

### Phase 2.6 — Collider & Terrain support (preview)

- [x] Physics 3D Collider target selection, strict raycast hit isolation, TerrainCollider/primitive Collider support where physics is active.
- [x] No hit => no edit; optional hitNormal orientation, mesh-only smoothing, Node regression/Scene contract tests.
- [ ] Verify 3D Physics Scene behavior and TerrainCollider in Cocos Creator 3.8.8; native Undo/Redo and prefab overrides.

### Phase 2.7 — Transaction Read-back / Undo safety

- [x] Editor-only atomic batch transaction, stale-data guard và Scene transform readback trước/sau khi ghi.
- [x] Snapshot false/throw rollback, reverse property rollback, single snapshot after verify, tests cho partial write/rotation failures.
- [ ] Native Cocos 3.8.8 Undo/Redo thực tế, Prefab overrides và các interactive Gizmos transactions cần live Editor integration.

### Phase 2.8 — Unified Gizmo Transactions (preview)

- [x] Tách lifecycle snapshot/cancel/rollback của Group Move, Tangent và Rotate sang Editor-only SplineGizmoEditTransaction.
- [x] No-op/duplicate End không yêu cầu snapshot; xử lý lỗi IPC đồng bộ và bất đồng bộ, bảo vệ gesture mới và Scene changes.
- [x] Tests với interactive Gizmos mocks cho Cancel, failed snapshot và tự kiểm tra lifecycle.
- [ ] Cocos Creator 3.8.8 native Undo stack, prefab override và tích hợp onControlBegin/End cần kiểm chứng thực tế.
- [ ] Mở rộng backend nếu cần sang native scene undo transaction API chính thức sau khi có kết quả smoke test.

### Phase 2.9 — Gizmo Scene Invalidation (preview)

- [x] Guard selection, group membership, reparent, deleted/disabled Knot and disabled spline at begin/update/end, redraw and pending rollback.
- [x] Restore only surviving group knots still under original parent; avoid stale async rollback and snapshots on invalidated edits.
- [x] Node mock regression tests for selection change, reparent/delete and disabled component.
- [ ] Real Cocos 3.8.8 teardown callbacks, Undo history grouping and prefab overrides require on-device Editor tests.

### Phase 2.10 — Interactive 2D Group Move

- [x] Multi-selected Knot Group Move 2D: XY handles X/Y/XY, XZ handles X/Z/XZ, không tạo Node proxy.
- [x] Local planar delta từ World drag point, giữ nguyên hidden axis, parent rotation/nonuniform scale, Cancel và transaction snapshots.
- [x] Node/planar math tests for XY2D/XZ2D, tilted parent, no-op, snapshot failure and dimension change.
- [ ] Native Cocos Creator 3.8.8 mouse picking/Undo/Redo, prefab overrides, tilted-container local-axis visual fidelity.

### Phase 2.11 — True local-plane Group Move visualization

- [x] Bổ sung `frameNode` vào Cocos-Gizmos v3 (renderer, picking, Move solver cùng local basis).
- [x] XY2D/XZ2D Group Move sử dụng Container-local port + frame, giữ hidden axis và immutable group baseline.
- [x] Có capability check để ẩn handle 2D khi dependency chưa nâng cấp; không thêm legacy code.
- [x] Unit tests frame axes, nonuniform scale/rotation, cancellation/no-op và rollback.
- [ ] Native 3.8.8 Editor mouse picking, one-gesture Undo, Prefab overrides, multi-scene teardown vẫn cần smoke test.

### Phase 2.12 — Single-owner Group History + Prefab-aware Scene path

- [x] Extensible `history:'external'` in Cocos-Gizmos v3: no duplicate native SelectGizmo Undo hooks for computed group ports.
- [x] Real Node.position writes through Editor scene set-property (record:false) and one snapshot per completed changed Group Move.
- [x] Typed, prevalidated group commit, serialized reverse rollback, stale and reparent protection, Node integration regression tests.
- [ ] Real Editor 3.8.8 Undo/Redo one-gesture acceptance, Prefab Instance/nested overrides, apply/revert and on-disk save/reopen validation.
- [ ] Upgrade single-Knot Tangent/Rotate to serialized transaction after Group acceptance.

### Phase 2.13 — Individual Knot Tangent / Rotate serialized history

- [x] Tangent Move external-history path writes component mode and tangentIn/out through scene set-property, plus changed handle Node position.
- [x] Knot Rotate writes Node.rotation local quaternion rather than editor-only World Euler; q/-q equivalence.
- [x] Component index from query-node, one snapshot, no-op/Cancel skip, partial failure rollback and stale handle guards.
- [x] Regression tests for serialized field paths, AutoSmooth→Broken, handle position, local quaternion and IPC failures.
- [ ] Native Creator 3.8.8 Undo one-gesture consistency and Prefab overrides, especially Nested Prefab/handle Nodes.

### Phase 2.14 — Cross-Knot serialized history coordination

- [x] Per-SplineContainer WeakMap history gate for Group/Tangent/Rotate, including different Knot drawer instances.
- [x] Hold through async set-property/snapshot/rollback, release on Cancel/no-op/error.
- [x] Suppress stale handle selection during pending Scene commits; unrelated splines remain independent.
- [x] Invalidate original spline arc LUT on transaction completion; existing road/extrude/deform revision observers can respond after Editor restores state.
- [x] Regression tests for pending snapshot races and rollback-before-release.
- [ ] Native Editor undo-stack grouping, Prefab Instance overrides, Editor update cadence and actual multi-scene lifecycle still need Creator 3.8.8 smoke testing.

### Phase 2.15 — Scene Lease / stale IPC fail-closed

- [x] Capture original SplineContainer→Scene ancestry at Gizmo begin, validate during drag/end and async commit.
- [x] Stop follow-up query/set-property/snapshot/rollback after Scene unload, ancestor reparent or same-UUID nested Prefab root replacement.
- [x] Preserve normal single-snapshot flow while Scene lease remains valid; tests cover delayed IPC and active Group Move invalidation.
- [ ] Actual Creator native Scene-switch cancellation, Undo/Redo history and Nested Prefab override/apply/revert still require live validation.

### Phase 2.16 — Axis Distribution

- [x] Distribute marked Knot coordinates evenly on an active axis, preserving extremes and hierarchy.
- [x] Local/World 3D and Local 2D constraints; shared batch transaction and regression tests.
- [ ] Creator native Undo/Redo and Prefab smoke test; arc-length redistribution is separate.

### Phase 2.17 — Local Arc Distribution

- [x] Distribute interior Knot positions along original local arc, contiguous open spline selection, reversed and 2D constraints.
- [x] Reuse evaluator and batch transaction; geometry revision guard and regression tests.
- [ ] Closed-loop redistribution, World arc metric, shape-preserving resampling and native Creator acceptance.

### Phase 2.18 — Closed / World Arc Distribution

- [x] Closed partial run across seam and full-loop distribution, Local/World metric with transformed chord lengths.
- [x] Runtime metric LUT, revision/order/matrix preflight and planar constraints.
- [ ] Shape-preserving resampling and native Creator acceptance.

### Phase 2.19 — Non-destructive Resample Spline

- [x] Resample with Knot count or target spacing and Local/World arc metric; open/closed and planar geometry supported.
- [x] Fit independent Bezier handles, sample-estimated maximum deviation threshold, bounded 128 new Knots and 65536 source LUT samples.
- [x] Editor creates a separate sibling spline with copied root transform and spline settings; source topology/Prefab untouched, best-effort failure cleanup and source revision checks.
- [x] Pure math and Editor-message integration tests.
- [ ] Certified continuous geometric error bound, native Undo/Redo for structural edits, orientation/child-component copying, destructive source replacement.
- [x] Phase 2.20: Simplify spline greedy (open/closed, local/world metric), giữ endpoint/closed anchor, new sibling copy; sampled tolerance (not certified continuous bound).
- [x] Phase 2.21: retained Simplify Knot names and local rotations via source-index mapping. New Broken tangents stay spline-local; source Prefab handles and arbitrary child components are not cloned.
- [x] Phase 2.22: safe Simplify Knot copying: preserve tension/tangent-space/edit flag, rebuild independent handle nodes and cc.Node references, convert fitted tangents into knot-local coordinates where required, and guard stale source metadata.
- [x] Phase 2.23: whitelist-only Container appearance cloning (Gizmos visibility/color/density), source metadata in topology fingerprint, and per-copy counts of omitted extra components/children. No generic component cloning or source references.
- [ ] Native 3.8.8 acceptance: verify recreated handle refs persist through save/reopen, Prefab overrides and Undo/Redo. Extra components and unrelated child nodes are not copied.
- [ ] Phase 2.20 acceptance: Cocos Creator 3.8.8 Undo/Redo, Prefab overrides, Scene save/reopen; performance on 128 Knot closed splines.
