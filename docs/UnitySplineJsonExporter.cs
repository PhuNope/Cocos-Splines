// Place in an Editor/ folder in a Unity project with com.unity.splines installed.
// Menu: Tools > Splines > Export Selected Spline to Cocos JSON
// Exports the FIRST spline in the selected SplineContainer.
using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Splines;
using Unity.Mathematics;

public static class UnitySplineJsonExporter
{
    [Serializable]
    public class KnotEntry
    {
        public float[] position;
        public float[] tangentIn;
        public float[] tangentOut;
        public float[] eulerDegrees;
        public int mode;
        public float tension;
    }
    [Serializable]
    public class SplineEntry
    {
        public bool closed;
        public KnotEntry[] knots;
    }
    private static float[] Arr(float3 x) => new[] { x.x, x.y, x.z };
    [MenuItem("Tools/Splines/Export Selected Spline to Cocos JSON")]
    private static void Export()
    {
        var container = Selection.activeGameObject ? Selection.activeGameObject.GetComponent<SplineContainer>() : null;
        if (container == null || container.Spline == null)
        {
            EditorUtility.DisplayDialog("Spline Export", "Select a GameObject containing a SplineContainer.", "OK");
            return;
        }
        var spline = container.Spline;
        var data = new SplineEntry { closed = spline.Closed, knots = new KnotEntry[spline.Count] };
        for (int i = 0; i < spline.Count; i++)
        {
            var knot = spline[i];
            // Unity.Mathematics Euler radians -> degrees. Rotation order between
            // Unity and Cocos may need manual adjustment for twisted/rolled curves.
            var q = knot.Rotation.value;
            var euler = new UnityEngine.Quaternion(q.x, q.y, q.z, q.w).eulerAngles;
            data.knots[i] = new KnotEntry {
                position = Arr(knot.Position), tangentIn = Arr(knot.TangentIn),
                tangentOut = Arr(knot.TangentOut), eulerDegrees = Arr(euler),
                mode = (int)spline.GetTangentMode(i),
                tension = spline.GetTangentMode(i) == TangentMode.AutoSmooth
                    ? spline.GetAutoSmoothTension(i) : 1f / 3f
            };
        }
        var target = EditorUtility.SaveFilePanel("Export spline", "", "spline.json", "json");
        if (!string.IsNullOrEmpty(target))
        {
            File.WriteAllText(target, JsonUtility.ToJson(data, true));
            Debug.Log($"Exported {spline.Count} knots to {target}");
        }
    }
}
