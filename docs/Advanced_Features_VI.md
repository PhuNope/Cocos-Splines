# Các công cụ spline nâng cao (Cocos Creator >=3.8.2)

> Các thành phần dưới đây được triển khai bằng TypeScript theo ý tưởng workflow từ Dreamteck, không sao chép mã nguồn của họ. Không có panel riêng: cấu hình trong Inspector. `Collider Generator` và `Particle Controller` **chưa** được thực hiện.

## 1. Spline Modifiers — keyframe theo chiều dài cung

1. Chọn Node `SplineContainer`, dùng nút **+ Modifiers** trong Inspector hoặc **Extensions → Cocos Splines → Add Spline Modifiers**.
2. Trong `SplineModifiers → Keys`, thêm key ở `Progress=0` và `Progress=1`. Giá trị mặc định neutral: `Offset=(0,0,0)`, `Scale=(1,1,1)`, `Width=1`, `Speed=1`, `Roll=0`.
3. Kéo `SplineModifiers` vào thuộc tính `Modifiers` của `SplineAnimate`, `SplineRoad`, hoặc `SplineObjectController`.
4. Chọn `Linear` hoặc `SmoothStep` để nội suy. Progress là **normalized ARC length**; không phải Bezier parameter t.

Các consumer áp dụng: Animate lấy offset/speed/roll; Road lấy width multiplier; ObjectController lấy offset/scale/roll. Key dạng multiplier có thể dùng chung giữa nhiều spline nhưng giá trị x/y/z tính trong spline-frame. Animate hiện chỉ lấy speed multiplier tại đầu mỗi update frame, không tích phân speed field chính xác giữa nhiều trigger trong một dt quá lớn.

## 2. Spline Object Controller — nhiều prefab

1. Chọn `SplineContainer`, bấm **+ Object Controller**.
2. Trên Node mới, chọn `Spline` (hoặc để trống nếu nằm trực tiếp dưới Container), đặt mảng `Prefabs` gồm nhiều prefab.
3. `Method=Count` / `Method=Distance` và đặt Count/Spacing; cấu hình `Start Progress`, `End Progress`.
4. Đặt `Seed`, `Random Position`, `Random Rotation`, `Random Scale`, `Scale Multiplier` để tạo phân bố ổn định và có thể lặp lại.
5. Tùy chọn nối `SplineModifiers` để đổi offset/scale/roll dọc spline.
6. Nhấn **Play**: prefab được sinh tại runtime, không bị lưu lại vào Scene/Prefab trong Editor. Bật `Rebuild On Change` nếu đường cong được thay đổi lúc gameplay.

Hệ thống này không thay thế `SplineInstantiate` cũ; scene cũ vẫn chạy bình thường. Không tự chạy preview clone prefab trong Editor để tránh làm bẩn scene serialization.

## 3. Spline Junction Mesh — mặt vá tại giao lộ XZ

1. Tạo `SplineJunction` có 2–4 `Connections`, endpoint spline 1 = 1.0 và spline 2/3 = 0.0 (NormalizedDistance). Các điểm kết nối nên nằm cùng world position.
2. Chọn chính Node có `SplineJunction`, bấm **+ Add XZ Road Patch** trong Inspector Junction hoặc menu **Extensions → Cocos Splines → Add Junction Mesh Patch**.
3. Node con `Junction Mesh Patch` sẽ tự lấy Junction ở parent. Có thể gán tay `Junction` để tạo patch ở nơi khác.
4. Gán **cùng một `.mtl` asset** đang dùng cho các Road vào trường `Material` của Patch (Shared Material).
5. Điều chỉnh `Setback`, `Default Width`, `Surface Lift`, `UV Meters Per Repeat`. Bấm **Rebuild Patch** trong Inspector.

**Giới hạn đã biết:** đây là một **XZ co-planar surface patch**, không phải boolean mesh union / watertight junction. Các Road vẫn còn mesh phía dưới; `Surface Lift` giúp tránh Z-fighting. Chỉ hỗ trợ link ở endpoints (`Progress` gần 0/1), không xử lý giao nhau giữa đường, độ cao khác nhau, viền curb/shoulder, seamless road UV, hoặc ngã tư nghiêng 3D. Có thể yêu cầu chỉnh material/UV thủ công.

## 4. Spline Object Bender — uốn nhiều mesh trong hierarchy

1. Chuẩn bị model root chứa các `MeshRenderer` (mỗi mesh phải đọc được dữ liệu: **Allow Data Access** và một submesh).
2. **Chọn model root (không chọn `SplineContainer`)** → Extensions → Cocos Splines → **Add Object Bender**.
3. Gán `Spline` ở **ngoài** hierarchy model; nếu Spline nằm bên trong model root, Bender sẽ từ chối để tránh uốn cả Knot/Road.
4. Chọn `Axis X/Y/Z` theo chiều dài của model nguyên bản; cấu hình `Start/End` bằng Normalized Distance, Distance hoặc Spline t.
5. Bật `Preview In Editor`, bấm **Apply Bend** (hoặc bật `Rebuild On Change`). Bấm **Restore** và tắt Preview để trả về mesh gốc.

Bender giữ nguyên **Material asset**, chỉ tạo Mesh tạm cho mỗi renderer. Nó deform **vertex geometry** của MeshRenderer con, không reposition collider/child transforms, không hỗ trợ skinned meshes, multiple submeshes hay mesh nén không đọc được. Đường cong cần đủ subdivisions dọc trục mesh. Preview trong Editor nên tắt trước khi lưu scene để tránh serialize nhầm mesh tạm.

## 5. Spline Morph — chuyển giữa hai đường cong

1. Tạo hai spline nguồn A/B. Tạo một **spline đầu ra riêng** có ít nhất 2 Knot (nên cùng số Knot với A/B).
2. Chọn A hoặc B → Inspector Container → **+ Morph** (hoặc qua menu), tạo Node điều khiển Morph.
3. Gán `Source A`, `Source B`, `Output Spline`. Output không được trùng với A hoặc B.
4. Đặt `Blend` từ `0` đến `1` (0 = A, 1 = B). Bật `Preview In Editor` nếu muốn xem trong Scene.
5. Bấm **Apply Morph**; khi tắt Preview hoặc **Restore**, vị trí/tangents cũ của Output được hoàn nguyên.

Khi cùng số knot, phép blend position và tangent handles được tính riêng trong world space (nhằm hỗ trợ spline source ở các transform khác nhau). Khi số knot khác nhau, output được resample gần đúng theo số knot output. **Output knots không được sử dụng Tangent Handle Nodes**, vì Handle sẽ override các tangent vector. Node Output riêng là bắt buộc để không phá source.

## 6. Ghi chú về Events và tương thích

Các API event (`AddOnReachEvent(cb,target)`, `RemoveOnReachEvent(cb,target)`, các API trigger/animate/projector...) vẫn khả dụng. Các UUID của script cũ được giữ nguyên; chỉ có các file TypeScript mới sử dụng UUID mới. `SplineAnimate`, `SplineRoad` được thêm trường Modifiers mặc định `null`; các scene cũ không cần sửa.

**Kiểm thử:** có TypeScript typecheck, unit tests và mock runtime. Chưa có Cocos Creator >=3.8.2 GUI / native build / render integration test thực tế. Kiểm thử Editor và Preview thực tế trên Cocos Creator vẫn được khuyến nghị.
