# Geometry Graph — Multi-key Width Curve (v2 preview)

## Cách dùng

1. Thêm/select **Width** trong **SplineGeometryGraphRenderer → Visual Geometry Graph**.
2. Với dữ liệu cũ Start/Mid/End, bấm **Enable Multi-key Width Curve**. Chuyển đổi được tính từ giá trị đang lưu nên mesh không đổi khi chuyển.
3. Nhấn **Insert key in largest interval** để thêm key, chỉnh Progress/Scale bằng số, kéo circle màu vàng trong biểu đồ để xem trước, thả chuột để commit bằng **change-dump** chính thức. Bấm × ở key giữa để xóa. Hai key đầu/cuối không thể xóa hoặc dịch progress.
4. **Interpolation** (Linear/Smoothstep) dùng chung cho mọi đoạn. Spline đóng cần giá trị Scale ở progress 0 và 1 giống nhau.

Schema có thể dùng trên cả Graph version 1 và 2. Không thêm node type mới. Chế độ nhiều key là opt-in và không cho trộn `widthKeys` với `multiplier` / `midMultiplier` / `endMultiplier` ở cùng node:

```json
{
  "id": "widthCurve", "type": "width", "input": "source", "taperMode": 1,
  "widthKeys": [
    {"progress": 0, "multiplier": 1},
    {"progress": 0.2, "multiplier": 1.8},
    {"progress": 0.55, "multiplier": 0.65},
    {"progress": 0.8, "multiplier": 1.4},
    {"progress": 1, "multiplier": 1}
  ]
}
```

## Validation & tương thích

- Có từ 2 đến 16 key; progress đầu = 0, cuối = 1, tăng nghiêm ngặt với khoảng cách tối thiểu 0.001. Scale hữu hạn trong khoảng 0.01–20. Key chỉ có đúng hai field `progress` và `multiplier`.
- Runtime nội suy theo khoảng cách cung vật lý chuẩn hóa dựa trên `RoadFrame.distance`, không theo index sample; bật Smoothstep làm mượt từng đoạn. Width vẫn được nhân với những Width transforms phía trước, dùng cho Ribbon / Tube / Extrude / Mesh Deform.
- Khi key invalid, quá hạn mức, trùng progress hoặc vòng đóng có hai đầu không bằng nhau, rebuild fail-closed và giữ mesh đang có. Model Visual Graph từ chối edit trước khi chạm serialized scene.
- Dữ liệu cũ không có `widthKeys` tiếp tục thực thi đúng Start/Mid/End; không thay đổi default, enum, schema của những node khác. Chế độ đã chuyển sang key có thể hoàn tác bằng Editor Undo trước khi commit khác.
- Shared Graph JsonAsset: nếu đang sửa draft, thao tác chỉ cập nhật draft, không tự động lưu Shared Asset; phải bấm Save Shared JSON riêng. Layout của card không bị thay đổi bởi key edit.

## Acceptance Cocos Creator 3.8.8

Chưa kiểm thử trực tiếp Cocos Editor. Kiểm tra nhân bản Scene: chuyển graph cũ, kéo key qua nhiều điểm, thả một lần, Ctrl/Cmd+Z một lần phải hoàn nguyên; redo; lưu và mở lại Scene/Prefab Instance; thử draft Shared JsonAsset và multi-output; thử spline đóng, texture UV và Cocos-Gizmos v3. Run `npm test` + `npm run check:runtime` và dùng bản build v2 ZIP dạng single archive (không ZIP-in-ZIP).
