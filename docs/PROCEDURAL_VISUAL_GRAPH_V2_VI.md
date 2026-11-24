# Cocos Splines V2 — Phase 4.2a: Visual Geometry Graph Inspector

## Phạm vi triển khai

**Visual Geometry Graph** là một canvas dựng node bên trong Inspector của component `Splines.SplineGeometryGraphRenderer`, hoạt động cùng graph JSON v1 đã có ở Phase 4.1. **Không cần mở cửa sổ/panel riêng**, không dùng web runtime hoặc plugin Editor ngoài Cocos Creator 3.8.x. Canvas là trình soạn thảo cho graph đã được serialize trong Scene/Prefab; runtime chỉ xử lý graph JSON, không xử lý UI.

### Các thao tác

1. Chọn Node chứa **SplineGeometryGraphRenderer** trong Hierarchy.
2. Gán SplineContainer (ít nhất hai Knot). Mở nhóm **Visual Geometry Graph · typed sockets** ở cuối Inspector.
3. Cuộn ngang canvas để xem các node. Node **Spline** có output path, node **Offset/Width** dùng input path và output path, node **Ribbon** nhận path và xuất mesh, node **Output** nhận mesh.
4. Nhấn **+ Offset** hoặc **+ Width** để thêm node transform ngay trước Ribbon. Mỗi node có ID mới ổn định (offset1, width1, ...).
5. Chọn một card để sửa tham số trong bảng bên dưới: right/up, multiplier, ribbon width/endWidth/UV length/thickness/cap ends/corner mode. Editor chặn thông số không finite hoặc vượt giới hạn trước khi ghi.
6. Nhấn **socket Output** ở node nguồn, rồi **socket Input** ở node đích. Socket được kiểm tra theo kiểu path/mesh và quy tắc DAG. Trong pipeline tuyến tính V1, nối một transform vào trước transform khác sẽ **di chuyển node đó trong chuỗi** và giữ lại mọi node khác, không tự xóa node.
7. Nhấn **✕ Remove** để xóa Offset/Width đã chọn và nối hai phía lại; không cho xóa Spline/Ribbon/Output bắt buộc.
8. Kéo **tiêu đề card** để sắp xếp vị trí; nhấn **Auto Layout** để trở về bố trí tự động. Có thể chọn card rồi dùng phím **mũi tên** (8 pixel) hoặc Shift+mũi tên (24 pixel) để dịch bố trí.
9. Bật Rebuild On Change để geometry cập nhật sau các thay đổi graph. Nếu tắt, nhấn **Rebuild Graph**. Thay đổi bố trí card không đổi geometry và không làm resample spline.

## Hai property có nhiệm vụ khác nhau

| Property | Nội dung | Có ảnh hưởng geometry? |
|---|---|---|
| `graphJson` | DAG phiên bản 1, node ID/type/input + tham số | Có. Runtime validator + graph runner nhận thuộc tính này |
| `graphLayoutJson` | Vị trí card x/y trong canvas Inspector, ví dụ `{"source":{"x":12,"y":144}}` | **Không**. Chỉ Editor dùng và được serialize cùng component |

Cả hai string dùng **native `ui-prop` dump / `change-dump`** của Cocos Creator 3.8; không dùng `Editor.Message.request('scene','set-property')` thủ công, không tự snapshot, không thao tác Scene Node. Do đó chúng đi qua cơ chế Editor lưu Scene và quản lý Undo/Redo, Prefab overrides; tuy nhiên cần smoke test trong Cocos 3.8.8 thật trước khi kết luận tương thích hoàn chỉnh.

Vị trí kéo trong canvas chỉ được **commit một lần khi thả pointer**; pointermove tạo preview cục bộ, pointercancel không commit. Undo/Redo, mở lại Scene, hoặc sửa JSON thủ công được Inspector đọc lại từ property dump, không ghi đè dữ liệu cũ. Nếu JSON không hợp lệ, canvas hiển thị lỗi, các thao tác bị chặn và **không tự sửa/ghi lại graph**.

## Giới hạn Phase 4.2a

- **Chưa có asset Graph độc lập** (ví dụ file `.graph`) hoặc share graph liên component. Graph vẫn lưu trong thuộc tính `graphJson` của component; `Install Examples` có `BasicRibbonGraph.json` để copy/nhập thủ công.
- V1 chỉ hỗ trợ **một nguồn Spline**, **một Ribbon**, **một Output** và chuỗi transform một input duy nhất. Nối dây tạo thêm branch output/multi-input hoặc bỏ rơi node sẽ bị từ chối. Multi-output/branching và output type mới thuộc Phase 4.2b/4.3.
- Không có Undo riêng trong canvas: tất cả sử dụng native Inspector change-dump. Nhiều thao tác liên tiếp thành các Editor property commits riêng; không đảm bảo một transaction hợp nhất cho nhiều chỉnh sửa.
- Canvas có kích thước cố định 860×410 px, scroll trong Inspector hẹp; node layout bị giới hạn trong stage. Hiển thị tối đa 32 node, ID an toàn, dữ liệu layout bounded, không inject code từ JSON vào HTML.
- Không tự tạo prefab hoặc Mesh asset vật lý; renderer vẫn xuất Mesh transient. Không có bake, export, asset graph browser, 3D live mesh preview trong card, shader compile hoặc arbitrary scripts.
- Editor sẽ đánh giá graph khi Rebuild; layout riêng không invalidation cache. Spline source Mesh/Knot/Scene khác vẫn bất biến theo các điều kiện Phase 4.1.

## Checklist kiểm thử Cocos Creator 3.8.8

- [ ] Node có SplineGeometryGraphRenderer → Inspector mở Visual Graph và hiển thị Spline→Ribbon→Output, không lỗi JS console.
- [ ] Add Offset + Add Width; đổi right/up, width multiplier, ribbon settings; nhấn Rebuild Graph để kiểm tra mesh đổi.
- [ ] Kéo một card, thả và Save/Reopen Scene: vị trí giữ nguyên; Undo/Redo đưa card về đúng vị trí mà không tạo thêm mesh.
- [ ] Nhấn Output của Width rồi Input của Offset: thứ tự Width/Offset đảo, tất cả node vẫn kết nối.
- [ ] Nối Ribbon (mesh) vào Offset (path): báo sai kiểu, không sửa graphJson.
- [ ] Remove Offset/Width; thử Remove Ribbon bắt buộc (không có chức năng).
- [ ] Graph JSON sai / cyclic / node ID lạ: canvas báo lỗi, graphJson không bị tự ghi đè, mesh cuối cùng còn giữ.
- [ ] Chỉnh `graphJson` qua raw ui-prop khi Inspector đang mở, kiểm tra canvas làm mới theo native dump.
- [ ] Test Prefab instance overrides và Undo/Redo khi chỉnh tham số và node layout; native Editor 3.8.8 smoke test bắt buộc.
- [ ] Nhiều graph renderer trong Scene, chuyển selection, graph không rò trạng thái giữa hai Inspector.
- [ ] Dùng Install Examples → GeometryGraph/BasicRibbonGraph.json; dán vào graphJson và mở lại canvas.

## Triển khai tiếp

**Phase 4.2b**: graph asset độc lập, import/export JSON và link shared graph, socket nhiều input và tự động layout từ topo order. **Phase 4.3**: Tube/Extrude/Profile/Mesh Deform generator nodes, đa output, node pipeline profiling, wireframe selection preview.

Mọi commit vẫn nằm ở **branch `v2`**. Không tạo tag hay GitHub Release trước khi người dùng yêu cầu **chốt**.
