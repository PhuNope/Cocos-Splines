
## v0.9.0 — Dreamteck-inspired extension tools (dev)

Added **SplineModifiers**, **SplineObjectController**, **SplineObjectBender**, **SplineMorph**, and **SplineJunctionMesh** (XZ surface patch). Modifiers can drive Animate speed/offset/roll, Road width and Object Controller scale/offset. All controls are in Inspector; no spline panel.

Detailed Vietnamese instructions: [docs/Dreamteck_Advanced_v090_VI.md](docs/Dreamteck_Advanced_v090_VI.md). Git workflow (dev → manual main merge → CI release): [docs/GITHUB_WORKFLOW_VI.md](docs/GITHUB_WORKFLOW_VI.md).

**Limitations:** Junction Mesh is a non-watertight top patch; ObjectBender supports only readable static mesh renderers; Morph requires a separate output curve. Collider and Particle tools are intentionally deferred. Live Cocos Creator 3.8.8 Editor validation remains necessary.

# Cocos Splines v0.8.0 — Dreamteck-inspired tools cho Cocos Creator 3.8.8

Phiên bản v0.8.0 bổ sung **Spline Positioner**, **Spline Projector**, **Spline Length Monitor** và **Spline Offset trên Animate**, cùng API `SplineContainer.projectWorld()` cho world-space projection.

**Tài liệu chi tiết mới:** `docs/Dreamteck_Features_VI.md` (chỉnh qua Inspector, cách dùng t/Distance, Follow Target, Projector, event, roadmap). Không cần panel riêng. Các 16 UUID runtime từ v0.7.5 được giữ nguyên.

## MeshDeform: sửa mặt bị lộn ngược (v0.7.3)

**Triệu chứng:** gán Capsule (Axis=Y, Stretch) thấy mặt ngoài bị ẩn, chỉ nhìn thấy mặt trong, hoặc ánh sáng rọi vào phía trong.

**Nguyên nhân:** mapping trục của MeshDeform phiên bản cũ phản chiếu hình học đối với `Axis X` hoặc `Axis Y` nhưng lại giữ nguyên triangle indices. Cocos cull theo winding và tính normal từ hình học nên mặt trước thành mặt sau.

**Bản sửa:** khi Axis X/Y, đảo **thứ tự hai index b/c của từng tam giác** trước khi tính normals. Với Axis Z, giữ nguyên winding. Thuộc tính `Flip Faces` mới cho phép bạn đảo thêm thủ công khi dùng mesh xuất từ phần mềm có winding trái quy ước; bình thường để OFF. `Flip Faces` không làm thay đổi UV, kích thước hay vị trí mesh.

**Dùng với Capsule:** chọn `Spline Mesh Deform → Axis = Y, Mode = Stretch, Flip Faces = OFF`, nhấn **Rebuild Mesh**. Nếu material đã tắt culling từ lần debug trước, có thể bật lại back-face culling để kiểm tra. Nếu vẫn nhìn thấy mặt trong (ví dụ mesh export đã lộn mặt), thử bật `Flip Faces = ON` và Rebuild. Đừng dùng cull-none làm bản sửa chính; tùy chọn đó không chỉnh sửa normals.

**Nâng cấp:** sao lưu project, thay thư mục `extensions/cocos-splines` bằng v0.7.3, reload/reimport trong Cocos. Các file `.ts.meta` giữ nguyên UUID, scene/prefab không cần thêm lại component. Bản này đã qua kiểm thử tính toán geometry, Editor mocks và TypeScript, chưa thử trực tiếp trên máy của bạn.

## MeshDeform: sửa lỗi `Source POSITION format UNSUPPORTED` (v0.7.2)

**Nguyên nhân:** Cocos Creator 3.8.8 trả về **đối tượng** `FormatInfo` từ `Mesh.readAttributeFormat()` (ví dụ `{ name: 'RGB32F', size: 12, count: 3 }`). Bản v0.7.1 so sánh cả đối tượng với enum số `gfx.Format.RGB32F`, do đó dù POSITION hợp lệ vẫn thành `UNSUPPORTED`.

**Đã sửa:** MeshDeform đọc `FormatInfo.name`, hỗ trợ cách trả enum số của môi trường cũ và đọc format từ `mesh.struct.primitives[].vertexBundelIndices` khi thiếu metadata, tìm đúng vertex bundle có thuộc tính POSITION/UV0. Đọc POSITION RGB32F, RGB16F, RGB16I/UI, RGB32I/UI; UV0 RG32F, RG16F, RG16I/UI, RG32I/UI. Không tự đoán format từ TypedArray để tránh đọc nhầm half-float.

**Cách kiểm tra trong Editor:**

1. Sao lưu project; thay `extensions/cocos-splines` với v0.7.2, mở lại Cocos và reload extension.
2. Chọn Node có `SplineMeshDeform`, gán `Source Mesh` và `Spline`, nhấn **Rebuild Mesh**.
3. Nếu báo không có CPU data, bật **Allow Data Access** cho Mesh trong Import Settings và Reimport. Đây không phải là yêu cầu bắt buộc phải bật lại nếu mesh đã có dữ liệu readable.
4. Nếu lỗi mới hiện **tên format thực** (ví dụ `RGB8`/`RGBA8`), đó là dạng nén/normalized không được decoder hình học hỗ trợ. Chọn mesh export POSITION float32 hoặc half16/16-bit integer, rồi reimport. **Không ép `RGB8` thành `RGB32F`** vì có thể biến dạng mesh.
5. Yêu cầu cũ vẫn giữ nguyên: một submesh, triangle indices, mesh không skinned và có đủ các đoạn chia theo chiều dài để uốn mượt.

Bản sửa này thay đổi mã đọc attribute, **không thay đổi UUID hay dữ liệu serialization**; không cần tạo lại `SplineMeshDeform` trên scene.

## Sửa lỗi JunctionMode Off (v0.7.1)

Trong `SplineAnimate`, `Junction Mode = Off` **không được tự động chuyển đường** khi follower đi qua một Junction. `On Reach` vẫn được phát, nhưng `requestJunctionExit(index)` bị bỏ qua ở chế độ Off.

- `Off`: không chuyển đường qua Junction.
- `First Other`: tự chọn nhánh khác đầu tiên, bỏ qua `requestJunctionExit()` trong callback.
- `Round Robin`: luân phiên nhánh, bỏ qua `requestJunctionExit()` trong callback.
- `Manual`: chỉ chuyển đường khi `On Reach` gọi `requestJunctionExit(index)`.

**Lưu ý:** Nếu script khác gọi trực tiếp `setCurrentSpline()` hoặc nhiều `SplineAnimate` cùng di chuyển một `Target`, node vẫn có thể xuất hiện ở spline khác. `Junction Mode` chỉ điều khiển cơ chế chuyển đường tự động của chính `SplineAnimate`. `PingPong` vẫn chỉ đảo chiều ở đầu/cuối spline đang đi.

# Cocos Splines v0.7.0 — cho Cocos Creator 3.8.8

## Mới ở v0.7.0: sửa Gizmos/Knot Editor và MeshDeform

### Bật/tắt chỉnh tangent theo từng Knot

1. Cài và bật extension **Cocos-Gizmos v2.0.3+** bên cạnh `cocos-splines` (phần runtime spline không phụ thuộc gizmos).
2. Chọn Node `Knot` thuộc `SplineContainer`, Inspector → **Create Tangent Handles** nếu chưa có. Plugin tạo hai Node con `Tangent In` / `Tangent Out`, lưu reference vào Knot và **bật Edit Tangent Handles**. Bước tạo handle sẽ chuyển Knot sang `Broken` để giữ hình Bezier cũ.
3. Trong **SplineKnot Inspector → Optional handles → Edit Tangent Handles**, chuyển **ON** để luôn nhìn thấy curve và hai tangent trong Scene, **không cần bật** `SplineContainer.Show Gizmos Always` hoặc `Show Tangent Gizmos`.
4. Nhấn **Edit Tangent In** hoặc **Edit Tangent Out** để chỉ chọn đúng một Node handle, rồi kéo bằng **W** (Move Tool). Hai nút này tự bật Edit Tangent Handles trước khi chuyển lựa chọn. Hoặc trong `SplineContainer` Inspector, mở knot tương ứng rồi bật/tắt **Edit Handles**.
5. Chuyển **OFF** khi không cần chỉnh. Điều này chỉ tắt việc **hiển thị liên tục**, không xóa Node hay thay đổi tangent; khi **chọn trực tiếp Knot**, hai tangent vẫn hiện dù container đã tắt cả `Show Gizmos`/`Show Tangent Gizmos`. Muốn ẩn luôn đường gizmo, bỏ chọn Knot và tắt Edit Tangent Handles.

### Fix tangent trên XY2D

- Khi chọn Knot của `SplineContainer.Dimension = XY2D`, plugin ép vẽ hai đường tangent và vòng tròn đầu mút kể cả khi Container tắt `Show Tangent Gizmos`.
- Vẽ thêm Gizmos3D dự phòng cho trường hợp Gizmos2D không thể hiển thị do không có `Canvas` / `RenderRoot2D`. Nếu chỉ vẽ spline đường 2D bằng `Spline2DPath` (Graphics), Knot/tangent Scene gizmos vẫn cần cài extension Cocos-Gizmos riêng.
- Đây là Gizmo hiển thị, **không phải** handle có thể nhấp-kéo trực tiếp vào chấm vẽ; hãy dùng Node handle thật và phím **W**.

### Sửa `Source POSITION requires RGB32F or RGB16F format` trong MeshDeform

- `SplineMeshDeform` đọc POSITION của imported Mesh ở bốn định dạng: **RGB32F, RGB16F, RGB16I, RGB16UI** (theo cách đọc attribute được dùng bởi `Cocos-Gizmos/Gizmos3D.drawMesh`). `RGB16F` được giải mã từ half-float bit; các kiểu integer 16-bit được đọc thành giá trị số, không giải mã như half-float.
- UV0 có thể dùng **RG32F, RG16F, RG16I, RG16UI**; nếu mesh không có UV0 thì `SplineMeshDeform` tự sinh UV thay thế. Bản không hỗ trợ mọi định dạng nén, nhiều submesh hoặc skinned mesh; lỗi khác sẽ được báo rõ trong Console.
- **Bật Allow Data Access** ở Import Settings của Mesh và **Reimport**. Trong MeshDeform chọn Source Mesh, Axis, Stretch/Repeat, rồi **Rebuild Mesh**. Nếu vẫn lỗi, kiểm tra loại POSITION/UV0 và việc mesh có một submesh với triangle indices hay chưa.
- MeshDeform vẫn tạo hình học trên CPU, không thay đổi mesh asset gốc và không yêu cầu custom shader nằm trong thư viện spline.

**Tương thích:** 15/15 UUID TypeScript đã có ở v0.6.0 được giữ nguyên; có 1 module đọc mesh mới với UUID riêng. Bản này đã qua kiểm tra mock/TypeScript, **chưa kiểm thử trong Editor Cocos Creator 3.8.8 thực tế**.

---

## 0. Nâng cấp v0.6.0 — Vị trí theo t / Distance và Junction

Mới: `SplineTrigger`, từng `SplineJunctionLink`, `SplineAnimate` (Start / Preview) và các vùng Start–End của `SplineRoad`, `SplineExtrude`, `SplineInstantiate`, `SplineMeshDeform` đều có chế độ tọa độ. Chọn **Normalized Distance** (mặc định, giữ scene v0.5), **Distance** (spline-local units) hoặc **Spline T** (tham số cubic Bézier). `SplineContainer` có `distanceAtT`, `tAtDistance`, `evaluateWorldPositionAtDistance`, `evaluateWorldPositionAtT`. `SplineAnimate` có `seekDistance`, `seekAtT`, `previewAtDistance`, `previewAtT`, `currentDistance`, `currentT`.

**Xem hướng dẫn đầy đủ**: [`docs/Junction_Position_VI.md`](docs/Junction_Position_VI.md) — cấu hình ngã ba 3 spline, EventHandler Manual, payload, lỗi thường gặp, API và ví dụ nhập bằng t hoặc distance.

**Chú ý:** `Distance` đo theo **local spline units**, không tự chuyển thành world meters khi Node scale khác 1. `Spline T` 0.5 và Normalized Distance 0.5 thường không cùng điểm trên đường cong có các segment khác nhau.

---

Plugin dựa theo cách tổ chức extension của **cocos-flexalon**, lấy cảm hứng và đối chiếu tính năng từ **Unity Splines** và **Dreamteck** bạn cung cấp. Các component được triển khai mới bằng TypeScript, không sao chép mã C# Dreamteck. Không phân phối mã nguồn Unity. **Chỉnh mọi thứ trong Inspector, không có panel riêng.**


## 0. Những điểm mới v0.5.0 — Gizmos, 2D, Mesh Deform

### Scene Gizmos (tích hợp Cocos-Gizmos, không bundle chung)

1. Cài/bật **[Cocos-Gizmos](https://github.com/PhuNope/Cocos-Gizmos)** (đề xuất phiên bản `2.0.3` hoặc mới hơn). Đây là extension **độc lập** chỉ hoạt động trong Cocos Scene Editor. Không cần Cocos-Gizmos khi chạy runtime Splines.
2. Chọn spline → `SplineContainer` Inspector → **Scene Gizmos**, bật `Show Gizmos`. Mặc định chỉ vẽ khi chọn Container hoặc Knot, tránh vẽ hàng loạt spline không liên quan. Bật `Show Gizmos Always` nếu muốn đường hiện khi đang chọn các Node khác, ví dụ Tangent Handles.
3. Scene hiện đường Bézier, các knot dạng sphere/circle, tangent in/out ở knot được chọn. Khi chọn `SplineTrigger`/`SplineJunction` sẽ hiển thị mốc và điểm nối tương ứng.
4. Chọn `SplineKnot` → **Create Tangent Handles** trên Knot Inspector, plugin tạo hai Node con `Tangent In` / `Tangent Out`, chuyển knot sang **Broken** để giữ hình, rồi tự chọn handle mới. Chọn handle Node trong Hierarchy và dùng **W** kéo như Move Gizmo thường. Các hình Gizmos là hình minh họa, chưa phải các handle có thể trực tiếp click vào đường cong.
5. Nếu không cài Cocos-Gizmos, spline vẫn đánh giá/animate/road/mesh bình thường; chỉ không có hình minh họa gizmo. Cocos-Gizmos có builder hook bỏ callbacks khỏi runtime bundle.

### Spline 2D (Canvas/UI)

1. Chọn Canvas hoặc một Node nằm dưới Canvas → **Extensions → Cocos Splines → Create 2D Spline**. Cocos tạo `SplineContainer` (Dimension = **XY2D**), 4 Knot, và node con `2D Path` có `Spline2DPath` và `Graphics`.
2. Phải đảm bảo các Node `SplineContainer` / `2D Path` nằm dưới `Canvas` hoặc `RenderRoot2D`, có `UITransform` cho render 2D. `Spline2DPath` dùng Cocos `Graphics`, chỉnh `Line Width`, `Stroke Color` và `Steps Per Curve` trong Inspector.
3. `SplineContainer.Dimension` có **Space3D** (tương thích scene cũ, mặc định), **XY2D** (trục Z=0) và **XZ2D** (trục Y=0). Trong chế độ 2D, engine *đánh giá đường cong đã chiếu lên mặt phẳng*, **không sửa/move các node gốc**. Với XY2D, dùng tọa độ của knot X/Y.
4. `SplineAnimate` chạy trên XY2D hỗ trợ **Orient2D**: quay target quanh world Z cho sprite local +X hướng theo tangent; dùng `ForwardAxis=PositiveY` nếu sprite vẽ dọc +Y; thay đổi `Orient2DAngleOffset` cho offset bổ sung. Kéo Sprite Node vào Target, chọn Spline source rồi Play.
5. `Spline2DPath` là đường Graphics, chưa tạo PolygonCollider2D, chưa tạo ribbon/mesh UV 2D và không có thao tác kéo điểm bằng click trực tiếp lên nét vẽ. Chỉnh knot bằng node Transform, Inspector hoặc tangent handle.

### Spline Mesh Deform — uốn imported Mesh (dây thừng, ống, dây leo)

1. Import **Mesh asset** có nhiều đoạn chia **dọc** (ví dụ một ống dây thừng dọc local +Z). Trong thiết lập import mesh bật **Allow Data Access**. Mesh phải có **một submesh**, **triangle indices**, non-skinned; POSITION RGB32F/RGB16F/RGB16I/RGB16UI và UV0 RG32F/RG16F/RG16I/RG16UI được hỗ trợ.
2. Chọn `SplineContainer` → **Add Mesh Deform**. Node con `Spline Mesh Deform` có MeshRenderer riêng. Chọn node → gán `Source Mesh` = asset nhập, `Material` = vật liệu tùy chọn. *Source mesh không bị thay đổi*, plugin sinh mesh tạm để render.
3. `Axis` chọn X/Y/Z ứng với chiều dài mesh gốc. `Mode=Stretch` uốn & kéo **1 mesh** theo toàn khoảng `Start/End Progress`. `Mode=Repeat` nhân bản cùng mesh dọc spline thành `Repeat Count` đoạn, mỗi đoạn được uốn theo phần spline tương ứng.
4. `Width Scale` và `Height Scale` điều chỉnh mặt cắt. Cần đủ longitudinal vertex subdivisions để uốn cong mượt; **shader không tự tạo thêm vertices**. Các mesh có đầu bị bịt (capped) có thể lộ đường nối khi Repeat. Để tạo dây liền mạch, mesh gốc nên là một đoạn ống có hai đầu mở.
5. `UV Mode`: **KeepOriginal**, **ContinuousRepeat** (V tăng theo số đoạn), **Distance** (V theo độ dài spline x `UV Tiles Per Unit`). Với `Distance`, chọn texture Wrap Repeat để vân dây được lặp thay vì bị kéo giãn.
6. Shader mẫu `rope-uv-repeat.effect` được **phát hành thành ZIP riêng**, không nằm trong runtime library. Ngoài ra có thể dùng `builtin-unlit` + texture Repeat / `tilingOffset` có sẵn (theo docs Cocos 3.8). Nếu sprite/mesh nằm dưới Canvas, MeshRenderer thường không đi qua pipeline 2D — cần cân nhắc UIMeshRenderer hoặc dùng Spline2DPath cho đường UI.

**Giới hạn v0.5.0:** Chưa có tangents kéo trực tiếp bằng chuột lên gizmo primitive; thao tác là node handles được tạo thật. Mesh deform CPU (không phải GPU skinning), chưa hỗ trợ skinned mesh / nhiều submesh / tự sinh collider / nối lưới road tại junction. Chưa chạy live Creator 3.8.8 để xác nhận toàn bộ UI và shader import.

## 1. Cài / nâng cấp từ v0.1.0 hoặc v0.2.0

1. **Sao lưu** project, đặc biệt các scene và prefab.
2. Đóng Cocos Creator. Xóa/di chuyển thư mục `<Project>/extensions/cocos-splines` cũ ra khỏi `extensions` (không cài trùng 2 bản).
3. Giải nén `cocos-splines-0.7.0.zip` vào `<Project>/extensions/`. Đúng cấu trúc là `<Project>/extensions/cocos-splines/package.json`.
4. Mở Cocos Creator **3.8.8** → **Extension Manager → Project** → bật/reload `cocos-splines`, đợi reimport script.
5. Mở scene/prefab cũ để kiểm tra, Save, đóng và mở lại scene, Preview game. **UUID của tất cả 6 runtime script từ v0.1–v0.3 đã được giữ nguyên.** Road/Trigger/Junction sử dụng UUID mới.

## 2. Sửa các lỗi v0.2.0

**Chọn knot:** `Editor.Selection.select('node', uuid)` chỉ *thêm* node vào selection. Bản v0.3 dùng `Editor.Selection.clear('node')` trước khi chọn node đích nên nút **Select** chỉ chọn đúng **một** knot; áp dụng tương tự cho chọn Container, tạo/import, thêm và xóa knot.

**Warning khi Play:** `SplineExtrude` không còn gọi `renderer.getMaterial(0)` (deprecated trong Cocos 3.8), dùng `renderer.getSharedMaterial(0)`.

**Inspector:** Không render lại ô Cocos `ui-prop` khi đang thay đổi thuộc tính; danh sách knot cũng không render lại khi đang nhập số. Các nút Split/Select/Move được phép refresh sau khi nhấn.

## 3. Spline Container — Unity-style workflow

1. **Extensions → Cocos Splines → Create Spline**, hoặc dùng `SplineContainer` có sẵn.
2. Chọn node Container trong Hierarchy → chỉnh ở **Inspector**:
   - `Closed`, `Reversed`, `Samples Per Curve`.
   - `Add Knot`, `Refresh mesh`, **Reverse direction**.
   - Danh sách knot: Expand để sửa Position XYZ, Tangent Mode, Tension, Tangent In/Out, **Knot Local**.
   - Mỗi knot có các nút **Select** (chỉ chọn knot), **Split after**, **↑**, **↓**, **Delete**.
3. Chọn Knot rồi nhấn **W** để di chuyển bằng Move Gizmo trực tiếp ở Scene.
4. **Split after** chia đôi đoạn Bézier sau knot tại 50% bằng thuật toán De Casteljau, giữ nguyên hình dáng đường. Knot trước/sau sẽ tự chuyển thành `Broken` nếu cần. Với spline mở, knot cuối không có segment tiếp theo nên nút bị khóa; với spline Closed, có thể split cả đoạn cuối → đầu.
5. **Lưu ý:** Split chưa hỗ trợ khi một trong hai knot ở đầu đoạn đang tham chiếu `Tangent In Handle` / `Tangent Out Handle` node; cần gỡ tham chiếu handle trước. `↑ ↓` chỉ thay đổi thứ tự Knot trong Hierarchy, không cố gắng bảo toàn đường cong.

### Tangent mode

- **AutoSmooth:** Tự tính tangent qua knot, dùng Tension.
- **Linear:** Không dùng tangent, đoạn thẳng.
- **Mirrored:** Tangent In đối xứng Tangent Out.
- **Continuous:** Cùng hướng thẳng hàng, độ dài hai bên có thể khác.
- **Broken:** Điều chỉnh tangent In/Out độc lập.
- **Knot Local:** Bật để vector tangent xoay theo Rotation của knot, giống Unity. **Mặc định tắt** ở các knot cũ để giữ tương thích v0.2; bật sẵn cho Knot nhập qua exporter Unity.

Có thể gán `Tangent In Handle` và `Tangent Out Handle` là Node con của Knot từ Inspector của component `SplineKnot`. Kéo Node handle trong Scene để điều chỉnh tangent; cần chọn Broken/Mirrored/Continuous để thấy tác dụng.

## 4. Spline Animate — thêm tính năng giống Unity

Gắn `SplineAnimate` lên Node **Mover** và kéo SplineContainer vào ô `Spline`; để `Target` trống sẽ di chuyển chính Node Mover. **Không dùng Node của SplineContainer làm Target** (tránh đường cong tự di chuyển).

Các trường:

| Nhóm | Tùy chọn |
|---|---|
| Source | `Spline`, `Target`, `World Offset` |
| Playback | `Method: Time/Speed`; Duration hoặc Speed hiện tùy Method; `Once / Loop / PingPong` |
| Easing | Linear, EaseInOut, EaseIn, EaseOut, SmootherStep |
| Orientation | `Align To Spline`, `Up Mode: Spline/World`, `Forward Axis: ±X/±Y/±Z`, `Rotation Offset` |
| Start | `Play On Start`, `Start Progress` |
| Editor | `Preview In Editor`, `Preview Progress` (0→1), `Preview position`, `Stop / Restore` |

Dùng **Stop / Restore trước khi lưu scene** nếu đang preview transform. Các API gameplay: `play()`, `pause()`, `restart()`, `seek(t)`.

## 5. Road Builder — v0.4.0 (NEW)

Bạn **không cần viết code** để vẽ đường. Hệ thống sinh mesh từ spline bằng component `SplineRoad` trong **Scene Editor**. Mesh procedural chỉ là cách triển khai; tác vụ tạo/sửa đều ở Inspector.

### Cách tạo Road mới

1. Trong menu **Extensions → Cocos Splines → Create Road Spline**. Cocos tạo Node `Road Spline` chứa `SplineContainer`, 4 `Knot` con và Node con `Road` có `SplineRoad` + `MeshRenderer`.
2. Chọn `Road Spline` → mở `Bezier knots` ở Inspector → sửa Position/Tangent hoặc kéo Knot bằng **W** trong Scene. Đường thay đổi theo knot.
3. Chọn Node con `Road` → Inspector `Spline Road`. Chỉnh **Width** (mặt nhựa), **End Width** (taper), **Shoulder Width / Drop** (lề), **Curb Width / Height** (bó vỉa), **Thickness** (độ dày), **Samples Per Curve** (độ mượt).
4. Mặc định road có **Asphalt Color** tối (đổi được trong Inspector). Nếu dùng texture, kéo Material road/asphalt vào **Road Material**. Texture UV `U` theo bề rộng, `V` theo chiều dài; chỉnh `UV Meters Per Repeat` để lát texture dài/ngắn hơn.
5. Nhấn **Rebuild Road** nếu Scene Editor không tự cập nhật sau chỉnh Inspector hoặc Knot. Chỉnh `Start/End Progress` nếu chỉ muốn một đoạn đường.

### Thêm Road vào spline v0.3.0 đã tồn tại

Chọn `SplineContainer` → bấm **＋ Add Road** → được tạo node con `Road` mới, không phá `SplineExtrude` trên Container. Nếu spline cũ có cả ống tube, bạn có thể tắt `SplineExtrude` nếu chỉ muốn đường.

*Road follow knot rotation/banking.* Hãy xoay Knot quanh hướng tiếp tuyến để làm đoạn đường nghiêng. Road hiện chỉ tạo mesh nhìn thấy: **chưa tự tạo Collider, road markings, giao lộ nối mặt mesh hoặc export `.mesh` asset**. Junction ở bên dưới dùng để đổi tuyến object, không tự merge hình đường tại giao lộ.

## 6. Trigger/Event và Junction — v0.4.0 (NEW)

### Spline Trigger: sự kiện khi đi ngang mốc

1. Chọn `SplineContainer` → **＋ Add Trigger**, tạo một Node con `Spline Trigger`.
2. Chọn Trigger → Inspector → đặt `Progress` trong **[0,1]** (theo chiều dài cung của spline), `Direction` (Both/Forward/Backward), `Work Once` và `Once Per Follower` nếu cần.
3. Trong `On Cross`, gán Node có script xử lý callback qua EventHandler của Cocos. Callback nhận payload `{ trigger, follower, target, spline, progress, direction }`.
4. Trong gameplay, `SplineAnimate` đi qua mốc sẽ phát sự kiện; dùng `node.on('spline-trigger', ...)` trên Node Trigger hoặc Node chứa `SplineAnimate` nếu muốn lắng nghe bằng code.

**Lưu ý:** Trigger chỉ phát khi **gameplay** đi qua marker. Kéo `Preview Progress` trong Editor không tạo event gameplay. Vị trí Node Trigger không phải vị trí trigger; thuộc tính `Progress` mới là vị trí chính xác.

### Spline Junction: ngã rẽ đổi đường

1. Tạo hai `SplineContainer` (ví dụ Road A và Road B), đảm bảo Knot/đường mesh tại giao cắt khớp vị trí thủ công.
2. Chọn Road A Container → **＋ Add Junction**. Component mới được đặt trên Node `Spline Junction` cùng cấp với Container (không phải Knot).
3. Chọn Junction → `Connections` → tăng array lên ít nhất **2**. Với từng entry gán `Spline` và `Progress` (theo chiều dài cung), chọn `Exit Direction` (Preserve / Forward / Backward). Các link có thể ở tiến độ bất kỳ, không nhất thiết đầu/cuối spline.
4. Trên `SplineAnimate` của xe: chọn `Junction Mode` = `First Other` hoặc `Round Robin`; tới intersection sẽ tự đổi spline. Chọn `Manual` nếu muốn callback quyết định.
5. `On Reach` luôn phát khi tới Junction; `On Switch` chỉ phát khi chuyển tuyến thành công. Sự kiện cũng phát qua `node.emit('spline-junction', payload)` và `node.emit('spline-junction-switch', payload)`.

Trong callback `On Reach`, để chỉ định nhánh manual, gọi `payload.follower.requestJunctionExit(exitIndex)`, với `exitIndex` là **index trong mảng Connections**. Đầu vào hiện tại không được chọn lại làm đầu ra. Mỗi follower có thể `setCurrentSpline(spline, progress, direction)` bằng code để thay đổi tuyến chủ động.

Để minh họa callback Cocos, xem file `docs/TrafficEventsExample.ts` trong ZIP.

## 7. Spline Extrude

- `Radius`: bán kính đầu; `End Radius = -1` giữ đều, giá trị ≥ 0 dùng để thay đổi bán kính đến cuối (taper).
- `Start Progress` và `End Progress`: chỉ tạo mesh trên một phần đường theo khoảng 0–1.
- `Sides`, `Segments Per Curve`, `UV Tiling`, `Cap Ends`, `Flip Normals`, `Material`.
- Không còn lời cảnh báo về `Renderer.prototype.getMaterial` do plugin gọi.
- `Flip Normals` thích hợp để xem mặt trong đường hầm. Để tạo **road (mặt đường + lề + curb)**, dùng component `SplineRoad` ở trên. Chưa có collider tự tạo hoặc profile tùy biến bất kỳ.

## 8. Spline Instantiate

- Phân phối prefab theo `Method = Count` (số lượng) hoặc `Method = Distance` (khoảng cách đơn vị spline).
- `Start Progress`, `End Progress`, `Include End Point`, xử lý tránh trùng điểm đầu/cuối với Closed.
- `Position Offset`, `Rotation Offset`, `Scale Multiplier` và `Random Offset` với `Seed` cố định để tái lập các vị trí sau rebuild.
- Tạo prefab tại runtime, không tự bake node vào scene editor. `Rebuild On Change` bật nếu muốn tái tạo lúc gameplay khi spline thay đổi (có chi phí CPU).

## 9. Nhập từ Unity

1. Chép `docs/UnitySplineJsonExporter.cs` vào `Assets/Editor/` của dự án Unity có package Splines.
2. Chọn GameObject gắn `SplineContainer` → **Tools → Splines → Export Selected Spline to Cocos JSON**.
3. Ở Cocos: chọn SplineContainer → mở phần **Import Unity Splines JSON** ở Inspector → dán JSON → Import as new spline.
4. Import tạo **một spline mới cùng cấp**. Hiện chỉ export/import spline đầu tiên, chưa có spline-link hay container nhiều đường cong. Unity tangent lưu trong knot-local, do đó bản mới tự bật `Knot Local` cho knot nhập từ Unity.
5. Kiểm tra lại Rotation/Up sau import nếu project dùng khác hệ tọa độ, hierarchy transform hay non-uniform scale.

## 10. API runtime cơ bản

```ts
import { _decorator, Component } from 'cc';
import { SplineContainer } from 'db://cocos-splines/splines/Core/SplineContainer';
import { SplineAnimate } from 'db://cocos-splines/splines/Components/SplineAnimate';
const { ccclass, property } = _decorator;

@ccclass('FollowPath')
export class FollowPath extends Component {
    @property(SplineContainer) path: SplineContainer | null = null;
    @property(SplineAnimate) movement: SplineAnimate | null = null;
    start() {
        console.log('Spline length:', this.path?.length);
        console.log('Midpoint:', this.path?.evaluateWorldPosition(0.5));
        this.movement?.restart();
    }
}
```

## 11. Giới hạn, kiểm thử

- Đây **không phải bản port 1:1** Unity Splines/Dreamteck: junction chỉ chuyển follower chứ chưa hàn mesh giao lộ, mỗi container chỉ chứa 1 spline, không có road markings/lane traffic AI, arbitrary profile mesh, overlay chọn tangent đầy đủ, Jobs/Burst hoặc collider generation.
- Mesh Road và Extrude là procedural/tạm thời, không lưu `.mesh` asset; Prefab Instantiate sinh lúc runtime.
- `SplineAnimate` tính Speed theo chiều dài local, không tự hiệu chỉnh scale khác nhau trên các trục của parent.
- Bản đã được biên dịch bằng TypeScript mô phỏng Cocos API và kiểm thử Editor mock + geometry + runtime mô phỏng. **Chưa kiểm trực tiếp Cocos Creator 3.8.8 trên máy thật**. Hãy kiểm tra lần lượt Select, Undo/Redo, Save/Reopen Scene và Prefab, Preview Web và native trên project mẫu.

Dành cho người phát triển: `npm run build`, `npm run check:runtime`, `npm test`, `npm run verify`, `npm run package`.


## 12. MeshDeform bị tối đen với builtin-standard / Rope.mtl (v0.7.4)

- Chọn `Spline Mesh Deform` → `Axis = Y`, `Mode = Stretch`, `Flip Faces = OFF`, `Material = Rope.mtl`, `UV Mode = Distance` → nhấn **Rebuild Mesh**.
- Từ v0.7.4, mesh tạo ra có đủ **positions, normals, UV0 và tangents vec4** để material chuẩn Cocos dùng normal map. Plugin cố gắng giữ smoothing của nguồn (Capsule import) thay vì tính lại normals theo mặt tam giác; nếu mesh nguồn không có normals CPU hợp lệ, vẫn tính lại normals.
- `Flip Faces` không thay đổi chất liệu. Nó đảo thứ tự tam giác + normals và thông thường chỉ cần ON nếu mesh nguồn có mặt đảo. Bật ON với Axis Y khi nguồn bình thường sẽ đảo mặt lần nữa và có thể nhìn tối/mất mặt trước.
- Nếu material vẫn tối, **tạm tắt Normal Map** trong một material Rope.mtl sao chép (không sửa asset chung) để so sánh, xác nhận nguồn vấn đề là tangent-space lighting hay đèn/môi trường. Thử một material `builtin-unlit` có màu sáng để phân biệt lỗi ánh sáng và lỗi hình học.
- MeshRenderer của Node dùng MeshDeform phải là Node riêng. Đừng bật thêm `SplineExtrude` hoặc `SplineRoad` trên cùng renderer. `UV Tiles Per Unit = 1` nghĩa là 1 lần lặp texture / unit chiều dài spline (theo V), không điều khiển shading.
- Có thể bị biến dạng ở hai nắp capsule khi Stretch; để tạo dây thừng tốt nên dùng ống thẳng có nhiều segment dọc chiều dài, hai đầu mở và UV dọc trục phù hợp.

*Bản sửa đã qua các bài test tự động. Vẫn cần kiểm tra trực tiếp với Rope.mtl (ảnh chụp scene) trong Editor, Preview và build Cocos Creator 3.8.8.*

## v0.7.5 — Dùng chung Material giữa nhiều Spline

- `SplineRoad`, `SplineExtrude`, `SplineMeshDeform` dùng `MeshRenderer.setSharedMaterial(...)` với **đúng đối tượng Material asset** được kéo vào component. Không gọi `getMaterialInstance()` hoặc sửa thông số trên bản sao của asset trong runtime spline.
- Khi chỉ đổi Material trong Inspector, không cần rebuild hình học: việc đồng bộ shared material chạy cả khi `Rebuild On Change` tắt.
- Nếu xóa Material của **component spline** trong cùng phiên Editor, nó sẽ không giữ tham chiếu trước đó trong MeshRenderer. Nếu Material của component để trống nhưng bạn gán trực tiếp vào `MeshRenderer > Materials`, plugin giữ nguyên lựa chọn thủ công đó.
- Fallback Material được sinh riêng cho mỗi component khi không có asset nào được chỉ định. Các fallback này **không phải** file `.mtl` dùng chung; nếu muốn sửa đồng loạt, hãy tạo file `.mtl` và gán cùng file vào tất cả component.
- **Phân biệt Material asset và Material Instance:** Hãy sửa file `.mtl` trong tab **Assets** để thay đổi giá trị dùng chung. Nếu chỉ thay `getMaterialInstance()`/material instance của một MeshRenderer, thay đổi đó chỉ tác động đến node đó.
- Sau reimport thay thế asset Material, Cocos có thể cần reload/rebind. Nếu bạn vẫn thấy node dùng thông số cũ, chọn lại asset trong Inspector hoặc tắt/bật component; bản v0.7.5 kiểm tra thay đổi đối tượng shared material ngay cả khi UUID không đổi.
- Không dùng chung một MeshRenderer cho hai component sinh mesh (Road/Extrude/Deform) vì chúng cùng ghi vào `mesh` của Renderer. Nên tách thành các node con riêng.

**Lưu ý:** Các kiểm thử về chia sẻ material thực hiện bằng runtime mock; chưa xác minh việc Cocos Editor thực sự cập nhật một file `.mtl` sau khi lưu trên máy người dùng.

## v0.8.1 — Runtime event subscription
Xem [RuntimeEvents_VI.md](docs/RuntimeEvents_VI.md) để sử dụng `AddOnReachEvent(cb, target)` và `RemoveOnReachEvent(cb, target)`.

## Tài liệu HTML nhiều trang — v0.9.1

Mở [`docs/index.html`](docs/index.html) để xem 20 trang hướng dẫn tiếng Việt (cài đặt, Spline, Animate, Junction, Event API, Road, MeshDeform, Morph, ví dụ và xử lý lỗi). Tài liệu có thể mở offline.

Trong `SplineAnimate`, thuộc tính **Constant Speed With Offset** mặc định bật: Linear sẽ bù độ dài đường chạy thực khi có Offset, khắc phục nhanh/chậm ở đoạn cong. Trong `SplineMorph`, sau khi nhấn Restore nhưng Preview In Editor vẫn bật, chỉnh Blend lại sẽ preview bình thường.
