# Cocos Splines V2 — Phase 3.8c2b2b1: Automatic Static Prefab Footprint

## Tính năng mới

`SplineObjectController` có **Auto Prefab Footprint** trong **Collider obstacle avoidance → Use Precise Obstacle Shapes**. Khi bật, mỗi variant được chọn có **bán kính cầu bảo thủ** riêng dựa trên dữ liệu static prefab root và Node con. Bán kính được nhân với transform scale thực tế khi spawn (scaleMultiplier + randomScale seed + Modifiers) và độ giãn lớn nhất của World matrix node cha.

Không cần nhập tay `Placement Footprint Radius` khi Auto bật. Hệ thống vẫn dùng bộ lọc OBB/Capsule/Mesh BVH/AABB đã triển khai trước đó; chỉ thay bán kính `sphere footprint` theo từng prefab variant và candidate. **Mặc định tắt** để không thay đổi Scene hiện có.

## Cấu hình

1. Gán `Spline`, `Prefabs` và `Obstacle Colliders` như trước.
2. Bật `Avoid Obstacle Colliders` và `Use Precise Obstacle Shapes`.
3. Bật `Auto Prefab Footprint`. Inspector ẩn trường radius thủ công khi auto đang hoạt động.
4. Mỗi prefab phải có `Prefab.data` khả dụng và ít nhất một **MeshRenderer với Mesh.minPosition/maxPosition** hoặc **BoxCollider / SphereCollider / CapsuleCollider / MeshCollider có Mesh bounds** được hỗ trợ trên prefab root hoặc các Node con.
5. Nhấn **Respawn**. Nếu bật weighted prefab selection, variant có weight 0 sẽ không được chọn và không cần có dữ liệu footprint khả dụng.

## Quy tắc bảo thủ

- Mesh: bán kính cầu bao quanh toàn bộ local AABB so với **gốc Node** (`max(abs(min),abs(max))` từng trục).
- BoxCollider: `length(center) + length(size/2)`.
- SphereCollider: `length(center) + radius`.
- CapsuleCollider: `length(center) + radius + cylinderHeight/2` (bao rộng hai cách biểu diễn chiều cao).
- MeshCollider: chỉ dùng **local Mesh AABB** và `center`, không cần đọc CPU triangles; không phụ thuộc `Use Mesh Collider BVH`.
- Với Node con, bán kính được bao rộng bởi **độ dài local position + bán kính shape dưới local scale**. Lặp đến root, tính cả root scale nhưng **bỏ root translation/rotation** vì ObjectController ghi World position/rotation khi spawn.
- Áp dụng `scaleMultiplier × (1 + randomScaleJitter)` và từng thành phần Modifiers.scale giống workflow spawn hiện tại. World matrix của parent/generated root được tính upper bound của phép stretch affine, bao gồm nonuniform scale + shear.
- Tính bán kính **theo index và prefab variant seed**, nên lọc bớt candidate không đổi RNG variant hoặc jitter ở index còn lại.
- Giới hạn tự động: tối đa 1.024 Node/32 cấp, 100 World units/bán kính sau scale. Giá trị finite và hierarchy không có cycle là bắt buộc.

## Fail-safe và phạm vi

- Khi bật Auto nhưng prefab cần chọn không có dữ liệu mesh/collider, geometry invalid, hierarchy quá lớn, thiếu World matrix hoặc bán kính vượt giới hạn, **Respawn sẽ báo lỗi trước clear()** và giữ nguyên các instance cũ.
- Không tự instantiate prefab chỉ để lấy bounds; chỉ đọc dữ liệu serialized. Không ghi/sửa Mesh, Collider, prefab source, Knot hay Road.
- Prefab chứa đồ họa ngoài static MeshRenderer (ví dụ **Skinned Mesh**, Particle, UI, procedural renderer, Graphics hoặc custom renderer) **chưa được bảo đảm** bởi thuật toán static bounds. Hãy dùng chế độ Manual với bán kính bạn tự xác minh thay vì Auto.
- Đây vẫn là **spherical envelope**, có thể loại thừa so với collider hình hộp thật. Không kiểm tra va chạm giữa các prefab đã spawn, không đo shape chính xác của renderer sau animation.
- Auto chỉ dùng khi `Avoid Obstacle Colliders` + `Use Precise Obstacle Shapes` bật; nếu không, đường cũ không đọc `Prefab.data`.
- Thay đổi nội dung Mesh/Prefab mà UUID không đổi **có thể không tự kích hoạt** `Rebuild On Change`; sau khi chỉnh asset hãy gọi **Respawn**. Chuyển Auto/Manual, trọng số prefab, scale multiplier vẫn làm thay đổi revision.

## Checklist Cocos Creator 3.8.8

- [ ] Thử prefab chỉ có BoxCollider, chỉ SphereCollider, chỉ MeshRenderer (Mesh imported), chỉ MeshCollider và prefab nhiều Node con.
- [ ] Bật Auto trên 2 prefab khác kích thước, dùng weights [1,0] rồi [0,1]; cùng center có thể được phép/cấm khác nhau nhưng giữ index/seed.
- [ ] Thử World scale của parent khác 1 và xoay parent nonuniform scale gây shear: bán kính không bị nhỏ hơn kích thước thực.
- [ ] Thử modifier.scale và randomScale; radius thay theo đúng candidate, không thay đổi kích thước prefab khi Auto tắt.
- [ ] Prefab missing `data`, Mesh null, bounds NaN, empty geometry hoặc 1.025 Nodes: phải báo lỗi **trước khi xóa** population.
- [ ] Save/Reopen Scene, Undo/Redo, prefab overrides, Play/Preview, Inspector conditional fields, Cocos-Gizmos v3.
- [ ] Kiểm tra Mesh access API thật ở Creator 3.8.8 và cảnh có mesh nhập khẩu; nếu Mesh.minPosition/maxPosition không đọc được, dùng radius Manual hoặc collider có kích thước xác định.

## Tiếp theo

**Phase 3.8c2b2b2:** Shared occupancy giữa nhiều SplineObjectController với explicit peers, transaction/ownership rules và per-candidate radius; thêm Gizmos preview cho rejected placements. **Phase 4:** Procedural Geometry Graph.

**Chỉ branch `v2`, không tag hoặc release trước khi yêu cầu chốt.**
