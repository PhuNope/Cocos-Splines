# Phase 3.8b — Advanced Population Rules (V2 preview)

## Mục đích

Thêm bộ lọc **tùy chọn** cho `SplineObjectController` để kiểm soát mật độ prefab, vùng không được spawn và khoảng cách tối thiểu giữa các đối tượng. Không thay đổi spline, Knot, tangent, source Mesh, prefab asset hoặc thứ tự các candidate được tính theo Count/Distance.

## Bật trong Inspector

1. Chọn node gắn **SplineObjectController**.
2. Mở **Advanced Population · opt-in** → bật `Enable Population Rules`. **Mặc định tắt**; các scene trước đây vẫn spawn y như cũ.
3. Đặt `Density` trong [0, 1]. Giá trị 1 = giữ mọi candidate trước khi xét Mask/Exclusions/Spacing; 0 = bỏ hết.
4. Thêm `Density Keys` (`progress`, `density` từ 0 đến 1), tối đa 64 key. Các key sẽ được sắp xếp theo progress và nội suy tuyến tính. Xác suất cuối cùng là **Density × Density Mask(progress)**; nếu không có key, mask mặc định bằng 1.
5. Thêm `Exclusions` (`startProgress`, `endProgress`) để cấm tạo object trong khoảng [start, end). Với spline **Closed**, start > end được hiểu là khoảng băng qua seam cuối/đầu; với spline **Open** nó bị từ chối. start = end là khoảng rỗng.
6. Tùy chọn `Min World Spacing` trong [0, 10000]. Khi > 0, từng ứng viên được kiểm tra khoảng cách Euclidean từ **tâm prefab dự kiến sau khi đã cộng Modifiers/Noise/Random Offset** tới mọi ứng viên được giữ trước đó. Các ứng viên gần hơn ngưỡng sẽ bị loại.

## Seed, phân bố và giới hạn

- Thuật toán tạo **candidate** theo đúng công thức Count/Distance hiện có, giữ `index` gốc.
- Density gate dùng hash integer theo seed + index, độc lập random channel cho prefab variant, rotation và jitter. Bỏ candidate 3 không làm candidate 4 đổi prefab hoặc random offset.
- Density keys trên **closed loop** nội suy tuần hoàn qua seam 0/1. Nếu có cả key tại progress 0 và 1, chúng trùng vị trí tuần hoàn và sẽ bị từ chối. Với open loop, hai đầu được giữ độc lập.
- Exclusion được áp dụng **trước** spacing. Spacing sử dụng lưới 3D ô cạnh `minWorldSpacing` để tránh kiểm tra từng cặp toàn bộ 2048 candidate trong trường hợp thông thường.
- Spacing chỉ là **khoảng cách giữa các tâm placement**, *không phải* phát hiện va chạm Collider/Mesh bounds, tránh giao nhau với object được spawn bởi controller khác hoặc vật cản trong Scene.
- Không có thay đổi về hướng/scale, không xuất dữ liệu mask thành một component tách rời ở phase này.
- Giới hạn 2.048 candidate, 64 density keys, 64 exclusion intervals, World coordinates hữu hạn trong ±10⁷ và seed là số nguyên 32-bit có dấu (giới hạn ±2.147.483.647).
- Validation của policy, candidate và vị trí World cuối cùng được thực hiện **trước khi gọi `clear()`**. Nếu mask/seed/toạ độ không hợp lệ, đối tượng đã spawn trước đó được giữ nguyên. Tuy nhiên lỗi engine trong quá trình `instantiate()` sau khi clear vẫn có thể làm gián đoạn spawn (không có transaction engine).
- `Rebuild On Change` theo dõi `Enable Population Rules`, Density, Keys, Exclusions, Min World Spacing và Noise revision.
- Khi không bật `Enable Population Rules`, sử dụng lại đường code phân bố cũ; không precompute policy, không lọc candidate.

## Checklist Cocos Creator 3.8.8

- [ ] Mở Scene có Object Controller đang spawn; xác nhận bật rồi tắt Rules khi tất cả giá trị mặc định giữ nguyên tên, vị trí và variant prefab.
- [ ] Count=20, Density=.5, Seed cố định: Respawn 3 lần và Save/Reopen Scene cho cùng tập candidate index.
- [ ] Density Keys [(0,0),(.5,1),(1,0)] trên Open: không có object ở hai đầu; giữa spline có thể xuất hiện object.
- [ ] Với Closed, Exclusion (.8,.2) phải bỏ vùng gần seam ở hai phía nhưng không loại nhầm phần giữa.
- [ ] Min World Spacing=2: đo khoảng cách giữa các tâm object sau Noise. Thử spline cong tự cắt và Noise offset lớn.
- [ ] Thiết lập Density=-1 hoặc duplicate key: Respawn bị từ chối và các instance cũ không bị xóa.
- [ ] Kiểm tra Undo/Redo của Inspector, Prefab overrides, native serialization và Rebuild On Change khi Play.

## Phần còn thiếu

Collision Collider/OBB, obstacles/terrain conform, mask theo texture hoặc surface material, weighted prefab variants, multi-spline population và tiến trình tác vụ lớn là các hạng mục tiếp theo. Đây không phải parity đầy đủ với SplineArchitect Population.

**Nhánh v2 preview; không tag/release trước khi chốt.**
