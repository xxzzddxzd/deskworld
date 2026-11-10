/* 图版：枯山水 —— 文件是苔岛，砂纹绕着它一圈圈荡开 */
(function () {
  'use strict';
  const { W, H, TAU, hash, circle } = DD;

  const FRAG = `
vec3 shade(vec2 p){
  vec4 F=fieldAt(p);
  float cn=fbm(p*.018+4.);
  float f=F.x+(cn-.5)*.16*ss(.03,.3,F.x);
  float sd=isoDist(f);
  float d=-sd;                                   // 离苔岛边缘的距离
  float k=6.2831/9.5;                            // 砂纹间距 9.5
  vec2 L=vec2(-.6,-.8);                          // 光从左上来
  vec2 od=-normalize(F.yz+vec2(1e-5,0.));        // 朝外的方向
  // 远处是横向的直纹，靠近苔岛的一圈改成同心纹
  float ring=1.-ss(56.,58.,d);
  float phA=(p.y+5.*sin(p.x*.0035)+2.*vnoise(p*.01))*k;
  float phB=d*k+1.2;
  float h=mix(sin(phA),sin(phB),ring);
  float lit=mix(.8*cos(phA),-cos(phB)*dot(od,L),ring);
  vec3 col=vec3(.845,.815,.745)+lit*.075+h*.012+(hash21(floor(p*1.6))-.5)*.035;
  col-=.05*(1.-ss(0.,1.6,abs(d-57.)));           // 两种纹路交界处的一道浅沟
  col*=.97+.06*fbm(p*.003+9.);
  col*=1.-.30*(1.-ss(0.,9.,d))*max(0.,dot(od,vec2(.6,.8)))*step(0.,d);   // 苔岛落在砂上的影子
  // 苔岛
  float mn=fbm(p*.06+2.),mn2=fbm(p*.2+5.);
  vec3 moss=mix(vec3(.30,.44,.22),vec3(.46,.58,.28),ss(.3,.75,mn));
  moss=mix(moss,vec3(.22,.35,.18),ss(.5,.8,mn2)*.5);
  moss*=.86+.30*clamp(.5+dot(F.yz,vec2(1.,1.))*30.,0.,1.);
  vec3 land=mix(vec3(.36,.31,.24),moss,ss(1.5,5.,sd+(mn-.5)*3.));
  return mix(col,land,ss(-.7,.7,sd));
}`;

  function rock(ctx, d) {
    const r = d.r * d.s;
    if (r < 0.5) return;
    const pts = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + d.rot, q = r * (0.74 + hash(d.seed, i) * 0.32); pts.push([Math.cos(a) * q * 1.15, Math.sin(a) * q * 0.9]); }
    const path = (ox, oy, k) => { ctx.beginPath(); pts.forEach((p, i) => { const x = d.x + ox + p[0] * k, y = d.y + oy + p[1] * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); };
    ctx.fillStyle = 'rgba(40,36,28,.32)'; path(r * 0.28, r * 0.38, 1); ctx.fill();
    ctx.fillStyle = '#6c6e69'; path(0, 0, 1); ctx.fill();
    ctx.fillStyle = '#91938c'; path(-r * 0.14, -r * 0.18, 0.72); ctx.fill();
    ctx.fillStyle = '#b4b6ae'; path(-r * 0.26, -r * 0.32, 0.36); ctx.fill();
  }
  function blob(ctx, x, y, r, n, amp, rot) {
    ctx.beginPath();
    for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * TAU + rot, q = r * (1 - amp * (i % 2)); if (i) ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); else ctx.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    ctx.closePath(); ctx.fill();
  }
  function pine(ctx, d) {
    const r = d.r * d.s;
    if (r < 0.5) return;
    ctx.fillStyle = 'rgba(30,36,24,.3)'; blob(ctx, d.x + r * 0.3, d.y + r * 0.42, r, 9, 0.24, d.rot);
    ctx.fillStyle = '#2d5633'; blob(ctx, d.x, d.y, r, 9, 0.24, d.rot);
    ctx.fillStyle = '#3d7141'; blob(ctx, d.x - r * 0.12, d.y - r * 0.15, r * 0.68, 8, 0.26, d.rot + 0.4);
    ctx.fillStyle = '#5a9152'; blob(ctx, d.x - r * 0.22, d.y - r * 0.27, r * 0.34, 7, 0.22, d.rot + 0.9);
  }
  const MAPLE = ['#b33524', '#d0502a', '#e8772f', '#f29d42'];
  function maple(ctx, d) {
    const r = d.r * d.s;
    if (r < 0.5) return;
    ctx.fillStyle = 'rgba(40,30,20,.26)';
    for (let i = 0; i < 9; i++) { const a = hash(d.seed, i) * TAU, q = Math.sqrt(hash(d.seed, i + 9)) * r * 0.62; circle(ctx, d.x + Math.cos(a) * q + r * 0.3, d.y + Math.sin(a) * q + r * 0.42, r * 0.46); }
    for (let layer = 0; layer < 4; layer++) {
      ctx.fillStyle = MAPLE[layer];
      for (let i = 0; i < 9 - layer * 2; i++) {
        const a = hash(d.seed + layer * 7, i) * TAU, q = Math.sqrt(hash(d.seed + layer * 7, i + 9)) * r * (0.62 - layer * 0.1);
        circle(ctx, d.x + Math.cos(a) * q - layer * r * 0.07, d.y + Math.sin(a) * q - layer * r * 0.09, r * (0.46 - layer * 0.08));
      }
    }
  }
  function hex(ctx, x, y, r) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.5; if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); }
  function lantern(ctx, d) {
    const s = d.s;
    ctx.fillStyle = 'rgba(40,36,28,.32)'; hex(ctx, d.x + 3.5 * s, d.y + 4.5 * s, 10 * s);
    ctx.fillStyle = '#85877f'; hex(ctx, d.x, d.y, 10 * s);
    ctx.fillStyle = '#a9aba3'; hex(ctx, d.x - s, d.y - 1.3 * s, 6.6 * s);
    ctx.fillStyle = '#ffd98a'; circle(ctx, d.x - s, d.y - 1.3 * s, 2 * s);
  }
  function leaf(ctx, l) {
    const fall = Math.max(0, 1 - l.age / l.fall), sz = l.sz * (1 + fall * 0.35);
    const a = l.age > l.fall + 20 ? Math.max(0, 1 - (l.age - l.fall - 20) / 5) : 1;
    ctx.globalAlpha = a * 0.25;
    ctx.fillStyle = '#28200f'; ctx.save(); ctx.translate(l.x + 1.5 + fall * 9, l.y + 2 + fall * 12); ctx.rotate(l.rot); star5(ctx, sz); ctx.restore();
    ctx.globalAlpha = a;
    ctx.fillStyle = l.col; ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rot); star5(ctx, sz); ctx.restore();
    ctx.globalAlpha = 1;
  }
  function star5(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, q = i % 2 ? r * 0.5 : r; if (i) ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); else ctx.moveTo(Math.cos(a) * q, Math.sin(a) * q); }
    ctx.closePath(); ctx.fill();
  }

  // 在一簇文件周围找一个符合条件的落点
  function around(members, seed, tries, rmin, rmax, ok) {
    for (let k = 0; k < tries; k++) {
      const m = members[Math.floor(hash(seed, k * 1.3) * members.length) % members.length];
      const a = hash(seed, k * 2.1 + 5) * TAU, r = rmin + hash(seed, k * 3.7 + 9) * (rmax - rmin);
      const x = m.x + Math.cos(a) * r, y = m.y + Math.sin(a) * r;
      if (ok(x, y)) return [x, y];
    }
    return null;
  }

  DD.register({
    id: 'zen', name: '枯山水', en: 'Zen Garden', accent: '#6f8a4a',
    short: '文件是苔岛，砂纹绕着它一圈圈荡开。',
    tagline: '一座耙好的砂庭。每个文件是一座苔岛，砂纹绕着它一圈圈荡开；文件聚在一起，岛上便长出松与枫。',
    rules: [
      ['1 个文件', '一座小苔岛，旁边置一两块石头，砂纹同心环绕'],
      ['2–3 个相邻', '苔岛相连，长出一棵矮松'],
      ['4 个以上', '大苔岛上立起红枫，落叶飘到砂上；再多些还有石灯笼'],
      ['拖走文件', '旧岛沉回砂里，砂纹跟着重新耙过'],
    ],
    life: ['同心砂纹', '置石', '矮松与红枫', '飘落的枫叶', '石灯笼'],
    meta: { read: 4, cost: 1, power: 1 },
    note: '最安静、最省电的一个：没有文件变动时画面几乎静止，只有落叶在动。',
    R: 150, T: 0.36, grow: 0.03,
    frag: FRAG,

    init() { return { decor: new DD.Decor(), leaves: [], leafT: 1 }; },

    layout(st, env) {
      const D = st.decor, P = new DD.Packer();
      D.begin();
      for (const e of env.live()) {
        let n = 0;
        const want = e.tc >= 3 ? 1 : 2;
        for (let k = 0; k < 10 && n < want; k++) {
          const a = hash(e.seed, k * 1.7 + 2) * TAU, rr = 54 + hash(e.seed, k * 2.3 + 4) * 20, r = 8 + hash(e.seed, k * 3.1 + 6) * 8;
          const x = e.x + Math.cos(a) * rr, y = e.y + Math.sin(a) * rr;
          if (!env.inside(x, y, 14) || env.sdS(x, y) < 5 || !env.iconClear(x, y, 2) || !P.take(x, y, r + 2)) continue;
          D.put('rock', x, y, { r, rot: hash(e.seed, k) * TAU, seed: e.seed + k, need: 2 });
          n++;
        }
      }
      for (const cl of env.clusters) {
        if (cl.n >= 4) {
          const p = around(cl.members, cl.seed + 3, 40, 66, 112, (x, y) => env.inside(x, y, 30) && env.sdS(x, y) > 6 && env.iconClear(x, y, 22) && P.fits(x, y, 30));
          if (p) { P.add(p[0], p[1], 30); D.put('maple', p[0], p[1], { r: 36 + hash(cl.seed, 5) * 8, seed: cl.seed, need: 0 }); }
        }
        if (cl.n >= 2) {
          for (let i = 0; i < (cl.n >= 5 ? 2 : 1); i++) {
            const p = around(cl.members, cl.seed + 11 + i * 17, 30, 56, 92, (x, y) => env.inside(x, y, 20) && env.sdS(x, y) > 12 && env.iconClear(x, y, 10) && P.fits(x, y, 19));
            if (p) { P.add(p[0], p[1], 19); D.put('pine', p[0], p[1], { r: 16 + hash(cl.seed, 7 + i) * 6, rot: hash(cl.seed, 9 + i) * TAU, need: 6 }); }
          }
        }
        if (cl.n >= 6) {
          const p = around(cl.members, cl.seed + 29, 30, 54, 96, (x, y) => env.inside(x, y, 20) && env.sdS(x, y) > 10 && env.iconClear(x, y, 6) && P.fits(x, y, 12));
          if (p) { P.add(p[0], p[1], 12); D.put('lantern', p[0], p[1], { need: 4 }); }
        }
      }
    },

    update(st, env, dt) {
      st.decor.step(dt, d => env.sd(d.x, d.y) > d.need);
      if ((st.leafT -= dt) <= 0) {
        st.leafT = 0.5 + Math.random() * 1.3;
        const maples = st.decor.list('maple');
        let x, y;
        if (maples.length) { const m = maples[Math.floor(Math.random() * maples.length)], a = Math.random() * TAU; x = m.x + Math.cos(a) * m.r * 0.7; y = m.y + Math.sin(a) * m.r * 0.7; }
        else if (Math.random() < 0.25) { x = Math.random() * W * 0.8; y = 30 + Math.random() * 60; }
        if (x !== undefined && st.leaves.length < 70) {
          st.leaves.push({ x, y, vx: 14 + Math.random() * 18, vy: 9 + Math.random() * 11, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 5, fall: 1.6 + Math.random() * 2.4, age: 0, col: MAPLE[Math.floor(Math.random() * 4)], sz: 3 + Math.random() * 2.2 });
        }
      }
      for (const l of st.leaves) {
        l.age += dt;
        if (l.age < l.fall) { l.x += (l.vx + Math.sin(l.age * 3 + l.rot) * 10) * dt; l.y += l.vy * dt; l.rot += l.vr * dt; }
      }
      st.leaves = st.leaves.filter(l => l.age < l.fall + 25);
    },

    drawOver(ctx, st) {
      const D = st.decor;
      for (const l of st.leaves) if (l.age >= l.fall) leaf(ctx, l);
      for (const d of D.list('rock')) rock(ctx, d);
      for (const d of D.list('lantern')) lantern(ctx, d);
      for (const d of D.list('pine')) pine(ctx, d);
      for (const d of D.list('maple')) maple(ctx, d);
      for (const l of st.leaves) if (l.age < l.fall) leaf(ctx, l);
    },
  });
})();
