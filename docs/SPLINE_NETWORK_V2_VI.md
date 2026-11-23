# Spline Network / Shortest Route — v2 preview

## Phạm vi

Core/SplineNetworkGraph.ts tìm đường qua các SplineJunction đang hoạt động, không tạo Node, không thay Knot, không chỉnh prefab/mesh.

- Junction có 2+ links tạo các cạnh chuyển nhánh, giữ nguyên index trong mảng Connections.
- Di chuyển giữa marker theo normalized arc progress; chi phí = arc-distance theo **local units** của mỗi spline cộng transferPenalty khi chuyển.
- Graph có trạng thái Forward/Backward, không tự U-turn giữa đường. Exit Direction của link đích (Preserve/Forward/Backward) quyết định hướng đi sau chuyển.
- Closed spline wrap qua 1→0 / 0→1 đúng chiều không mất thêm khoảng cách.
- Dijkstra binary heap, chọn ít lần chuyển nhánh nếu đường cùng chi phí; giới hạn 512 spline, 512 junction, 2048 links, 4096 directional states, 65536 edges.
- maxWorldGap nếu >0: chặn link ở quá xa hoặc không có world position. Mặc định không chặn để tương thích Junction cũ.

## Cocos Inspector

1. Tạo các spline A/B/C và một hoặc nhiều SplineJunction có Connections đến từng đường.
2. Trong SplineAnimate chọn Junction Mode = Shortest Route (giá trị 4, không sửa enum cũ 0–3).
3. Gán Route Destination = SplineContainer đích; Route Destination Progress = normalized arc position (0..1).
4. Có thể đặt Route Transfer Penalty (mặc định 0.01 local units) và Route Max World Gap (0 tắt; >0 giới hạn khoảng cách world giữa hai đầu nối).
5. Khi follower chạy qua Junction, mode Shortest Route tính lại tuyến theo hướng đang đi, chọn đúng exitIndex trong Connections, gọi lại cơ chế chuyển nhánh/OnReach/OnSwitch hiện có.

## API

Import planSplineRoute từ đường dẫn Asset DB:

    db://cocos-splines/splines/Core/SplineNetwork

Ví dụ:

    const route = planSplineRoute(roadA, 0.25, roadC, 0.8, {
        startDirection: 1, transferPenalty: 0.01, maxWorldGap: 0.2,
    });
    console.log(route?.distance, route?.switchCount, route?.steps);
    follower.followRouteTo(roadC, 0.8);
    const inspection = follower.planRouteTo(roadC, 0.8);

Route trả về các step 'travel' (splineId, progress, direction, distance) và 'switch' (junctionId, entryIndex, exitIndex, from/toSplineId, direction). Maps route.splines và route.junctions tra component từ Node UUID.

## Giới hạn

- Chi phí route tính theo local arc-length, không phải world-length dưới non-uniform scale.
- Không ghép road mesh, snapping hay tự sửa spline. Không có world gap validation khi Route Max World Gap = 0.
- Shortest Route chỉ chọn exit khi cắt qua Junction. **Chưa có auto-stop tại Route Destination Progress**, sự kiện arrived, traffic reservation, hoặc routing đoàn tàu.
- Đường bị thay đổi trong Play sẽ được tính lại tại crossing tiếp theo. Nếu không có đường hợp lệ, follower tiếp tục trên spline hiện tại theo Loop Mode.
- Native Cocos Creator 3.8.8 Undo/Prefab/Scene smoke test còn phải kiểm tra. CI hiện test graph và mock runtime.

Manual smoke: tạo 2 Junction A→B/C và B→C, kiểm tra mode Shortest Route chọn tuyến ngắn, thử thay ExitDirection và Max World Gap, xác nhận onSwitch trả đúng entry/exit index.

## Phase 3.2a — Connector diagnostics / Snap Endpoint (Editor)

Trong Inspector của **Spline Junction** đã có mục **Connector validation / endpoint snap**.

1. Sau khi gán `Connections`, nhấn **Check Connectors**. Công cụ đọc link có SplineContainer hoạt động và đo trên toàn bộ các cặp: `gap` theo world units, `axisAngleDeg` (góc giữa trục tangent không xét dấu), `orientation` = `same` hoặc `opposed`. Kết quả hiển thị số cặp vượt `Position tolerance = 0.1` world units và `Angle tolerance = 15°`, cùng cặp có khoảng cách lớn nhất.
2. Nếu cần căn vị trí: đặt **Anchor link #** (mặc định 0) và **Target link #** (mặc định 1), nhấn **Snap Target Endpoint**. Link đích bắt buộc là `progress = 0` hoặc `1` trên một **spline mở khác với spline nguồn**. Chỉ dịch chuyển Knot đầu/cuối tương ứng, không chỉnh bất kỳ Node nào khác và không tự xoay tangent.
3. Với spline XY2D/XZ2D, anchor phải nằm đúng mặt phẳng 2D của target spline. Tọa độ trục ẩn của Knot được giữ nguyên; thao tác ngoài mặt phẳng bị từ chối.
4. Scene script tạo plan và guard trạng thái trước khi ghi. Editor dùng transaction `record:false`, đọc lại và tạo **một snapshot** khi thành công; lỗi ghi hoặc snapshot thì rollback vị trí. Nếu nguồn/Scene đổi, giao dịch bị hủy. Vì chỉ Snap Position, trường hợp tangent lệch góc phải chỉnh bằng gizmos theo cách bình thường sau khi Snap.

Các chỉ số của Junction link là **index gốc trong mảng Connections**, bao gồm nếu có ô trống trước chúng, không phải số thứ tự filtered entries. `Check Connectors` không thay đổi Scene. Nút Snap yêu cầu nút Spline Junction đang được chọn trong Hierarchy.

**Chưa hoàn thành:** tự động Align Tangent / C1 continuity, snap ở marker nằm giữa đường, snap Knot thuộc spline đóng, gộp connector graph, route cache, auto-stop khi follower đến đích và Creator 3.8.8 native Undo/Prefab smoke test.
