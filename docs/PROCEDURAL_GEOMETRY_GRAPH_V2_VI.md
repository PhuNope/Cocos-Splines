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
