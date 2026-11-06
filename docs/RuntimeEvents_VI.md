# Runtime events — Cocos Splines v0.8.1

API đăng ký callback runtime, không sửa các EventHandler đã cấu hình trong Inspector.

```ts
import { _decorator, Component } from 'cc';
import { SplineJunction, type JunctionEvent } from 'db://cocos-splines/splines/Components/SplineJunction';
const { ccclass, property } = _decorator;

@ccclass('TrafficSignals')
export class TrafficSignals extends Component {
  @property(SplineJunction) junction: SplineJunction | null = null;

  onEnable() {
    this.junction?.AddOnReachEvent(this.onReach, this);
    this.junction?.AddOnSwitchEvent(this.onSwitch, this);
  }
  onDisable() {
    this.junction?.RemoveOnReachEvent(this.onReach, this);
    this.junction?.RemoveOnSwitchEvent(this.onSwitch, this);
  }
  private onReach(e: JunctionEvent) {
    console.log('Junction', e.entryIndex, e.progress);
    // Chỉ yêu cầu rẽ nếu follower.junctionMode === Manual.
    // e.follower.requestJunctionExit(1);
  }
  private onSwitch(e: JunctionEvent) {
    console.log('Switch:', e.entryIndex, '->', e.exitIndex);
  }
}
```

- `target` là `this` của callback; đăng ký và huỷ phải dùng cùng function + target.
- Trùng cặp callback+target chỉ được đăng ký một lần.
- Callback runtime không được serialize vào scene/prefab.
- `On Reach` có thể chạy khi `JunctionMode = Off`, nhưng không làm đổi spline.
- Nên đăng ký trong `onEnable`, huỷ trong `onDisable`. Khi component phát event bị destroy, toàn bộ callback của nó được dọn.
- API bổ sung: `SplineTrigger.AddOnCrossEvent / RemoveOnCrossEvent`, `SplineAnimate.AddOnEndReachedEvent / Remove...`, `AddOnBeginningReachedEvent / Remove...`, `SplineProjector.AddOnProjectEvent`, `AddOnEnterEvent`, `AddOnExitEvent`, `SplineLengthMonitor.AddOnChangedEvent`, `AddOnGrowingEvent`, `AddOnShrinkingEvent`, `AddOnCrossAboveEvent`, `AddOnCrossBelowEvent` (mỗi loại có `RemoveOn...Event`).
- Trên Junction/Trigger có thêm alias camelCase `addOnReachEvent`, `removeOnReachEvent`, `addOnCrossEvent` tương ứng.
- Nếu callback throw, các callback khác vẫn được gọi và lỗi được ghi log.
