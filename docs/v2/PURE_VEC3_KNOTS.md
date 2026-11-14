# SplinePath — Pure Vec3 Knots & Custom Inspector

**Development branch:** `v2.0.0`. This is a breaking rewrite: there is no
legacy Knot-Node data migration or UUID preservation requirement.

## New source model

A `SplinesV2.SplinePath` owns **serialized Knot value records**, not
`Node[]` references. Each record is a small Cocos-serializable
`SplineKnotRecordV2`:

```ts
@ccclass('SplinesV2.Knot')
class SplineKnotRecordV2 {
  position: Vec3;        // local to the SplinePath Node
  mode: TangentMode;     // Auto / Free / Aligned / Mirrored
  handleIn: Vec3;        // relative to position
  handleOut: Vec3;       // relative to position
  tension: number;       // Catmull-Rom
  rollDegrees: number;   // per-Knot bank about travel tangent
}
```

`knots: SplineKnotRecordV2[]` is the one source of truth. No Knot child
Nodes or independent tangent records are needed. Reordering the array
reorders the **whole Knot record**, preserving its position and handles.
`SplinePathV2.getSplineDataV2(consumerNode)` transforms local control
points through Path World → consumer Local. Every Road, Extrude and Mesh
Deform continues to read the same snapshot. Junction uses the converted
world-space endpoint of each Road's linked Path.

## Custom Inspector

Add `SplinesV2.SplinePath` to one Node. Its dedicated Inspector offers:

- **Spline**: Interpolation and Closed.
- **Gizmos**: active Knot, visibility, point limit, editing toggles,
  and **Rotation Mode** (Knots / Planar2D / Spatial3D) with angle snap.
- **Vec3 Knots**: numbered editable Knot cards, position and tangent
  properties, and **Select · + After · Duplicate · ↑ · ↓ · Remove** buttons.
- **+ Add Knot** creates a Knot at the extrapolated end of the spline.
- A collapsible **Raw Knot Data** field remains available as a fallback
  for native Cocos array property editing.

The buttons now query Creator's typed component dump and commit a
single **recordable `scene.set-property` update** of the Knot array.
Selecting the active Knot is non-recorded and does not rebuild meshes.
Native `ui-prop` continues to edit record values. Removing the
last two required Knots is blocked. Duplicate inserts a shifted copy to
avoid a zero-length adjacent segment. The current Knot selection also
drives the Gizmos handles and HUD.

**Cocos Creator 3.8.x Undo/Redo with these native-recorded topology buttons
and nested property dumps remains a manual acceptance gate**; CI mocks verify
command routing and data mutation, not Editor history transactions.

## Gizmos and previews

Select the **Path** Node to edit points; there is no Knot Node to select.

- The active Knot uses move handles; other Knots use camera-facing point
  handles. Their positions are Path-local `Vec3` values.
- In Bézier mode, purple/cyan tangent handles modify the selected Knot
  record directly. Auto, Free, Aligned and Mirrored modes still work.
- Beginning a drag captures a snapshot of the entire selected Knot record.
  **Cancel/Escape restores position, tangent mode, and both offsets.**
- Editing a Knot re-builds registered generator previews (throttled).
  Changing values in Inspector, reordering records or transforming the
  **Path Node** also invalidates the registered generator previews.
- Manual/Baked modes still require explicit preview or glTF Bake and do not
  regenerate the Baked asset during Play.

## New scene test

1. Create one Path Node. Press `+ Add Knot` twice, edit positions to
   `(0,0,0)` and `(0,0,10)`, then add a third at `(10,0,10)`.
2. Create Road Node with MeshRenderer and Road component; assign Path
   Source; click Rebuild Preview.
3. Select Path, move a Vec3 Knot with Gizmos. Road should respond.
4. Edit Vec3 in Path Inspector; check geometry rebuild on the next Editor
   watcher tick and final settled rebuild.
5. Duplicate, reorder and remove a middle Knot; position/tangents must stay
   together without creating or deleting any Scene Nodes.
6. Change interpolation to Bézier and edit both tangent handles.
7. Create two Roads linked to the same Path, a Deformer and an Extrude.
   Both must consume the same Path values, each in its own Node-local space.
8. Test Creator-native Undo/Redo, Save → Close → Reopen, Scene dirty
   marking, runtime Dynamic and Baked, and 3/4-road Junction end seams.

## Path rotation and per-Knot roll

**Gizmos Rotate** operates around the Path Node origin using the
SDK's native 2D Z or 3D XYZ rings; it changes the Node Euler transform
while preserving local Knot coordinates. `Roll Degrees` on each Knot
changes the generated Road/Extrude/Mesh Deform frame orientation along
the path. These are separate controls.

See [Rotate & Banking](ROTATE_AND_BANK.md).

## Limits

The current design uses native Cocos Inspector serialization and a custom
extension Inspector. The exact usability, Undo stack, and reimport behavior
must be checked manually in Cocos Creator 3.8.x. Mesh topology,
road-width fillets, UV continuity, terrain joins and road networks remain
separate geometry workstreams.

See [SplinePath details](SPLINE_PATH_V2.md),
[Bezier tangents](BEZIER_TANGENTS.md), [Test instructions](TEST_BUILD.md).
