# Geometry Graph — UV Atlas nâng cao (v2)

## Thiết lập

Trong Authored Profile Editor bật **Pack UV0 islands into atlas**, sau đó:

- **Rotate islands**: cho phép xoay UV island đúng 90° (không mirror). Bộ tìm kiếm thử hướng gốc, chiều dài nằm ngang hoặc đứng, và thứ tự gốc/sắp xếp theo kích thước. Chọn layout với scale chung lớn nhất; không bảo đảm tối ưu toàn cục.
- **Pixel padding**: nhập **Resolution** (16–16384) và **Gutter (px)** (0–64). Đây là độ phân giải texture vuông và khoảng cách tối thiểu mỗi cạnh island, không phải số pixel giữa hai island. Hai island cách nhau tối thiểu gấp đôi gutter; biên atlas cách island ít nhất một gutter. Pixel padding thay thế fractional padding trong lúc bật.
- Nếu không còn đủ diện tích vì gutter, graph báo lỗi thay vì tạo UV sai. Giữ nguyên mesh/geometry/normal/winding; mode mặc định cũ không đổi.
- Các field được validate trong runtime lẫn editor. Undo/Redo là draft, Save Profile JSON mới ghi asset. Tắt Atlas sẽ bỏ rotation/pixel settings.

## Test

Chạy Install Examples. Chọn Example Gallery → GeometryGraphAdvancedAtlas, nhấn Play (không cần gán JSON); tùy chọn gán `GeometryGraph/Profiles/UVAdvancedAtlasProfile.json` vào UV Atlas Profile. Có thể dùng checker material cùng độ phân giải khai báo. Khi cấu hình Renderer cố định, gán Profile Asset A và bật hai control tương ứng trong Authored Profile Editor.

```json
{"atlasPacking":true,"atlasRotate":true,"atlasPixelPadding":{"resolution":1024,"pixels":4}}
```

Giới hạn: grid search có tối đa 64 cột, thử 6 tập ứng viên; không phải MaxRects/skyline tối ưu toàn cục. Không tạo texture, không bake, không dự đoán mip bleed; gutter theo đúng resolution do người dùng khai báo. Cần kiểm thử native Creator 3.8.8 với material/GPU.

## Atlas Priority

Bật **Atlas priority** trong Authored Profile Editor sau khi bật Atlas. Outer (thành ngoài), Inner (thành lỗ), Caps có trọng số mật độ UV tuyến tính 0.25–4. Ví dụ 2 / 0.5 / 1 cho mật độ tương đối 4:1 giữa thành ngoài và thành lỗ (so với UV gốc), không phải tỷ lệ diện tích tuyệt đối của texture. Tỷ lệ diện tích thay đổi theo bình phương trọng số; layout còn phụ thuộc kích thước UV gốc. Packer giữ aspect, winding, pixel gutter và hình học, không bake texture. Tất cả bằng 1 cho kết quả cũ. Gallery `GeometryGraphAtlasPriority` tạo cùng tiết diện rỗng với hai cấu hình để so sánh.
