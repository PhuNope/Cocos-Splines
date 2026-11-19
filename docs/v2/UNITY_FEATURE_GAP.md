# Unity spline reference parity — source-verified feature audit

Reference files actually inspected (uploaded by project owner):
`Dreamteck.zip`, `SplineArchitect.zip`, `ToolBuddy.zip`.
They are **feature references only**; no third-party source is
vendored, ported verbatim or bundled in Cocos Splines.

## Observed reference capabilities (verified source classes)

| Reference ZIP | Actual source | Distinct feature concept | Cocos Splines status |
|---|---|---|---|
| Dreamteck | `Components/SplineFollower.cs` | Speed and time traversal, loop and ping-pong | **Added** `Spline.Follower` |
| Dreamteck | `Components/SplineProjector.cs` | Nearest-point projection, automatic updates | **Added** `Spline.Projector` |
| Dreamteck | `Components/SplinePositioner.cs` | Place an object at spline percentage or distance | **Partial** via Follower `seek()`, no dedicated editor positioner |
| Dreamteck | `Components/ObjectController.cs` | Object/prefab distribution along a path | **Missing** |
| Dreamteck | `Components/TubeGenerator.cs` & `SurfaceGenerator.cs` | Specialized tube/surface generators | **Partial** via custom Extrude/Road |
| Dreamteck | `Components/SplineTrigger.cs` & `SplineTracer.cs` | Trigger events at spline positions | **Missing** |
| Dreamteck | `Components/ParticleController.cs` | Particle emission along spline | **Missing** |
| Dreamteck | `Components/BoxColliderGenerator.cs` | Collider generation | **Missing** |
| Dreamteck | `Core/IO/CSV.cs`, `SVG.cs` | Spline data interchange | **Missing** |
| ToolBuddy / Curvy | `Scripts/Controllers/SplineController.cs` | Movement and connected-spline switching | **Partial** Follower, no route switching |
| ToolBuddy / Curvy | `Other Components/NearestSplinePoint.cs` | Nearest point, source and target Node | **Added** world-space Projector |
| ToolBuddy / Curvy | `Scripts/CG Modules/ConformPath.cs` | Conform points/path to surface | **Missing** |
| ToolBuddy / Curvy | `Editor/CG/CGGraph.cs` | Node-graph generation authoring | **Missing** |
| SplineArchitect | `Scripts/SplineConnector.cs` | Spline connector relationships | **Partial** road endpoint + Junction tool |
| SplineArchitect | `Scripts/Jobs/NearestPointsSplinesJob.cs` | Nearest-point search between two splines | **Missing** spline-spline proximity |
| SplineArchitect | `Scripts/Editor/EHandleSelection.cs` | Multi-selection authoring | **Partial** existing group Knot editing |

These are **source-supported observations**, not claims of complete
feature parity. The list highlights major differences; the ZIPs
contain additional editor utilities, exporters and generation tools
that have not all been exhaustively specified or ported.

## This increment

1. `Spline.Follower`: authored independent Component; constant speed
   in Path-local units or duration-based traversal, Clamp/Loop/PingPong
   (including large steps and boundary bounces), optional banked
   orientation/offset, opt-in Editor preview, explicit seek/play/pause.
2. `Spline.Projector`: on-demand / continuous nearest-point query;
   bounded coarse search across all original spline segments followed
   by golden-section refinement of promising intervals. Optional
   world-space metric uses the Path's full transform so nonuniform
   scaling does not break distance ordering. No mutation unless
   `snapThisNode` is explicitly enabled.
3. Both use existing immutable `SplineCacheV2`; neither inherits
   Road, writes Baked Mesh or stores child Knot Nodes.
4. Original 0.9.x classes and the obsolete v0.9 Editor, documentation
   and tests were **removed** from the v2.0.0 development branch.

## Follow-up feature tracks

- **High priority:** triggers and distance-based events; follower
  connection traversal via Junction network; object/prefab distribution.
- **Geometry:** terrain conform/snap, specialized tube/shape presets,
  collider output and capped profile sweep.
- **Authoring:** controlled import/export (CSV/SVG), prototype
  positioning, and optional graph UI if it earns its complexity.

The original three ZIPs have source files for these ideas, but
**Cocos implementation must remain original** and use Creator APIs.
Native Creator 3.8.8 Scene, Undo/Redo and Prefab compatibility are
still a separate release gate.
