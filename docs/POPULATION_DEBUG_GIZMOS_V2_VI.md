# Phase 3.8d — Placement Debug Gizmos (Cocos Splines V2 preview)

## Mục tiêu

Hiển thị **trong Scene view, khi chọn `SplineObjectController`** các vị trí ứng viên prefab được chấp nhận hoặc bị loại và **lý do từ chối đầu tiên** theo đúng pipeline của `Respawn`. Tính năng là **chỉ xem, không sinh hoặc xóa Node**, không chỉnh Knot/Road/Mesh/Prefab và mặc định **tắt**. Cần plugin **Cocos-Gizmos v3** đang hoạt động.

## Bật Preview

1. Chọn Node có component **Splines.SplineObjectController**.
2. Trong Inspector mở nhóm **Placement Debug Gizmos · selected only**.
3. Bật **Show Placement Gizmos**.
4. Chỉnh **Placement Gizmo Limit** (8–256, mặc định 96). Tất cả candidate (tối đa 2048) vẫn được lập kế hoạch/lọc trước; chỉ *số điểm vẽ* được lấy mẫu. Không phải giảm độ chính xác của Density/Collision.
5. Chỉnh **Placement Gizmo Size** (bán kính marker chỉ hiển thị) và **Show Placement Footprints** để vẽ thêm sphere thể hiện bán kính footprint đã cấu hình/tự động suy ra (nếu có).
6. Thay đổi Density/Exclusion, Noise, Collider, Peer hoặc World Spacing và quan sát màu các marker. **Không cần nhấn Respawn** để nhìn kết quả preview sau khi thay đổi cấu hình được theo dõi.

## Màu và ý nghĩa

| Màu | Trạng thái |
|---|---|
| **Xanh lá** | Accepted — prefab được giữ lại |
| **Cam** | Surface — raycast xuống Terrain/Surface không tìm thấy hit hợp lệ khi Skip Missing bật |
| **Đỏ** | Collider — bị chặn bởi AABB/OBB/Capsule/Mesh BVH |
| **Tím** | Peer — trùng vùng Shared Occupancy của controller priority thấp hơn |
| **Xám** | Exclusion — nằm trong vùng cấm spawn theo progress |
| **Vàng** | Density — bị bỏ do mật độ/seed |
| **Xanh dương** | Spacing — không đạt Min World Spacing |

Thứ tự attribution: Surface → Collider → Peer → Exclusion → Density → Spacing. Mỗi ứng viên có **một lý do đầu tiên** trong pipeline, giữ nguyên `index` gốc/seed. Marker của ứng viên trượt tại Surface dùng vị trí trước projection, các trường hợp sau dùng vị trí đã project.

**Chú ý:** Màu xanh dương dùng để chỉ từ chối theo World Spacing, không phải các gizmo tangent/rotation. Những ứng viên không xuất hiện vì không có spline, không có prefab hoặc progress range rỗng sẽ không được vẽ.

## Kiến trúc

- `SplineObjectController.preparePlacement(trace)` là **một pipeline tiền xử lý chung** cho `Respawn` và `previewPlacement()`. Chỉ `respawn` mới `clear()`/instantiate sau khi preflight hoàn thành.
- `SplinePopulationMath.planPopulation` có callback *tùy chọn* để báo Exclusion/Density/Spacing, không đổi tập index trả về.
- `SplinePlacementDiagnostics.attributePlacementDiagnostics` so sánh từng tập ứng viên của Surface/Collider/Peer/final stage, kiểm tra chain subset, phát hiện lý do thiếu, không mutate input.
- `SplinePlacementGizmos` trong thư mục **Editor** được đăng ký bằng `@registerGizmos(SplinePlacementGizmos)`; logic vẽ tách khỏi component. Dùng Gizmos3D `beginColor/drawSphere` (fallback drawLine).
- Drawer cache kết quả preview theo revision của component và các setting quan trọng. Marker lấy mẫu giữ tối thiểu một marker mỗi nhóm lý do khi giới hạn cho phép, không vẽ quá 256 marker/lần.
- Nếu tính toán preview thất bại, gizmos **không xóa** population đã spawn, không chạy fallback sai; log warning một lần cho từng thông báo lỗi. Lỗi hiển thị lại khi chọn component và cấu hình vẫn chưa hợp lệ.

## Giới hạn hiện tại

- Preview chỉ vẽ **World centers** và sphere footprint; không render mesh prefab thật, không hiển thị numeric text index/hint cạnh marker. `Placement Gizmo Limit` nhỏ hơn candidate count sẽ làm ẩn bớt marker.
- Cache có thể cần thao tác thay đổi setting/Reselect để làm mới khi Physics Mesh bị biến dạng **nhưng** Collider bounds/mesh hash và transforms không thay đổi (giống giới hạn Rebuild On Change).
- Với 2048 candidate, 64 obstacle + raycast Physics, lập kế hoạch toàn bộ khi bật preview vẫn có chi phí. Không nên bật liên tục trên scene lớn lúc không cần chẩn đoán.
- Footprint được vẽ theo giá trị Manual/Auto/Shared đã biết, chưa phải hình học chính xác của prefab hoặc animation. Đây không phải collider collision solver.
- Undo/Redo, prefab edits và native Gizmos v3 phải test trong **Cocos Creator 3.8.8**, không chỉ dựa vào regression mock.

## Acceptance checklist

- [ ] Bật gizmos trên Object Controller chưa spawn, xác nhận Scene chỉ xuất hiện marker, Hierarchy không có Generated Root mới.
- [ ] Spawn/Respawn và đối chiếu marker Accepted với World center của các prefab được tạo.
- [ ] Bật Surface Conform + Skip Missing và làm raycast miss để thấy màu Cam.
- [ ] Kéo BoxCollider chắn candidate (Đỏ); bật Peer Population trùng tâm (Tím).
- [ ] Tạo Exclusion (Xám), giảm Density (Vàng), tăng Min World Spacing (Xanh dương).
- [ ] Tắt Show Placement Gizmos → marker biến mất. Chỉnh Marker Limit 8/128/256 và Footprints.
- [ ] Invalid density, Collider/Surface/Peer mất tham chiếu → warning, không xóa instance cũ, không crash Scene.
- [ ] Save/Reopen Scene, Undo/Redo, Prefab overrides, disabled Gizmos plugin và Play preview.
- [ ] Performance 2048 candidates + 64 colliders; drawer không tự thay đổi spline source mesh.

## Roadmap tiếp theo

Debug reason counters/legend trong Inspector, snapshot performance diagnostics, Gizmos tooltip index và tùy chọn baked Preview. Sau đó **Phase 4 — Procedural Geometry Graph**.

**Chỉ push lên nhánh `v2`. Không tạo tag/Release trước khi được yêu cầu chốt.**
