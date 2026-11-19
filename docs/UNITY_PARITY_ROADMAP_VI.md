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
