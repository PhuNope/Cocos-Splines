# Cocos Splines v2 — Native Cocos-Gizmos v3 integration (alpha)

- **Gizmos SDK:** [PhuNope/Cocos-Gizmos, branch `v3`](https://github.com/PhuNope/Cocos-Gizmos/tree/v3), inspected at commit `184ce3ed6bfce429bcce8c795964da276ee82c81`.
- **Splines:** `PhuNope/Cocos-Splines` branch `v2.0.0`. Test builds only; no tag/release.

## Direct v3 API (not the old Cocos-Gizmos v2 adapter)

Cocos-Gizmos `v3` installs `globalThis.Gizmos3D` in its **Editor Scene** process in `scene.js`.
Its `ExecuteGizmos` auto-discovers enabled Components implementing
`onDrawGizmosSelected` or `onGizmoHandles`. No `@registerGizmos` is required for the Component-hook API.
Do **not** import legacy `db://assets/CompanyCore/Gizmos/`, `dist/Gizmos3D`, or
assign `__SplineGizmosV3`. A separately installed v3 extension owns the Editor
renderer; the Spline scripts have **no hard runtime dependency** on the package.

The optional Spline bridge checks the real v3 global only when drawing/handling in
the Editor and directly invokes
`Gizmos3D.beginColor(node,color)`,
`Gizmos3D.drawLine(node,worldA,worldB)`,
`Gizmos3D.drawSphere(node,worldPosition,radius,...)`, and
`Gizmos3D.move('gizmoKnotPosition', {space:'local', ...})`.

## Road Scene guides and movable Knot

- **Road onDrawGizmosSelected:** bounded centerline, approximate full-width curb/shoulder rails, actual Knot markers, trim caps; no mesh creation or serialized writes.
- **Road onGizmoHandles:** optional `Gizmos3D.move` XYZ arrows and XY/XZ/YZ planes for **one active Knot**. Select `Gizmo V3 Knot Index` (0-based), enable `Gizmo V3 Edit Knot`.
- **Multi-Knot Points (new, opt-in):** enable `Gizmo V3 Multi Knot Points`. Other Knots get small pickable camera-plane point handles, limited by `Gizmo V3 Point Limit` (2..32, default 16). Native SDK reads `gizmoKnotPositions[index]`, an Array-compatible `Vec3[]` Proxy; writes go to the **existing Knot Node** at that index, not a second serialized vertex array. Active Knot retains all six Move axis/plane handles.
- **Native Scene HUD:** once `Gizmo V3 Edit Knot` is enabled, `onGizmoHudControls()` exposes an **Active Knot** integer slider and an **Other Knots** toggle. SDK writes only the serialized UI settings; moving handles still writes the Knot Nodes.
- **Stable drag target:** `onGizmoChanged(begin/end/cancel)` pins the original Knot Node during a gesture. Changing the Inspector active index or reordering the Knot array while dragging does not redirect the ongoing write or its Escape rollback. Editing mode and multi-points remain off by default.
- The dynamically resolved `gizmoKnotPosition` Vec3 getter/setter and indexed `gizmoKnotPositions[index]` Proxy read and write source **Knot Node world positions**, transformed through the Road's local/world matrices. Neither is a serialized point list. During Escape, v3 writes the rollback Vec3 through the same mapping, restoring the source Node.
- **Junction onDrawGizmosSelected:** branch center, exact trimmed Road ring bars and curb endpoints from linked Road profiles; no new geometry and no runtime writes.
- **Missing Gizmos:** these drawing/handle hooks produce no errors or dependencies when Cocos-Gizmos is absent.
- **Play:** Editor-only guard prevents Gizmos handles and knot setter writes in Play/Preview.
- Viewport guides capped at 600 lines + 128 dots and avoid allocating Cocos `Color` until an Editor drawing callback.

**Important:** Gizmos v3's drag command groups begin/update/end/cancel for the bound property. Here that property is a live proxy to a **different Node**, so complete native cross-Node Undo/Redo integration must be verified in the actual Cocos Creator 3.8.x Editor. The automated test validates get/write/rollback and no-Play writes, not Undo history.

## Try it in Creator 3.8.x

1. Install/enable **Cocos-Gizmos v3** and **Cocos-Splines v2.0.0 Test Build** in a disposable Creator project (Project extension preferred to Global for repeatable setup). Refresh the Scene.
2. Select a Road with three Knot Nodes. With `Show Scene Gizmos V3=true`, view the cyan centerline, green width guides and orange Knot points.
3. Turn on `Gizmo V3 Edit Knot`, set `Gizmo V3 Knot Index=1`; drag X/Y/Z arrows and XY/XZ/YZ plane handles. Confirm the **original Knot Node** moves, spline guides update, and no extra Knot is created.
4. Enable **Gizmo V3 Multi Knot Points**, set **Gizmo V3 Point Limit** to 8–16, and drag a non-active Knot's point handle. It should update that Knot without moving the active Knot. Repeat with three and ten Knots, then try switching **Gizmo V3 Knot Index** while an active drag is held; release or Escape should apply only to the original Knot.
5. Press **Escape while dragging**; verify the Knot is restored. Commit a drag, then test Editor **Undo/Redo**, save, close/reopen and repeat. If Undo does not restore the Knot Node, disable `Gizmo V3 Edit Knot` and edit the actual Knot Node with standard Transform gizmos until that transactional edge case is resolved.
6. Select a linked 3-/4-way Junction; check trimmed Road rings and curb markers. Toggle the Junction settings and invalid Road links.
7. In Manual/Baked Play, ensure zero Gizmos rendering calls, zero proxy writes, no procedural mesh generation. If you change Knots, explicitly **Rebuild Preview / Bake glTF Asset** to update the rendered surface; selection Gizmos do not automatically Bake mesh.

## SDK references

- [Cocos-Gizmos v3 README](https://github.com/PhuNope/Cocos-Gizmos/blob/v3/README.md)
- [Callbacks and undo/cancel lifecycle](https://github.com/PhuNope/Cocos-Gizmos/blob/v3/docs/CALLBACKS.md)
- [Move API and descriptor semantics](https://github.com/PhuNope/Cocos-Gizmos/blob/v3/docs/MOVE_GIZMO.md)
- [Editor Scene auto-discovery](https://github.com/PhuNope/Cocos-Gizmos/blob/v3/source/ExecuteGizmos.ts)
- [Native v3 scene.js global installation](https://github.com/PhuNope/Cocos-Gizmos/blob/v3/scene.js)

Still pending: real Cocos Creator 3.8.x visual certification, native cross-Node Undo/Redo history, 3D tangent controls (current spline Knots have position-only sources), full Sidewalk networking / Terrain Boolean joins.
