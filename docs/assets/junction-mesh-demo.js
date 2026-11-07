/** Junction Mesh teaching demo: mirrors the top-down polygon boundary logic
 * of buildJunctionPatch() without rendering Cocos meshes. No external dependencies.
 */
(() => {
  const container = document.getElementById('junction-demo');
  if (!container) return;
  const svg = document.getElementById('junction-demo-svg');
  const branchInput = document.getElementById('junction-demo-branches');
  const setbackInput = document.getElementById('junction-demo-setback');
  const widthInput = document.getElementById('junction-demo-width');
  const caption = document.getElementById('junction-demo-caption');
  const setbackLabel = document.getElementById('junction-demo-setback-value');
  const widthLabel = document.getElementById('junction-demo-width-value');
  const NS = 'http://www.w3.org/2000/svg';
  const add = (tag, attributes, parent = svg, text) => {
    const element = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    if (text !== undefined) element.textContent = text;
    parent.appendChild(element);
    return element;
  };
  const vec = degrees => {
    const rad = degrees * Math.PI / 180;
    return {x: Math.cos(rad), y: Math.sin(rad)};
  };
  function draw() {
    const branches = branchInput.value === '4' ? 4 : 3;
    const setback = Number(setbackInput.value);
    const width = Number(widthInput.value);
    const unit = 10.5;
    const half = width * unit / 2;
    const angles = branches === 4 ? [0, 90, 180, 270] : [0, 180, 90];
    svg.replaceChildren();
    add('rect', {x:-250,y:-170,width:500,height:340,fill:'#0e2130'});
    for (const angle of angles) {
      const d=vec(angle),r={x:-d.y,y:d.x},end=255;
      const pts = [
        {x: r.x*half,y:r.y*half},
        {x: d.x*end+r.x*half,y:d.y*end+r.y*half},
        {x: d.x*end-r.x*half,y:d.y*end-r.y*half},
        {x:-r.x*half,y:-r.y*half}
      ];
      add('polygon',{points:pts.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),fill:'#4a6576',stroke:'#70919e','stroke-width':1});
      add('line',{x1:d.x*140,y1:d.y*140,x2:d.x*224,y2:d.y*224,stroke:'#bad4da','stroke-width':2.2,'stroke-dasharray':'11 9'});
    }
    // Exactly the same endpoint construction and angular sorting as the runtime patch.
    const poly=[];
    for (const angle of angles) {
      const d=vec(angle),right={x:d.y,y:-d.x};
      for(const sign of [-1,1])poly.push({x:d.x*setback*unit+right.x*half*sign,y:d.y*setback*unit+right.y*half*sign});
    }
    poly.sort((a,b)=>Math.atan2(a.y,a.x)-Math.atan2(b.y,b.x));
    add('polygon',{points:poly.map(p=>`${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),fill:'#aa8be8','fill-opacity':'.75',stroke:'#e3d4ff','stroke-width':2.8});
    for(const p of poly){
      add('line',{x1:0,y1:0,x2:p.x,y2:p.y,stroke:'#efdfff','stroke-opacity':.35,'stroke-width':.9});
      add('circle',{cx:p.x,cy:p.y,r:3.2,fill:'#f6e2ff'});
    }
    add('circle',{cx:0,cy:0,r:6,fill:'#f5d88a',stroke:'#fff5bc','stroke-width':1.2});
    const bar=add('g',{transform:'translate(-233,-150)'});
    add('rect',{width:170,height:28,rx:6,fill:'#132e40',stroke:'#497082'},bar);
    add('text',{x:10,y:19,fill:'#d5edec','font-size':13,'font-family':'Arial, sans-serif'},bar,`${branches} nhánh · ${poly.length} cạnh patch`);
    setbackLabel.textContent=String(setback);
    widthLabel.textContent=String(width);
    caption.textContent=`${branches} Road cùng cao độ · setback ${setback} units · road.width ${width} units. Patch phủ lên tâm; các Road không bị cắt/hàn.`;
  }
  branchInput.addEventListener('change',draw);
  setbackInput.addEventListener('input',draw);
  widthInput.addEventListener('input',draw);
  draw();
})();
