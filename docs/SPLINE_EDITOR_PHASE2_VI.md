# Phase 2.1 — Batch Knot Editing

Công cụ mới nằm trong **SplineContainer Inspector → Batch Knot Tools**.

## Chọn và chỉnh hàng loạt

1. Đánh dấu những Knot cần chỉnh bằng ô **Mark** trong danh sách Knot.
2. Dùng **Mark all** hoặc **Clear marks**; không tạo Node mới.
3. **Select in Scene** đưa danh sách Knot đánh dấu vào native Selection của Cocos Creator, thay thế các Node đã chọn.
4. **Snap marked** dùng Grid step theo tọa độ **local của SplineContainer** (`knot.node.position`), không theo World và không sửa tangent trực tiếp.
5. **Align marked** dùng Knot đánh dấu đầu tiên **theo thứ tự Hierarchy** làm mốc, chỉ sửa trục X/Y/Z được chọn.

XY2D chỉ thao tác X/Y, giữ Z. XZ2D chỉ thao tác X/Z, giữ Y. 3D cho phép X/Y/Z. Grid step phải hữu hạn, dương và không vượt 1,000,000.

## API extension

- `Editor.Message.request('cocos-splines','select-knot-ids',uuids)`
- `Editor.Message.request('cocos-splines','snap-selected-knots',uuids,gridStep)`
- `Editor.Message.request('cocos-splines','align-selected-knots',uuids,'x'|'y'|'z')`

Khi không truyền `uuids`, Snap/Align dùng các Knot được chọn trong native Scene selection. Các UUID cung cấp phải thuộc một spline; ID lạ hoặc trùng lặp bị từ chối. Phép toán đặt lại thứ tự chọn theo Hierarchy để Anchor nhất quán.

## Undo / lỗi từng phần

Trước khi ghi, phép toán tính tất cả vị trí mới và kiểm tra đầu vào. Các thay đổi được gửi qua Scene `set-property` với `record:false`, sau đó tạo **một** `snapshot` cho toàn batch. Nếu không có thay đổi, không tạo snapshot. Nếu một ghi lỗi, công cụ khôi phục vị trí Node đã thay đổi và không tạo snapshot cho batch lỗi.

Đây là cách dùng Scene Undo API của extension hiện tại, **chưa được kiểm chứng Undo/Redo trực tiếp trong Cocos Creator 3.8.8**. Test Node mock xác minh số snapshot và rollback; không thể khẳng định native Undo stack đầy đủ từ mock test.

## Giới hạn

Chưa có surface raycast/snap theo World, drag nhiều knots như một nhóm, hoặc chỉnh tangent/rotation hàng loạt trong Scene. Những tính năng này nằm ở Phase 2 tiếp theo. Không thay đổi cấu trúc dữ liệu scene và không xóa tangent handle nodes đã serialize.
