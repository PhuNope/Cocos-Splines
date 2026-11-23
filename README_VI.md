# Cocos Splines — Hướng dẫn nhanh

Plugin spline cho **Cocos Creator >= 3.8.2**, chỉnh trực tiếp trong Inspector, không cần panel riêng.

## Cài đặt

Đặt thư mục plugin tại `<project>/extensions/cocos-splines`, bật extension trong Extension Manager rồi để Asset DB import các TypeScript component.

## Các nhóm tính năng

- **Spline:** SplineContainer, SplineKnot, Normalized Distance / Distance / Spline t.
- **Di chuyển:** SplineAnimate, SplineJunction, SplineTrigger, SplinePositioner, SplineProjector, SplineLengthMonitor.
- **Tạo mesh:** SplineRoad, SplineExtrude, SplineMeshDeform, Spline2DPath, SplineJunctionMesh.
- **Nâng cao:** SplineInstantiate, SplineObjectController, SplineModifiers, SplineObjectBender, SplineMorph.

### Spline Offset khi chuyển Junction

`SplineAnimate.splineOffset = (1, 0, 0)` dịch object theo trục phải của spline *đang hoạt động*, không phải trục X cố định của thế giới. Nếu hướng hai spline khác nhau, offset mới có thể nằm ở vị trí world khác dù hai đường tâm chung một điểm nối.

Sử dụng `junctionOffsetBlendDistance` (mặc định **1 unit**) để giữ vị trí thế giới ở thời điểm nối rồi chuyển mượt sang offset spline mới trong khoảng quãng đường đã chọn. Đặt `0` để tắt chuyển tiếp. Tùy chọn `constantSpeedWithOffset = true` giúp bù vận tốc theo chiều dài quỹ đạo thực. Các kết nối Junction nên được đặt cùng world position.

### Spline Network — Shortest Route + Connector Check (v2 preview)

SplineAnimate nay có Junction Mode = Shortest Route, Route Destination, Route Destination Progress và giới hạn Max World Gap. Route planner có xét hướng di chuyển, đi qua nhiều Junction, hỗ trợ spline đóng và không sửa scene/mesh. Xem [hướng dẫn Network](docs/SPLINE_NETWORK_V2_VI.md). Editor có Check Connectors, Snap Target Endpoint, và Align Tangent G1/C1 cho Knot đích ở Broken mode. Tangent handle node, Knot Rotation, World scale và Reversed được hỗ trợ; một Scene snapshot khi thành công, rollback khi lỗi. Đã hỗ trợ On Route Arrived, Stop On Route Arrival (mặc định tắt) và LRU Route Cache có tự invalidation theo revision/transform/Connections; đã có World-distance Route Cost Space tùy chọn (Local mặc định), có chẩn đoán tuyến reachable/unreachable/invalid, FIFO queue theo Junction exit (Max Followers) và Reroute Around Traffic opt-in; có thêm Headway World Gap/Brake Distance opt-in trên cùng spline (throttle bước di chuyển trong World, kể cả spline đóng/chạy ngược); có Traffic Signal Green/Yellow/Red theo exit, Traffic Priority 0–10, signal-aware reroute và SplineTrafficController opt-in với Green/Yellow/All-Red tự động cùng conflict pairs thủ công; đã có Adaptive Traffic theo số follower đang chờ (mặc định tắt), min/max Green và ưu tiên pha chờ lâu; có Check 3D Conflict Candidates (chỉ cảnh báo, không tự sửa Conflicts) và Headway Lane ID 0–31 theo spline/làn logic; có opt-in Physical Lane Placement (Lane Count/Width) và swept-sphere 3D Proximity Avoidance giữa các follower opt-in, kể cả khác spline; đã có sparse 3D spatial-hash broadphase cho Proximity Avoidance và getSplineTrafficTelemetry() để đọc thống kê Junction/Headway/Proximity runtime; có opt-in Collider.worldBounds-derived bounding sphere cho proximity và World asphalt half-width theo exit cho conflict warnings; chưa có shape-aware Collider/Mesh solver hoặc multiplayer authority.

## Bộ tài liệu HTML

Mở [`docs/index.html`](docs/index.html) để xem hướng dẫn Inspector, các trang API và ví dụ TypeScript. Tài liệu có phần chi tiết về Animate, Junction, Morph, Mesh Deform và các công cụ khác.

## Giới hạn

`package.json` khai báo hỗ trợ Editor từ **3.8.2**; các bài kiểm thử hiện chạy với TypeScript/mock runtime, chưa xác nhận trực tiếp mọi phiên bản 3.8.x. ObjectBender chỉ uốn static mesh đọc được, Junction Mesh là patch XZ chứ chưa hàn road thành mesh kín. Collider và Particle để phát triển sau.

### Gizmos của mesh &amp; Morph Space

- Chọn `SplineRoad`, `SplineExtrude`, `SplineMeshDeform`, `SplineJunctionMesh` hoặc `SplineObjectBender` để xem wireframe khi cài thêm Cocos-Gizmos. Dùng `Show Mesh Gizmos` và `Gizmo Edge Limit` trong Inspector.
- `SplineMorph.space` hỗ trợ `World` (mặc định, giữ tương thích) và `Local` (trộn knot/tangent local không cộng transform của source).
- `Junction Offset Blend Distance > 1` là quãng đường chuyển tiếp theo units, không phải tỷ lệ.


### Spawn prefab trong Scene (0.9.5)
`SplineInstantiate` và `SplineObjectController` có nút **Spawn**, **Respawn**, **Clear Spawned**, cùng **Spawn On Start**. Prefab đã Spawn và lưu trong Scene không bị spawn trùng khi Play. ObjectBender có **KeepHierarchy** hoặc **SequentialMeshes** với **Part Gap**. Xem `docs/pages/objects.html` và `docs/pages/bender.html`.

### Đường ray lặp theo chiều dài mesh (0.9.6)

Với FBX có sẵn UV atlas như ray/tà vẹt: `SplineMeshDeform` → `Mode = Repeat` → **`Repeat Layout = Source Length`** → `Tile Length = 0` (tự đo từ Source Mesh) → **`UV Mode = KeepOriginal`**. Mesh được đặt theo kích thước nhập từ asset, các đoạn đầy đủ không bị kéo giãn; đoạn cuối cắt theo chiều dài còn lại, nội suy UV và normal.

Nếu model import sai tỷ lệ, nhập `Tile Length` dương theo *world units*; không cần xác định số bản sao. Nếu sử dụng source `Tracks.FBX` mẫu, hình học FBX thô có trục X dài hơn Z: thử `Axis = X` nếu Cocos không hoán đổi trục khi import. `ContinuousRepeat` và `Distance` chỉ dành cho texture được unwrap để tile; chúng có thể phá hủy atlas UV nhiều vùng. Đối với builtin-standard, tắt thử Occlusion/Emissive Map khi kiểm tra lỗi albedo. Xem `docs/pages/deform.html`.

### SplineModifiers Gizmos & examples

Select SplineModifiers with Cocos-Gizmos installed to preview cyan Offset trajectories, green Width multipliers, key markers colored by Speed, and optional Scale/Roll axes. The gizmo guides do not alter a mesh or move knots. See [`docs/pages/length-modifiers.html`](docs/pages/length-modifiers.html) for Inspector, API and worked examples (vehicle slowdowns, road widening, lane changes and object scaling).

### Road UV cho texture đường nằm ngang (0.9.8)

Trong `SplineRoad` chọn **UV Direction = Length Along U** nếu ảnh đường chạy ngang, hoặc **Length Along V** (mặc định) nếu ảnh chạy dọc. `UV Meters Per Repeat` điều khiển số units trên một lần lặp theo chiều dài spline; `UV Width Tiles` điều khiển số tile theo ngang đường. Có thể lật chiều và chỉnh `UV Offset U/V`. Texture nên đặt **Wrap Repeat** theo trục lặp. Xem `docs/pages/road.html`.

### Đường cong dốc 3D (v0.9.9)
Road, Extrude, MeshDeform và ObjectBender đã dùng frame liên tục để tránh xoắn/lật tiết diện tại tiếp tuyến gần thẳng đứng. Road sẽ cảnh báo nếu cua quá gắt gây chồng mép trong. JunctionMesh vẫn là surface patch cho các nhánh gần đồng phẳng, không hàn các mesh 3D. Xem `docs/pages/road.html` và `docs/pages/extrude.html`.

### Road cua gấp (v0.9.10)

Trong `SplineRoad` → **Sharp Corners**, đặt `Corner Mode = Join And Trim` để nối miter ở mép ngoài và thu gọn mép trong khi cua quá hẹp. `Corner Trim Safety = 0.93` là điểm bắt đầu tốt. Khi OFF/Legacy, mesh giữ nguyên như bản cũ. Chế độ này không phải Boolean union: cua chữ U rất gắt và đường tự cắt vẫn nên chỉnh spline hoặc xây giao lộ riêng. Xem `docs/pages/road.html`.

### Junction Mesh nối UV của Road (v0.9.12)

Trong `SplineJunctionMesh` chọn **UV Mode = Road Matched**, đặt **UV Blend Start = 0.55**, gán **cùng một Material** cho tất cả `SplineRoad` và Junction Mesh. Texture cần **Wrap U/V = Repeat**. Mesh patch lấy đúng vị trí và UV0 ở biên asphalt Road đã dựng, hỗ trợ UV Length Along U/V, đảo chiều, offset, Width Tiles và Width Modifiers. Tâm giao lộ dùng nội suy UV, nên các vạch kẻ làn phức tạp vẫn có thể bị méo ở khu vực này. `World Projected` là mặc định cũ. Xem `docs/pages/junction-mesh.html`.

## Phase 2.23 — Simplify metadata copy (preview)

Bản sao Simplified giữ cấu hình hiển thị Gizmos của SplineContainer (hiện đường cong, tangents, màu và mật độ đường vẽ), ngoài tên/rotation/tension của các Knot còn lại. Chỉ các trường dữ liệu đơn giản trong allowlist mới được serialize; **không** clone các component tùy ý, không chuyển node references từ Prefab nguồn. Kết quả báo số component và node con không được sao chép để tránh bỏ sót dữ liệu. Vẫn phải test Undo/Redo và Prefab overrides trên Cocos Creator 3.8.8 thật.

## Phase 2.11 — Group Move theo local của SplineContainer

Group Move của Knot trong XY2D và XZ2D giờ vẽ và kéo trục theo **transform local thực sự của SplineContainer**, kể cả khi Container bị xoay hoặc có scale không đều. XY2D có trục X/Y và ô XY; XZ2D có trục X/Z và ô XZ. Trục local bị khóa của từng Knot được giữ nguyên.

**Yêu cầu:** Cài bản **Cocos-Gizmos v3 development preview** có `Gizmos3D.supportsMoveFrameNode` **trước khi** cập nhật Cocos Splines V2. Bản Cocos-Gizmos v3.0.3 thông thường chưa có API này; nếu sử dụng nó, Group Move 2D sẽ ẩn an toàn, các thao tác 3D/Tangent/Rotate vẫn hoạt động. Đây không phải bản Release. Hướng dẫn kiểm tra trong [tài liệu Phase 2](docs/SPLINE_EDITOR_PHASE2_VI.md).

## Phase 2.12 — Undo Group Move / Prefab Instance (preview)

Group Move 3D, XY2D, XZ2D hiện có **một chủ sở hữu Undo**: Gizmos dùng `history:'external'` để không ghi thêm native history của getter/editor-only; Splines cập nhật **Node.position** thật qua `scene:set-property` với `record:false`, rồi yêu cầu **một snapshot** sau khi cả nhóm được ghi thành công. Nếu ghi một Knot thất bại, có rollback dữ liệu đã ghi qua Scene API. Khi thay đổi không có tác dụng, không tạo snapshot.

Bắt buộc cài **Cocos-Gizmos v3 preview mới** có cả `supportsMoveFrameNode` và `supportsExternalHistory`, sau đó mới cài Cocos Splines V2. Chưa thể khẳng định Undo/Redo và Prefab overrides đã đúng 100% trước khi test trực tiếp trong Cocos Creator 3.8.8.

## Phase 2.13 — Tangent / Rotate có serialized history

Kéo tangent của Knot (AutoSmooth → Broken) giờ ghi `mode`, `tangentIn/out` thật qua Scene Editor; nếu có Node làm tangent handle, thay đổi vị trí handle cũng được ghi `Node.position`. Xoay Knot dùng `Node.rotation` dạng quaternion local, không cố serialize getter World Euler. Mỗi gesture đã chỉnh có một yêu cầu snapshot, no-op/Cancel không tạo snapshot, lỗi ghi sẽ rollback theo thứ tự ngược.

Cần **Cocos-Gizmos V3 preview mới** có `supportsExternalHistory`, tương tự Phase 2.12. Với bản Gizmos cũ, các handle editor-only unsupported sẽ ẩn thay vì tạo lịch sử Undo sai. CI đã kiểm thử contract, nhưng native Undo/Redo và Prefab overrides vẫn chờ test Creator 3.8.8 thực tế.

## Phase 2.14 — Chặn transaction Gizmos chồng nhau

Group Move, Tangent Move và Knot Rotate của các Knot **cùng một SplineContainer** nay có chung một khóa lịch sử Editor. Khi Knot A đã thả chuột nhưng Scene Editor vẫn đang ghi serialized properties / chờ snapshot / rollback, Knot B không thể bắt đầu một thao tác mới; các handle tạm ẩn để tránh xung đột. Khóa nhả sau khi tác vụ ghi hoặc rollback hoàn tất. SplineContainer khác vẫn hoạt động độc lập.

Cache của spline gốc được invalidated sau commit hoặc rollback, kể cả nếu Knot đổi parent. Road/Extrude/MeshDeform tiếp tục dùng hệ thống `getRevision()` và `update()` đang có để phát hiện thay đổi sau Editor Undo/Redo. Không thêm legacy listener. Cần Creator 3.8.8 để kiểm thử native Undo stack, Prefab và tình huống đổi selection khi commit đang chờ.

## Phase 2.15 — Bảo vệ Scene khi Gizmos đang chờ IPC

Mỗi lần bắt đầu kéo Knot, plugin ghi nhận một **Scene Lease** gồm danh tính các Node từ SplineContainer đến Scene root. Nếu đóng/mở Scene, thay Nested Prefab editing root hoặc reparent ancestor khi đang kéo, các thao tác Group Move, Tangent và Rotate sẽ hủy an toàn. `scene:query-node`, `scene:set-property`, `scene:snapshot` được kiểm tra trước và sau phản hồi bất đồng bộ; không tiếp tục ghi hoặc rollback sang Scene khác.

**Giới hạn:** plugin không thể hủy một lệnh Editor đã gửi đi từ trước khi Scene đổi, chỉ có thể chặn các lệnh tiếp theo. Cần smoke test với Cocos Creator 3.8.8 thật để xác minh native Undo, Prefab overrides và thời điểm unload. Vẫn dùng Cocos-Gizmos v3 preview hỗ trợ `supportsExternalHistory`.

## Phase 2.16 — Distribute Marked Knots

Trong SplineContainer Inspector → Batch Knot Tools, đánh dấu ít nhất 3 Knot, chọn Coordinate space và Axis rồi bấm **Distribute marked**. Khoảng cách tọa độ trên trục được chọn được chia đều giữa hai Knot cực trị; thứ tự không gian trên trục được giữ (tọa độ trùng nhau dùng thứ tự Hierarchy). Hai đầu, các tọa độ khác trong hệ đã chọn, Knot không đánh dấu và thứ tự Hierarchy không đổi. Local hỗ trợ 3D/XY2D/XZ2D; World chỉ hỗ trợ 3D, kể cả Container xoay hoặc scale không đều. Thao tác có thể đổi hình dạng đường cong, không phải chia đều chiều dài cung Bezier. Dùng transaction batch hiện có, một yêu cầu snapshot nếu có thay đổi, không snapshot khi no-op, rollback khi ghi lỗi. Native Undo/Redo và Prefab vẫn cần kiểm tra trong Creator 3.8.8. Không cần nâng cấp Gizmos.

## Phase 2.17 — Distribute along Arc (Local)

Trong Batch Knot Tools, chọn ít nhất 3 Knot liên tiếp đang enabled trên spline mở, bấm **Distribute along Arc (Local)**. Hai Knot đầu/cuối giữ nguyên; các Knot giữa được lấy mẫu ở khoảng cách cung đều trên đường cong gốc bằng evaluator hiện có. Hỗ trợ 3D, XY2D, XZ2D (giữ trục ẩn của Node), và reversed. Không hỗ trợ spline kín hoặc selection rời rạc; không đo chiều dài World khi parent scale không đều. Không đổi tangent mode/rotation/thứ tự Hierarchy; curve sau chỉnh có thể thay đổi, khoảng cách cung sau chỉnh không được đảm bảo đều, và thao tác không phải resample giữ nguyên hình dáng. Revision của spline được kiểm tra trước khi transaction ghi Node.position; một snapshot nếu có thay đổi, rollback khi ghi lỗi. Native Creator Undo/Redo và Prefab vẫn cần smoke test.

## Phase 2.18 — Closed Spline / World Arc Distribution

Batch Knot Tools → Arc metric (Local/World) → Distribute along Arc. Mark ít nhất 3 Knot enabled liên tiếp. Với spline kín, hỗ trợ đoạn chọn đi qua seam; giữ hai Knot biên. Nếu chọn toàn bộ loop, giữ Knot đầu theo thứ tự evaluator (reversed làm đổi anchor) và chia cả vòng thành N khoảng. World đo chiều dài sau affine transform của Container (rotation, non-uniform scale, shear), trả vị trí local, giữ trục ẩn XY2D/XZ2D. Dùng LUT của evaluator, độ chính xác theo Samples Per Curve, giới hạn 65536 mẫu; từ chối world transform suy biến. Kiểm tra revision, thứ tự UUID và world matrix trước khi ghi. Không đảm bảo shape preservation hoặc khoảng cách đều trên spline SAU khi chỉnh. Native Undo/Redo và Prefab cần Creator smoke test. Không nâng cấp Gizmos.

## Phase 2.19 — Resample Spline (tạo bản sao mới)

Trong **SplineContainer Inspector → Resample Spline · new copy**, chọn `Knot count` (số Knot: spline mở 2–128, kín 3–128) hoặc `Max spacing` (khoảng cách cung mục tiêu, suy ra số Knot), chọn metric **Local/World** và `Max error`. Hệ thống lấy mẫu cung của spline gốc, fit từng đoạn Bezier với hai tangent độc lập (`Broken`) và đo sai số tại 49 điểm/đoạn. Nếu giá trị đo vượt giới hạn thì **không tạo spline mới**.

Thao tác tạo **một SplineContainer mới cùng cấp**, copy local position/rotation/scale và thuộc tính closed/dimension/samplesPerCurve. Spline gốc vẫn giữ nguyên, bao gồm Prefab overrides. Thứ tự Knot mới là thứ tự evaluator; nếu spline gốc bật `reversed`, spline mới dùng Hierarchy tương ứng và `reversed=false`.

**Không phải clone Prefab hoàn chỉnh:** không sao chép rotation riêng từng Knot, handle Node, Road, Extrude, MeshDeform, Junction hoặc các component con khác. Resample xấp xỉ hình dạng theo giới hạn sai số *lấy mẫu*, không bảo đảm khoảng cách Hausdorff liên tục. Undo/Redo việc tạo cả cấu trúc vẫn cần test Creator 3.8.8 thực tế.
