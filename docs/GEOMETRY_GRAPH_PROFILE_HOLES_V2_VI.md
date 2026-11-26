# Geometry Graph — Profile Extrude có lỗ (v2)

Profile JSON v1 giữ nguyên `points` cho contour ngoài CCW (ngược chiều kim đồng hồ). Thêm `holes` (tùy chọn), từ 1 tới 3 contour CW, mỗi contour 3–16 điểm nằm trong [-1,1]. Không chạm biên, không giao nhau, không lồng nhau. Bỏ trường holes để dùng tiết diện đặc như trước.

## Sử dụng

Chọn Install Examples → Example Gallery → GeometryGraphProfileHoles → Play. Bên trái là tiết diện đặc, bên phải tiết diện hai lỗ. Không cần gán JSON. Hoặc gán HollowProfile.json vào Profile Asset A trên một SplineGeometryGraphRenderer dùng Extrude graph với profileSlot 0.

Trong Authored Profile Editor, chọn Contour → Outer hoặc Hole 1–3, kéo điểm/cạnh, chỉnh X/Y, thêm/xóa điểm. Add hole tìm một tiết diện vuông CW hợp lệ; Remove hole xóa lỗ đang chọn. Hole JSON nằm trong phần thu gọn để chỉnh tọa độ nâng cao. Mỗi lần kéo là một thao tác Undo/Redo; chỉ Save Profile JSON ghi asset.

## Hình học

Mặt bên tạo riêng cho từng contour; normal biên lỗ hướng vào khoảng rỗng. Cap dùng triangulation ràng buộc theo cạnh contour, không thêm điểm cap và kiểm tra tổng diện tích cùng số tam giác. Seam/edgeWeights hiện áp dụng cho contour ngoài, các lỗ có seam mặc định ở cạnh đầu và weight 1. Mỗi contour độc lập trong continuous UV atlas; hỗ trợ Edge/Quad Islands, Triangle Unwrap, metric U và Atlas nâng cao. Không tự bake texture.

Giới hạn: một contour ngoài, không hỗ trợ các đảo rời hoặc lỗ lồng nhau; chỉnh điểm/cạnh lỗ qua tay nắm SVG trong Inspector (chưa có scene gizmo riêng). Giữ giới hạn mesh 65.536 vertex và giới hạn atlas hiện hành. Cần kiểm thử trực tiếp Creator 3.8.8, nhất là winding, vật liệu culling và tiết diện cong.
