# SplinePathV2 — reusable spline source (alpha)

**Branch:** `v2.0.0` test-only. No tag/release.

## Why this exists

Before this checkpoint, each `SplineRoadV2` serialized its own
`knots: Node[]`, interpolation and closed flag. This was an intentional
independent v2 prototype, avoiding dependencies/UUID migration from legacy
`SplineContainer`. However it combined spline authoring and mesh generation,
making data-sharing and gizmo preview synchronization difficult.

`SplinePathV2` is now the **authoritative source** when linked. It stores
the ordered Knot Node references, interpolation and closed flag. The Road
only controls width, profile, material, fillet, UV, sidewalk and bake.
World-space Knot positions are sampled into **each consumer's local space**
on demand; coordinates are NOT duplicated into Road or a generated array.

## Creator 3.8.x usage

1. Create a Node `RoadPath` and add `SplinesV2.SplinePath` using **Add Component**. Put 3 Knot Nodes in its `Knots` array and select interpolation/closed there.
2. Create a Road Node with `SplinesV2.SplineRoad`, `MeshRenderer`, assign `RoadPath`'s `SplinePathV2` component to the Road Inspector **Path Source**.
3. Road's legacy Knot/interpolation/closed controls are hidden when Path Source is assigned, to avoid displaying two conflicting authorities.
4. In Road inspector enable `Show Scene Gizmos V3`, `Gizmo V3 Edit Knot` and `Gizmo V3 Live Mesh` (default true). Select Road and drag its Gizmos v3 handles.
5. Each Gizmos v3 `update` updates the **temporary preview mesh** at most once per `Gizmo V3 Mesh Interval Ms` (default 100ms, 50–400). **End/Cancel always rebuild**, so Escape restores the source Knot and the displayed Road together.
6. If a Knot travels through invalid geometry, the last valid transient preview remains visible. The final failed rebuild logs **one Editor warning**; fix Knot spacing / Road width and rebuild. The Baked Mesh asset remains unchanged until an explicit Bake.
7. Optional: assign that **same SplinePathV2** to multiple Roads. Roads that have generated their geometry in the Editor register as preview consumers. Changing a Knot with a linked Road's Gizmos triggers preview updates on all registered Roads. This does not guarantee automatically updating roads that were never initialized in the Scene Editor.

### Existing v2 scenes

All Road-local Knot references remain valid when `Path Source` is unset.
Nothing auto-migrates or deletes existing serialized fields. To migrate,
create a `SplinePathV2`, copy the Knot node references, interpolation and
closed settings, then link it. Test Junction endpoint trims and saved scene
re-open before deleting old serialized references.

### Restrictions / verification

- Editor-only incremental rebuild; **no runtime Gizmos**, no implicit
  glTF Bake, and no background timers.
- During drag, builds are throttled; end/cancel always force a final build.
  Invalid temporary geometry does not delete last valid preview.
- Path Source currently supported by **SplineRoadV2**. Wiring
  `SplineExtrudeV2` and `SplineMeshDeformV2` as consumers is a subsequent
  step, not certified as part of this checkpoint.
- Undo/Redo on original **Knot Nodes** and save/reopen handling need real
  Creator 3.8.x visual/manual verification. Gizmos v3's change snapshot
  belongs to the Road's computed proxy, not the Node being changed.
- Interpolation `Bezier` expects authoring handles in the spline data;
  position-only Knot Nodes are not a full Bezier tangent editor. For normal
  Roads choose Linear or Centripetal and use existing fillet mode.

See [Scene Gizmos v3 integration](./SCENE_GIZMOS_V3.md).
