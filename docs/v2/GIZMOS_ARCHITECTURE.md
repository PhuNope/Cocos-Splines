# Cocos Splines — official Gizmos decorator architecture

**Cocos Creator:** 3.8.8. **Required independent extension:**
[Cocos-Gizmos](https://github.com/PhuNope/Cocos-Gizmos), branch `v3`,
version **3.0.2 or newer**. These are breaking development changes.

## The decorator IS the integration boundary

Cocos-Gizmos already exports `registerGizmos` and `IDrawGizmos`
from its **readonly Asset Database mount**. Cocos Creator 3.8 supports
importing scripts from another extension via the `db://` scheme:

```ts
import {registerGizmos} from 'db://cocos-gizmos/RegisterGizmos';
import {SplinePathGizmos} from '../Editor/SplinePathGizmos';

@ccclass('Spline.Path')
@registerGizmos(SplinePathGizmos)
export class SplinePath extends Component { /* Knot data and editing */ }
```

The other consumers register their own drawers:

- `@registerGizmos(SplineRoadGizmos)` on `Spline.Road`
- `@registerGizmos(SplineJunctionGizmos)` on `Spline.Junction`

**No copy of Gizmos RegisterGizmos.ts or the SDK is bundled.**
Creator must import the external mounted script successfully. If
Gizmos is missing, a module resolution error is an **intentional hard
dependency**, not something Splines hides behind a fake decorator.

The installed manifest advertises the dependency under
`cocosSplines.requiredExtensions`. That metadata is checked by
our tests; **Creator does not automatically install extensions
from this field**.

## Separation of concerns

```text
Cocos-Gizmos v3 — input, commands, Editor HUD and drawing
          |
 db://cocos-gizmos/RegisterGizmos
          |
 @registerGizmos(Drawer) — lazy one Drawer / Component WeakMap
          |
 ├─ Editor/SplinePathGizmos.ts
 │    handles(state), HUD, selected guides, gesture callbacks
 │         |
 │         +--> SplinePath: pure CCClass Knots, interpolation,
 │              Vec3 getter/setter proxies, Edit/Undo snapshots,
 │              cancellation quarantine, preview invalidation
 │
 ├─ Editor/SplineRoadGizmos.ts
 │    selected guide only --> SplineRoad geometry consumer
 │
 └─ Editor/SplineJunctionGizmos.ts
      selected guide only --> JunctionPatch geometry consumer
          |
 Editor/SplineGizmoHandler.ts
       SDK validation, descriptors, GizmoHUD builder,
       bounded/local-to-world guide rendering
```

**SRP:** Components own serialization, curve sampling and edit
semantics; Drawers own Scene View callback composition; the Handler
owns only calls into the required SDK. Geometry core and Road
processors never import Gizmos. A Drawer is not another Node or
Component, and creates no serialized data.

**OCP:** A new consumer can register a Drawer without adding switch
cases to `Spline.Path`. **DIP:** The Handler resolves structural
ports on demand, with injectable SDK provider for tests. Cocos-Gizmos
`registerGizmos` caches each Drawer per Component instance lazily,
forwards only hooks implemented by the Drawer and does nothing in
Preview or game mode.

The custom `SplineGizmoHandler` is **not a second decorator**:
we do not install hooks, patch prototypes, run a redundant WeakMap,
or create an independent gesture controller. It stays a thin SDK
facade for Move/Rotate descriptors, HUD commands and guide drawing.

## Authoring and Undo data flow

`Spline.Path` retains one array of pure CCClass `Spline.Knot`
records. The SDK edits typed computed Vec3/Euler/number properties
on the Component. On gesture callbacks, `SplinePathGizmos`
forwards to explicit Component edit methods
`applyGizmoGesture()` / `applyGizmoHudGesture()`.
These manage selected-Knot identity, multi-Knot position snapshots,
tangent mode/handles, Roll, preview updates and Cancel/Escape
restoration. **No independent Serialized Knot Node exists.**

For group nudge and inspector topology edits, Editor Scene calls
`scene.set-property(record:true)` for the whole typed Knot array.
A canceled Gizmos drag never overwrites a saved Baked Mesh.
Native Creator Undo/Redo and Prefab Overrides must be verified
in the actual Windows Editor.

## Installation and test gates

1. Enable Cocos-Gizmos 3.0.2+ and let AssetDB mount
   `db://cocos-gizmos/RegisterGizmos`.
2. Install Cocos-Splines development ZIP; restart Creator.
3. Select a Path: one HUD, move and Knot-index handles, Local/World,
   roll, group actions, tangent points and Knot-centered rotation
   rings must work. Test Escape and Undo/Redo.
4. Select a Road or Junction: guides appear; no extra Knot handles.
5. Enter Play and build: the decorator is inert; geometry works
   normally and there are no runtime SDK globals.

CI uses a test-only decorator double mirroring SDK lazy WeakMap
dispatch. Only the real Creator 3.8.8 can validate AssetDB import
load order, DOM pointer capture and native Undo/Prefab behavior.

**No Git tag or Release is created without explicit approval.**
