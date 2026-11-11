# Hướng dẫn kiểm thử Cocos Splines v2.0.0 (test build)

> **Bản thử nghiệm, chưa phải release.** Build này không chứng nhận tương thích trong Editor thật. Hãy thử trên **bản sao project Cocos Creator 3.8.x** trước khi dùng cho dữ liệu quan trọng.

## Cài đặt

1. Tải artifact ZIP `cocos-splines-v2.0.0-test-...` từ GitHub Actions và giải nén. Bên trong có thư mục `cocos-splines`.
2. Sao lưu project trước. Tắt/xóa phiên bản `cocos-splines` cũ trong `<project>/extensions/` trước khi đặt bản test, vì cả hai cùng tên extension.
3. Chép **nguyên thư mục** `cocos-splines` vào `<project>/extensions/cocos-splines` (phải thấy `package.json`, `dist/`, `assets/` bên trong).
4. Mở Cocos Creator 3.8.2+ → **Extension Manager** → bật/reload `cocos-splines`. Chờ AssetDB import TypeScript và báo hoàn tất.
5. Không cần chạy npm trong thư mục extension. Đây là package đã build phần JavaScript Editor.

## Test Road V2

1. Tạo ba Node làm knots, ví dụ K0 `(0,0,0)`, K1 `(0,0,5)`, K2 `(5,0,10)`.
2. Tạo Node `Road V2` và gắn `MeshRenderer` cùng component **SplinesV2.SplineRoad** từ Add Component.
3. Trong Inspector, kéo các knots vào mảng `knots` đúng thứ tự. Chỉnh `width`, `sampleStep`; thử thêm `shoulderWidth=1`, `curbWidth=0.3`, `curbHeight=0.2`.
4. Gán shared Materials nếu có: slot 0 = asphalt, 1 = shoulder, 2 = curb. Nhấn **Rebuild Preview** để xem tạm trong Scene.
5. Nhấn **Bake glTF Asset**. Extension thử tự liên kết `cc.Mesh` subasset vào `bakedMesh`. Nếu import chưa xong, chờ AssetDB rồi nhấn **Bind Imported Mesh**. Nhấn **Check Bake Status** để kiểm tra fingerprint.
6. Đặt `meshMode=Baked`, lưu Scene, đóng và mở lại Scene, Play. Mesh phải hiển thị từ asset đã lưu, không tự dựng lại geometry.
7. Đổi width hoặc vị trí Knot trong Editor và dùng Check Bake Status để phát hiện baked Mesh cũ. Không thay Scene Play mode để kiểm thử nút Bake.

## Test Extrude V2

1. Tạo Node riêng với `MeshRenderer` và **SplinesV2.SplineExtrude**. Gán lại các Node knot.
2. Chỉnh `radius`, `sides`, `capEnds`, `flipFaces` và nhấn **Rebuild Preview**.
3. Test với spline dốc đứng và spline 3D hình xoắn. Nhấn Bake, lưu/reopen Scene, Play trong Manual/Baked.
4. Thử `Dynamic` để kiểm tra việc tạo mesh ở Play và không bị duplicate qua nhiều lần enable/disable.

## Cần chú ý khi gửi phản hồi

- Bản đầu v2 chưa có Road corner trimming hoàn chỉnh, Junction Mesh v2, collider physics adapter hoặc UV2 atlas lightmap không chồng lấn.
- Kiểm thử unit/mock và CI có thể pass nhưng **không thay thế** việc kiểm tra trong Cocos Creator 3.8.x thực tế.
- Nếu gặp lỗi, gửi phiên bản Creator, ảnh Inspector/Console, thao tác tái hiện, Scene có tối thiểu knots liên quan và chế độ Dynamic/Manual/Baked.
- **Không dùng bản test để build game production hoặc đẩy lên store.**

## Phạm vi của ZIP

ZIP chứa extension chạy được từ `package.json`, `dist/`, `assets/` và docs; nó cũng giữ component legacy để tiện đối chiếu nhưng không đòi giữ UUID v0.9.x. Không cần cài repository source hoặc chạy TypeScript test suite bên trong Cocos.

Không có tag, Release hoặc npm publish từ quy trình đóng gói này.

## Test: UV0 repeat axis for road textures

- Select the v2 Road or Extrude component. Under its geometry settings, locate **UV Longitudinal Axis**.
- If the texture's road direction is **along image X** (U), select **U**. When the texture's road direction is **along image Y** (V), select **V** (default).
- Set `uvMetersPerRepeat` to `5` as a starting value. The texture wrap setting should be **Repeat U** or **Repeat V** as appropriate.
- Click **Rebuild Preview**; if using Manual or Baked, **Bake glTF Asset** again. Test that shoulder, curb, and Extrude textures rotate their longitudinal mapping consistently. UV2 remains untouched.

## Test: tight road corners (JoinAndTrim)

1. Use the **new** test build and a *copy* of a Scene. Road v2 Inspector → **Corner Mode = JoinAndTrim**.
2. Create a tight U-turn (e.g. three or four knots), set `width=4` and `sampleStep=0.2`. Click **Rebuild Preview**. The inner edge should pinch smoothly rather than fold across the curve. Use `Corner Trim Safety=0.9`, `Corner Miter Limit=2.5` initially.
3. Toggle **Corner Mode = Legacy**, Rebuild Preview and compare. Legacy may fold the inner curve. Re-enable JoinAndTrim.
4. Test with `shoulderWidth=1`, `curbWidth=0.3`, `curbHeight=0.2`, and UV Longitudinal Axis U and V to inspect material seams/tiling.
5. Set Baked and use **Show Baked Mesh** to see the persisted asset rather than the temporary preview. After changing corner settings, click **Bake glTF Asset**, save Scene, reopen and Play.
6. **Check Bake Status** reports local pinched sections. Crossing branches/roads, underpasses and 3D helix-wide self-intersections are *not* solved by local trimming; they require junction-aware mesh operations.
