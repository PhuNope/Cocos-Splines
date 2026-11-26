# Geometry Graph — Per-triangle UV0 Unwrap (v2 preview)

## Phạm vi

Authored Profile JsonAsset v1 hỗ trợ cờ `uv.triangleUnwrap: true`. Đây là chế độ **tùy chọn**, không ảnh hưởng Profile cũ khi không bật.

- **Mỗi triangle** của mặt bên và cap được nhân bản 3 vertex riêng, giữ nguyên thứ tự đỉnh/tam giác, vị trí và normal gốc. Không xóa hoặc ghi vào Profile Asset/Mesh Asset nguồn.
- UV0 của mỗi triangle được dời về gốc riêng (U/V thấp nhất về 0), **không tự scale** và không xoay UV. Tỷ lệ texel tương đối được giữ lại.
- Có thể kết hợp với `uv.atlasPacking: true` và `uv.atlasPadding` để đưa mọi triangle island vào UV0 [0,1], không chồng lấn. Bộ packer dùng một tỉ lệ scale chung cho các island, không bake/ghi texture.
- Hoạt động cùng Continuous Perimeter, Edge Islands, Quad Islands, width/taper, metric U và `uWorldSpace`. Cap triangles cũng nhận island riêng (khi bật cap).
- Giới hạn sớm: **65.536 vertices** và **16.384 triangle islands**, bảo vệ khỏi mesh/spline quá lớn. UV triangle có U hoặc V suy biến, index lỗi hoặc dữ liệu nonfinite sẽ fail closed thay vì phát sinh mesh lỗi.

## Trong Cocos Creator

**Cách 1: Test nhanh không kéo thả JSON.** Chọn **Extension → Cocos Splines → Install Examples** rồi tạo **Example Gallery** trong Scene. Trong component Gallery chọn **GeometryGraphTriangleUV** và nhấn **Play**. Gallery tạo hai Profile Extrude mesh: bên trái Quad Islands thông thường, bên phải triangle UV islands được đóng gói Atlas. Có thể gán checkerboard Material vào trường **UV Atlas Preview Material** để nhìn UV trực tiếp.

**Cách 2: Chỉnh Profile Asset thực.** Gán `GeometryGraph/UVIslandExtrudeGraph.json` và `GeometryGraph/Profiles/UVTriangleUnwrapProfile.json` qua **SplineGeometryGraphRenderer → Graph Asset / Profile Asset A**. Mở **Authored Profile Editor**, bật/tắt **Per-triangle UV unwrap** và **Pack UV0 islands into atlas** trong draft. Các nút **Undo Draft / Redo Draft** không sửa JsonAsset; chỉ **Save Profile JSON** xác nhận mới ghi dữ liệu nguồn.

## Giới hạn

Chế độ này chưa hỗ trợ packing bằng MaxRects/skyline, UV rotation, texel density chuẩn theo material size, texel padding tính theo pixel hoặc texture baking. Việc split triangle làm tăng số vertex, thường gấp nhiều lần mesh cũ. Các bài test regression kiểm tra winding/normal, cap, UV metrics, atlas no-overlap, cache theo nhánh, rollback, installer và Gallery Play bằng mock. Vẫn cần kiểm chứng bằng Cocos Creator **3.8.8 native** (PBR filtering, Prefab, GPU, Scene save/reopen, Undo/Redo).
