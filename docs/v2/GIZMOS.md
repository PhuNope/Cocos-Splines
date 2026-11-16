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
| `SplinePath` | **Editable** XYZ/plane Move handles for one active Knot, optional other Knot points and two Bézier tangent points (purple incoming, cyan outgoing); HUD selects active Knot and controls tangents |
| `SplineRoad` | **Read-only** centerline, approximate road edges and trim bars; has no Knot editing callbacks |
| `JunctionPatch` | **Read-only** junction center, cut rings and optional curb markers |
| Extrude / Mesh Deform | Mesh previews update from Path; they have no separate Knot handles |

Only `SplinePath` implements `onGizmoHandles()`,
`onGizmoHudControls()`, `onGizmoChanged()` for editing.
Road and Junction may implement `onDrawGizmosSelected()` for visual guides.

The bridge `SplineGizmoBridge.ts` calls the SDK's native
`Gizmos3D.move(property,options)`, `beginColor`, `drawLine` and
`drawSphere` when present. It is safe to import the Spline components
without installing the Gizmos SDK: missing drawing/handle APIs produce
no preview calls, not runtime errors. Color construction occurs only
during Editor draw, not on module import.

## Path Rotate (2D / 3D)

The bridge now delegates rotation to the SDK's native
`Gizmos2D.rotate()` and `Gizmos3D.rotate()` descriptors. Path Inspector
**Gizmos Rotation Mode** selects Knots (normal point editing),
Planar2D (Z ring on the Path Node) or Spatial3D (X/Y/Z rings on the
Path Node). **Gizmos Rotation Snap** controls angular snap in degrees,
with 0 indicating continuous rotation.

In Planar2D/Spatial3D, rotation affects the Path Node and rings remain
at its origin. In **Knots + Bézier**, the updated Gizmos v3 SDK can
place **Knot tangent rotation rings at the selected Knot's Vec3 pivot**;
these rotate the pair of Bezier handles, not the Node or a fake Knot
Euler orientation. Escape restores both handles. Requires the SDK's
`supportsRotationPivot` capability; see [Rotate and banking](ROTATE_AND_BANK.md).

## Scene Roll editing

In **Knots** mode the selected Path exposes a native HUD
**Knot Roll (deg)** slider. It directly edits the pure Vec3 Knot
record's bank angle, drives real Road/Extrude/Deform mesh rebuilds,
and supports Escape restoring its saved angle. The selected Knot
guide shows an orange crossbar for the banked Right vector and a
green Up vector, both sampled at the Knot's spline distance.

The display and size can be configured using `Gizmo Show Roll Guide`
and `Gizmo Roll Guide Size` in the Path Inspector; the HUD has a
`Roll Guide` toggle. See [Rotate and banking](ROTATE_AND_BANK.md).

## Rebuild lifecycle

A Path edit writes the **serialized Vec3 Knot record**, not a Scene
Node or duplicate point list. On `update`, registered mesh generators rebuild temporary
Scene previews with a default 100ms throttle. On `end` or `cancel`,
Path forces a final rebuild after the SDK writes the final or restored Knot.
Knot target identity is pinned during the drag, even if its array index
changes before Escape.

Native Inspector edits do not send external Gizmos callbacks.
Path watches serialized Knot values and the Path Node transform (up to
one scan/50ms), emits preview changes and forces a settled final preview
after at least 180ms idle. In Play/Preview none of these authoring callbacks
create meshes or mutate Knots.

Road `gizmoLiveMesh` and `gizmoMeshIntervalMs` configure only the
**temporary preview**, never the `bakedMesh` asset.

## Manual Creator 3.8.x smoke test

1. Add `SplinePath` and three Vec3 Knot records using its custom Inspector. Add a separate Road with
   `pathSource` linked and click **Rebuild Preview**.
2. Select Path, drag the active Knot with Move or another Knot with a point
   handle. The Road mesh should follow. Escape should restore both the
   source Knot position and the temporary mesh.
3. Select Road. Check that it draws only edges/trim/centerline and **does
   not** expose another copy of active Knot Gizmos.
4. Use the Path Inspector to edit a Knot's Vec3 position directly.
   Confirm preview updates and converges to the final value.
   Move/rotate/scale the Path Node itself to move the entire spline;
   also change interpolation and Knot order via Inspector.
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


## HUD Local / World toggle groups (2026-11-15)

The Path's Scene HUD now shows **Position · Local / Position · World** and
**Rotation · Local / Rotation · World** as two independent, mutually exclusive
toggle pairs (one active choice in each pair). They are available only with
the optional Gizmos Scene SDK and an editable Path of at least two Knots.
Position/Rotation here describe the **authoring Gizmo's coordinate frame**,
NOT the mesh generator's separate `Coordinate Space` option.

- **Position Local**: move the active Knot and additional point/tangent handles
  in SplinePath Node-local coordinates. Values are saved directly in
  `SplineKnot.position/handleIn/handleOut` as pure local `Vec3`.
- **Position World**: the proxy reads/writes actual World XYZ using the
  Path Node's `worldMatrix` and its inverse. This correctly supports a
  translated, rotated, or scaled Path Node while keeping serialized Knot
  records in Path-local space.
- **Rotation Local**: rotate the Path Node in its parent's local axes, using
  the existing 2D Z or 3D XYZ mode.
- **Rotation World**: rotate the Path Node in World Euler space using
  Creator `worldRotation`, `Quat.toEuler` and
  `setWorldRotationFromEuler`; parent rotations are accounted for.
- Switching a toggle does **not** rewrite Knot positions or bake a new mesh.
  Switching is refused during an active Gizmo/roll drag, preventing mid-drag
  space changes. Cancel/Escape restores the local Knot snapshot or the Node's
  local Euler, even when dragging in World coordinates.
- **Inspector cleanup**: the duplicate collapsible `Raw Knot Data` dump is
  removed. Editable per-Knot fields and Add/Insert/Duplicate/Remove/Order
  operations remain in the compact Knot cards; no status panel is introduced.
- Live Creator 3.8.8 certification of HUD layout/group support, SDK
  world-space proxy values and Prefab Undo/Redo is still needed; headless
  test mocks verify the proxy math, group invariants and lifecycle.


## Position Snap and selected Knot coordinates (2026-11-15)

- **Position Snap** controls the Move handle, additional indexed Knot handles
  and Bézier tangent point handles together. This property is available as
  a numeric setting on `SplinePath` Inspector and as a slider in the Scene
  HUD (0–5, 0.05 steps). A value of **0** (default) keeps continuous drag.
  Values above 0 ask Cocos-Gizmos to snap in the selected Position Space,
  without altering previously authored Vec3 records just by changing a setting.
- The HUD also displays a single **read-only** `Knot N · Local/World X Y Z`
  line using the same underlying position proxy as Move. No serialized Knot
  dump, Node per Knot or additional bottom Inspector log is introduced.
- Position Snap and the Local/World authoring frame do not change the separate
  Road/Extrude/MeshDeform Coordinate Space used for mesh generation. Rotation
  Snap remains independent.
- The underlying Cocos-Gizmos SDK handles snap itself. The bridge passes the
  same bounded step to the Move factory and indexed/tangent descriptors; it
  does not round source Knot Vec3 data or compromise Cancel/Undo semantics.
- Upstream Cocos-Gizmos v3 normalizes toggle controls individually and
  does not implement a native `group` visual layout. The Position/Rotation
  Local/World pairs instead enforce mutual exclusion through Path boolean
  proxy getters/setters; their renderer shows four toggle rows, not a
  segmented button bar. Native Creator 3.8.8 HUD appearance still needs
  manual verification.


## Multi-Knot group authoring (2026-11-15)

- Use **Active Knot** in the Scene HUD to choose a Knot, then click
  **Toggle Active Group** to include/exclude it. Repeat for each member;
  **Clear Group** empties the selection. Up to 32 Knot records can be
  selected, with no extra Knot Nodes or serialized index array. The
  read-only HUD line reports the selected indices and member count.
- When the active Knot is one of at least two selected members, its
  Local/World Move handle translates the **entire group** by the same
  Path-local delta. Member points are highlighted cyan (other Knot points
  stay orange), and unselected active Knot handles still move normally.
  Bézier tangent offsets, mode, tension and bank remain unchanged by
  positional group translation.
- Each Gizmos drag pins selected Knot **record identities** for the gesture.
  Changing the active index cannot retarget the drag, and selection
  buttons do not change the set during dragging. Escape restores all
  originally selected positions before the final preview refresh.
  Runtime/Play cannot edit the group.
- For a **native Creator single-step Undo** across the full group, use
  the compact Inspector **Group Nudge (HUD selection)** section:
  X-/X+/Y-/Y+/Z-/Z+ moves every selected Knot in one
  `scene.set-property(record:true)` edit of the typed `knots` CCClass
  array. The distance is **Position Snap** when nonzero, or 1 otherwise.
  In Position World, the delta is converted through the inverse Path
  Node transform, preserving local authored Vec3. The planner validates
  expected Knot positions again before the first write and refuses
  stale or invalid sources.
- Selection is transient: topology changes, deserialization and native
  Undo/Redo clear stale Knot object references. A successful Inspector
  Group Nudge explicitly rebinds its selected indices to restored Knot
  objects for consecutive nudges.
- Cocos-Gizmos native drag history and Scene picking still require real
  Creator 3.8.8 acceptance; grouped Inspector Nudge provides the explicit
  recordable history path. No raw Knot data or bottom Inspector log.

### P0 gesture write isolation (2026-11-15)

While a Gizmos gesture is active, only the pinned Knot/tangent proxy may write.
Late setters targeting other indexed handles, unrelated tangent or rotation
proxies, and stale Knot records after a topology replacement are ignored.
For indexed point drags, a callback carrying another index cannot prematurely
end/cancel the original drag; the matching callback still performs final
preview settlement. HUD Roll and Node Rotation gestures also block competing
Knot/tangent setter writes. This is regression-tested with Cocos mocks; native
Creator 3.8.8 Undo/Redo and Prefab override acceptance remain **unverified**.

### P0 interrupted-Gizmos quarantine (2026-11-15)

If Creator replaces serialized CCClass Knot objects during an active
Move, indexed Knot, Rotate, or HUD Roll gesture, `onRestore()` now
invalidates that SDK gesture. Late SDK proxy setters and callbacks are
ignored until the matching `end/cancel` (matching index for indexed
points) or a fresh `begin` starts. This preserves restored source
records and forces a final temporary-mesh refresh without rebaking.

Mocks/regression cover Knot identity replacement, stale writes,
indexed callback identity and HUD Roll. **Native Creator 3.8.8 Undo
grouping, Scene Save/Reopen and Prefab history still require Editor
acceptance**. Inspector Group Nudge remains the explicitly recordable
one-step group translation path.

### P0 exact Local/World gesture ownership (2026-11-15)

A Local and World Gizmo for the same Knot intentionally target the same
serialized Path-local record, but they are **distinct SDK gestures**.
During an active drag, the Path now accepts writes and end/cancel/update
callbacks only from the exact initiating proxy name (including the World
suffix). Indexed Knot handles additionally require the exact pinned index
even for callback settlement; a missing index cannot end the drag.
A foreign Local/World descriptor cannot commit or cancel a grouped move,
change Bézier tangent offsets, or silently settle preview/history.

Regression covers World group move, indexed peer handles, tangent editing,
foreign callbacks, missing index, and Escape. This does **not** certify a
single native Creator history entry for Group Drag. Inspector Group Nudge
remains the verified recordable path; test native history and Prefab
overrides in Creator 3.8.8 before a release.

### Creator 3.8.8: Inspector Group selection and Knot orientation (2026-11-16)

The Path Inspector now has a **+ Group** button on every Knot card.
Click it on two or more cards; the `Group Nudge (Inspector + HUD)`
section shows the exact selected indices. Group selection is the
same transient set as the Scene HUD's `Toggle Active Group`, so
it never creates additional Knot Nodes or Undo entries. Use
**Refresh Group** to synchronize the Inspector with any selections
made only in the HUD. **Clear Group** resets the shared selection.
Group Nudge itself remains a single recordable Knot-array edit.
Do not change Path selection halfway through a Gizmo drag.

**Knot Rotation** is not an independent XYZ Euler property in v2:
the tangent of the spline provides the Knot's forward heading and
pitch; `rollDegrees` on each Knot controls banking around that
tangent. In `Knots` Gizmos mode, the HUD slider edits active
`Knot Roll (deg)`. `Planar2D` / `Spatial3D` rings rotate the
*entire Path Node*, not one Knot. The Inspector now explains this
distinction explicitly instead of presenting the Rotation Local/World
space toggle as if it provided an XYZ Knot rotation.

Centripetal/Catmull-Rom computes automatic tangents, and its
`handleIn` / `handleOut` properties are not used. For manual
tangent handles choose **Interpolation: Bézier**, then set
the Knot Mode to `Free`, `Aligned` or `Mirrored`;
enable `Gizmo Edit Tangents`, select the Path and use the
purple/cyan tangent control points. Roll remains editable in
all interpolation modes. Native Gizmos picking and Undo still need
Creator 3.8.8 verification.
