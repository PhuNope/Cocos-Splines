> **Cocos Splines v2.0.0 rewrite branch**: This branch contains an in-progress, breaking rewrite and is not a published release. The v2 Core is under `src-v2/core`; the still-present v0.9.12 runtime is retained temporarily as a reference/baseline. There is no tag or Release until explicit owner approval. See [v2 architecture](docs/v2/ARCHITECTURE.md) and [roadmap](docs/v2/ROADMAP.md).

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

> **Đang phát triển trên nhánh v2.0.0:** nền tảng Mesh Pipeline 2 (UV0/UV2, nhiều material, chia mesh theo chunk, dữ liệu collider) đã có ở `src-v2/geometry`. Chưa có component v2 tích hợp Cocos Editor hoặc Bake AssetDB. Xem [Mesh Pipeline 2](docs/v2/MESH_PIPELINE.md).
