# Geometry Graph — UV0 Edge Islands / Quad Islands (v2 preview)

## Tổng quan
Phase 4.3g2b2b2b2c2b2d: Authored Profile JsonAsset v1 có thêm thuộc tính **uv.sideIslandMode** (tùy chọn).
- **0 / không có**: Continuous Perimeter — cách hoạt động cũ, giữ nguyên mọi vertex/index và UV0.
- **1**: Edge Islands — U bắt đầu lại ở 0 cho từng cạnh của tiết diện Profile; V vẫn tích lũy theo khoảng cách spline. Không thêm vertex và giữ nguyên toàn bộ positions/normals/indices.
- **2**: Quad Islands — mỗi ô mặt bên ứng với một cạnh Profile và một khoảng giữa hai frame có 4 vertex UV riêng, U bắt đầu tại 0, V bắt đầu tại 0. Geometry/normals/winding giữ hình dạng gốc nhưng số vertex và indices được tái sắp xếp để tạo UV seam dọc spline; cap UV vẫn độc lập và không đổi.

Với mỗi island, nếu **Side U meters/repeat** bỏ trống, U chạy 0→1 trên từng cạnh. Nếu có **uMetersPerRepeat** thì U dựa trên chiều dài cạnh × Edge UV weight / meters. Khi chọn **Follow taper / frame scale**, giá trị U ở mỗi frame dùng chiều dài cạnh thực tế theo right/up × widthFactor (không tính world transform của Node ngoài renderer). Quad Islands dùng V = (distance của frame kế tiếp − frame hiện tại) / Extrude uvMetersPerRepeat. Như vậy V không bị kéo giãn ngẫu nhiên khi khoảng cách các frame thay đổi; bản thân mỗi quad là một UV island bắt đầu ở V=0. Không có UV atlas packing hoặc per-triangle UV unwrap tự động.

## Cách dùng trong Editor
1. Chọn **SplineGeometryGraphRenderer** có Extrude node trỏ đến Profile Asset A/B/C.
2. Vào **Authored Profile Editor → Edit Profile Asset…**, chọn trường **Side UV islands**: Continuous / Edge Islands / Quad Islands.
3. Có thể kết hợp Edge UV weight và Side U meters/repeat; xem trước mesh bằng **Rebuild Graph** sau khi Save.
4. Sửa đổi chỉ diễn ra ở draft; **Undo Draft / Redo Draft** hoàn tác từng thay đổi. **Save Profile JSON…** phải được xác nhận riêng, sử dụng checksum-conflict guard; không tự chỉnh Scene hoặc source meshes.
5. Với Quad Islands, texture cần wrap U/V phù hợp với số lần repeat. Số vertex tăng theo 4 × số cạnh × (số frame−1), giới hạn tối đa 65.536 vertices (gồm cap); kiểm tra giới hạn trước khi allocate mesh.

Ví dụ cài qua menu **Install Examples**:
- GeometryGraph/UVIslandExtrudeGraph.json (Extrude sử dụng Profile Asset Slot A).
- GeometryGraph/Profiles/UVEdgeIslandProfile.json (Edge Islands).
- GeometryGraph/Profiles/UVQuadIslandProfile.json (Quad Islands với metric U).

Các Profile File là JsonAsset author-owned, có thể dùng trên cả Graph v1 và v2. Input profile polygon và mọi Mesh/Prefab nguồn luôn bất biến.

## Test và giới hạn
Automated regression: strict schema runtime/Inspector, default byte parity, face topology/winding, seam UV, physical V, cap UV, taper, insert/remove, draft Undo/Redo, graph cache/rollback và giới hạn 65.536 vertices. **Cocos Creator 3.8.8 native Editor, imported PBR, Prefab Save/Reopen, Undo/Redo, FBX, GPU vẫn chưa được kiểm chứng thực tế.** Phase tiếp theo là world-space texel density và UV unwrap nâng cao; việc đóng gói atlas tự động hoặc UV polygon nhiều contour không nằm trong slice này.
