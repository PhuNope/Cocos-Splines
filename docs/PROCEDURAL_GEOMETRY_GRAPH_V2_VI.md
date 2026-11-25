# Cocos Splines V2 — Phase 4.1: Typed Procedural Geometry Graph

## Đã triển khai

**SplineGeometryGraphRenderer** là component tạo mesh theo graph có kiểu dữ liệu rõ ràng, tách biệt source **SplineContainer** và MeshRenderer đầu ra. Không thay đổi Knot, asset Mesh của nguồn hoặc các prefab khác.

Hệ thống gồm:

- **Core/SplineGeometryGraph.ts**: parse JSON phiên bản 1, biên dịch directed acyclic graph (DAG), validate kiểu cổng `path` / `mesh`, xử lý thứ tự dependency bất kể thứ tự node trong JSON, cache và dirty propagation theo từng node, transaction rollback cache khi evaluate lỗi.
- **Components/SplineGeometryGraphRenderer.ts**: lấy stable World spline frames, chuyển sang local MeshRenderer, chạy graph, dựng Mesh mới bằng Cocos `utils.createMesh` và gán sau khi toàn bộ validation/tessellation thành công. Chỉ thay/destroy Mesh **do chính component tạo**.
- **Editor/SplineMeshDrawers.ts**: drawer selected-only qua decorator Cocos-Gizmos v3 để preview wireframe; không dùng callback legacy.
- **Inspector/GeometryGraph.js**: chọn spline, nhập `graphJson`, độ phân giải, material, tùy chọn rebuild tự động, wireframe, và nút **Rebuild Graph**. Nút chỉ chạy lệnh scene đọc/ghi mesh transient, **không tạo snapshot/Undo entry**.

**Phase 4.1** xây dựng nền tảng typed DAG JSON; **Phase 4.2a** đã bổ sung visual node canvas trong Inspector. **Phase 4.2b** bổ sung shared Cocos JsonAsset và import/export/copy-to-local (xem [Shared Graph Assets](PROCEDURAL_GEOMETRY_GRAPH_ASSETS_V2_VI.md)).

## Hướng dẫn trong Cocos Creator 3.8.8

1. Tạo một Node riêng làm mesh output (không gắn lên Knot, Road đang có hoặc prefab nguồn).
2. Gắn component **SplineGeometryGraphRenderer** (menu **Splines → Procedural Geometry Graph**); MeshRenderer sẽ được yêu cầu tự động.
3. Gán một **SplineContainer** đang có ít nhất hai Knot vào trường **Spline**. Có thể dùng một SplineContainer trên cùng Node.
4. Mở Inspector → **Spline & typed graph JSON**. Graph mặc định đã tạo ribbon rộng 4 đơn vị; nhấn **Rebuild Graph** để sinh mesh.
5. Chọn Material; nếu để trống, component giữ material đã gán trực tiếp vào MeshRenderer hoặc tạo fallback unlit.
6. Thử chỉnh `graphJson` thêm `offset` và `width`, sau đó bấm **Rebuild Graph**. Tắt `Rebuild On Change` nếu muốn rebuild thủ công.
7. Bật `Show Mesh Gizmos` để thấy selected-only wireframe Cocos-Gizmos; `Gizmo Edge Limit` 24–1200.

### Graph ví dụ

```json
{
  "version": 1,
  "nodes": [
    {"id": "source", "type": "spline"},
    {"id": "offset", "type": "offset", "input": "source", "right": 1, "up": 0.2},
    {"id": "width", "type": "width", "input": "offset", "multiplier": 1.5},
    {"id": "ribbon", "type": "ribbon", "input": "width", "width": 3.0, "uvMetersPerRepeat": 5, "thickness": 0.15, "capEnds": true, "cornerMode": 0},
    {"id": "output", "type": "output", "input": "ribbon"}
  ],
  "output": "output"
}
```

**Lưu ý**: chiều dài UV tính bằng Cocos/World units trên sample path. `Offset` tính theo stable local basis đã chuyển từ frame World vào output node local space. Taper ribbon hỗ trợ `endWidth > 0`, `cornerMode=0` giữ mặt ribbon legacy, `cornerMode=1` dùng JoinAndTrim từ Road. Ribbon chia sẻ tessellator với SplineRoad, không tự viết bộ sinh topology thứ hai.

## Install Examples

Menu **Extension → Cocos Splines → Install Examples** sẽ tạo thêm `assets/CocosSplinesExamples/GeometryGraph/BasicRibbonGraph.json` trong project (nếu chưa có). Đây là dữ liệu mẫu độc lập, **không tự tạo Scene hay sửa prefab**. Mở file, sao chép nội dung vào thuộc tính `Graph Json` của SplineGeometryGraphRenderer rồi nhấn **Rebuild Graph**. Installer không ghi đè file đã chỉnh sửa và không sao chép UUID .meta từ extension.

## Danh mục node V1

| Node type | Input | Output | Cấu hình |
|---|---|---|---|
| `spline` | Không | `path` | Đọc stable frame field từ SplineContainer của component |
| `offset` | `path` | `path` | `right` / `up`: -1000 đến +1000, mặc định 0 |
| `width` | `path` | `path` | `multiplier`: 0.01–20, mặc định 1 |
| `ribbon` | `path` | `mesh` | `width` 0.05–100, `endWidth` 0–100, `thickness` 0–20, `capEnds`, `uvMetersPerRepeat` 0.01–10000, `cornerMode` 0/1 |
| `output` | `mesh` | `mesh` | Cổng output duy nhất |

Cấu hình phải có **đúng một** `spline`, **đúng một** `output`, không có node rời rạc. Mỗi node chỉ nhận một input, và cổng nối phải tương thích. Dữ liệu `path` được dùng lại qua nhiều nhánh khi V1 graph mở rộng; output được xác định bằng ID chứ không theo thứ tự phần tử JSON.

## Giới hạn và an toàn

- **3–32 node**, tên ID bằng chữ/số/`_`/`-` dài tối đa 40 ký tự; JSON ≤16.384 ký tự.
- Sampling **2–64 mẫu/Bezier segment**; giới hạn 1.025 frame, 65.536 vertex và 393.216 index.
- Vector finite ±1e7; float/UV finite; chỉ node type đã đăng ký được phép thực thi. Không JavaScript callback, không `eval`, không arbitrary code từ graph JSON.
- Kiểm tra DAG/cycle, mọi cạnh input, kiểu dữ liệu path/mesh, orphan node, dải số hợp lệ **trước khi tạo Mesh mới**.
- Cache riêng mỗi component: sample stable World frames được cache theo spline UUID/revision/transform và output transform; key từng graph node dựa vào node config + version upstream. Edit `width` chỉ dirty Width→Ribbon→Output, giữ source/offset **và không lấy mẫu lại spline**; edit Ribbon chỉ dirty Ribbon→Output. Đổi spline geometry, source UUID, transform hoặc sample count làm dirty toàn DAG và làm mới World-frame cache. Lỗi evaluation/mesh commit không thay thế frame cache và mesh cũ.
- Trước khi thay mesh trên renderer, toàn bộ parse, frame sampling, mesh topology validation và `utils.createMesh` phải thành công. Graph JSON sai hoặc mesh build lỗi **giữ mesh đã render trước**.
- Graph output mesh là **transient runtime/editor mesh**, không tự lưu thành external Mesh asset. Material của MeshRenderer vẫn có thể gán thủ công; chỉ material fallback do component tạo mới được destroy.
- Đặc điểm UV, normals, cap, winding và ribbon sử dụng lại `SplineRoadMath` hiện tại, không thêm lớp deform lên Road cũ. Không tự sinh Collider, NavMesh hoặc intersection Boolean.

## Chưa có trong Phase 4.1

Visual node graph editor (kéo-thả, chỉnh node/cổng bằng UI), nhiều output, cơ chế nhập/xuất graph asset, tube/extrusion/mesh-deform profile nodes, GPU compute, terrain conform mesh, procedural material blending và graph giữa nhiều SplineContainer là những phase kế tiếp.

## Checklist native Cocos Creator 3.8.8

- [ ] Component xuất hiện trong Add Component, có MeshRenderer, Inspector hiển thị multiline `Graph Json` và **Rebuild Graph**.
- [ ] Gán spline 2–5 Knot, graph mặc định sinh ribbon có UV/normals và winding hướng ra ngoài; material không bị mất khi rebuild.
- [ ] Đổi node `offset`, `width`, `ribbon`; thay đổi Width không làm source spline hay Knot dịch chuyển.
- [ ] Nhập graph thiếu `input`, sai type, vòng lặp hoặc có node không kết nối: thông báo lỗi và mesh cũ vẫn còn.
- [ ] Thử Geometry Graph trên Node có parent rotation/nonuniform scale; mesh bám đúng spline World path.
- [ ] Thử closed spline và ribbon `capEnds`: đường khép kín không có end caps ngoài ý muốn.
- [ ] Tắt Rebuild On Change, thay JSON/Knots rồi bấm Rebuild; bật lại, kiểm tra cập nhật tự động và hiệu năng.
- [ ] Bật Gizmos preview khi chọn output Node, kiểm tra không xuất hiện wireframe ở Node khác.
- [ ] Save/Reopen, Undo/Redo các trường serialized JSON, prefab overrides; kiểm tra asset Mesh nguồn không bị sửa.
- [ ] Native compile/build + performance 1.025 frame và graph 32 node trên Editor thật; offline CI không thay thế bước này.

Chính sách: **chỉ branch `v2`, không tạo tag hoặc GitHub Release đến khi người dùng yêu cầu chốt**.

## Phase 4.3a — Tube Generator (preview, 2026-11-25)

Bổ sung node **`tube` (`path` → `mesh`)** làm generator thay thế Ribbon trong typed Graph V1. Không thay đổi serial schema version (`version:1`), default Ribbon, hành vi của các file cũ hay policy dùng Shared JsonAsset.

**Sử dụng**: Trong SplineGeometryGraphRenderer Inspector → Visual Geometry Graph, bấm **Switch to Tube**. Graph sẽ thay mesh generator cuối `ribbon` bằng `tube`, giữ đường nối path, tùy chọn `uvMetersPerRepeat` và `capEnds`; tham số Ribbon riêng (`thickness`, `width`, `cornerMode`) được bỏ vì không có ngữ nghĩa tương đương. Ngược lại bấm **Switch to Ribbon**. Thêm Offset/Width trước Tube vẫn dùng được, và Width multiplier được áp dụng lên bán kính ống. Edit Shared Asset tiếp tục yêu cầu chế độ draft và xác nhận Save.

**JSON ví dụ**

```json
{
  "version": 1,
  "nodes": [
    {"id": "source", "type": "spline"},
    {"id": "tube", "type": "tube", "input": "source", "radius": 0.75, "radialSegments": 12, "uvMetersPerRepeat": 4, "capEnds": true},
    {"id": "output", "type": "output", "input": "tube"}
  ],
  "output": "output"
}
```

- `radius`: 0.025–50 (mặc định 1), bán kính spline mesh, nhân với Width Node.
- `radialSegments`: số nguyên 3–32 (mặc định 12). Với giới hạn 1.025 frame, mỗi ring có tối đa 33 đỉnh (kể cả đỉnh UV seam duplicate), bảo đảm không vượt giới hạn 65.536 vertices.
- `uvMetersPerRepeat`: 0.01–10000 (mặc định 5): UV V theo quãng đường; UV U chạy từ 0 đến 1 quanh vòng, có duplicate seam vertex để tránh nội suy UV sai.
- `capEnds`: tùy chọn (mặc định false), chỉ đóng hai đầu trên spline mở. Closed Spline không sinh cap.
- Normal dùng đạo hàm tiếp tuyến vòng và frame forward, hỗ trợ hệ vector transform sang MeshRenderer-local không đồng tỉ lệ. Hệ trục phản chiếu (negative determinant) được xét trong winding/normal; frame degenerate hoặc handedness đổi đột ngột được từ chối để không sinh mesh lỗi.
- Source frames, Knot, asset Mesh/material không bị sửa. Runner dùng cache theo từng node như Ribbon, lỗi validate/tessellation giữ mesh cũ. Frame giới hạn theo pipeline v1; không đảm bảo không tự cắt nhau khi radius lớn trên khúc cua hẹp.

**Chưa làm ở Phase 4.3a:** profile tuỳ biến, Tube có thickness/hollow, Mesh Deform, Multi-output graph, vertex smoothing tuỳ chọn và per-node profiling (Phase 4.3b+).

**Native acceptance (Cocos Creator 3.8.8):**

- [ ] Switch Ribbon ↔ Tube trong Inspector, nhận đủ trường Radius/Segments/UV/Cap, Undo/Redo và Prefab override vẫn đúng.
- [ ] Ống mở có/không cap; spline kín UV seam và không sinh nắp; MeshRenderer material/culling ổn.
- [ ] Parent non-uniform/negative scale, scale riêng output Node, spline dốc/roll cao, normal và winding đúng.
- [ ] Spline/Graph source không bị thay đổi; JSON invalid giữ mesh cũ. Shared JsonAsset draft yêu cầu Save mới sửa file.
- [ ] 1.025 frames / radialSegments=32 và closed knots trên Creator thật; CI chỉ kiểm thử headless.

Chỉ push nhánh `v2`, **không gắn tag hoặc phát hành Release**.

## Phase 4.3b — Profile Extrude Generator (2026-11-25, preview)

Bổ sung node **`extrude` (`path` → `mesh`)** trong typed Geometry Graph V1. Các Node `ribbon`/`tube` cũ và `DEFAULT_GEOMETRY_GRAPH` không đổi; không migration Scene/Prefab/JsonAsset.

### Profile dựng sẵn

`profileShape` là enum nguyên `0..2`:

| Giá trị | Profile | Hình học |
| --- | --- | --- |
| `0` | Rectangle | Thanh hộp chữ nhật, bốn góc cạnh sắc |
| `1` | Beveled | Thanh hộp vát bốn góc, tám cạnh |
| `2` | U Channel | Rãnh chữ U lõm, tám cạnh, cap theo diện tích thật (không bịt kín phần rãnh) |

Node hỗ trợ `width` và `height` riêng biệt (0.05–100, mặc định 1), `uvMetersPerRepeat` (0.01–10000, mặc định 5), `capEnds` (Boolean, mặc định false). `width` node upstream nhân **đều cả hai kích thước** của profile để bảo toàn tỉ lệ hình dạng, tương tự nhân radius của Tube.

Geometry: mặt cạnh có normal riêng (hard edges), UV U theo phần chu vi tương đối của mặt cắt, V theo khoảng cách dọc spline. Các nắp đầu sinh vertex/normal/UV riêng để không làm mềm cạnh; với profile U Channel dùng **ear clipping** thay vì triangle fan để tránh tự lấp rãnh. Closed spline không tạo nắp, dù `capEnds=true`. Winding theo determinant của frame local, bao gồm negative/mirrored transform; frame không hợp lệ hoặc đổi handedness đột ngột bị chặn.

### Sử dụng Inspector

Trong SplineGeometryGraphRenderer → Visual Geometry Graph, chọn **Use Extrude Profile** để đổi generator cuối từ Ribbon hoặc Tube. Chọn node `extrude` để chỉnh `width`, `height`, `profileShape`, UV, cap. Nút **Switch to Tube** vẫn đổi Extrude sang Tube (và Tube↔Ribbon như trước). Nếu muốn quay từ Extrude về Ribbon, chuyển qua Tube rồi bấm Switch to Ribbon. Các tham số không dùng chung giữa hai kiểu generator được reset; `uvMetersPerRepeat`/`capEnds` và `width` khi tương thích được giữ.

Có thể thêm `offset`, `width` trước Extrude; các graph có profile được validate giống graph Ribbon/Tube. Với Shared JsonAsset, chỉ chỉnh khi **Edit Shared Asset** mở bản nháp; Save vẫn cần xác nhận/checksum conflict, không có ghi source ngầm.

### Graph ví dụ

```json
{
  "version": 1,
  "nodes": [
    {"id": "source", "type": "spline"},
    {"id": "extrude", "type": "extrude", "input": "source", "width": 1.5,
     "height": 1, "profileShape": 2, "uvMetersPerRepeat": 4, "capEnds": true},
    {"id": "output", "type": "output", "input": "extrude"}
  ],
  "output": "output"
}
```

Cài bằng **Install Examples** sẽ có `assets/CocosSplinesExamples/GeometryGraph/BasicProfileExtrudeGraph.json`, không ghi đè bản đã chỉnh và không chép UUID `.meta` từ extension.

### Phạm vi kiểm thử và hạn chế

- [x] Regression headless: triangle winding, cap concave U area, hard-edge normal, bevel, reflected/anisotropic frames, open/closed, bounds, source-frame immutability, per-node cache, local Inspector change-dump và Shared draft.
- [ ] Native Cocos Creator 3.8.8: material culling/UV, nonuniform/negative parent scale, open/closed Spline, roll/tangent, Undo/Prefab override và refresh Shared JsonAsset; đo hiệu năng tại 1025 frames.
- [ ] Custom authored profile points/holes, bevel tuỳ ý, smoothing groups, hollow extrusion và profile asset editor: **chưa triển khai**, sẽ cần versioned schema/validator riêng.
- [ ] Mesh Deform generator, Multi-output và profiling theo node: Phase 4.3c trở đi.

Cả source spline, Knot, Mesh asset và vật liệu người dùng đều không được chỉnh sửa bởi generator. Không tạo Collider/NavMesh hoặc hình học Boolean tại giao nhau. Chỉ nhánh `v2`, không tag / GitHub Release.

## Phase 4.3c — Bounded Mesh Deform Generator (preview, 2026-11-25)

Đã nối CPU deformation kernel `SplineMeshDeformMath.deformMesh` vào typed Geometry Graph V1 qua node **`meshDeform`** (`path` → `mesh`). Graph mặc định Ribbon và phiên bản JSON `version:1` giữ nguyên. Node sử dụng **preset mesh được tạo nội bộ** thay vì tham chiếu asset nhập từ Project, vì typed Graph V1 mới có một cổng input `path`; Imported Mesh input/đa cổng sẽ cần thiết kế schema v2 riêng.

- `deformShape` (nguyên 0 hoặc 1): **Strip** — ribbon mặt phẳng, **Box Shell** — hộp bốn mặt cạnh sắc, không nắp hai đầu.
- `segments` (nguyên 2–64, mặc định 12): số phân đoạn dọc của mỗi mesh nguồn để đủ vertex uốn theo spline. Giá trị cao giúp bớt gãy tại khúc cua nhưng tốn CPU hơn.
- `repeats` (nguyên 1–16, mặc định 1): lặp mesh nguồn trên toàn chiều dài spline, phân bố theo **khoảng cách**. Khác với Repeat physical tile-length của component `SplineMeshDeform` standalone.
- `width` và `height` (0.05–100, mặc định 1): kích thước mesh nguồn; `height` tác động Box Shell; Width Node upstream nhân đều kích thước biến dạng.
- `uvMetersPerRepeat` (0.01–10000, mặc định 5): UV V theo quãng đường trong hệ local output frame.

Các frame của SplineContainer được biến đổi thành output-local bởi Graph Renderer hiện tại. Deform sử dụng nội suy giữa frame theo **sampled arc-length distance**, bảo toàn nguồn, hỗ trợ offset, widthFactor và xử lý hệ trục phản chiếu bằng đảo winding. Core/Inspector từ chối graph invalid, dữ liệu quá giới hạn hoặc frame degenerate. Runner giữ cache và Mesh cuối hợp lệ nếu evaluate thất bại, không sửa Prefab, Knot hoặc imported Mesh asset.

### Ví dụ

```json
{
  "version": 1,
  "nodes": [
    {"id": "source", "type": "spline"},
    {"id": "meshDeform", "type": "meshDeform", "input": "source",
      "deformShape": 1, "segments": 16, "repeats": 4,
      "width": 1.5, "height": 0.6, "uvMetersPerRepeat": 3},
    {"id": "output", "type": "output", "input": "meshDeform"}
  ],
  "output": "output"
}
```

**Inspector**: Nhấn **Use Mesh Deform**, chọn node để chỉnh Preset Shape, Segments và Repeats. Nút **Switch to Tube**/Use Extrude Profile có thể đổi generator trở lại. Shared JsonAsset chỉ được thay khi bấm Edit Shared Asset → Save, vẫn có checksum conflict review và xác nhận riêng.

**Install Examples** thêm `assets/CocosSplinesExamples/GeometryGraph/BasicMeshDeformGraph.json` cho project khi yêu cầu, không ghi đè file đã có.

### Kiểm thử / Hạn chế

- [x] Headless regression cho mesh nguồn strip và box, repeat count, UV distance, mirrored / nonuniform output frames, input widthFactor, frame distance lookup, graph validator, cache invalidation/rollback, local Inspector và Shared draft, Install Examples.
- [ ] Cocos Creator **3.8.8 native**: góc cua gắt, spline kín, scale âm/nonuniform, normals/culling, material, Undo/Prefab overrides, Save/Reload JsonAsset, performance 1.025 source frames.
- [ ] **Chưa** hỗ trợ imported Mesh Asset làm đầu vào của graph, physical-repeat trimming, automatic cap geometry trên Box Shell, collision/navmesh hoặc deform lồng nhiều mesh. Các tác vụ này cần schema và native AssetDB/renderer QA riêng.
- [ ] Phase 4.3d+: Multi-output Mesh Graph, per-node profiling, custom authored mesh/profile bindings.

**Lưu ý:** Mesh Deform Node khác với `SplineMeshDeform` standalone (đã hỗ trợ FBX/Mesh được import). Đây là preset demo an toàn để tái sử dụng cùng kernel trong Geometry Graph trước khi thêm `Mesh Asset` input port. Không có tag / Release, chỉ nhánh `v2`.

## Phase 4.3d — Multi-output Geometry Graph V2 (preview, 2026-11-25)

**Opt-in schema `version:2`** hỗ trợ từ **2–4 node `output`**, một `output` mặc định (root field vẫn là một Output ID), tối đa 32 node và đúng một `spline` source. V1 (`version:1`) vẫn chỉ có đúng một output, giữ nguyên JSON mặc định và tương thích với Scene/JsonAsset cũ; không migration ngầm. Không chấp nhận disconnected node/cycle, cả hai version đều có giới hạn 16 KiB.

**Cách dùng:** Visual Geometry Graph Inspector có ba nút **＋ Output Branch**, **Set Default Output**, **✕ Remove Output**:
- Add Output Branch nhân bản mesh generator hiện tại và nối nhánh mới vào cùng upstream path. Không nhân đôi Knot/source/mesh asset. Khi tạo nhánh đầu tiên, graph tự chuyển V1→V2; tối đa 4 outputs. Bạn có thể chọn từng Output Node rồi chỉnh generator/Offset/Width/parameter độc lập.
- Set Default Output chọn output được dùng khi renderer chưa gán Output ID.
- Remove Output chỉ xóa nhánh **không phải default**, đồng thời dọn các node không còn nằm trên nhánh output nào; khi còn một output, graph quay về V1 (có thể giữ ID output khác `output`). Không xóa default mà không chọn default khác trước.
- Thuộc tính mới **Output ID** trên `SplineGeometryGraphRenderer` (mặc định chuỗi rỗng): mỗi Renderer hiển thị đúng **một** output mesh. Bỏ trống để dùng graph `output`; nhập `outputPipe` hay output ID khác để chọn nhánh. Một `JsonAsset` dùng chung có thể gán cho nhiều Renderer, mỗi Renderer có Output ID riêng. Không tự tạo child node hay MeshRenderer.
- Khi dùng Shared JsonAsset, các thao tác vẫn read-only cho đến khi mở **Edit Shared Asset**. Save phải xác nhận, đối chiếu SHA-256; Compare/Rebase không ghi file. Inspector dùng native ui-prop dump cho Local Graph, Output ID và Prefab overrides.
- Runner biên dịch **toàn bộ output DAG** theo thứ tự phụ thuộc, tái sử dụng upstream và cache từng node. `evaluate(plan,context,selectedOutputId?)` trả một mesh clone cho output được chọn; `evaluateOutputs(plan,context)` trả bản clone của mọi output. Tất cả nhánh được validate/evaluate trước khi commit cache, do đó lỗi ở nhánh phụ cũng ngăn cập nhật, giữ mesh cũ. Thay `Output ID` không cần resample spline nếu revision world transform/source không đổi.

Ví dụ được cài qua **Install Examples**: `GeometryGraph/MultiOutputRoadTubeGraph.json`.

```json
{
  "version": 2,
  "nodes": [
    {"id": "source", "type": "spline"},
    {"id": "road", "type": "ribbon", "input": "source", "width": 4},
    {"id": "pipe", "type": "tube", "input": "source", "radius": 0.6},
    {"id": "outputRoad", "type": "output", "input": "road"},
    {"id": "outputPipe", "type": "output", "input": "pipe"}
  ],
  "output": "outputRoad"
}
```

**QA:**
- [x] Headless runtime/Inspector regression: V1 vẫn chạy, V2 compile/typing/cycle/reachability, đổi Output ID, branch-parameter dirty propagation, clone mesh và atomic cache rollback, thêm/xóa branch, đổi default/downgrade V2→V1, Shared JsonAsset review/rebase.
- [ ] Native Creator 3.8.8: gán **hai renderer nodes** cho cùng JsonAsset (mỗi renderer trỏ Output ID khác), Save/Reopen, Undo/Redo, Prefab overrides, hot reload asset-db, material/culling/wireframe và mesh ownership.
- [ ] Output slots trên cùng một Renderer (nhiều MeshRenderer/Materials), multi-input nodes, imported Mesh Asset port, custom output names/aliases và branching auto-layout chưa có. Per-node CPU timing đã được triển khai ở Phase 4.3e bên dưới; các tính năng Multi-output nâng cao vẫn cần API/serializer và native smoke riêng.

Chỉ push `v2`; không tạo tag hoặc GitHub Release.

## Phase 4.3e — Per-node CPU profiling (preview, 2026-11-25)

**Profile CPU · Cold / Warm** nằm dưới Visual Geometry Graph Inspector. Đây là nút chẩn đoán **on-demand**, không thêm serialized Scene field hoặc sửa Graph JSON/JsonAsset.

1. Chọn Node có `SplineGeometryGraphRenderer` đang bật, trỏ tới Spline hợp lệ (tối thiểu 2 Knot). Chọn đúng `Output ID` mong muốn nếu dùng Multi-output V2.
2. Bấm **Profile CPU · Cold / Warm**. Scene process dùng cache frame Spline đã có; nếu frame cache bị stale hoặc chưa tồn tại, renderer thực hiện **rebuild bình thường** trước, giữ cơ chế commit Mesh nguyên tử cũ. Sau đó tạo **GeometryGraphRunner riêng** cho profiling, không thay thế live runner/cache hoặc MeshRenderer đang bound.
3. Lượt **Cold** tính mới tất cả node; lượt **Warm** gọi cùng graph/context trên runner đó để đo cache hit. Bảng hiển thị `node ID`, `type`, thời gian CPU (ms) hoặc `cached`; tổng chỉ là tổng thời gian compute các node, không phải tổng thời gian dựng hình.
4. Khi graph thay đổi, Output ID đổi, Shared Asset refresh hoặc mở bản nháp chỉnh Shared, báo cáo cũ bị vô hiệu. **Không profile bản nháp chưa lưu:** phải Save Shared JsonAsset hoặc Discard Draft trước khi chạy profiling. Không tạo Scene snapshot, không ghi `graphJson`, `graphLayoutJson`, Prefab, Knot hoặc JsonAsset.

**Phạm vi thời gian:** thời gian đồng bộ của từng node trong Graph Runner, gồm path transform, tessellation, validation mỗi mesh. **Không bao gồm** đọc/parse JSON, biên dịch DAG, tạo World spline frames, MeshRenderer/GPU upload, gizmo, render pass hoặc Cocos lifecycle; do đó không dùng kết quả làm FPS benchmark. Đồng hồ dùng `performance.now()` khi có, fallback `Date.now()`; làm tròn ba chữ số thập phân. Cache hits có 0 ms compute (ghi `cached`); profiler chỉ hoạt động ở runner chẩn đoán để tránh overhead trên mọi frame. Profile cuối hợp lệ được bảo toàn nếu lần đo kế tiếp lỗi.

**API thuần:** `GeometryGraphRunner.setProfilingEnabled(true)`, `runner.profile` (immutable snapshot trả về), `runner.metrics` giữ contract v1 cũ. Có thể inject hàm clock vào constructor để test chính xác. `SplineGeometryGraphRenderer.profileGraph()` trả `{cold,warm,graphVersion,outputId,sampledFrames}`. Editor message `profile-geometry-graph` gọi qua Scene, không trả Mesh data, chỉ báo cáo nhỏ ≤32 node. Text format bị kiểm tra/giới hạn trước khi chèn bằng `textContent`, không HTML injection.

- [x] Regression tests: clock deterministic; cold/warm, per-node dirty cache, clone dữ liệu, lỗi node giữ báo cáo cũ, xử lý NaN timer, bounded output, Inspector invalidation, shared draft và renderer mesh ownership.
- [ ] Native Cocos Creator 3.8.8: độ chính xác của `performance.now()` trong Scene, thao tác Inspector sau selection switch, stale frame rebuild, hai renderer cùng JsonAsset, profiling trên spline lớn và GC overhead thực tế.
- [ ] **Phase 4.3f**: imported Mesh Asset input port & profile assets, nhiều MeshRenderer slot trên cùng một Node, đo chi phí graph compile/mesh upload & sampling/GPU performance riêng.

Chỉ push `v2`; không tag hoặc GitHub Release.

## Phase 4.3f1 — Typed Mesh Asset source input (preview)

Graph V1/V2 hỗ trợ **`meshAsset` → `meshDeform.meshInput`**, bên cạnh đầu vào path bắt buộc. Mesh Asset được gán tại thuộc tính native **Source Mesh** của từng `SplineGeometryGraphRenderer` (không nhúng asset UUID, đường dẫn hay vertex vào JSON). Shared JsonAsset có thể dùng trên nhiều renderer với Source Mesh riêng. Graph cũ không đổi.

**Cách dùng:** import Mesh/FBX có một submesh, bật **Allow Data Access**, bảo đảm có đủ phân đoạn dọc **trục +Z**. Trong Visual Graph, chọn node Mesh Deform và bấm **＋ Mesh Asset Input**; nút **✕ Mesh Asset Input** ngắt liên kết để quay về preset Strip/Box Shell. Nhấp socket `meshSource` ở node `meshAsset` rồi socket `asset` ở `meshDeform` để kết nối lại. Width/Height trở thành hệ số scale cross-section của imported mesh; Repeats 1–16, UV V theo chiều dài spline. `segments` và `deformShape` chỉ dùng với generated preset.

**Install Examples:** `GeometryGraph/ImportedMeshDeformGraph.json` tạo graph nguồn imported; người dùng gán Mesh Asset thật sau khi cài. Extension không phát hành mesh FBX mẫu và không tạo UUID giả.

**Giới hạn an toàn:** tối đa 1 meshAsset node mỗi graph, 4.096 source vertices, 24.576 indices, 4 MiB backing buffer, một submesh, graph tổng 32 nodes. Adapter dùng `SplineMeshRead` để đọc POSITION, UV0, normals (nếu có) và index từ Cocos Creator 3.8, sao chép mọi dữ liệu. Mesh nguồn không bị sửa. Source không thể thay thế cổng path. Graph cache tách meshAsset revision khỏi spline; data fingerprint đọc raw bytes khi Cocos cung cấp, còn thay đổi buffer không quan sát được phải bấm **Rebuild**. Invalid/missing asset hoặc unsupported format giữ nguyên MeshRenderer cuối hợp lệ. Shared Graph Compare/Rebase xem `meshInput` là thay đổi cấu trúc và không tự gộp.

**Giới hạn ở thời điểm Phase 4.3f1:** chưa có nhiều Mesh Asset slots, trục X/Y, source-length trim, skinned mesh hoặc multi-slot output. Slots, axis và Source Length đã được bổ sung ở Phase 4.3f2a/b dưới đây; multi-material/submesh và skinned mesh vẫn chưa hỗ trợ.

**QA còn cần trên Cocos Creator 3.8.8:** FBX readable/half-float, reimport & hot reload, material and culling, mirrored/nonuniform scale, Undo/Redo, Prefab override, Source Mesh cùng graph khác renderer, Scene save/reopen và performance. Regression headless bao phủ typed ports, immutable mesh, cache invalidation, bounds và draft workflow.

Chỉ push nhánh `v2`, không tag hoặc GitHub Release.

## Phase 4.3f2a — Mesh Asset slots A/B/C + Deform Axis X/Y/Z

Phát triển trên 4.3f1: mỗi `SplineGeometryGraphRenderer` có **ba Mesh Asset property** native: `sourceMesh` (Slot A = 0), `sourceMeshB` (Slot B = 1), `sourceMeshC` (Slot C = 2). Mỗi graph tối đa 3 node `meshAsset` với các slot duy nhất. Các mesh này vẫn là một submesh/readable và mỗi mesh nguồn tối đa 4.096 vertices, 24.576 indices và 4 MiB raw buffer. Graph V1/V2 cũ không cần migration: `meshAsset` thiếu `slot` mặc định 0, `meshDeform` thiếu `axis` mặc định 2 (Z).

**Dùng Visual Graph:** chọn `meshDeform` rồi bấm **＋ Mesh Asset Input**, graph thêm một `meshAsset` mới ở slot còn trống (ưu tiên A, B, C). Chọn node `meshAsset` để chỉnh `slot` bằng dropdown, chọn `meshDeform` để chỉnh `axis` = X(0), Y(1), Z(2). Nối cổng `meshSource` vào `meshDeform.meshInput` để **chia sẻ** mesh source giữa các nhánh; nhánh cũ chỉ mất nguồn khi không còn node nào phụ thuộc. Không tự chia sẻ slot khi tất cả ba slot đã sử dụng: phải nối một source có sẵn để thể hiện ý định rõ ràng.

**Trục deform:** đặt X khi asset được model dọc theo X, Y khi dọc Y, Z khi dọc Z. `SplineMeshDeformMath.deformMesh` thực hiện chuyển axis và điều chỉnh winding/normals. Generated preset Strip/Box Shell cũng đổi được trục (đổi hệ trục nguồn từ Z rồi sửa winding source để giữ outward-facing). X/Y/Z là **local source mesh axis**, không phải world axis của Spline. UV V tiếp tục tính theo spline distance.

**Cache và lifecycle:** mỗi `meshAsset` node nhận `meshRevision` độc lập của đúng native slot, nên thay asset B không làm dirty asset A hay các nhánh chỉ phụ thuộc A. Runner kiểm tra toàn bộ các output trước commit; thiếu/không readable ở một nhánh thì không thay mesh cuối đã render. `Spline` sampled world frames được reuse, và profiling cold/warm vẫn chạy trên runner chẩn đoán. Thay slot node trong Shared JsonAsset là **structural edit**, không auto-rebase. Mesh assets nguồn không bị mutate; mẫu JSON không lưu các UUID/bytes.

Ví dụ `Install Examples → GeometryGraph/DualMeshAxisGraph.json` chứa hai output `outputA` (mesh slot A, trục X) và `outputB` (mesh slot B, trục Y). Gán cùng graph cho hai renderer node, điền Source Mesh/Source Mesh B, và chọn Output ID riêng ở từng renderer.

**Test headless:** 3-slot validation/port typing, preset X/Y/Z winding/normal parity, imported axis mapping, cold/warm cache per-source, shared source linking, conflict handling, native renderer dual-source revision/rollback, example installer.

**Hạng mục còn lại sau Phase 4.3f2a:** nguồn imported >3 slots, renderer xuất đồng thời nhiều mesh/material slot trong *cùng một Node*, authored profile asset UI và Creator 3.8.8 native smoke. Source Length được triển khai ở Phase 4.3f2b dưới đây. Không tag/Release.

## Phase 4.3f2b — Source Length Repeat / Trim (2026-11-25)

Graph `meshDeform` đã dùng lại cơ chế **physical-length repeat** của standalone `SplineMeshDeformMath`. Tính năng là opt-in, vẫn hỗ trợ graph JSON `version:1` và `version:2`; **không migration**, không thêm field native lên component Renderer.

| Tham số | Giá trị | Mặc định | Ý nghĩa |
|---|---|---|---|
| `repeatLayout` | 0 Count, 1 Source Length | 0 | Count giữ cách stretch các tile trên toàn Spline. Source Length lặp theo chiều dài thật |
| `tileLength` | 0 hoặc 0.01–10.000 | 0 | 0 = chiều dài bounds của mesh theo axis; giá trị dương override chiều dài một tile theo đơn vị local của Renderer |
| `uvMode` | 0 Original, 1 Continuous, 2 Distance | 2 | Original giữ UV0/atlas gốc; Continuous cộng số tile vào V; Distance dùng chiều dài Spline chia `uvMetersPerRepeat` |
| `repeats` | 1–16 | 1 | Chỉ tác dụng trong Count; Source Length tự tính `ceil(pathLength/tileLength)` |
| `axis` | X=0, Y=1, Z=2 | Z | Chiều dọc mesh nguồn (cả preset và imported) |

### Cách dùng

1. Trong **Install Examples** chọn `GeometryGraph/SourceLengthTrimGraph.json`, gán FBX/Mesh readable (một submesh, Allow Data Access) vào **Source Mesh**.
2. Trong Visual Graph chọn `meshDeform`, đặt **Repeat Layout = Source Length (trim last tile)**. Dùng **Tile Length = 0** nếu đơn vị và chiều dọc của asset nguồn đã đúng; nhập giá trị local-unit dương để hiệu chỉnh do import scale. Chọn Axis X/Y/Z theo chiều dài mesh.
3. **UV Mode = Original UV atlas** dùng cho prefab đường ray, tà vẹt hoặc track có UV islands. Chọn Continuous nếu muốn UV V cộng một đơn vị/tile, Distance nếu dùng texture lặp theo mét/đơn vị đường.
4. Khi path không chia hết tile, tam giác ở **tile cuối được cắt tại mặt phẳng dọc** và nội suy vertex/UV/normal; đoạn dư **không bị kéo dãn**. Mesh asset nguồn được giữ nguyên; không tự tạo cap, collider, submesh hoặc MeshRenderer.
5. Chuyển lại `repeatLayout = 0` để khôi phục Count; Scene/Prefab/Shared JsonAsset vẫn theo workflow Undo, Save, checksum và draft như cũ.

**Giới hạn**: tối đa 256 tile physical theo từng node, 65.536 output vertices, 393.216 indices; compiler từ chối `tileLength` âm, nhỏ hơn 0,01 mà khác 0, lớn hơn 10.000, UV mode/layout ngoài phạm vi. Kernel preflight kích thước trước khi cấp phát mesh nhiều tile; mesh bị cắt vượt budget cũng bị từ chối. Một nguồn với axis bounds bằng 0 không thể dùng Source Length mặc định. Các path dùng quãng đường của frame ở hệ local renderer, không phải phép đo World chính xác khi scale không đồng đều; nhập Tile Length theo cùng hệ đơn vị đó.

**Cache và rollback**: đổi `tileLength`, `uvMode` hay `repeatLayout` chỉ làm dirty node `meshDeform` và những output phụ thuộc; upstream path và meshAsset cache được reuse. Evaluation và MeshRenderer sử dụng two-phase commit; không sửa Mesh asset khi lỗi. Một Shared JsonAsset dùng trên nhiều renderer được xử lý theo Output ID và Source Mesh riêng.

**QA**: headless regression kiểm tra repeat vật lý dài 2 trên path 5 (2 tile nguyên + tile cuối 1), UV0 tại mặt cắt, đường UV liên tục/distance, tileLength override, đường ngắn hơn tile, preset, path closed không sinh cap, giới hạn đồ thị và rollback. **Cần xác nhận native trên Creator 3.8.8**: FBX có UV atlas, ngược winding/mirrored scale, đường kín nối seam, vật liệu transparent, undo/reimport hot reload, Prefab overrides và thời gian xử lý mesh nhiều tile.

**Chưa bao gồm:** nhiều material/submesh trong cùng mesh imported, tự gắn end caps, source-axis resampling, lặp tile có offset phase, multi-renderer slot output trên cùng Node. Tiếp theo là 4.3g và native QA. Chỉ nhánh `v2`, không tag hoặc GitHub Release.

## Phase 4.3g1 — Indexed imported submesh selection (2026-11-25)

Cocos Creator 3.8 cho phép một imported FBX/Mesh có nhiều submesh. Trong Phase 4.3g1, **mỗi Graph Renderer vẫn xuất một mesh / một material**, nhưng có thể chọn submesh cụ thể từ một native Mesh asset nhiều phần, không bắt buộc tách FBX nguồn. Không thay đổi Graph JSON schema, renderer output node, scene topology hay MeshRenderer Materials đang được quản lý bởi người dùng.

**Native fields trên `SplineGeometryGraphRenderer`** (mặc định 0, lưu Scene/Prefab bằng Inspector như các field Cocos khác):

| Native Mesh slot | Native submesh index | Giá trị |
| --- | --- | --- |
| `sourceMesh` (A) | `sourceSubMesh` | 0–3 |
| `sourceMeshB` (B) | `sourceSubMeshB` | 0–3 |
| `sourceMeshC` (C) | `sourceSubMeshC` | 0–3 |

**Dùng ví dụ:** bấm **Install Examples**, chọn `GeometryGraph/SubMeshSelectionGraph.json`. Gán **cùng một imported readable Mesh asset** (đã bật Allow Data Access) vào Source Mesh A và Source Mesh B. Đặt Source Submesh A = 0, Source Submesh B = 1 trên mỗi renderer. Một renderer có `Output ID=outputA`, renderer khác có `Output ID=outputB`. Có thể gán material riêng qua field **Material** của Graph Renderer hoặc qua MeshRenderer. Plugin **không** tự gán material theo tên FBX; không tạo child hoặc MeshRenderer.

**Ràng buộc:** asset có 1–4 submeshes; phải chọn index nguyên từ 0 đến `submeshCount-1`; mỗi submesh được chọn phải có POSITION/indices tam giác hợp lệ, tối đa 4096 vertices, 24576 indices; toàn buffer không quá 4 MiB. Nếu source primitive công bố `primitiveMode`, loại khác `TRIANGLE_LIST` bị từ chối. Decoder sử dụng `readAttribute(index)`, `readIndices(index)` và format theo đúng submesh index; normal/UV0 là tùy chọn theo import format hỗ trợ. Mỗi submesh được sao chép thành geometry riêng để deform; không ghi asset nguồn.

**Cache:** `sourceSubMesh` là thành phần của renderer signature, và output revision chứa cả submesh index lẫn fingerprint dữ liệu đã giải mã, nên đổi index chỉ làm dirty meshAsset node tương ứng và các node downstream; Spline source và nhánh khác vẫn reuse cache. Index sai hoặc submesh thiếu attribute giữ nguyên generated mesh đã bound (two-phase commit); Shared JsonAsset và các renderer khác không bị sửa.

**Chưa hỗ trợ ở Phase 4.3g1:** gộp nhiều submeshes thành một generated Mesh chứa các primitive/material slots trên cùng MeshRenderer, source Mesh nhiều hơn bốn submesh, auto-material từ FBX, skinned source, biên tập UV island, tự chọn material slot theo submesh. Đây là mục Phase 4.3g2 và cần Cocos Creator 3.8.8 native smoke trước khi xác nhận.

**Native QA còn cần:** import FBX có 2–4 submesh với VertexBundle khác nhau; chọn Source Submesh A/B/C và đổi khi Scene đang mở; test Material, culling, UV0/normal, reimport hot reload, Prefab overrides và Undo/Redo; đo profiling trên mesh dài có Source Length. Chỉ push `v2`, không tag/Release.

## Phase 4.3g2a — Render All Outputs on one MeshRenderer (2026-11-25)

**Opt-in**: bật `renderAllOutputs` / **Render All Outputs** trên `SplineGeometryGraphRenderer` đã tham chiếu Graph JSON v2 với 2–4 `output` node. Trong chế độ này, **chỉ có một native Mesh và một MeshRenderer trên Node**; các output được tạo thành nhiều **submesh primitives** trong một Cocos `Mesh`, mỗi primitive dùng một slot material khác nhau. **Không tự tạo child, MeshRenderer, Prefab, JsonAsset hoặc Scene node mới.**

Với `renderAllOutputs=false` (mặc định), component giữ đúng behavior cũ: `outputId` chọn một nhánh và `utils.createMesh` tạo single mesh. Trong chế độ Render All Outputs, `outputId` được bỏ qua; toàn bộ các nhánh của V2 DAG đều được validate và dựng. V1 / graph có ít hơn 2 hoặc nhiều hơn 4 output bị từ chối, và **mesh thành công cuối cùng vẫn được giữ nguyên**.

### Thứ tự output và material

Cocos Creator 3.8 quy định mỗi primitive của MeshRenderer tương ứng một material slot. Extension sắp xếp các Output Node ID **theo thứ tự chữ cái**; material slots được gán theo thứ tự này, bất kể thứ tự khai báo trong JSON. Hãy dùng `getRenderedOutputIds()` (bản sao danh sách sau commit) để kiểm tra thứ tự thực tế. Các trường native:

- `material` (Material A) → primitive 0, Output ID đầu tiên.
- `materialB` → primitive 1, Output ID thứ hai.
- `materialC` → primitive 2, Output ID thứ ba.
- `materialD` → primitive 3, Output ID thứ tư.

Trường Material nào null thì **giữ material đã gán thủ công trên MeshRenderer**, nếu có; nếu không, dùng fallback unlit do component quản lý. Extension không đọc/gán material import từ FBX vào các slot khác và không xóa manual material khi đổi chế độ. Khi destroy, chỉ dọn generated Mesh và fallback do component sở hữu.

**Ví dụ Install Examples:** `GeometryGraph/MultiMaterialOutputsGraph.json`, có `outputExtrude`, `outputRoad` và `outputTube`. Sau khi gán JsonAsset này vào Graph Renderer, bật **Render All Outputs** rồi chọn `Material`, `Material B`, `Material C`. Theo thứ tự sort, Slot 0 = Extrude, Slot 1 = Road, Slot 2 = Tube. Một Node sẽ render cả ba mesh bằng một MeshRenderer, dùng ba submodels/material slots của Cocos. `Output ID` không được dùng khi mode này bật.

### Kiến trúc

- `GeometryGraphRunner.evaluateOutputs` validate/compute tất cả nhánh v2 trên chung world frames và node cache, clone geometry riêng. Những node upstream dùng chung không bị tính hai lần; node bị sửa chỉ dirty nhánh phụ thuộc.
- `SplineGeometryGraphMultiMesh` đóng gói mảng vertex POSITION XYZ + NORMAL XYZ + UV0 (32 bytes/vertex), index `uint16`, và một vertexBundle/indexView/primitive mỗi output. Dùng Cocos Engine **v3.8.8 `Mesh.reset({struct,data})`** vì `utils.createMesh` chỉ tạo một primitive. Bounds tính trên toàn bộ nhánh, giúp renderer culling chính xác.
- An toàn: tối đa 4 output, tổng ≤65.536 vertices, ≤393.216 indices, ≤8 MiB buffer, mọi index phải nội bộ primitive và dưới giới hạn 16-bit. Mọi nhánh được validate **trước khi** tạo transient Mesh; lỗi render không thay đổi MeshRenderer.mesh hiện tại. Scene không ghi bất cứ dữ liệu mesh nào; chỉ serializes các property config native.
- Gizmos wireframe (khi bật) kết hợp các output với index offset; dữ liệu đó là preview, không phải geometry hiển thị/một nhóm vật liệu mới. Renderer thực vẫn dùng submesh primitives độc lập.
- Nếu `Mesh.reset`/MeshRenderer assignment lỗi, MeshRenderer giữ mesh trước đó và mesh tạm được destroy. Nếu thành công, mesh cũ do component sở hữu được destroy; mesh asset/renderer bên ngoài không bị destroy.

**QA cần kiểm thử trong Cocos Creator 3.8.8:** ba materials trên Road/Tube/Extrude, culling bounds, shadows/PBR và normal, đổi Output ID ↔ Render All Outputs, Undo/Redo, Prefab overrides, Scene reopen, shared JsonAsset reimport, chọn mesh import nhiều submesh và profiling. CI headless chỉ xác nhận packing, typed DAG và ownership/mock API; không thay thế visual QA/GPU inspection.

**Chưa có:** manual Output ID → material slot reorder, imported material auto-binding, gộp nhiều đồ thị không cùng Spline, skinned mesh/collider per material, baking multi-submesh thành project-owned Mesh asset. Tiếp theo Phase 4.3g2b và native acceptance. Vẫn chỉ push `v2`, không tag/Release.

## Phase 4.3g2b1 — Per-renderer Output → Material slot reorder (2026-11-25)

Bật **Render All Outputs** rồi dùng **Render All Outputs · material slot order** trong Inspector Geometry Graph. Mỗi hàng là một slot **Material A/B/C/D**; nhấn ↑/↓ để chuyển Output Node, hoặc **Reset alphabetical order**. Trường serialized **Output Order** cũng hỗ trợ chuỗi `outputRoad,outputPipe`, yêu cầu **đúng và đủ 2–4 Output ID**, không trùng. Giá trị rỗng giữ thứ tự alphabet cũ cho tất cả Scene/Prefab.

Thứ tự thuộc **renderer**, không ghi Shared JsonAsset hay thay đổi Material A/B/C/D. Single-output mode bỏ qua trường này. Reorder hợp lệ pack lại primitives nhưng tái sử dụng geometry cache và source frames. Sai thứ tự bị từ chối trước khi cấp phát Mesh và giữ mesh/mapping cuối cùng. Commit property qua native `ui-prop` để Editor quản lý Undo/Prefab. **Cần smoke test Cocos Creator 3.8.8** cho Undo/Redo, nested Prefab, Scene reopen, PBR/FBX/GPU. Không có auto imported-material binding hoặc authored profile asset. Chỉ `v2`, không tag/Release.

## Phase 4.3g2b2a — Imported model MeshRenderer material binding (v2 preview)

**Vì sao cần Model MeshRenderer:** Trong Creator 3.8, `Mesh` lưu geometry/submesh; material thực tế được cấu hình trên `MeshRenderer` của model FBX/glTF và các primitive được render qua material slot. Vì vậy chỉ kéo một `Mesh` vào Graph Renderer **không đủ** để suy ra imported material. Tính năng này dùng tham chiếu Cocos native, không đọc đường dẫn FBX/material UUID từ Graph JSON, không mutate model nguồn.

**Cách sử dụng:**
1. Dùng Geometry Graph V2 với **Render All Outputs** bật; gán một/một số `Mesh Asset Input` vào các nhánh `Mesh Deform`. Kéo mesh readable vào **Source Mesh A/B/C**, chọn **Source Submesh A/B/C** đúng chỉ số import.
2. Thêm prefab/model FBX hoặc glTF đã import vào Scene để có `MeshRenderer` với material đúng ở submesh tương ứng. Bật **Auto Bind Imported Materials** trên Graph Renderer.
3. Gán **Material Source Renderer** (A), **Material Source Renderer B/C** trỏ đến `MeshRenderer` của model nguồn chứa **cùng đối tượng Mesh asset** với Source Mesh A/B/C. Các slot có thể dùng chung một renderer khi cùng một Mesh có nhiều submesh.
4. Bật `Render All Outputs`; Output Order (mặc định alphabet) quyết định Material A/B/C/D. Renderer tự truy vết `meshAsset` trong DAG của **từng Output**, lấy `sourceRenderer.getSharedMaterial(sourceSubMesh)` để gán cho slot đầu ra tương ứng. Output procedural thuần (`ribbon`/`tube`/`extrude` không nhập `meshAsset`) giữ material thủ công/fallback. **Material A/B/C/D được gán thủ công luôn có ưu tiên cao hơn** imported material.

**Tương thích & an toàn:** mặc định Auto Bind=false, không thay hành vi cũ. Chỉ áp dụng trong Render All Outputs. Material nóng trên model đổi thì slot tự đồng bộ trong `update` mà **không tái tạo Mesh** hay dirty Geometry Graph. Không tự tạo model, scene child hoặc material instance. Thiếu source MeshRenderer, source renderer trỏ sai Mesh, thiếu material tại selected submesh hoặc branch import mơ hồ: fail-closed, giữ last-good Mesh/material khi rebuild. Commit Mesh + material dùng rollback best-effort nếu native setter thất bại. Mỗi Source Mesh slot hỗ trợ 0–3 theo giới hạn hiện tại; không tự đọc prefab chưa instantiate hoặc tự extract Material từ FBX không có renderer.

**Headless QA:** core DAG source tracing, per-submesh mapping theo Output Order, manual override, live material update không rebuild, mismatch/missing references giữ last-good, injected material-setter failure rollback, cùng source Mesh cho nhiều slot. **Native smoke còn cần Cocos Creator 3.8.8:** model FBX/glTF có 2–4 submesh/material, reimport, PBR/shadow/GPU, tham chiếu model Prefab, Undo/Redo, nested prefab overrides và save/reopen. Chỉ push `v2`, không tag/Release.

## Phase 4.3g2b2b1 — Author-owned Extrude Profile JsonAsset (v2 preview)

**Profile JSON v1:** dạng `{"format":"cocos-splines/profile","version":1,"points":[{"x":-0.5,"y":-0.5},...]}`. Chấp nhận 3–16 điểm `x/y` hữu hạn trong [-1,1], thứ tự CCW, contour đơn (không holes), không collinear/overlap, cạnh tự cắt/chạm, cạnh zero-length; diện tích >0.0001. Không cho runtime expressions, SVG path hay code tùy ý. Polygon được kiểm tra và copy trước khi extrude, không ghi ngược vào JsonAsset. Concave cap dùng ear clipping; normals hard-edge giống preset, chịu reflected/nonuniform frames theo kernel hiện tại.

**Cách dùng:** chọn `Extension → Cocos Splines → Install Examples`. Gán `GeometryGraph/AuthoredProfileExtrudeGraph.json` vào **Graph Asset** hoặc paste vào Graph JSON. Gán `GeometryGraph/Profiles/LProfile.json` cho **Profile Asset A**, `GeometryGraph/Profiles/OctagonProfile.json` cho **Profile Asset B** trên `SplineGeometryGraphRenderer`. Chọn **Profile Asset Slot A/B/C** ở Extrude card (node chỉ lưu `profileSlot:0/1/2`) hoặc **Built-in preset (default)** để trở lại Rectangle/Beveled/U Channel. Có thể bật **Render All Outputs** để render hai profile khác nhau bằng hai material slots trên cùng một MeshRenderer.

**Tương thích:** profileSlot không có thì preset gốc không thay đổi; graph V1/V2 và saved Scene vẫn tương thích. Profile asset là native reference trên mỗi renderer, không nhét points/asset UUID vào shared graph. Các renderer dùng cùng graph có thể gán asset khác nhau. Sửa một profile asset chỉ dirty các Extrude node dùng slot đó cùng downstream outputs; upstream path và các nhánh khác reuse cache. Asset slot không dùng không đổi signature.

**An toàn & QA:** strict schema, không cấp phát từ input không hợp lệ, không ghi source; thiếu profile, clockwise, self-intersection hoặc quá giới hạn giữ last-good Mesh. Headless tests: cap area L concave, valid/invalid schema, cache isolation, runtime per-slot revisions, hot-edit/missing-asset rollback, visual selector preset reset và Install Examples no-overwrite.

**Pending native Cocos Creator 3.8.8:** JsonAsset import/Inspector, Undo/Redo, Prefab overrides, save/reopen, GPU/PBR material/normal, model FBX integration và profile editor visual drag. Không tag hoặc GitHub Release.

## Phase 4.3g2b2b2a — Authored Profile Editor UI (v2 preview)

**Trong Inspector:** gán native `Profile Asset A/B/C` trên `SplineGeometryGraphRenderer`, mở mục **Authored Profile Editor · JsonAsset drafts**. Chọn slot A/B/C, nhấn **Edit Profile Asset…** để đọc file JsonAsset đang có trên đĩa. Polygon SVG dùng tay cầm để chọn/kéo point; X/Y cho phép nhập chính xác, **Add point after selection** và **Remove selected point** cập nhật bản nháp. Profile phải giữ CCW với 3–16 đỉnh, không có điểm trùng, cạnh thẳng hàng, giao cắt hoặc ra ngoài [-1,1]. Chỉnh sửa không ghi Source/Scene tự động. Nhấn **Save Profile JSON…** để hiện hộp thoại xác nhận native, hoặc **Discard Profile Draft** để bỏ chỉnh sửa.

**Chống ghi đè:** Editor giữ bản chụp SHA-256 của profile file; main process xác nhận selected renderer, profile slot, Asset UUID, đường dẫn thực trong `Project/assets` và hash trên đĩa **trước và sau** hộp thoại. Save dùng sibling temp file độc quyền và rename; .meta UUID không bị chạm. Nếu nguồn đổi bên ngoài, dialog Cancel, khác binding hoặc dữ liệu không hợp lệ, bản nháp vẫn giữ trong Inspector để người dùng chọn cách xử lý. AssetDB refresh sau write, thất bại refresh được cảnh báo (file đã ghi), cần refresh thủ công. Ghi JsonAsset không thuộc **Scene Undo/Redo**. Thay binding asset đang edit sẽ đóng bản nháp để không lưu nhầm asset.

**Giới hạn hiện tại:** chỉ **một contour polygon CCW** đã có file JsonAsset (không tự tạo asset), thêm điểm bằng offset nhỏ trên cạnh đã chọn (không phải boolean path tool). Mỗi thao tác phải tạo hình dạng hợp lệ; không hỗ trợ holes, curve handles hay UV unwrap per-edge. Headless tests kiểm tra hình học & Editor IPC / hash conflict / Cancel / preserve draft / symlink / meta isolation. Chưa xác nhận native Cocos Creator 3.8.8 Undo/Prefab, svg pointer capture, GPU extrusion, FBX/glTF, PBR. Chỉ `v2`, chưa tag/Release.

## Phase 4.3g2b2b2b1 — Interactive Profile Edge Editing + Draft History (v2 preview)

Trên **Authored Profile Editor**, các điểm màu xanh là vertex handles, điểm giữa cạnh màu xanh lá là edge handles. Click/chạm và kéo vertex để di chuyển một đỉnh; kéo **edge** để di chuyển đồng thời **hai đầu mút** (không scale hay thay topology). Click edge rồi chọn **Insert at selected edge** để thêm một đỉnh hơi nhô ra ngoài contour CCW, tránh cạnh collinear (kernel Extrude hiện yêu cầu các góc khác 180°). Tùy chọn **Drag Snap: Free / 0.01 / 0.05 / 0.10** làm tròn chuyển động trên profile-local XY; không áp vào cấu trúc Graph hay UV.

**Undo Draft / Redo Draft** (hoặc Ctrl+Z, Ctrl+Shift+Z/Ctrl+Y khi focus trên Profile SVG) chỉ ảnh hưởng bản nháp Profile trong Inspector: tối đa 32 snapshot; mỗi lần kéo pointerdown→pointerup là **một** bước Undo, không phát sinh lịch sử cho từng frame. Input X/Y, thêm hoặc xóa đỉnh là các bước riêng. Thao tác không hợp lệ (chạy ra [-1,1], self-intersection, CW, collinear, giới hạn 16 vertex) bị reject và không thay đổi last-valid draft. Sau khi **Save Profile JSON…** thành công, Undo/Redo draft được reset; không có khả năng undo file JsonAsset đã ghi bằng Scene Undo.

**Chưa có:** UV per-edge/seam/unwrap authoring, holes, multi contour, native Cocos Creator 3.8.8 visual drag/input/GPU acceptance. Profile JSON v1 giữ nguyên, các project cũ tương thích; không tag/Release, chỉ `v2`.

## Phase 4.3g2b2b2b2a — Authored Profile UV0 seam and edge weights (v2 preview)

Profile JsonAsset v1 can optionally contain uv: {seamEdge: 2, edgeWeights: [1,2,1,1]}. Without uv, all previously saved Scenes/Profiles use the original perimeter UV mapping. seamEdge is a zero-based index into the CCW contour; the chosen edge begins at normalized U=0. edgeWeights is an optional array of exactly one finite value in [0.25,4] for every polygon edge (default every weight=1). Each edge contributes its actual width/height-scaled perimeter length multiplied by its weight to the U budget, normalized across the entire contour. U remains in [0,1]; V remains the old spline-distance/uvMetersPerRepeat. Cap x/y UV, normals, triangle count/winding, and vertex geometry remain unchanged.

In Authored Profile Editor, select an edge midpoint and change Edge UV weight or press Set UV seam at selected edge; the seam is highlighted pink. Reset UV mapping removes the optional uv section entirely. Undo/Redo Draft applies to seam/weights as to geometry; the source JsonAsset is never written before explicit Save confirmation. Inserting an edge duplicates the source edge weight on both new edges; removing a point drops the removed outgoing edge weight and remaps the seam index to the closest surviving prior edge when necessary. Invalid indices, incorrect weight cardinality, NaN/Infinity, or out-of-range weights are rejected before mesh creation, preserving the previously committed mesh.

Install Examples now also includes GeometryGraph/Profiles/UVSeamProfile.json as a standalone sample; assign it to Profile Asset A/B of AuthoredProfileExtrudeGraph and enable Render All Outputs to inspect the mapping. The installer skips existing project files and never overwrites customized profile JsonAssets. Cached profile fingerprints include both points and uv; changing B's seam/weights only rebuilds dependent Extrude B and its downstream output, not other branches or spline samples.

Headless tests cover runtime/editor schema parity, normalized U shares and seam rotation, no geometry/normal/cap mutation, index remapping on insert/remove, Undo/Redo/Reset/save draft, renderer hot-edit + invalid UV rollback. Remaining tasks: UV islands, per-edge physical texel-density target, holes/multi-contour and native Cocos Creator 3.8.8 SVG/PBR/GPU/Undo/Prefab/FBX smoke tests. Only v2; no tag or GitHub Release.

## Phase 4.3g2b2b2b2b1 — Profile Library templates (V2 preview)

In the Geometry Graph Inspector, bind an existing Profile Asset A/B/C, click **Edit Profile Asset…**, choose a built-in **Profile Library** entry and click **Load Preset into Draft**. Templates: Rectangle, Beveled Rectangle, U Channel, L Section, Octagon and UV Seam Example (with UV seam/edge weights). Each template is a bounded native-compatible `cocos-splines/profile` v1 simple CCW polygon. The library returns fresh canonical JSON; it never mutates the original preset or a native asset. This action **replaces the draft's geometry and UV metadata** (it does not merge them); Undo Draft returns to the previous profile in one step, Redo reapplies it. The result is only written after the existing **Save Profile JSON…** confirmation and hash/UUID checks. Select an existing author-owned JsonAsset first: this phase does not silently create or overwrite assets. The normal `Install Examples` command still provides project-owned starter JSONs.

## V2 preview packaging: one ZIP, no inner ZIP

`npm run package:preview` now creates the directly-installable **directory** `builds/cocos-splines/`, and rejects nested archive files or symlinks before upload. GitHub Actions `upload-artifact@v4` creates the **only ZIP** in the download. The archive contains the extension's `package.json`, `dist/`, `assets/`, `docs/` and `PREVIEW_BUILD.txt` directly at its root. Create `<project>/extensions/cocos-splines/` and extract the downloaded ZIP **once directly into that directory**. Do not extract an inner ZIP; none is shipped. CI verifies the staged package and its root structure before artifact upload. Build remains `v2`-only and does not create a tag or GitHub Release.

## Phase 4.3g2b2b2b2c1 — Nominal physical U repeat for authored Profiles

Add an optional JSON field inside Profile v1 `uv`: `"uMetersPerRepeat": 1.5` (range **[0.01, 10000]**, finite numeric only). This changes side UV0 U **only**: weighted physical perimeter edge lengths (nominal `Extrude width`/`height`, multiplied by each `edgeWeights[i]`) are divided by `uMetersPerRepeat` instead of by total weighted perimeter. With `seamEdge`, U=0 starts at that edge and wraps continuously around the contour in a single cycle; U may exceed 1, enabling texture repeats. V keeps `distance / uvMetersPerRepeat` from the Extrude node. This does not modify geometry, triangle indices, side normals, caps or cap UVs.

Backward compatibility: omit `uv.uMetersPerRepeat` to preserve the existing normalized [0,1] perimeter U mapping, even when custom `seamEdge`/`edgeWeights` exist. This new field is purely opt-in on authored Profile JsonAsset slots, not a change to built-in profile shapes or Graph JSON schema. Runtime + Inspector reject missing/malformed number, negative, zero, NaN/Infinity or outside [0.01,10000], keeping last-good mesh. Existing per-slot Profile JSON revision hashing already causes only affected Extrude/output branches to recompute.

In **Authored Profile Editor**, the `Side U meters/repeat` input sets a metric U tile length in the *unsaved draft*. `Use Normalized U` clears only this field, preserving seam/edge weights (and drops the `uv` object if it becomes empty). All changes work with Draft Undo/Redo and require the existing explicit asset save confirmation; no Scene mutation. The new `GeometryGraph/Profiles/UVMetricProfile.json` is installed through **Install Examples** without overwriting existing user files.

**Limit:** Physical U length is computed for the *nominal* section width/height before per-frame spline `widthFactor` or world transforms. Strong taper, nonuniform world scale and arbitrary frame deformation can change final in-world texel density. Per-frame world-space texel correction and multi-island UV editing remain separate roadmap work. CI headless tests verify normalized default, weighted/seamed metric U, different width, cap/normals/indices preserved, validation, hot cache B-only and Inspector Undo/Redo. Native Creator 3.8.8 PBR/material/GPU and Prefab/Undo still require manual smoke tests.

## Phase 4.3g2b2b2b2c2a — Create new Profile JsonAsset from Library / Export Draft

Trong **Geometry Graph Inspector → Authored Profile Editor**, chọn một preset từ **Profile Library** rồi nhấn **Create Preset JSON…** để xuất preset thành một JsonAsset mới ngay cả khi chưa gán Profile Asset A/B/C. Nếu đã mở một Profile và chỉnh hình dạng/UV trên draft, nhấn **Export Draft As New JSON…** để tạo asset mới từ draft hiện tại; không sửa asset gốc, không kết thúc draft và không đẩy dữ liệu vào Scene. Cả hai đều mở native **Save** và hộp thoại xác nhận; nhấn Cancel không tạo file. Chỉ cho tạo `.json` mới trong thư mục thật bên dưới `<project>/assets/`, thư mục cha phải tồn tại. Reject symlink traversal, path bên ngoài project, JSON không hợp lệ, file đã tồn tại hoặc file `.meta` mồ côi. Tạo file bằng exclusive `wx` để không ghi đè khi có concurrent create; Cocos AssetDB refresh rồi tự import JsonAsset và tạo `.meta` theo cơ chế native, extension không ghi `.meta` hoặc UUID thủ công. Nếu AssetDB refresh thất bại, file vừa tạo vẫn tồn tại và Inspector báo cần refresh thủ công.

**Quan trọng:** Export KHÔNG tự gán asset vào Profile Asset A/B/C hoặc sửa Graph JSON/Scene/Prefab, tránh asset reference không có Undo. Gán asset mới thủ công vào slot mong muốn để thử. Save Profile JSON… vẫn là thao tác riêng để cập nhật **existing** asset có checksum guard. Có thể mở một draft, lưu thành asset mới, sau đó Discard Draft hoặc tiếp tục chỉnh draft nguồn mà không ảnh hưởng asset đã export. Test headless có path traversal, symlink, orphan `.meta`, overwrite, Cancel, giao thức xác nhận native, asset ref mismatch, refreshPending và Inspector draft isolation.

**Giữ nguyên:** ZIP CI chỉ một lớp, không tạo tag/Release. Hạng mục tiếp theo là UV islands/per-face unwrap và world-space texel density khi taper, cùng native Creator 3.8.8 acceptance.

## Phase 4.3g2b2b2b2c2b1 — Per-frame side U metrics for tapered authored Profiles

Opt-in `uv.uFollowFrameScale: true` on Profile JsonAsset v1 **requires** an existing finite `uv.uMetersPerRepeat` in [0.01,10000]. Default (field omitted/false) continues the prior **nominal** U mapping without any geometry, normal, cap, cache or serialized profile changes. With true, each spline frame computes the **actual local emitted cross-section edge length** from `frame.right`, `frame.up`, `frame.widthFactor`, authored points and the Extrude `width/height`. Multiplying by the existing `uv.edgeWeights` and rotating by `uv.seamEdge` yields per-ring U for each side band; the section's U spans more/fewer repeats when it widens/narrows. Side V remains spline distance / Extrude `uvMetersPerRepeat`. UV seam continuity, cap UV, normals, topology, indices, vertices and ownership unchanged. The toggle follows all draft validation, Undo/Redo, discard and explicit Asset Save rules.

**Scope limitation:** "frame-local" refers to the geometry emitted by the Extrude kernel; an external Node/world transform applied after mesh creation is **not** included. This feature does **not** promise constant post-transform *world-space* texel density under parent nonuniform scale, changing material UV transform or perspective. Taper causes intentional UV shear between rings because physical U differs along V; this is not a bespoke UV island unwrap. Frame normals/caps are not remeshed. Invalid flag values (anything but boolean), enabled without metric length, invalid/degenerate frame basis, or UV overflow are rejected. The renderer graph's existing JsonAsset revision invalidates dependent Extrude/output nodes only; warm cache remains otherwise unchanged.

**Inspector:** With an existing edited authored Profile and a numeric **Side U meters/repeat**, toggle **Follow taper / frame scale**. Toggling stages only a draft; Undo/Redo works, and clearing Side U meters/repeat clears the dependent flag safely. `Install Examples` includes `GeometryGraph/Profiles/UVTaperProfile.json` for testing with Width and frame WidthFactor. No tag/Release; ZIP artifact remains one layer.
