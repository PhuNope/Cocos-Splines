# Path Rotate and per-Knot banking

**Branch:** `v2.0.0` — breaking development ZIP only, no tag or release.

## Gizmos Rotate (Path Node)

The installed [Cocos-Gizmos](https://github.com/PhuNope/Cocos-Gizmos)
SDK exposes `Gizmos2D.rotate()` and `Gizmos3D.rotate()`. The
`SplineGizmoBridge.ts` uses these **native preset descriptors**, rather
than creating a fake disk/rotation ring. It does not import or bundle the
SDK, and missing SDK functionality returns no rotation handles.

On the `SplinePathV2` Inspector set **Gizmos Rotation Mode**:

| Mode | Interaction |
|---|---|
| **Knots** (default) | Move the active Vec3 Knot and Bezier tangents |
| **Planar2D** | One rotation ring on Z; suitable for XY-plane splines |
| **Spatial3D** | Three rotation rings, X/Y/Z, suitable for 3D or XZ roads |

**Gizmos Rotation Snap** is measured in degrees. Set `0` for continuous
angles, or a positive number such as `15` for snapping.

The presets edit `pathGizmoRotationEuler`, an Editor-only computed
proxy to the **Path Node's local Euler angles**. Cocos
`Node.setRotationFromEuler()` applies the actual transform. The
native preset rotation rings are **centered on the Path Node's origin**,
not an individual Vec3 Knot: the current SDK does not provide a custom
Knot pivot option. The rings are rendered on world axes to avoid
double-applying the Node's own Euler rotation to the SDK frame.

Rotation begins a Path edit session, notifies all registered Road,
Extrude and Deform preview consumers during updates and forces a final
preview on End or Cancel. **Escape/Cancel restores the prior Node
rotation.** Knot position and tangents remain Path-local and do not get
rewritten when rotating the Path Node. In Play, the rotation proxy is
read-only and Gizmos handles are absent.

For 2D, use an XY-oriented Path with X/Y tilt at zero. To change the
heading of a horizontal XZ Road, use **Spatial3D** and rotate about Y.

## Knot Roll / banked mesh

Each serialized `SplineKnotRecordV2` now also has
`Roll Degrees` in the existing custom Inspector card. This is
**not** the Path Node Euler rotation.

- `0`: use the original rotation-minimizing frame (unbanked).
- Positive: rotate the swept profile about its travel tangent, raising
  its right side for a standard +Z horizontal Road.
- Negative: bank in the opposite direction.
- Range: -180..+180 degrees; invalid and non-finite values reject
  mesh generation.
- Roll between adjacent Knot values follows shortest-angle interpolation,
  so `+179` to `-179` travels only `2` degrees.
- Closed paths wrap the last bank profile back to the first without a
  twist/UV seam.
- Frame transport uses the **unbanked** frame, applying bank only to the
  resulting cross section. This prevents roll accumulating once per
  sampling step or changing with adaptive frame resolution.

Road strip, shoulder/curb profile, Extrude tube and Mesh Deform consume
the sampled banked frames. When a ConstantWidth fillet replaces the
Road centerline, the generator explicitly passes the **original Path
bank profile** to the new frame samples. For these fillets, roll is
interpolated by normalized spline parameter rather than a road-junction
geometric rule; visually inspect complex or sharp curves.

A banked Junction with crosswalks, sidewalk edges or Terrain joins
requires separate geometric acceptance: banking does not edit the
underlying Terrain or automatically produce accessible pedestrian ramps.

## Live Knot Roll editing in the Scene HUD

Select the Path Node, set **Gizmos Rotation Mode = Knots** and choose
**Gizmo Knot Index**. The Gizmos HUD now exposes a
**Knot Roll (deg)** slider ranging from -180 to +180 in 1° increments.
The slider edits the selected Knot's actual `rollDegrees` record, not
a separate unsaved or Road-local bank value.

- Move the HUD slider to rebuild all linked temporary mesh previews.
- Release to force a final preview, or press **Escape** to restore the
  exact value saved at mouse-down.
- While dragging, the target Knot record is pinned even if the active
  Knot selector changes elsewhere.
- A **Roll Guide** toggle controls a small cross-section indicator
  on the selected Knot (orange = right/crossbar, green = Up).
- **Gizmo Show Roll Guide** and **Gizmo Roll Guide Size** also appear
  in the Path Inspector. The guide uses the sampled banked frame at
  the Knot's exact segment boundary, not a rounded frame-table index.
- A secondary Path transform rotation or topology edit is blocked
  while the Roll HUD gesture is active. Manual/Baked assets are never
  silently overwritten by these Editor previews.

This HUD slider is the interactive alternative to typing Roll Degrees
on the Knot card. The third-party SDK provides one Undo edit session
for the slider; **native Creator Undo/Redo and serialization still
require an actual Editor smoke test** because the edited field is a
computed proxy onto a nested Knot record.

## Creator test checklist

1. Create a Path with three Vec3 Knots and a linked Road.
2. Switch `Gizmos Rotation Mode` to **Planar2D** in an XY Scene.
   Drag the Z ring, test 15-degree snapping and Escape. Only the Path
   Node's Z rotation should change.
3. Switch to **Spatial3D** in a 3D Scene; test X/Y/Z rings, continuous
   rotation, End/Cancel, and mesh preview following the Path transform.
4. Switch back to **Knots**, select a Knot, and edit **Roll Degrees**:
   first 0, then +30, then -30. Road cross-sections should bank while
   material UV0 remains continuous and UV2 remains present.
5. Try roll on a sharp ConstantWidth fillet, a closed Path, and a
   vertical Extrude or Deform source. Inspect normals, twist, collisions
   and whether local road width/sidewalk edges remain practical.
6. Explicitly Bake glTF after a roll change and confirm the fingerprint
   changes; change it back and confirm original geometry returns.
7. Enter Play in Manual/Baked mode and confirm no authoring callbacks
   or automatic rebakes. Test Creator Undo/Redo, Scene save/reopen and
   direct mouse picking; these remain **uncertified by headless CI**.

[Path authoring](PURE_VEC3_KNOTS.md) ·
[Gizmos](GIZMOS.md) · [Test guide](TEST_BUILD.md) ·
[Current status](STATUS.md)
