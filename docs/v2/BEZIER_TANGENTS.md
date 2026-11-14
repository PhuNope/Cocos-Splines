# Bézier tangents in SplinePathV2

**Branch:** `v2.0.0` — development test build, no tag or release.

## Design

Each `SplineKnotRecordV2` holds its own serialized Path-local
`position`, `handleIn`, `handleOut`, `mode` and `tension`.
There are no references to Knot Nodes and no independent tangent list.
Reordering the records preserves all control data.

| Mode | Behavior |
|---|---|
| **Auto** | Uses natural one-third chord Bézier controls |
| **Free** | Edits In and Out independently |
| **Aligned** | Opposite and collinear; opposite length preserved |
| **Mirrored** | Equal length and opposite |

## Editing in Cocos Creator

1. Add Path and create two or more **Vec3 Knot records** using the
   custom Inspector. Link Path Source from Road/Extrude/Deform.
2. Set `Interpolation = Bezier`; select the active Knot using its
   Inspector card or Gizmos HUD.
3. Drag the two colored Path tangent handles: purple In, cyan Out.
4. Change **Mode**, **Handle In** or **Handle Out** directly on
   the same Knot card. No child Nodes are required.
5. Escape during a drag restores the entire original Knot record.
   Explicit Bake is still needed to update a saved glTF Mesh.

## Why Path-local offsets?

The outgoing control is `Position + HandleOut` and incoming control is
`Knot + HandleIn` in the Path's local space. The generator converts
**control points** using Path World → consumer inverse World, then
subtracts the consumer-local Knot position to build a relative Bézier
handle. This handles translated, rotated or scaled Path/consumer Nodes
without treating an offset as an absolute point. Moving the Knot keeps
its authored handles relative to that Knot.

## Tests / limitations

CI tests serialized Knot values, consumer-local transforms, Auto/
Free/Aligned/Mirrored modes, record reorder, Escape, editor watcher,
Road mesh generation and Bake. Native Creator Undo/Redo, Inspector
nested-field edits, save/reopen and visual mouse-picking still require
manual 3.8.x tests.

See [Pure Vec3 Knot workflow](PURE_VEC3_KNOTS.md).
