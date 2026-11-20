# Chính sách nhánh v2 và build test

- Toàn bộ code đang phát triển sẽ đẩy trực tiếp lên **nhánh `v2`**.
- Không tạo Git tag, GitHub Release, hoặc publish stable cho tới khi chủ repo yêu cầu **chốt** một cách rõ ràng.
- Mỗi push lên `v2` chạy CI: `npm run check:runtime`, `npm run build`, `npm run verify`, `npm test`.
- Sau khi thành công, CI tạo **bản test ZIP** qua `npm run package:preview` rồi upload GitHub Actions Artifact. Tên file bên trong chứa SHA ngắn của commit.
- Bản test bao gồm extension `cocos-splines/` với `package.json`, `dist/`, `assets/`, `docs/`, changelog và README. Không bao gồm `node_modules/`, test source hoặc thay đổi code chỉ phục vụ CI.
- Bản build có `PREVIEW_BUILD.txt` để xác nhận commit và nhận diện đó là preview, không phải release.
- Cần cài **Cocos-Gizmos v3.0.3+** trước rồi mới bật Cocos-Splines trong Extension Manager.
- Tải build: GitHub → Actions → workflow `Cocos Splines — validation` → chọn run thành công trên `v2` → Artifacts → `cocos-splines-v2-<sha>`. Giải nén artifact GitHub, sau đó giải nén ZIP Cocos Splines vào `<project>/extensions/`.
- Kiểm thử tự động không thể thay thế thao tác thực tế trong Cocos Creator 3.8.x (Gizmos/Undo/Redo/prefab/build player).
- Khi cập nhật sau này, gửi kèm link tới **artifact đúng SHA của commit vừa đẩy**; không gửi lại build cũ.

### Phase 2.6 preview

The V2 ZIP includes both MeshRenderer and Collider/Terrain snapping. No tag or GitHub Release. Validate on a real Creator project with 3D Physics enabled; automated tests cannot certify Editor-time TerrainCollider physics.

### Phase 2.7 preview acceptance

Test the latest `v2` ZIP with multi-Knot Snap/Align/Move, Mesh and Collider surface snaps, and Ctrl+Z/Ctrl+Shift+Z. New Scene transform read-back guards catch stale or silently ignored writes. CI cannot prove Editor history is correct; send Console logs for any Undo/Redo discrepancies. No release or tag.

### Phase 2.9 Preview

Test selection changes, disabling/deleting a Knot and reparenting during a Gizmo drag, in a copy of the Scene. No tags/releases are generated. Node/CI tests do not guarantee native Scene lifecycle or prefab-override behavior.

### Phase 2.10 preview

Test both XY2D and XZ2D multi-selection Group Move in Scene View, especially a rotated/scaled Container. Editor may project World-axis dragging onto the authored 2D plane. Validate Undo/Redo, Cancel and save/reopen Scene. CI does not certify native Cocos Editor behavior; no tag or Release.

### Phase 2.11 preview dependency

Install the matching **Cocos-Gizmos v3 development ZIP** before the Splines `v2` ZIP. Only this updated Gizmos build supports `frameNode`. Stock v3.0.3 cannot show the new true-local 2D Group Move handles; unsupported handles are hidden. No tag, version bump or GitHub Release. Manual Creator 3.8.8 acceptance remains required.

### Phase 2.12 preview dependency and history testing

Install the matching Cocos-Gizmos v3 preview exposing `supportsExternalHistory` before this Splines V2 build. Group Move sends real serialized Knot Node.position through scene:set-property (record:false), then requests exactly one snapshot. Smoke-test one Undo for the group and Prefab Instance overrides, including nested Prefabs. The automated suite validates message contracts only. Preview builds remain artifact-only, with **no tag and no Release**.

### Phase 2.13 preview

Knot Tangent Move and Knot Rotate now require matching Gizmos v3 with `supportsExternalHistory`. Scene writes serialize real component fields and Node local rotation/handle positions, one snapshot on successful End. Preview CI verifies property messages and rollback, **not** real Creator Undo/Redo/Prefab override persistence. Test in a copy of a project; no tag/Release.

### Phase 2.14 — Pending serialized history gate

The preview blocks overlapping Knot Gizmo transactions within one spline while any set-property/snapshot/rollback is pending; independent splines remain editable. Cancel, no-op and failed operations must release correctly. The original spline's cache is invalidated on commit completion, allowing existing dependent components to rebuild on subsequent Editor updates. Validate Undo/Redo and nested Prefab instances in Creator 3.8.8; CI does not certify native undo. No tag/Release.
