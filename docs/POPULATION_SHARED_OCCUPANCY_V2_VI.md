# Cocos Splines V2 — Phase 3.8c2b2b2: Explicit Shared Occupancy

## Mục đích

Khi có nhiều `SplineObjectController` trong **cùng một Scene**, có thể cho controller phía sau **tránh các prefab đã được controller phía trước spawn**. Tính năng mới **Avoid Peer Population** là opt-in và không tự quét Scene, không thay đổi mesh, spline, prefab asset hay instance thuộc controller khác.

Điểm va chạm được so theo **World position + bounding sphere radius của từng controller**, không phải Physics overlap/collider thực. `Shared Occupancy Radius` là bán kính bảo thủ **được công bố** của mọi instance do controller đó tạo và vẫn tồn tại khi Save/Reopen. Controller đang spawn có thể dùng bán kính từ Auto Prefab Footprint nếu chế độ tính tự động này đang hoạt động với Obstacle Avoidance; ngoài ra dùng bán kính Shared Occupancy Radius. Luôn chọn bán kính lớn hơn trong hai loại khi cả hai có mặt.

## Cấu hình

1. Tạo hai hoặc nhiều SplineObjectController và gán Spline, Prefabs, Count/Distance.
2. Controller A có `Occupancy Priority = 0` và `Shared Occupancy Radius` thích hợp (ví dụ 1.2). **Spawn/Respawn A trước**, để có Node Generated.
3. Controller B có `Occupancy Priority = 1`, `Shared Occupancy Radius` của chính B (ví dụ 0.8), bật **Avoid Peer Population**, kéo **Node đang chứa SplineObjectController A** vào danh sách `Occupancy Peer Nodes`.
4. Có thể đặt `Peer Occupancy Clearance` (ví dụ 0.5) để nới khoảng hở ngoài tổng bán kính.
5. **Respawn B**. Candidate B chỉ được nhận nếu khoảng cách hai tâm **lớn hơn** `radius(B) + radius(A) + clearance(B)`. Chạm biên cũng tính là chồng lấn.
6. Với A, B, C: đặt priority tăng dần, ví dụ A=0, B=1, C=2. Để C tránh cả A và B, gán cả A/B vào Peer Nodes và Spawn theo thứ tự.

## Ownership / thứ tự

- **Có hướng và explicit**: B đọc A; A không đọc/khởi tạo/xóa B. Mỗi reference phải có **Priority thấp hơn rõ ràng**, không chấp nhận bằng nhau hoặc cao hơn. Quy tắc này ngăn vòng phụ thuộc A→B→A.
- **Không tự Respawn peer.** Nếu chưa có `spawnedRoot`, peer đã unload, không cùng Scene, disabled, bị trùng reference hoặc priority không phù hợp, thao tác bị từ chối **trước khi clear** instance của controller đang triển khai.
- Peer phải được spawn trước. Root rỗng sau khi được spawn là hợp lệ nếu dữ liệu rõ ràng có Node Generated; không có root sẽ được coi là chưa sẵn sàng.
- Chỉ đọc **children trực tiếp của `peer.spawnedRoot`**, kể cả sau khi Save/Reopen. Không sử dụng danh sách instance runtime không được serialize. Những child bổ sung thủ công vào Generated Root cũng được tính là vùng chiếm chỗ.
- Danh sách peer tối đa **16 controller**, tổng cộng tối đa **32.768 occupant**, 2.048 candidate/controller. Vị trí và radius finite trong ±10⁷ World units, Shared Radius tối đa 100, clearance tối đa 10.000.
- `Rebuild On Change` của B theo dõi Node UUID, World Position và radius/priority của các peer khi bật Avoid Peer Population. Khi tắt, thay đổi peer không tạo invalidation cho B.
- Peer positions được snapshot trong một lượt synchronous trước khi thực thi lọc, tránh phụ thuộc việc hệ thống Physics cập nhật sau đó. Không có giao dịch toàn Scene giữa nhiều controller; cần Spawn các controller theo thứ tự mong muốn.

## Pipeline

Spline placement + seed jitter → Surface/Terrain Conform (nếu bật) → Obstacle Collider AABB/OBB/Capsule/Mesh (nếu bật) → **Shared Occupancy** → Density/Exclusion/Min World Spacing → Instantiate.

- Candidate bị peer lọc không chiếm khoảng cách trong Min World Spacing.
- Bộ lọc dùng spatial hash 3D, giữ **index gốc**, prefab variant và jitter ổn định; không dùng `Math.random`.
- Tất cả peer validation + kiểm tra candidate xảy ra **trước `clear()`**. Nếu cấu hình sai, các object đã spawn trước đây vẫn được giữ nguyên. Lỗi Engine khi `instantiate` sau clear không được rollback hoàn toàn.
- Khi `Avoid Peer Population=false`, logic spawn cũ chạy như trước và không tham chiếu danh sách Peer Nodes.

## Giới hạn

- Đây là bán kính **cấu hình thủ công cho published instances**. Hãy đặt đủ lớn cho prefab có mesh dài, cây hoặc cấu trúc bất đối xứng. Nếu để 0, chỉ những tâm trùng nhau hoặc nằm trong bán kính còn lại mới bị loại. Auto footprint của controller *đang spawn* được dùng khi đã bật trong pipeline chính xác; auto footprint của peer **không được suy ra** từ các child sau khi Save/Reopen.
- Không hỗ trợ một nút tự động phân bố tất cả controllers theo priority, không làm collision giữa các spawned instances của chính B (dùng Min World Spacing), không hỗ trợ Physics OBB của từng prefab và không kiểm tra hàng rào giữa nhiều Scene.
- Các controller có cùng Priority không được reference nhau. Không tự động định nghĩa winner bằng thứ tự Hierarchy hoặc thời điểm thao tác.

## Checklist Cocos Creator 3.8.8

- [ ] Hai ObjectController khác Node cùng Scene; A=0, B=1. Spawn A rồi B, xác nhận không có tâm B nào cách A ≤ tổng radius + clearance.
- [ ] A có Radius=1, B Radius=0.5, Clearance=0.5; thử candidate đúng khoảng cách 2.0 → bị loại, >2.0 → được giữ.
- [ ] Thử đổi Priority ngang nhau, chọn chính B, chọn trùng A, chuyển A sang Scene khác, chưa Spawn A: B phải báo lỗi và giữ instance cũ.
- [ ] Move child trong A Generated Root, bật B Rebuild On Change ở Play: B phải cập nhật khi peer thay đổi vị trí.
- [ ] Save/Reopen Scene với A Generated Nodes đã lưu; Respawn B không cần metadata runtime của A.
- [ ] Test B + Density + Min World Spacing + MeshCollider BVH + Surface Conform. Candidate bị peer chặn không chiếm slot spacing.
- [ ] Với 3 controllers có priorities 0,1,2, Spawn lần lượt, Undo/Redo và Prefab overrides không làm peer ownership bị sai.
- [ ] Tắt Avoid Peer Population: B trả về placement legacy, không đọc peer refs.
- [ ] Test performance với 2.048 ứng viên và 16 peers (≤32.768 object), đặc biệt tránh chi phí Rebuild On Change liên tục.

**Chỉ đẩy lên nhánh `v2`; không tag/release khi chưa yêu cầu chốt. Native Cocos 3.8.8 smoke test vẫn cần thực hiện.**
