# Bézier tangents in SplinePathV2

**Branch:** `v2.0.0` — development test build, no tag or release.

## Design

`SplinePathV2` now exposes `Bezier Tangents`: a serialized list of
`SplineBezierTangentV2` entries. Each entry binds to a **Knot Node**,
not an array index. Reordering Path Knots therefore does not move its
authored handles to a different Knot.

Each entry stores `Handle In` and `Handle Out` as **relative Path-local
offsets** (in meters) from its Knot, and a per-Knot Mode:

| Mode | Behavior |
|---|---|
| **Auto** | No explicit offsets passed to core. The cubic Bézier uses the natural one-third chord controls; a straight two-Knot path stays straight. |
| **Free** | Incoming and outgoing vectors are edited independently. Dragging an Auto handle switches that Knot to Free. |
| **Aligned** | Both vectors remain collinear and opposite; moving either one preserves the other vector's existing length. |
| **Mirrored** | Vectors remain equal length and opposite; moving one moves the other symmetrically. |

Only Path has these controls. Road, Extrude and Mesh Deform read the same
authored `SplineDataV2` snapshot through `pathSource`.

## Editing in Cocos Creator

1. Create a `SplinesV2.SplinePath` with 2–3 Knot Nodes, link it to Road,
   Extrude or Mesh Deform and click **Rebuild Preview** once.
2. On **SplinePath**, choose `Interpolation = Bezier`, select
   `Gizmo Knot Index`, and leave `Gizmo Edit Tangents=true`.
3. Select the **Path** Node with Gizmos installed. Move the two colored
   tangent points for the active Knot: **purple = incoming**, **cyan =
   outgoing**. Each control has a visual line back to its Knot.
4. The source mesh changes live on `update`; `end` and `cancel` force
   the latest preview. **Escape** restores both positions and the prior
   tangent mode; if a tangent was originally Auto with no record, it removes
   the newly materialized manual record.
5. For smooth mirrored curves, find that Knot's record in Path's
   **Bezier Tangents** Inspector list and change `Mode` to Mirrored
   or Aligned. Per-record `Handle In` / `Handle Out` can also be
   adjusted directly in the Inspector.
6. To reset to the natural chord behavior, change its Mode to
   **Auto**. It ignores the stored offsets until you edit a handle again.

## Why Path-local offsets?

The outgoing control is `Knot + HandleOut` and incoming control is
`Knot + HandleIn` in the Path's local space. The generator converts
**control points** using Path World → consumer inverse World, then
subtracts the consumer-local Knot position to build a relative Bézier
handle. This handles translated, rotated or scaled Path/consumer Nodes
without treating an offset as an absolute point. Moving the Knot keeps
its authored handles relative to that Knot.

## Tests / limitations

- CI exercises compiled SplinePath against Cocos mocks, cubic evaluation,
  scale/translation, mirrored/aligned/free modes, per-Knot reorder,
  duplicate-control validation, Escape rollback, native Inspector watcher,
  Play safety and actual Road mesh / glTF Bake integration.
- Actual mouse picking, serialized-mode Undo/Redo history and Scene
  save/reopen must be verified in **Cocos Creator 3.8.x**.
- Native Gizmos proxy writes go through computed Path fields. An Escape
  rollback is explicitly handled, **but native cross-property Undo/Redo is
  not yet certified**. Do not assume a mock test proves history transactions.
- Bézier support is 3D positions + tangent handles only. Per-Knot roll,
  banking, 2D modes, tangent constraints across closed seam and advanced
  topology editing are follow-up work.
- Duplicate Bezier Tangents records pointing to the same Knot are rejected
  with an authoring error, avoiding non-deterministic control selection.
- Manual/Baked meshes are not silently rebaked; gizmo changes affect
  temporary Scene preview only.

Related: [SplinePath](SPLINE_PATH_V2.md), [Gizmos](GIZMOS.md),
[Creator acceptance checklist](TEST_BUILD.md).
