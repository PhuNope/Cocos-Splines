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
