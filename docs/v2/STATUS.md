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
| 9. Junction 3D / sidewalks | In progress (gentle grade + rounded curb alpha) | Opt-in continuous flat curb corner top/wall (all Road branches must have curb), and separately opt-in gentle grade; the two modes are not yet combined; city sidewalk CSG, banked ramps and real Creator test remain |
| 10. Lane graph / traffic tools | Not implemented | Lane arrows, legal turns, collision avoidance, junction signal/priority and vehicle routing |
| 11. Editor production hardening | Partial | Actual Creator 3.8.x import-save-reopen-Play certification, lightmap UV atlas, collider adapter, gizmos and workflow UX |
| 12. Alpha → Beta → RC → Release | Not started | Explicit user approval required before tag or GitHub Release |

## Current checkpoint

**Checkpoint 9 / 12 (in progress): gentle longitudinal grade and flat rounded continuous curb-corner bands are now separate opt-in alpha features. Rounded curb replaces curb-to-center taper with joined vertical walls and upper bands across each gap (3-/4-way). Full checkpoint 9 is NOT complete: independent city sidewalk outer-boundary CSG, banked ramps, blending grade + curb, and real Creator certification remain.** This is a feature checkpoint, not a percentage of all work. Passing automated CI does **not** constitute real Cocos Creator visual certification.

## Next recommended implementation

**Checkpoint 9, next:** certify rounded curbs with real Creator materials, viewport lighting, save/reopen and collision; then implement full outer sidewalk network boundaries, curb ramps and terrain joins. Combine safe grades + rounded curbs only after geometry/topology tests; banked intersections remain unsupported.

## Non-negotiable release gate

Keep `v2.0.0` as the development branch. No tags and no GitHub Releases without explicit user confirmation. Emit Editor-only warnings, never noisy runtime authoring logs. No automatic migration of legacy UUIDs/scenes.
