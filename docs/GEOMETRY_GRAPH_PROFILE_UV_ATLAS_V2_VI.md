# Geometry Graph — Authored Profile UV0 Atlas Packing (Phase 4.3g2b2b2b2c2b2f)

## Thiết kế
Profile JsonAsset v1 thêm `uv.atlasPacking` (boolean opt-in) và `uv.atlasPadding` (tùy chọn, số hữu hạn 0–0.2, yêu cầu `atlasPacking:true`; mặc định **0.04**). Khi **không bật**, UV, normal, vertex và index giữ nguyên 100% hành vi trước đây.

Mỗi UV island được fit vào một ô của atlas UV0 [0,1] bằng **một tỉ lệ scale chung**, không xoay/flip, giữ nguyên tỷ lệ U:V và tương quan mật độ giữa các island. Một phần diện tích trong mỗi ô là gutter (fraction của kích thước ô ở mỗi cạnh); tránh bleed khi texture filtering. Tính các bố cục cột ứng viên theo đúng thứ tự ổn định, chọn kích thước tối ưu theo max bề rộng/bề cao. Thuật toán thuần và deterministic, không ghi profile input và không gọi API Cocos. Tối đa **16.384 islands** và giới hạn vertex **65.536** như Geometry Graph hiện tại. Với UV không hữu hạn, face UV suy biến hoặc giới hạn bị vượt: fail closed, renderer giữ mesh cuối hợp lệ.

## Island nào được pack?

- `sideIslandMode:0`: toàn bộ perimeter side nằm trong một island, hai cap tách riêng.
- `sideIslandMode:1`: mỗi cạnh tiết diện tạo một dải island chạy dọc spline; hai cap riêng.
- `sideIslandMode:2`: **mỗi quad mặt bên giữa hai frame** tạo một island riêng, hai cap riêng.
- Nếu cap bị tắt hoặc spline đóng, chỉ pack phần side. Cap UV được **đóng gói vào atlas** chứ không để UV profile-local như chế độ cũ; hình học cap/normal/triangles không thay đổi.

Giữ nguyên mapping U đã chuẩn hóa hoặc metric `uMetersPerRepeat`, `uFollowFrameScale`, `uWorldSpace` và V world-arc. Atlas chỉ scale/translate UV0 sau khi mesh được tạo. Khi bật Atlas, số lần tile trên texture thay đổi theo kích thước packing; shader/material phải dùng texture atlas UV0 và nên tắt Repeat wrapping nếu không phù hợp. Tính năng này chưa cung cấp rasterization texture atlas, bake texture, layout theo resolution, hoặc unwrap từng triangle tách vertex.

## Dùng thử
1. Vào menu **Install Examples**, cài `GeometryGraph/UVIslandExtrudeGraph.json` và `GeometryGraph/Profiles/UVAtlasProfile.json`.
2. Gán Graph JsonAsset (hoặc copy JSON) vào `SplineGeometryGraphRenderer`; gán `UVAtlasProfile.json` vào Profile Asset A.
3. Mở **Edit Profile Asset…**, bật **Pack UV0 islands into atlas**, chỉnh **Atlas padding** từ 0 đến 0.2. Bỏ trống padding dùng mặc định 0.04.
4. Thử Edge Islands / Quad Islands, có và không có cap, Width Curve/World U. Undo/Redo ở draft độc lập. Chỉ **Save Profile JSON…** (xác nhận và guard SHA) mới thay đổi profile nguồn; Rebuild Graph để thấy UV mới.

## Acceptance
Headless tests: 3 kiểu island, topology/normal bất biến, UV [0,1], đảo lỗi input, không overlap cả cap, cùng hệ số scale, strict validation, world-space taper, closed, cache isolation, draft Undo/Redo, cài examples, CI flat ZIP. Cần kiểm thử trực tiếp Cocos Creator **3.8.8**: Inspector/Prefab/history, PBR bilinear/trilinear bleed, GPU, imported materials và asset reload.

**Chưa bao gồm:** per-triangle unwrap độc lập, skyline/MaxRects optimal packing, nhiều contour/hole, texel-density-by-material, texture baking. Đó là các slice roadmap tiếp theo.
