# Migration — bỏ API legacy ở Prefab Spawners (P1.1)

| Legacy | Canonical replacement | Semantics |
| --- | --- | --- |
| `SplineInstantiate.rebuild()` | `SplineInstantiate.respawn()` | Xóa/tạo lại instance do component sở hữu |
| `SplineObjectController.rebuild()` | `SplineObjectController.respawn()` | Xóa/tạo lại prefab variants do component sở hữu |
| Spawn không trùng | `spawn()` | Giữ nguyên nếu generated root đã chứa instance |
| Xóa generated instance | `clear()` | Không xóa siblings do người dùng tự tạo |

Thay call site có receiver thuộc hai class này sang `respawn()`. **Không thay hàng loạt** `rebuild()` của `SplineRoad`, `SplineExtrude`, `SplineMeshDeform`, `SplineObjectBender` và các geometry component khác.

### Sắp tới

Phase 1.2 chuyển direct Gizmos callbacks sang Editor drawers. Cần xác minh runtime module import của Cocos-Gizmos v3 dưới Cocos Creator 3.8.8. Các trường `tangentInHandle` và enum legacy trong serialized scenes cần migration riêng, chưa được gỡ trong P1.1.
