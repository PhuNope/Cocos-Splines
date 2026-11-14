# Cocos Splines 2.0 — execution milestones

- [x] Branch `v2.0.0`, safe CI workflow (no publishing), isolated v2 core bootstrap.
- [x] Core 2 foundation: immutable segment cache, rotation-minimizing 3D frames, centripetal Catmull-Rom, quarter-point adaptive arc length, seeded fuzz tests.
- [ ] Core 2 hardening: high-curvature extrema, cusp and zero-length frame policy, adaptive frame subdivision and Editor integration.
- [x] Mesh Pipeline 2 data foundation: multi-submesh/material slot, UV0/UV2, tangent normals, 16-bit chunking, collider triangle soup, fingerprints, seeded/large mesh regression.
- [ ] Mesh Pipeline 2 Cocos integration: MeshRenderer/material binding, UV2 attribute layout, persisted editor asset and physics collider adapter.
- [x] v2 Road strip vertical slice: pure geometry builder, Cocos component with Inspector preview and glTF Bake export, safe Manual/Baked Play gate.
- [x] Road/Extrude/Profile v2 vertical slice: material-banded shoulders/curbs, convex-cap tube extrude, and safe AssetDB unique-Mesh auto-bind with retry; mock lifecycle and import tests.
- [x] Inspector UV0 Longitudinal Axis U/V for Road, shoulders/curbs and Extrude (UV2 preserved, Bake fingerprint changes).
- [x] Road v2 local JoinAndTrim corner correction, pinched section diagnostics, Inspector Show Baked Mesh, bake/preview lifecycle tests.
- [x] Planar same-road overlap clipping for U-turns (first-surface-wins, UV0/UV2 interpolation, Editor diagnostics, safety caps).
- [x] Phase-consistent UV0 stitching at planar cut borders (U/V repeat, shared-material vertices), preserving UV2 and Bake fingerprint.
- [ ] Junction-aware lane markings/decal topology for truly crossing road strips.
- [x] Continuous Road surface mode: adaptive inner width, uncut spline UV0/UV2, U/V axis, shoulder/curb, editor diagnostics.
- [ ] Arbitrary spline self-crossing topology and fixed-width junction-aware lane markings.
- [ ] Road/Extrude/Profile hardening: sharp corner trimming, junctions, advanced profiles, editor-generated lightmap UV atlas, and actual Creator 3.8.x integration tests.
- [x] Editor Bake candidate: glTF AssetDB export, unique Mesh subasset binding and scene-serialized reference/fingerprint, explicit pending/retry; mock verification only.
- [ ] Editor Bake certification: real Cocos 3.8.x import/save/reopen/Play test, material/UV2 validation and collision integration.
- [ ] Network + Junction Geometry 2: linked endpoints, trim Road mesh, triangulation and matching UV, flat junction first.
- [ ] Modular snapping/placement + follower/train traffic helpers, pooling and optional modifiers.
- [ ] Editor/Inspector/Gizmos, interactive HTML docs, upgrade/export guidance and Cocos 3.8.x Editor verification.
- [ ] Alpha/Beta/RC validation and user-approved tag/Release only.

## Required gates

- No forced v0.9.x serialization migration; protect old `main` release instead.
- Profile/UV/geometry regression tests; validate asset persistence and scene reload in real Cocos Editor.
- No duplicate mesh, memory leaks or rebuild in Baked mode during Play.
- No runtime diagnostics that are only useful for authoring; use Editor-only warnings.
- All authoring controls remain in Inspector, not a separate graph editor panel.

- [x] Real 3-Knot curve regression: local curvature width limits, rounded conservative width envelope, UV0 centreline vertex, U/V and UV2 preservation (TypeScript test).
- [ ] Confirm in real Cocos Creator 3.8.x Editor against the original asphalt material and screenshot.

- [x] Fix plain Road component missing Continuous option propagation (Inspector/geometry mismatch).
- [x] Angle + chord-error adaptive frame sampling for Road/Profiles; Cocos Inspector controls.
- [x] Selectable physical-width UV0 compensation versus legacy authored cross UV, UV2 unchanged.
- [x] Optional separated white center dashes and yellow edge-line geometry, multi-material glTF Bake, both plain and profile Roads.
- [ ] Mesh-source deformation Road mode based on SplineArchitect, after Creator 3.8.x source-mesh readback integration testing.
- [ ] Junction-aware dashed lanes, paint intersections and material auto-creation.

- [x] Constant Width tangent circular/Bezier fillets for road geometry and constant physical UV cross section.
- [x] Short-Knot UX: typed insufficient-radius/spacing error; Road component `Auto Continuous` (default) falls back to UV-continuous width fitting on ordinary unlinked Roads; strict option and Junction/sidewalk geometry remain fail-closed. Inspector V2 removes bottom text/log, routes explicit button errors to Editor Console.
- [x] Exact 3-Knot regression: no triangle culling, UV0 U/V & UV2, material bands, marking strips, glTF export.
- [x] Safe failure when Knot spacing cannot fit full-width fillet radius; Editor-only diagnostics.
- [ ] Visual confirmation with the actual Cocos Creator 3.8.x scene and painted asphalt material.
- [ ] Global road-road self-intersection Boolean/junction topology (not part of local fillet).

- [x] Source Mesh Deform v2 (experimental): import readable Cocos Mesh, preserve authored UV0/UV2, normals and material slots, optional repeat/UV phase, X/Z length axes.
- [x] Separate `SplinesV2.SplineMeshDeform` component and Inspector using existing Manual/Dynamic/Baked lifecycle, editor-only preview and glTF Bake.
- [ ] Visual certification against real Creator 3.8.x source mesh with imported FBX/glTF CPU readback, normal maps, lightmap UV and reimport.
- [ ] Source-mesh geometry adaptive subdivision and UV2 unwrap after tiling; current generator deforms original vertex tessellation only.

- [x] Flat Junction Patch v2 alpha: exact end-ring matched 3-/4-way Road trims, Repeat-phase UV0, material slot 0, deterministic UV2 and glTF Bake.
- [x] V2 Inspector branches and Start/End Trim properties, independent Manual/Dynamic/Baked lifecycle and Editor-only validation.
- [x] Flat Junction Shoulder/Curb transition bands (alpha; exact 3D end-ring seam and UV0, 0/1/2 material slots, low curb lip tapers inward).
- [x] Opt-in gentle longitudinal Junction grade (up to 0.35 slope ceiling, default max 0.15), with flat-default compatibility, seam-preserving boundary and sloped normals; unit tests only.
- [x] Flat Junction Rounded Curb Corner (opt-in alpha): per-corner continuous top and vertical wall arcs, non-tapering inner shoulder/asphalt boundary, source Road exact UV0 seam; 3-/4-way regression.
- [x] Selected flat rounded-curb lowered corners (alpha): explicit adjacent Road pairs, smooth top depression and positive residual lip, slope safety, unchanged Road seam UV0/UV2, glTF Bake regression. Not a complete or standards-certified pedestrian ramp.
- [x] Opt-in local corner sidewalk apron (alpha): create separate slot-5 UV surface from rounded curb outside edge to a specified, flat local terrain height with safe cross slope, original Road-end seam intact, UV2/fingerprint/glTF regressions.
- [x] Optional Cocos Terrain 3.8 height sampling at each outer corner apron vertex during explicit Rebuild/Bake. Junction-local ↔ Terrain-local coordinates, null/out-of-bounds rejection, cross/edge slope checks, UV0/UV2 and glTF regression.
- [x] Opt-in Road-length Sidewalk (alpha): extract exact outer curb-top rings from trimmed open ConstantWidth Road; generate left/right slot-5 bands with flat or linked Terrain per-vertex edge Y; retain existing Road UV0/UV2, material slots and Bake workflow.
- [x] Opt-in Junction "Join Road Sidewalks" (alpha): match Road/Junction apron outer endpoints in XYZ using source curb lateral direction and matched UV0 U-phase modulo whole Repeat tiles; reject unmatched widths/Terrain modes, absent source stations and scaled nodes. 3-/4-way real-Road geometry tests; no automatic network graph/CSG.

- [ ] Full sidewalk network Boolean joins, Terrain triangulation/heightmap editing, vehicle/pedestrian ramp cross-section standards and real Editor scene certification; outer boundary touching sampled Terrain is NOT terrain mesh CSG.
- [x] Read-only selected Scene Gizmo guides for v2 Road/Junction: bounded curve/border/trim/curb visualization via optional SDK drawing interface; no new mesh or Play work, regression tests.
- [x] Integrate Gizmos SDK drawing callbacks and Move handles on `SplinePathV2`; Road/Junction draw **read-only** geometry guides. Path owns begin/update/end/cancel and indexed Knot rollback, with no Road-owned handle or position proxy.
- [x] Optional Gizmos multi-Knot pickable points via its native indexed Vec3[] descriptor API, now bound to serialized Vec3 Knot records, with stable record pinning and Escape rollback regression. Active XYZ handle and HUD index slider; gizmo allocation bounded 32.
- [x] Gizmos live Road mesh preview: throttle transient rebuild during `onGizmoChanged(update)`, force end/cancel, keep prior mesh on invalid geometry, do not Bake or generate in Play; regression.
- [x] Enforce **required SplinePath source** on Road, Extrude and Mesh Deform. Road no longer serializes Knots/interpolation/closed or exposes active Knot Gizmos/HUD. Junction samples Road end rings through each Road's linked Path. Clean test ZIP has no legacy script/UUID requirement.
- [x] Share `SplineMeshGeneratorV2` lifecycle across independent Road, Extrude, Mesh Deform and Junction. Path subscribes previews and **observes native Knot Transform/Inspector edits** at bounded Editor tick rate; settle forces the final mesh after idle. Regression covers two linked Roads, Play guard and throttled rebuild.
- [x] Path Bézier tangents in serialized Knot records: Auto, Free, Aligned, Mirrored modes, Path-local In/Out point handles, separate colored guide rails, Path→generator transforms, Escape snapshot restoration and Road Bake regression.
- [x] Replace `SplinePathV2` Knot Nodes with pure, Path-local serializable `Vec3` Knot records; move tangent modes into each record; make Road/Junction consume correctly transformed world endpoints; add Path-only custom Inspector and topology commands.
- [x] Integrate native Gizmos 2D Z and 3D XYZ Rotate presets on selected Path Node, angle snap and Escape rollback, without misrepresenting the Node-origin SDK ring as a Knot pivot.
- [x] Serialize per-Knot Roll Degrees and interpolate shortest signed roll on rotation-minimizing frames. Preserve bank values in the immutable cache and through Road and Mesh Deform fillet sampling; add Road mesh/UV/Bake and seam regression.
- [x] Expose live per-Knot bank via native Gizmos HUD roll slider: pin record during drag, throttle linked previews, force End/Cancel, Escape rollback and guard Play/runtime. Draw banked Right/Up cross-section guide on the exact Knot station; headless regression.
- [x] Route custom Path Knot topology buttons through Creator's native `query-node` typed property dumps + `scene.set-property(record:true)`, replacing untracked Scene-script mutation; no-op/active-index edits do not add history steps. Add Cocos dump planner and replay regressions.
- [x] Clear stale Path Knot/Roll/Gizmos edit references on restore and rebind restored generator Path Source while preserving the baked asset; Cocos mock regression.
- [ ] Certify native Creator Undo/Redo, scene save/reopen, cross-Node Gizmos transaction rollback and real gizmo picking (mocks alone are insufficient).

- [ ] Certify Gizmos Knot drag, cross-Node Undo/Redo, gizmo picking, save/reopen, material and viewport rendering in real Creator 3.8.x. No verified production certification yet.

- [ ] Full city sidewalk Boolean/outer perimeter, crossing/terrain seams, and banked Junction ramps; real Cocos Creator 3.8.x save/reimport certification.
- [x] Junction paint geometry: stop bars, zebra crossings and explicit visual turning guides (not automatic lane topology).
- [ ] Traffic-aware arrows, route rules, lane graph and signal/priority logic.
- [x] Experimental read-only three-/four-way Junction Auto Trim planner (world-space endpoint matching, curvature-aware directions, angle/width/remaining-length budgets), Creator-recorded Apply action and Inspector Check/Apply buttons. No Knot changes, no automatic snapping, no Boolean mesh union.
- [ ] Automated multi-road endpoint snapping, network adjacency graph, grouped native Creator Undo certification and Junction mesh Boolean resolution.

- [x] Junction Markings v2 alpha: optional white stop bars, white zebra stripes, explicit curved turn-guide routes, separate slot 3/4, UV0/UV2, glTF Bake.
- [x] Per-branch paint eligibility and Inspector controls; paint placement validated inside flat Junction polygon.
- [ ] Lane arrows, vehicle lane graphs and rule-aware traffic control; turn guides currently visual-only explicit pairs.
- [ ] Visually verify paints/materials, scene save/reimport and winding in actual Cocos Creator 3.8.x Editor.

## Scene Network & Endpoint Snap alpha (2026-11-15)

- [x] Pure, Cocos-independent Road endpoint proximity graph: stable hubs with strict all-pairs tolerances (no transitive chain merging), detects 2-/3-/4-way linked endpoints without changing nodes.
- [x] Bounded Editor Scene scan up to 256 candidate Roads / 10000 Nodes, skipping unsupported or incomplete Road Paths with diagnostics only on explicit **Check Road Network**.
- [x] Junction **Check Endpoint Snap**: preflight 3/4 distinct Roads and distinct Path sources, explicit At End, max displacement, elevation tolerance, adjacent endpoint direction, finite values; target is Junction Node world center transformed into each Path-local Vec3.
- [x] **Apply Endpoint Snap**: Creator recorded typed Knot CCClass array dumps, preserves tangent modes/offsets, Roll and custom metadata, no-op skip, per-Path preview refresh, baked Mesh unchanged.
- [x] Planner/test dump history replay regressions and clean test bundle wiring.
- [ ] Native Creator Undo/Redo per Path + Prefab override certification, Scene Save/Reopen, real SDK Gizmos and painted material seam validation. **Multiple Paths are separate Undo entries**, not one atomic transaction.
- [ ] Automatic connection assignment/graph serialization, collision-safe multi-Junction consensus, horizontal tangent alignment, shared-Path fan-out resolution, 3D banked intersection topology and junction-aware lane routing.
