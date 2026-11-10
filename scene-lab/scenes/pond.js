/* 图版：锦鲤莲池 —— 文件是莲叶，锦鲤在叶下穿行，放下文件会荡开涟漪 */
(function () {
  'use strict';
  const { W, H, TAU, clamp, hash, noise1, circle } = DD;

  const FRAG = `
vec3 shade(vec2 p){
  float t=u_time;
  // 涟漪：既推开水下的画面（折射），也在水面留下高光
  vec2 disp=vec2(0.);float hl=0.;
  for(int i=0;i<MAXR;i++){
    vec4 r=u_rip[i];
    if(r.w>0.){
      vec2 dv=p-r.xy;float L=length(dv)+1e-3;
      float x=L-(r.z*70.+8.);
      float env=exp(-x*x/(260.+r.z*520.))*exp(-r.z*1.05)*r.w;
      float wv=sin(x*.42)*env;
      disp+=dv/L*wv*7.;hl+=wv;
    }
  }
  vec2 amb=vec2(sin(p.y*.031+t*.8)+sin(p.x*.017-t*.5),cos(p.x*.027-t*.7)+sin(p.y*.021+t*.4))*1.3;
  vec2 q=p+disp+amb;
  // 池底：深浅不一的水色 + 卵石
  float n=fbm(q*.004+vec2(1.3,8.));
  vec3 bot=mix(vec3(.06,.22,.24),vec3(.12,.35,.33),ss(.25,.75,n));
  vec3 v=voro(q*.034,0.);
  vec3 peb=mix(vec3(.19,.29,.28),vec3(.36,.44,.39),v.z)*(1.12-.45*v.x);
  bot=mix(bot,peb,ss(.05,.14,v.y)*.30);
  // 莲叶投在水里的影子
  float sh=ss(.46,.66,fieldF(q-vec2(16.,20.)));
  bot*=1.-.40*sh;
  // 水下的锦鲤
  vec4 s=texture2D(u_spr,q/u_world);
  vec3 col=bot*(1.-s.a)+mix(s.rgb,bot*s.a,.14)*(1.-.32*sh);
  float ca=1.-ss(0.,.2,voro(q*.02+vec2(t*.02,0.),t*.5).y);
  col+=ca*ca*.045*vec3(.7,1.,.9);
  float sheen=ss(.55,.95,fbm(p*.003+vec2(t*.01,2.)));
  col=mix(col,vec3(.55,.76,.73),sheen*.10);
  col+=hl*vec3(.55,.66,.6)*.32;
  vec2 uv=p/u_world-.5;col*=1.-dot(uv,uv)*.5;
  return col;
}`;

  const KOI = [
    { base: '#f7f2e8', spots: ['#e2452d', '#e2452d'] },
    { base: '#f28a22', spots: ['#fff3df'] },
    { base: '#f3b838', spots: [] },
    { base: '#f7f2e8', spots: ['#26282b', '#e2452d'] },
    { base: '#30343a', spots: ['#f28a22'] },
    { base: '#f7f2e8', spots: ['#f28a22', '#f28a22', '#e2452d'] },
  ];
  const NSEG = 10;

  function mkKoi(i) {
    const x = 100 + hash(i, 1) * (W - 200), y = 100 + hash(i, 2) * (H - 260), h = hash(i, 3) * TAU;
    const k = { x, y, h, v: 24 + hash(i, 4) * 14, len: 62 + hash(i, 5) * 38, seed: i * 3.7 + 2, pal: KOI[i % KOI.length], pts: [], spots: [], boost: 0 };
    const seg = k.len / (NSEG - 1);
    for (let j = 0; j < NSEG; j++) k.pts.push([x - Math.cos(h) * j * seg, y - Math.sin(h) * j * seg]);
    k.pal.spots.forEach((c, j) => k.spots.push({ c, u: 0.12 + hash(i, 10 + j) * 0.6, r: 0.55 + hash(i, 20 + j) * 0.5, side: (hash(i, 30 + j) - 0.5) * 1.2 }));
    return k;
  }

  function drawKoi(ctx, k, t) {
    const P = [];
    for (let j = 0; j < NSEG; j++) {
      const a = k.pts[Math.max(0, j - 1)], b = k.pts[Math.min(NSEG - 1, j + 1)];
      let tx = a[0] - b[0], ty = a[1] - b[1];
      const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      const u = j / (NSEG - 1);
      const wig = Math.sin(t * (5 + k.boost * 7) - u * 5.5 + k.seed) * k.len * 0.034 * (0.2 + u);
      P.push({ x: k.pts[j][0] - ty * wig, y: k.pts[j][1] + tx * wig, nx: -ty, ny: tx, tx, ty, u });
    }
    const W0 = k.len * 0.135;
    const wid = u => W0 * (u < 0.2 ? 0.6 + 0.4 * (u / 0.2) : Math.pow(1 - (u - 0.2) / 0.8, 0.85) * 0.93 + 0.07);
    const fin = 'rgba(255,255,255,.55)';
    // 胸鳍
    const f = P[2];
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(f.x + f.nx * s * wid(f.u) * 0.8, f.y + f.ny * s * wid(f.u) * 0.8);
      ctx.rotate(Math.atan2(f.ty, f.tx) + s * (2.25 + Math.sin(t * 3 + k.seed) * 0.2));
      ctx.fillStyle = fin; ctx.beginPath(); ctx.ellipse(k.len * 0.07, 0, k.len * 0.1, k.len * 0.04, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // 尾鳍
    const e = P[NSEG - 1], ea = Math.atan2(-e.ty, -e.tx) + Math.sin(t * (5 + k.boost * 7) - 5.5 + k.seed) * 0.5;
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(ea);
    ctx.fillStyle = fin; const TL = k.len * 0.3;
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(TL * 0.5, -TL * 0.16, TL, -TL * 0.42); ctx.quadraticCurveTo(TL * 0.72, 0, TL, TL * 0.42); ctx.quadraticCurveTo(TL * 0.5, TL * 0.16, -2, 0); ctx.fill();
    ctx.restore();
    // 身体
    const body = () => {
      ctx.beginPath();
      const hd = P[0];
      ctx.moveTo(hd.x + hd.nx * wid(0), hd.y + hd.ny * wid(0));
      ctx.quadraticCurveTo(hd.x + hd.tx * W0 * 1.25, hd.y + hd.ty * W0 * 1.25, hd.x - hd.nx * wid(0), hd.y - hd.ny * wid(0));
      for (let j = 1; j < NSEG; j++) ctx.lineTo(P[j].x - P[j].nx * wid(P[j].u), P[j].y - P[j].ny * wid(P[j].u));
      for (let j = NSEG - 1; j >= 1; j--) ctx.lineTo(P[j].x + P[j].nx * wid(P[j].u), P[j].y + P[j].ny * wid(P[j].u));
      ctx.closePath();
    };
    ctx.fillStyle = k.pal.base; body(); ctx.fill();
    if (k.spots.length) {
      ctx.save(); body(); ctx.clip();
      for (const sp of k.spots) {
        const q = P[Math.round(sp.u * (NSEG - 1))];
        ctx.fillStyle = sp.c; circle(ctx, q.x + q.nx * sp.side * W0, q.y + q.ny * sp.side * W0, W0 * sp.r * 1.25);
      }
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(P[2].x, P[2].y); for (let j = 3; j < 7; j++) ctx.lineTo(P[j].x, P[j].y); ctx.stroke();
    const hd = P[0];
    ctx.fillStyle = 'rgba(20,20,20,.75)';
    for (const s of [-1, 1]) circle(ctx, hd.x + hd.tx * W0 * 0.35 + hd.nx * s * W0 * 0.55, hd.y + hd.ty * W0 * 0.35 + hd.ny * s * W0 * 0.55, 1.1);
  }

  function pad(ctx, d) {
    const r = d.r * d.s;
    if (r < 0.5) return;
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, d.main ? '#86c467' : '#7bbb5f'); g.addColorStop(1, d.main ? '#3f8a45' : '#3a8246');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, 0.17, TAU - 0.17); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = Math.max(0.6, r * 0.02);
    for (let i = 1; i < 11; i++) { const a = 0.17 + (TAU - 0.34) * i / 11; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(214,242,172,.5)'; ctx.lineWidth = Math.max(0.8, r * 0.035);
    ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2, 0.17, TAU - 0.17); ctx.stroke();
    ctx.restore();
  }
  function lotus(ctx, d) {
    const r = d.r * d.s;
    if (r < 0.5) return;
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    ctx.fillStyle = 'rgba(8,38,34,.28)'; circle(ctx, r * 0.22, r * 0.3, r * 0.95);
    for (const L of d.bud ? [[5, 0.62, '#f29bb6', 0], [3, 0.36, '#fbd0da', 0.4]] : [[9, 1, '#f5aec3', 0], [7, 0.72, '#fbd0da', 0.3], [5, 0.45, '#fff0f2', 0.1]]) {
      ctx.fillStyle = L[2];
      for (let i = 0; i < L[0]; i++) {
        ctx.save(); ctx.rotate(i / L[0] * TAU + L[3]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * L[1] * 0.5, -r * L[1] * 0.34, r * L[1], 0); ctx.quadraticCurveTo(r * L[1] * 0.5, r * L[1] * 0.34, 0, 0); ctx.fill();
        ctx.restore();
      }
    }
    if (!d.bud) { ctx.fillStyle = '#f4c542'; circle(ctx, 0, 0, r * 0.2); }
    ctx.restore();
  }
  function frog(ctx, x, y, h, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(h); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(10,40,20,.28)'; ctx.beginPath(); ctx.ellipse(1.2, 2.2, 7, 5.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3f8a34';
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(-4, sd * 5, 4.2, 2.2, sd * 0.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, sd * 4, 2.6, 1.3, -sd * 0.5, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#58ad43'; ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#86d466'; ctx.beginPath(); ctx.ellipse(1, 0, 3.6, 2.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#22301a'; circle(ctx, 4.6, -2.4, 1.1); circle(ctx, 4.6, 2.4, 1.1);
    ctx.restore();
  }
  function dragonfly(ctx, d, t) {
    ctx.save(); ctx.translate(d.x + 8, d.y + 11); ctx.rotate(d.h); ctx.fillStyle = 'rgba(0,22,22,.22)'; ctx.fillRect(-8, -0.9, 13, 1.8); ctx.restore();
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.h);
    const fl = 0.6 + 0.4 * Math.sin(t * 60 + d.seed);
    ctx.fillStyle = 'rgba(235,250,255,' + (0.3 + 0.3 * fl).toFixed(3) + ')';
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(1.5, sd * 5.5, 2, 5.5, sd * 0.25, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-1.6, sd * 5, 1.8, 5, -sd * 0.2, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = d.col; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(3, 0); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = d.col; circle(ctx, 3.6, 0, 1.7);
    ctx.restore();
  }

  DD.register({
    id: 'pond', name: '锦鲤莲池', en: 'Koi Pond', accent: '#d8582e',
    short: '文件是莲叶，锦鲤在叶下穿行。',
    tagline: '俯视一方池塘。每个文件是一片莲叶，锦鲤在叶下穿行；放下文件，水面会荡开一圈涟漪。',
    rules: [
      ['1 个文件', '一片大莲叶托着图标，旁边漂着几片小的'],
      ['2–3 个相邻', '莲叶成簇，冒出花苞'],
      ['4 个以上', '荷花盛开，青蛙住了进来，在叶子之间跳'],
      ['放下文件', '涟漪荡开，附近的锦鲤先惊散，再好奇地游回来'],
    ],
    life: ['锦鲤', '涟漪', '蜻蜓', '青蛙', '池底卵石', '偶尔的雨点'],
    meta: { read: 4, cost: 3, power: 2 },
    note: '深色水面上的白色文件名最清楚；锦鲤的游动是这个场景的主要工作量。',
    R: 135, T: 0.34, grow: 0,
    frag: FRAG,

    init() {
      const st = { decor: new DD.Decor(), koi: [], flies: [], frogs: [], lure: null, rain: 2 };
      for (let i = 0; i < 9; i++) st.koi.push(mkKoi(i));
      for (let i = 0; i < 2; i++) st.flies.push({ x: 300 + i * 600, y: 300 + i * 200, tx: 300 + i * 600, ty: 300 + i * 200, h: 0, hold: 1 + i, seed: i * 11.3, col: i ? '#e2452d' : '#3aa6d8' });
      return st;
    },

    layout(st, env) {
      const D = st.decor, P = new DD.Packer(), live = env.live();
      D.begin();
      for (const e of live) { D.put('pad', e.x, e.y, { r: 55 + hash(e.seed, 1) * 6, rot: hash(e.seed, 2) * TAU, main: true }); P.add(e.x, e.y, 52); }
      const small = new Map(); // 簇 → 小莲叶的位置（青蛙的落脚点）
      for (const e of live) {
        let n = 0;
        for (let k = 0; k < 12 && n < 2 + Math.min(3, e.tc); k++) {
          const ang = hash(e.seed, k * 1.9 + 3) * TAU, rr = 66 + hash(e.seed, k * 2.3 + 7) * 50, r = 12 + hash(e.seed, k * 4.1) * 15;
          const x = e.x + Math.cos(ang) * rr, y = e.y + Math.sin(ang) * rr;
          if (!env.inside(x, y, 14) || !env.iconClear(x, y, 0) || !P.take(x, y, r + 1)) continue;
          D.put('leaf', x, y, { r, rot: hash(e.seed, k * 3.3) * TAU });
          if (r > 15) { if (!small.has(e.tc + ':' + clusterKey(env, e))) small.set(e.tc + ':' + clusterKey(env, e), []); small.get(e.tc + ':' + clusterKey(env, e)).push([x, y]); }
          n++;
        }
        if (e.tc >= 2) { // 花苞 / 荷花
          for (let k = 0; k < 8; k++) {
            const ang = hash(e.seed, k * 2.7 + 41) * TAU, rr = 58 + hash(e.seed, k * 3.1 + 43) * 30;
            const x = e.x + Math.cos(ang) * rr, y = e.y + Math.sin(ang) * rr;
            if (!env.inside(x, y, 14) || !env.iconClear(x, y, 8)) continue;
            const bud = e.tc < 4 || hash(e.seed, 47) < 0.3;
            if (!P.take(x, y, bud ? 8 : 13)) continue;
            D.put('lotus', x, y, { r: bud ? 9 : 14 + hash(e.seed, 49) * 4, rot: hash(e.seed, 51) * TAU, bud });
            break;
          }
        }
      }
      // 青蛙：每个 4 个文件以上的簇一只
      const frogs = [];
      for (const cl of env.clusters) {
        if (cl.n < 4) continue;
        const spots = small.get(cl.n + ':' + cl.seed);
        if (!spots || !spots.length) continue;
        const old = st.frogs.find(f => f.key === cl.seed);
        frogs.push({ key: cl.seed, spots, i: old ? old.i % spots.length : 0, x: old ? old.x : spots[0][0], y: old ? old.y : spots[0][1], h: old ? old.h : 0.6, hop: -1, wait: 3 + hash(cl.seed, 3) * 5, s: old ? old.s : 0, fx: 0, fy: 0 });
      }
      st.frogs = frogs;
    },

    update(st, env, dt) {
      const t = env.time;
      st.decor.step(dt, () => true);
      for (const k of st.koi) {
        let om = (noise1(k.seed, t * 0.3) - 0.5) * 1.6, ax = 0, ay = 0;
        const m = 70;
        if (k.x < m) ax += 1; if (k.x > W - m) ax -= 1;
        if (k.y < m + 20) ay += 1; if (k.y > H - m) ay -= 1;
        if (st.lure && t - st.lure.t0 > 1.3 && t - st.lure.t0 < 9) { // 惊散之后，好奇地游回来看看
          const dx = st.lure.x - k.x, dy = st.lure.y - k.y, L = Math.hypot(dx, dy);
          if (L < 430 && L > 46) { ax += dx / L * 0.9; ay += dy / L * 0.9; }
        }
        if (ax || ay) { let dh = Math.atan2(ay, ax) - k.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); om += clamp(dh, -1, 1) * 1.7; }
        k.h += om * dt;
        k.boost = Math.max(0, k.boost - dt * 1.4);
        const v = k.v * (1 + k.boost * 3.2);
        k.x += Math.cos(k.h) * v * dt; k.y += Math.sin(k.h) * v * dt;
        const seg = k.len / (NSEG - 1) * 0.92;
        k.pts[0][0] = k.x; k.pts[0][1] = k.y;
        for (let j = 1; j < NSEG; j++) {
          const a = k.pts[j - 1], b = k.pts[j], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
          b[0] = a[0] + dx / L * seg; b[1] = a[1] + dy / L * seg;
        }
      }
      for (const d of st.flies) { // 蜻蜓：悬停一会儿，再猛地窜到别处
        d.hold -= dt;
        const dx = d.tx - d.x, dy = d.ty - d.y, L = Math.hypot(dx, dy);
        if (L > 3) { d.h = Math.atan2(dy, dx); const sp = Math.min(L, 260 * dt); d.x += dx / L * sp; d.y += dy / L * sp; }
        else if (d.hold <= 0) {
          d.hold = 1 + Math.random() * 3.5;
          const pads = st.decor.list('leaf');
          if (pads.length && Math.random() < 0.6) { const p = pads[Math.floor(Math.random() * pads.length)]; d.tx = p.x; d.ty = p.y; }
          else { d.tx = 60 + Math.random() * (W - 120); d.ty = 70 + Math.random() * (H - 220); }
        }
      }
      for (const f of st.frogs) {
        f.s += (1 - f.s) * (1 - Math.exp(-dt * 4));
        if (f.hop >= 0) {
          f.hop += dt / 0.55;
          const k = Math.min(1, f.hop), e = k * k * (3 - 2 * k), to = f.spots[f.i];
          f.x = f.fx + (to[0] - f.fx) * e; f.y = f.fy + (to[1] - f.fy) * e; f.lift = Math.sin(Math.PI * k);
          if (k >= 1) { f.hop = -1; f.lift = 0; env.ripple(f.x, f.y, 0.45); }
        } else if ((f.wait -= dt) <= 0 && f.spots.length > 1) {
          f.wait = 5 + Math.random() * 8; f.fx = f.x; f.fy = f.y;
          f.i = (f.i + 1 + Math.floor(Math.random() * (f.spots.length - 1))) % f.spots.length;
          f.h = Math.atan2(f.spots[f.i][1] - f.y, f.spots[f.i][0] - f.x); f.hop = 0;
          env.ripple(f.x, f.y, 0.35);
        }
      }
      if ((st.rain -= dt) <= 0) { st.rain = 1.6 + Math.random() * 3.4; env.ripple(40 + Math.random() * (W - 80), 50 + Math.random() * (H - 160), 0.3 + Math.random() * 0.3); }
    },

    drop(st, env, x, y) {
      st.lure = { x, y, t0: env.time };
      for (const k of st.koi) {
        const dx = k.x - x, dy = k.y - y;
        if (Math.hypot(dx, dy) < 250) { k.boost = 1; k.h = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.8; }
      }
    },

    drawUnder(ctx, st, env) {
      for (const k of st.koi) drawKoi(ctx, k, env.time);
    },

    drawOver(ctx, st, env) {
      const t = env.time, D = st.decor;
      for (const d of D.list('leaf')) pad(ctx, d);
      for (const d of D.list('pad')) pad(ctx, d);
      for (const d of D.list('lotus')) lotus(ctx, d);
      for (const f of st.frogs) frog(ctx, f.x, f.y, f.h, f.s * (1 + 0.45 * (f.lift || 0)));
      for (const d of st.flies) dragonfly(ctx, d, t);
    },
  });

  function clusterKey(env, e) {
    for (const cl of env.clusters) if (cl.members.indexOf(e) >= 0) return cl.seed;
    return 0;
  }
})();
