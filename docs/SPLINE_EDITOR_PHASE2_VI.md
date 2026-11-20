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

## Phase 2.2a — Local/World + Move marked

Trong **SplineContainer Inspector → Batch Knot Tools**, có thêm:

- **Coordinate space**: `Local (Container)` mặc định hoặc `World (3D only)`.
- **Snap marked**: Snap theo tọa độ Local (mặc định) hoặc World, lưới gốc tọa độ là 0.
- **Align marked**: Căn trục X/Y/Z trong hệ đang chọn, mốc là Knot đầu tiên được mark theo thứ tự Hierarchy.
- **Move marked**: Nhập Delta X/Y/Z rồi bấm Move marked để dịch tất cả Knot được mark theo cùng một vector. Đây là thao tác số, chưa phải kéo nhóm bằng Gizmo.

World mode dùng `SplineContainer.node.worldMatrix`, tính đúng world position khi Container hoặc parent có rotation, translation và non-uniform scale. Kết quả được chuyển về Knot local position trước khi ghi bằng Scene Editor API. Transform suy biến (ma trận không thể đảo, ví dụ scale 0) sẽ bị từ chối, không thay đổi dữ liệu.

**XY2D / XZ2D**: chỉ dùng Local mode. Giao diện vô hiệu hóa World; Move không cho thay đổi trục ngoài mặt phẳng spline, tránh Knot trông có vị trí khác với curve evaluator.

API mới: `Editor.Message.request('cocos-splines','move-selected-knots',ids,{x:1,y:0,z:0},'local'|'world')`. Hai API trước thêm tham số space cuối: `snap-selected-knots(ids,step,space)`, `align-selected-knots(ids,axis,space)`. Không truyền space thì mặc định `local`, giữ tương thích.

### Acceptance và giới hạn

- Pure math tests: world → local → world với rotation và non-uniform scale.
- Batch tests: một snapshot, không snapshot khi no-op, rollback khi ghi lỗi.
- Không ghi khi selection không hợp lệ, world matrix suy biến hoặc thao tác làm lệch mặt phẳng 2D.
- Vẫn cần smoke test trong Cocos Creator 3.8.8: Scene Undo/Redo, prefab overrides, selection và preview 2D/3D.

## Phase 2.2b — Gizmos kéo nhiều Knot (đang thử nghiệm)

**Cách dùng trong Scene (spline 3D):**

1. Trong SplineContainer Inspector, Mark ít nhất 2 Knot thuộc **cùng một SplineContainer**.
2. Nhấn **Select in Scene**. Editor dùng thứ tự Knot trong Hierarchy (không phụ thuộc thứ tự click) để xác định Knot làm mốc.
3. Với Knot đầu tiên trong nhóm được chọn, Gizmos v3 hiển thị Move handle **group World position** ở vị trí World hiện tại của Knot. Kéo theo trục hoặc mặt phẳng để dịch cả nhóm.
4. Thả chuột (end) để gửi một yêu cầu Scene snapshot; nhấn Esc/Cancel để khôi phục toàn bộ vị trí trước khi kéo. Không làm dịch chuyển Knot không được chọn hoặc Knot từ spline khác.

Chức năng dùng **onGizmoHandles / onGizmoChanged** chính thức của Cocos-Gizmos v3. Chỉ có một group handle ở Knot đầu tiên nhằm tránh các handle nhóm trùng nhau. Vị trí Knot lưu ở Node transforms vốn có, **không** tạo thêm node, serialized field hoặc shim API Gizmos.

**Giới hạn:** World group drag chỉ có cho Space3D, không áp dụng XY2D/XZ2D. Khi Scene Editor không cung cấp `Editor.Selection.getSelected('node')`, group handle sẽ bị ẩn an toàn; Batch Move bằng số trong Inspector vẫn hoạt động.

Việc tạo yêu cầu snapshot khi kết thúc là biện pháp để ghi Undo transaction cho các Node đã đổi World position; `editorGroupWorldPosition`, `editorTangentIn/Out`, `editorWorldEuler` vẫn là property tính toán. **Native Undo/Redo, prefab overrides và việc Gizmos bắt chuột chính xác chưa được chứng minh trong Creator 3.8.8.**

**Smoke test Editor bắt buộc:** kéo 2–3 Knot (trên parent rotation + nonuniform scale), xác nhận Knot không chọn đứng yên, Esc khôi phục; thả rồi Ctrl+Z/Ctrl+Shift+Z; save/reopen Scene và Prefab; kiểm tra snap, tangent Move và Rotate handles; xác minh nhóm hai spline không thể kéo chung.

## Phase 2.3 — Surface Snap với MeshRenderer

Trong **SplineContainer Inspector → Batch Knot Tools**, mục **Surface Snap**:

1. Chọn SplineContainer 3D, đánh dấu ít nhất một Knot (tối đa 64 Knot).
2. Bấm **Refresh meshes** để lấy danh sách các MeshRenderer hợp lệ trong Scene; chọn mesh đích (ví dụ Ground hoặc Terrain Mesh).
3. Mesh nhập cần bật **Allow Data Access**; bước đầu chỉ hỗ trợ **single-submesh** có **RGB32F POSITION** (không dùng compressed vertices).
4. Nhập **Start above** (mặc định 10 đơn vị World): điểm bắt đầu ray tại Knot World Y + giá trị này. **Cast depth** (mặc định 100): chiều dài ray thẳng xuống theo -Y World tính từ điểm bắt đầu.
5. Nhấn **Snap to Surface**. Công cụ chọn giao điểm cao nhất bên dưới điểm bắt đầu, biến đổi World → spline local và sửa các Knot cùng một batch.

Không cần Collider/PhysicsSystem. Có hỗ trợ transform mesh gồm translation/rotation/non-uniform scale. Bề mặt dựng từ triangle mesh CPU; giới hạn **20.000 tam giác** mỗi mesh và **64 Knot** mỗi thao tác. Không sửa mesh nguồn hoặc các Node không đánh dấu.

**Fail closed**: nếu một Knot nằm ngoài footprint mesh, không tìm thấy giao điểm trong Cast depth, ma trận world suy biến, mesh không đọc được hoặc vượt giới hạn, toàn bộ thao tác bị hủy **trước khi ghi**. Nếu Scene `set-property` lỗi giữa chừng, editor cố gắng khôi phục các vị trí đã ghi. Chỉ tạo snapshot khi có Knot thay đổi.

Lựa chọn MeshRenderer ở ngoài spline đích (không cho snap lên mesh Road/Extrude thuộc chính spline đang chỉnh, vì sẽ tạo vòng lặp). Những bề mặt đứng gần thẳng đứng sẽ không cho giao điểm với ray World-Y nếu tam giác chiếu lên mặt phẳng XZ bị suy biến. **2D spline không hỗ trợ** chức năng này; Snap grid vẫn sử dụng được.

Editor messages:

- `Editor.Message.request('cocos-splines','list-surface-meshes')`
- `Editor.Message.request('cocos-splines','snap-selected-to-surface',ids,targetNodeUuid,startAbove,castDepth)`

**Cần test thủ công Cocos Creator 3.8.8:** asset import format, refresh danh sách MeshRenderer, parent transforms, Scene Undo/Redo, mesh có cạnh dốc và prefab overrides. CI Node chỉ chứng minh thuật toán và message contract, không chứng minh tương tác thật trong Scene.

## Phase 2.4 — Align Knot Up to Surface Normal (opt-in)

Trong **Surface Snap**, bật checkbox **Align Knot +Y to surface normal** nếu muốn Knot xoay theo mặt phẳng terrain. Mặc định **tắt**, nên các Scene dùng Snap cũ giữ nguyên rotation.

- Raycast tìm tam giác theo World -Y, trả thêm **pháp tuyến mặt tam giác theo World**; luôn chọn phía hướng lên (normal.Y dương) kể cả mesh bị đảo winding.
- Với Align bật, trục **+Y của Knot** sẽ được xoay về normal. Cố giữ hướng **+Z (forward)** trước khi xoay bằng cách chiếu forward hiện tại lên mặt phẳng tiếp xúc; nếu forward song song normal thì dùng local +X để chọn hướng ổn định.
- World-space orientation được đổi về **Knot local quaternion** so với rotation của SplineContainer, không ghi world quaternion vào property local.
- Mặt quá dốc (`normal.Y < 0.05`), normal không hợp lệ, quaternion không hợp lệ hoặc bất kỳ Knot nào không có giao điểm sẽ **từ chối toàn batch trước khi ghi**.
- Vị trí và rotation cùng dùng một Scene snapshot; nếu ghi lỗi giữa chừng, rollback cả hai loại property. Nếu chỉ rotation đổi (vị trí không đổi), vẫn ghi và snapshot. Không tạo snapshot cho no-op.
- **Quan trọng:** Nếu Knot bật `tangentsInKnotSpace` hoặc có child tangent-handle nodes, xoay Knot cũng có thể xoay tangent và thay hình dạng curve. Bật Align là quyết định thay đổi orientation có chủ đích; hãy thử trên Scene bản sao trước khi dùng cho road production.

API cũ được giữ nguyên khi bỏ qua tham số cuối:
`Editor.Message.request('cocos-splines','snap-selected-to-surface',ids,targetUuid,startAbove,castDepth,alignNormal)`.
`alignNormal` mặc định `false`.

Đã có Node regression tests cho pháp tuyến, mesh winding ngược, orientation với parent rotation, batch chỉ thay rotation, no-op và rollback khi `set-property('rotation')` thất bại. **Chưa chứng nhận native Cocos Creator 3.8.8 Undo/Redo, Gizmo mouse picking, prefab override hay terrain nhập thực tế.**

## Phase 2.5 — Smooth Surface Normals (preview)

Có thêm hai điều khiển trong **Surface Snap**:
- **Smooth normals on shared mesh vertices**: tắt theo mặc định. Chỉ bật được khi bật **Align Knot +Y to surface normal**.
- **Crease angle (°)**: mặc định **60°**, chấp nhận giá trị **0–89°**. Góc nhỏ giữ mép sắc; góc lớn làm mềm hơn các chỗ gấp nối giữa những tam giác.

Khi bật, hướng normal tại điểm raycast là kết quả **nội suy barycentric** từ normal các đỉnh. Normal mỗi đỉnh được tính trung bình **có trọng số diện tích tam giác**, chỉ cộng các face chung **chỉ số vertex** với face được hit và có góc lệch không vượt ngưỡng crease. Việc tính normal diễn ra trong World space **sau khi áp dụng worldMatrix** của MeshRenderer, nên vẫn đúng với mesh có rotation/scale không đồng đều.

**Giới hạn:** không tự hàn các vertex trùng vị trí nhưng khác chỉ số (UV seam, hard-normal split); để mượt qua những ranh giới đó, mesh phải có topology dùng chung đỉnh. Ở chỗ không tìm được normal ổn định hoặc mặt quá dốc, cả batch bị từ chối trước khi thay đổi Knot.

Đây chỉ là làm mượt **hướng quay** của Knot; **vị trí raycast không thay đổi**. Nếu không bật Align Normal, không tính hoặc áp dụng smooth normal. Bật Align Normal nhưng không bật Smooth thì vẫn dùng **flat triangle normal**, như Phase 2.4.

API có thêm hai tham số tùy chọn:
`snap-selected-to-surface(ids,targetUuid,startAbove,castDepth,alignNormal,smoothNormal,creaseAngle)`.
Các lời gọi cũ vẫn giữ nguyên kết quả; mặc định `alignNormal=false`, `smoothNormal=false`, `creaseAngle=60`.

Smoke test trong Creator: so sánh Knot rotation khi ở hai bên đường nối giữa tam giác phẳng và tam giác nghiêng, thử crease angle 0/60, bật/tắt smoothing, mesh có hard edge/UV split, và Undo/Redo. Native Editor Undo/Redo và prefab vẫn **chưa được xác minh trực tiếp**.

## Phase 2.6 — Collider/Terrain Surface Snap

**Surface Snap** trong **SplineContainer Inspector → Batch Knot Tools** nay hỗ trợ **hai loại target được chỉ định rõ ràng**: `mesh` (MeshRenderer) hoặc `collider` (Physics 3D Collider).

1. Thêm `BoxCollider`, `MeshCollider`, `TerrainCollider` hoặc Collider 3D phù hợp vào một Node **nằm ngoài SplineContainer**. Với Terrain, phải cấu hình terrain physics/collider trong project.
2. Đảm bảo hệ thống **3D Physics** của Cocos Creator đã bật và có thể raycast trong Scene Editor. Khi hệ thống vật lý không hoạt động, thao tác sẽ báo lỗi; không tạo collider ngầm.
3. Nhấn **Refresh meshes** (danh sách bao gồm cả MeshRenderer và Collider). Chọn hàng có nhãn **(collider)** rồi Snap to Surface. Trên cùng một Node có cả MeshRenderer lẫn Collider, có thể chọn từng hàng riêng.
4. Ray theo hướng -Y World, chỉ lấy **hit trên Collider được chỉ định**, ngay cả khi có Collider khác nằm phía trên. Các Knot phải tìm được hit hợp lệ; một Knot không có hit sẽ hủy cả batch.
5. **Align Knot +Y to surface normal** tiếp tục là tùy chọn mặc định tắt. Collider normal đến từ Physics raycast và sẽ bị kiểm tra (finite, hướng lên, không quá dốc) trước khi cập nhật rotation. Nếu Physics backend không trả normal, hãy tắt Align.
6. **Smooth normals on shared mesh vertices** chỉ áp dụng khi chọn **(mesh)**; UI tự tắt tính năng này khi chọn Collider. Không áp dụng thuật toán smoothing của MeshRenderer cho Collider vì không có topology tam giác cần thiết.

Khác với MeshRenderer CPU path, Collider path **không yêu cầu Allow Data Access**. Nó yêu cầu Collider 3D thực sự tham gia Physics world; shape được raycast là **collision shape**, có thể khác mesh hiển thị. Cocos Creator Physics backend/Scene Editor có thể trả kết quả khác nhau; cần test trong project thật.

**Thay đổi API trên nhánh v2:** `Editor.Message.request('cocos-splines','list-surface-targets')` thay thế `list-surface-meshes`; mỗi target chứa `kind:'mesh'|'collider'`. Lệnh Snap giữ tên `snap-selected-to-surface` và nhận thêm tham số cuối `targetKind` (mặc định `mesh`). Scene methods mới là `listSurfaceTargets` / `snapToSurfaceTarget`.

**Bắt buộc kiểm tra thủ công trong Creator 3.8.8:** 3D Physics enabled, TerrainCollider thực tế, backend hitNormal, Collider chồng nhau, Scene Undo/Redo, prefab overrides và Preview/Build; CI chỉ test logic adapter và message contract.
