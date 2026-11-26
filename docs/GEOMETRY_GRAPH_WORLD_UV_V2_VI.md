# Geometry Graph — World-space Texel Density (Profile Extrude)

## Thiết kế

Phase 4.3g2b2b2b2c2b2e (opt-in, Cocos Splines v2 preview) thêm cờ `uv.uWorldSpace` vào **authored Profile JsonAsset v1**. Mục tiêu: texture U chạy theo chiều dài thật của cạnh tiết diện sau khi chịu output Renderer Node transform, bao gồm nonuniform scale, rotation, shear và Width Curve taper.

- `uWorldSpace` là Boolean, mặc định không có/false, chỉ bật được khi `uMetersPerRepeat` hợp lệ (0.01–10000). Khi bật, chế độ này ưu tiên hơn `uFollowFrameScale`: không nhân scale lần thứ hai.
- Renderer truyền riêng ma trận linear 3×3 local→world (9 số, column-major), không chứa translation. Lõi math nhân mỗi tangent cạnh với ma trận đó rồi đo độ dài Euclidean tại từng spline frame.
- **V theo chiều spline đã dùng khoảng cách cung world-space của frame**; không nhân scale Node lần nữa. Giữ nguyên `uvMetersPerRepeat` của Extrude node.
- Áp dụng tương tự Continuous perimeter, Edge Islands và Quad Islands; `edgeWeights`, `seamEdge` vẫn được hỗ trợ.
- Positions, normals, indices và cap UV/geometry không đổi so với cùng UV island mode khi bật/tắt world metric. Với Quad Islands, số vertex vẫn bị giới hạn 65.536 như trước.
- Chỉ Profile Asset được opt-in mới phụ thuộc vào context.worldUvLinear trong graph cache. Thay ma trận world trong pure Core runner sẽ invalidate Extrude liên quan và downstream output, không invalidate nhánh khác khi Spline frames giữ nguyên.
- Core fail-closed nếu thiếu/không hợp lệ ma trận khi cờ bật, nếu profile edge world degenerate hoặc U không hữu hạn. Các Profile/Graph trước đây giữ nguyên.

## Ví dụ

Dùng menu **Install Examples**, thêm:
- `GeometryGraph/UVIslandExtrudeGraph.json`
- `GeometryGraph/Profiles/UVWorldSpaceProfile.json`

Gán Profile vào Slot A của `SplineGeometryGraphRenderer`. Trong **Authored Profile Editor**, chọn **Side U meters/repeat** rồi bật **World-space side U (Node scale)**, lưu qua **Save Profile JSON…** (có kiểm tra checksum và xác nhận). Thay đổi world scale của Node chứa MeshRenderer, kiểm tra số lần lặp texture trên mặt cắt. Khi bỏ chọn, chỉ dùng metric U danh định/frame-local như trước.

```json
{
  "format": "cocos-splines/profile",
  "version": 1,
  "points": [
    {"x": -0.5, "y": -0.5},
    {"x": 0.5, "y": -0.5},
    {"x": 0.5, "y": 0.5},
    {"x": -0.5, "y": 0.5}
  ],
  "uv": {"sideIslandMode": 1, "uMetersPerRepeat": 1.5, "uWorldSpace": true}
}
```

## Regression & hạn chế

Test pure math (scale 2×, shear, taper, inverse-scaled local basis), cache theo nhánh, validation và rollback, Inspector profile-draft Undo/Redo, metric-clear dependency, renderer context wiring, installer output và toàn bộ CI. Chưa có xác nhận native Cocos Creator 3.8.8 cho UI interaction/Prefab history, FBX/PBR/GPU. `uWorldSpace` áp dụng cho **Profile Extrude authored JsonAsset** (không áp dụng Ribbon/Tube/MeshDeform hoặc cap atlas). Không hỗ trợ world-space side V theo độ cong từng cạnh, automatic island packing hay polygon holes; những phần này còn trong roadmap.
