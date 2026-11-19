# Required Cocos-Gizmos integration — Clean Architecture

**Development branch:** `v2.0.0` · Cocos Creator 3.8.8
**Required editor extension:** `cocos-gizmos >=3.0.2`, enabled before editing Cocos Splines.
**Implementation baseline:** `PhuNope/Cocos-Gizmos` branch `v3`,
including GizmoHUD fluent builder, native SelectGizmo command adapter,
and component-Vec3 rotation pivots.

## Explicit dependency contract

The installable Splines manifest contains
`cocosSplines.requiredExtensions['cocos-gizmos']='>=3.0.2'`
and lists the required Scene APIs. **This is metadata validated by
our own scripts, not a Cocos Creator automatic installation facility.**
Install/enable Gizmos separately in Extension Manager and reopen
Creator. Cocos Splines does not copy Gizmos source, transpile another
vendor into its extension or import Gizmos into Play runtime code.

At Editor interaction time, `resolveSplineGizmos()` checks all of:

- `Gizmos3D.move/rotate/beginColor/drawLine` and
  `Gizmos3D.supportsRotationPivot === true`
- `Gizmos2D.rotate`
- `GizmoHUD.createHud/bind/action`

Missing or incompatible APIs produce **one actionable Console warning
per Scene session**, and Gizmos operations are disabled. There is
**no legacy flat-HUD or pivot-less SDK fallback**. This is intentional:
a plugin mismatch should not silently render rings around the Path
Node instead of the selected Knot.

## Dependency boundaries

```text
  Core: SplineCurves / Frames / Cache / Road geometry
            ↑  (data; no Editor or Gizmos)
  Spline.Path (application / authored CCClass data / gesture snapshots)
            │  state snapshot + callback actions
            ↓
  SplineGizmoHandler (one Editor anti-corruption layer)
      ├─ handles(state)       → Gizmos3D.move/rotate + indexed points
      ├─ hud(state)           → GizmoHUD.createHud().bind().action().build()
      └─ drawGuide(node,data) → Gizmos3D.beginColor/drawLine/drawSphere
            ↓
  Cocos-Gizmos (presentation, input, command sessions)
            ↓
  Native Cocos Creator Scene View
```

`SplineGizmoHandler` is in
`assets/splines-v2/Components/SplineGizmoHandler.ts`. It uses
constructor-injected `sdkProvider` (Dependency Inversion) and narrow
structural ports rather than importing Cocos-Gizmos implementation
files or reaching into private Scene Selection internals.
It is housed beside components rather than in a magic `Editor/`
asset directory because Cocos Creator may omit Editor-only folders
from game builds while Path has a static module import. The handler
is **inert at module evaluation and in Play mode**: only Editor Scene
callbacks resolve Gizmos globals.

**Single responsibility / separation of concerns**

- `Spline.Path`: Knot serialization, movement, tangent rotation, Roll,
  multi-selection identity, begin/update/end/cancel, Undo/onRestore
  quarantine and preview invalidation. No HUD/DOM/SDK composition.
- `SplineGizmoHandler`: capability validation, creation of move,
  indexed point and Knot-centered rotation descriptors, property-bound
  HUD, colors and world-space scene drawing.
- `Spline.Road` / `Spline.Junction`: independent geometry consumers.
  They reuse only `drawGuide` and own no Knot controls.
- `Cocos-Gizmos`: renderer, pointer picking, command/session behavior,
  HUD DOM and widget gestures. Splines does not duplicate these.

The old `SplineGizmoBridge` and old Path
`onGizmoHudControls()/onGizmoHud()/onGizmoHudAction()` callbacks were
removed. `onGizmoHUD()` supplies the latest declarative HUD. Property
bindings still target actual Component getters/setters and report
`onGizmoHudChanged()` gesture phases; actions invoke the Path's
existing guarded group-selection methods. No extra serialized knot
selection fields or child Nodes are created.

## Validation / limitations

Headless tests validate SDK contract detection (missing HUD, missing
pivot), one warning, move/rotation/point descriptors in both coordinate
spaces, group-highlighted handles, HUD builder property/action Commands,
world-transformed guide drawing, bounded output, cancellation/Undo
quarantine through the real Path component, and the built package
manifest. An Editor test ZIP contains **only** Splines; the required
Gizmos ZIP must be installed separately.

Native Creator 3.8.8 still requires Scene mouse picking, HUD DOM focus
and pointer capture, Escape/Cancel, multi-Knot Undo/Redo, Prefab
Overrides, rotation pivot snap and Scene Save/Reopen acceptance.
Automated CI is not certification of native Editor Undo.
