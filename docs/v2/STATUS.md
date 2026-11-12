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
| 9. Junction 3D / sidewalks | In progress (Road sidewalk + Junction join alpha) | Opt-in Road-length left/right sidewalk bands from exact trimmed curb rings; Junction can phase-match outer Road sidewalk seams, flat/Terrain samples, UV0/UV2/glTF. Real Cocos 3.8 Editor certification, crossings/CSG and terrain cuts remain |
| 10. Lane graph / traffic tools | Not implemented | Lane arrows, legal turns, collision avoidance, junction signal/priority and vehicle routing |
| 11. Editor production hardening | Partial | Actual Creator 3.8.x import-save-reopen-Play certification, lightmap UV atlas, collider adapter, gizmos and workflow UX |
| 12. Alpha → Beta → RC → Release | Not started | Explicit user approval required before tag or GitHub Release |

## Current checkpoint

**Checkpoint 9 / 12 (in progress): Road-length Sidewalk V2 (opt-in) now derives left/right slot-5 bands from exact open ConstantWidth Road curb rings, including trimmed endpoints, U/V longitudinal Road texture and per-vertex flat/Terrain height. An opt-in Junction join mode uses the curb-top lateral tangent to align 3D outer endpoint positions and interpolates Repeat-UV U phase between the matched Road cut edges. All old scenes remain off by default. This is bounded mesh topology only: no automatic road graph/Boolean union, terrain mesh modifications, crossing/accessible ramp certification or actual Cocos Creator visual scene validation.** This is a feature checkpoint, not a percentage of all work. Passing automated CI does **not** constitute real Cocos Creator visual certification.

## Next recommended implementation

**Checkpoint 9, next:** certify the Road-to-Junction sidewalk seam in a real Creator 3.8.x Scene (including yaw, component import, material slot 5, foot/curb normals, save/reopen, re-Bake and Collider). Then implement network adjacency/automatic snapping, terrain mesh Boolean stitching and corner crossings. Current joins require user-linked 3-/4-way Roads with identical apron configuration and no node scale; banked intersections remain unsupported.

## Non-negotiable release gate

Keep `v2.0.0` as the development branch. No tags and no GitHub Releases without explicit user confirmation. Emit Editor-only warnings, never noisy runtime authoring logs. No automatic migration of legacy UUIDs/scenes.
