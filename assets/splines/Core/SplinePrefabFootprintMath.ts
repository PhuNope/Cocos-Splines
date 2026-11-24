/**
 * Pure conservative spherical footprint of a static prefab hierarchy.
 * No engine dependencies; adapters MUST reject unsupported geometry rather
 * than silently underestimate its bounds.
 */
export interface FootprintVec3 {x:number;y:number;z:number}
export interface FootprintNode {
    position:FootprintVec3;
    scale:FootprintVec3;
    radii:ReadonlyArray<number>;
    children:ReadonlyArray<FootprintNode>;
}
const valid=(n:number):boolean=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e7;
const v3=(v:FootprintVec3):boolean=>!!v&&valid(v.x)&&valid(v.y)&&valid(v.z);
const magnitude=(v:FootprintVec3):number=>Math.hypot(v.x,v.y,v.z);
const scaleMax=(v:FootprintVec3):number=>Math.max(Math.abs(v.x),Math.abs(v.y),Math.abs(v.z));
export function prefabMeshAabbRadius(min:FootprintVec3,max:FootprintVec3):number {
    if(!v3(min)||!v3(max)||min.x>max.x||min.y>max.y||min.z>max.z)
        throw Error('Unreadable or invalid prefab Mesh bounds.');
    return Math.hypot(Math.max(Math.abs(min.x),Math.abs(max.x)),
        Math.max(Math.abs(min.y),Math.abs(max.y)),
        Math.max(Math.abs(min.z),Math.abs(max.z)));
}
export function prefabBoxRadius(center:FootprintVec3,size:FootprintVec3):number {
    if(!v3(center)||!v3(size)||size.x<0||size.y<0||size.z<0)
        throw Error('Invalid prefab BoxCollider center or size.');
    return magnitude(center)+Math.hypot(size.x,size.y,size.z)/2;
}
export function prefabSphereRadius(center:FootprintVec3,radius:number):number {
    if(!v3(center)||!valid(radius)||radius<0)
        throw Error('Invalid prefab SphereCollider.');
    return magnitude(center)+radius;
}
export function prefabCapsuleRadius(center:FootprintVec3,radius:number,
    cylinderHeight:number):number{
    if(!v3(center)||!valid(radius)||radius<0||!valid(cylinderHeight)||cylinderHeight<0)
        throw Error('Invalid prefab CapsuleCollider.');
    // Conservatively covers both "cylinder-only" and "total-height" backends.
    return magnitude(center)+radius+cylinderHeight/2;
}
/** Root local translation/rotation are overwritten by ObjectController when
 * instantiating. Root scale and all descendant translations/scales DO apply.
 * A sphere is rotation invariant, so rotations cannot exceed this bound.
 */
export function prefabHierarchyRadius(root:FootprintNode):number {
    let visited=0,shapes=0;
    const seen=new Set<FootprintNode>();
    const traverse=(node:FootprintNode,depth:number):number=>{
        if(!node||seen.has(node)||depth>32||++visited>1024||
           !v3(node.position)||!v3(node.scale)||
           !Array.isArray(node.radii)||!Array.isArray(node.children)||
           node.radii.length>32||node.children.length>1024)
            throw Error('Prefab hierarchy is invalid, cyclic or exceeds 1024 Nodes / depth 32.');
        seen.add(node);
        let bound=0;
        for(const radius of node.radii){
            if(!valid(radius)||radius<0)throw Error('Invalid prefab geometry radius.');
            shapes++;
            bound=Math.max(bound,radius);
        }
        // Radius measured about this Node origin, BEFORE this Node local scale.
        for(const child of node.children){
            const childRadius=traverse(child,depth+1);
            const radius=magnitude(child.position)+childRadius;
            if(!valid(radius))throw Error('Prefab hierarchy radius exceeds coordinate limits.');
            bound=Math.max(bound,radius);
        }
        const scaled=bound*scaleMax(node.scale);
        if(!valid(scaled))throw Error('Prefab footprint scale is outside supported range.');
        return scaled;
    };
    const radius=traverse(root,0);
    if(shapes===0)throw Error('Cannot infer prefab footprint: no supported MeshRenderer or Collider geometry.');
    if(radius>100)throw Error('Prefab footprint exceeds 100 World units; use a smaller prefab or manual mode.');
    return radius;
}
/** Conservative upper bound for an arbitrary affine 3x3 World transform
 * including shear induced by rotated nonuniform ancestor scales.
 * sqrt(norm_1 * norm_inf) is >= the matrix spectral norm; identity => 1.
 */
export function parentLinearStretch(matrix:Readonly<{
    m00:number;m01:number;m02:number;m04:number;m05:number;m06:number;
    m08:number;m09:number;m10:number;
}>):number {
    if(!matrix)throw Error('Missing generated population parent World matrix.');
    const a=[matrix.m00,matrix.m04,matrix.m08,
        matrix.m01,matrix.m05,matrix.m09,
        matrix.m02,matrix.m06,matrix.m10];
    if(!a.every(valid))throw Error('Invalid generated population parent World matrix.');
    const normInf=Math.max(
        Math.abs(a[0])+Math.abs(a[1])+Math.abs(a[2]),
        Math.abs(a[3])+Math.abs(a[4])+Math.abs(a[5]),
        Math.abs(a[6])+Math.abs(a[7])+Math.abs(a[8]));
    const norm1=Math.max(
        Math.abs(a[0])+Math.abs(a[3])+Math.abs(a[6]),
        Math.abs(a[1])+Math.abs(a[4])+Math.abs(a[7]),
        Math.abs(a[2])+Math.abs(a[5])+Math.abs(a[8]));
    const stretch=Math.sqrt(norm1*normInf);
    if(!valid(stretch))throw Error('Parent transform stretch exceeds supported range.');
    return stretch;
}
/** Return actual inflated radius for one placed candidate. A parent with
 * nonuniform scale is conservatively bounded by its largest absolute axis. */
export function scaledPrefabFootprint(baseRadius:number,parentScale:FootprintVec3,
    scaleFactor:number,modifierScale:FootprintVec3):number{
    if(!valid(baseRadius)||baseRadius<0||baseRadius>100||
       !v3(parentScale)||!v3(modifierScale)||!valid(scaleFactor))
        throw Error('Invalid prefab footprint parent, jitter or modifier scale.');
    const radius=baseRadius*scaleMax(parentScale)*Math.abs(scaleFactor)*scaleMax(modifierScale);
    if(!valid(radius)||radius>100)throw Error('Scaled prefab footprint exceeds 100 World units.');
    return radius;
}
