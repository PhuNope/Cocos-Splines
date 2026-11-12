# Cocos Splines v2.0.0 — implementation status

**Updated:** 2026-11-12 (branch `v2.0.0`). This is a **development / test build**, NOT a GitHub Release.

| Milestone | Implementation | Validation / remaining limit |
| --- | --- | --- |
| 1. Core spline / frame / curve caches | Implemented | Core regression exists; extreme cusp/degenerate-frame hardening remains |
| 2. Road surface + extrusion + material bands | Implemented | Road UV, profile, shoulder, curb, multi-material, fingerprints, glTF Bake testable |
| 3. Tight-corner Road algorithm | Implemented | ConstantWidth tangent fillets, Continuous width fit, Clip; exact 3-Knot regression; real Cocos painted-material scene still pending |
| 4. Adaptive sampling + UV modes | Implemented | Angle/chord subdivision, UV U/V, Physical/Legacy, UV2; real material render still pending |
| 5. Source Mesh Deform | Experimental implementation | Read authored UV0/UV2 and multi-submesh, repeat, Bake; real Creator FBX/glTF CPU import and normal-map certification pending |
| 6. Flat 3-/4-way Junction | Implemented (alpha) | Start/End Trim, edge-ring matched UV0, flat asphalt, separate glTF Bake |
| 7. Junction Markings | Implemented (alpha) | Independent stop bars, zebra and explicit visual turn guides; no traffic-rule/arrow solver |
| **8. Flat Junction Shoulder/Curb** | **Implemented this step (alpha)** | Full end-ring shoulder+curb material/UV match, taper into flat junction; needs real Creator shader/scene validation |
| 9. Junction 3D / sidewalks | In progress (gentle grade + rounded curb + lowered corner + sidewalk apron alpha) | Opt-in separate slot-5 outer sidewalk apron reaches an explicit level terrain-edge Y; slope/UV/Bake tests added. No real Terrain sampling, full city CSG, banked ramp or real Creator certification |
| 10. Lane graph / traffic tools | Not implemented | Lane arrows, legal turns, collision avoidance, junction signal/priority and vehicle routing |
| 11. Editor production hardening | Partial | Actual Creator 3.8.x import-save-reopen-Play certification, lightmap UV atlas, collider adapter, gizmos and workflow UX |
| 12. Alpha → Beta → RC → Release | Not started | Explicit user approval required before tag or GitHub Release |

## Current checkpoint

**Checkpoint 9 / 12 (in progress): opt-in rounded curb with optional lowered corner ramps now also supports a separate local sidewalk apron strip (material slot 5) from each curb outer edge to a specified local terrain plane. Road-end ring positions/UV0 remain untouched and UV2/Bake are generated. This is a planar-height adapter, NOT heightmap sampling, city sidewalk Boolean union or accessibility-certified pedestrian ramp. Full checkpoint 9 remains open: terrain/road network boundary CSG, banked ramps, mixing gentle grades and rounded curbs, physics and actual Cocos Creator certification.** This is a feature checkpoint, not a percentage of all work. Passing automated CI does **not** constitute real Cocos Creator visual certification.

## Next recommended implementation

**Checkpoint 9, next:** certify the rounded-curb + sidewalk-apron composite in a real Cocos Creator 3.8.x Scene (material slot 5, normals, terrain Y alignment, reimport/Baked Play, collider), then build a real Terrain-height sampling adapter and network-wide outer sidewalk boundary. Treat the current manual terrain height as a test-only interface, never an automatically watertight terrain join; banked intersections remain unsupported.

## Non-negotiable release gate

Keep `v2.0.0` as the development branch. No tags and no GitHub Releases without explicit user confirmation. Emit Editor-only warnings, never noisy runtime authoring logs. No automatic migration of legacy UUIDs/scenes.
