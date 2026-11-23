'use strict';
/**
 * Strict serialization policy for topology-copy metadata.
 * Only whitelisted value fields are allowed. Never copy opaque Editor dumps,
 * arbitrary components, script UUIDs, nodes, assets, or serialized references.
 */
const BOOLEAN_FIELDS=['showGizmos','showGizmosAlways','showTangentGizmos'];
const SETTINGS=['showGizmos','showGizmosAlways','showTangentGizmos','gizmoSteps','gizmoColor'];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function copyColor(color){
    if(!color||typeof color!=='object'||Array.isArray(color))
        throw Error('Invalid SplineContainer gizmo color.');
    const out={};
    for(const key of ['r','g','b','a']){
        const value=color[key];
        if(!Number.isInteger(value)||value<0||value>255)
            throw Error('Invalid SplineContainer gizmo color channel '+key+'.');
        out[key]=value;
    }
    return out;
}
function validateContainerAppearance(appearance){
    if(!appearance||typeof appearance!=='object'||Array.isArray(appearance))
        throw Error('Invalid SplineContainer appearance payload.');
    if(Object.keys(appearance).some(k=>!SETTINGS.includes(k)))
        throw Error('Unknown SplineContainer appearance field.');
    const safe={};
    for(const key of BOOLEAN_FIELDS){
        if(appearance[key]===undefined)continue;
        if(typeof appearance[key]!=='boolean')
            throw Error('Invalid SplineContainer appearance flag: '+key);
        safe[key]=appearance[key];
    }
    if(appearance.gizmoSteps!==undefined){
        if(!Number.isInteger(appearance.gizmoSteps)||
           appearance.gizmoSteps<2||appearance.gizmoSteps>64)
            throw Error('Invalid SplineContainer gizmoSteps.');
        safe.gizmoSteps=appearance.gizmoSteps;
    }
    if(appearance.gizmoColor!==undefined)
        safe.gizmoColor=copyColor(appearance.gizmoColor);
    return safe;
}
function captureContainerAppearance(component){
    if(!component||typeof component!=='object')
        throw Error('Invalid SplineContainer for metadata copy.');
    const raw={};
    for(const key of SETTINGS)if(component[key]!==undefined)raw[key]=component[key];
    return validateContainerAppearance(raw);
}
function appearanceWrites(appearance){
    const safe=validateContainerAppearance(appearance);
    return SETTINGS.filter(key=>safe[key]!==undefined).map(key=>({
        key,type:BOOLEAN_FIELDS.includes(key)?'Boolean':key==='gizmoSteps'?'Integer':'cc.Color',
        value:safe[key],
    }));
}
function omittedDataSummary(root,retained){
    if(!root||!Array.isArray(root.components)||!Array.isArray(root.children)||
       !Array.isArray(retained))
        throw Error('Invalid topology source for copy report.');
    // Counts only: no component properties, Node references or scripts escape.
    const extraRootComponents=Math.max(0,root.components.length-1);
    let extraKnotComponents=0,extraKnotChildren=0;
    for(const knot of retained){
        const node=knot?.node;
        if(!node||!Array.isArray(node.components)||!Array.isArray(node.children))
            throw Error('Invalid retained Knot for copy report.');
        extraKnotComponents+=Math.max(0,node.components.length-1);
        const linked=new Set([knot.tangentInHandle,knot.tangentOutHandle].filter(Boolean));
        extraKnotChildren+=node.children.filter(child=>!linked.has(child)).length;
    }
    return {extraRootComponents,extraKnotComponents,extraKnotChildren};
}
module.exports={captureContainerAppearance,validateContainerAppearance,appearanceWrites,omittedDataSummary};
