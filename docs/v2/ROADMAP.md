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
