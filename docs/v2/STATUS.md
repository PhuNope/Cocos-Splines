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
| 9. Junction 3D / sidewalks | In progress (gentle grade + rounded curb + lowered curb corner alpha) | Optional Road-pair curb top depressions with max slope/lip checks, exact UV seams and Bake tests; no accessible sidewalk connector, city CSG, banked ramp, or real Creator certification yet |
| 10. Lane graph / traffic tools | Not implemented | Lane arrows, legal turns, collision avoidance, junction signal/priority and vehicle routing |
| 11. Editor production hardening | Partial | Actual Creator 3.8.x import-save-reopen-Play certification, lightmap UV atlas, collider adapter, gizmos and workflow UX |
| 12. Alpha → Beta → RC → Release | Not started | Explicit user approval required before tag or GitHub Release |

## Current checkpoint

**Checkpoint 9 / 12 (in progress): flat rounded continuous curb-corner bands can now optionally lower individual exterior Road-pair corners (short positive curb lip, bounded transition slope). Gentle longitudinal grade remains a separate opt-in mode. This is mesh-only alpha and NOT a pedestrian-accessibility/sidewalk certification. The entire checkpoint 9 is NOT complete: outer sidewalk/terrain boundary CSG, banked ramps, mixing grade + rounded curbs, physics and real Cocos Creator certification remain.** This is a feature checkpoint, not a percentage of all work. Passing automated CI does **not** constitute real Cocos Creator visual certification.

## Next recommended implementation

**Checkpoint 9, next:** certify rounded curbs and lowered corners with real Cocos Creator 3.8.x materials, normals, UV wrap, editor save/reopen and collider adapter. Then implement real outer sidewalk-to-Road/terrain boundary and certified ramp cross-section rather than treating a lowered curb lip alone as a traversable pedestrian connector. Banked intersections remain unsupported.

## Non-negotiable release gate

Keep `v2.0.0` as the development branch. No tags and no GitHub Releases without explicit user confirmation. Emit Editor-only warnings, never noisy runtime authoring logs. No automatic migration of legacy UUIDs/scenes.
