# Cocos Splines v0.6.0 — Junction, Trigger và tọa độ t / Distance

Dành cho **Cocos Creator >=3.8.2**. Chỉnh tất cả trong **Inspector**, không dùng panel ngoài.

## 1. Hiểu 3 kiểu tọa độ

| Position Mode | Nhập | Ý nghĩa |
|---|---|---|
| **Normalized Distance** (mặc định, tương thích v0.5) | `Progress` từ 0 đến 1 | Tỷ lệ *chiều dài cung* (0 = đầu, 1 = cuối). |
| **Distance** | `Distance` ≥ 0 | Chiều dài tuyệt đối tính từ đầu spline, theo **đơn vị local của SplineContainer**. Giá trị lớn hơn chiều dài sẽ được clamp ở cuối. |
| **Spline T** | `Progress` từ 0 đến 1 | Tham số Bézier, mỗi segment chiếm tỷ lệ t bằng nhau, **không** nhất thiết cách đều theo mét. |

Ví dụ: spline dài 40 đơn vị gồm hai segment dài 10 và 30. Tại `t = 0.5` (hết segment thứ nhất) tương đương `Distance = 10`, tức **Normalized Distance = 0.25**. Trên spline cong, giá trị thực tế có thể khác do hình Bézier.

Các giá trị quy đổi lấy từ bảng chiều dài cung (`samplesPerCurve`); tăng Samples Per Curve để tăng độ chính xác. **Distance tính trong không gian local**, nếu node cha hoặc spline có scale khác 1 thì chiều dài trong thế giới có thể khác.

**Không thay đổi ý nghĩa cũ:** Những component v0.5 có `progress`/`startProgress`/`endProgress` mặc định vẫn dùng Normalized Distance. Ở `SplineAnimate`, `Start Progress`, `Preview Progress` cũ đi qua easing như v0.5; chuyển sang `Distance` hoặc `Spline T` thì vị trí bắt đầu/preview được tính **chính xác theo tọa độ** kể cả khi bật easing.

## 2. Tạo Junction ngã ba — ví dụ cụ thể

Mục tiêu: xe chạy Road A đến cách đầu đường 12 đơn vị thì chuyển vào đầu Road B hoặc Road C.

1. **Tạo 3 spline**: `Road A`, `Road B`, `Road C`, mỗi Road là `SplineContainer` riêng. Điều chỉnh knot sao cho tọa độ **thế giới** tại `A: Distance=12`, `B: Distance=0`, `C: Distance=0` là cùng một chỗ. Để ý cả hướng đi và chiều của tangent.
2. Chọn `Road A` trong Hierarchy → **Inspector > Spline Container > Add Junction**. Một Node `Spline Junction` được tạo ở hierarchy (là node độc lập, **không** tự làm knot). Chọn node đó.
3. Inspector `Spline Junction > Connections`: tăng số phần tử lên **3**, gán:

   | Index | Spline | Position Mode | Distance | Exit Direction |
   |---|---|---|---|---|
   | `0` | Road A | Distance | `12` | Forward |
   | `1` | Road B | Distance | `0` | Forward |
   | `2` | Road C | Distance | `0` | Forward |

   Mỗi phần tử trong array có riêng `Position Mode`, `Progress`, `Distance` và `Exit Direction`. Cocos Inspector có thể hiện cả Progress và Distance trong sub-object: **chỉ trường tương ứng Position Mode mới có hiệu lực**.
4. Tạo `Car` bên ngoài Node của spline (không đặt `SplineAnimate` Target trùng `SplineContainer`); gắn `SplineAnimate`. Kéo `Road A` vào `Spline`. Đặt `Target` là xe hoặc để trống nếu gắn trực tiếp lên xe.
5. Ở `SplineAnimate`, đặt `Junction Mode = First Other`. Chọn `Play On Start` và `Method = Speed`, `Speed = 2` để chạy thử. Khi đi tới `A: Distance 12`, follower tự chọn link `1` và nhảy sang Road B. Với `Speed=2` (local units/s), nếu bắt đầu từ 0 và đường không đổi, dự kiến đến junction sau 6 giây.
6. Trong `Spline Junction > On Reach` và `On Switch`, có thể gán Cocos EventHandler gọi method ở script để báo UI, hiệu ứng, traffic logic, v.v.

**Lưu ý:** Junction chỉ chuyển **logic follower**, không tự nối mesh Road/Extrude hoặc sinh mặt giao lộ. Sẽ xảy ra "teleport" nếu hai link không trùng vị trí thế giới. Cũng cần chọn `Exit Direction` phù hợp hướng của nhánh rời đi (Forward/Backward). `Preserve` giữ chiều đang di chuyển trên nhánh trước.

### 3. Chọn tuyến bằng script (Manual)

1. Đặt `Car > SplineAnimate > Junction Mode = Manual`.
2. Tạo file script sau trong `assets/scripts/TrafficRouter.ts`, gắn component này vào Node tùy ý.
3. Trong `Spline Junction > On Reach` (EventHandler), kéo Node có component `TrafficRouter` vào Target, chọn Component `TrafficRouter`, Handler `chooseRoute`.
4. Khi xe đi vào Road A (entry 0), callback sẽ chọn link 2 (`Road C`). Nếu đi vào từ B/C, callback chọn link 0 (Road A).

```ts
import { _decorator, Component } from 'cc';
import { SplineAnimate } from 'db://cocos-splines/splines/Components/SplineAnimate';
const { ccclass } = _decorator;

@ccclass('TrafficRouter')
export class TrafficRouter extends Component {
    chooseRoute(event: { follower: SplineAnimate; entryIndex: number }) {
        const exitIndex = event.entryIndex === 0 ? 2 : 0;
        event.follower.requestJunctionExit(exitIndex);
    }
}
```

`exitIndex` **là vị trí trong mảng Connections, bắt đầu từ 0**, không phải ID của spline. Không thể chọn lại đúng link đang vào. `On Reach` luôn phát khi đi qua link, kể cả không chuyển đường. `On Switch` chỉ phát sau khi đã chuyển spline thành công.

> Nếu muốn nhiều junction trên cùng spline, tạo nhiều `Spline Junction` và chia link theo mốc riêng. Đặt hai junction quá sát nhau có thể tạo đường vòng cực ngắn; follower có giới hạn vòng lặp để tránh treo game.

### 4. Payload và Node Events

Trong `On Reach`: payload dạng:

```ts
{
  junction, follower, target,
  entryIndex, exitIndex: -1,
  spline,
  progress,    // normalized arc distance 0..1, KHÔNG phải t
  distance,    // absolute spline-local units
  t,           // cubic Bezier parameter
  direction    // 1 Forward / -1 Backward
}
```

`On Switch` thêm `nextSpline`, `nextProgress`, `nextDistance`, `nextT`. Bạn có thể dùng `On Reach` để quyết định nhánh, `On Switch` để đổi camera hoặc cập nhật HUD.

Ngoài Inspector EventHandler, Junction phát `node.emit('spline-junction', payload)` và `node.emit('spline-junction-switch', payload)` trên cả Node Junction và Node follower. Trigger cũng phát `spline-trigger`.

### 5. Trigger theo Distance hoặc T

1. Chọn SplineContainer → **Add Trigger** → chọn Node `Spline Trigger`.
2. Gán `Spline` (hoặc để trống nếu Trigger là node con), chọn `Position Mode`.
3. `Distance`: điền `Distance = 8` để bắn event sau 8 đơn vị. `Spline T`: điền `Progress = 0.5` để đánh dấu đúng giữa dải tham số spline.
4. Chọn `Direction = Both / Forward / Backward`, `Work Once`, `Once Per Follower` tùy ý. Kéo Node xử lý vào `On Cross`.

Event được phát **khi follower đi qua** mốc trong Play, không phát khi scrub Editor. Payload gồm `progress`, `distance`, `t` và `direction`.

### 6. Animate, Road, Extrude, Instantiate, Mesh Deform

- `SplineAnimate`: **Start Position Mode** và **Preview Position Mode** độc lập, chọn Distance hoặc T. Nếu Distance, nhập `Start Distance` / `Preview Distance` và dùng Preview in Editor.
- `SplineRoad`, `SplineExtrude`, `SplineInstantiate`, `SplineMeshDeform`: chọn **Range Mode** rồi điền `Start/End Progress` (Normalized Distance / Spline T) hoặc `Start/End Distance` (Distance).
- Với `SplineInstantiate`, `Method = Distance` vẫn là **khoảng cách giữa các prefab**; `Range Mode = Distance` lại là **phạm vi bắt đầu/kết thúc** — đây là hai tùy chọn khác nhau.

Các API mới:

```ts
const p = spline.evaluateWorldPositionAtT(0.5);        // cubic t
const q = spline.evaluateWorldPositionAtDistance(12);   // absolute arc distance
const distance = spline.distanceAtT(0.5);
const t = spline.tAtDistance(12);
const progress = spline.progressAtT(0.5);               // normalized distance

follower.seekAtT(0.5);               // nhảy tới t=.5, không tự phát event
follower.seekDistance(12, true);     // nhảy tới 12 units VÀ bắn trigger nếu đi ngang
follower.setCurrentSplineAtDistance(otherRoad, 0, 1);
console.log(follower.currentProgress, follower.currentDistance, follower.currentT);
```

**Giới hạn:** `seek*()` không tự chuyển Junction; Junction routing chỉ diễn ra trong runtime playback khi đi qua link. Với spline closed, distance = length biểu thị cuối một vòng; nếu Play tiếp, follower sẽ wrap theo Loop Mode.

## 7. Xử lý lỗi thường gặp

- **Không chuyển nhánh:** `SplineAnimate.Junction Mode` có đang `Off` không? Nếu `Manual`, callback có gọi `requestJunctionExit` **ngay trong On Reach** không? Spline có ít nhất 2 knot? Tất cả component có đang enabled và Play không?
- **Xe nhảy bất thường:** so tọa độ của hai điểm giao bằng `evaluateWorldPositionAtDistance()`, chỉnh knot/tangent/Exit Direction để trùng nhau. Road mesh sẽ không tự hàn.
- **Event không chạy khi bắt đầu ngay tại mốc:** crossing logic có điểm đầu **exclusive** để chống bắn 2 lần; hãy để xe bắt đầu hơi trước mốc hoặc gọi event riêng lúc spawn.
- **Distance bị lệch sau scale:** distance là đơn vị *local spline*, không phải khoảng cách thế giới. Tránh non-uniform scale hoặc quy đổi bằng scale của Node trước khi gán.
- **Không thấy spline t/distance mới:** đóng Creator, thay toàn bộ `extensions/cocos-splines`, reload extension, reimport asset-db, kiểm tra tránh có bản runtime trùng trong `assets/splines`.
