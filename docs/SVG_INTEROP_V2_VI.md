# SVG Import / Export — Cocos Splines V2 (preview)

## Import bằng Inspector

1. Chọn một **SplineContainer** trong Hierarchy, mở Inspector mục **SVG Path · Import / Export (2D)**.
2. Dán toàn bộ chuỗi `<svg>...<path d="..."/>...</svg>` hoặc chỉ chuỗi `d` của một SVG path.
3. Chọn **Units per SVG pixel**: ví dụ 1 tương ứng 1 đơn vị local, 0.01 tương ứng 1 cm nếu scene dùng mét.
4. Nhấn **Import SVG as new XY2D Spline**. Extension tạo **SplineContainer mới cùng cấp**, không ghi đè spline đang chọn.

SVG dùng trục Y dương xuống dưới; importer đảo dấu Y sang trục Y dương lên của Cocos XY2D. Z local luôn là 0. Các đoạn được chuẩn hóa về cubic Bézier và Knot **Broken** (tangent parent-local, không phụ thuộc Knot rotation). Lệnh Z đóng đường cong, kể cả khi cần thêm đoạn thẳng từ điểm cuối về điểm đầu.

## Export

Chọn spline XY2D hoặc XZ2D, nhấn **Export selected spline to SVG text**. Kết quả nằm trong textarea và được chọn sẵn để sao chép. Không tự động ghi file, không sửa Prefab, không tạo Snapshot. Export dùng `getNaturalResolvedKnots()` nên nhận đúng tangent đã được resolve từ AutoSmooth/Linear/Mirrored/Continuous/Broken, và không phụ thuộc thuộc tính `reversed` để thay đổi thứ tự Knot.

Toạ độ export là **container-local**, không bao gồm translate/rotate/scale của Node cha. XY2D ánh xạ X/Y; XZ2D ánh xạ X/Z, đều đổi dấu trục vertical của SVG. Dữ liệu SVG tạo ra được làm tròn 9 chữ số thập phân, đủ cho đa số kiểm tra hình học nhưng không phải phép lưu dữ liệu bit-exact. Mặc định dùng Units per SVG pixel = 1 khi import lại kết quả export.

## Giới hạn và an toàn

- Chỉ một đường `<path>` hoặc chuỗi path `d`: M/m, L/l, H/h, V/v, C/c, S/s, Q/q, T/t, Z/z.
- Không hỗ trợ SVG arc `A/a`, transform, nhiều subpath, group geometry, hình cơ bản, ảnh, CSS/gradient hoặc refer external resource. Hãy convert to path và flatten transform bằng công cụ SVG trước khi import.
- Các giá trị NaN/Infinity, số ngoài giới hạn, đường dẫn trên 256 segment hoặc văn bản lớn hơn 200 KB bị từ chối.
- Input được **phân tích như text**; không render XML, tải URL hay thực thi script.
- Nếu import lỗi trong quá trình tạo Node, extension thử xoá root mới. Với lỗi Scene IPC, Undo/Redo và Prefab overrides trong Cocos Creator 3.8.8 vẫn cần kiểm tra thủ công.

## Checklist kiểm thử Cocos Creator 3.8.8

- [ ] Nhập path `M 0 0 C 2 3 5 3 8 0`, kiểm tra Knot XY2D và 2 tangent, Y đã đảo chiều.
- [ ] Nhập path đóng `M 0 0 L 10 0 L 10 10 Z`, kiểm tra closed seam và mesh preview.
- [ ] Export spline XY2D có Knot AutoSmooth và nhập lại vào một sibling; so sánh điểm cubic nội suy ở t = 0, 0.25, 0.5, 0.75, 1.
- [ ] Export spline XZ2D; kiểm tra trục Z ánh xạ vào Y của SVG.
- [ ] Undo một lần sau Import, redo, save/reopen Scene và thử Prefab instance.
- [ ] Import SVG có `transform` và `A` phải lỗi, không tạo Node.
- [ ] Đảm bảo selection, Gizmos, refreshPreview và asset-db hoạt động khi extension Cocos-Gizmos v3 được bật.

**Không tạo release/tag khi chưa được yêu cầu.** Xem `docs/UNITY_PARITY_ROADMAP_VI.md` để theo dõi các bước sau.
