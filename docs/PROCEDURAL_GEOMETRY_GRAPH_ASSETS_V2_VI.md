# Cocos Splines V2 — Phase 4.2b: Reusable Geometry Graph JsonAsset

## Mục đích

Dùng **JsonAsset native của Cocos Creator 3.8.x** để chia sẻ một đồ thị spline geometry (`version:1`, typed DAG) giữa **nhiều SplineGeometryGraphRenderer**. Không thêm định dạng importer/asset riêng: bất kỳ tệp `.json` hợp lệ đặt trong `assets/` đều được Cocos nhập thành **JsonAsset**, có UUID riêng do Cocos quản lý. Extension **không sao chép file `.meta`/UUID** và không sửa JsonAsset đã gán.

## Sử dụng nhanh

1. Tạo một Spline + hai Node output có `SplineGeometryGraphRenderer`, gán cùng `SplineContainer` nguồn hoặc các Spline khác.
2. Trong Inspector Graph, bấm **Export JSON…** để lưu graph hiện tại thành một file mới trong thư mục `<project>/assets/...`. Chọn tên `.json` chưa tồn tại; file cũ **không bao giờ bị ghi đè**. Cocos sẽ tự import file mới thành `JsonAsset`.
3. Trên mỗi renderer, bật `Use Graph Asset` và kéo cùng asset `.json` từ Assets vào trường `Graph Asset`. Runtime sẽ đọc `JsonAsset.json` và dùng bản graph này thay vì `graphJson` cục bộ.
4. Khi asset mode bật, Visual Graph canvas hiển thị **read-only**. Bấm **Refresh Asset View** để cập nhật khi file đã thay đổi. Mọi renderer dùng cùng asset sẽ nhận graph mới khi Cocos đã reimport và `rebuildOnChange` bật (hoặc bấm Rebuild Graph).
5. Bấm **Copy Asset to Local** để bỏ dùng graph chung và sao chép graph đang chọn sang `graphJson` của riêng component. JsonAsset cũ không bị thay đổi; bạn có thể tiếp tục thêm/xóa node, kéo dây và chỉnh tham số ở canvas.
6. **Import JSON → Local…** chọn một file `.json` trên máy và sao chép cấu trúc vào component đang chọn. Source file không thay đổi. Nếu đang ở chế độ asset, import sẽ chuyển sang local sau khi commit thành công.

## Kiến trúc và ngữ nghĩa

- `useGraphAsset=false` (mặc định): chạy `graphJson`, giữ đúng behavior của Phase 4.1/4.2a.
- `useGraphAsset=true`: bắt buộc `graphAsset` được gán và `json` khác null. Không fallback sang local khi asset hỏng để tránh tự động sinh nhầm mesh.
- `graphAsset` có kiểu `JsonAsset` chính thức Cocos Creator. Chỉ đọc, không serialize lại vào file bởi renderer.
- `activeGraphJson()` serialize nội dung hiện có; cùng parser/validator V1 từ `SplineGeometryGraph` kiểm tra node, link, cycle, bounds và max 16 KiB trước khi mesh được thay.
- `signature()` của renderer bao gồm **nội dung graph đang dùng**, không chỉ UUID asset. Đổi width/offset/UV trong asset sẽ làm invalidation graph (nếu Cocos đã reload nội dung mới), không resample spline World frames khi spline/transform không đổi.
- Mỗi renderer có **cache, transient output Mesh, material và layout riêng**. JsonAsset được chia sẻ **chỉ là input graph**, không chia sẻ mesh instance hoặc frame cache giữa Node.
- `graphLayoutJson` vẫn thuộc component, không nằm trong shared asset; khi asset mode bật canvas hiển thị read-only để bảo vệ shared source. `graphJson` cục bộ vẫn được giữ để bật/tắt chế độ mà không mất dữ liệu.
- **Export JSON…** gọi `Editor.Dialog.save` và ghi qua thao tác `wx` độc quyền (không overwrite). **Import JSON…** gọi `Editor.Dialog.select`, kiểm tra file, JSON, type, DAG và numeric trước khi gọi native Editor `scene.set-property` + **một Scene snapshot**. Nếu Property write hoặc snapshot thất bại, editor cố gắng rollback các field `graphJson` và `useGraphAsset`.
- **Copy Asset to Local** tương tự Import nhưng không mở dialog. Không tạo/ghi file nguồn. Bấm lần nữa khi đã ở local sẽ là no-op.
- File nguồn/destination là đường dẫn người dùng chọn trong OS dialog, chỉ chấp nhận `.json`, UTF-8 ≤16 KiB. Symlink file nguồn bị từ chối; thư mục output phải có thật, không là symlink. Phải tự tạo thư mục đích trong Project Assets trước khi export.

## Ví dụ

Sau khi dùng **Install Examples**, sẽ có `assets/CocosSplinesExamples/GeometryGraph/BasicRibbonGraph.json`. File đó được Cocos import thành JsonAsset, có thể gán trực tiếp vào `Graph Asset`, không cần copy vào `graphJson`. File ví dụ không bị ghi đè khi Install Examples lại.

## Acceptance Checklist — Cocos Creator 3.8.8 (cần test native)

- [ ] Inspector hiển thị `Use Graph Asset` và trường `Graph Asset`, drag/drop asset JSON từ Assets thành công.
- [ ] Hai renderer cùng tham chiếu một JsonAsset, nhưng có MeshRenderer và spline nguồn khác nhau; mesh đều build được.
- [ ] Thay giá trị Width trong JSON bên ngoài, quay về Creator cho import asset, Rebuild On Change bật: cả hai cập nhật và giữ riêng cache/mesh.
- [ ] Không gán asset nhưng bật `Use Graph Asset`: Rebuild báo lỗi, **mesh cũ không bị xóa**.
- [ ] Đặt file JSON invalid hoặc graph cycle: báo lỗi, giữ mesh trước và giữ graphJson cục bộ.
- [ ] Export đến file mới dưới Assets, Creator tự import JsonAsset và cấp UUID khác; Export lần nữa vào cùng file báo lỗi, file không đổi.
- [ ] Import JSON invalid, symlink, sai đuôi, quá 16 KiB: không sửa component và không thêm Undo.
- [ ] Import JSON hợp lệ hoặc Copy Asset to Local: đảm bảo một snapshot và Undo/Redo trả lại chế độ asset + local JSON như trước.
- [ ] Bật asset mode: Visual Graph chỉ xem, thao tác Add/Remove/Drag/Connect bị chặn; Refresh Asset View hiển thị graph mới.
- [ ] Save/Reopen Scene và Prefab override của `useGraphAsset`, `graphAsset`, `graphJson`: không mất reference hoặc override.
- [ ] Test trên native Cocos Creator 3.8.8; CI chỉ dùng runtime mocks và không chứng nhận Inspector native.

## Tiếp theo

Phase 4.2c: chỉnh shared asset trực tiếp bằng graph editor có khóa / xác nhận ghi và native asset-db integration; đồng bộ chọn graph assets. Phase 4.3: Tube/Extrude/Profile/Mesh Deform, nhiều output và graph node profiling.

**Chỉ push nhánh `v2`; không tạo tag hoặc GitHub Release trước khi yêu cầu chốt.**

## Phase 4.2c0 — Nền tảng lưu Shared JsonAsset có kiểm tra xung đột (2026-11-25)

- [x] `readSharedGraphSnapshot(file, assetsRoot)`: đọc nội dung Graph đã kiểm tra, trả về bản JSON chuẩn và SHA-256 của **bytes nguồn**.
- [x] `saveSharedGraphIfUnchanged(file, assetsRoot, editedGraph, sha256)`: kiểm tra typed DAG/giới hạn 16 KiB trước khi ghi; chỉ ghi tệp .json nằm dưới Assets qua đường dẫn không symlink; từ chối khi checksum nguồn đã thay đổi.
- [x] Dùng tệp tạm mới (`wx`) và đổi tên cùng thư mục, xóa tệp tạm khi thất bại; no-op khi bytes nguồn đã bằng JSON chuẩn cần lưu. Lưu ý: phép kiểm tra SHA-256 và rename **không phải CAS nguyên tử** nếu một chương trình khác ghi ngay trong khoảng giữa hai thao tác.
- [x] Headless regression cho kiểm tra path, symlink, graph invalid, stale checksum và no-op, đăng ký trong CI.
- [ ] Cần tiếp: nối chức năng này vào Inspector với chế độ **Edit Shared (explicit)**; yêu cầu xác nhận ghi, resolve đường dẫn native asset qua asset-db, refresh/import asset-db khi save, xử lý phản hồi và conflict UI.
- [ ] Cần tiếp: kiểm thử trên Creator 3.8.8 (JSON asset reimport, Undo/Redo, đồng bộ nhiều renderer). **Chưa cho phép chỉnh trực tiếp shared asset từ canvas ở bước này.**

Không tạo tag hoặc release. Mọi thay đổi thuộc nhánh `v2`.
