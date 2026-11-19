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

1. Create one Node `SplinePath` with `Spline.Path`.
2. Open the custom Path Inspector; add Knot records, enter `Vec3`
   positions `(0,0,0)`, `(0,0,10)`, `(10,0,10)` and configure
   Closed/Interpolation, tangent modes and tension.
3. Reorder, Duplicate, Insert After, Select and Remove Knot cards.
   **No child Knot Nodes should be added to Scene Hierarchy**.
4. Create `SplineRoad` + MeshRenderer, assign Path Source and Rebuild.
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

Extrude now extends `MeshGenerator` directly, NOT Road. Its
Inspector should contain **Path Source, Radius, Sides, Caps, UV axis,
sampling, materials and Bake** — not Width/Shoulder/Curb/Junction fields.
Try a helix and a straight tube with and without end caps.

Mesh Deform also extends `MeshGenerator` directly. Assign
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
2. Add `Spline.Junction` on a Junction Node and connect
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

## Scene Road Network and Endpoint Snap alpha

1. Create 3 or 4 open ConstantWidth Roads, each with a distinct SplinePath containing pure Vec3 records. Link Roads to a Junction Patch with the correct **At End** settings, and leave each chosen Path endpoint about 0.1–0.5 units away from the Junction Node center.
2. Select the Junction and click **Check Road Network**. Inspect read-only endpoint proximity groups and skipped Roads in Editor Console. This discovers proximity; it does not automatically populate Junction Branches.
3. Set **Endpoint Snap Max Distance** (default .75), and click **Check Endpoint Snap**. Confirm the proposed 3/4 world displacements and that the Path nodes can have different translations and yaw/rotations. Check does not mutate Scene data.
4. Click **Apply Endpoint Snap**. Each selected endpoint should align with the Junction's world center, while unselected Knots, stored tangent offsets, tangent mode and Roll remain identical. Move Gizmos or edit another Path Knot; linked Road previews must refresh without destroying Baked Mesh assets.
5. Test Ctrl+Z / Ctrl+Shift+Z for each changed Path, Scene Save/Close/Reopen, duplicate scenes and prefab overrides in real Creator 3.8.x. A multi-Path snap can require multiple separate Undo operations. Automated CI only simulates recordable IProperty dump writes.
6. Negative tests: wrong At End, two Roads sharing one Path Source, disconnected Road > Snap Max Distance, height difference > Flat Tolerance, singular Path transform, short/degenerate Road, invalid Junction trim. A failed **Check** must never change the Scene. Apply preflights all dumps before the first commit; if Creator rejects a later write, earlier Path history entries remain undoable (no global atomic transaction).
7. Rebuild/Bake the trimmed Roads and Junction only after validating rendered UV, curb/sidewalk seam and topology. Endpoint Snap does not fix crossing meshes, tangent direction mismatches or unsupported intersections.

## Junction Auto Connect (new alpha)

1. Create a Junction Node with `Spline.Junction`. Leave `Branches` empty or partially populated. Place **3 or 4 different** open ConstantWidth Roads near the Junction; each Road needs its own `SplinePath`. Road and Junction may be on different Nodes; connect endpoints to within 0.75 world units.
2. Set `Auto Connect Search Radius` to include those endpoints but exclude unrelated Roads. Click **Check Auto Connect**. Verify exactly 3/4 candidate Road **component** references, correct `At End` orientation and a deterministic angular order in the Editor Console; Check must not dirty the Scene.
3. Click **Apply Auto Connect**. Confirm the Inspector `Branches` CCClass array is populated, the old Road-specific Stop Bar/Crosswalk settings survive and new links reference the correct `Spline.Road` component. Perform Ctrl+Z and Ctrl+Shift+Z, Save/Close/Reopen and Prefab instance override tests **in actual Cocos Creator 3.8.x**.
4. Click **Check Endpoint Snap** then **Apply Endpoint Snap** if any attached Path endpoint is offset from Junction center. Click **Check Auto Trim**, then **Apply Auto Trim** to create proper Road cuts. Use **Rebuild Preview** to visually inspect Junction UV, curb/sidewalk seams. Bake separately only after verifying paint/materials in the Scene.
5. Test failure cases: five nearby Roads, a single Road whose two ends both fall inside the radius, shared Path between Roads, nearly identical approach bearings, stale existing links, out-of-radius Roads, elevated overpasses, and a Junction with active `turnGuides`/`curbRamps`. Apply must reject ambiguity without deleting authored data.
6. No traffic lane routing, automatic tangential continuity, non-planar Junction Boolean/welding or native Editor certification is claimed. Headless tests do not prove real component-reference linking/Undo.

## Align Junction Bézier endpoint tangents (experimental)

1. Link exactly 3 or 4 separate `SplineRoad` components to Junction `branches` with correct `At End`. Set each linked `SplinePath` to **Bezier**, open, with distinct Path Nodes.
2. Perform **Endpoint Snap** first. Set `Tangent Endpoint Tolerance` to a small positive distance (default 0.05) and `Tangent Angle Tolerance Degrees` to the desired angular threshold (default 3°).
3. Set at least one endpoint Knot tangent mode to **Free**, **Aligned** or **Mirrored**, with an authored handle visibly rotated away from the next Road Knot. Click **Check Align Tangents**; verify correct Path UUID, Start/End handle side, angular difference and proposed handle length in the Editor Console. Check does not mutate any Vec3.
4. Click **Apply Align Tangents**. Only Start `handleOut` or End `handleIn` should change, potentially changing that terminal Knot's mode to Free. Unused opposite handle, every Knot position, Roll, tension, saved Baked Mesh and source materials remain unchanged. Auto-mode endpoints remain Auto.
5. Run **Rebuild Preview**, then inspect real Road/Junction mesh and asphalt UV seams. Perform Ctrl+Z/Redo per Path, Save/Reopen and Prefab Override tests in Creator 3.8.x; multi-Path Apply is not a grouped native history transaction.
6. Negative tests: Linear/Catmull interpolation, closed Path, shared Path used by two Road branches, incorrect `At End`, endpoints not yet snapped, vertical/steep arm, insufficient chord spacing, and stale Knot data between Check and Apply. No automatic surface-Boolean or lane continuity is implied.


## Check Junction Seams and Strict Road Seams

1. Create a 3- or 4-way Junction with matching trimmed Road end rings. Use **Matched Repeat UV** and **Patch Lift = 0** for exact seam certification. Use the same **Repeat-wrapped material** on Road and Junction asphalt and confirm U/V axis/tiling compatibility.
2. Select Junction Patch and click **Check Junction Seams**. View the CPU audit in the **Editor Console only** (no footer debug panel). A passing matched Junction should show `ok: true`, `matchedGeometry === boundaryVertices`, `matchedUV === boundaryVertices`, `inconsistentUVBranches: 0`, `degenerateTriangles: 0`.
3. Enable **Strict Road Seams** to validate those checks automatically before any Junction Editor Preview/Bake. This is default OFF so older scenes keep their behavior. Check again after changing trim, profile material slots, UV tiling, curb ramps or side sidewalk geometry.
4. Negative tests: select **World Projected** UV, set **Patch Lift = 0.01**, or attach an invalid/untrimmed Road. The audit must refuse to claim exact XYZ/Repeat seam continuity. Restore settings before Bake.
5. Compare real material filtering and tangent shading in the Scene view, including curb/sidewalk corners and painted markings. The CPU check cannot prove that two different source textures, wrap modes, material instances or the engine's renderer produce a visually seamless material. Nor does it Boolean-weld entire Road and Junction meshes.


## Junction 2.5D asphalt overlaps and UV interior smoothing (experimental)

1. Create a 3- or 4-way Junction with **plain asphalt-only ConstantWidth Roads**, Match Repeat UV, Patch Lift 0, and correctly applied Endpoint Snap / Auto Trim. Keep `Junction UV Interior Smoothing = 0` to compare the existing mesh with the new option.
2. Click **Check Junction Seams**. Verify `asphaltOverlapChecked: true` and `overlappingAsphaltPairs: 0` alongside the existing end-ring XYZ/UV0 tests. A shared asphalt triangle boundary should not be flagged as positive-area overlap.
3. Set `Junction UV Interior Smoothing` to **0.25–0.35** and Rebuild Preview. Road cut-ring UV tiles and xyz vertices must remain exact; only the inner ring UV0 changes. Compare asphalt texture stretching near the center at different camera angles. Verify UV2 and material slot assignments do not change.
4. Bake a test mesh with Smoothing 0, then change to 0.35 and inspect Bake Status: UV0 data and the new glTF fingerprint should change, but no old Baked Mesh asset is overwritten until an explicit Bake. Repeated rebuilds with the same settings must be deterministic.
5. For profiled curb/shoulder Roads or World Projected Junction UV, leave smoothing **0**. Setting a positive value intentionally rejects those unsupported combinations; it must not silently apply a partial profile UV transform.
6. Turn on **Strict Road Seams** only after a passing audit and test both Preview and Bake. Warnings are emitted in Editor Console only. Strict mode is Editor-only and never writes Knot data.
7. Real Creator 3.8.x verification is still needed for UV/tangent shading under each actual shader/material, Scene save/reopen, Undo, Painter/paint geometry, and stability under extreme acute corner trims. This stage detects overlaps, it does not repair a global polygon union.


## Creator 3.8.8: SplinePath invalid Vec3 Knot dump regression

1. Install the **latest v2.0.0 test ZIP** from the successful GitHub Actions run, replacing the whole old `extensions/cocos-splines` folder while the Cocos Editor is closed. Ensure there is not a duplicate older extension with the same name. Reopen Creator 3.8.8 and let scripts/imports finish.
2. In the same Scene where the previous error occurred, select the Path Node and test **Select**, **+ Add Knot**, **+ After**, **Duplicate**, **Move Up/Down** and **Remove**. Verify no `invalid serialized Vec3 Knot records` error, and that positions, tangent modes/handles, Roll, custom values, and selection all match the expected records.
3. Test **Undo/Redo**, Save/Reopen, Prefab override, and preview rebuilding from the linked Road / Extrude / Junction in the actual Editor. The pure codec does not touch live Script component values directly.
4. Check **Endpoint Snap** and **Align Tangents** if the Scene contains Junctions; they now use the same Vec3 nesting decoder for the affected Path fields.
5. If an individual record really is malformed, the new Editor message identifies the Knot index and a short **structural shape** hint without modifying it. Record that new message and, if possible, a sanitized excerpt of the affected `query-node` Knot object to resolve any additional Creator-specific representation. Do not edit raw Scene JSON simply to silence the error.

## Local versus World mesh generation (breaking authoring update)

- Each `SplinePath` keeps pure local Vec3 Knots. **SplineRoad**, **SplineExtrude**, and **SplineMeshDeform** now expose **Coordinate Space** in the Inspector. Default **Local** uses those Vec3 coordinates directly as mesh vertices in the *generator Node's local space*, ignoring Path Node translation/rotation/scale. **World** preserves the previous behavior, transforming from Path Node World into the generator Node's local space.
- Try a Path with two knots (0,0,0) and (0,0,10), place the Path Node at (20,0,0) and Road Node at (3,0,0). In **Local**, the road vertices appear around generator Node X=3 in world coordinates. In **World**, they appear around Path Node X=20; the mesh vertex data is expressed locally relative to Road Node X=3.
- Junction always builds Road endpoints from the actual chosen Road Coordinate Space, converts Road end-ring vertices into Junction Node local coordinates, and uses the correct transform to compute Endpoint Snap and tangent alignment. Test different Path/Road Node transforms for both modes.
- Switch Coordinate Space then click **Rebuild Preview**. The saved Baked Mesh asset remains unchanged until **Bake glTF Asset**; don't expect existing Bake to update automatically.
- **BREAKING `@ccclass` rename** (no automatic migration): `Spline.Path`, `Spline.Road`, `Spline.Extrude`, `Spline.MeshDeform`, `Spline.Junction` and `Spline.Knot`. Back up existing Scenes and Prefabs before installing this ZIP. If the old `SplinesV2.*` components appear as missing scripts after replacement, reattach the new components and reassign the Path/Materials/Knots. No promise of preserving old serialized CCClass name references.


## Scene HUD — Position / Rotation Local / World (Creator 3.8.8)

1. On a new test Scene, create `Spline.Path` with two or more local Vec3
   Knots and enable Cocos-Gizmos in the Scene process.
2. In Path HUD check the two toggle pairs **Position · Local / World** and
   **Rotation · Local / World**. Only one button in each pair should remain
   active; changing Position must not change Rotation and vice versa.
3. Set the Path Node at World X=10 with scale X=2; choose
   **Position · World** and move Knot 0 to World X=14. The saved
   `Knot[0].position.x` should become **2** (Path local), not 14.
   Toggle back to **Local** and ensure the handle is at local X=2.
4. Use Bezier interpolation and verify tangent World drags convert to
   local offsets. Drag and Cancel/Escape; both position and tangent mode must
   revert without generating extra Knot records. Try a non-uniformly scaled,
   rotated Path Node and additional indexed Knot handles.
5. Rotate the Path Node's parent by Z=25°; choose
   **Rotation · World**, choose 2D or 3D Rotate mode and apply Z=90°
   in World. The Path's local Euler Z must be 65°. Check Local mode,
   Undo/Redo and Escape. Do not switch coordinate space during a drag.
6. Open the custom Path Inspector: the **Raw Knot Data** section must be
   absent. Individual editable Knot records, toolbar actions and
   spline settings remain; no bottom status description/log is rendered.
7. Rebuild linked Road / Extrude / Mesh Deform previews after authoring.
   Their **Coordinate Space** setting is independent from HUD's axis space;
   they should only change when Path content or transform relevant to their
   own generation mode changes.


## Path HUD precision / snap checks

1. In a test Scene containing an editable `Spline.Path`, confirm the HUD
   displays the selected Knot's **Local/World XYZ** in a read-only row. Select
   another Knot and verify the row updates. The Inspector shows no raw array.
2. Set `Position Snap = 0`: Move handles, additional Knot point handles
   and Bézier tangent handles should drag smoothly without discrete steps.
3. Set `Position Snap = 0.25` in Inspector or the Scene HUD. Drag active
   Knot, an indexed Knot and a Bézier tangent in both Position Local and
   Position World. Check each drag uses matching 0.25 unit increments in the
   selected coordinate frame while Knot data stays Path-local.
4. Check **Rotation Snap** works independently of Position Snap in 2D and
   3D Rotate modes. Escape should restore the authored Knot and manual
   tangent modes/offsets, not leave snapped intermediate coordinates.
5. Repeat with the Path Node translated/rotated/scaled and a separately
   transformed Road generator. Check linked Road preview and UV remain
   consistent. Save/Reload and Prefab/Undo require native Creator 3.8.8
   certification; automated tests cover code and mocked SDK calls only.


## Multi-Knot authoring / Group Nudge

1. Select a Path with 3 or more Knots and choose **Active Knot = 0**
   in the Scene HUD. Click **Toggle Active Group**, choose Knot 2
   and click again. The HUD reports **Group 2: 0, 2** and selected
   point handles have a distinct cyan tint.
2. Set Position Space to **Local**, drag Knot 0 by +X=2.
   Only Knots 0 and 2 move by +2 local units; Knot 1 stays fixed,
   and every Bézier handle/roll is unchanged. Cancel/Escape restores
   both selected positions, not just the active point.
3. Set Position Space to **World** with a Path Node scaled X=2.
   Drag +X=2 World; both selected Knots move +X=1 local.
   Switching mode or toggling selection during drag must not alter
   its originally pinned Knot group.
4. Re-select the same group via HUD. In the Path Inspector open
   **Group Nudge (HUD selection)** and click **X+**. With
   Position Snap=.5 this moves each chosen Knot by +.5 in Local
   mode or the equivalent world-space vector in World mode.
   One Inspector click should make one typed serialized Knot-array
   Undo history entry. Ctrl+Z/Redo must affect all selected Knots
   together. A second nudge should use the same selection.
5. Check **Clear Group**, individual active-Knot movement, invalid
   selection (fewer than 2), Add/Insert/Remove and Scene save/reopen.
   Old serialized Knot data must remain unchanged when selecting.
6. The SDK exposes a maximum of 12 normalized HUD controls; in
   Bezier mode all 12 controls are occupied, so avoid adding
   additional HUD entries without consolidating an existing control.
   Validate actual Gizmos and native Scene Undo/Redo in Cocos 3.8.8.

## Closed Loop UV phase — Creator 3.8.8 manual acceptance

The Road Inspector's existing **Check Bake Status** reports a
`closedLoopUV` read-only CPU diagnostic for closed Paths. It measures
the **generated** Road length (including Constant Width fillets, or
source length after Continuous fallback) and checks whether the
longitudinal UV0 ends on an integer Repeat tile. Fractional repeats
produce **one warning on each explicit check** in the Editor Console,
not a running debug panel or Play log. This does not change the Scene,
MeshRenderer, temporary preview or saved Bake. The CPU cannot verify
the actual GPU sampler: even aligned UV0 needs an appropriate Repeat
material for seamless texture rendering.

1. On a clean Creator 3.8.8 project, author a closed four-Knot Path
   with a length that is not a multiple of UV Meters Per Repeat.
2. On the linked Road set Longitudinal Axis U and turn
   Closed Loop UV Repeat **Off**. Click Check Bake Status and expect
   `closedLoopUV.phaseMismatch=true` and a fractional-tile warning.
   Repeat for axis V.
3. Turn Closed Loop UV Repeat **On**, Rebuild Preview and recheck.
   Expect `phaseMismatch=false`. Verify rendered seam using a
   material whose longitudinal axis sampler uses **Repeat** (compare
   with Clamp to distinguish material configuration).
4. Repeat on Continuous and Constant Width (fillet), both plain
   asphalt and shoulder/curb Profile with separate markings.
   Geometry, mesh indices and UV2 must be unchanged by the setting.
5. Explicitly Bake glTF, bind its imported `.mesh`, switch to Baked,
   Save/Reopen and compare Dynamic vs Baked. Turning the setting Off
   should mark the old Bake stale, without automatically overwriting it.
6. On an Open Path the loop report should be null, and toggling
   the option must not affect UV0. Play Manual/Baked cannot regenerate
   geometry or emit Editor-only warnings.

Record U/V, Repeat/Clamp, Constant Width/Continuous, Profile/markings,
Dynamic/Baked, Save/Reopen, Prefab Overrides and native Undo/Redo
separately. CI validates only headless geometry and mocked Editor
workflows, **not** native Creator 3.8.8 rendering.

## Sparse glTF material slots — Creator 3.8.8 manual acceptance

1. Build a Road using `Materials[0]` for asphalt, `Materials[3]`
   for line markings and `Materials[4]` for edge paint. Enable
   markings, Rebuild Preview and confirm three distinct draw parts.
2. Bake glTF, bind the imported `.mesh` subasset, then inspect
   whether its actual submesh order matches primitive indices
   0/1/2 from authored slots 0/3/4. The imported Creator
   submesh order requires native verification, not only CI.
3. Switch to Baked, Save/Reopen and enter Play. Confirm asphalt,
   lines and paint match Dynamic Preview without rebuilding.
4. Edit paint material only. The imported submesh at index 2
   should update, with the geometry fingerprint unchanged.
5. Change source geometry. Check Bake Status must report stale
   without changing the saved primitive map or imported Mesh.
6. Validate a deliberately mismatched imported submesh count.
   Check Bake Status should show `materialMapStatus: invalid`;
   no guessed slot assignment should silently shift materials.
7. Verify legacy manually bound Mesh references, Undo/Redo and
   Prefab Overrides continue working as before.

Record screenshots and logs for Play/Dynamic/Baked and Save/Reopen.
The headless regression does not certify GPU rendering.

## Late AssetDB import versus changed Path/Bake (2026-11-16, P1)

**Bake glTF Asset** may take several AssetDB import retries. A new
Path/UV/material-slot topology edit during that window invalidates the
source fingerprint; a second Bake can replace the pending URL, fingerprint
or primitive material slots. **Bind Imported Mesh must not attach the old
Mesh** in either case.

The Editor main entrypoint now supplies a read-only `inspectV2RoadBake`
verification callback to the import binder. Once AssetDB reports one
concrete `cc.Mesh` subasset, the binder re-reads the *current* Scene
fingerprint and pending Bake metadata and verifies that the serialized
component still has the exact pending URL/fingerprint/material slots.
Only then can it write the Mesh UUID and committed metadata; if stale,
it returns `ok:false`, never a misleading successful/pending result.
Existing Baked Mesh and material bindings remain untouched on this
pre-write rejection.

Manual test: start Bake on a Road with slots 0/3/4, modify its Path
before import completes, then press **Bind Imported Mesh**. Confirm
a stale-source refusal, zero new Mesh binding, and no false success.
Repeat with two fast consecutive Bakes (the second supersedes the
first). Finally restore the correct Path and Bake/Bind again.

For a bound Mesh with an invalid saved primitive slot map, verify
the renderer **clears** any previously assigned dense imported
materials instead of accidentally retaining asphalt/markings from
a prior preview. Check Bake Status must report
`materialMapStatus: invalid`. Native Cocos Creator 3.8.8 tests are
still required; mocked CI cannot make Editor operations atomic or
prove the importer preserves primitive order.

## Mid-Bind failure recovery — Windows Creator 3.8.8 manual checklist

1. Start from a previously bound Road Mesh with known source fingerprint,
   material slots (such as 0/3/4) and saved Baked mode.
2. Stage a new Bake and deliberately interrupt or reject a property
   assignment during **Bind Imported Mesh** (use a disposable project).
   Check that an ordinary failure leaves the previous Mesh, source
   metadata, mode and pending Bake identical to their pre-Bind values.
3. Verify both `bakedMaterialSlots` and `pendingBakeMaterialSlots`
   across Save/Reopen. A failed Bind must not be reported as success.
4. Exercise native Undo/Redo and Prefab Overrides. The headless
   rollback is a compensating sequence, **not one Creator history
   transaction**: if property restoration or verification fails,
   expect `recoveryRequired:true` and restore the Scene manually.
5. Perform a successful fresh Bake/Bind after an injected failure;
   verify the newly imported Mesh uses the correct material order,
   with no unintended source regeneration in Play.

Do not certify Release Candidate from these mocked tests alone.

## Pending Bake metadata transaction — Windows Creator 3.8.8

1. Begin with a bound Road Mesh, its source fingerprint, slots 0/3/4
   and saved Baked mode. Stage a new Bake; verify the pending URL,
   fingerprint and primitive slot map all reference that same export,
   while the previous Baked Mesh remains unchanged before Bind.
2. In a disposable project, simulate a rejected Scene
   `set-property` while staging the pending URL, fingerprint or
   primitive slot map. Save/Reopen and inspect all three fields:
   they should have reverted together, or the operation must
   explicitly report `recoveryRequired` rather than success.
3. Change the Path during glTF creation/staging. The new pending
   tuple must not be considered valid for the modified Path.
   Repeat with two overlapping Bake requests and confirm no
   false completion message or silent loss of a newer pending URL.
4. Retry a valid Bake and Bind, then check imported submesh order,
   the old and new Baked Mesh references, native Undo/Redo, and
   Prefab Overrides. A generated glTF left unused by a failed
   stage must not alter the saved Scene.

These steps are not marked complete by green CI; the test suite
exercises a mocked Creator Editor API only.

## Three-Knot Creator screenshot — Path/Group/Constant Width (2026-11-16)

1. On **Spline.Path**, `Interpolation = Centripetal` provides
   automatic tangents: no manual tangent handle is displayed.
   To edit tangents, choose `Bézier`, expand `Vec3 Knots`
   and select `Free` / `Aligned` / `Mirrored` Mode.
   Then enable `Gizmo Edit Tangents` and move the incoming
   purple/outgoing cyan handles in Scene.
2. There is no independent XYZ rotation for a pure Vec3 Knot.
   `Roll Degrees` inside the Knot card / the Scene Roll slider
   rotates its cross-section around the spline forward tangent.
   `Rotation Local/World` selects the rotate Gizmo's frame;
   `Planar2D/Spatial3D` rotate the entire Path Node.
3. Click **+ Group** on Knot 0 and Knot 1 in the Inspector.
   Confirm the `Group Nudge` section says **2 selected**,
   then press X/Y/Z +/- for one recordable group move.
   `Clear Group` resets it, and `Refresh Group` synchronizes
   buttons with HUD-only selection.
4. On the Road with `Surface Mode = ConstantWidth`,
   keep **Follow Source Curve in Constant Width = On**
   for Centripetal (the default). Rebuild Preview.
   The centre of the Road must pass through all three
   source Knot positions and follow the same curved path
   shown by the Path Gizmo, rather than rounded chord fillets.
5. Toggle **Follow Source Curve in Constant Width** Off,
   rebuild and compare: this intentionally restores the old
   circular Knot-chord route, which can deviate from the
   authored spline. For very tight curves, expect an offset
   self-overlap risk; try Continuous or reduce Width.
6. Test U and V UV axes, Roll, dynamic editor rebuilds,
   Undo/Redo, Save/Reopen, Baked asset unchanged until
   explicit re-Bake, and Prefab Overrides. Record the
   Creator version and a Scene screenshot for acceptance.

## Authored curved Constant Width fold protection

In the three-Knot Centripetal test, first try a narrow Road:
with Follow Source Curve On, the centre line must pass through
the authored Knot and sampled Path points at fixed width.
Increase Width until the inner edge cannot fit the corner.
In Auto Continuous, expect a clear fallback notice and no
missing triangles. In Strict Constant Width, expect an
actionable fold warning and the previous valid preview to
remain intact. Explicitly Rebuild and inspect Dynamic/Baked,
UV0 Repeat U/V, UV2, marked lane continuity and Undo/Redo.

## Screenshot follow-up: full width and Knot rotation handles

1. Install the matching **Cocos-Gizmos v3** and **Cocos-Splines v2**
   test ZIPs, restart Creator 3.8.8, select Path.
2. In **Bézier** interpolation set **Gizmos Rotation Mode = Knots**,
   **Gizmo Edit Tangents = On** and
   **Gizmo Rotate Knot Tangents = On**.
   Select Knot 1: expect XYZ rings at its position plus the
   two separate purple/cyan tangent points. Drag a ring, then Escape:
   both tangent vectors return to their originals. Drag again and
   commit: the Road Preview follows. Roll remains a different control.
3. Select a Road with `Follow Source Curve = On` and
   `Short Knot Mode = AutoContinuous`, Width 4 and the
   three-Knot sharp curve. Rebuild. Expect smooth FULL-width
   circular rounding with a Console note that the centreline
   deviates locally; **no pinched width wedge**. Check U/V
   UV0, UV2, uninterrupted triangles and Scene guides.
4. Reduce Width / soften the curve until the source offset is
   feasible: at that point Constant Width follows the original
   centreline without a fallback warning. Strict mode must
   reject an impossible full-width source curve rather than
   silently narrow it. Verify Undo/Redo, Save/Reopen and Prefabs
   on Windows; mocked CI alone cannot verify native gizmo picking.

## Reference plugins: manual Knot handles without forced interpolation switch

From uploaded Dreamteck, SplineArchitect and Curvy examples,
test `Spline.Path → Editable Catmull Tangents`:

1. Use the same 3-Knot Centripetal Road as the screenshot. With
   editable tangents off, path/road geometry must match previous
   builds; manual handles and rotation rings are absent.
2. Enable editable tangents while all Knots remain Auto. The Road
   must not jump. Selecting Knot 1 should show purple incoming and
   cyan outgoing tangent points and, on the updated Gizmos SDK,
   XYZ pivot rotation rings at Knot 1.
3. Move the outgoing handle. Knot 1 switches to Free, its outgoing
   branch changes, but its incoming branch stays where it was.
   Test Aligned and Mirrored modes for coupled handles.
4. Press Escape during a handle or rotation drag. Both handles,
   mode and preview must restore. End/commit should preserve changes
   through Scene Save/Reopen and Undo/Redo (native verification pending).
5. Turn editable tangents back off. The exact original automatic
   curve returns; the serialized handles are retained for re-enabling.
   Baked Mesh must remain unchanged until explicit Bake.
6. Repeat with Catmull-Rom and a closed Path, and confirm bank/UV
   seam is unchanged by a no-op Auto tangent edit.

[Uploaded plugin review and decision matrix](REFERENCE_PLUGIN_STUDY.md)

## Creator 3.8.8: exact Bézier Split 50% acceptance

1. Select a Path with Bézier interpolation and multiple curved
   segments, including Auto/Aligned/Mirrored tangent modes.
   Save a screenshot of Path and Road before editing.
2. Click **Split 50%** next to Knot 0. Expect a new Knot
   **on the exact curve**, and the Road/Gizmo shape and UV
   arc length should remain unchanged. The two shorter
   segments must reproduce the original cubic curve.
3. Undo once: all affected Knot positions, modes and
   handles return together. Redo once: they split again.
   Selection of the new Knot should not be a separate
   Undo transaction.
4. Close the Path and split its last segment. Check
   continuity around the seam, generator UVs, and the
   originally saved Baked Mesh.
5. Switch to Centripetal/Catmull: **Split 50%** is not shown;
   **+ After** continues to be the non-preserving insertion.
6. Save/Reopen and test on Prefab instances, including
   multiple segments with non-default Roll Degrees.
   Mocked tests do not substitute for these native checks.

## Verify Split → Merge Exact with Road and native Undo

1. Open an authored Bézier Path with a connected Road, choose
   **Split 50%** on a segment. The new Knot should show
   **Merge Exact** in its Inspector card. Record the Road
   centreline, edge UV and bank before the split.
2. Click **Merge Exact** without moving any handle. The old
   curve must return at its original Knot count and preserve
   centreline samples and Road UV/roll. Compare with the
   pre-split saved Scene.
3. Undo once / Redo once to verify full-array native history.
   Open Path endpoints never offer Merge Exact; closed seam
   splitting should offer it for the newly inserted last Knot.
4. Split again, change the middle tangent handle, then check
   that Merge Exact disappears. Undo the handle edit and it
   should reappear. Repeat after changing middle Roll or its
   tangent mode.
5. Save/Reopen and test Prefab Overrides and explicit Bake.
   No automatic Baked Mesh overwrite is authorized; mock
   regression verifies math and serialized dump only.

## Gizmos extension required — fluent HUD migration

Install and enable **Cocos-Gizmos >=3.0.2** (branch `v3`) in
Extension Manager **before** loading this Cocos-Splines test build.
They remain independent installable extensions. The dependency
metadata in the Splines package is checked by our tests, not
automatically installed by Creator. Restart Creator after updates.

1. Select a Spline.Path in the Scene. Verify a single **new fluent
   GizmoHUD** (no overlapping old flat HUD), showing active Knot,
   Local/World position and rotation-space controls, Snap, Roll
   and group commands. Group selection must agree with Inspector.
2. With Bézier or editable Catmull/Centripetal mode, select one
   Knot and move tangent handles, then rotate its pivot-centered
   XYZ tangent rings. Escape must restore mode, both handles and
   preview. Path Node must not rotate; Roll remains independent.
3. Test Planar2D/Spatial3D whole-Node rotation, Local/World
   spaces, snapping, indexed point handles, multi-Knot drag and
   Undo/Redo. No Knot child Nodes should be created.
4. Select Road and Junction: guide drawing uses the shared
   Gizmo SDK adapter without creating Knot controllers. Verify
   Save/Reopen and Prefab Overrides.
5. In a disposable Scene, disable Cocos-Gizmos. Cocos Splines
   must print **one explicit dependency warning**, with no
   legacy HUD fallback. Geometry/Play/Baked still work.

See [Gizmos architecture](GIZMOS_ARCHITECTURE.md).
These are required native Creator 3.8.8 acceptance tests; mocked
CI does not certify actual Editor picking or Undo history.

## Native acceptance — official @registerGizmos migration

This development build removes direct `onGizmo*` methods from
the Cocos Components. The only Scene hooks come from the
Cocos-Gizmos `@registerGizmos(Drawer)` decorator imported from
`db://cocos-gizmos/RegisterGizmos`. Gizmos 3.0.2+ is a **hard
dependency**. Install/enable it first and restart Creator 3.8.8
before enabling Cocos Splines.

1. Select an active Spline.Path: verify one HUD, move and indexed
   points, tangent handles and rotation rings at the selected Knot,
   Roll controls, Local/World, snap and group selection.
2. Move a group of Knots; press Escape mid-drag. Verify both original
   positions, tangent modes, Roll and Road preview are restored.
3. Select a Spline.Road and Spline.Junction: only their read-only
   selected guides should render, no Knot-move HUD.
4. Save and reopen the Scene, Undo/Redo, test Prefab Overrides,
   enter Play and build. No Baked Mesh changes without explicit Bake.
5. Disable Gizmos in a disposable test project. The Asset Database
   should report the required module missing; a silent substitute
   decorator or legacy HUD is **not** supported.

See [GIZMOS_ARCHITECTURE.md](GIZMOS_ARCHITECTURE.md).
Headless CI verifies the registration source, mock callback dispatch
and package presence, but not actual Creator AssetDB import or
native Scene pointer/Undo history.
