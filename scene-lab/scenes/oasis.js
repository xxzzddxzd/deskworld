/* 图版：沙漠绿洲 —— 文件所在之处涌出泉水，驼队在绿洲之间往返 */
(function () {
  'use strict';
  const { W, H, TAU, clamp, hash, circle } = DD;

  const FRAG = `
vec3 shade(vec2 p){
  float t=u_time;
  // ---- 沙丘：迎风面亮，背风面一道深影
  float wv=fbm(p*.0032+vec2(1.,5.));
  float wv2=fbm(p*.009+vec2(8.,2.));
  float ph=(p.x*.80+p.y*.42)*.030+wv*8.+wv2*1.;
  float s=fract(ph/6.2831);
  float up=ss(0.,.72,s)*(1.-ss(.72,.745,s));
  float lee=ss(.72,.745,s)*(1.-ss(.745,1.,s));
  vec3 c=mix(vec3(.89,.69,.43),vec3(.98,.84,.58),up);
  c=mix(c,vec3(.64,.43,.27),lee*.85);
  c+=sin((p.x*.55-p.y*.75)+6.*vnoise(p*.012))*.012;          // 细小的风纹
  c+=(hash21(floor(p*1.4))-.5)*.03;
  // ---- 绿洲
  vec4 F=fieldAt(p);
  float cn=fbm(p*.02+vec2(6.,1.));
  float f=F.x+(cn-.5)*.30*ss(.02,.3,F.x);
  float sd=isoDist(f);
  float lush=F.w/max(F.x,1e-3);
  float gn=fbm(p*.05+3.);
  float fr=ss(-36.,-4.,sd);                                    // 外圈：被水汽润湿的沙和零星灌木
  c=mix(c,c*vec3(.84,.83,.72),fr*.6);
  vec2 cell=floor(p/5.);
  float scr=step(.86,hash21(cell))*fr*(1.-ss(1.,2.3,length(p-(cell+.5)*5.)));
  c=mix(c,vec3(.48,.55,.27),scr);
  vec3 gr=mix(vec3(.62,.69,.30),vec3(.32,.58,.27),ss(2.,22.,sd+(gn-.5)*14.));
  c=mix(c,gr,ss(-1.,1.5,sd+(gn-.5)*8.));
  float wd=sd-mix(40.,22.,ss(1.,4.,lush))+(gn-.5)*10.;         // 簇越大，水面越开阔
  vec3 wat=mix(vec3(.36,.80,.78),vec3(.10,.55,.66),ss(0.,26.,wd));
  float cau=1.-ss(0.,.16,voro(p*.03+.5*vnoise(p*.02+t*.1),t*.6).y);
  wat+=.045*cau*cau;
  wat=mix(wat,vec3(.93,.97,.9),(1.-ss(0.,2.5,wd))*.6);
  c=mix(c,wat,ss(-.8,.8,wd));
  return c;
}`;

  function camel(ctx, x, y, h, col, cloth, bob) {
    for (let pass = 0; pass < 2; pass++) {
      ctx.save(); ctx.translate(x + (pass ? 0 : 9), y + (pass ? 0 : 12)); ctx.rotate(h);
      ctx.fillStyle = pass ? col : 'rgba(70,40,15,.3)';
      ctx.beginPath(); ctx.ellipse(0, 0, 8, 4.2, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6, -1.5); ctx.lineTo(13.5, -0.9 + bob); ctx.lineTo(13.5, 0.9 + bob); ctx.lineTo(6, 1.5); ctx.fill();
      ctx.beginPath(); ctx.ellipse(14.6, bob, 2.6, 1.7, 0, 0, TAU); ctx.fill();
      if (pass) {
        ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.ellipse(-0.5, 0, 3.4, 2.8, 0, 0, TAU); ctx.fill();
        if (cloth) { ctx.fillStyle = cloth; ctx.fillRect(-3.6, -4.4, 6.2, 8.8); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-3.6, -0.6, 6.2, 1.2); }
      }
      ctx.restore();
    }
  }
  function guide(ctx, x, y) {
    ctx.fillStyle = 'rgba(70,40,15,.3)'; ctx.beginPath(); ctx.ellipse(x + 5, y + 7, 3.4, 2.6, 0.9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f4efe2'; circle(ctx, x, y, 3.1);
    ctx.fillStyle = '#2f5d8a'; circle(ctx, x, y, 1.8);
  }
  function tent(ctx, d) {
    const s = d.s;
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    ctx.fillStyle = 'rgba(70,40,15,.3)'; ctx.fillRect(-9 * s + 5, -7 * s + 7, 18 * s, 14 * s);
    ctx.fillStyle = d.col; ctx.fillRect(-9 * s, -7 * s, 18 * s, 14 * s);
    ctx.fillStyle = 'rgba(255,255,255,.78)'; for (let i = -9; i < 9; i += 6) ctx.fillRect(i * s, -7 * s, 3 * s, 14 * s);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(-9 * s, 0, 18 * s, 7 * s);
    ctx.fillStyle = 'rgba(60,35,15,.6)'; ctx.fillRect(-9 * s, -0.6 * s, 18 * s, 1.2 * s);
    ctx.restore();
  }
  function stone(ctx, d) {
    const r = d.r * d.s;
    ctx.fillStyle = 'rgba(70,40,15,.3)'; ctx.beginPath(); ctx.ellipse(d.x + r * 0.5, d.y + r * 0.7, r * 1.15, r * 0.8, 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9a7650'; ctx.beginPath(); ctx.ellipse(d.x, d.y, r * 1.1, r * 0.8, d.rot, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c29a6c'; ctx.beginPath(); ctx.ellipse(d.x - r * 0.2, d.y - r * 0.22, r * 0.62, r * 0.42, d.rot, 0, TAU); ctx.fill();
  }

  DD.register({
    id: 'oasis', name: '沙漠绿洲', en: 'Oasis', accent: '#c9822b',
    short: '文件所在之处涌出泉水，长出绿洲。',
    tagline: '俯视一片沙丘。文件所在之处涌出泉水、长出绿洲；一支驼队在绿洲之间慢慢往返。',
    rules: [
      ['1 个文件', '一眼小泉，围着一圈草和两三棵椰枣树'],
      ['2–3 个相邻', '泉水连成池塘，绿意变厚'],
      ['4 个以上', '一片湖，湖边扎起条纹帐篷'],
      ['拖走文件', '泉水干涸，草色褪回黄沙；驼队会改道去新的绿洲'],
    ],
    life: ['驼队', '沙上的脚印', '沙丘的光影', '椰枣树', '帐篷'],
    meta: { read: 3, cost: 2, power: 1 },
    R: 150, T: 0.34, grow: 0.05,
    frag: FRAG,

    init(env) {
      const st = { decor: new DD.Decor(), car: null, stones: [] };
      const p = env.findSpot(-60, 90);
      st.car = { x: p[0], y: p[1], h: 0.5, v: 15, seed: 5.5, trail: [], wp: 0, pause: 0, moved: 0 };
      for (let i = 0; i < 16; i++) st.stones.push({ x: 40 + hash(i, 61) * (W - 80), y: 50 + hash(i, 62) * (H - 150), r: 3 + hash(i, 63) * 4, rot: hash(i, 64) * 3, s: 0 });
      return st;
    },

    layout(st, env) {
      const D = st.decor, P = new DD.Packer();
      D.begin();
      for (const e of env.live()) {
        let n = 0;
        for (let k = 0; k < 12 && n < 3; k++) {
          const a = hash(e.seed, k * 1.7 + 1) * TAU, rr = 56 + hash(e.seed, k * 2.9 + 5) * 62;
          const x = e.x + Math.cos(a) * rr, y = e.y + Math.sin(a) * rr;
          if (!env.inside(x, y, 16)) continue;
          const sd = env.sdS(x, y);
          if (sd > 3 && sd < 34 && env.iconClear(x, y, 10) && P.take(x, y, 15)) { D.put('palm', x, y, { r: 15 + hash(e.seed, k) * 13, rot: hash(e.seed, k + 3) * TAU, need: 0, max: 60 }); n++; }
        }
      }
      for (const cl of env.clusters) {
        if (cl.n < 4) continue;
        const cols = ['#c9463a', '#2f6f9f'];
        for (let i = 0, got = 0; i < 24 && got < 2; i++) {
          const a = hash(cl.seed, i * 1.9 + 31) * TAU;
          for (let r = 40; r < cl.rad + 260; r += 5) {
            const x = cl.cx + Math.cos(a) * r, y = cl.cy + Math.sin(a) * r;
            if (env.sdS(x, y) < -24) {
              if (env.inside(x, y, 24) && env.iconClear(x, y, 12) && P.take(x, y, 16)) { D.put('tent', x, y, { rot: a + 1.3, col: cols[got], need: -62, max: -10 }); got++; }
              break;
            }
          }
        }
      }
    },

    update(st, env, dt) {
      st.decor.step(dt, d => { const s = env.sd(d.x, d.y); return s > d.need && s < d.max; });
      for (const s of st.stones) { const tgt = env.sd(s.x, s.y) < -40 ? 1 : 0; s.s += (tgt - s.s) * (1 - Math.exp(-dt * 4)); }
      // 驼队：朝下一片绿洲走，走到水边歇一会儿，再去下一片
      const c = st.car, cls = env.clusters;
      if (c.pause > 0) { c.pause -= dt; return; }
      if (cls.length) {
        const cl = cls[c.wp % cls.length];
        let near = 1e9;
        for (const m of cl.members) near = Math.min(near, Math.hypot(m.x - c.x, m.y - c.y));
        if (near < 200 && env.sd(c.x, c.y) > -48) { c.pause = 3 + Math.random() * 3; c.wp = (c.wp + 1) % Math.max(1, cls.length); return; }
        let dh = Math.atan2(cl.cy - c.y, cl.cx - c.x) - c.h;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        c.h += clamp(dh, -1, 1) * 0.9 * dt;
      }
      const ox = c.x, oy = c.y;
      DD.steer(c, env, dt, { look: 36, lim: -12, wander: 0.15, turn: 1.7, margin: 40 });
      c.moved += Math.hypot(c.x - ox, c.y - oy);
      if (c.moved > 3) { c.moved = 0; c.trail.unshift({ x: c.x, y: c.y, h: c.h }); if (c.trail.length > 150) c.trail.pop(); }
    },

    drawOver(ctx, st, env) {
      const t = env.time, D = st.decor, c = st.car;
      for (const s of st.stones) if (s.s > 0.02) stone(ctx, s);
      // 脚印：队尾之后的一串小点，越远越淡
      for (let i = 30; i < c.trail.length; i += 2) {
        const q = c.trail[i], a = 0.22 * (1 - (i - 30) / 120), side = (i / 2) % 2 ? 1.6 : -1.6;
        ctx.fillStyle = 'rgba(110,70,35,' + Math.max(0, a).toFixed(3) + ')';
        circle(ctx, q.x - Math.sin(q.h) * side, q.y + Math.cos(q.h) * side, 1.3);
      }
      for (const d of D.list('tent')) tent(ctx, d);
      const moving = c.pause <= 0;
      for (let i = 4; i >= 1; i--) {
        const q = c.trail[i * 6];
        if (q) camel(ctx, q.x, q.y, q.h, i % 2 ? '#c79a5b' : '#b98a4c', ['#c9463a', '#2f6f9f', null, '#e0a02f'][i - 1], moving ? Math.sin(t * 5 + i) * 0.5 : 0);
      }
      guide(ctx, c.x, c.y);
      for (const d of D.list('palm')) DD.palm(ctx, d.x, d.y, d.r * d.s, d.rot + Math.sin(t * 0.8 + d.x * 0.04) * 0.05, 'rgba(70,45,15,.3)');
    },
  });
})();
