'use strict';
/**
 * Editor-independent, strict SVG path <-> spline cubic geometry adapter.
 * Never renders SVG or executes XML; unsupported transforms/arc paths fail closed.
 * SVG has Y-down; Cocos XY2D has Y-up. All units are container-local.
 */
const MAX_SOURCE=200000, MAX_SEGMENTS=256, MAX_COORD=1e7;
function finite(n){return typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=MAX_COORD;}
function point(x,y){if(!finite(x)||!finite(y))throw Error('SVG coordinate out of range (±1e7).');return {x,y};}
function add(a,b){return point(a.x+b.x,a.y+b.y);}
function sub(a,b){return point(a.x-b.x,a.y-b.y);}
function mul(a,t){return point(a.x*t,a.y*t);}
function lerp(a,b,t){return add(a,mul(sub(b,a),t));}
function equal(a,b){return Math.hypot(a.x-b.x,a.y-b.y)<1e-8;}
function extractPath(input){
    if(typeof input!=='string'||!input.trim()||input.length>MAX_SOURCE)
        throw Error('SVG path must be nonempty and at most 200 KB.');
    const raw=input.trim();
    if(!raw.startsWith('<'))return raw;
    if(!/^<svg[\s>]/i.test(raw))
        throw Error('Expected SVG markup or a bare path d string.');
    if(/<!|<script\b|<foreignObject\b|<use\b|\bon[a-z]+\s*=|\b(?:href|transform)\s*=|url\s*\(/i.test(raw))
        throw Error('SVG scripts, references and transforms are unsupported; flatten transforms before import.');
    if(/<(?:rect|circle|ellipse|polygon|polyline|line|text|image)\b/i.test(raw))
        throw Error('Only a single SVG <path> is supported; convert other shapes to paths.');
    const tags=[...raw.matchAll(/<path\b([^>]*)>/gi)];
    if(tags.length!==1)throw Error('SVG must contain exactly one <path> element.');
    const attr=tags[0][1].match(/(?:^|\s)d\s*=\s*(["'])(.*?)\1/is);
    if(!attr||!attr[2]||/[&<>]/.test(attr[2]))
        throw Error('SVG <path> requires a plain, non-entity d attribute.');
    return attr[2];
}
function tokenize(d){
    const out=[];let i=0;
    const re=/\s*,?\s*([MmLlHhVvCcSsQqTtZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/y;
    while(i<d.length){
        if(!d.slice(i).trim())break;
        re.lastIndex=i;
        const m=re.exec(d);
        if(!m||m.index!==i)throw Error('Unsupported SVG path token at offset '+i+'.');
        const v=m[1],isCommand=/^[a-z]$/i.test(v);
        const n=isCommand?v:Number(v);
        if(!isCommand&&!finite(n))throw Error('SVG path number is not finite or is outside ±1e7.');
        out.push(n);i=re.lastIndex;
        if(out.length>MAX_SEGMENTS*10+20)throw Error('SVG path has too many commands.');
    }
    return out;
}
function parseSvg(input,scale=1){
    if(!Number.isFinite(scale)||scale<=0||scale>1e4)
        throw Error('SVG units per pixel must be > 0 and <= 10000.');
    const t=tokenize(extractPath(input)),commands=/^[a-z]$/i;
    let i=0,cmd=null,current=point(0,0),start=null,lastC=null,lastQ=null,previous='',closed=false;
    const segments=[];
    const numeric=()=>typeof t[i]==='number';
    const read=()=>{if(!numeric())throw Error('SVG command has missing coordinates.');return t[i++];};
    const xy=relative=>{const p=point(read(),read());return relative?add(current,p):p;};
    const push=(a,b,c,d,kind)=>{
        if(segments.length>=MAX_SEGMENTS)throw Error('SVG exceeds 256 cubic segments.');
        segments.push({a,b,c,d});
        current=d;previous=kind;
    };
    while(i<t.length){
        if(typeof t[i]==='string')cmd=t[i++];
        if(!cmd)throw Error('SVG command expected.');
        const upper=cmd.toUpperCase(),relative=cmd!==upper;
        if(upper==='Z'){
            if(!start||closed)throw Error('Invalid SVG close-path.');
            if(!equal(current,start))
                push(current,lerp(current,start,1/3),lerp(current,start,2/3),start,'L');
            current=start;closed=true;lastC=null;lastQ=null;cmd=null;previous='Z';
            if(i<t.length)throw Error('Multiple SVG subpaths are unsupported.');
            break;
        }
        if(upper==='M'){
            if(start)throw Error('Multiple SVG subpaths are unsupported.');
            current=xy(relative);start=current;lastC=null;lastQ=null;previous='M';
            cmd=relative?'l':'L';continue;
        }
        if(!start)throw Error('SVG path must begin with M or m.');
        if(!numeric())throw Error('SVG command has no coordinate arguments.');
        const a=current;
        if(upper==='L'||upper==='H'||upper==='V'){
            let d;
            if(upper==='L')d=xy(relative);
            else if(upper==='H'){const x=read();d=point(relative?a.x+x:x,a.y);}
            else {const y=read();d=point(a.x,relative?a.y+y:y);}
            push(a,lerp(a,d,1/3),lerp(a,d,2/3),d,'L');lastC=null;lastQ=null;
        }else if(upper==='C'){
            const b=xy(relative),c=xy(relative),d=xy(relative);
            push(a,b,c,d,'C');lastC=c;lastQ=null;
        }else if(upper==='S'){
            const b=(previous==='C'||previous==='S')&&lastC?sub(mul(a,2),lastC):a;
            const c=xy(relative),d=xy(relative);
            push(a,b,c,d,'S');lastC=c;lastQ=null;
        }else if(upper==='Q'||upper==='T'){
            const q=upper==='Q'?xy(relative):
                ((previous==='Q'||previous==='T')&&lastQ?sub(mul(a,2),lastQ):a);
            const d=xy(relative);
            push(a,lerp(a,q,2/3),lerp(d,q,2/3),d,upper);
            lastQ=q;lastC=null;
        }else{
            throw Error('Unsupported SVG path command '+upper+' (convert arcs to cubics).');
        }
    }
    if(!start||segments.length<1)throw Error('SVG path requires at least one drawable segment.');
    // Closed splines have one Knot per segment. Open splines have one extra end Knot.
    const toLocal=p=>({x:p.x*scale,y:-p.y*scale,z:0});
    const vector=(a,b)=>({x:(b.x-a.x)*scale,y:-(b.y-a.y)*scale,z:0});
    const knots=[{position:toLocal(start),tangentIn:{x:0,y:0,z:0},
        tangentOut:{x:0,y:0,z:0},mode:4,tension:1/3}];
    for(let j=0;j<segments.length;j++){
        const s=segments[j],from=knots[j],closing=closed&&j===segments.length-1;
        from.tangentOut=vector(s.a,s.b);
        const target=closing?knots[0]:{position:toLocal(s.d),
            tangentIn:{x:0,y:0,z:0},tangentOut:{x:0,y:0,z:0},mode:4,tension:1/3};
        target.tangentIn=vector(s.d,s.c);
        if(!closing)knots.push(target);
    }
    if(knots.length<2)throw Error('A spline requires at least two distinct Knots.');
    return {closed,dimension:1,knots,segments:segments.length};
}
function exportSvg(data){
    if(!data||![1,2].includes(data.dimension)||!Array.isArray(data.knots)||
       data.knots.length<2||data.knots.length>MAX_SEGMENTS)
        throw Error('Export supports XY2D or XZ2D splines with 2–256 resolved Knots.');
    const axis=data.dimension===1?'y':'z';
    const from=p=>{
        if(!p||!finite(p.x)||!finite(p[axis]))throw Error('Invalid resolved Knot coordinate.');
        return point(p.x,-p[axis]);
    };
    const offset=(a,b)=>point(a.x+b.x,a.y+b.y);
    const knots=data.knots.map(k=>{
        const p=from(k.position),tin=from(k.tangentIn),tout=from(k.tangentOut);
        // from() flips axis for offsets as well as positions.
        return {p,cin:offset(p,tin),cout:offset(p,tout)};
    });
    const closed=data.closed===true,count=closed?knots.length:knots.length-1;
    const all=[knots[0].p],fmt=n=>String(Number((Math.abs(n)<1e-10?0:n).toFixed(9)));
    const xy=p=>fmt(p.x)+' '+fmt(p.y);
    let d='M '+xy(knots[0].p);
    for(let i=0;i<count;i++){
        const a=knots[i],b=knots[(i+1)%knots.length];
        d+=' C '+xy(a.cout)+' '+xy(b.cin)+' '+xy(b.p);
        all.push(a.cout,b.cin,b.p);
    }
    if(closed)d+=' Z';
    const xs=all.map(p=>p.x),ys=all.map(p=>p.y);
    const x=Math.min(...xs),y=Math.min(...ys),
        w=Math.max(1,Math.max(...xs)-x),h=Math.max(1,Math.max(...ys)-y);
    const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[x,y,w,h].map(fmt).join(' ')+'">\n'+
        '  <path d="'+d+'" fill="none" stroke="black"/>\n</svg>';
    if(svg.length>MAX_SOURCE)throw Error('SVG export exceeds 200 KB.');
    return svg;
}
module.exports={parseSvg,exportSvg,extractPath,tokenize,MAX_SEGMENTS};
