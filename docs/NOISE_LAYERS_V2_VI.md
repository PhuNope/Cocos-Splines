# Cocos Splines V2 — Phase 3.8a: Deterministic Noise Layers

## Tạo và sử dụng

1. Chọn **SplineContainer** trong Hierarchy → menu **Extensions → Cocos Splines → Add Noise Layers** (hoặc nút **+ Noise Layers** trong Inspector).
2. Một component **Splines.SplineNoise** sẽ được gắn trên Container (không tạo Knot phụ, không chỉnh đường cong).
3. Mở **Spline Noise Layers** Inspector → **Layers** → thêm `SplineNoiseLayer`, đặt **Amplitude** (ví dụ X=0.6, Y=0.1, Z=0), **Frequency=4**, **Octaves=3**, **Persistence=0.5**, **Fade Ends=0.1**.
4. Thêm **Spline Object Controller** nếu chưa có, kéo `SplineNoise` vào trường **Noise** của controller, gán prefab và nhấn **Respawn**. Khi noise không được gán, behavior cũ không đổi.

**Noise là field đọc độc lập, KHÔNG sửa SplineKnot, không bẻ Road/MeshDeform và không làm dịch chuyển spline gốc.** Mỗi giá trị `sample(progress)` là vector X/Y/Z trong khung spline (Right/Up/Forward) và được ObjectController cộng vào các Offset/Modifier và random jitter hiện có, trước khi xoay sang World.

## Ý nghĩa tham số

| Trường | Ý nghĩa |
| --- | --- |
| Seed (global) | Random seed chính, kết quả lặp lại giữa các lần Respawn |
| Layer Enabled | Tắt layer này mà không xóa dữ liệu |
| Frequency | Số chu kỳ integer trên toàn spline, 1–64 |
| Octaves | 1–6 tầng noise, tần số gấp đôi ở tầng tiếp theo |
| Persistence | Hệ số biên độ tầng sau so với tầng trước, 0–1 |
| Phase | Dịch phase (-1000...1000), hỗ trợ random variation |
| Layer Seed | Seed riêng cho layer, kết hợp với global Seed |
| Amplitude X/Y/Z | Biên độ dịch Right/Up/Forward, mỗi trục tối đa ±10000 |
| Fade Ends | Open spline: fade mềm về 0 ở hai đầu. Closed: bỏ qua để giữ seam liên tục |

Noise dùng hash integer và smoothstep giữa các mẫu lân cận, không phụ thuộc `Math.random`, không tích lũy trạng thái giữa frames. Tổng các octave **chuẩn hóa theo tổng trọng số** để biên độ không tự tăng theo Octaves. Trong closed spline, chỉ số lattice tuần hoàn; `sample(0)` và `sample(1)` giống nhau và hai phía seam liên tục.

## Phạm vi và an toàn

- **Tùy chọn** trên ObjectController: mặc định `noise=null`, tức giữ nguyên các project đã có; không thay đổi enum, prefab và material serialized cũ.
- Bản đầu tiên chỉ tác động **vị trí các prefab của ObjectController**. Chưa hỗ trợ phân bố density, noise deformation của Knot/Road mesh, noise modifiers cho SplineAnimate và Gizmos noise visualization.
- Có tối đa **16 layers**, kiểm tra các giá trị finite và giới hạn frequency/octaves/amplitude; nếu cấu hình không hợp lệ, sampler báo lỗi thay vì âm thầm tạo dữ liệu sai.
- Respawn dùng cùng seed + progress → tái lập được vị trí giữa các lần chạy. **Rebuild On Change** dùng `getRevision()` bao gồm thông số layer để phát hiện thay đổi.
- Khi tạo component từ menu, thao tác sẽ từ chối tạo lần thứ hai trên cùng Container, chỉ yêu cầu một snapshot trên thành công.

## Checklist Cocos Creator 3.8.8

- [ ] Bật Cocos-Gizmos dependency và load một spline với 3+ Knot, add Noise Layers qua menu.
- [ ] Chỉnh 2 layers và gán vào Object Controller, spawn/respawn ít nhất 20 prefab; kết quả trùng nhau khi seed và spline không đổi.
- [ ] Tắt tham chiếu Noise hoặc disable component → prefab trở về vị trí cũ.
- [ ] Với spline Closed, đối chiếu offset gần seam và xác nhận không bị gãy.
- [ ] Save/Reopen Scene, Prefab Apply/Revert, Undo/Redo component creation và restore serialized layer values.
- [ ] Test spline parent có rotation/nonuniform scale; noise phải theo spline frame world rotation, không thay đổi source mesh.
- [ ] Quan sát Console khi chỉnh layer trong Play và bật Rebuild On Change.

**Không tag/release khi chưa được chấp thuận.** CI/mocked runtime tests là cần thiết nhưng không thay thế native Editor 3.8.8 acceptance.
