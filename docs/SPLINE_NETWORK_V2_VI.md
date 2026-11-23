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
