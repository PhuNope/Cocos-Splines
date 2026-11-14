# SplinePathV2 — one authoritative spline source

**Development branch:** `v2.0.0`. Clean breaking test build; no legacy UUID migration, tag, or Release.

## Design

`SplinesV2.SplinePath` is the **only** component that owns:

- The ordered `Knot Nodes` list and each Knot's world-space transform.
- Interpolation (Linear / Bezier / Catmull-Rom / Centripetal) and `closed`.
- Optional Bezier tangent controls per Knot, stable across Knot order changes.
- Gizmos handles, point handles and an active-Knot HUD.
- Editor-only change observation and preview invalidation for mesh consumers.

`SplinesV2.SplineRoad` does **not** have `knots`, `interpolation`,
`closed`, or Knot editing handles anymore. Its `pathSource` reference is
required. Tube/Extrude and Mesh Deform also consume `SplinePathV2`, with a
shared `SplineMeshGeneratorV2` for Preview, Bake and Mesh lifetime.

Junction connects Road end-ring profiles through explicit linked branches;
it does not duplicate any Knot collection or inherit Road geometry fields.

## How to author

1. Create a Node named `RoadPath`, add `SplinesV2.SplinePath`.
2. Create child Knot Nodes and assign them to the Path's **Knots** array in order. Change `Interpolation` and `Closed` **on the Path**.
3. Create a separate Road Node with `MeshRenderer` and `SplinesV2.SplineRoad`. Drag the Path component into **Path Source**. Configure Width, Curb, Shoulder, UV axis and Road settings.
4. Use Road **Rebuild Preview** once. If Cocos-Gizmos is installed, select **Path** to move its active Knot or any other visible point handle; Road has only read-only centerline/edge/trim guides.
5. Mesh preview follows the Knot during the edit (default: 100ms throttled). End/Cancel/Escape forces the final Road preview, and **the saved Baked Mesh asset is untouched** until you explicitly Bake again.
6. Link the same Path to any other Road, Extrude, or Mesh Deform generators to reuse the authored source. Each generator must be rebuilt once in the Editor to subscribe as a live preview consumer.

The read-only scene guides and the actual edit handles are deliberately separate:
**Path edits**, **Road/Extrude/Deform/Junction consume and render**.

## Native Transform / Inspector / Undo

Directly moving a Knot Node using Cocos Creator's own Transform Tool does
not invoke the external Gizmos callbacks. Therefore Path has an Editor-only
`update()` signature watcher: it samples ordered Node identities, world
positions, interpolation and closed at most once every 50ms. On changes, it
notifies registered consumers. After at least 180ms without another change,
it **forces the final preview** even if a live rebuild was throttled.

This watcher never creates mesh assets, never starts background timers and
never runs while playing. Path's `onRestore()` also forces a preview refresh
after an Editor undo-like restore.

**CI proves the source and callback behavior with Cocos mocks**, including
native-style Node transform changes and multiple linked Roads. Actual
Creator 3.8.x Scene editor timing, native Undo/Redo transactions, save/reopen
and third-party Gizmos picking require manual validation.

## Important restrictions

- A `SplineRoadV2` with **no Path Source** intentionally cannot build. Old
  Road-local Knot fields and editor handle compatibility are removed.
- The Path now supports **authored Bézier tangents** bound to Knot Node identities, with Auto/Free/Aligned/Mirrored modes, Gizmos point handles and serialized local offsets. [Full tangent guide](BEZIER_TANGENTS.md).
- Per-Knot roll/banking, higher-order tangent constraints, and real Creator Undo/Redo certification remain pending.
- Every generator must be **explicitly rebaked** to update its imported glTF
  Mesh asset. Live preview never silently changes a baked asset.
- Invalid temporary geometry retains the last valid preview instead of
  deleting mesh or writing to the Scene. Final invalid geometry may emit one
  Editor-only warning.

Related: [Gizmos integration](GIZMOS.md),
[Breaking rebuild charter](REBUILD_BREAKING.md),
[Creator acceptance tests](TEST_BUILD.md).
