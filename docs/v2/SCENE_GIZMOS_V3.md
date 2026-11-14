# Cocos Splines v2 — Scene Gizmos v3 compatibility (alpha)

**Branch:** `v2.0.0` test-only. No tag/release. This is an optional drawing adapter, not a vendored Gizmos SDK.

## Implemented
- `SplineRoadV2.onDrawGizmosSelected()`: bounded centerline, approximate full width rails, trim caps, existing Knot markers. The preview uses spline cache/frames and never generates `cc.Mesh`, never edits Knot data.
- `SplineJunctionPatchV2.onDrawGizmosSelected()`: 3-/4-way junction center, exact trimmed Road ring, optional curb profile ends. Only selected, no runtime log or on-play builder.
- `SplineGizmoV3Bridge`: accepts `beginColor(owner, color)`, `drawLine(owner,a,b)`, optional `drawSphere(owner,p,radius,...)`. All positions passed to the backend are **WORLD-space**. Uses lazy `Color` allocations only during Editor draws.
- Missing SDK or disabled/invalid geometry => no drawing and no thrown exception. Renderer calls bounded (600 segments/128 markers). No serialized UUID migrations.
- Inspector: Road `showSceneGizmosV3`, `gizmoV3Steps`, `gizmoV3Edges`, `gizmoV3Knots`. Junction `showJunctionSceneGizmosV3`, `gizmoV3JunctionCurbs`.

## Optional SDK bridge
This repository **does not contain the source or declaration of the user's Gizmos v3.0 package**. The known usage samples involve `registerGizmos` and `Gizmos3D.beginColor/drawLine/drawSphere`, but the compatibility of a specific **v3.0 registration/decorator** is **not certified**.

If your game project actually has `db://assets/CompanyCore/Gizmos/Gizmos3D` installed and its v3 API is still compatible with those method signatures, an **Editor-only project-local integration** can assign the module to `globalThis.__SplineGizmosV3`:

```ts
// Example only — keep this in the GAME PROJECT with the separately installed SDK.
// Do not add a hard db:// dependency to the reusable Spline extension.
import Gizmos3D from 'db://assets/CompanyCore/Gizmos/Gizmos3D';
import {EDITOR_NOT_IN_PREVIEW} from 'cc/env';
if (EDITOR_NOT_IN_PREVIEW)
    (globalThis as unknown as {__SplineGizmosV3?:typeof Gizmos3D}).__SplineGizmosV3 = Gizmos3D;
```

Or a compatible SDK may publish `globalThis.Gizmos3D` (legacy fallback). You must ensure its own scene callback/registration system actually invokes `onDrawGizmosSelected()`. If v3 changed the decorator or drawing argument order, update the bridge **after inspecting its actual SDK**. The sample above alone does *not* guarantee Creator will invoke custom callbacks.

## Manual test in Cocos Creator 3.8.x
1. Install both the extension and your Gizmos package in a disposable project. Configure its documented component registration, and enable the optional bridge. Restart/refresh the Scene editor.
2. Select an open 3-knot Road using ConstantWidth + two trimmed Junction-end Roads. Verify road centerline and full-width guides; move the **Knot Nodes using Cocos's normal transform gizmos**, not by clicking the preview.
3. Select a 3-/4-arm Junction. Inspect exact trim/cut bars and curb endpoint markers. Keep `gizmoV3JunctionCurbs=true` when checking curb paths.
4. Turn visibility off, choose Manual/Baked, Play and check there is **no Gizmo-derived mesh generation or runtime warning**. Save/reopen the scene and check the serialized Knot values and baked fingerprint remain identical.
5. Add 100+ knots / very long Road: ensure drawing calls remain capped. Test missing SDK, missing Road links and invalid trims; selection should not throw.

## Limitations
No verified new v3.0 SDK declaration is available in this conversation, so this update does **not** claim v3.0 decorator registration, interactive gizmo drag/picking, Undo transaction semantics or actual Cocos Editor visual certification. It provides ready-to-bind, read-only geometry with the known drawing call signatures. Interactive manipulation will be implemented only after obtaining actual v3.0 SDK APIs; use existing Cocos Knot Node transform handles meanwhile.
