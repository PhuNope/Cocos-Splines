# Cocos Splines v2.0.0 — implementation status

**Updated:** 2026-11-14 (branch `v2.0.0`). This is a **development / test build**, NOT a GitHub Release.

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
| 11. Editor production hardening | Partial (independent MeshGenerator alpha) | Clean V2 ZIP; SplinePath owns Gizmos v3. Road, Extrude and Mesh Deform each inherit independent shared MeshGenerator for Path subscription, preview and Bake (Extrude/Deform no longer inherit Road). Junction inheritance and real Creator/Undo/lightmap/collider remain. |

| 12. Alpha → Beta → RC → Release | Not started | Explicit user approval required before tag or GitHub Release |

**Editor UX fix (2026-11-14):** Spline V2 custom Inspectors no longer show the giant bottom explanation/status log. Button errors and the explicit ConstantWidth fallback notice go to the Editor Console. For a tight 3-Knot ConstantWidth Road that cannot fit its requested tangent radius, the default `Short Knot Mode = Auto Continuous` rebuilds a single continuous UV strip with locally adaptive width instead of failing. `Strict ConstantWidth` preserves the fit error. Auto fallback is **disabled when Junction Start/End Trim or Road Sidewalk is enabled**, because those require a fixed-width seam. Real Creator viewport validation remains pending.

## Current checkpoint

**Checkpoint 9 / 12 (in progress): Road-length Sidewalk V2 (opt-in) now derives left/right slot-5 bands from exact open ConstantWidth Road curb rings, including trimmed endpoints, U/V longitudinal Road texture and per-vertex flat/Terrain height. An opt-in Junction join mode uses the curb-top lateral tangent to align 3D outer endpoint positions and interpolates Repeat-UV U phase between the matched Road cut edges. All old scenes remain off by default. This is bounded mesh topology only: no automatic road graph/Boolean union, terrain mesh modifications, crossing/accessible ramp certification or actual Cocos Creator visual scene validation.** This is a feature checkpoint, not a percentage of all work. Passing automated CI does **not** constitute real Cocos Creator visual certification.

## Breaking clean rewrite step (2026-11-14)

- The user explicitly authorized dropping legacy `Splines.*`, old component UUID/meta and compatibility/migration code. **The packaged test ZIP** now contains only `assets/splines-v2` and v2-only Editor entrypoints/Inspector/actions, with a self-contained bundle smoke test.
- `SplinePathV2` is now the owning Gizmos v3 edit target. Linked `SplineRoadV2` hides its old Knot handles and receives Path editor updates via registered consumers. The Path has its own Scene HUD and indexed multi-Knot points.
- The repository still contains historical 0.9.x sources for reference, and the rewritten pure geometry modules are retained. Do not mistake a clean package for completion of all roadmap milestones. Actual Creator 3.8.x Undo/Redo/visual validation is outstanding.
- [Breaking rewrite charter / implementation plan](REBUILD_BREAKING.md).

## Latest editor step (2026-11-14)

- `SplinePathV2` may own Knots/interpolation/closed. `SplineRoadV2.pathSource` uses it when linked; Road's previous self-owned Knot fields are still supported when absent.
- Dragging Cocos-Gizmos v3 handles triggers throttled live **transient** preview updates (default 100 ms). `end`/`cancel` force a final rebuild; invalid in-progress bends leave last valid preview visible. Persisted baked mesh remains unchanged until explicitly rebaked.
- Multiple Roads registered to the same SplinePath receive Editor live-preview invalidations. Validation is from automated Cocos mocks/geometry regression, not visual Cocos Creator 3.8.x certification.
- Remaining architecture: adapt Extrude/Mesh Deform, test Node Transform edits from native gizmos, cross-Node Undo/Redo and scene save/reload.

## Next recommended implementation

**Checkpoint 9, next:** certify the Road-to-Junction sidewalk seam in a real Creator 3.8.x Scene (including yaw, component import, material slot 5, foot/curb normals, save/reopen, re-Bake and Collider). Then implement network adjacency/automatic snapping, terrain mesh Boolean stitching and corner crossings. Current joins require user-linked 3-/4-way Roads with identical apron configuration and no node scale; banked intersections remain unsupported.

## Non-negotiable release gate

Keep `v2.0.0` as the development branch. No tags and no GitHub Releases without explicit user confirmation. Emit Editor-only warnings, never noisy runtime authoring logs. No automatic migration of legacy UUIDs/scenes.
