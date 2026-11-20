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

## Phase 2.7 — Transaction và Undo/Redo Safety

Các thao tác **Snap to Grid**, **Align**, **Move marked** và **Surface Snap** (Mesh/Collider, có hoặc không Align Normal) nay đi qua bộ điều phối `SplineBatchEditTransaction`. Không thêm node, component hoặc serialized field mới.

Quy trình:

1. Tính trước mọi thay đổi (không ghi trực tiếp trong bước raycast/plan).
2. Dùng `queryKnotBatchState` để đọc vị trí/rotation từ chính Scene. Nếu giá trị đã thay đổi từ lúc tính plan, **dừng trước khi ghi** để tránh ghi đè dữ liệu người khác.
3. Ghi `position` và `rotation` theo thứ tự, `record:false`.
4. Đọc lại mọi Knot đã sửa. Nếu Scene không áp dụng một lệnh mà cũng không báo lỗi, hoặc dữ liệu sai với kế hoạch, **rollback theo thứ tự ngược**.
5. Chỉ khi toàn bộ vị trí/rotation đúng thì yêu cầu một native `scene/snapshot`. Nếu trả `false`, `{ok:false}` hoặc throw, rollback toàn bộ. Không đánh dấu thành công giả.
6. Nếu có một rollback không thành công, trả lỗi cụ thể để người dùng xử lý Scene trước khi thao tác tiếp.

So sánh rotation theo quaternion tương đương **q và -q**, tránh báo lỗi sai khi Cocos chuẩn hóa dấu. Có tolerance nhỏ để chấp nhận sai số float32.

**Điều chưa xác nhận**: native Undo/Redo thực sự có lưu/khôi phục đủ Node và Prefab override trong Cocos Creator 3.8.8, hoặc các Gizmos tương tác kéo tangent/group có dùng native transaction giống Inspector. Node mock chỉ chứng minh các lệnh được gọi và rollback, không mô phỏng Undo stack thực tế.

**Smoke test bắt buộc**: trước hết tạo Scene bản sao, Snap 3 Knot khác nhau, nhấn Ctrl/Cmd+Z rồi Ctrl/Cmd+Shift+Z. Lặp lại với Surface Snap + Align Normal, Knot trong Prefab, Scale/Rotation của parent, sau đó save/reopen Scene. Nếu Undo không khôi phục cùng một nhóm, gửi Console log và ảnh để điều chỉnh cơ chế snapshot theo phiên bản Creator thực tế.

## Phase 2.8 — Gesture transactions cho Knot / Tangent / Group Move

Các Gizmos hiện dùng một lớp Editor-only `SplineGizmoEditTransaction` để quản lý lifecycle `begin → update → end/cancel`:

- **Group Move 3D:** chọn ít nhất hai Knot cùng SplineContainer, kéo handle tại Knot đầu tiên theo thứ tự Hierarchy. Cancel/Esc khôi phục tất cả Knot cùng nhóm, không đụng Knot không chọn.
- **Knot Rotate:** chọn Knot, kéo Rotate ring. Cancel/Esc trả lại chính xác World rotation trước thao tác.
- **Tangent Move:** chọn Knot, kéo incoming/outgoing tangent. Cancel/Esc trả lại tangent đã serialize, TangentMode và vị trí handle-node cũ nếu có.
- **End:** so sánh dữ liệu hiện tại với baseline; nếu thực sự thay đổi, gọi một yêu cầu `scene/snapshot`. Không snapshot khi drag không tạo thay đổi hoặc callback End lặp.
- **Snapshot từ chối/thất bại:** khi dữ liệu vẫn là kết quả của thao tác vừa xong và chưa bắt đầu gesture mới, trả lại baseline, hiện cảnh báo trong Console. Nếu đã có gesture mới hoặc có thay đổi từ bên ngoài, chỉ cảnh báo, không ghi đè dữ liệu mới.

Lớp transaction chỉ sống trong Editor, không thêm trường serialize hoặc Node, không dùng callback Gizmos legacy, không thay đổi API `@registerGizmos`.

**Giới hạn quan trọng:** Cocos-Gizmos v3 còn có native control `onControlBegin/onControlEnd` song song với callbacks của drawer. Chưa xác minh Editor thực tế có bao nhiêu entry trong Undo history, và liệu prefab overrides có được khôi phục đủ hay không. Vì vậy **đừng coi đây là chứng nhận native Undo/Redo**.

### Smoke test với ZIP mới

1. Trong Scene bản sao, chọn 2–3 Knot của spline 3D, kéo Group Move theo X/Y/Z và mặt phẳng. Nhấn Esc giữa chừng: tất cả Knot cần trở lại vị trí cũ.
2. Kéo Group Move rồi thả: thử Ctrl+Z, Ctrl+Shift+Z. Kiểm tra số lần Undo cần thiết cho mỗi gesture, vị trí Knot không chọn và road preview.
3. Đổi Knot AutoSmooth → Broken bằng kéo tangent, thả rồi Undo/Redo. Thử lại với Cancel để xác minh TangentMode và tangent còn lại.
4. Rotate Knot, thử Cancel rồi Undo/Redo; thử dưới Container có parent rotation/nonuniform scale.
5. Save/reopen Scene hoặc Prefab Instance để kiểm tra serialized state và override. Nếu Undo/Redo không đúng, gửi ảnh Scene, console log và mô tả kết quả để sửa theo Editor thực tế.

## Phase 2.9 — Hủy Gizmo an toàn khi Scene thay đổi

Các gesture **Group Move / Rotate / Tangent Move** dùng thêm một bộ kiểm tra điều kiện trước, trong và sau khi kéo:

- Nếu đổi selection giữa khi kéo hoặc nhóm Knot trong một SplineContainer thay đổi, gesture bị **Cancel**, không gọi snapshot.
- Nếu Knot đang chỉnh bị disable/xóa, Knot bị đổi parent, spline bị disable/hủy hoặc tangent-handle Node đang chỉnh biến mất, gesture bị hủy và cố gắng hoàn nguyên dữ liệu có thể phục hồi.
- Với Group Move, chỉ khôi phục những Node **còn sống và còn thuộc parent ban đầu**; Node đã chuyển sang spline khác không bị ghi đè.
- Sau khi End, nếu snapshot bất đồng bộ trả lỗi mà Scene đã đổi / xuất hiện gesture mới, công cụ chỉ cảnh báo thay vì hoàn tác trạng thái mới.
- Các kiểm tra dùng callback `begin / update / end / cancel` cùng lượt vẽ Gizmos chính thức. Không thêm polling hoặc listener Editor riêng không có API đảm bảo.
- Thao tác no-op, cancel hoặc selection đổi giữa chừng không tạo snapshot.

**Test trong Creator 3.8.8:** mở Scene bản sao. Chọn 2–3 Knot và kéo Group Move; trong lúc kéo đổi selection, xóa/disable một Knot hoặc đổi parent của một Knot, rồi kiểm tra các Node còn lại không lệch và Console không có exception. Thử tương tự với tangent và rotation. Sau đó kiểm tra Undo/Redo, Prefab Instance overrides, save/reopen Scene.

**Giới hạn:** Editor thật có thể không gửi redraw/end callback sau một số kiểu xóa/đổi selection; plugin Cocos-Gizmos v3 cũng có lifecycle teardown riêng. Bộ test này kiểm tra các callback và kết quả khi chúng được gọi, **chưa chứng minh callback luôn xảy ra trong tất cả thao tác Editor**, cũng chưa xác minh native Undo/Redo hoặc Prefab serialization.

## Phase 2.10 — Group Move trực tiếp cho XY2D và XZ2D

**Cách dùng:**

1. Tạo **SplineContainer** với `dimension = XY2D` hoặc `XZ2D` và ít nhất hai Knot.
2. Vào **Batch Knot Tools**, đánh dấu từ hai Knot trở lên và nhấn **Select in Scene**.
3. Ở Knot đầu tiên theo thứ tự Hierarchy sẽ xuất hiện **Group Move**:
   - **XY2D:** handle **X/Y/XY**, dùng `Gizmos2D.move`; nếu không có `Gizmos2D` trong Scene, fallback là bộ 3D chỉ có X/Y/XY.
   - **XZ2D:** handle **X/Z/XZ**, lọc từ `Gizmos3D.move`; tuyệt đối không có Y/XY/YZ.
4. Khi kéo, tọa độ World do Gizmos trả được đổi về **SplineContainer local** bằng `inverseTransformPoint`. Delta sau đó chỉ có hai trục chủ động. **Z của XY2D và Y của XZ2D giữ nguyên giá trị gốc trên từng Knot**, kể cả các scene cũ có trục ẩn khác 0.
5. Thả để yêu cầu một Scene snapshot. Esc/Cancel hoặc thay đổi dimension/group selection giữa lúc kéo sẽ khôi phục nhóm về local baseline, không tạo snapshot.

**Parent transforms:** phép chuyển đổi sử dụng world transform của Container, không cộng World delta trực tiếp lên các Knot. Điều này hỗ trợ parent xoay, tịnh tiến và non-uniform scale, tránh đưa Knot ra khỏi mặt phẳng được spline evaluator sử dụng.

**Giới hạn UX:** Gizmos2D v3 thể hiện các trục X/Y trong World/View. Nếu parent của XY2D bị nghiêng ra khỏi World XY (hoặc parent của XZ2D bị nghiêng khỏi World XZ), thao tác sẽ được chiếu về mặt phẳng local nên chuyển động thực tế có thể không nằm chính xác dưới chuột. Đây là lựa chọn **giữ dữ liệu 2D đúng** thay vì cho Node chạy ra khỏi mặt phẳng; sẽ cần thử trực tiếp trong Editor trước khi chọn cách vẽ handle tùy biến theo local frame.

**Kiểm thử thủ công trong Cocos Creator 3.8.8:** kéo X/Y/XY (XY2D), X/Z/XZ (XZ2D), nhóm 2–3 Knot trên parent xoay 45° và scale không đều, kiểm tra các Knot không chọn, Esc, Undo/Redo, save/reopen Scene và prefab overrides.

Đây là **Group Move trong Scene**. Quy tắc **Local-only** của các nút Batch Snap/Align/Move bằng số trong Inspector đối với 2D **không thay đổi**. Native Editor Undo/Redo vẫn cần kiểm chứng thực tế.
