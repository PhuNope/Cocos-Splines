# Cocos Splines V2 — Phase 3.8c2b1: Precise OBB/Capsule Population Clearance

## Phạm vi

Bổ sung phép kiểm tra hình học hẹp hơn AABB khi rải prefab theo spline. `SplineObjectController` dùng cùng adapter **BoxCollider → World OBB** và **CapsuleCollider → World capsule** đã được triển khai cho `SplineAnimate`. Nếu collider không hợp lệ, transform không được adapter hỗ trợ hoặc World bounds không khớp, hệ thống **fallback về World AABB** thay vì bỏ qua vật cản.

Chế độ này chỉ tác động đến bước lọc candidate dự kiến, không chỉnh Knot, spline nguồn, prefab asset hoặc Collider.

## Cấu hình trong Inspector

1. Gắn `SplineObjectController` trên node có Spline và Prefabs.
2. Bật **Avoid Obstacle Colliders**, kéo các 3D Collider vào `Obstacle Colliders` (tối đa 64), điền `Obstacle Clearance` (mặc định 0).
3. Bật **Use Precise Obstacle Shapes**. Mặc định **tắt** để các scene cũ dùng AABB như trước.
4. Tùy chọn **Placement Footprint Radius** (World units, 0–100) là bán kính hình cầu bảo thủ do người dùng nhập cho prefab, khác với `Obstacle Clearance` (khoảng hở). Tổng hai đại lượng là radius trong truy vấn OBB/AABB, và được cộng với radius thực của CapsuleCollider khi kiểm tra capsule.
5. Nhấn **Respawn**. Các vị trí bị loại không làm đổi index/seed/prefab variant của candidate còn lại.

**Không tự tính kích thước prefab từ MeshRenderer/Collider prefab** trong phase này. Footprint chỉ là giả định sphere do người dùng cung cấp (hữu dụng cho cây, đá, biển báo).

## Thuật toán

- Tính World center của từng ứng viên sau spline + Modifier + Noise + Jitter. Nếu bật Surface Conform, dùng **tâm World đã project**.
- Nếu BoxCollider có matrix trực chuẩn, kích thước hợp lệ, không shear/reflection và World AABB đối chiếu thành công: tính khoảng cách Euclidean chính xác từ tâm candidate đến khối **OBB**, so với bán kính footprint + clearance.
- Nếu CapsuleCollider có uniform scale, vector hướng hợp lệ, World bounds trùng adapter: tính khoảng cách chính xác từ tâm đến đoạn trục capsule và so với `capsule.radius + footprint + clearance`. Bao gồm thân trụ và hai đầu bo.
- Nếu không hỗ trợ (MeshCollider, TerrainCollider, BoxCollider shear/mismatch, CapsuleCollider scale không đều...) dùng **Collider.worldBounds AABB** và khoảng cách hình cầu-tới-AABB. Phép toán có thể loại thừa nhưng không cố tính hình học thiếu tin cậy.
- Những candidate bị chặn không chiếm ô trong bộ lọc **Min World Spacing**. Tất cả tính toán và xác thực diễn ra **trước clear()**, nên invalid radius, Collider hoặc World position không xóa population cũ.
- Dùng cấu hình mới khi `usePreciseObstacleShapes=true` **và** `avoidObstacleColliders=true`. Khi tắt, cách lọc cũ giữ nguyên.
- Rebuild On Change theo dõi các thuộc tính Box/Capsule, matrix/world bounds, Footprint Radius và trạng thái lựa chọn. Thay đổi thuộc tính đã tắt không gây respawn không cần thiết.

## Giới hạn

- Đây là kiểm tra **center + sphere footprint** với Collider 3D tĩnh tại thời điểm Respawn, không phải collision của prefab mesh/collider thật. Không tính dynamic physics sweep, contact solver hoặc multi-controller occupancy.
- MeshCollider và TerrainCollider vẫn được hỗ trợ qua **AABB bảo thủ**, chưa hỗ trợ chính xác tam giác BVH.
- Việc xác thực transform/bounds tùy backend Physics. Mặc dù code có offline tests, vẫn phải kiểm thử với Cocos Creator 3.8.8 và plugin Gizmos trong Editor thật.
- Giới hạn 2048 candidate, 64 Collider, radius footprint 0–100 World units và clearance 0–10000.
- Các Collider inactive/disabled được bỏ qua. Null refs hoặc bounds không hợp lệ bị từ chối và không xóa các instance đã có.

## Checklist Cocos Creator 3.8.8

- [ ] Tạo BoxCollider dài/hẹp xoay 45°, so sánh AABB-only và Precise: vài candidate nằm trong góc AABB nhưng ngoài OBB phải được giữ lại.
- [ ] Tạo CapsuleCollider, thử 3 trục và uniform scale; test sát nắp capsule và chỉnh Footprint Radius từ 0 lên 1.
- [ ] Tạo BoxCollider có nonuniform scale trực chuẩn: OBB chính xác nếu adapters xác nhận World bounds. Thử shear/negative scale: fallback AABB.
- [ ] Tạo MeshCollider/TerrainCollider và xác minh fallback AABB, không báo thành công giả cho mesh chính xác.
- [ ] Kết hợp Surface Conform + Noise + Min World Spacing, kiểm tra vị trí sau projection được dùng cho obstacle test.
- [ ] Test giá trị footprint -1 hoặc 101 và lỗi active Collider bounds: Respawn phải báo lỗi trước khi xóa population cũ.
- [ ] So sánh scene đã lưu khi tắt và bật Precise rồi tắt lại; khi tắt phải trở về kết quả cũ.
- [ ] Save/reopen, Undo/Redo, prefab overrides và performance với 2.048 candidate × 64 obstacles.

## Roadmap còn thiếu

Phần tiếp theo: **MeshCollider triangle BVH** (chỉ khi mesh readable và transform được hỗ trợ), tùy chọn lấy bounds prefab thực, multi-controller occupancy và profiling/batching để giảm số lần lọc.

**Preview chỉ trên branch `v2`. Không tạo tag hoặc GitHub Release khi chưa được yêu cầu chốt.**
