# Cocos Splines 2.0 — execution milestones

- [x] Branch `v2.0.0`, safe CI workflow (no publishing), isolated v2 core bootstrap.
- [x] Core 2 foundation: immutable segment cache, rotation-minimizing 3D frames, centripetal Catmull-Rom, quarter-point adaptive arc length, seeded fuzz tests.
- [ ] Core 2 hardening: high-curvature extrema, cusp and zero-length frame policy, adaptive frame subdivision and Editor integration.
- [ ] Mesh Pipeline 2: shared multi-submesh/material geometry, UV0/UV2, tangents, normals, chunking and collider support.
- [ ] Road/Extrude/Profile 2: replace legacy geometry with reusable mesh pipeline; precise profiles, helix, steep bends and corners.
- [ ] Editor bake: AssetDB-backed Mesh Assets with persisted references, Dynamic/Manual/Baked modes, preview and stale asset detection.
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
