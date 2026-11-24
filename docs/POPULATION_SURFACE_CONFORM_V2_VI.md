# Phase 3.8c2 — Surface / Terrain Conform cho SplineObjectController (V2 Preview)

## Tính năng

Bổ sung cách **đặt vị trí prefab xuống bề mặt 3D** bằng Cocos Physics, không di chuyển spline/Knot/Mesh nguồn. Tính năng mặc định tắt để giữ nguyên các scene cũ. Cocos Physics **phải hoạt động**, và người thiết kế phải chỉ định rõ các 3D Collider cần bám (có thể là TerrainCollider, MeshCollider hoặc BoxCollider).

## Inspector: Surface / Terrain Conform · opt-in

1. Chọn node chứa **SplineObjectController**. Gán Spline, Prefabs và cấu hình Count/Distance như trước.
2. Bật **Conform To Surface**, điền **Surface Colliders** bằng 1–64 Collider 3D (không hỗ trợ Collider2D). Không tự tìm toàn Scene: các Collider ngoài danh sách sẽ bị bỏ qua kể cả khi raycast trúng.
3. **Surface Ray Height**: điểm bắt đầu ray hướng xuống, nằm cao hơn vị trí ứng viên trên spline bao nhiêu World units. Mặc định 10.
4. **Surface Ray Depth**: phạm vi ray tiếp tục xuống dưới vị trí ứng viên. Mặc định 50. Toàn bộ raycast có chiều dài Height + Depth; tổng phải lớn hơn 0.
5. **Surface Offset**: dịch điểm sau khi trúng bề mặt theo hướng normal, trong khoảng [-1000,1000]. Ví dụ 0.05 nhấc lên 5cm nếu world units là mét.
6. **Min Surface Normal Y**: ngưỡng thành phần Y của normal đã chuẩn hóa, từ 0–1. Mặc định .3, bỏ qua mặt dốc vượt ngưỡng; 1 chỉ chấp nhận normal hướng gần thẳng lên.
7. **Skip Missing Surface** mặc định bật: nếu không có hit đủ điều kiện, bỏ ứng viên đó. Tắt: giữ nguyên vị trí trên spline nếu raycast không trúng.
8. **Align To Surface Normal** (khi Align To Spline bật): quay trục local Y của prefab theo surface normal; trục local Z được lấy từ hướng tiến spline chiếu lên mặt phẳng tiếp tuyến, sau đó cộng random Euler/roll như cũ.

## Cách hoạt động

- Compute ứng viên theo Count/Distance và vị trí World sau Modifiers + Noise + Random Offset.
- Nếu Conform bật, raycast 3D theo World -Y từ `candidate.y + SurfaceRayHeight` trong phạm vi `SurfaceRayHeight + SurfaceRayDepth`.
- Chỉ nhận hit thuộc danh sách Collider 3D **đã gán, còn active và enabled**, không dùng hit của road hoặc vật cản không liên quan. Hit gần nhất **hợp lệ** với hướng normal Y >= ngưỡng được chọn.
- Lưu vị trí đã project và normal cho đúng candidate index. Các hit chưa đủ điều kiện không được dùng để đặt prefab.
- Tiếp tục bộ lọc **Collider Obstacle Avoidance**, **Density/Exclusions/World Spacing** nếu các tùy chọn đó bật. Các phép lọc sau nhận vị trí đã project.
- Chỉ sau khi validation, raycast và population planning thành công mới gọi `clear()` và `instantiate()`. Vị trí đã tính được **tái sử dụng** khi spawn, không raycast lại lần hai.

## Giới hạn và lưu ý an toàn

- **Chỉ Physics 3D**, không hỗ trợ Terrain API thuần dữ liệu nếu không có Collider. Không phát ray theo pháp tuyến spline, chỉ theo -Y World, nên địa hình có mái vòm/overhang có thể không giống kỳ vọng.
- Một số backend/Collider cần bật Physics trong Scene để raycast hoạt động. Khi bật conform mà PhysicsSystem thiếu API raycast, thao tác báo lỗi **trước khi xóa population cũ**.
- Raycast có thể trả về dữ liệu engine-owned tái sử dụng. Adapter chỉ sao chép các trường cần thiết (`hitPoint`, `hitNormal`, `distance`, `collider`) ngay trong lượt gọi.
- Hit trên surface không tính kích thước thực tế prefab; muốn tránh va chạm cả model phải kết hợp Obstacle Clearance bảo thủ hoặc chờ pha xử lý bounds chính xác.
- **Rebuild On Change** theo dõi các setting, Collider transforms và World AABB. Di chuyển địa hình bằng runtime mesh deformation mà World AABB không đổi có thể không kích hoạt rebuild tự động; gọi Respawn thủ công.
- Không hỗ trợ collision-aware placement theo Mesh BVH/OBB, Collider2D, raycast lưới batch/GPU, multi-controller occupancy, runtime async generation.
- Mặc định `conformToSurface=false` → không truy cập Physics, không thay đổi vị trí cũ. Hạn chế tối đa 2048 ứng viên, 64 Surface Collider, normal và World coordinates phải finite.

## Checklist native Cocos Creator 3.8.8

- [ ] Cảnh có Physics 3D, TerrainCollider hoặc BoxCollider/MeshCollider: gán Collider vào Surface Colliders, bật Conform, Respawn.
- [ ] Gán thêm Collider phía trên không thuộc danh sách; raycast phải bỏ qua nó và chỉ lấy Collider được chỉ định.
- [ ] Di chuyển/đổi độ dốc mặt terrain, chỉnh Ray Height/Depth/Min Normal Y, xác nhận hit valid và skip missing đúng.
- [ ] Bật Align To Surface Normal trên terrain dốc và kiểm tra trục local Y theo normal; toggle off trả về orientation spline cũ.
- [ ] Kết hợp Noise + Obstacle Avoidance + World Spacing; các tâm sau conform dùng trong collision filter, không lệch khỏi normal offset mong muốn.
- [ ] Tắt Physics hoặc xóa toàn bộ Surface Colliders, thử Respawn: báo lỗi và giữ population cũ.
- [ ] Save/Reopen Scene, Prefab overrides, native Undo/Redo, Cocos-Gizmos v3, Play/Preview.
- [ ] Thử 100–2000 prefab để đánh giá hiệu năng raycast và Rebuild On Change trên thiết bị thật.

**CI chỉ xác minh offline stubs và regression**, không thay thế smoke test Cocos Creator. Giữ branch `v2` preview, không tag/release trước khi chủ project yêu cầu chốt.
