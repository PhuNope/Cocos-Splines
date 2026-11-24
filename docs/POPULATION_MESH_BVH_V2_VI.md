# Cocos Splines V2 — Phase 3.8c2b2a: MeshCollider Triangle BVH Population

## Phạm vi

`SplineObjectController` có tùy chọn mới **Use Mesh Collider BVH** bên trong **Collider obstacle avoidance → Use Precise Obstacle Shapes**. Khi cả 3 tùy chọn `Avoid Obstacle Colliders`, `Use Precise Obstacle Shapes` và `Use Mesh Collider BVH` bật, bộ lọc sẽ dựng **BVH tam giác trong World space** từ một MeshCollider 3D *không convex và cho phép đọc dữ liệu Mesh CPU*, rồi so khoảng cách giữa **tâm prefab + bán kính footprint hình cầu** với tam giác gần nhất. Dùng lại `SplineMeshColliderAdapter` và `SplineProximityMesh` vốn đã phục vụ `SplineAnimate`.

Tính năng mặc định **tắt**; với MeshCollider không đủ điều kiện, hệ thống **fallback sang World AABB** (loại thừa nhưng không bỏ qua vật cản).

## Cấu hình

1. Chọn node có `SplineObjectController`, gán spline và các prefab.
2. Bật **Avoid Obstacle Colliders**, gán các MeshCollider vào `Obstacle Colliders`.
3. Bật **Use Precise Obstacle Shapes**, đặt `Obstacle Clearance` và `Placement Footprint Radius`.
4. Bật **Use Mesh Collider BVH**. Đảm bảo import Mesh có **Allow Data Access** và MeshCollider **Convex = false**.
5. Nhấn **Respawn**. Candidate bị loại vẫn giữ nguyên index và seed; tính toán shape chạy sau Surface Conform/Noise/Jitter và trước Density/Min World Spacing.

## Giới hạn hình học

- **Tam giác là bề mặt hai phía, không phải thể tích kín**. Một điểm nằm bên trong mesh kín nhưng cách xa tất cả tam giác có thể không bị loại nếu Footprint Radius = 0. Đừng dùng như phép kiểm tra *inside closed mesh* hoặc thay cho Physics overlap chính xác.
- Khoảng cách hình cầu–tam giác được kiểm tra gồm cả **face, edge, vertex**, đúng tại điểm tiếp xúc với radius = 0. BVH pruning giảm số tam giác cần kiểm tra.
- Chấp nhận tối đa **16 submesh**, **65.536 vertex**, **16.384 triangle**; tọa độ World trong ±10⁶, tính toán hữu hạn.
- Hỗ trợ các định dạng vị trí mà `SplineMeshRead` xác thực (ví dụ RGB32F/RGB16F); không tự suy đoán format. Mesh phải cho phép CPU readback.
- `MeshCollider.convex=true`, mesh null/unreadable, dữ liệu/primitive không tương thích, transform suy biến hoặc World bounds không khớp → **World AABB fallback**, không dùng BVH không đáng tin.
- Hỗ trợ transform affine không suy biến (có thể bao gồm scale không đều). Mesh BVH chỉ mô tả mesh tĩnh trong World, không tự xử lý chuyển động physics/skin/deformation sau khi dựng.
- BVH được cache theo **mesh object identity, hash, transform, collider center và World bounds**. Mesh thay đổi CPU geometry mà `mesh.hash` không thay đổi có thể dùng cache cũ; hãy cập nhật mesh hash, thay asset hoặc bật/tắt component/khởi tạo lại khi mesh biến dạng.
- `Placement Footprint Radius` do người thiết kế nhập, **chưa tự đọc kích thước prefab**. Collider là các mục tiêu được gán rõ ràng, không tự quét toàn Scene.
- Việc chuẩn bị shape, kiểm tra giới hạn và lọc toàn bộ candidate được làm **trước clear()**. Lỗi từ engine trong lúc `instantiate` sau clear không nằm trong transaction.
- Thay đổi mesh hash hoặc transform làm `Rebuild On Change` phát hiện khi chế độ BVH bật. Khi tắt, thay đổi mesh không gây rebuild vì tính năng này.

## Native Cocos Creator 3.8.8 acceptance

- [ ] MeshCollider không convex với mesh tam giác đơn có `Allow Data Access`; so với AABB-only, một điểm ở góc AABB nhưng ngoài triangle phải được giữ lại
- [ ] Thử radius = 0, 0.1, 0.5; kiểm tra va chạm tại face, edge và vertex, kiểm tra cả hai phía
- [ ] Thử MeshCollider Convex = true, mesh unreadable, mesh null, transform suy biến và mismatch worldBounds; tất cả fallback AABB
- [ ] Thử mesh nhiều submesh, RGB16F, scale không đều, xoay, và geometry rebuild khi transform/hash thay đổi
- [ ] Kết hợp Surface Conform + Noise + World Spacing; candidate trên surface sử dụng World position đã project
- [ ] Bật Rebuild On Change và thay mesh/transform sau khi spawn; không rò rỉ mesh cache khi đổi Collider hoặc reload Scene
- [ ] Kiểm tra Undo/Redo, prefab instance overrides, save/reopen Scene, Editor preview và Play trên Cocos Creator 3.8.8
- [ ] Profile 2.048 candidate × 64 Collider, giới hạn dự án thực tế nhỏ hơn khi nhiều mesh lớn

**Tiếp theo:** automatic prefab bounds, kiểm tra va chạm thể tích kín (nếu cần), multi-controller occupancy và hiệu năng. Chỉ branch `v2`, không tag/release trước khi chốt.
