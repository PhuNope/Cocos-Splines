# Cocos Splines V2 — Phase 3.8c1: Weighted Prefabs & Collider Avoidance

## Tính năng

- **Weighted Prefab Variants**: các prefab có trọng số khác nhau, nhưng chọn bằng cùng deterministic random channel 0 như bộ phân bố cũ. Không bật tùy chọn thì vẫn chọn đều các prefab hợp lệ và giữ nguyên RNG/jitter của mọi scene hiện có.
- **Explicit Collider Avoidance**: chỉ kiểm tra **Collider mà người dùng gán vào danh sách**. Dựa vào `Collider.worldBounds` (World AABB) và `Obstacle Clearance` (bán kính quanh tâm prefab), không chạy simulation hoặc tự tìm mọi Collider trong Scene.
- Cả hai chức năng là **opt-in**, mặc định tắt. Không thay đổi Knot, road mesh hay prefab asset.

## Thiết lập Weighted Prefabs

1. Gắn `SplineObjectController` lên Node chứa spline (hoặc liên kết field Spline).
2. Gán danh sách `Prefabs` như thường lệ.
3. Bật `Use Prefab Weights`. Điền `Prefab Weights` bằng số phần tử **bằng chính xác số slot Prefabs**. Mỗi trọng số trong [0, 10000], ít nhất một prefab hợp lệ phải có trọng số dương. Giới hạn 128 prefab slots khi bật weighted selection.
4. Ví dụ 3 prefab A, B, C với weights [1, 3, 0]: A xuất hiện khoảng 25% và B 75% theo số lượng lớn, C **không được chọn**.
5. Nếu một prefab slot bị để trống, trọng số tương ứng không áp dụng; ít nhất một slot hợp lệ vẫn phải có trọng số dương.

**Quan trọng:** Đây là tần suất xác suất theo từng candidate, không bảo đảm số lượng cố định ở mỗi nhóm. Việc thay weights không thay đổi tính xác định của seed, tiến độ/offset hoặc random rotation/scale của candidate được giữ lại.

## Thiết lập Collider Avoidance

1. Bật **Avoid Obstacle Colliders**.
2. Gán các Collider vật cản trong `Obstacle Colliders` (tối đa 64). Có thể dùng BoxCollider, CapsuleCollider, MeshCollider và các Collider có `worldBounds` hợp lệ.
3. Đặt **Obstacle Clearance** (World unit) theo nhu cầu. 0: chỉ loại tâm prefab ở trong/chạm AABB; giá trị lớn hơn: chặn cả tâm ở gần mặt AABB trong bán kính tương ứng.
4. Chọn **Respawn**. Nếu các ứng viên bị loại vì Collider, đối tượng được spawn vẫn giữ index gốc; lựa chọn prefab và random seed của các ứng viên còn lại không đổi.

**Tính toán:** `distance(center, AABB) <= clearance` thì loại. Với BoxCollider xoay và MeshCollider, worldBounds là AABB bao quanh nên **có thể loại thừa** vị trí. Không phải OBB hay kiểm tra tam giác mesh chính xác. Không có collision response, vật lý thời gian thực, rà soát tự động toàn Scene hoặc kiểm tra kích thước prefab/Collider prefab.

**Thứ tự pipeline:** Tạo candidate và tính final world position (Spline + Modifiers + Noise + Jitter) → loại những candidate nằm trong/gần World AABB của obstacle → áp dụng Density/Exclusions/World Spacing nếu bật Advanced Population → instantiate. Việc loại collider xảy ra **trước World Spacing**, nên candidate bị collider chặn không chiếm giữ slot spacing. Trọng số áp dụng ở bước chọn prefab cho ứng viên đã giữ.

## An toàn và giới hạn

- Không bật `Use Prefab Weights` và `Avoid Obstacle Colliders` → bộ chọn prefab và đường spawn cũ giữ nguyên.
- Không chỉnh `Collider`, `SplineContainer`, các Knot hoặc Prefab sources.
- Việc xác thực số trọng số, World AABB, clearance và candidate positions diễn ra **trước clear()**. Nếu gặp thông số sai, các instance cũ vẫn còn. Lỗi engine trong quá trình `instantiate` sau clear không được rollback tự động.
- Những Collider bị disabled hoặc Node inactive được bỏ qua có chủ ý; thiếu tham chiếu hoặc bounds không hợp lệ trên Collider active sẽ bị báo lỗi.
- `Rebuild On Change` theo dõi trọng số khi bật và snapshot center/halfExtents của World AABB, nên Collider di chuyển có thể yêu cầu regeneration ở runtime. Việc thay tham số đã tắt không kích hoạt rebuild vô ích.
- `Obstacle Clearance` là bán kính **tâm điểm** của ứng viên. Nó không bảo đảm model không chạm mặt Collider; để kiểm soát kích thước prefab cần dùng bán kính bảo thủ do người thiết kế chọn.
- Giới hạn 2.048 candidate, 64 obstacle Colliders, 128 prefab slots khi bật weighted selection.

## Test trong Cocos Creator 3.8.8

- [ ] Tạo 3 prefab (cube/sphere/tree), Count=100, weights [1,3,0]. Respawn với seed cố định, cùng Node variant và vị trí qua nhiều lần.
- [ ] Tắt `Use Prefab Weights`: cùng seed phải trở về distribution cũ.
- [ ] Đặt BoxCollider trên đường spline, bật tránh Collider; kiểm tra mọi tâm prefab nằm ngoài World AABB (có/không clearance).
- [ ] Xoay BoxCollider và MeshCollider, kiểm tra giới hạn AABB (có thể overreject).
- [ ] Kết hợp Min World Spacing + vùng Collider bị chặn; các ứng viên bị loại không làm chiếm chỗ trước đối tượng kế tiếp.
- [ ] Tắt Collider/Node; kiểm tra ứng viên được phục hồi nếu không còn obstacle khác.
- [ ] Cố ý đặt một weight âm, tất cả weight bằng zero, AABB NaN hoặc clearance âm: Respawn phải báo lỗi, giữ instance cũ.
- [ ] Test Editor Undo/Redo, save-reopen Scene, Prefab overrides, Build Preview, gizmos dependency và `Rebuild On Change`.

## Roadmap còn thiếu

**Phase 3.8c2:** terrain/surface conform (raycast downward), nonuniform/radius-aware object bounds, Collider OBB/Capsule/Mesh chính xác hơn và multi-controller occupancy policy. Chưa đánh dấu parity đầy đủ với hệ thống Population của Unity.

**Chỉ nhánh v2 preview. Không tạo tag hoặc GitHub Release trước khi người dùng chốt.**
