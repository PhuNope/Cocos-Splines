# Phase 1.2 — Cocos-Gizmos v3 integration

## Dependency và import

Cài/bật **Cocos-Gizmos v3.0.3+** rồi mới dùng Cocos-Splines. Đây là hard dependency.
Import chính thức: `import {registerGizmos} from 'db://cocos-gizmos/RegisterGizmos';`

Cocos Creator cho phép script import từ mount AssetDB của extension khác bằng `db://<extension>/<asset>`. Không có bản sao decorator trong Cocos-Splines.

## Architecture

- Core: `SplineContainer.ts` xử lý spline data/math; `SplineKnot.ts` xử lý tangents, rotation Node, coordinate transforms.
- Editor: `SplineContainerGizmos.ts` vẽ đường và knots; `SplineKnotGizmos.ts` khai báo Move/Rotate handles, vẽ selected tangents và lưu trạng thái để rollback.
- Kết nối trực tiếp qua `@registerGizmos(SplineContainerGizmos)` và `@registerGizmos(SplineKnotGizmos)`.
- `editorTangentIn` / `editorTangentOut` là property computed trong knot-local; setters chuyển AutoSmooth/Linear/Mirrored/Continuous sang Broken trước khi ghi nhằm bảo toàn nhánh tangent còn lại.
- `editorWorldEuler` đọc/ghi Node.worldRotation, không thêm property rotation serialized.
- Handles node cũ vẫn được đọc/ghi để không phá dữ liệu Scene, nhưng knot mới không cần tạo handle child nodes.

## Đã kiểm tra và còn cần xác minh

Mock TypeScript compile và test có hỗ trợ import chính thức bằng loader riêng cho Node unit tests. Loader không xuất hiện trong Assets/Editor runtime.

**Chưa xác nhận trên Editor thật**: Creator 3.8.8 AssetDB, 2D/3D Scene drawing, vị trí handle khi knot rotate, Undo/Redo Native, Prefab override, production build. Native Editor transaction API hiện xử lý Component fields; các computed editor fields không được serialized, nên **không được khẳng định Undo/Redo đã đúng** trước khi live-test. Drawer tự rollback dữ liệu ở phase cancel/Escape.

Smoke test: bật cả hai extension → chọn Container (curve) → chọn Knot (2 tangent handles, rotation gizmos) → kéo mỗi bên, đổi mode từ AutoSmooth, Escape, Undo/Redo, save/reopen scene, thử XY2D và XZ2D/3D, thử parent non-uniform scale và build game.

Phase 1.3 đã chuyển Road/Extrude/MeshDeform/JunctionMesh/ObjectBender sang Editor/SplineMeshDrawers.ts và Modifiers sang Editor/SplineModifierGizmos.ts. Core/SplineMeshGizmos.ts chỉ còn hàm buildMeshGizmoLines (pure data).
