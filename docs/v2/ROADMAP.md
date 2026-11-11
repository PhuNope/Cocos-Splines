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
