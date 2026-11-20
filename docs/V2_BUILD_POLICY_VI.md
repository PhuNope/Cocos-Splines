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
