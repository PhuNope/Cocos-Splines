# Spline Editor Gizmos — required Cocos-Gizmos integration

Cocos Splines `v2.0.0` requires
[Cocos-Gizmos](https://github.com/PhuNope/Cocos-Gizmos)
**3.0.2 or newer** in Cocos Creator 3.8.8. Enable it in Extension
Manager **before** testing Spline handles and restart Creator after
updating either extension. The Editor dependencies are installed
separately; Splines never vendors or copies Gizmos SDK code.

For architectural boundaries and the actual required Scene API,
see [Gizmos architecture](GIZMOS_ARCHITECTURE.md).

## Component responsibilities

`Spline.Path` owns **one serialized array of pure `Spline.Knot`
CCClass records**, not child Nodes. Its move/rotate proxy getters,
gesture snapshots, cancellation, multi-Knot selection and linked
preview invalidation all remain owned by Path. Native interactive
Gizmos (render/pick, command lifecycle, HUD DOM) are owned by
Cocos-Gizmos. `SplineGizmoHandler` is the **only SDK adapter**.

`Spline.Road` and `Spline.Junction` draw read-only guide lines and
markers through the same Handler; neither can edit or store Knot
positions independently. Extrude and Mesh Deform consume Path
geometry and rebuild previews only, without Knot gizmos.

The retired `SplineGizmoBridge` and flat
`onGizmoHudControls()/onGizmoHud()/onGizmoHudAction()` API are
**removed**. The new Path HUD uses `onGizmoHUD()` and
`GizmoHUD.createHud()` with the SDK's property and action Commands.

## Move, rotate and group controls

- **Knots** Gizmo mode: Move XYZ axes and XY/XZ/YZ planes edit the
  selected Knot's Vec3. Optional indexed point handles expose other
  Knots (capped by Gizmo Point Limit).
- **Local/World** Position and Rotation spaces remain independent.
  Position Snap of 0 means unsnapped; positive values constrain moves.
- **Bézier** or **Editable Catmull/Centripetal**: enable Gizmo Edit
  Tangents to see purple incoming and cyan outgoing control points.
  **Gizmo Rotate Knot Tangents** adds three rotation rings at the
  actual selected Knot's position, rotating the tangent vectors
  without rotating the Node. The required SDK supports rotation
  pivots natively.
- **Planar2D / Spatial3D** rotation mode rotates the **entire Path
  Node**, using Z or XYZ rings respectively. The Knot's own
  heading/pitch follow the curve tangent. `Roll Degrees` is a
  separate bank around that tangent.
- **GizmoHUD** uses property-bound Commands for Snap, Active Knot,
  Roll, Tangents, Other Knots, Roll Guide and coordinate spaces.
  Two explicit action buttons **Toggle Active Group** and
  **Clear Group** act on the same transient selection as the
  Inspector + Group Nudge buttons. No extra serialized list.
- **Group Move:** only a selected group member moves the whole
  selected set. The dragging gesture pins Knots by record identity;
  Escape restores all original Knot positions. Inspector Group
  Nudge writes one serialized Knot array with `record:true`.

## Gesture and safety contract

On `begin`, Path pins the edited Knot and records its complete
position, mode, in/out handles and Roll, plus group snapshots.
`update` invalidates preview consumers. `end` settles the edited
state; `cancel`/Escape restores the snapshots, then refreshes
previews. Undo/onRestore invalidates stale CCClass object identities
and quarantines any late SDK callback until its matching cancel/end.
Neither dynamic preview nor Editor dragging writes to saved
Baked Mesh assets.

## Required SDK, no optional compatibility

If Cocos-Gizmos 3.0.2+ is missing or the installed extension lacks
`Gizmos3D.supportsRotationPivot`, `GizmoHUD.createHud/bind/action`
or the native move/rotate/draw APIs, the Handler reports **one
actionable Editor Console warning** and does not present fake or
old-version handles. No compatibility bridge to a legacy Gizmos
HUD is available. This affects only Editor Scene interaction;
Play and pure geometry do not invoke SDK globals.

## Acceptance on Creator 3.8.8 Windows

Select a Path and verify **one new HUD**, correct Knot pivot rings,
correct coordinates/snap, indexed point highlighting, group actions
and manual tangents. Test Escape, Undo/Redo, Prefab Overrides,
Save/Reopen, 2D/3D view transitions, Road/Junction guides,
interrupted dragging and Baked Mesh preservation. Headless CI
validates descriptor and serialization contracts but does **not**
certify native Editor pointer capture or Undo.

No tag/Release is created from development test builds.
