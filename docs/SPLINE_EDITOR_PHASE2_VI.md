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

## Phase 2.11 — Gizmo axes theo đúng hệ local của Container

Phase này thay thế giới hạn hiển thị trục World khi Container nghiêng của Phase 2.10.

**Cài đặt theo thứ tự:**

1. Cài và bật **Cocos-Gizmos v3 development build** có `Gizmos3D.supportsMoveFrameNode===true` (mã nguồn trên nhánh v3 của Cocos-Gizmos).
2. Cài **Cocos Splines v2 preview** build tương ứng. Bật cả hai extension, đợi Creator import script hoàn tất rồi mở lại Scene View.
3. Chọn SplineContainer, dimension **XY2D** hoặc **XZ2D**, đánh dấu ít nhất hai Knot, nhấn **Select in Scene**.
4. Kéo Group Move tại Knot đầu tiên: **X/Y/XY** trong XY2D, **X/Z/XZ** trong XZ2D. Các handle thực sự nằm theo trục **local của SplineContainer** (không còn mặc định nằm theo World).
5. Thử xoay Container 30–60° quanh các trục, kết hợp scale khác nhau trên X/Y/Z, và so sánh hướng mũi tên với hệ trục local của Container.

**Thiết kế:** Gizmos v3 nhận `frameNode: spline.node` trong các descriptor Move; giá trị `editorGroupLocalPosition` là local Vec3 của Node Knot. Vẽ, picking và drag solver chuyển qua cùng một reference frame, không thêm Node proxy hoặc xoay Knot để sửa hướng handle. Cổng setter giữ nguyên trục ẩn; Group Move vẫn lấy baseline của từng Knot để tránh cộng delta lặp. Cancel và snapshot failure hoàn nguyên local position nhóm.

**Tương thích:** bản Gizmos v3.0.3 thông thường không có API reference-frame. Khi thiếu, chỉ ẩn Group Move 2D và đưa cảnh báo ở Console; 3D Group Move và Tangent/Rotate không bị đổi. Để thử Phase 2.11, phải dùng **đúng bản Gizmos v3 preview mới**.

**Acceptance Creator 3.8.8:** kéo 2–3 Knot với Container có rotation+nonuniform scale; kiểm tra arrow và ô plane nằm trên mặt phẳng local; Esc hoàn nguyên; Undo/Redo đúng một gesture; save/reopen Scene và Prefab Instance; Knot có rotation riêng khác Container; chuyển selection hoặc dimension khi đang kéo. CI chỉ kiểm tra math/descriptor/adapter bằng test mock, chưa chứng minh hoạt động native Scene View.

## Phase 2.12 — Group Undo và Prefab Instance Overrides

**Thay đổi kiến trúc:** các Group Move Gizmos ở cả 3D/XY2D/XZ2D dùng `history:'external'`. Cocos-Gizmos v3 vẫn điều khiển drag trực tiếp và gọi callback `begin/update/end/cancel`, nhưng không gửi các callback history mặc định của `SelectGizmo` cho handle này. Splines tự quản lý history **một lần** khi End:

1. Capture vị trí local của toàn bộ Knot được đánh dấu khi bắt đầu drag; trong lúc kéo Node vẫn được cập nhật tức thì.
2. Khi End, xác minh mọi Node còn sống, vẫn thuộc Container cũ và vị trí hiện tại khớp bản plan.
3. Chỉ với Knot có thay đổi, ghi **property serialize** của Node bằng `scene:set-property` với `{uuid: knot.node.uuid, path:'position', dump:{type:'cc.Vec3',value:{x,y,z}}, record:false}`.
4. Chỉ sau khi *toàn bộ* các lệnh cập nhật thành công, yêu cầu **một** `scene:snapshot`. Không tạo snapshot khi no-op/Cancel.
5. Nếu một lệnh ghi hoặc snapshot bị từ chối, rollback từng Node đã chạm theo thứ tự ngược bằng đường Scene property message; nếu Node bị chuyển parent hoặc có thay đổi mới, không ghi đè tùy tiện.

**Prefab:** dùng chính đường property của Editor thay vì sửa cấu trúc nội bộ `__prefab`. Mục tiêu là để Prefab Instance ghi nhận thay đổi vị trí ở lớp override; **không có thao tác Apply to Prefab hoặc Revert tự động**. Chưa có bằng chứng rằng tất cả trường hợp Prefab nested, root transform, Undo/Redo và save/reopen hoạt động đúng trong Editor thật, nên phải kiểm tra.

**Cài đặt:** bản Cocos-Gizmos v3 preview cùng đợt với Splines này, phải có `Gizmos3D.supportsExternalHistory===true`. Bản Gizmos cũ chỉ có `supportsMoveFrameNode` hoặc chỉ v3.0.3 sẽ **ẩn Group Move** cho an toàn (các handle cá nhân vẫn hiển thị).

**Bài test thủ công trong Cocos Creator 3.8.8:**

- Tạo một Prefab gồm SplineContainer và 3 Knot, kéo vào Scene tạo Prefab Instance. Chọn 2 Knot và Group Move. Trong Inspector kiểm tra `position` của đúng 2 Knot được đánh dấu override; Knot thứ ba không thay đổi.
- Nhấn Ctrl/Cmd+Z **một lần**: cả nhóm phải về vị trí ban đầu. Ctrl/Cmd+Shift+Z: cả nhóm phải quay lại. Không xuất hiện bước Undo “rỗng” cho computed property.
- Save Scene, đóng và mở lại; xác minh vị trí/override đúng. Kiểm tra **Revert** Prefab Instance thủ công và xem có trở về Prefab Asset hay không.
- Lặp lại ở XY2D/XZ2D với Container xoay/scale không đều. Kiểm tra hidden axis, Esc, no-op, đổi selection trong lúc kéo và Nested Prefab.
- Kiểm tra log Console khi một lệnh Scene property bị từ chối, không được có một nửa nhóm ở vị trí mới.

**Giới hạn:** CI kiểm thử các message được gửi và rollback trên Node giả lập, không mô phỏng native Undo stack, Inspector override state hay Apply/Revert Prefab. Rotate/Tangent individual history chưa chuyển sang commit serialize đầy đủ ở phase này.

## Phase 2.13 — Tangent/Rotate serialized history

Phase này hoàn thiện cơ chế history của **Knot đơn lẻ** để cùng mô hình với Group Move. Các handle Move/Rotate dùng `history:'external'` trong Cocos-Gizmos V3 và được điều phối bởi `SplineGizmoEditTransaction`.

**Tangent Move:**
- Khi người dùng kéo tangent của Knot ở `AutoSmooth`, setter materialize trạng thái `Broken`. Một commit có thể thay đổi đồng thời `mode`, `tangentIn`, `tangentOut` và vị trí Node handle (nếu có).
- Editor đọc `query-node` để tìm đúng component index, rồi gửi `scene:set-property` đến `__comps__.<index>.mode/tangentIn/tangentOut`, với `record:false`. Node handle (nếu có) được cập nhật bằng `path:'position'` trên UUID thật.
- Nếu Handle/parent thay đổi giữa chừng, quá trình từ chối ghi; nếu một lệnh ghi lỗi, những thuộc tính đã thay đổi được rollback theo thứ tự ngược.

**Knot Rotate:**
- Gizmo cho phép xoay theo World Euler trong Scene, nhưng lịch sử serialize được ghi bằng `Node.rotation` **quaternion local** để tôn trọng transform của parent.
- So sánh quaternion nhận `q` và `-q` là cùng hướng, tránh snapshot không cần thiết.

**Snapshot:** chỉ yêu cầu một `scene:snapshot` sau toàn bộ các lệnh serialize thành công; no-op/Cancel không snapshot. Bản Cocos-Gizmos v3 preview phải có `Gizmos3D.supportsExternalHistory===true`. Nếu thiếu, các computed Knot handles sẽ ẩn thay vì gây Undo trùng.

**Bài test trong Creator 3.8.8:**

1. Tạo Knot đang AutoSmooth, kéo Tangent Out rồi thả. Xác minh mode thành Broken; Undo đúng **một lần** trả về AutoSmooth và hai tangent gốc; Redo khôi phục Broken.
2. Thử với `tangentInHandle/tangentOutHandle` là Node con thật. Kéo handle và kiểm tra Undo/Redo, save/reopen Scene và Prefab Instance override cho **Node.position**.
3. Xoay Knot khi SplineContainer và parent đã xoay/scale. Undo đúng một lần trả Node về quaternion local cũ; kiểm tra không phát sinh rotation drift.
4. Với Prefab Instance, xem override của `mode`, vector tangent, handle Node position và Node rotation. Test Revert và Nested Prefab thủ công.
5. Dùng Esc, thao tác no-op, disable/xóa handle trong drag để kiểm tra không tạo Undo rỗng, không crash.

**Giới hạn:** CI chỉ kiểm thử property paths, một yêu cầu snapshot và rollback trên Scene mock, không chứng minh Creator 3.8.8 native Undo stack hoặc Prefab override đã hoạt động đúng. Các hook native và timing Editor khác nhau giữa bản 3.8.x; gửi log nếu gặp lỗi trong dự án thật.

## Phase 2.14 — Giao dịch Gizmos bất đồng bộ và Undo/Redo preview sync

**Vấn đề:** Phase 2.12–2.13 đã ghi trực tiếp serialized properties qua `scene:set-property`, sau đó một `scene:snapshot`. Các lệnh Scene IPC có thể hoàn thành **sau khi thả chuột**. Trong khoảng đó, một Knot Gizmo khác của cùng spline nếu bắt đầu kéo có thể làm hai snapshot/rollback xen vào nhau.

**Giải pháp:** `SplineGizmoHistoryGate` dùng WeakMap theo Node của SplineContainer:

- `begin`: chiếm khóa trước khi native Gizmo bắt đầu ghi getter/setter editor-only; nếu bận thì từ chối gesture. Không thêm Undo entry cho thao tác bị từ chối.
- Trong lúc đang kéo, Knot đang chỉnh vẫn hiển thị handle và cập nhật realtime.
- Sau `end` có thay đổi, khóa giữ nguyên đến khi lệnh set-property + snapshot **thành công hoặc rollback hoàn tất**. Trước thời điểm đó, các handle của Knot trong cùng spline sẽ tạm ẩn.
- `cancel`, `no-op`, invalid selection và lỗi bắt đầu: giải phóng khóa ngay.
- Những spline khác không bị khóa. Không đăng ký Editor listener không được API hỗ trợ.
- Khi khóa được giải phóng, gọi `refresh()` cho **SplineContainer gốc**, không theo parent mới của Knot. Road/Extrude/MeshDeform đã kiểm tra revision trong `update()`, nên khi Editor khôi phục Knot qua Undo/Redo, các component này có thể tái dựng preview khi tick tiếp theo xảy ra.

**Test thủ công trong Cocos Creator 3.8.8:**

1. Tạo 2 Knot cùng Spline và 1 Knot thuộc SplineContainer khác. Kéo Group Move hoặc Tangent, thả rồi thử kéo Knot khác ngay sau đó. Không được có hai history commits chồng nhau; với Scene lớn, handle có thể ẩn ngắn trong lúc chờ IPC.
2. Cancel và no-op phải cho thao tác mới ngay lập tức, không tạo Undo entry.
3. Undo/Redo liên tục sau khi thả; kiểm tra Road, Extrude, MeshDeform rebuild đúng theo Knot mới mà không phải bấm Refresh.
4. Thử Parent/Prefab Instance, Nested Prefab và save/reopen Scene. Xác minh một Undo cho một gesture và override không mất.
5. Khi Scene snapshot lỗi, kiểm tra Console warning, vị trí/rotation/tangent rollback và việc Gizmos hoạt động lại sau lỗi.

**Chưa xác minh:** giao tiếp native Editor Undo/Redo, Prefab apply/revert và việc Editor luôn tick `update()` trong mọi tình huống. CI chỉ chứng minh khóa, đúng thứ tự lệnh và revision invalidation; không mô phỏng Undo stack native.

## Phase 2.15 — Scene Lease và giao dịch Gizmos bị gián đoạn

**Mục tiêu:** ngăn thao tác Editor bất đồng bộ của Scene *cũ* ghi vào Scene *mới*. `SplineGizmoSceneLease` ghi lại **tham chiếu Node thật** của SplineContainer, Prefab ancestors và Scene root lúc `begin`. Lease không dựa riêng vào UUID (Scene mới có thể tạo object khác với cùng UUID), không truy cập `__prefab` và không đăng ký các event Editor không chính thức.

**Quy tắc vận hành:**

1. Trước drag, chụp lease. Nếu parent/ancestor thay đổi hoặc một Node trong chuỗi bị vô hiệu hóa, `valid()` trả false, giao dịch hủy.
2. Tại `end`, các writer Group/Tangent/Rotate tiếp tục kiểm tra lease trước/sau `query-node`, `set-property` và `snapshot`. Không gửi snapshot khi phát hiện lease mất hiệu lực trước bước snapshot.
3. Nếu Scene unload trong lúc một Editor IPC đang chờ, sau khi IPC trả về writer nhận ra lease stale và **không phát thêm lệnh ghi/rollback** vào Scene mới.
4. Cancel không đụng transform các Node đã thuộc Scene unload. History Gate chỉ nhả khi thao tác bất đồng bộ hoàn tất để tránh 2 gesture chồng nhau.
5. Trong Scene còn hợp lệ, các lệnh serialize và single snapshot hoạt động như Phase 2.12–2.14.

**Smoke test với dự án mẫu riêng (Creator 3.8.8):**

- Chỉnh Group Move trên một Scene có nhiều Knot, đổi Scene khi còn giữ chuột hoặc ngay sau khi thả; không được xuất hiện các thay đổi bất ngờ ở Scene mới.
- Thử Tangent AutoSmooth→Broken và Rotate rồi mở Scene khác trong lúc Editor xử lý. Kiểm tra Console có cảnh báo giao dịch stale thay vì ghi tiếp.
- Thử Prefab Instance và Nested Prefab editing mode, đóng editing root giữa lúc thao tác; không được áp override sang một đối tượng khác.
- Trở lại Scene ban đầu rồi thử kéo lại, Undo/Redo và save/reopen. Kiểm tra Road/Extrude/Deform tiếp tục theo dữ liệu Knot thật.

**Giới hạn kỹ thuật:** Cocos Editor IPC đã gửi không có khả năng cancel được xác nhận, nên chức năng này không thể đảm bảo một request *đang bay* sẽ không được xử lý khi Scene đổi. Nó ngăn **các request tiếp theo** và tránh rollback sai Scene. Native Undo stack, Prefab apply/revert, unload/reload timing và Editor UI lifecycle vẫn phải test thực tế.

## Phase 2.16 — Distribute Marked Knots

Trong SplineContainer Inspector → Batch Knot Tools, đánh dấu ít nhất 3 Knot, chọn Coordinate space và Axis rồi bấm **Distribute marked**. Khoảng cách tọa độ trên trục được chọn được chia đều giữa hai Knot cực trị; thứ tự không gian trên trục được giữ (tọa độ trùng nhau dùng thứ tự Hierarchy). Hai đầu, các tọa độ khác trong hệ đã chọn, Knot không đánh dấu và thứ tự Hierarchy không đổi. Local hỗ trợ 3D/XY2D/XZ2D; World chỉ hỗ trợ 3D, kể cả Container xoay hoặc scale không đều. Thao tác có thể đổi hình dạng đường cong, không phải chia đều chiều dài cung Bezier. Dùng transaction batch hiện có, một yêu cầu snapshot nếu có thay đổi, không snapshot khi no-op, rollback khi ghi lỗi. Native Undo/Redo và Prefab vẫn cần kiểm tra trong Creator 3.8.8. Không cần nâng cấp Gizmos.
