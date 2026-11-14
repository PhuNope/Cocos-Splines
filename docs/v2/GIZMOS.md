# Gizmos — Scene authoring for Spline Cocos v2

Gizmos integration uses [PhuNope/Cocos-Gizmos](https://github.com/PhuNope/Cocos-Gizmos).
Install the extension in the same Cocos Creator project. This Spline package
does not vendor or directly import it. The Editor Scene process exposes
`globalThis.Gizmos3D` and discovers Component hooks automatically.

**Public names are simply Gizmos.** No vendor version is appended to our
component properties, Inspector labels or bridge class names.

## Component ownership

| Component | Scene behavior |
|---|---|
| `SplinePathV2` | **Editable** XYZ/plane Move handles for one active Knot, optional other Knot points and two Bézier tangent points (purple incoming, cyan outgoing); HUD selects active Knot and controls tangents |
| `SplineRoadV2` | **Read-only** centerline, approximate road edges and trim bars; has no Knot editing callbacks |
| `SplineJunctionPatchV2` | **Read-only** junction center, cut rings and optional curb markers |
| Extrude / Mesh Deform | Mesh previews update from Path; they have no separate Knot handles |

Only `SplinePathV2` implements `onGizmoHandles()`,
`onGizmoHudControls()`, `onGizmoChanged()` for editing.
Road and Junction may implement `onDrawGizmosSelected()` for visual guides.

The bridge `SplineGizmoBridge.ts` calls the SDK's native
`Gizmos3D.move(property,options)`, `beginColor`, `drawLine` and
`drawSphere` when present. It is safe to import the Spline components
without installing the Gizmos SDK: missing drawing/handle APIs produce
no preview calls, not runtime errors. Color construction occurs only
during Editor draw, not on module import.

## Rebuild lifecycle

A Path edit writes the **existing Knot Node**, not a duplicate serialized
point list. On `update`, registered mesh generators rebuild temporary
Scene previews with a default 100ms throttle. On `end` or `cancel`,
Path forces a final rebuild after the SDK writes the final or restored Knot.
Knot target identity is pinned during the drag, even if its array index
changes before Escape.

Native Cocos Transform or Inspector edits do not send external Gizmos
callbacks. Path also watches Node world positions in the Editor (up to
one scan/50ms), emits preview changes and forces a settled final preview
after at least 180ms idle. In Play/Preview none of these authoring callbacks
create meshes or mutate Knots.

Road `gizmoLiveMesh` and `gizmoMeshIntervalMs` configure only the
**temporary preview**, never the `bakedMesh` asset.

## Manual Creator 3.8.x smoke test

1. Add `SplinePathV2` and three Knot Nodes. Add a separate Road with
   `pathSource` linked and click **Rebuild Preview**.
2. Select Path, drag the active Knot with Move or another Knot with a point
   handle. The Road mesh should follow. Escape should restore both the
   source Knot position and the temporary mesh.
3. Select Road. Check that it draws only edges/trim/centerline and **does
   not** expose another copy of active Knot Gizmos.
4. Switch to the default Cocos Transform tool and move a Knot Node directly.
   Confirm preview updates and converges to the final shape on mouse-up.
   Also change Path interpolation and Knot order via Inspector.
5. Test native Undo/Redo, save/reopen Scene, duplicate Path instances and
   3-/4-arm Road/Junction trim. Undo/Redo across a computed Path proxy
   still needs certification in the real Editor.
6. Enter Play with Manual/Baked modes; no editor handle operations or
   authoring warnings may run. Explicit Bake remains required to persist
   a generated asset.

The automated test suite covers deterministic sampling, U/V UV modes,
bounded guides, Path proxy rollback, native-style editor change observation,
Play guards and multi-consumer preview invalidation. **It cannot replace
visual Editor acceptance.**

SDK reference sources:
[Cocos-Gizmos callbacks](https://github.com/PhuNope/Cocos-Gizmos/blob/v3/docs/CALLBACKS.md) ·
[Move handles](https://github.com/PhuNope/Cocos-Gizmos/blob/v3/docs/MOVE_GIZMO.md).

Authored Bézier tangent handles and mode controls are now available on Path: [Bezier Tangents](BEZIER_TANGENTS.md). Still pending: Creator Undo/Redo certification, production Junction/Sidewalk terrain joins and advanced mesh colliders.
