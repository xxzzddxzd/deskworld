/* 图版：云上草原 —— 从云层之上俯视，文件躺在云上，云影落在草原上 */
(function () {
  'use strict';
  const { W, H, TAU, hash, circle } = DD;

  // 小溪与小路的走向（着色器里是同一组公式）
  const streamY = x => 600 + 78 * Math.sin(x * 0.0041 + 0.6) + 34 * Math.sin(x * 0.0113 + 2.1);
  const pathX = y => 520 + 64 * Math.sin(y * 0.0058 + 1.0);
  const SOX = 52, SOY = 66; // 云影相对云的偏移

  const FRAG = `
float streamY(float x){return 600.+78.*sin(x*.0041+.6)+34.*sin(x*.0113+2.1);}
float pathX(float y){return 520.+64.*sin(y*.0058+1.);}
vec3 ground(vec2 p){
  float n=fbm(p*.0055+vec2(2.,7.));
  float n2=fbm(p*.028+11.);
  vec3 c=mix(vec3(.44,.69,.31),vec3(.61,.80,.38),ss(.30,.72,n));
  c=mix(c,vec3(.33,.58,.28),ss(.52,.80,n2)*.55);
  c+=(hash21(floor(p*1.2))-.5)*.03;
  // 一片片野花
  vec2 g=floor(p/7.);float h=hash21(g);
  float patch=ss(.50,.70,fbm(p*.012+31.));
  vec2 fp=(g+.5+.6*(hash22(g+3.1)-.5))*7.;
  vec3 fc=h<.34?vec3(1.,.98,.9):(h<.67?vec3(1.,.86,.35):vec3(.98,.62,.72));
  c=mix(c,fc,step(.78,hash21(g+9.7))*patch*(1.-ss(.9,1.9,length(p-fp))));
  // 小路
  float dp=abs(p.x-pathX(p.y));
  c=mix(c,vec3(.80,.73,.53),(1.-ss(3.,5.5,dp))*.85);
  // 小溪
  float wd=9.+4.*sin(p.x*.013);
  float ds=abs(p.y-streamY(p.x));
  c=mix(c,vec3(.72,.80,.50),(1.-ss(wd+1.,wd+8.,ds))*.7);
  vec3 wat=mix(vec3(.40,.69,.86),vec3(.64,.85,.94),vnoise(vec2(p.x*.05-u_time*.6,p.y*.2)));
  c=mix(c,wat,1.-ss(wd-1.,wd+1.,ds));
  return c;
}
vec3 shade(vec2 p){
  float t=u_time;
  vec3 g=ground(p);
  vec4 s=texture2D(u_spr,p/u_world);            // 地面上的树、羊、房子
  g=g*(1.-s.a)+s.rgb;
  vec2 dr=vec2(t*1.6,0.);
  // ---- 云影
  vec2 q=p-vec2(52.,66.);
  float fs=fieldF(q);
  float ns=fbm(q*.016+dr*.016);
  float sh=ss(KT-.06,KT+.30,fs+(ns-.5)*.5*ss(.02,.3,fs));
  g=mix(g,g*vec3(.50,.60,.74),sh*.62);
  g=mix(g,vec3(.80,.90,.97),.07);                // 一层薄薄的空气
  // ---- 云
  vec4 F=fieldAt(p);
  float n1=fbm(p*.016+dr*.016);
  float n2=fbm(p*.05+dr*.03+7.);
  float e=ss(.02,.30,F.x);
  vec3 vv=voro(p*.021+vec2(t*.006,0.),t*.05);                                      // 一团团鼓起来的云朵
  float puff=1.-ss(0.,.78,vv.x);
  float f=F.x+(n1-.5)*.34*e+(puff-.45)*.30*e+(n2-.5)*.07*e;
  float a=ss(KT-.07,KT+.16,f);
  float lush=F.w/max(F.x,1e-3);
  float nl=fbm((p+vec2(-7.,-9.))*.016+dr*.016);
  float lit=clamp(.60+dot(F.yz,vec2(1.,1.))*26.+(n1-nl)*4.+(puff-.5)*.34+(n2-.5)*.14,0.,1.);   // 光从左上来
  vec3 cc=mix(vec3(.66,.74,.89),vec3(1.),lit);
  float storm=ss(4.4,6.2,lush)*ss(KT+.25,KT+.85,f);                               // 文件堆得多 → 积雨云
  cc=mix(cc,vec3(.47,.51,.61)*(.8+.45*lit),storm*.82);
  cc+=step(.972,hash21(vec2(floor(t*9.),3.)))*storm*vec3(.55,.55,.40);          // 偶尔的闪电
  vec3 col=mix(g,cc,a*.985);
  float wsp=ss(.60,.9,fbm(p*.0035+vec2(t*.010,3.)))*.20;                          // 高处的薄云丝
  col=mix(col,vec3(1.),wsp*(1.-a));
  return col;
}`;

  function house(ctx, x, y, w, h, rot, roof, ridge) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = 'rgba(30,55,30,.3)'; ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
    ctx.fillStyle = roof; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = 'rgba(0,0,0,.17)'; ctx.fillRect(-w / 2, 0, w, h / 2);
    ctx.fillStyle = ridge; ctx.fillRect(-w / 2, -0.8, w, 1.6);
    ctx.restore();
  }
  function windmill(ctx, x, y, t) {
    const a = t * 0.9;
    ctx.save(); ctx.translate(x + 9, y + 12); ctx.rotate(a); ctx.fillStyle = 'rgba(30,55,30,.2)';
    for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 4); ctx.fillRect(2, -2.2, 21, 4.4); }
    ctx.restore();
    ctx.fillStyle = 'rgba(30,55,30,.28)'; circle(ctx, x + 4, y + 5, 8);
    ctx.fillStyle = '#e9e2d0'; circle(ctx, x, y, 8);
    ctx.fillStyle = '#b8563a'; circle(ctx, x, y, 5.2);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 4); ctx.fillStyle = '#fbf7ec'; ctx.fillRect(2, -2.2, 21, 4.4); ctx.fillStyle = 'rgba(120,90,60,.5)'; ctx.fillRect(2, -0.4, 21, 0.8); }
    ctx.restore();
    ctx.fillStyle = '#6b4a2c'; circle(ctx, x, y, 1.8);
  }
  function sheep(ctx, s) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.h);
    ctx.fillStyle = 'rgba(30,60,30,.25)'; ctx.beginPath(); ctx.ellipse(1.5, 2.5, 5.4, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = s.black ? '#4f4943' : '#fbfaf5';
    circle(ctx, -2, -1.3, 2.9); circle(ctx, -2, 1.3, 2.9); circle(ctx, 1, -1.5, 2.9); circle(ctx, 1, 1.5, 2.9); circle(ctx, -0.5, 0, 3.2);
    ctx.fillStyle = '#3b3632'; ctx.beginPath(); ctx.ellipse(4.4, 0, 2, 1.6, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function person(ctx, x, y, col) {
    ctx.fillStyle = 'rgba(30,60,30,.25)'; circle(ctx, x + 1.2, y + 1.6, 2.7);
    ctx.fillStyle = col; circle(ctx, x, y, 2.7);
    ctx.fillStyle = '#3a2a20'; circle(ctx, x, y, 1.5);
  }
  function picnic(ctx, x, y) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.3);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { ctx.fillStyle = (i + j) % 2 ? '#fff' : '#e2574c'; ctx.fillRect(-10 + i * 5, -7.5 + j * 5, 5, 5); }
    ctx.fillStyle = '#b07a3f'; ctx.fillRect(-2, -2.5, 5, 4);
    ctx.restore();
    person(ctx, x - 14, y - 2, '#3f7fd0'); person(ctx, x + 9, y + 11, '#f2b233');
  }
  function bridge(ctx, x, y) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.12);
    ctx.fillStyle = 'rgba(30,55,30,.25)'; ctx.fillRect(-5, -15, 14, 34);
    ctx.fillStyle = '#b98a55'; ctx.fillRect(-7, -17, 14, 34);
    ctx.strokeStyle = 'rgba(90,60,30,.5)'; ctx.lineWidth = 0.8;
    for (let k = -14; k < 17; k += 4) { ctx.beginPath(); ctx.moveTo(-7, k); ctx.lineTo(7, k); ctx.stroke(); }
    ctx.fillStyle = '#7c5a36'; ctx.fillRect(-8, -17, 1.6, 34); ctx.fillRect(6.4, -17, 1.6, 34);
    ctx.restore();
  }
  function bird(ctx, x, y, h, flap) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(h);
    const s = 6.5 * (0.5 + 0.5 * Math.abs(flap));
    ctx.beginPath(); ctx.moveTo(-2.6, -s); ctx.quadraticCurveTo(0.6, -s * 0.5, 1.6, 0); ctx.quadraticCurveTo(0.6, s * 0.5, -2.6, s); ctx.stroke();
    ctx.restore();
  }
  function balloon(ctx, x, y, r, rot) {
    const cols = ['#e85d4a', '#f7ead0', '#f2b233', '#f7ead0', '#3f8fd0', '#f7ead0', '#e85d4a', '#f7ead0', '#f2b233', '#f7ead0'];
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = cols[i];
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, rot + i * TAU / 10, rot + (i + 1) * TAU / 10 + 0.02); ctx.closePath(); ctx.fill();
    }
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.24)');
    ctx.fillStyle = g; circle(ctx, x, y, r);
    ctx.fillStyle = 'rgba(60,40,20,.5)'; circle(ctx, x, y, r * 0.12);
  }
  function stepFlock(f, dt, t) {
    f.h += Math.sin(t * 0.13 + f.ph) * 0.05 * dt;
    f.x += Math.cos(f.h) * f.v * dt; f.y += Math.sin(f.h) * f.v * dt;
    if (f.x < -280 || f.x > W + 280 || f.y < -280 || f.y > H + 280) {
      const left = Math.random() < 0.5;
      f.x = left ? -110 : W + 110; f.y = 120 + Math.random() * (H - 320);
      f.h = (left ? 0 : Math.PI) + (Math.random() - 0.5) * 0.6;
    }
  }
  function drawFlock(ctx, f, t) {
    const c = Math.cos(f.h), s = Math.sin(f.h);
    for (let k = 0; k < f.n; k++) {
      const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;
      const ox = -row * 12, oy = side * row * 9 * (k ? 1 : 0);
      bird(ctx, f.x + c * ox - s * oy, f.y + s * ox + c * oy, f.h, Math.sin(t * 6 + k * 1.3 + f.ph));
    }
  }

  DD.register({
    id: 'clouds', name: '云上草原', en: 'Cloud Meadow', accent: '#4f8fd6',
    short: '每个文件躺在一朵云上，云影落在草原上。',
    tagline: '从云层之上俯视一片草原。每个文件都躺在一朵云上，云影落在羊群、小溪和风车上。',
    rules: [
      ['1 个文件', '一朵蓬松的小云，地面上跟着一块云影'],
      ['2–3 个相邻', '云连成一片，影子也连成一片'],
      ['5 个以上', '云层变厚发灰，成了积雨云，偶尔闪一下电'],
      ['拖走文件', '旧云慢慢散开，新位置凝出一朵新的'],
    ],
    life: ['羊群', '风车', '小溪与木桥', '野餐的人', '雁阵', '热气球'],
    meta: { read: 2, cost: 2, power: 3 },
    note: '白云上的白色文件名对比度偏低，要靠云的暗部和文字阴影托住——这是这个场景最需要打磨的地方。',
    R: 150, T: 0.30, grow: 0.04,
    frag: FRAG,

    init() {
      const st = { trees: [], sheep: [], puffs: [], home: [690, 372] };
      const groves = [[236, 176, 10], [1010, 452, 12], [1286, 770, 9], [112, 792, 7], [742, 96, 6], [600, 770, 8]];
      groves.forEach((g, gi) => {
        for (let k = 0; k < g[2]; k++) {
          const a = hash(gi, k) * TAU, r = Math.sqrt(hash(gi, k + 20)) * 74;
          const x = g[0] + Math.cos(a) * r * 1.3, y = g[1] + Math.sin(a) * r * 0.8;
          if (Math.abs(y - streamY(x)) < 24 || Math.abs(x - pathX(y)) < 16) continue;
          st.trees.push({ x, y, r: 9 + hash(gi, k + 40) * 8, tone: hash(gi, k + 60) });
        }
      });
      for (let x = 40; x < W; x += 70 + hash(x, 1) * 80) { // 溪边零星的树
        const y = streamY(x) + (hash(x, 2) < 0.5 ? -1 : 1) * (25 + hash(x, 3) * 12);
        if (Math.abs(x - pathX(y)) > 18) st.trees.push({ x, y, r: 7 + hash(x, 4) * 5, tone: hash(x, 5) });
      }
      st.trees.sort((a, b) => a.y - b.y);
      for (let i = 0; i < 15; i++) {
        const a = hash(i, 71) * TAU, r = Math.sqrt(hash(i, 72)) * 110;
        const x = st.home[0] + Math.cos(a) * r, y = st.home[1] + Math.sin(a) * r * 0.7;
        st.sheep.push({ x, y, tx: x, ty: y, h: hash(i, 73) * TAU, wait: hash(i, 74) * 5, black: i === 4 });
      }
      let by = 600;
      for (let i = 0; i < 24; i++) by = streamY(pathX(by));
      st.bridge = [pathX(by), by];
      st.flock = { x: -80, y: 300, h: 0.15, v: 46, n: 7, ph: 0 };
      st.flock2 = { x: W + 200, y: 640, h: Math.PI + 0.2, v: 38, n: 5, ph: 2 };
      st.balloon = { x: 400, y: 500 };
      return st;
    },

    update(st, env, dt) {
      const t = env.time;
      for (const s of st.sheep) {
        if (s.wait > 0) { s.wait -= dt; continue; }
        const dx = s.tx - s.x, dy = s.ty - s.y;
        if (Math.hypot(dx, dy) < 2) { // 吃一会儿草，再换个地方
          s.wait = 2 + Math.random() * 6;
          const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 120;
          s.tx = st.home[0] + Math.cos(a) * r; s.ty = st.home[1] + Math.sin(a) * r * 0.7;
          continue;
        }
        let dh = Math.atan2(dy, dx) - s.h;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        s.h += dh * Math.min(1, dt * 3);
        s.x += Math.cos(s.h) * 7 * dt; s.y += Math.sin(s.h) * 7 * dt;
      }
      stepFlock(st.flock, dt, t); stepFlock(st.flock2, dt, t);
      st.balloon.x = W * 0.5 + 440 * Math.sin(t * 0.021 + 1.0);
      st.balloon.y = 400 + 230 * Math.sin(t * 0.017 + 2.4);
      st.puffs = st.puffs.filter(p => t - p.t0 < 1.2);
    },

    drop(st, env, x, y) {
      const t = env.time;
      for (let i = 0; i < 10; i++) st.puffs.push({ x, y, a: i / 10 * TAU + Math.random() * 0.5, t0: t + Math.random() * 0.12, sp: 46 + Math.random() * 44, r: 7 + Math.random() * 8 });
    },

    drawUnder(ctx, st, env) {
      const t = env.time;
      ctx.fillStyle = 'rgba(30,60,30,.27)';
      for (const tr of st.trees) circle(ctx, tr.x + tr.r * 0.45, tr.y + tr.r * 0.55, tr.r);
      for (const h of [[985, 205], [998, 220], [977, 226]]) {
        ctx.fillStyle = 'rgba(30,55,30,.25)'; circle(ctx, h[0] + 2, h[1] + 3, 5.5);
        ctx.fillStyle = '#e6c35c'; circle(ctx, h[0], h[1], 5.5);
        ctx.fillStyle = '#f3dc8b'; circle(ctx, h[0] - 1.2, h[1] - 1.4, 2.6);
      }
      house(ctx, 890, 196, 30, 22, 0.2, '#c8553d', '#8f3a2a');
      house(ctx, 942, 240, 40, 26, 0.2, '#a8452f', '#7d3122');
      windmill(ctx, 252, 486, t);
      bridge(ctx, st.bridge[0], st.bridge[1]);
      picnic(ctx, 930, 584);
      for (const s of st.sheep) sheep(ctx, s);
      for (const tr of st.trees) {
        ctx.fillStyle = tr.tone < 0.5 ? '#2f7a3a' : '#3b8a3f'; circle(ctx, tr.x, tr.y, tr.r);
        ctx.fillStyle = tr.tone < 0.5 ? '#4a9a48' : '#5aa84c'; circle(ctx, tr.x - tr.r * 0.22, tr.y - tr.r * 0.25, tr.r * 0.62);
        ctx.fillStyle = 'rgba(200,235,150,.35)'; circle(ctx, tr.x - tr.r * 0.38, tr.y - tr.r * 0.4, tr.r * 0.26);
      }
      ctx.fillStyle = 'rgba(20,45,40,.24)'; circle(ctx, st.balloon.x + SOX, st.balloon.y + SOY, 19);
    },

    drawOver(ctx, st, env) {
      const t = env.time;
      for (const p of st.puffs) {
        const age = t - p.t0;
        if (age < 0) continue;
        const k = age / 1.2, e = 1 - (1 - k) * (1 - k);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * (1 - k)).toFixed(3) + ')';
        circle(ctx, p.x + Math.cos(p.a) * (40 + p.sp * e), p.y + Math.sin(p.a) * (40 + p.sp * e), p.r * (0.6 + k));
      }
      balloon(ctx, st.balloon.x, st.balloon.y, 21, t * 0.05);
      ctx.strokeStyle = 'rgba(38,50,68,.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      drawFlock(ctx, st.flock, t); drawFlock(ctx, st.flock2, t);
      ctx.lineCap = 'butt';
    },
  });
})();
