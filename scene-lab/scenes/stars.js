/* 图版：星座夜空 —— 文件是亮星，靠近的星自动连成星座 */
(function () {
  'use strict';
  const { W, H, TAU, hash, circle } = DD;

  const FRAG = `
vec3 starLayer(vec2 p,float cell,float thr,float size,float t){
  vec2 g=floor(p/cell);vec2 h=hash22(g);
  vec2 c=(g+.15+.7*h)*cell;
  float tw=.6+.4*sin(t*(.8+2.2*h.x)+h.y*40.);
  float b=step(thr,hash21(g+17.3))*(1.-ss(0.,size*(.6+.8*h.y),length(p-c)))*tw;
  return mix(vec3(.75,.85,1.),vec3(1.,.90,.75),h.x)*b;
}
vec3 shade(vec2 p){
  float t=u_time;
  vec2 uv=p/u_world;
  vec3 c=mix(vec3(.030,.040,.105),vec3(.075,.045,.150),ss(0.,1.,uv.y*.7+uv.x*.3));
  float n=fbm(p*.0030+vec2(t*.003,1.));
  float n2=fbm(p*.0065+vec2(20.,-t*.004));
  float band=1.-ss(0.,.42,abs((uv.y-.5)+(uv.x-.5)*.55+(n-.5)*.25));     // 斜跨天空的银河
  c+=vec3(.10,.09,.20)*band*(.35+.9*n2);
  c+=vec3(.03,.10,.13)*ss(.50,.85,n2)*.8;
  c+=vec3(.13,.04,.12)*ss(.55,.9,n)*.7;
  c+=starLayer(p,9.,.80,1.1,t)*.55*(.6+.8*band);
  c+=starLayer(p+31.,23.,.72,1.8,t)*.9;
  c+=starLayer(p+77.,61.,.70,2.8,t);
  // 文件聚在一起的地方亮起星云
  vec4 F=fieldAt(p);
  float lush=F.w/max(F.x,1e-3);
  float nb=fbm(p*.012+vec2(3.,9.)+t*.01);
  vec3 nc=mix(vec3(.16,.32,.75),vec3(.62,.22,.72),ss(.3,.7,fbm(p*.006+40.)));
  nc=mix(nc,vec3(.15,.65,.70),ss(.55,.8,nb)*.5);
  c+=nc*ss(.05,1.5,F.x)*(.35+.9*nb)*(.30+.07*clamp(lush,1.,6.));
  // 每个文件一颗亮星：光晕 + 十字星芒，刚点亮时闪一下
  for(int i=0;i<MAXN;i++){
    if(i>=u_n)break;
    vec4 a=u_pts[i];vec4 x=u_aux[i];
    vec2 d=p-a.xy;float L2=dot(d,d);
    vec3 sc=mix(vec3(.62,.80,1.),vec3(1.,.85,.62),x.x);
    sc=mix(sc,vec3(1.,.70,.85),step(.7,x.x)*.6);
    float halo=exp(-L2/2600.)*.55+exp(-L2/420.)*.8;
    float sp=exp(-abs(d.y)*.55)*exp(-abs(d.x)*.018)+exp(-abs(d.x)*.55)*exp(-abs(d.y)*.018);
    float tw=.85+.15*sin(t*1.7+x.x*60.);
    c+=sc*(halo+sp*.55)*a.z*tw;
    c+=sc*exp(-L2/9000.)*exp(-x.z*1.6)*1.1*a.z;
  }
  c=1.-exp(-c*1.3);                                 // 柔和压住高光，星多的地方不至于一片惨白
  vec2 q=uv-.5;c*=1.-dot(q,q)*.6;
  return c;
}`;

  const NAMES = { folder: '藏匣座', pdf: '文书座', img: '影像座', doc: '文书座', sheet: '账簿座', key: '讲演座', txt: '札记座', mov: '光影座', zip: '行囊座', md: '札记座', mp3: '乐音座' };

  // 从图标边缘出发的连线端点（不压住图标和文件名）
  function edgePoint(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const k = 1 / Math.sqrt((ux / 46) * (ux / 46) + (uy / 52) * (uy / 52));
    return [a.x + ux * k, a.y + uy * k, L - 2 * k];
  }

  DD.register({
    id: 'stars', name: '星座夜空', en: 'Constellations', accent: '#6d72e0',
    short: '文件是亮星，靠近的星自动连成星座。',
    tagline: '一片夜空。每个文件是一颗带光晕的亮星，靠近的星自动连成星座，按里面最多的文件类型得名。',
    rules: [
      ['1 个文件', '一颗孤星，带光晕和十字星芒'],
      ['2–3 个相邻', '星与星之间连起细线，成为星座'],
      ['4 个以上', '星云亮起，星座得名，还有一颗小行星绕行'],
      ['放下文件', '新星点亮，闪一下，迸出星屑；连线重新生长'],
    ],
    life: ['闪烁的群星', '银河', '流星', '星座名', '绕行的行星'],
    meta: { read: 4, cost: 1, power: 1 },
    note: '唯一的深色方案，适合常年用深色模式的桌面。',
    R: 170, T: 0.30, grow: 0, link: 235,
    frag: FRAG,

    init() { return { edges: new Map(), meteors: [], sparks: [], mt: 3, labels: [] }; },

    layout(st, env) {
      for (const e of st.edges.values()) e.keep = false;
      st.labels = [];
      for (const cl of env.clusters) {
        const m = cl.members;
        if (m.length < 2) continue;
        // 最小生成树：用最短的线把一簇星连起来
        const inTree = [m[0]], rest = m.slice(1), pairs = [];
        while (rest.length) {
          let best = null;
          for (const a of inTree) for (const b of rest) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (!best || d < best.d) best = { a, b, d }; }
          pairs.push([best.a, best.b]); inTree.push(best.b); rest.splice(rest.indexOf(best.b), 1);
        }
        if (m.length >= 4) { // 再补一条最短的非树边，让星座有个闭环
          let extra = null;
          for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) {
            if (pairs.some(p => (p[0] === m[i] && p[1] === m[j]) || (p[0] === m[j] && p[1] === m[i]))) continue;
            const d = Math.hypot(m[i].x - m[j].x, m[i].y - m[j].y);
            if (!extra || d < extra.d) extra = { a: m[i], b: m[j], d };
          }
          if (extra && extra.d < 240) pairs.push([extra.a, extra.b]);
        }
        for (const p of pairs) {
          const a = p[0].seed < p[1].seed ? p[0] : p[1], b = a === p[0] ? p[1] : p[0];
          const key = Math.round(a.x) + ',' + Math.round(a.y) + '-' + Math.round(b.x) + ',' + Math.round(b.y);
          let e = st.edges.get(key);
          if (!e) { e = { key, a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, p: 0 }; st.edges.set(key, e); }
          e.keep = true;
        }
        if (m.length >= 3) {
          const count = {};
          let top = m[0].kind, low = m[0];
          for (const e of m) { count[e.kind] = (count[e.kind] || 0) + 1; if (count[e.kind] > count[top]) top = e.kind; if (e.y > low.y) low = e; }
          st.labels.push({ x: cl.cx, y: low.y + 88, text: NAMES[top] || '无名座', n: m.length, cx: cl.cx, cy: cl.cy, rad: cl.rad, seed: cl.seed });
        }
      }
    },

    update(st, env, dt) {
      const t = env.time;
      for (const e of st.edges.values()) {
        e.p += ((e.keep ? 1 : 0) - e.p) * (1 - Math.exp(-dt * (e.keep ? 2.2 : 5)));
        if (!e.keep && e.p < 0.02) st.edges.delete(e.key);
      }
      if ((st.mt -= dt) <= 0) {
        st.mt = 3 + Math.random() * 6;
        const a = 0.5 + Math.random() * 0.5;
        st.meteors.push({ x: Math.random() * W, y: 30 + Math.random() * H * 0.4, vx: Math.cos(a) * 900 * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * 900, t0: t });
      }
      st.meteors = st.meteors.filter(m => t - m.t0 < 0.7);
      st.sparks = st.sparks.filter(s => t - s.t0 < 1.1);
    },

    drop(st, env, x, y) {
      const t = env.time;
      for (let i = 0; i < 16; i++) st.sparks.push({ x, y, a: Math.random() * TAU, sp: 60 + Math.random() * 120, t0: t, r: 0.8 + Math.random() * 1.4 });
    },

    drawOver(ctx, st, env) {
      const t = env.time;
      ctx.lineCap = 'round';
      for (const e of st.edges.values()) {
        const A = edgePoint(e.a, e.b), B = edgePoint(e.b, e.a);
        if (A[2] < 6) continue;
        const ex = A[0] + (B[0] - A[0]) * e.p, ey = A[1] + (B[1] - A[1]) * e.p;
        ctx.strokeStyle = 'rgba(150,180,255,' + (0.16 * e.p).toFixed(3) + ')'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(225,235,255,' + (0.72 * e.p).toFixed(3) + ')'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.fillStyle = 'rgba(235,242,255,' + (0.9 * e.p).toFixed(3) + ')';
        circle(ctx, A[0], A[1], 2); circle(ctx, ex, ey, 2);
      }
      ctx.textAlign = 'center';
      for (const l of st.labels) {
        ctx.font = '500 12.5px "Songti SC","PingFang SC",serif';
        ctx.fillStyle = 'rgba(200,214,255,.62)';
        ctx.fillText('✦  ' + l.text.split('').join(' ') + '  ·  ' + l.n, l.x, l.y);
        if (l.n >= 4) { // 绕行的小行星
          const a = t * 0.16 + l.seed, rx = l.rad + 128, ry = (l.rad + 128) * 0.82;
          ctx.strokeStyle = 'rgba(170,190,255,.10)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(l.cx, l.cy, rx, ry, 0, 0, TAU); ctx.stroke();
          const px = l.cx + Math.cos(a) * rx, py = l.cy + Math.sin(a) * ry;
          ctx.strokeStyle = 'rgba(255,225,170,.7)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.ellipse(px, py, 9, 3.2, -0.5, 0, TAU); ctx.stroke();
          ctx.fillStyle = '#f2c98a'; circle(ctx, px, py, 4.4);
          ctx.fillStyle = 'rgba(120,70,40,.5)'; ctx.beginPath(); ctx.arc(px, py, 4.4, 0.2, Math.PI + 0.2); ctx.fill();
        }
      }
      for (const m of st.meteors) {
        const k = (t - m.t0) / 0.7, x = m.x + m.vx * (t - m.t0), y = m.y + m.vy * (t - m.t0);
        const g = ctx.createLinearGradient(x, y, x - m.vx * 0.16, y - m.vy * 0.16);
        g.addColorStop(0, 'rgba(255,255,255,' + (0.95 * (1 - k)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(160,190,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - m.vx * 0.16, y - m.vy * 0.16); ctx.stroke();
      }
      for (const s of st.sparks) {
        const k = (t - s.t0) / 1.1, e = 1 - (1 - k) * (1 - k);
        ctx.fillStyle = 'rgba(255,240,210,' + (1 - k).toFixed(3) + ')';
        circle(ctx, s.x + Math.cos(s.a) * (46 + s.sp * e), s.y + Math.sin(s.a) * (46 + s.sp * e), s.r * (1 - k * 0.5));
      }
      ctx.lineCap = 'butt';
    },
  });
})();
