# Cocos Splines — Hướng dẫn nhanh

Plugin spline cho **Cocos Creator >= 3.8.2**, chỉnh trực tiếp trong Inspector, không cần panel riêng.

## Cài đặt

Đặt thư mục plugin tại `<project>/extensions/cocos-splines`, bật extension trong Extension Manager rồi để Asset DB import các TypeScript component.

## Các nhóm tính năng

- **Spline:** SplineContainer, SplineKnot, Normalized Distance / Distance / Spline t.
- **Di chuyển:** SplineAnimate, SplineJunction, SplineTrigger, SplinePositioner, SplineProjector, SplineLengthMonitor.
- **Tạo mesh:** SplineRoad, SplineExtrude, SplineMeshDeform, Spline2DPath, SplineJunctionMesh.
- **Nâng cao:** SplineInstantiate, SplineObjectController, SplineModifiers, SplineObjectBender, SplineMorph.

### Spline Offset khi chuyển Junction

`SplineAnimate.splineOffset = (1, 0, 0)` dịch object theo trục phải của spline *đang hoạt động*, không phải trục X cố định của thế giới. Nếu hướng hai spline khác nhau, offset mới có thể nằm ở vị trí world khác dù hai đường tâm chung một điểm nối.

Sử dụng `junctionOffsetBlendDistance` (mặc định **1 unit**) để giữ vị trí thế giới ở thời điểm nối rồi chuyển mượt sang offset spline mới trong khoảng quãng đường đã chọn. Đặt `0` để tắt chuyển tiếp. Tùy chọn `constantSpeedWithOffset = true` giúp bù vận tốc theo chiều dài quỹ đạo thực. Các kết nối Junction nên được đặt cùng world position.

## Bộ tài liệu HTML

Mở [`docs/index.html`](docs/index.html) để xem hướng dẫn Inspector, các trang API và ví dụ TypeScript. Tài liệu có phần chi tiết về Animate, Junction, Morph, Mesh Deform và các công cụ khác.

## Giới hạn

`package.json` khai báo hỗ trợ Editor từ **3.8.2**; các bài kiểm thử hiện chạy với TypeScript/mock runtime, chưa xác nhận trực tiếp mọi phiên bản 3.8.x. ObjectBender chỉ uốn static mesh đọc được, Junction Mesh là patch XZ chứ chưa hàn road thành mesh kín. Collider và Particle để phát triển sau.
