# Inspector UI text cleanup — v2

Rà soát toàn bộ Inspector của Cocos Splines để giảm chiều cao và hạn chế tài liệu/roadmap xuất hiện ngay dưới các thuộc tính.

- Bỏ 20 đoạn hướng dẫn cố định `note` của custom component inspectors (bao gồm toàn bộ đoạn mở đầu bằng "Phase 4.2b supports…").
- Bỏ các đoạn giải thích dài trong Spline Container và Geometry Graph; giữ nguyên property dump, các action button, trạng thái lỗi, checkbox "Align to normal", và các phần công cụ.
- Loại bỏ hướng dẫn lặp lại bên dưới node Geometry Graph và phần mô tả Atlas dài trong Authored Profile.
- Rút ngắn tooltip nào vượt quá 100 ký tự trên **toàn bộ 19 runtime components**, SplineContainer và SplineKnot; các tooltip ngắn, nhãn, giá trị giới hạn và cảnh báo nhập dữ liệu vẫn được giữ.
- Không sửa giá trị serialized, tên property, dữ liệu scene/prefab, event, API, hoặc thuật toán/runtime.
- Thông tin kỹ thuật chi tiết vẫn nằm trong README và docs riêng; không đổ vào Inspector.

Kiểm chứng: `tests/inspector-copy-compact-v2.test.cjs` kiểm tra 20 inspector mẫu, các node editor/profile controls, hành động của Spline Container, không còn text roadmap trong template, và giới hạn độ dài tooltip.

Cần kiểm tra tương tác thực tế trong Creator 3.8.8 sau khi cài bản ZIP: Spline Container, Visual Graph, Profile Editor, các component runtime, Prefab Overrides và Undo/Redo.
