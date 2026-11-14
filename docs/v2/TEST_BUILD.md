# Spline Cocos v2 — Clean test build / Creator 3.8.x acceptance

**Branch:** `v2.0.0` · Development ZIP only · **No tag or GitHub Release**

The test ZIP is a clean installation containing `assets/splines-v2`, new
Editor entrypoints, and v2 Inspector tools. It does not ship legacy
`assets/splines`, legacy UUIDs, legacy menus or scene migration. **Use a
fresh Cocos Creator 3.8.x project, or disable the old extension** to avoid
install conflicts.

Automated regression and green GitHub Actions verify the built code and
headless Cocos mocks, **not** actual Scene/Inspector rendering,
mouse picking, native Undo history, saving or reimporting .gltf assets.

## Editor Undo/Redo hardening test

- Add/Insert After/Duplicate/Remove/Up/Down Knots through the custom
  Inspector; each operation should appear as **one** Undo step.
  Use Ctrl+Z and Ctrl+Shift+Z after each operation and verify every
  record's position, tangent mode/offsets, tension and Roll.
- **Select** a different active Knot: this should change Gizmos
  handles without generating a new Road preview or a new Undo step.
- Save and reopen the Scene, then edit a Knot again; a previously
  held Gizmos/HUD drag target must never point to the old serialized
  Knot record. Check Prefab override semantics separately.
- Change Road's Path Source from Path A to B; undo and redo. Confirm
  the Road preview relinks and its Baked Mesh asset remains unchanged.
- Native Gizmos position/tangent/roll computed-proxy Undo history
  still needs **real Creator 3.8.x certification**; mock history
  replay does not verify Scene's native Undo stack.

[Detailed Undo acceptance steps](EDITOR_UNDO_WORKFLOW.md).

## Setup — Pure Vec3 Path

1. Create one Node `SplinePath` with `SplinesV2.SplinePath`.
2. Open the custom Path Inspector; add Knot records, enter `Vec3`
   positions `(0,0,0)`, `(0,0,10)`, `(10,0,10)` and configure
   Closed/Interpolation, tangent modes and tension.
3. Reorder, Duplicate, Insert After, Select and Remove Knot cards.
   **No child Knot Nodes should be added to Scene Hierarchy**.
4. Create `SplineRoadV2` + MeshRenderer, assign Path Source and Rebuild.
   Test a shared Path with two Roads, Extrude and Mesh Deform.
5. With Gizmos installed, select **Path** and drag an active Vec3 Knot
   or one of the secondary points. Check that the generated mesh follows
   and Escape restores its original value-record data.
6. Move the **Path Node** itself and confirm all consumer meshes move
   with its world transform.

See [Pure Vec3 Knots](PURE_VEC3_KNOTS.md) for the custom Inspector.

## 2D/3D Rotate and per-Knot banking (new)

1. In Path Inspector set `Gizmos Rotation Mode` to `Planar2D`.
   Confirm one Z rotation ring around the **Path Node origin**; set snap
   to 15 degrees, drag it, then Escape to restore Path Euler angles.
2. Select `Spatial3D`. Confirm three X/Y/Z rotation rings and that
   XZ Roads can turn around Y. Every linked mesh preview must follow
   Path Node rotation, with End/Cancel forcing the final frame.
3. Return to `Knots`, edit the **Roll Degrees** of Knot 0/1/2
   (try 0, +30, -30) in the Inspector. A Road cross-section should bank
   smoothly, Extrude/Deform orientation should change and UV0/UV2
   should remain valid. Try a closed loop and a curved fillet.
4. Explicitly Bake and inspect fingerprints. Runtime Manual/Baked must
   not regenerate a mesh or emit Editor warnings. Reopen the Scene and
   test native Undo/Redo: CI cannot certify these Editor interactions.

[Rotate and banking guide](ROTATE_AND_BANK.md).

## Live Roll HUD test (new)

1. Select the Path, set Rotation Mode **Knots**, choose a Knot,
   and find the **Knot Roll (deg)** slider in the Scene Gizmos HUD.
   Drag from 0 to +30: the real Road preview must bank.
2. Press Escape while dragging. The prior bank and mesh must
   return; no saved Baked asset may change. Release normally and
   verify the next explicit Bake records the bank change.
3. Change `Gizmo Knot Index` while a Roll gesture is in progress:
   only the original Knot must change. Move/Insert/Remove commands
   must not reorder knots until the drag ends.
4. Toggle **Roll Guide**. A short orange crossbar and green Up
   vector should appear at the selected Knot and rotate with the
   banked frame. Compare guide orientation with Road cross-section.
5. Hide the SDK or enter Play/Preview: no HUD controls, no
   Roll write, no Editor warnings or live mesh rebuilds.
6. Test native Undo/Redo, Scene dirty state, Save/Reopen and
   cross-property history manually in Creator 3.8.x.

## Scene and Gizmos: visual tests

- Drag active Knot on Path with XYZ/XY/XZ/YZ Move handles.
  Test a secondary Knot point. The underlying Path-local Knot record
  position must change, not a duplicate Road property.
- **While dragging**, Road preview must follow at a bounded update rate
  (default `gizmoMeshIntervalMs=100`). On mouse-up it must match the
  final Knot position. Press **Escape** mid-drag: Knot and preview return
  to the prior shape, without destroying the saved Baked Mesh.
- **Inspector and Path Transform test:** edit a Knot Vec3 value directly
  in the custom Inspector; then move the whole Path Node with Creator's
  Transform Tool. The Editor watcher should detect both, update consumers
  and force a settled preview after 180ms without further changes.
- Also reorder Path Knots or change interpolation in Path Inspector;
  registered Road previews should update, or show an Editor-only error if
  the authored geometry is invalid. A previously valid preview should
  stay visible when an intermediate curve cannot be tessellated.
- Rebuild **two Roads sharing one Path** and move a Knot: both previews
  must follow. Turn off `gizmoLiveMesh` on one Road to confirm opt-out.
  Switching Road to Manual or Baked must not overwrite `bakedMesh`.
- Test **native Undo/Redo**, Scene dirty state, Save → Close → Reopen and
  duplicate Path nodes. Cross-Node undo and actual Creator polling timing
  are still **not certified by automated CI**.
- Enter Play: no Editor authoring callbacks should modify Knot data,
  create temporary meshes, or print authoring warnings.

## Road geometry and continuous UV

Using a 3-Knot open Path and Road:

1. Use Width=4, `SurfaceMode=ConstantWidth`,
   `FilletRadiusScale=1.35`, SampleStep=.25, U/V Longitudinal Axis.
   Try an S-curve, sharp 90° turn and 180° hairpin.
2. Example regression path (road-local world identity transform):
   K0=(-1.701,0,-7.206), K1=(-3.869,0,3.720),
   K2=(5.820,0,4.347). Check both **mesh winding** and seamless
   U/V UV0 across the entire fillet; no gaps, folded inside edge,
   UV reset, abrupt hard texture cuts, or overlapping coplanar faces.
3. Short-spacing reproduction: set Width=2, K0=(0,0,0),
   K1=(0,0,2.236), K2=(-5,0,-1). With
   `ShortKnotMode=AutoContinuous`, an impossible ConstantWidth fillet
   falls back to **UV-continuous locally narrowed Road** for this build.
   With `StrictConstantWidth`, it returns a clear geometric error.
   **Do not confuse AutoContinuous with a true fixed-width road.**
4. With nonzero Junction Trim or Road Sidewalk, the AutoContinuous
   fallback is disabled to preserve exact physical boundary seams.
   Move Knots apart or decrease Road width/radius instead.
5. Test a texture whose travel direction uses **U** (image X) and one
   using **V** (image Y). Run both Legacy/Physical Cross UV modes,
   markings on/off, shoulders and curbs.
6. Rebuild a manual preview and Bake a glTF. Confirm expected material
   slots, normals, UV0/UV2, triangle winding and mesh import visibility
   with actual Creator shaders. Headless glTF tests are not visual
   certification.

## Independent Extrude and Mesh Deform

Extrude now extends `SplineMeshGeneratorV2` directly, NOT Road. Its
Inspector should contain **Path Source, Radius, Sides, Caps, UV axis,
sampling, materials and Bake** — not Width/Shoulder/Curb/Junction fields.
Try a helix and a straight tube with and without end caps.

Mesh Deform also extends `SplineMeshGeneratorV2` directly. Assign
a readable imported `sourceMesh`, configure longitudinal axis (X/Z),
repeat and UV mode. Verify no source Mesh asset is ever destroyed,
UV0/UV2, normals/tangents and multi-submesh material slots remain valid.
Reimport FBX/glTF and test CPU mesh attributes in real Creator.

Both must rebuild temporary previews on Path edits, but **must not
auto-Bake an imported glTF asset**.

## Junction / Road network alpha

1. Create three or four Road nodes, each with its **own Path Source**.
   Configure **open ConstantWidth Roads** with matching positive
   Start/End Trim distances at the Junction. Do not link a Road
   without a valid Path.
2. Add `SplinesV2.JunctionPatch` on a Junction Node and connect
   the trimmed Roads in Branches. Click Rebuild Preview and inspect
   exact end-ring UV0 continuity, footprint, normals and unwelded
   material seam cracks.
3. Check Road shoulder/curb end-ring profiles, independent materials
   (asphalt 0, shoulder 1, curb 2), markings (3/4), sidewalk (5),
   and U/V Road texture directions.
4. Enable optional rounded curb corners, gentle grade, dropped curb
   corners, sidewalk apron and Road-length sidewalk joins in supported
   combinations; reject invalid grade/bank/intersections explicitly.
5. Test linked flat or Terrain-sampled sidewalk height. Current mesh
   does **not** edit Cocos Terrain topology or perform Boolean unions.
   No pedestrian-ramp standards compliance is claimed.
6. Bake Junction and linked Roads separately, save/reopen, switch to
   Baked and confirm all imported mesh references remain intact.

## Baked/Manual/Dynamic behavior

| Mode | Play | Editor operation |
|---|---|---|
| Manual | Does not generate geometry | Explicit Rebuild Preview |
| Baked | Displays imported saved Mesh | Explicit Bake/Bind/Show Baked; Gizmos only create temporary preview |
| Dynamic | Generates runtime mesh | Explicit preview/Bake available separately |

An explicitly Baked mesh is not automatically invalidated or overwritten
by Gizmos; use Bake/Bind again after changing geometry. Editor authoring
warnings must never spam the runtime console.

## Remaining acceptance gates

- Actual Cocos Creator 3.8.x import/preview, save/reopen, native Undo/Redo
  and external Gizmos mouse picking.
- Imported material/shader correctness, normals, lightmap UV2, collider
  adapter and editor memory/mesh disposal under sustained authoring.
- Complex Road Road intersection topology, 3D banked Junction and Terrain
  Boolean stitching, accessible curb ramps and traffic/lane-network rules.

See [Current status](STATUS.md), [Architecture](REBUILD_BREAKING.md),
[Path](SPLINE_PATH_V2.md), [Gizmos](GIZMOS.md).

## Junction Auto Trim (experimental)

1. Link exactly three or four different open ConstantWidth Roads; point their Path endpoints at the Junction Node center. Set `At End` correctly on each Junction Branch. Roads must have unit scale and enough length for the full cross-section.
2. Select Junction Patch and click **Check Auto Trim**. Read the proposed Start/End trims, branch angles and any validation warnings in the Editor Console. No scene data is changed by Check.
3. Click **Apply Auto Trim**. Verify `junctionStartTrim` / `junctionEndTrim` fields update on the relevant Roads and both Road/Junction temporary mesh previews rebuild. No Knot movement occurs; saved Baked Mesh assets are preserved until explicit rebake.
4. Test Junction 3-/4-way, Road curves/rotations, disconnected endpoints, mismatched `At End`, short arms and Undo/Redo. Each Road trim is recorded as an Editor property mutation; a *single grouped native Undo* is not guaranteed and must be certified in Creator 3.8.x.
5. Bake Roads and Junction separately only after confirming actual texture seams/curbs in the Creator Scene. The planner does not guarantee legal traffic turn radii, lane topology, Terrain CSG or full network stitching.
