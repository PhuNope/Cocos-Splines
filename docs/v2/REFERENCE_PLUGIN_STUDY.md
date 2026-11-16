# Reference plugin study — Dreamteck, SplineArchitect, ToolBuddy / Curvy

**Reviewed:** 2026-11-16. **Target:** Cocos Creator 3.8.8, `v2.0.0` development branch.

The three uploaded Unity packages were examined as **reference implementations**
only. Nothing from the supplied `.cs` code, materials, textures, prefabs,
meshes or other proprietary plugin resources is redistributed or copied into
Cocos-Splines. Cocos implementations below are original TypeScript.

## Observed capabilities and practical lessons

| Upload and inspected locations | Architecture / behavior | Cocos-Splines decision |
|---|---|---|
| Dreamteck — `Core/SplinePoint.cs`, `Editor/SplineEditor/Point Modules/PointRotateModule.cs` and `PointTransformModule.cs` | Points store an anchor, two tangent vectors and an orientation normal, with linked/free tangent modes. Point-oriented transform modules make editing distinct from whole-spline transforms. | Keep `Spline.Knot` as a pure CCClass record. Provide selected-Knot tangent rotation and editable manual tangent modes. Consider a separate explicit normal/bank editor only after a compatible orientation model is defined. |
| SplineArchitect — `Core/Scripts/AutoSmoothData.cs`, `EHandleSegment.cs`, `EHandleSelection.cs`, `EHandleUndo.cs`, `SnapSettings.cs` | Editor selection, control handles and Undo are separate concerns. Auto-smoothing stores neighboring tangent information; snapping has explicit start/end parameters. | Keep HUD and Inspector selection unified. Preserve real Creator `scene.set-property(record:true)` for serialized edits; add targeted snapping and native Undo acceptance later. |
| ToolBuddy / Curvy — `CurvySplineSegment.cs`, `CurvySplineSegment.ApproximationsSetter.cs`, `BuildShapeExtrusion.cs`, `CurvyGenerator.cs` | Automatic vs manual handles are explicit; orientation can be generated separately from sampled positions. Generator stages handle curve rasterization, cross-section extrusion and mesh output independently. | Preserve `Spline.Path` as truth, existing Road/Extrude/Deform independent consumers, and sampled frame/UV pipelines. Add manual Catmull/Centripetal tangents without swapping the entire Path interpolation mode. |

## Implemented from the architectural comparison

### Opt-in editable Catmull-Rom and Centripetal tangents

`Spline.Path.editableCatmullTangents` defaults to **false**. When
off, existing automatic Catmull / Centripetal interpolation is unchanged,
even if a Knot contains old handle values from an earlier Bézier edit.
When on, a Knot in `Auto` still computes its original curve exactly.

In `Gizmos Rotation Mode = Knots`, switch on the existing
`Gizmo Edit Tangents`. With editable Catmull/Centripetal enabled, the
selected Knot exposes incoming purple / outgoing cyan handles, plus
the XYZ tangent rotation rings if the installed Gizmos SDK supports
a custom rotation pivot. Moving a handle converts that Knot to
`Free`, while other Auto Knots keep their original derivatives.
`Aligned` and `Mirrored` continue to enforce their existing
paired-handle constraints.

The implementation converts a user-defined Bézier-style offset to the
corresponding cubic Hermite endpoint derivative:

- outgoing segment derivative at Knot i = 3 * `handleOut[i]`;
- incoming segment derivative at Knot i = -3 * `handleIn[i]`.

For initial `Auto` handles, the Editor reads the **actual analytic
Catmull endpoint derivative** and divides by 3, rather than using a
one-third Knot chord. Therefore a first drag that leaves the handle
at the same point leaves the curve unchanged. Moving it creates a
local intentional change to tangent and Road geometry, with no extra
Knot Nodes, interpolation switching or implicit Bake overwrite.

`Roll Degrees` remains independent of tangent orientation. Tension
still controls automatic derivatives; a manual handle supersedes the
derivative on its own segment side. The Knot's serialized CCClass
fields are native Creator properties. Manual tangent handling does
not claim native Creator Undo/Redo is certified by headless tests.

### Regression contract

- Default disabled and opted-in-but-all-Auto produce identical
  position and tangent samples.
- Includes uniform Catmull-Rom and Centripetal, open and closed paths,
  per-Knot tensions and roll values.
- Manual outgoing handles change only the intended segment's
  Hermite endpoint derivative, not positions or unrelated fields.
- First Auto-to-Free handle placement is continuous; a later drag
  changes the curve intentionally.
- Gizmo `Cancel` restores old handles and manual Knot mode; native
  Creator picking / Prefab and Scene reload must still be checked.
- Baked meshes are never implicitly modified by the editor handles.

## Next research-backed improvements (not yet implemented)

1. **Explicit snapping to existing Knot and segment endpoints**:
   use distance-tolerant, opt-in snapping with visible target guides.
   Do not silently change authored positions.
2. **Orientation controls beyond roll**: separate a stored Knot normal
   or a constrained orientation mode from the curve tangent, with
   robust 3D parallel transport and closed-loop seam tests.
3. **Road thickness/width planning under extreme curvature**:
   report minimum usable radius and choose among exact centreline,
   full width rounded corner, or a controlled width taper.
4. **Generator dependency graph and targeted dirty-region rebuilds**:
   decouple rasterization/UV/collision generation further, following
   the modularity lesson without adopting the proprietary Curvy graph.
5. **Native Editor Undo acceptance**: multi-Knot Gizmo drag, two-space
   tangent edits, Scene Save/Reopen and Prefab overrides on Windows
   Creator 3.8.8 are still test gates.

Keep the public `@ccclass` names exactly `Spline.Path`,
`Spline.Knot`, `Spline.Road`, `Spline.Extrude`,
`Spline.MeshDeform`, and `Spline.Junction`. No tags or Releases
are authorized by this study.

## Curve-preserving insertion: one-step De Casteljau split

The next original implementation adds **Split 50%** to the
Inspector for every existing Bézier segment. Dreamteck and Curvy
both expose spline split/insert workflows; this feature uses
standard cubic mathematics, without incorporating either plugin's
source or resources.

For a segment with four Bézier control points `P0, P1, P2, P3`,
the Editor evaluates De Casteljau at `t=0.5` and writes
three modified `Spline.Knot` CCClass records atomically **as one
serialized Knot-array value** (not as multiple scene properties).
The original segment is replaced by two exact cubic halves:
no position/tangent displacement, no UV arc-length jump, no
new Knot Nodes. The source endpoints become Free where needed,
and their *unaffected opposite side* handles are materialized
if the endpoint had been Auto. This prevents altering adjacent
segments when inserting at an existing automatic Bézier Knot.
An inserted Knot is itself Free.

**Split 50%** is offered for Bézier only, including the closing
segment of a closed Path. **+ After** remains available for
ordinary midpoint insertion, where changing spline shape may
be intentional. No shape-preservation claim is made for Catmull
or Centripetal insertion: inserting a new Knot changes their
automatic derivative neighborhood, so these modes do not show
Split 50%.

The same `edit-v2-path` bridge handles the new operation,
using `scene.set-property(record:true)` for the full typed
Knot array, then `record:false` for the active Knot index,
and a separate read-only preview refresh. The operation
never alters an existing Baked Mesh. Native Editor history and
Prefab Save/Reopen still require Creator 3.8.8 acceptance.

Regression samples all old segments at many parameters and
compares them against the corresponding new Bézier halves.
It includes open/closed, end-seam splits, Auto/Free/Aligned/
Mirrored source modes, unknown CCClass metadata, native Undo
payload shape, malformed handles and the 128-Knot limit.

## Exact Bézier Merge: reversible shape-preserving topology

After introducing Split 50%, the Inspector now supports
**Merge Exact** for compatible Bézier Knot triplets. This is an
original inverse De Casteljau implementation and copies no source
from the uploaded third-party Unity tools.

Given a left cubic A→M and right cubic M→B, the original unsplit
cubic's outgoing and incoming endpoint handles are uniquely
reconstructed from the two outer half-derivatives. The planner
then re-splits the candidate at t = 0.5 and verifies the middle
position **and all four child control vectors** within a small,
geometry-relative numerical tolerance. It also verifies that
the middle Knot's `rollDegrees` is exactly the average of the
two endpoint Rolls within numerical tolerance, protecting the
Road's bank interpolation.

The operation is **fail-closed**: A, M and B must all have Free
tangent mode, the two halves must be geometrically compatible,
and the middle Roll may not have been edited. Any unequal
handle/roll or unsupported dump shape disables Merge Exact in
the Inspector and causes explicit rejection if called directly.
Ordinary Remove remains available for deliberate reshaping.
Closed-seam merges and open interior merges are supported;
open endpoints and a path with only two Knots are not.

Only the two surviving endpoint handles are changed and the
middle Knot is removed. All other Knot metadata is preserved.
The entire typed CCClass array is committed through one native
`scene.set-property(record:true)` call, with active selection
updated separately without recording. No Baked Mesh asset is
overwritten. A successful Merge preserves the original centreline,
its UV distance, its endpoint Roll values and its sampled Bézier
derivatives, but it does *not* promise to restore the original
Auto/Aligned/Mirrored mode metadata: the two surviving knots
remain Free after a prior Split. Native Creator Undo/Redo, Prefab
Overrides and Save/Reopen still require Windows acceptance.

Regression includes open and closed paths, the wraparound seam,
source Auto/Free/Aligned/Mirrored handles, preservation of 3D
centreline samples, full bank guard, deliberate tiny handle edits,
mode changes, one recorded Knot-array update and the optional
Inspector button's availability.
