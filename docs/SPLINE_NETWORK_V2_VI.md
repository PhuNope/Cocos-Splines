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
    follower.followRouteTo(roadC, 0.8, true); // true = stop on arrival (opt-in)
    const inspection = follower.planRouteTo(roadC, 0.8);

Route trả về các step 'travel' (splineId, progress, direction, distance) và 'switch' (junctionId, entryIndex, exitIndex, from/toSplineId, direction). Maps route.splines và route.junctions tra component từ Node UUID.

## Giới hạn

- Chi phí route tính theo local arc-length, không phải world-length dưới non-uniform scale.
- Không ghép road mesh, snapping hay tự sửa spline. Không có world gap validation khi Route Max World Gap = 0.
- Shortest Route chọn exit khi cắt qua Junction và có thể phát On Arrived/auto-stop tại Route Destination Progress. Chưa có traffic reservation hoặc routing đoàn tàu.
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

## Phase 3.2b1 — Align Tangent G1 / C1 at endpoints (preview)

Trong Inspector `Spline Junction → Connector validation / endpoint snap`: chọn Anchor link # / Target link #, **Snap Target Endpoint** trước, sau đó chọn Tangent **G1** hoặc **C1**, chọn hướng `Same` hoặc `Opposed`, nhấn **Align Tangent**.

- Anchor và target phải là **hai spline mở khác nhau**, kết nối đúng ở `progress = 0` hoặc `1`, cách nhau tối đa **0.1 world units**. Nếu xa hơn, Snap Position trước.
- Chỉ **Knot đích** được phép sửa, và Knot này **phải đang ở TangentMode.Broken**. Nếu đang AutoSmooth/Linear/Mirrored/Continuous, phải chuyển sang Broken một cách chủ động trong Inspector; plugin không âm thầm đổi mode hoặc ghi đè nhánh tangent còn lại.
- G1: căn vector đạo hàm theo world direction của anchor, giữ nguyên **world-space magnitude** của handle target (độ dài tiếp tuyến gốc). Target 0-length không hỗ trợ G1.
- C1: căn cùng trục và sao chép **world-space cubic control vector length** của endpoint anchor (tương đương độ lớn đạo hàm `dP/du = 3 × handle` theo tham số từng đoạn Bezier, **không** tương đương matching velocity theo normalized arc distance khi độ dài đoạn khác nhau).
- `Same` căn hướng tăng progress của spline đích trùng với hướng tăng progress spline nguồn; `Opposed` đảo hướng (hữu ích khi switch đảo chiều). Hướng `Reversed` của hai spline được xử lý khi xác định Tangent In/Out gốc.
- Nếu target có `TangentInHandle`/`TangentOutHandle` đúng loại, thao tác sửa **position của child handle node đó**; không ghi vào vector field bị handle override. Với Knot không có handle node, ghi chính trường serialized tangent. Rotation của Knot, parent transform và nonuniform scale được xét khi đổi vector World → local.
- XY2D/XZ2D không căn một hướng nằm ngoài mặt phẳng target. Không dịch chuyển Knot position và không sửa tangent đầu kia. Scene guard giữ nguyên source, orientation, Knot hierarchy, handles khác và scene identity.
- Editor dùng `record:false`, read-back xác nhận giá trị, **một Scene snapshot** khi thao tác thành công, rollback target field nếu write/snapshot lỗi; nếu đã chuyển Scene, không viết rollback sang Scene mới.

**Giới hạn:** không hàn hình học hoặc road mesh, không dùng cubic refit để giữ curvature bên trong một đoạn sau khi sửa tangent, chưa áp dụng tangent align cho interior link hoặc closed spline. G1/C1 mô tả tính liên tục tại **hai vị trí endpoint đã trùng nhau**, không bảo đảm toàn bộ Junction mesh trơn. Kiểm tra Undo/Redo, Prefab override và save/reopen vẫn phải thực hiện trực tiếp trong Cocos Creator 3.8.8.

## Phase 3.3 — Runtime route arrival & optional auto-stop

`SplineAnimate` có thêm `Stop On Route Arrival` (mặc định **false**, giữ chuyển động cũ) và danh sách Inspector `On Route Arrived`. Khi `Junction Mode = Shortest Route` và `Route Destination` đúng bằng spline hiện tại, follower nhận biết lúc di chuyển qua `Route Destination Progress` (chuẩn hóa khoảng cách arc 0–1), cắt frame tại **chính mốc** và phát sự kiện một lần. Tính năng hoạt động khi tuyến đi qua Junction khác trong cùng frame, đi tiến/lùi, hoặc spawn trực tiếp trên vị trí đích.

Nếu `Stop On Route Arrival = true`, `SplineAnimate` đặt trạng thái playing=false tại mốc, không di chuyển quá. Nếu false, sự kiện vẫn phát nhưng follower tiếp tục qua đích; không bị gọi lại mỗi vòng Loop/PingPong. `On End Reached` / `On Beginning Reached` vẫn được phát nếu đích nằm ở biên 0/1.

Các API runtime:
```ts
follower.followRouteTo(roadC, 0.8, true); // yêu cầu mới: dừng ở mốc
follower.AddOnRouteArrivedEvent((event) => {
    console.log(event.spline, event.progress, event.direction, event.stopped);
});
follower.RemoveOnRouteArrivedEvent(callback, optionalTarget);
console.log(follower.routeArrived, follower.isPlaying);
```

Cũng có `onRouteArrived` (`EventHandler[]`) và Node event `spline-route-arrived`, payload `{follower,target,spline,progress,direction,stopped}`.

Gọi `followRouteTo`, `restart`, `seek` hay `setCurrentSpline` sẽ re-arm cho một lượt đến đích mới. Chỉnh đích/progress qua Inspector cũng sẽ phát lại khi đi tới đích mới. `play()` sau khi dừng **không tự re-arm** cùng đích để tránh duplicate. Chế độ Off/Manual/FirstOther/RoundRobin và Scene Editor preview không phát On Arrived.

**Giới hạn:** Tính năng này chỉ xử lý khi follower **thực sự đi tới mốc** theo hướng di chuyển trên spline đích; nếu đích nằm phía sau mà không có route reverse hợp lệ, không teleport hay tự quay đầu. Không có global route distance caching, traffic reservation hoặc báo route-unreachable tự động. Kiểm chứng Cocos Creator 3.8.8 trong runtime thật vẫn cần bổ sung.

## Phase 3.4 — Bounded Route Cache & automatic invalidation

`planSplineRoute()` / `nextShortestJunctionExit()` vẫn giữ nguyên signature và kết quả. Graph được compile một lần khi network topology không đổi và sử dụng chung giữa các follower; cùng điểm đầu/đích, chiều di chuyển và các tùy chọn thì kết quả Dijkstra được cache. Khi follower đi tới một Junction khác hoặc đổi progress, phần graph có thể được tái sử dụng, còn shortest-path được tính cho truy vấn mới.

**Khóa thay đổi:** tham chiếu đối tượng component/Node, Scene Node UUID, danh sách active+enabled Junctions, thứ tự/nguồn các Connections, `positionMode`, `progress`, `distance`, `exitDirection`, SplineContainer `enabled/count/closed/reversed/dimension/length`, `getRevision()` (Knot geometry/handles) và `node.worldMatrix` (kể cả parent transform và nonuniform scale). Đổi link/mesh/transform hoặc bật/tắt Junction sẽ tạo snapshot mới ở lần truy vấn tiếp theo. Nếu spline adapter không có geometry revision hoặc worldMatrix, cache tự bỏ qua (fail-safe, không giữ hình học cũ).

- Cache bounded LRU: tối đa **4 graph snapshots**, mỗi snapshot có tối đa **64 route queries** (gồm kết quả không có tuyến, `null`). Không dùng timer, không cần vòng Editor update.
- Kết quả route được clone thành object/steps mới, Maps của SplineContainer/Junction cũng được clone khi trả ra, nên UI/gameplay sửa route preview không làm bẩn dữ liệu cache.
- `invalidateSplineNetworkCache()` có thể được gọi từ gameplay/tooling khi thay đổi network bằng cơ chế không tác động tới `getRevision()` hoặc muốn giải phóng cache. `getSplineNetworkCacheStats()` trả về `{snapshots,paths,graphBuilds,graphHits,routeComputes,routeHits}` để so sánh hiệu năng.
- **Chưa chuyển sang world-distance routing**: chi phí route vẫn là local arc length; worldMatrix dùng để vô hiệu hóa điểm nối và kiểm tra `maxWorldGap`.
- Không cache riêng `SplineAnimate` để tránh lưu graph cũ sau khi đổi Scene. Registry global và các object Node có giới hạn số lượng phần tử trong LRU.

Native Cocos Creator 3.8.8: thử 2 follower chung route, gọi `getSplineNetworkCacheStats()` trước/sau crossing; di chuyển spline parent Node, sửa Knot, đổi Junction connections, bật/tắt Junction, xác nhận route được dựng lại và `On Route Arrived` không phát sai. CI mock chưa thay thế kiểm thử native Editor/Prefab.

## Phase 3.5 — World-distance Routing (opt-in)

Bổ sung `costSpace: 'local' | 'world'` trong `planSplineRoute`, `nextShortestJunctionExit` và `SplineAnimate → Junction routing → Route Cost Space`. **Local (0)** vẫn là mặc định, giữ đúng logic và đơn vị chi phí của scene cũ. **World (1)** dùng chiều dài cung đo theo tọa độ thế giới để chọn đường ngắn nhất, kể cả khi các spline bị scale, rotate hoặc có parent transform không đồng đều.

Cách tính: mỗi spline lấy mẫu các vị trí World theo **normalized LOCAL arc progress** trong khoảng 0..1, số mẫu `min(4096, max(64, segmentCount × min(samplesPerCurve, 64)))`. Tích lũy khoảng cách 3D giữa các mẫu, sau đó nội suy tổng quãng đường World ở các mốc Junction, điểm đầu và điểm đích. Độ dài dùng **polyline approximation**, không phải tích phân liên tục chính xác. Với spline nhiều curvature hoặc scale mạnh, tăng Samples Per Curve để giảm sai số; hệ thống vẫn giới hạn tối đa 4096 mẫu.

- `distance` trong từng travel step, `route.distance` và `route.cost` dùng **world units** khi World được chọn; Local vẫn sử dụng đơn vị local. `transferPenalty` tính bằng cùng đơn vị với costSpace đang chọn, không cộng world gap vào chi phí (gap chỉ là bộ lọc khi bật `maxWorldGap`).
- Chiều chạy (Forward/Backward), Closed seam, `exitDirection`, `On Route Arrived` và `Stop On Route Arrival` giữ nguyên.
- Graph World/Local được cache bằng **các snapshot khác nhau**; mỗi snapshot dùng cùng quy tắc LRU và invalidation của Phase 3.4. Thay đổi Knot, parent world matrix, Connections hoặc costSpace sẽ tính lại chi phí tương ứng.
- Khi World shape bị suy biến (chiều dài gần bằng 0 do scale), hoặc sampling trả về NaN/Infinity, route bị từ chối an toàn, không áp dụng nhánh sai.
- Với rất nhiều spline và follower, lần build graph World đầu tiên có chi phí cao hơn Local do lấy mẫu; subsequent queries tái dùng snapshot nếu chưa có sửa đổi.
- Cocos Creator 3.8.8 cần smoke test ở runtime: spline đường thẳng với Scale X=3/Scale Y=1, đường cong có parent rotation+scale, spline đóng, hai đường thay thế B/C với scale khác nhau; kiểm tra Route Cost Space=Local chọn B nhưng World chọn C, đồng thời việc thay parent transform khiến cache invalidated.

Ví dụ gọi trực tiếp:

```ts
const worldRoute = planSplineRoute(roadA, .25, roadC, .8, {
  costSpace: 'world', startDirection: 1, transferPenalty: .01,
  maxWorldGap: .2,
});
console.log(worldRoute?.distance); // approximated world-space arc distance
follower.routeCostSpace = RouteCostSpace.World;
follower.followRouteTo(roadC, .8, true);
```

`RouteCostSpace` được export từ `SplineAnimate.ts`. Tính năng này **không** thay đổi logic di chuyển/constant speed của follower: chỉ thay trọng số lựa chọn nhánh.

## Phase 3.6a — Route diagnostics & opt-in Junction exit capacity

- `inspectSplineRoute(start, startProgress, end, endProgress, options)` trả về trạng thái `reachable`, `unreachable` hoặc `invalid`, thông báo, route tùy chọn và các chỉ số `junctionCount`, `linkCount`, `saturatedExits`. Dùng `SplineAnimate.inspectRouteTo(destination, progress)` để xem chẩn đoán từ trạng thái/hướng hiện tại của follower. Chẩn đoán chỉ đọc, không gọi On Reach/On Switch và không giữ slot.
- Trên **SplineJunction → Connections[] → Max Followers**, đặt `1..4096` để giới hạn số **follower đã được cấp quyền chuyển vào link đích**; `0` (mặc định) là unlimited. Chỉ những `SplineAnimate` có bật **Enable Traffic Capacity** mới bị kiểm soát và tính vào hạn mức. Do đó tính năng này có thể bật từng follower mà không thay đổi scene cũ.
- Khi link đích đã đầy, follower opt-in vẫn ở nguyên source spline, dừng đúng Junction marker, phát Node event `spline-traffic-blocked` một lần cho mỗi lần vào trạng thái chờ, và thử lại trong các frame sau. Follower vẫn ở `isPlaying=true` và `isWaitingForTraffic=true` trong thời gian chờ; không chạy xuyên qua điểm nối. Khi giải phóng slot, follower chuyển spline theo chính cơ chế hiện có rồi tiếp tục thời gian còn lại trong frame. On Reach không bị gọi lại mỗi frame.
- Slot được giữ khi follower đã vào một link giới hạn, kể cả lúc pause hoặc Stop On Route Arrival. Slot trả lại khi chuyển sang link khác (nguyên tử, nếu đích đầy thì giữ slot cũ), khi `onDisable/onDestroy/restart/seek/setCurrentSpline`, hoặc chuyển sang exit unlimited. `getSplineTrafficOccupancy(junction, exitIndex)` trả số follower đang giữ slot. Các follower không opt-in không tính vào occupancy.
- Route graph **không loại bỏ** link đầy khi tính đường ngắn nhất: vì slot có thể được giải phóng, `inspectSplineRoute` vẫn trả `reachable` với `saturatedExits>0`. Nếu thay link đích hoặc xóa Junction trong lúc chờ, follower hủy chờ và không chuyển sang link không còn hợp lệ. `ShortestRoute` tính lại exit khi thử lại để hỗ trợ thay đổi destination.
- Giới hạn hiện tại: đây là admission control **theo destination link**, không phải phát hiện va chạm vật lý, traffic simulation, queue ưu tiên/fairness, hay khống chế tổng số object trực tiếp sinh trên spline. Không có thời gian chờ dự kiến và không có route rerouting tự động để tránh link đầy. Nếu follower tắt traffic trong khi đang chờ, chờ được hủy; follower tiếp tục spline nguồn. Không dành cho multiplayer authoritative replication.
- Chưa xác nhận Creator 3.8.8 runtime/native: kiểm tra đồng thời 3 follower ở Junction có Max Followers=1, pause/disable follower đầu, thay Connections trong Play, route arrival và Scene reload; sau đó kiểm tra chỉ số occupancy, On Switch, On Arrived.

## Phase 3.6b — FIFO traffic queues & congestion-aware alternative routing

**FIFO admission:** Trên mỗi `SplineJunctionLink` có `Max Followers` (0 = unlimited). Với follower có `Enable Traffic Capacity = true`, các yêu cầu vào exit đã đầy được xếp vào hàng chờ theo **thứ tự lần đầu bị chặn** (First In First Out). Khi slot trống, follower ở đầu hàng được ưu tiên cấp slot trước follower mới hoặc follower update sớm hơn. Không xếp trùng khi cùng follower retry; sửa destination, reverse, seek, restart, disable/destroy hoặc xóa Junction sẽ hủy hàng chờ.

- `follower.isWaitingForTraffic`: có đang chờ hay không; `follower.trafficQueuePosition`: vị trí 1-based (0 nếu không chờ). `getSplineTrafficQueueLength(junction, exitIndex)` trả số follower đang chờ một exit. `inspectSplineRoute(...).waitingFollowers` là tổng người chờ trên các Junction đang bật.
- Admission là **atomic** giữa các exit: follower giữ slot cũ khi lối kế tiếp đã đầy, và chỉ nhả slot cũ khi được nhận vào exit đích. `releaseJunction()` trả tất cả slot và dọn tất cả hàng chờ khi Junction disable/destroy.
- `SplineAnimate → Enable Traffic Capacity → Reroute Around Traffic` (mặc định false) chỉ áp dụng cùng `Junction Mode = Shortest Route`. Khi lối đi ngắn nhất đang đầy hoặc đã có người xếp trước, route planner thử một tuyến hợp lệ khác bằng cách loại **các destination exits tạm thời không thể cấp slot** ở thời điểm đó. Chế độ Local/World, direction và maxWorldGap giữ nguyên. Nếu lối khác đi được, follower chuyển vào đó và phát Node event `spline-traffic-rerouted`; nếu không, follower đứng ở Junction và xếp hàng FIFO trên exit ban đầu.
- Một follower đã chờ cũng tính lại tuyến khi retry. Nếu đường tắc được giải phóng, follower đầu hàng nhận slot. Nếu vừa xuất hiện đường khác hợp lệ, follower có bật reroute có thể rời hàng cũ để sử dụng đường đó.
- Route cache tách kết quả với tập `excludedExits` (sắp xếp ổn định), không xóa/sửa graph chung. Vì vậy các truy vấn route bình thường không bị ảnh hưởng bởi các truy vấn traffic.
- Node events: `spline-traffic-blocked` phát lúc bắt đầu chờ, payload thêm `queuePosition`; `spline-traffic-rerouted` khi chọn nhánh thay thế. `onReach`, `onSwitch`, `onRouteArrived` vẫn theo đường đi thực tế, không spam khi đứng chờ.

**Giới hạn:** FIFO chỉ công bằng giữa các follower được quản lý bởi cùng runtime instance; không kiểm soát thứ tự tick từ mạng multiplayer, không dự đoán thời gian hết tắc, không mô phỏng xe cộ/đo khoảng cách an toàn giữa follower. Slot hiện chỉ được nhả khi chuyển link, teleport hoặc lifecycle, không tự động nhả khi một follower đi ra khỏi đoạn hình học đã vượt qua Junction. Reroute không chạy liên tục mỗi frame cho follower đang di chuyển; chỉ chạy tại lúc cần đổi spline hoặc chờ slot. Trường hợp Scene save/reopen, nested Prefab và nhiều follower trong Cocos Creator 3.8.8 vẫn cần test trực tiếp.

## Phase 3.6b2a — Safe headway along shared spline (opt-in)

`SplineAnimate` bổ sung mục Inspector **Follower headway (opt-in)**:

- `Enable Headway` (mặc định **Off**): chỉ các follower bật tùy chọn này mới đăng ký vật cản cho nhau. Follower đang `pause()` vẫn giữ chỗ, cho tới khi được `onDisable()`, `onDestroy()` hoặc tắt Enable Headway.
- `Headway World Gap` (mặc định 2 world units): khoảng cách tối thiểu theo **chiều dài cung của SplineContainer trong World**, không phải khoảng cách đường thẳng Euclidean hoặc local-progress.
- `Headway Brake Distance` (mặc định 4 world units, 0 = hard clamp): khi khoảng cách an toàn còn lại nhỏ hơn ngưỡng này, giảm bước di chuyển tối đa tỉ lệ với khoảng cách còn lại. Nếu đã hết khoảng cách an toàn, follower đứng chờ mà `isPlaying` vẫn true, tự đi tiếp khi xe phía trước tiến lên.

Mỗi frame, follower đồng bộ spline/progress/hướng vào `splineHeadwayRegistry`; trước khi xử lý Trigger, Junction hoặc On Arrived, bước cập nhật bị giới hạn ở mốc an toàn. Nếu bước ngắn hơn yêu cầu, thời gian còn lại trong frame được bỏ qua để không vượt quá vật cản khi chạy tốc độ cao hoặc `dt` lớn. Tính toán dùng world arc polyline samples như tính năng World-distance Routing và có cache theo `getRevision()` + worldMatrix của spline. Với closed spline, khoảng cách được kiểm tra qua vòng nối progress 1→0 hoặc 0→1 theo hướng chạy; hỗ trợ Forward/Backward, World scale và parent transform.

Runtime API: `follower.isHeadwayBlocked` (true khi không thể tiến thêm), Node events `spline-headway-blocked` và `spline-headway-cleared` (chỉ phát khi trạng thái thay đổi; payload gồm follower, spline, leader, nearestWorldGap, requiredWorldGap). Registry singleton `splineHeadwayRegistry` nằm trong Core/SplineHeadway; chỉ dùng trong gameplay, không dùng Editor preview.

Ví dụ test:

```ts
leader.enableHeadway = true;
follower.enableHeadway = true;
follower.headwayWorldGap = 2;
follower.headwayBrakeDistance = 4;
follower.node.on('spline-headway-blocked', (e) => console.log(e.leader));
```

**Giới hạn quan trọng:** Đây là headway 1 chiều dọc centerline của **cùng SplineContainer**, không phải collision detection 3D: không xét chiều dài/width vehicle, các đối tượng không có SplineAnimate opt-in, các spline khác nhau, offset/lane geometry, nút giao cắt vật lý, đoạn spline tự giao, vật thể đi ngược trên lane khác hay đường link teleport. Follower xuất hiện ban đầu quá gần nhau không được tách vật lý; chỉ ngăn di chuyển *tiến thêm*. Với scene có nhiều lane dùng chung centerline, tính năng có thể hạn chế xe thuộc lane khác nhau. Cần phối hợp traffic reservation hiện có để xử lý chuyển nhánh và kiểm tra trực tiếp trong Creator 3.8.8 trước khi dùng ở production. Các hạng mục traffic lights, priority, server authority và collision 3D vẫn chưa được triển khai.

## Phase 3.6b2b1 — Manual Traffic Signals & Priority Queue

**SplineJunction → Connections → Traffic Signal** có hai trạng thái:

- `Green = 0` (mặc định): Cho phép admission, nhưng vẫn phải thỏa `Max Followers` và hàng chờ ưu tiên. `Red = 1`: chặn tất cả follower có `Enable Traffic Capacity = true` xin vào **exit đó**, kể cả khi `Max Followers = 0`. Follower giữ nguyên tại marker, xếp hàng và retry khi Green.
- Từ script có thể điều khiển bằng `junction.setTrafficSignal(exitIndex, JunctionTrafficSignal.Red)` và đọc lại bằng `junction.getTrafficSignal(exitIndex)`. Phương thức `setTrafficSignal` trả boolean: false với index/state không hợp lệ hoặc khi state không đổi; thay đổi thành công phát Node event `spline-traffic-signal-changed` với `{junction,exitIndex,previous,state}`. Chỉ cập nhật property serialized của link; người dùng có thể tự xây controller đèn thời gian từ gameplay script.
- Trên `SplineAnimate` bật **Enable Traffic Capacity**, đặt **Traffic Priority 0..10** (mặc định 0). Hàng chờ của mỗi Junction exit xét mức ưu tiên cao trước; **cùng mức ưu tiên vẫn FIFO**. Khi priority đổi trong lúc đang đợi, follower được sắp xếp lại khi retry; không cướp slot đã cấp cho follower khác. Chờ Green không tự pause playback, nên `isPlaying` vẫn true.
- **Reroute Around Traffic** áp dụng cho cả exit đang Red và exit Green đã đầy/hàng đợi ưu tiên cao. Nếu có đường thay thế hợp lệ và không bị chặn, follower có thể chuyển sang exit đó thay vì xếp hàng. Tuyến loại trừ được cache riêng theo tập `excludedExits`; không sửa Network Graph hoặc link serialized.
- `inspectSplineRoute(...).redExits` đếm số exit Red trong các Junction hoạt động. `getSplineTrafficQueueLength` và `trafficQueuePosition` vẫn dùng như Phase 3.6b1. Payload `spline-traffic-blocked` có thêm `trafficSignal` và `trafficPriority`.

Ví dụ runtime:

```ts
import { JunctionTrafficSignal } from './Components/SplineJunction';
junction.setTrafficSignal(1, JunctionTrafficSignal.Red);
// sau khi đường thông:
junction.setTrafficSignal(1, JunctionTrafficSignal.Green);
ambulance.enableTrafficCapacity = true;
ambulance.trafficPriority = 10;
```

**Tương thích:** `Traffic Signal = Green`, `Traffic Priority = 0`, `Enable Traffic Capacity = false` theo mặc định. Scene cũ không chịu Red/priority trừ khi chủ động opt-in traffic. Red không thu hồi slot của xe đã đi qua; chỉ giới hạn lượt admission **tiếp theo**.

**Giới hạn:** Đây là tín hiệu **điều khiển bằng tay/script**, chưa có chu kỳ đèn tự động, yellow clearance, conflict matrix giữa các exit, right-of-way theo hướng tiếp cận, fairness chống starvation khi liên tục xuất hiện xe ưu tiên cao, vật lý 3D hay multiplayer authoritative. Cần smoke test trong Creator 3.8.8 với Prefab overrides, Undo, editor save/reopen và event listener khi script đổi trạng thái.

## Phase 3.6b2b2a — Automatic Traffic Light Controller (preview)

Có **Add Component → Splines → Spline Traffic Controller** (class `Splines.SplineTrafficController`). Thêm vào cùng Node của `SplineJunction` hoặc kéo Junction vào trường `Junction`. Controller **không tự thêm vào Scene cũ** và hoàn toàn không thay đổi các Junction đang sử dụng điều khiển thủ công. Chỉ các follower bật `Enable Traffic Capacity` mới tuân thủ đèn.

Mỗi `Phase` có `Green Exits` (mảng **chỉ số gốc** trong `SplineJunction.connections`), `Green Seconds` và `Yellow Seconds`. Chỉ các exit thuộc phase được Green/Yellow; các exit còn lại đều Red. Sau Green, exit đó chuyển Yellow (không cấp lượt admission mới), kế tiếp **tất cả exit Red** trong `All Red Seconds` (mặc định 1 giây), rồi mới bật Green của phase tiếp theo. Khi bật controller, lần đầu **All-Red** trong cùng khoảng thời gian clearance trước Phase 0. Không có Green chồng lấn khi chuyển pha, kể cả tick lớn hoặc event từ gameplay.

`Conflicts` là danh sách cặp `First Exit` / `Second Exit` không được Green đồng thời. Bộ lập lịch **bác bỏ cấu hình** khi hai exit thuộc cùng cặp conflict cùng xuất hiện trong một `Green Exits`, hoặc có chỉ số trùng, ngoài phạm vi, thời lượng không hợp lệ hay thời lượng All-Red dưới 0.05 s. Không tự suy ra cặp xung đột bằng hình học: **người tạo Scene phải liệt kê các cặp thực sự giao nhau**. Trong trường hợp không hợp lệ, controller giữ tất cả link ở Red và phát `spline-traffic-cycle-invalid` khi lỗi mới xuất hiện; tự phục hồi từ All-Red khi cấu hình được sửa.

`SplineJunctionLink.trafficSignal` nhận **Green=0**, **Red=1**, **Yellow=2**. Yellow giữ nguyên lịch pha quan sát được, nhưng admission và reroute xem như không mở đường. `inspectSplineRoute().yellowExits` cung cấp số exit đang Yellow; `redExits` vẫn đếm các exit Red.

### Runtime API và events

```ts
import {SplineTrafficController} from './Components/SplineTrafficController';
const controller = trafficNode.getComponent(SplineTrafficController)!;
controller.pauseCycle();     // mọi exit Red cho tới khi resume
controller.resumeCycle();    // restart từ All-Red clearance
controller.restartCycle();   // reset clock/phase về All-Red
console.log(controller.stage,controller.phaseIndex,controller.remainingSeconds);
console.log(controller.validationError,controller.isCycling);
```

Node gắn controller phát `spline-traffic-cycle-stage` với payload `{controller,junction,stage,phaseIndex,remainingSeconds}` khi đổi pha; `spline-traffic-cycle-invalid` khi mới phát hiện cấu hình lỗi. Junction vẫn phát `spline-traffic-signal-changed` cho từng exit thay đổi màu. Chạy trong Play/runtime; **Editor preview không chạy đồng hồ pha**.

Controller có quyền điều khiển các exit đang quản lý: nếu gameplay script tự đổi màu manual trong khi controller đang chạy, ở tick sau nó sẽ được đặt về màu của phase hiện tại. Tắt/xóa controller sẽ **khôi phục trạng thái thủ công trước khi controller chạy**, ghi nhớ theo danh tính `SplineJunctionLink` chứ không phải chỉ số mảng. Hai controller cùng tham chiếu một Junction không được phép cùng điều khiển: controller đến sau từ chối ghi cho đến khi controller đầu nhả quyền.

### Test gợi ý

Tạo Junction có 3 Connections. Phase 0: `Green Exits = [0]`, Green=2s, Yellow=1s; Phase 1: `Green Exits = [1,2]`, Green=2s, Yellow=1s; All-Red=1s; Conflicts=`(0,1)`. Khi Play: 0–1s toàn Red, 1–3s exit 0 Green, 3–4s exit 0 Yellow, 4–5s toàn Red, 5–7s exits 1 và 2 Green, 7–8s Yellow, 8–9s toàn Red, 9s quay về Phase 0. Đổi `Phase 0 Green Exits = [0,1]` khi Play: cấu hình bị chặn và tất cả Red.

**Giới hạn:** Chưa có tự động lựa chọn pha theo lưu lượng, minimum yellow clearance theo tốc độ xe, controller vật lý vùng giao cắt hoặc tính toán conflict từ road mesh. Đây là **tín hiệu điều tiết admission**: nó không ngăn một xe đã được cấp slot tiếp tục chạy, không preempt slot, không phối hợp traffic lights giữa các Junction. CI dùng mock Cocos; cần thử thêm trong Creator 3.8.8 với serialization của nested Phase/Conflict arrays, Prefab override, Undo/Redo và hot reload.
