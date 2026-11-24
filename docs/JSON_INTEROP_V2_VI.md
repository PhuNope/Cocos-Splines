# Cocos Splines V2 — JSON Geometry Round-trip (Preview)

## Mục tiêu

Đây là định dạng JSON **riêng của Cocos Splines**, không phải JSON của Unity. Dùng để sao chép hoặc trao đổi dữ liệu hình học spline giữa các project Cocos Creator. Giao diện: **SplineContainer Inspector → Cocos Splines JSON · Round-trip (V1)**.

- **Export selected Spline JSON**: chỉ đọc. Lấy cubic Bézier đã resolve từ `getNaturalResolvedKnots()`, không đổi Scene, không snapshot. Text được chọn sẵn để copy.
- **Import JSON as new Spline**: xác thực JSON trước khi tạo Node; luôn tạo một **spline sibling mới**. Không xoá hay thay đổi spline gốc hoặc Prefab instance.
- Giữ `dimension` (3D=0, XY2D=1, XZ2D=2), `closed`, `reversed`, `samplesPerCurve`, root **local position/rotation/scale**, đường cong và continuity Bézier.
- Khi import trong **cùng parent**, root local transform tạo cùng World placement. Khi import dưới **parent khác**, local transform được áp dụng tương đối parent đó (World transform có thể khác).

## Format V1

```json
{
  "format": "cocos-splines/geometry",
  "version": 1,
  "space": "container-local",
  "dimension": 0,
  "closed": false,
  "reversed": false,
  "samplesPerCurve": 32,
  "localTransform": {
    "position": [0, 0, 0],
    "rotation": [0, 0, 0, 1],
    "scale": [1, 1, 1]
  },
  "knots": [
    {
      "position": [0, 0, 0],
      "tangentIn": [-1, 0, 0],
      "tangentOut": [1, 0, 0]
    },
    {
      "position": [4, 0, 0],
      "tangentIn": [-1, 0, 0],
      "tangentOut": [1, 0, 0]
    }
  ]
}
```

Cubic giữa Knot A và B: `P0 = A.position`, `P1 = A.position + A.tangentOut`, `P2 = B.position + B.tangentIn`, `P3 = B.position`. Đóng spline có thêm cubic giữa Knot cuối và đầu. Import tạo Knot `Broken` với `tangentsInKnotSpace=false`; không có sai số từ phép làm tròn nếu JSON chứa số float hợp lệ.

## Cố ý KHÔNG round-trip

- Knot gốc dạng `AutoSmooth`/`Linear`/`Mirrored`/`Continuous`, góc xoay riêng Knot hoặc child tangent handles. Được **bake thành Bézier Broken** và hình dạng được giữ; workflow authoring / điều kiện tangents động khác biệt.
- Components đi kèm như Road, Extrude, TrafficController, prefab instances, triggers, Junction links và mọi reference Node/UUID. Chỉ geometry + root transform.
- Chỉ lưu **local** geometry, không lưu transform của tổ tiên và không tham chiếu asset nguồn.
- Không dùng JSON parser V1 này cho **Import Unity Splines JSON** cũ; nút Legacy/Unity Import trong Inspector vẫn hoạt động theo workflow cũ.

## Giới hạn / bảo vệ dữ liệu

- Đúng `format`, `version=1`, `space=container-local`; 2–256 Knot, <= 200.000 ký tự, giá trị hữu hạn trong ±10⁷.
- `samplesPerCurve` 4–256; quaternion local có độ dài gần bằng 1; mỗi Knot ở 2D phải nằm trên local plane tương ứng.
- Import lỗi trước snapshot cố dọn sạch root vừa tạo bằng Editor Scene message; nếu IPC trả về lỗi không rõ trạng thái, cần kiểm tra Scene thủ công.
- Undo/Redo trong Cocos Creator 3.8.8, nested Prefab overrides, Scene save/reopen, native Gizmos vẫn **chưa được chứng nhận** qua test mock.

## Checklist Cocos Creator 3.8.8

- [ ] Export 3D spline có parent xoay/scale không đồng đều; import sibling cùng parent, so sánh Knot points/handles trong World.
- [ ] Thử XY2D, XZ2D; Closed/Reversed, 2–256 Knot, spline AutoSmooth; so sánh các mẫu cubic ở `t=0,0.25,0.5,0.75,1`.
- [ ] Một Undo phải gỡ spline mới; Redo khôi phục; Save & Reopen Scene duy trì đủ Knot và transform.
- [ ] Thử import cạnh Nested Prefab; Prefab source và override không bị thay đổi.
- [ ] JSON phiên bản 2, sai plane, NaN/out-of-range hoặc rỗng phải trả lỗi trước khi tạo Node.
- [ ] Kiểm tra log và Scene nếu import gặp IPC failure hoặc snapshot rejection; rollback chỉ là best effort.

**Chỉ branch v2 preview, không tag, không release.**
