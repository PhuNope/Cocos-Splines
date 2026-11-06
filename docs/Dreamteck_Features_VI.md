# Cocos Splines v0.8.0 — các tính năng học từ Dreamteck Splines

Đây là **triển khai TypeScript độc lập** cho Cocos Creator 3.8.8, tham khảo cách phân tách chức năng của Dreamteck (`SplinePositioner`, `SplineProjector`, `LengthCalculator`, spline sample offsets). Không sao chép các file C# hoặc tài sản của Dreamteck.

## Các chức năng mới

### 1. Spline Positioner — đặt vật thể theo t / Distance

- Trong Hierarchy chọn Node chứa `SplineContainer`, Inspector → **+ Positioner** hoặc menu Extensions → Cocos Splines → **Add Spline Positioner**.
- Component được tạo ở Node con có tên `Spline Positioner`; ô Spline có thể để trống để tự lấy từ parent.
- Gán `Target` nếu muốn di chuyển một Node khác. Nếu để trống, Node Positioner sẽ được di chuyển.
- `Position Mode`:
  - **Normalized Distance**: `Progress` nằm trong 0..1 theo chiều dài cung.
  - **Distance**: `Distance` là số đơn vị theo local spline (không phải world units nếu container có scale).
  - **Spline T**: `Progress` nằm trong 0..1 theo tham số Bezier, không chia đều chiều dài.
- `Spline Offset`: dịch theo frame spline, `X` = right, `Y` = up, `Z` = forward. Không giống `World Offset` của Animate.
- `Follow Target`: nếu gán Node khác, Positioner sẽ project Node đó tới điểm gần nhất trên spline, sau đó cộng `Follow Distance` theo chiều dài cung. `Wrap Closed` chỉ wrap spline khép kín; spline mở thì clamp 0..1.
- Editor: **bật `Preview In Editor`** rồi nhấn Preview / chỉnh thuộc tính để xem kết quả. Khi tắt checkbox hoặc component, position/rotation của Target được khôi phục. Ở runtime, `Follow On Update` quyết định có chạy mỗi frame hay bạn chủ động gọi `applyPosition()`.
- Không thể di chuyển chính `SplineContainer.node` lên đường của nó; plugin chặn để tránh tự di chuyển nguồn.

### 2. Spline Projector — tìm điểm gần nhất trên spline

- Chọn Container → **+ Projector**. Đặt `Source Node` là xe, chuột điều khiển, người chơi, hay một điểm cần chiếu.
- Đặt `Projected Node` là Node marker/điểm đích riêng, sau đó bật `Snap To Spline` để marker đi theo vị trí gần nhất (nếu để trống sẽ snap Node đang gắn Projector).
- Khi chọn Projector trong Scene và đã cài Cocos-Gizmos, đoạn thẳng nối Source tới projection cùng một dấu chấm sẽ hiện ra.
- `Auto Project`: tính lại mỗi frame gameplay; `projectNow()` cập nhật thủ công khi cần.
- `Samples`: số mẫu toàn đường trước bước tinh chỉnh, mặc định 128. Với đường tự cắt hoặc nhiều khúc quanh có thể tăng 256 hoặc 512; nhiều follower sẽ tăng chi phí CPU.
- `Enter Exit Radius`: khoảng cách gần spline tính bằng world units để gọi `On Enter` và `On Exit`. =0 tắt kiểm tra radius. Lần đầu project chỉ khởi tạo trạng thái, không bắn enter event. Khi Projector chuyển từ ngoài vào trong vùng radius và ngược lại mới bắn event.
- `Notify On Project`: opt-in phát `On Project` và `node.emit('spline-project', payload)` *mỗi lần projectNow* trong gameplay; **tắt theo mặc định** vì gọi nhiều lần mỗi frame.
- Payload: `{ projector, spline, source, worldPosition, t, progress, distance, separation }`.
- `projector.lastProjection`: trả về payload gần nhất sau khi `projectNow()` được gọi.
- Projector tìm điểm gần nhất theo **khoảng cách world-space**, kể cả nếu Node spline bị nonuniform scale. Tuy nhiên `distance` trong payload vẫn là **chiều dài local** spline, nhất quán với Animate/Junction/Trigger. Tại đường tự cắt, điểm gần nhất có thể nhảy sang nhánh khác khi source di chuyển qua giao điểm.
- Trong Editor, `Snap To Spline` chỉ thay đổi transform khi `Preview In Editor` bật; tắt sẽ restore. Khi không preview, nút **Project Now** đo và hiển thị kết quả, không ghi sửa Scene.

### 3. Spline Length Monitor — chiều dài và sự kiện

- Chọn Container → **+ Length Monitor**, component ở Node con.
- Bấm **Measure Length** trong Inspector để đọc chiều dài hiện thời.
- `Threshold`: ngưỡng local-space length. `Tolerance`: bỏ qua biến thiên quá nhỏ.
- Trong gameplay, khi spline thay đổi chiều dài đủ lớn, phát `On Changed`, `On Growing` hoặc `On Shrinking`.
- Nếu chiều dài đi từ dưới ngưỡng lên bằng/vượt qua ngưỡng thì `On Cross Above`; từ trên ngưỡng xuống bằng/thấp hơn thì `On Cross Below`.
- Event payload: `{ monitor, spline, previous, current, delta, threshold }`.
- `Auto Check` điều khiển kiểm tra mỗi frame. Có thể gọi `checkNow()` và `reset()` thủ công.
- Editor vẫn cho phép đo độ dài, nhưng **không phát gameplay events trong Editor preview**.

### 4. Animate → Spline Offset (mới)

`SplineAnimate` có thêm `Spline Offset: Vec3`, nơi X đi theo hướng phải của đường, Y hướng lên theo rotation của knot, Z là hướng tiếp tuyến (forward). `World Offset` cũ vẫn giữ nguyên semantics theo world XYZ; vì vậy scene cũ mặc định Spline Offset (0,0,0) không bị thay đổi.

Ứng dụng: nhiều xe chạy song song trên một centerline. Xe 1 đặt X=-1.5, xe 2 đặt X=+1.5 (tùy orientation đường); đồng thời có thể dùng cùng một `SplineContainer` và Junction như trước.

## API nhanh trong script Cocos

```ts
import { _decorator, Component, Vec3 } from 'cc';
import { SplineContainer } from 'db://cocos-splines/splines/Core/SplineContainer';
import { SplinePositioner } from 'db://cocos-splines/splines/Components/SplinePositioner';
import { SplineProjector } from 'db://cocos-splines/splines/Components/SplineProjector';
const { ccclass, property } = _decorator;
@ccclass('SplineToolsExample')
export class SplineToolsExample extends Component {
    @property({type:SplineContainer}) spline:SplineContainer|null=null;
    @property({type:SplinePositioner}) positioner:SplinePositioner|null=null;
    @property({type:SplineProjector}) projector:SplineProjector|null=null;
    start(){
        if(!this.spline)return;
        const hit=this.spline.projectWorld(new Vec3(1,3,2));
        console.log(hit.t,hit.progress,hit.distance,hit.worldPosition);
        if(this.positioner){ this.positioner.distance=5;this.positioner.applyPosition(); }
        console.log(this.projector?.projectNow()?.separation);
    }
}
```

## Đối chiếu với Dreamteck và lộ trình

| Dreamteck | Cocos Splines hiện có | Mức độ |
|---|---|---|
| SplineFollower | `SplineAnimate` + Once/Loop/PingPong, Time/Speed, Trigger/Junction | Có chức năng cơ bản |
| SplinePositioner | `SplinePositioner` t/distance, Follow Target, offset, preview | **Thêm v0.8** |
| SplineProjector | `SplineProjector` nearest world, snap, proximity events | **Thêm v0.8** |
| LengthCalculator | `SplineLengthMonitor` delta và ngưỡng | **Thêm v0.8** |
| OffsetModifier | `Spline Offset` trên `SplineAnimate` / `SplinePositioner` | **Một phần** |
| ObjectController | `SplineInstantiate` count/distance, seed/random | Một phần |
| Path/Tube/Surface Generator | `SplineRoad`, `SplineExtrude`, `SplineMeshDeform` | Một phần |
| Node/junction traversal | `SplineJunction`, Manual/First Other/Round Robin | Một phần |
| ObjectBender | `SplineMeshDeform` đơn mesh, không bend toàn bộ hierarchy | Một phần |
| SplineMorph, ParticleController | Chưa có | Lộ trình |
| Box/Capsule/Polygon Collider Generator | Chưa có | Lộ trình |
| MultiSplineSurfaceGenerator, road junction meshing | Chưa có | Lộ trình |

Ưu tiên nâng cấp tiếp: (1) collider road/tube tự động và bake mesh asset, (2) nhiều spline trong container và linked junction handles, (3) ObjectController bám đường với custom distribution rules, (4) vị trí/rotation/scale/sample modifiers dọc spline, (5) ObjectBender hierarchy & ParticleController.

## Kiểm thử và giới hạn

Đã chạy kiểm thử hình học và runtime mock, giữ UUID các script cũ. **Chưa xác nhận bằng Cocos Creator 3.8.8 thực tế** (Undo/Redo khi preview, Editor scene updates, build Web/native, Cocos-Gizmos). Các sample API được viết mới, không phụ thuộc Dreamteck runtime.
