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

## Triangulation verification for a tight U-turn

Set Width 4, Sample Step 0.15, Corner Mode JoinAndTrim; run Rebuild Preview and compare Legacy on a duplicate Scene. Front-facing road triangles should no longer flip at the inner concave sections. The Inspector may still warn about nonlocal road self-overlap when the **entire road width is greater than the spacing between two different arms** of the U-turn. A single road-strip generator cannot safely merge those arms without junction/Boolean geometry.

## Kiểm thử Road tự chồng (ảnh đường chữ U)

1. Trong Road V2, giữ `Width=4`, `Sample Step=0.25`, `Corner Mode=JoinAndTrim`. Bật **Resolve Planar Overlaps** (mặc định).
2. Nhấn **Rebuild Preview**. Thông báo Inspector có thể hiển thị số tam giác đã cắt khỏi vùng Road bị chồng; quan sát các vạch đường gần phía trong khúc cua.
3. Tắt **Resolve Planar Overlaps**, nhấn Rebuild Preview để so sánh; bật lại khi đã kiểm tra. Đây là tùy chọn cho **mặt Road gần đồng phẳng**, không áp dụng cho cầu vượt/Extrude dạng ống.
4. Giữ `UV Longitudinal Axis=U` như texture của bạn. UV0/UV2 được nội suy tại mép cắt. Nếu hai chiều texture khác nhau gặp nhau, vẫn có thể xuất hiện đường nối texture, nhưng không còn hai mặt đồng phẳng cùng vẽ lên một vùng.
5. Sau khi xem preview ổn, nhấn **Bake glTF Asset** lại để cập nhật mesh lưu. Nếu có đường giao thực sự, lối rẽ nhánh, hoặc cầu vượt, dùng Junction Mesh chuyên dụng.

## Test UV0 sau khi cắt mesh bị chồng

1. Tạo bản sao Scene chữ U, cài bản test mới, vào `SplineRoadV2`.
2. Bật **Resolve Planar Overlaps** và **Stitch Cut UV** (mặc định bật); giữ `Corner Mode=JoinAndTrim`.
3. Giữ `UV Longitudinal Axis=U` cho texture có đường chạy theo trục X của ảnh, đặt sampler **Repeat** theo trục đó.
4. Nhấn **Rebuild Preview**. Tắt **Stitch Cut UV** rồi Rebuild để so sánh chỗ texture đổi pha ở mép cắt; bật lại sau khi so sánh.
5. Thử cả trục `V`, `Shoulder Width` và `Curb Width`. UV2 không được thay bởi tùy chọn Stitch Cut UV.
6. **Bake glTF Asset** lại sau khi đổi UV, lưu Scene và kiểm tra Play. Mesh Baked cũ không tự cập nhật khi đổi tùy chọn.
7. Nếu vạch sơn giao nhau theo hai hướng khác nhau tại nút đường, stitching UV0 chỉ khớp *pha texture* trên mép cắt. Để vạch sơn nối đúng theo một hướng cụ thể cần Junction Mesh/marking decal chuyên dụng.

## Kiểm tra Road không đứt texture tại cua chữ U

1. Sau khi cài bản test mới, chọn `SplineRoadV2`. Đặt **Surface Mode = Continuous** (mặc định).
2. Giữ `Corner Mode = JoinAndTrim`, `Width = 4`, `Sample Step = 0.25`, `UV Longitudinal Axis = U` với texture chạy theo trục X; texture sampler đặt **Repeat**.
3. `Clearance Safety = 0.35` và `Width Slope = 0.65`; bấm **Rebuild Preview**. Trong chế độ này không có cắt tam giác hay UV, nên không còn đường cắt UV chạy qua mặt đường.
4. So sánh **Surface Mode = Clip Overlaps** rồi Rebuild: Clip sẽ ưu tiên giữ bề rộng nhưng có thể làm vạch kẻ gãy tại nơi hai nhánh chồng nhau. Quay về Continuous để ưu tiên texture chạy liên tục.
5. Với U-turn có hai nhánh quá gần, Road sẽ hẹp lại tại phía trong khúc cua để tránh tự chồng. Đây là đánh đổi hình học cần thiết; muốn giữ `Width=4` trên toàn đường, tăng bán kính cua/khoảng cách hai nhánh bằng Knot.
6. Test Road có Shoulder/Curb, cả trục U và V, rồi **Bake glTF Asset** lại sau khi hài lòng với hình học. Chú ý kiểm tra lại texture trong Editor thật vì CI chỉ có test TypeScript/Mock.

## Kiem thu Road 3 Knot tu screenshot (khong con vach vang giat bac)

Node Road local knots: K0 (-1.701,0,-7.206), K1 (-3.869,0,3.720), K2 (5.820,0,4.347).

1. Thay toan bo extension ZIP cu, reload extension/AssetDB. Chon `SplinesV2.SplineRoad`.
2. `Interpolation=Centripetal`, `Width=4`, `Sample Step=0.25`, `Corner Mode=JoinAndTrim`, `Surface Mode=Continuous`, `UV Longitudinal Axis=U`, `UV Meters Per Repeat=5`.
3. `Clearance Safety=0.98` van duoc ho tro. `Width Slope` nen de `0.25`; neu Scene cu luu `2`, generator se gioi han gia tri hieu luc ve 0.25 de tranh mep cua giat bac.
4. `Rebuild Preview`. Quan sat vach vang phia trong va vach trang giua duong. Mesh Continuous moi co 3 dinh (trai/tam/phai) moi tiet dien, UV giua dinh tam chinh xac theo spline, khong con giat sang ben khi mep trong thu hep.
5. Chung minh khong phai do Polygon UV Clip: khi `Surface Mode=Continuous`, `Resolve Planar Overlaps` va `Stitch Cut UV` khong thuc hien bat ky viec cat tam giac nao. Chi co bo giai radius + width smoothing.
6. Khi hinh hoc on, click `Bake glTF Asset` lai neu su dung Baked. Scene o Manual/Baked co the dang hien thi Mesh asset cu neu chua Rebuild/Show Baked Mesh.

CI tests simulate this exact path and require smooth UV iso-curves, no geometry overlaps, a centreline-anchored texture, and unchanged UV2. Verification with the actual Cocos Editor + actual road material is still required.

## Test adaptive Road va vach ke duong bang geometry rieng

**Dau tien:** nho cap nhat extension ZIP moi va Rebuild Preview. Truoc day Inspector Continuous co the van build Clip cho Road khong co shoulder/curb; ban moi da sua loi chuyen tham so nay.

- Trên Road v2, chọn **Surface Mode = Continuous**, **Adaptive Sampling = on**, **Max Turn Angle Degrees = 6**, **Max Chord Error = 0.03**. Giữ Sample Step = 0.25, Width = 4 và UV Longitudinal Axis = U. Rebuild Preview.
- Với texture Road có vạch vàng/trắng sẵn, giữ **UV Cross Mode = Legacy**. Thử Physical chỉ khi bạn muốn giữ tỷ lệ asphalt ở đoạn đường co hẹp, vì đường sơn nằm trong texture có thể dịch.
- **Cách tách vạch đường:** chuyển material slot 0 sang asphalt KHÔNG có vạch kẻ, bật **Generate Markings**, đặt Materials slot 3 = trắng và slot 4 = vàng. Slot 1/2 giữ shoulder/curb. Giữ Marking Line Width 0.12, Dash Length 3, Dash Gap 4 để thử.
- Vạch mép là một dải liên tục, vạch giữa có khoảng đứt theo nhịp dash/gap, không phụ thuộc vào UV của asphalt. Rebuild Preview và so sánh trực tiếp.
- Chỉ bật Generate Markings trong **Continuous**. Với Clip Overlaps, tùy chọn này chủ động báo lỗi để không tạo mesh marking không theo hình học sau cắt.
- Khi đã ổn, nhấn **Bake glTF Asset** lại và gán materials cho từng slot. Do fingerprint phụ thuộc UV/geometry, Mesh Baked cũ sẽ stale sau khi đổi chế độ.
- Đây vẫn là bản TEST. Kiểm tra trong Cocos Creator 3.8.x, đặc biệt vật liệu hai mặt, seam của đường sơn và hiệu năng của mesh dày.

## Test Constant Width Fillet — correct the user's Road curve

This is a TEST build, not a stable release. Replace the old extension and reload TypeScript/AssetDB before using Rebuild Preview.

With **K0=(-1.701,0,-7.206), K1=(-3.869,0,3.720), K2=(5.820,0,4.347)** and Width=4:

1. Select `SplinesV2.SplineRoad` and explicitly set **Surface Mode = ConstantWidth**. Existing scenes retain their old Continuous choice until changed; newly added components default to ConstantWidth.
2. Start with `Fillet Radius Scale=1.35`, `Fillet Arc Angle Degrees=4`, `Fillet Chord Error=.015`, `Sample Step=.25`, `UV Longitudinal Axis=U`, `UV Cross Mode=Legacy`, `Generate Markings=Off`. Click **Rebuild Preview**.
3. The Road should now keep its full Width=4 around the curved centerline without cutting mesh triangles or UV0; the guide Knot 1 is intentionally no longer on the road centerline because the new fillet rounds the corner.
4. If it still looks pinched, confirm Surface Mode is **ConstantWidth** (not old Continuous), and check you have pressed Rebuild Preview, not Show Baked Mesh. Manual/Baked will otherwise display the old saved mesh.
5. If the Inspector reports an error about Knot spacing, move those knots farther apart or reduce Width. The algorithm refuses to generate an unsafe full-width turn instead of distorting geometry. Too-close global branches still require junction/road network geometry.
6. Once satisfied, click **Bake glTF Asset**, wait for AssetDB, bind imported Mesh if needed, then save/reopen Scene and Play. Preview meshes are temporary.
7. To separate paint from asphalt, use unpainted asphalt material slot 0 and enable Generate Markings with white slot 3 and yellow slot 4. Existing paint baked into Road.mtl should be removed/disabled before doing this.

Check the Editor scene visually: the numeric/typecheck tests cannot validate your real Road.mtl shader and paint pattern.

## Test `SplineMeshDeformV2` using imported Source Mesh

1. Import an FBX/glTF Road mesh which already has UV0 and at least 8-16 source longitudinal sections. Enable CPU/readable mesh data if that setting is available for your import format.
2. Add Component **Cocos Splines V2 → Mesh Source Deformer** on a node with MeshRenderer. Assign the same Road Knot nodes as before and a **Source Mesh** asset.
3. Choose **Source Longitudinal Axis = Z** (or X if source mesh length follows local X), and **Source Longitudinal UV Axis = U/V** to match your painted texture. Set **Repeat Count = 1**, **UV Tile Mode = Preserve** to keep original UV0 values.
4. For the supplied three Knot scene, use **Surface Mode = ConstantWidth**, **Fillet Radius Scale = 1.35** and Sample Step .25. Rebuild Preview. The source mesh must already have enough longitudinal vertices for the curve to look smooth.
5. Set Materials to match submesh order. Verify the original asset is unchanged after Preview, and UV1/UV2 (if supplied) still match the authoring file.
6. Optional: increase Repeat Count to 2-4; use UV Tile Mode Advance ONLY if source texture is tileable and its longitudinal UV span matches each repeating module. Expect repeated lightmap UV2; do not use a repeated mesh for baked lightmaps without re-unwrap.
7. Bake glTF Asset, bind the imported Mesh and save/reopen the Scene. In Baked mode Play does not read or rebuild the source mesh. If source readback fails, verify import settings and source mesh vertex attributes.

## V2 Junction Patch (flat 3/4-road Editor test)

1. Create 3 or 4 open `SplinesV2.SplineRoad` nodes and make one endpoint Knot of every Road share the same world position. Set **Surface Mode = ConstantWidth**, asphalt only (Shoulder/Curb width and height all zero).
2. Set **Junction Start Trim** (when connecting the first Knot) or **Junction End Trim** (when connecting the last Knot). Start with trim **3** for Width=4 and leave the unconnected end trim 0. All roads must have enough length. Click **Rebuild Preview** for each Road.
3. Create another Node with MeshRenderer and add **Cocos Splines V2/Junction Patch** component. Under Branches assign exactly 3–4 Road components and set **At End** per branch.
4. Set **Junction UV Mode = MatchedRepeat**, **Junction UV Blend = 0.55**, **Endpoint Tolerance=0.25**, **Flat Tolerance=0.1**, and **Patch Lift=0**. Use the SAME asphalt Material (slot 0) as the linked Roads. For road textures with baked-in directional lines, prefer plain asphalt for the junction.
5. Select the Junction Node and click **Rebuild Preview**. There should be no overlapping old Road surface inside the filled junction gap, and boundary UV0 must sample the same texture modulo the Repeat tile.
6. If rejected, inspect the Editor-only error: link the correct end, increase trim, align endpoints, remove shoulders/curbs or reduce geometry complexity. **Do not** use Junction Patch v2 for ramps, elevated roads or arbitrary crossings in this test milestone.
7. When satisfied, Bake glTF Asset for each Road and the Junction, assign the imported .mesh subasset when pending, save/reopen Scene and inspect. Manual/Baked Play never recreates the procedural mesh.

This does **not** make lane stripes from different Road arms join automatically. A dedicated junction marking/decal system is the next milestone.

## Test Junction Markings V2 — white stop bars, zebra and optional turn guides

1. Make a 3-/4-way Junction with ConstantWidth asphalt-only Roads exactly as described above (e.g., Width=4 and matching Junction Start/End Trim=3 on the connected ends). Rebuild each Road and the Junction once, confirming the unpainted patch is geometrically correct.
2. On the **Junction Patch** component, set `Generate Junction Markings = On`. Initially use `Generate Stop Bars = On`, `Generate Crosswalks = Off`, `Turn Guides = []`. Use flat unpainted asphalt in slot **0** and a simple white material in slot **3**. Rebuild Preview.
3. To test zebra, enable `Generate Crosswalks`. Defaults: `Zebra Stripe Length = 0.26`, `Zebra Gap = 0.18`, `Zebra Start Setback = 0.65`, `Zebra Stripe Count = 3`. Each JunctionRoadLink can disable stop/crosswalk paint on that arm. Increase Junction Trim if paint reports insufficient room.
4. For guided turn example, add a `Turn Guides` entry `From Branch = 0`, `To Branch = 1`, and assign yellow material to slot **4**. The pair numbers reference the order of entries in `Branches`; do not repeat the same from/to, and avoid out-of-range or same-branch pairs. This is geometry only, not a lane routing or legal driving decision.
5. `Marking Lift = 0.015` avoids coplanar Z-fighting; `Stop Bar Width = 0.14`, `Stop Bar Setback = 0.22`, `Marking Lateral Inset = 0.13`, and `Guide Line Width = 0.10` are starter values. The generator deliberately rejects markings that extend beyond the Junction polygon.
6. Rebuild Preview, inspect the Junction from the top and from a shallow camera angle, then Bake glTF Asset; a painted patch should have material slots `[0,3]` or `[0,3,4]`. Bind imported Mesh, save/reopen Scene, and Play in Baked mode. Runtime should neither create new Mesh assets nor log Editor warnings.

Do not assume lane arrows, road priority/traffic laws or complicated curb/junction joins are implemented in this test build.

## Test Junction with Shoulder/Curb v2 — flat 3-/4-way

1. Use an existing flat `SplinesV2.JunctionPatch` with exactly 3 or 4 open ConstantWidth Road arms, sharing the common world-space endpoint Knot. Select each Road, set **Width=4**, **Shoulder Width=0.45**, **Curb Width=0.22**, **Curb Height=0.16**. The same dimensions on all arms is the simplest first test, though mixed plain/profile arms are also supported.
2. Set connected **Junction Start/End Trim=4** on every linked Road, leaving the opposite end trim unchanged. Click **Rebuild Preview** on EVERY Road before Junction. A too-small trim raises an Editor error instead of generating overlapping profile polygons.
3. On the **Junction Patch**, set **Max Curb Height=0.6**, **Flat Tolerance=0.1**, **Junction UV Mode=MatchedRepeat**, **Patch Lift=0**. Keep a horizontal local XZ plane and use compatible materials on Roads and Junction: `0=asphalt`, `1=shoulder`, `2=curb`.
4. Click **Rebuild Preview** on Junction. Inspect the **whole profile edge**, including curb top/wall at every Road end. Its material/UV should meet the Road directly at the trimmed seam. Within the patch, curb lip is intentionally lowered to zero toward the intersection centre; it is not a sidewalk perimeter/curb CSG solver.
5. Optionally turn on **Generate Junction Markings** with asphalt unpainted, set `3=white paint`, `4=yellow turn guides`, and confirm the new paint remains on the asphalt wedge, not on the raised curb.
6. Bake each Road and the Junction via **Bake glTF Asset**, then save and reopen the scene. In Baked Play, the extension must not generate another procedural mesh or print authoring diagnostics.
7. If the scene still shows cracks/steep curb jumps, report the Road+Junction Inspector configuration and an overhead/sidelong screenshot. Real Cocos Creator 3.8.x has not yet been visually certified in CI.

Unsupported still: banked/uphill junctions, closed sidewalk perimeter, curb accessibility ramps and terrain contour merging.


## Junction Gentle Grade (alpha, chưa chứng nhận trong Editor thật)

1. Dùng 3 hoặc 4 Road ConstantWidth, trim đầu kết nối; có thể nâng/hạ điểm trim theo chiều dọc với độ dốc vừa phải. Knot endpoint của tất cả Road phải trùng nhau.
2. Trên Junction Patch: chọn **Grade Mode = Gentle**; để **Max Grade = 0.15** (chênh cao tối đa 0.15 đơn vị cho 1 đơn vị khoảng cách ngang từ tâm). **Flat** vẫn là mặc định.
3. Không nghiêng ngang mặt đường (bank/crossfall) quá 0.03; không dùng cho cầu vượt, cua xoắn, dốc gấp hoặc curb/sidewalk phức tạp.
4. Rebuild từng Road, rồi Rebuild Junction. Kiểm tra biên UV0 nối khớp, normal/ánh sáng, curb, paint và Bake/Reload trong bản sao Scene Cocos 3.8.x.
5. Các lỗi vượt grade, lệch endpoint hoặc road bị bank phải báo lỗi Editor; chế độ Baked Play không tự rebuild geometry.

> Đây là bước phụ của checkpoint 9; nối sidewalk/curb vòng ngoài chưa hoàn thành. Không sử dụng cho production.


## Junction Rounded Continuous Curb (alpha, flat only)

1. Tạo 3 hoặc 4 Road ConstantWidth, `Width=4`, `Shoulder Width=0.45`, `Curb Width=0.22`, `Curb Height=0.16`, mỗi đầu nối có `Junction Start/End Trim=4`. Các Knot endpoint phải trùng nhau, Road nằm cùng mặt phẳng.
2. Trong component `SplinesV2.JunctionPatch`, chọn `Curb Corner Mode = Rounded Continuous` thay cho `Radial Legacy` (mặc định). Dùng `Curb Corner Segments=12`, `Curb Corner Pull=0.32`, `Grade Mode=Flat`.
3. Gán cùng vật liệu Road/Junction: **slot 0 asphalt, slot 1 shoulder, slot 2 curb**. Nhấn Rebuild cho từng Road, rồi **Rebuild Preview** Junction. Mặt trên và thành curb phải nối qua góc đường, không chạy chụm về tâm giao lộ. UV0 ở toàn bộ vòng cắt Road phải khớp modulo Repeat.
4. Thử 3-way, 4-way, các Road dùng trục UV U/V khác nhau và chiều đi tới/đi ra Junction. Tăng Segments lên 20 để so sánh mặt cong. So sánh chế độ Radial Legacy trên bản sao Scene.
5. **Bake glTF Asset**, lưu Scene, đóng/mở lại, rồi Play Baked để kiểm tra không sinh lại mesh; quan sát normals, z-fighting và ngắt texture theo material gốc.
6. Đừng dùng Rounded Continuous nếu Road thiếu curb, bị bank, dốc hoặc trim quá ngắn; tool phải từ chối bằng thông báo trong Editor. Gentle Grade hiện chưa kết hợp với Rounded Continuous.

> Đây là curb góc nối cục bộ, chưa phải CSG sidewalk liên tục với terrain hoặc các Road mạng lưới. Cần kiểm thử trong Creator 3.8.x thật trước khi sản xuất.

 
## Junction Curb Ramp / Lowered Corner (alpha, chỉ hỗ trợ góc phẳng)

1. Dùng Junction 3/4 nhánh với **Curb Corner Mode = Rounded Continuous**, **Grade Mode = Flat**, tất cả Road đã có **Curb Width > 0**, **Curb Height > 0**, đủ Junction Trim.
2. Trong **Curb Ramps**, thêm cặp **From Branch = 0**, **To Branch = 1** (chỉ số từ mảng `Branches`, bắt đầu từ 0). Chọn hai nhánh thực sự kề nhau theo vòng giao lộ; không trùng cặp.
3. Đặt **Curb Ramp Min Lip = 0.015**, **Curb Ramp Max Slope = 0.35**. Nhấn **Rebuild Preview**. Mặt trên và thành curb ở giữa góc giảm dần đến mép thấp nhưng vẫn dày một ít (tránh tam giác suy biến); tại hai đầu Road giữ nguyên chiều cao và UV.
4. Test cả 3-way/4-way, đảo From/To, thay đổi cặp nhánh và so sánh trước/sau khi tắt hết Curb Ramps. Kiểm tra UV U/V, material slot 2, normal, vệt sáng và không bị mesh lọt vào asphalt. Thử Max Slope nhỏ để kiểm tra lỗi có thể sửa trong Editor.
5. Nhấn **Bake glTF Asset**, lưu/đóng/mở Scene và Play ở Baked; kiểm tra không có rebuild trong Play, fingerprint khác so với bản không có ramp.

> Đây mới chỉ là **lowered curb transition trong mesh Junction**, không tạo đủ sidewalk dốc có chiều sâu nối tới terrain, không đạt tiêu chuẩn thiết kế đường cho người đi bộ và chưa được xác nhận trực quan trên Cocos Creator 3.8.x. Không dùng cho production.

 
## Junction Sidewalk Apron → explicit terrain edge (alpha)

1. Tạo Junction phẳng 3/4 nhánh với **Curb Corner Mode = Rounded Continuous**, đủ trim, `Curb Width > 0`, `Curb Height > 0`. Chế độ **Grade Mode = Flat**.
2. Trong Junction Inspector đặt `Sidewalk Apron Width = 1` (0 = tắt), `Sidewalk Terrain Height Offset = 0`, `Sidewalk Max Cross Slope = 0.35`. Height Offset được đo theo **Y local của node Junction, tương đối với tâm Knot**, không lấy mẫu từ Terrain.
3. Gán material sidewalk riêng ở **slot 5**. Các material slot khác giữ nguyên (0=asphalt, 1=shoulder, 2=curb, 3=white paint, 4=yellow guide).
4. **Rebuild Preview**. Ở mỗi góc giao lộ, dải sidewalk mỏng chạy từ mép ngoài curb tới một đường biên địa hình phẳng ở Y mục tiêu. Kiểm tra không có tam giác úp, z-fighting và không phá texture đường. UV của riêng sidewalk lặp theo chiều dọc góc trên U, chiều ngang trên V.
5. Thử cả `Curb Ramps` cho cặp 0→1 và 1→0, thay đổi `Sidewalk Terrain Height Offset` và Width; hệ thống phải từ chối nếu vượt `Max Cross Slope`, sát tâm Junction hoặc vượt giới hạn. Khi đổi cấu hình cần **Bake glTF Asset** lại nếu dùng Baked.
6. Kiểm tra với Scene thực: đóng/mở, Play Baked, materials, tầm nhìn từ dưới và collider. Terrain nếu có phải được bố trí **phẳng tại độ cao đã nhập**; plugin chưa cắt/cập nhật mesh Terrain.

> **Giới hạn:** dải apron hiện chỉ sinh trên *khoảng giữa các nhánh Road* quanh góc Junction. Chưa nối liên tục theo cả tuyến vỉa hè, chưa lấy mẫu heightmap, chưa Boolean ghép terrain, chưa chứng nhận dốc cho người đi bộ hoặc Cocos Creator 3.8.x production.
