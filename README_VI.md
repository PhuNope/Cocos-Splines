# Cocos Splines v2.0.0 — nhánh phát triển sạch

Plugin đường cong và hình học cho **Cocos Creator 3.8.8**.
Nhánh `v2.0.0` loại bỏ toàn bộ mã Component, Inspector, menu,
migration và test phiên bản `0.9.x`. Đây là breaking change.

**Bắt buộc:** cài và bật
[Cocos-Gizmos v3 (>=3.0.2)](https://github.com/PhuNope/Cocos-Gizmos)
trước khi nạp Splines. Các Scene Drawer đăng ký qua
`@registerGizmos` từ `db://cocos-gizmos/RegisterGizmos`.
Không đóng gói lại mã Gizmos.

## Các Component

- `Spline.Path`: nguồn Knot Vec3/CCClass duy nhất, không tạo Knot Node
- `Spline.Road`: Road/fillet/profiles/UV/markings
- `Spline.Extrude`: profile sweep độc lập
- `Spline.MeshDeform`: uốn mesh nguồn giữ UV
- `Spline.Junction`: giao lộ 3–4 nhánh, Road trim/UV/seam
- `Spline.Follower`: di chuyển theo Speed/Duration, Clamp/Loop/PingPong
- `Spline.Projector`: tìm vị trí gần nhất trong World kể cả scale không đều

Follower và Projector đọc Path nhưng **không ghi vào Knot, Road hay
Baked Mesh**. Preview của generator chỉ ở Scene; Bake là thao tác
riêng, tường minh.

Kiểm tra mã: `npm run build && npm run check:v2 &&
npm run check:v2-editor && npm run verify && npm test`.

Tài liệu: [kiến trúc](docs/v2/ARCHITECTURE.md),
[Gizmos decorator](docs/v2/GIZMOS_ARCHITECTURE.md),
[so sánh với plugin Unity](docs/v2/UNITY_FEATURE_GAP.md),
[kiểm tra Creator Windows](docs/v2/TEST_BUILD.md).

**Chưa có tag/Release.** Không hỗ trợ tự động chuyển Scene 0.9.x.
Cần xác minh native Gizmos/Undo, Prefab và vật liệu Junction trên
Creator Windows 3.8.8.
