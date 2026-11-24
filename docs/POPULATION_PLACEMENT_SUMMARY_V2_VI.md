# Cocos Splines V2 — Phase 3.8d1: Placement Statistics (read-only)

## Mục đích

Trong **SplineObjectController Inspector**, nút **Analyze Placement** tính chính xác số lượng ứng viên được nhận hoặc loại theo từng bước của pipeline Respawn. Đây là **bản chụp khi nhấn nút**: không Instantiate, không Clear, không thay Knot, Road, Collider hoặc Prefab nguồn, không tạo Scene snapshot hay thêm Undo entry.

Thống kê dùng toàn bộ tối đa **2048 ứng viên**, độc lập với giới hạn **8–256 marker** vẽ trong Placement Debug Gizmos. Không cần bật Show Placement Gizmos hoặc plugin Gizmos để bấm Analyze, nhưng `SplineObjectController` vẫn phụ thuộc plugin Gizmos v3 ở bản V2.

## Sử dụng

1. Chọn Node chứa `SplineObjectController` trong Hierarchy.
2. Mở Inspector → **Placement statistics · read-only**.
3. Nhấn **Analyze Placement**. Kết quả hiển thị:
   - Total: tổng số candidate được tính trước lọc
   - Accepted: số candidate giữ lại và phần trăm
   - Rejected: số bị loại
   - Bảy nhóm: Accepted, Surface, Collider, Peer, Exclusion, Density, Spacing
   - Tối đa **3 candidate index đầu tiên** cho mỗi nhóm bị loại để đối chiếu vị trí trên spline
4. Đổi Density/Exclusion/Collider/Peer/Surface/Noise hoặc move Knot rồi **bấm lại Analyze Placement**. Kết quả cũ không tự cập nhật; giữ UI nhẹ khi người dùng đang edit.
5. Muốn trực quan vị trí tương ứng, bật **Show Placement Gizmos** trong nhóm Placement Debug Gizmos.

## Semantics

| Lý do | Khi nào xảy ra |
|---|---|
| Accepted | Đi qua toàn bộ pipeline và được Respawn giữ lại |
| Surface | Skip Missing Surface đang bật và raycast không có hit hợp lệ |
| Collider | Ứng viên chồng lấn AABB/OBB/Capsule/Mesh BVH theo cấu hình |
| Peer | Ứng viên giao với sphere của Shared Occupancy peer |
| Exclusion | Progress nằm trong khoảng cấm |
| Density | Không đạt density key/seed gate |
| Spacing | Không đạt khoảng cách World tối thiểu sau các bộ lọc trước |

Mỗi candidate chỉ có **một** lý do kết quả: lý do **đầu tiên** gây loại theo thứ tự Surface → Collider → Peer → Exclusion → Density → Spacing. Tổng tất cả 7 giá trị luôn bằng `Total`, và tổng 6 lý do loại bằng `Rejected`.

Kết quả có thể khác số Node đã spawn trong Hierarchy nếu bạn đã thay cấu hình mà chưa Respawn. Analyze tính theo **cấu hình hiện tại**, không phải lịch sử các lần spawn.

## Kiến trúc

- Core: `SplinePlacementDiagnostics.summarizePlacementDiagnostics()` kiểm tra chỉ số nguyên/tăng dần, tọa độ World finite, reason hợp lệ, bán kính bounded; trả về histogram và ví dụ index có giới hạn.
- Component: `SplineObjectController.summarizePlacement()` gọi chính `previewPlacement()` dùng chung preflight với `Respawn`.
- Scene: `queryPlacementSummary(uuid)` chỉ đọc component đã chọn, từ chối Node không hợp lệ, disabled component hoặc preflight lỗi.
- Editor main: IPC `query-placement-summary` tới Scene; **không gọi snapshot**, tạo Node hoặc serialize property.
- Inspector: Nút Analyze on-demand, output bằng `textContent` (không parse HTML), kiểm tra total/reason trước khi hiển thị, disable nút trong lúc thực hiện để tránh double click.
- Truyền qua IPC chỉ có summary nhỏ và tối đa 18 index ví dụ; **không chuyển toàn bộ 2048 marker**.

## Giới hạn và kiểm thử

- Kiểm tra Cocos 3.8.8 Editor thật vẫn cần thực hiện. Regression chỉ dùng Node/Editor mocks và tsc.
- Analyze có thể phải thực hiện Physics raycast hoặc BVH planning tùy cấu hình, vì phải đúng như Respawn. Bấm khi cần, không chạy từng frame.
- Nếu cấu hình không hợp lệ, UI hiển thị lỗi và **không thay đổi population cũ**.
- Không hiển thị histogram theo prefab variant, nhãn index dạng text trong Scene, hoặc export thống kê sang CSV (để lại roadmap).
- Với spline không có ít nhất 2 Knot hoặc không có prefab, summary hiện ra 0 thay vì dữ liệu dự đoán.

## Checklist Creator 3.8.8

- [ ] Chọn Object Controller chưa Spawn, Analyze: thấy Total và lý do, Hierarchy không phát sinh Generated Root.
- [ ] Respawn rồi đối chiếu Accepted với số prefab khi cùng cấu hình.
- [ ] Thử từng filter: Surface, Collider, Peer, Exclusion, Density, Spacing; tổng lý do luôn bằng Total.
- [ ] Đổi cấu hình/di chuyển peer, bấm Analyze lại và xác nhận không hiển thị dữ liệu cũ.
- [ ] Cấu hình Surface thiếu Collider hoặc policy lỗi; button báo lỗi, popup không làm mất instance cũ.
- [ ] Kiểm tra multi-component selection, Undo/Redo, Prefab overrides, Save/Reopen; không phát sinh Undo entry chỉ vì Analyze.
- [ ] Kiểm tra hiệu năng với 2048 candidate, 64 Collider và Gizmos marker limit 8/256: thống kê không phụ thuộc marker limit.

**Chỉ branch `v2`; không tag/release khi chưa chốt.**
