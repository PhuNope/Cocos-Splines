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

## Phase 4.2c1 — Chỉnh sửa shared JSON có xác nhận (preview, 2026-11-25)

Inspector Geometry Graph có thêm **Edit Shared Asset… → Save Shared JSON… / Discard Draft**. Tính năng này chỉ hoạt động khi `Use Graph Asset` bật và `graphAsset` là một JsonAsset thực nằm dưới `<project>/assets/`.

1. Chọn đúng **một** Node có SplineGeometryGraphRenderer đang bật và tham chiếu Shared JsonAsset.
2. Nhấn **Edit Shared Asset…**. Editor đọc UUID từ Scene, hỏi AssetDB `query-url` và `query-path` để xác định file gốc, kiểm tra file nằm dưới Project Assets, JSON typed DAG hợp lệ, không symlink, rồi tạo bản nháp trong UI kèm SHA-256.
3. Chỉnh tham số, nối node, thêm hoặc xóa Offset/Width trong Visual Graph. **Không có thao tác ghi file, Scene Undo, hoặc sửa `graphJson` local** trong lúc chỉnh bản nháp. Kéo layout/Auto Layout bị khóa vì layout thuộc renderer component, không thuộc shared asset.
4. Bấm **Save Shared JSON…**, đọc lại checksum từ disk và yêu cầu người dùng xác nhận bằng Dialog native (mặc định chọn Cancel). Nếu Source đã bị sửa, đổi selection, asset UUID hoặc đường dẫn, Save bị từ chối; bản nháp được giữ để đối chiếu.
5. Khi Save được xác nhận, Editor ghi file JSON qua temp file cùng thư mục với kiểm tra SHA-256, rồi `asset-db:refresh-asset` đúng URL. Nếu refresh lỗi thì file đã được lưu nhưng UI hiển thị `refreshPending`, yêu cầu refresh asset bằng Creator.
6. **Discard Draft** sẽ bỏ chỉnh sửa chưa lưu và đọc lại shared asset từ Scene. Chuyển sang asset khác hoặc đóng Inspector hủy bản nháp cũ.

**Hạn chế:** lưu Shared JsonAsset là thay đổi file bên ngoài Scene, **không thuộc Undo/Redo của Scene**, có thể ảnh hưởng tất cả renderer cùng tham chiếu. Không có khóa ghi độc quyền xuyên tiến trình, nên có thể xảy ra race giữa lần kiểm tra checksum cuối và rename nếu phần mềm bên ngoài ghi đúng lúc. Không ghi đè `.meta`, không tạo asset UUID hoặc importer mới. Do chưa chạy Creator native, cần kiểm tra `query-url`/`query-path`/`refresh-asset`, asset reimport/hot reload, lưu Scene/Prefab và tất cả renderer đang tham chiếu trong Cocos Creator **3.8.8**.

- [x] Edit/Save/Discard draft UI, native confirmation, checksum conflict preflight, AssetDB URL/path verification và refresh.
- [x] Mock regression cho save/cancel/conflict/selection/asset switch/refresh error, giữ component local.
- [ ] Native 3.8.8 acceptance: hot reload shared JsonAsset, mọi renderer, mô phỏng scene switch lúc dialog mở, prefab overrides, custom path Unicode/Windows.
- [ ] Phase 4.2c2: cải thiện UX xung đột và bố cục graph; Phase 4.3: node Tube/Extrude/Profile/Deform, multi-output, profiling.

Chỉ push `v2`; không tạo tag hoặc release cho đến khi được yêu cầu.

## Phase 4.2c2 — Review / Rebase Shared Graph conflicts (2026-11-25, preview)

Khi đang **Edit Shared Asset…**, có hai nút mới:

- **Compare with Source**: đọc lại file JSON bằng AssetDB UUID mapping và SHA-256 trong extension process, không động vào bản nháp. Hiển thị danh sách những thay đổi **trên bản nháp** so với lúc mở, những thay đổi **trên source** so với lúc mở, trường xung đột và trạng thái cấu trúc.
- **Rebase Safe Changes**: chỉ sáng nếu source thực sự đổi checksum, cùng topology (cùng node IDs, type, input connections và output), không có tham số bị sửa thành **hai giá trị khác nhau**. Lấy Graph mới nhất làm nền rồi chép các thay đổi tham số từ draft; giữ nguyên dữ liệu source còn lại. Đây chỉ là bản nháp mới, **vẫn phải bấm Save Shared JSON và xác nhận** để ghi file.

Nếu thay đổi topology hoặc cùng tham số nhưng khác giá trị, rebase bị khóa. Bản nháp vẫn giữ nguyên để người dùng tự so sánh, chỉnh lại hoặc Discard Draft (có chủ ý). Save nhận `{conflict:true}` khi checksum nguồn đã thay đổi và đưa hướng dẫn Compare; **không có nút Force Overwrite**. Cả Compare và Rebase đều không ghi file, Scene property hay snapshot. Sau Rebase, Save vẫn kiểm tra lại UUID/selection/path/sha trước khi ghi.

Regression headless bao phủ param khác nhau/giống nhau, xung đột cùng trường, thay đổi topology, draft/Scene immutability, quá trình Save → Compare → Rebase → Save và Discard. Kiểm thử native trong Cocos Creator 3.8.8 vẫn là mục mở, đặc biệt reimport đúng JsonAsset sau khi cập nhật và đồng bộ nhiều renderer.

- [x] So sánh 3-way theo field/node và nhận diện thay đổi topology.
- [x] Chỉ tự rebase thay đổi param tương thích; không tự động merge topology.
- [x] Giữ nguyên draft trên conflict; no-op khi so sánh; không ghi Scene/Asset khi Rebase.
- [x] Đăng ký CI regression cho Pure Model và Inspector.
- [ ] Native Editor 3.8.8 acceptance và UX xử lý xung đột topology phức tạp.
- [ ] Phase 4.3: Tube, Extrude/Profile, Mesh Deform, Multi-output và profiling.

Không gắn tag hoặc tạo release, chỉ cập nhật nhánh `v2`.
