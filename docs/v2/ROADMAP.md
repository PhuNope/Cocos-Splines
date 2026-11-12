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
- [ ] Elevated/banked Junction ramps, continuous sidewalk/curb perimeter and real 3.8.x Editor save/reimport certification.
- [x] Junction paint geometry: stop bars, zebra crossings and explicit visual turning guides (not automatic lane topology).
- [ ] Traffic-aware arrows, route rules, lane graph and signal/priority logic.
- [ ] Automated trim management and multi-road endpoint snapping; current authoring is explicit per Road.

- [x] Junction Markings v2 alpha: optional white stop bars, white zebra stripes, explicit curved turn-guide routes, separate slot 3/4, UV0/UV2, glTF Bake.
- [x] Per-branch paint eligibility and Inspector controls; paint placement validated inside flat Junction polygon.
- [ ] Lane arrows, vehicle lane graphs and rule-aware traffic control; turn guides currently visual-only explicit pairs.
- [ ] Visually verify paints/materials, scene save/reimport and winding in actual Cocos Creator 3.8.x Editor.
