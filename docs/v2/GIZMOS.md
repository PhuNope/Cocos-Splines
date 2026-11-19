# Gizmos workflow — Cocos Splines

Install and enable **Cocos-Gizmos 3.0.2+** before Cocos Splines,
then restart Cocos Creator 3.8.8. The Editor requires the
mounted `db://cocos-gizmos/RegisterGizmos` module.

Spline.Path is decorated with
`@registerGizmos(SplinePathGizmos)`. Road and Junction
register their own read-only guide Drawers. Every Drawer is a
plain TypeScript class in `assets/splines-v2/Editor/` and never
becomes another Node or serialized Component. It is instantiated
on demand by the actual SDK decorator and retained per Component.

## Editing

- **Knots:** the active Knot has XYZ/plane Move handles; the other
  Knots can show indexed selectable points. Position and Rotation
  Local/World spaces and snapping are independent.
- **Tangent points:** for Bézier, enable Gizmo Edit Tangents.
  For Catmull-Rom/Centripetal, first opt into Editable Catmull
  Tangents. Auto Knots remain unchanged until first edit.
- **Tangent rotation:** when Gizmo Rotation Mode is Knots and
  Gizmo Rotate Knot Tangents is on, three rings pivot at the
  selected Knot, steering both Bézier/Hermite handles. This does
  NOT rotate the entire Path Node or invent separate XYZ Euler
  fields for pure Vec3 Knots.
- **Path rotation:** Planar2D/Spatial3D rotate the Path Node around
  Z/XYZ. **Roll Degrees** banks the mesh cross-section about the
  spline tangent independently.
- **Group move:** Toggle Active Group in the SDK builder HUD, or
  + Group on Inspector Knot cards. The selection is transient.
  Group Nudge records one whole serialized Knot-array edit.

On begin/update/end/cancel the Drawer forwards to Path's edit
state machine; Escape restores Knot positions, manual tangents,
mode and Roll and triggers dynamic preview rebuild. Interrupted
sessions after Creator Undo/Restore are quarantined. Neither
preview nor gestures overwrite saved Baked Mesh assets.

The old SplineGizmoBridge and direct
`onGizmoHandles/onGizmoHUD/onDrawGizmosSelected` Component hooks
have been deleted; the required decorator is the one registration
mechanism. Missing `db://cocos-gizmos/RegisterGizmos` is a hard
module dependency, not an optional compatibility mode.

For the architecture, see [GIZMOS_ARCHITECTURE.md](GIZMOS_ARCHITECTURE.md).
For Windows Creator acceptance, see [TEST_BUILD.md](TEST_BUILD.md).
