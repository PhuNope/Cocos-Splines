# SplinePathV2 — one authoritative spline source

**Development branch:** `v2.0.0`. Clean breaking test build; no legacy UUID migration, tag, or Release.

## Design

`SplinesV2.SplinePath` is the **only** authored source. The `knots`
array contains serialized `SplineKnotRecordV2` records with
`position: Vec3`, `handleIn: Vec3`, `handleOut: Vec3`,
`mode` (Auto/Free/Aligned/Mirrored) and `tension`. **No Knot Node
references exist**. Positions are local to the Path's own Node.

`SplinePathV2.getSplineDataV2(consumer)` samples the same Path into
each Road/Extrude/Deform consumer's local coordinate space. Junction
takes world-space endpoints from its linked Road Paths. The Path
owns Gizmos editing and emits preview invalidation.

See [Pure Vec3 Knot workflow](PURE_VEC3_KNOTS.md).

## How to author

1. Create one Node with `SplinesV2.SplinePath`.
2. Open its custom Inspector and press **+ Add Knot** to create at
   least two Knot records. Edit **Position X/Y/Z** on each card; use
   Duplicate, Remove, ↑/↓, + After and Select to manage the list.
3. Set interpolation, Closed and Bézier tangents **on the Path**.
4. Create a Road, add MeshRenderer, assign **Path Source** and click
   Rebuild Preview. Extrude and Mesh Deform can share this Path.
5. Select Path to edit the points with Gizmos; no separate Knot Nodes
   or Scene Hierarchy entries are created.

See [custom Inspector](PURE_VEC3_KNOTS.md) and
[Bézier tangent editing](BEZIER_TANGENTS.md).

## Inspector, Path Transform and Gizmos

Cocos Inspector edits the serialized Vec3 records directly. The
Editor-only Path watcher detects changed positions/tangents/modes/
topology and Path World matrix at most once every 50ms. After 180ms
idle it forces one final preview. Gizmos begin/update/end/cancel
snapshots the edited Knot value record and Escape restores it.
A changed Path Node transform moves the entire spline.

**Manual Editor acceptance remains necessary** for custom Inspector
property rendering, native Undo/Redo, save/reopen and third-party
Gizmos picking. Headless CI alone does not certify Creator UX.

## Important restrictions

- Road, Extrude and Deform require Path Source; they do not hold
  independent Knot arrays.
- Node-based Knot storage is deliberately removed, with **no
  migration** from old alpha Scenes.
- Tangents belong to the whole Knot value record. Reordering Knots
  preserves the corresponding tangent mode and offsets.
- Per-Knot roll/banking, native Undo/Redo certification and a
  production-grade 3D Junction/Terrain authoring workflow remain pending.
- Live Gizmos edits never silently overwrite a Baked asset.

Related: [Gizmos integration](GIZMOS.md),
[Breaking rebuild charter](REBUILD_BREAKING.md),
[Creator acceptance tests](TEST_BUILD.md).
