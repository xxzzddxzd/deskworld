/* 图版：群岛海洋 —— 文件托起沙洲，相邻的连成岛 */
(function () {
  'use strict';
  const { W, H, TAU, clamp, hash, circle, rrect } = DD;

  const FRAG = `
float caustics(vec2 p,float t){
  vec2 q=p*.028+.6*vec2(vnoise(p*.011+vec2(0.,t*.06)),vnoise(p*.011+vec2(4.3,-t*.05)));
  float c=1.-ss(0.,.17,voro(q,t*.55).y);
  return c*c;
}
vec3 shade(vec2 p){
  float t=u_time;
  vec4 F=fieldAt(p);
  float cn=fbm(p*.021+vec2(3.7,1.3));
  float f=F.x+(cn-.5)*.34*ss(.02,.30,F.x);      // 海岸线加一点不规则
  float sd=isoDist(f);
  float lush=F.w/max(F.x,1e-3);
  float d=-sd;                                   // 离岸距离
  float big=fbm(p*.0042+vec2(t*.003,0.));

  // ---- 海水：由浅到深
  float depth=clamp(d/66.,0.,1.);
  vec3 w=mix(vec3(.60,.94,.86),vec3(.21,.76,.85),ss(0.,.45,depth));
  w=mix(w,vec3(.07,.50,.77),ss(.32,1.,depth));
  w=mix(w,vec3(.04,.36,.66),ss(.42,.72,big)*ss(.9,1.,depth)*.85);
  // 水下的生物（鱼、龟、鲸）：带一点折射抖动，越深越蓝
  vec2 wob=(vec2(vnoise(p*.06+vec2(0.,t*.7)),vnoise(p*.06+vec2(9.1,-t*.6)))-.5)*5.;
  vec4 s=texture2D(u_spr,(p+wob)/u_world);
  w=w*(1.-s.a)+mix(s.rgb,w*s.a,.28+.22*depth);
  // 焦散与波光
  w+=caustics(p,t)*(.012+.20*(1.-ss(.2,.95,depth)))*vec3(.9,1.,.95);   // 焦散只留在浅水
  float sw=vnoise(vec2(p.x*.012+t*.05,p.y*.05-t*.02));
  w+=ss(.70,.92,sw)*.035*ss(.6,1.,depth);
  // 一道道涌向岸边的浪线
  float wn=vnoise(p*.03+vec2(t*.05,7.));
  float bd=fract(d/17.+t*.22+wn*.8);
  float line=ss(0.,.07,bd)*(1.-ss(.10,.24,bd));
  line*=ss(54.,10.,d)*ss(.30,.62,vnoise(p*.045-vec2(t*.08,3.)))*step(0.,d);
  w=mix(w,vec3(1.),line*.5);
  float swash=.5+.5*sin(t*.9+wn*6.2831);
  w=mix(w,vec3(1.),(1.-ss(0.,3.+4.*swash,d))*.9);

  // ---- 陆地：湿沙 → 干沙 → 草 → 树林（随簇的大小逐级出现）
  float e=sd;
  vec3 land=mix(vec3(.78,.67,.47),vec3(.93,.84,.63),ss(0.,5.+5.*swash,e));
  land=mix(land,vec3(.98,.91,.74),ss(14.,44.,e)*.5);
  land+=(hash21(floor(p*1.3))-.5)*.035;
  float gn=fbm(p*.035+5.);
  float gz=ss(1.5,2.3,lush)*ss(18.,32.,e+(gn-.5)*26.);
  land=mix(land,mix(vec3(.58,.78,.38),vec3(.38,.65,.31),ss(.35,.7,gn)),gz);
  float fz=ss(3.4,5.,lush)*ss(52.,70.,e+(gn-.5)*24.);
  vec3 vc=voro(p*.06,0.);
  land=mix(land,mix(vec3(.15,.40,.24),vec3(.30,.57,.30),1.-ss(.05,.55,vc.x)),fz);

  return mix(w,land,ss(-.8,.8,sd));
}`;

  const UMB = ['#e85d4a', '#2f8fd8', '#f2b233', '#3fb08a', '#e06aa0'];
  const RING = ['#ff6b5e', '#ffd23f', '#4fc3f7', '#ff8fb1'];

  function hullPath(ctx, L, B) {
    ctx.beginPath(); ctx.moveTo(L, 0);
    ctx.bezierCurveTo(L * 0.45, -B, -L * 0.6, -B, -L, -B * 0.55);
    ctx.lineTo(-L, B * 0.55);
    ctx.bezierCurveTo(-L * 0.6, B, L * 0.45, B, L, 0);
    ctx.closePath();
  }
  function palm(ctx, d, t) { DD.palm(ctx, d.x, d.y, d.r * d.s, d.rot + Math.sin(t * 0.9 + d.x * 0.05) * 0.06); }
  function umbrella(ctx, d) {
    const s = d.s, r = 10.5 * s;
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    ctx.fillStyle = d.tcol; rrect(ctx, r * 0.9, -4 * s, 17 * s, 8 * s, 2 * s); ctx.fill();
    ctx.fillStyle = '#e9b98f'; circle(ctx, r * 0.9 + 3.4 * s, 0, 2.2 * s);
    ctx.fillStyle = d.pcol; rrect(ctx, r * 0.9 + 6 * s, -2 * s, 8 * s, 4 * s, 2 * s); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(70,50,20,.24)'; circle(ctx, d.x + 3.5 * s, d.y + 4.5 * s, r);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#fffdf6' : d.col;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.arc(d.x, d.y, r, d.rot + i * TAU / 8, d.rot + (i + 1) * TAU / 8 + 0.02); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.28)'; circle(ctx, d.x, d.y, 1.2 * s);
  }
  function hut(ctx, d) {
    const r = 14 * d.s;
    ctx.fillStyle = 'rgba(60,45,20,.26)'; circle(ctx, d.x + 4 * d.s, d.y + 5.5 * d.s, r);
    ctx.fillStyle = '#d2ad6e'; circle(ctx, d.x, d.y, r);
    ctx.strokeStyle = 'rgba(120,85,40,.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU + d.rot;
      ctx.beginPath(); ctx.moveTo(d.x + Math.cos(a) * r * 0.2, d.y + Math.sin(a) * r * 0.2); ctx.lineTo(d.x + Math.cos(a) * r, d.y + Math.sin(a) * r); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.arc(d.x, d.y, r, Math.PI * 0.85, Math.PI * 1.85); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a57c44'; circle(ctx, d.x, d.y, r * 0.2);
  }
  function starfish(ctx, d) {
    const r = 5 * d.s;
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    ctx.fillStyle = 'rgba(80,50,20,.2)'; ctx.translate(1, 1.4); star(ctx, r); ctx.translate(-1, -1.4);
    ctx.fillStyle = d.col; star(ctx, r);
    ctx.restore();
  }
  function star(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, q = i % 2 ? r * 0.42 : r; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
    ctx.closePath(); ctx.fill();
  }
  function pier(ctx, d) {
    const L = d.len * d.s;
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.ang);
    ctx.fillStyle = 'rgba(10,60,90,.2)'; ctx.fillRect(-6, -1, L + 8, 10);
    ctx.fillStyle = '#b98a55'; ctx.fillRect(-9, -5, L + 9, 10);
    ctx.strokeStyle = 'rgba(90,60,30,.45)'; ctx.lineWidth = 0.8;
    for (let x = -6; x < L; x += 5) { ctx.beginPath(); ctx.moveTo(x, -5); ctx.lineTo(x, 5); ctx.stroke(); }
    ctx.fillStyle = '#7c5a36';
    for (const x of [L * 0.3, L * 0.65, L]) { circle(ctx, x, -5, 1.6); circle(ctx, x, 5, 1.6); }
    if (d.s > 0.7) {
      ctx.translate(L - 12, 13); ctx.rotate(0.12);
      ctx.fillStyle = 'rgba(10,60,90,.2)'; ctx.save(); ctx.translate(2, 3); hullPath(ctx, 13, 5.5); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#f1ead8'; hullPath(ctx, 13, 5.5); ctx.fill();
      ctx.fillStyle = '#4a86b0'; hullPath(ctx, 10, 3.6); ctx.fill();
    }
    ctx.restore();
  }
  function swimmer(ctx, d, t) {
    const s = d.s, x = d.x + Math.cos(t * 0.25 + d.y) * 5, y = d.y + Math.sin(t * 0.3 + d.x) * 4;
    const ph = (t * 0.5 + d.x * 0.013) % 1;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - ph) * s).toFixed(3) + ')'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, 8 + ph * 11, 0, TAU); ctx.stroke();
    ctx.lineWidth = 3.8 * s; ctx.strokeStyle = d.col; ctx.beginPath(); ctx.arc(x, y, 6 * s, 0, TAU); ctx.stroke();
    ctx.setLineDash([3.1, 3.2]); ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#e9b98f'; circle(ctx, x, y, 2.8 * s);
    ctx.fillStyle = '#4a2f22'; ctx.beginPath(); ctx.arc(x, y, 2.8 * s, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  }
  function fish(ctx, x, y, h, L, t, ph) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(h);
    ctx.beginPath(); ctx.ellipse(0, 0, L * 0.5, L * 0.2, 0, 0, TAU); ctx.fill();
    ctx.translate(-L * 0.42, 0); ctx.rotate(Math.sin(t * 9 + ph) * 0.45);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-L * 0.4, -L * 0.22); ctx.lineTo(-L * 0.3, 0); ctx.lineTo(-L * 0.4, L * 0.22); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function whale(ctx, a, t) {
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.h);
    ctx.fillStyle = 'rgba(14,46,82,.6)';
    ctx.beginPath(); ctx.moveTo(62, 0); ctx.bezierCurveTo(50, -19, 0, -21, -44, -7); ctx.lineTo(-44, 7); ctx.bezierCurveTo(0, 21, 50, 19, 62, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(18, -20, 15, 5, -0.9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(18, 20, 15, 5, 0.9, 0, TAU); ctx.fill();
    ctx.translate(-42, 0); ctx.rotate(Math.sin(t * 1.1) * 0.2);
    ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(-16, -3);
    ctx.bezierCurveTo(-26, -20, -40, -20, -38, -13); ctx.bezierCurveTo(-35, -6, -30, -2, -28, 0);
    ctx.bezierCurveTo(-30, 2, -35, 6, -38, 13); ctx.bezierCurveTo(-40, 20, -26, 20, -16, 3);
    ctx.lineTo(4, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function turtle(ctx, a, t) {
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.h);
    const fl = Math.sin(t * 2.2 + a.seed);
    ctx.fillStyle = 'rgba(92,150,96,.95)';
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(6, s * 7); ctx.rotate(s * (0.9 + fl * 0.35)); ctx.beginPath(); ctx.ellipse(5, 0, 7.5, 2.7, 0, 0, TAU); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(-7, s * 6); ctx.rotate(s * (2.3 - fl * 0.25)); ctx.beginPath(); ctx.ellipse(3, 0, 4.6, 2, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(11.5, 0, 3.7, 2.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(58,104,66,1)'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 8, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(170,205,140,.6)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(0, 0, 5.4, 4.2, 0, 0, TAU); ctx.stroke();
    for (let i = 0; i < 6; i++) { const an = i / 6 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(an) * 5.4, Math.sin(an) * 4.2); ctx.lineTo(Math.cos(an) * 10, Math.sin(an) * 8); ctx.stroke(); }
    ctx.restore();
  }
  function boat(ctx, b, t) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.h);
    ctx.save(); ctx.translate(2.5, 3.5); ctx.fillStyle = 'rgba(8,50,80,.22)'; hullPath(ctx, 19, 7.5); ctx.fill(); ctx.restore();
    ctx.fillStyle = b.hull; hullPath(ctx, 19, 7.5); ctx.fill();
    ctx.fillStyle = b.deck; hullPath(ctx, 15.5, 5.2); ctx.fill();
    ctx.fillStyle = b.hull; ctx.fillRect(-4, -5.4, 2.4, 10.8); ctx.fillRect(7, -4.4, 2.2, 8.8);
    const sw = Math.sin(t * 2.4 + b.ph);
    ctx.strokeStyle = '#f4e8cc'; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(0, s * 5.5); ctx.rotate(s * (Math.PI / 2 - sw * 0.55));
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(13, 0); ctx.stroke();
      ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(15.5, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.lineCap = 'butt';
    ctx.fillStyle = b.shirt; ctx.beginPath(); ctx.ellipse(-1.5, 0, 3, 4.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ecd39c'; circle(ctx, -1.5, 0, 3.5);
    ctx.fillStyle = '#c9a964'; circle(ctx, -1.5, 0, 1.5);
    ctx.restore();
  }
  function gull(ctx, g, t) {
    const span = 9 + Math.sin(t * 5 + g.ph) * 1.6;
    for (let pass = 0; pass < 2; pass++) {
      ctx.save(); ctx.translate(g.x + (pass ? 0 : 12), g.y + (pass ? 0 : 16)); ctx.rotate(g.h);
      ctx.fillStyle = pass ? '#fff' : 'rgba(8,50,80,.16)';
      ctx.beginPath(); ctx.ellipse(0, 0, 4.2, 1.7, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(1.6, 0); ctx.quadraticCurveTo(0.6, -span * 0.6, -3.5, -span); ctx.quadraticCurveTo(-1, -span * 0.4, -1.6, 0);
      ctx.quadraticCurveTo(-1, span * 0.4, -3.5, span); ctx.quadraticCurveTo(0.6, span * 0.6, 1.6, 0); ctx.fill();
      if (pass) { ctx.fillStyle = '#56606e'; circle(ctx, -3.2, -span + 0.7, 1.1); circle(ctx, -3.2, span - 0.7, 1.1); ctx.fillStyle = '#f59e0b'; circle(ctx, 4.5, 0, 0.8); }
      ctx.restore();
    }
  }

  DD.register({
    id: 'ocean', name: '群岛海洋', en: 'Archipelago', accent: '#1f9fb4',
    short: '文件托起沙洲，挨得近的连成岛。',
    tagline: '俯视一片海。每个文件托起一块沙洲，挨得近的连成岛；海里有鱼群、划船的人和套着游泳圈的人。',
    rules: [
      ['1 个文件', '一小片沙洲，四周是泛青的浅滩'],
      ['2–3 个相邻', '连成小岛：长出草地和椰子树，有人撑起遮阳伞'],
      ['4 个以上', '大岛：树林、茅草屋，再大些还有伸进海里的栈桥'],
      ['拖走文件', '旧沙洲慢慢沉入海里，新位置浮出沙滩，荡开一圈水花'],
    ],
    life: ['鱼群', '划船的人', '游泳圈', '海龟', '鲸', '海鸥', '涌向岸边的浪线'],
    meta: { read: 3, cost: 3, power: 3 },
    R: 150, T: 0.34, grow: 0.05,
    frag: FRAG,

    init(env) {
      const st = { decor: new DD.Decor(), schools: [], boats: [], rings: [], gulls: [], turtles: [], whale: null };
      for (let i = 0; i < 6; i++) {
        const p = env.findSpot(-30, 60);
        const a = { x: p[0], y: p[1], h: hash(i, 3) * TAU, v: 19 + hash(i, 4) * 13, seed: i * 7.3 + 1, fish: [], col: i === 1 ? 'rgba(255,150,60,.95)' : i === 4 ? 'rgba(255,214,90,.95)' : 'rgba(10,66,104,.78)' };
        const n = 6 + Math.floor(hash(i, 5) * 6);
        for (let k = 0; k < n; k++) a.fish.push({ ox: (hash(i, k + 10) - 0.5) * 50, oy: (hash(i, k + 30) - 0.5) * 36, ph: hash(i, k + 50) * TAU, L: 8 + hash(i, k + 70) * 5 });
        st.schools.push(a);
      }
      const looks = [['#8a5a34', '#c98f58', '#e85d4a'], ['#2f6f8f', '#e9e2cf', '#f2b233']];
      for (let i = 0; i < 2; i++) {
        const p = env.findSpot(-50, 110);
        st.boats.push({ x: p[0], y: p[1], h: hash(i, 21) * TAU, v: 13, v0: 13 + i * 2, seed: 40 + i * 9.1, ph: i * 2.1, lp: 0, hull: looks[i][0], deck: looks[i][1], shirt: looks[i][2] });
      }
      for (let i = 0; i < 2; i++) { const p = env.findSpot(-20, 60); st.turtles.push({ x: p[0], y: p[1], h: hash(i, 31) * TAU, v: 8, seed: 60 + i * 5.7 }); }
      const wp = env.findSpot(-64, 120);
      st.whale = { x: wp[0], y: wp[1], h: 0.4, v: 11, seed: 90.5 };
      for (let i = 0; i < 3; i++) st.gulls.push({ x: hash(i, 41) * W, y: hash(i, 42) * H, h: hash(i, 43) * TAU, ph: i * 2, seed: 70 + i * 3.3 });
      return st;
    },

    layout(st, env) {
      const D = st.decor, P = new DD.Packer();
      D.begin();
      for (const e of env.live()) {
        const c = e.tc;
        for (let k = 0; k < 12; k++) {
          const ang = hash(e.seed, k * 1.7) * TAU, rr = 54 + hash(e.seed, k * 2.9 + 5) * 80;
          const x = e.x + Math.cos(ang) * rr, y = e.y + Math.sin(ang) * rr;
          if (!env.inside(x, y, 16)) continue;
          const sd = env.sdS(x, y), roll = hash(e.seed, k * 5.3 + 9);
          if (c >= 2 && sd > 22 && roll < 0.5 && env.iconClear(x, y, 12) && P.take(x, y, 15)) {
            D.put('palm', x, y, { r: 15 + roll * 16, rot: roll * 40, need: 14 });
          } else if (c >= 2 && sd > 8 && sd < 28 && roll >= 0.5 && roll < 0.8 && env.iconClear(x, y, 8) && P.take(x, y, 14)) {
            D.put('umb', x, y, { col: UMB[Math.floor(roll * 97) % UMB.length], tcol: UMB[Math.floor(roll * 53) % UMB.length], pcol: RING[Math.floor(roll * 31) % RING.length], rot: roll * 30, need: 4 });
          } else if (c >= 4 && sd > 30 && roll >= 0.8 && env.iconClear(x, y, 14) && P.take(x, y, 17)) {
            D.put('hut', x, y, { rot: roll * 9, need: 22 });
          } else if (sd > 9 && sd < 40 && roll >= 0.8 && roll < 0.9 && env.iconClear(x, y, 4) && P.take(x, y, 8)) {
            D.put('star', x, y, { rot: roll * 20, col: roll > 0.85 ? '#f26d5b' : '#f59e56', need: 6 });
          }
        }
      }
      for (const cl of env.clusters) {
        if (cl.n >= 2) { // 岸边套着游泳圈的人
          for (let k = 0; k < Math.min(3, cl.n - 1); k++) {
            const ang = hash(cl.seed, k * 3.3 + 11) * TAU;
            for (let r = 30; r < cl.rad + 200; r += 6) {
              const x = cl.cx + Math.cos(ang) * r, y = cl.cy + Math.sin(ang) * r;
              if (env.sdS(x, y) < -15) { if (env.inside(x, y, 20)) D.put('swim', x, y, { col: RING[(k + cl.seed) % RING.length], need: -60, max: -7 }); break; }
            }
          }
        }
        if (cl.n >= 5) { // 栈桥：从岸边伸向开阔的海面
          for (let k = 0; k < 10; k++) {
            const ang = hash(cl.seed, k * 2.1 + 77) * TAU, ux = Math.cos(ang), uy = Math.sin(ang);
            let found = null;
            for (let r = 30; r < cl.rad + 220; r += 4) { if (env.sdS(cl.cx + ux * r, cl.cy + uy * r) < 0) { found = r; break; } }
            if (found === null) continue;
            const sx = cl.cx + ux * found, sy = cl.cy + uy * found;
            if (!env.inside(sx + ux * 70, sy + uy * 70, 30) || env.sdS(sx + ux * 62, sy + uy * 62) > -44) continue;
            if (!env.iconClear(sx - ux * 8, sy - uy * 8, 6) || !env.iconClear(sx + ux * 30, sy + uy * 30, 6)) continue;
            D.put('pier', sx, sy, { ang, len: 54, need: -10 });
            break;
          }
        }
      }
    },

    update(st, env, dt) {
      const t = env.time;
      st.decor.step(dt, d => { const s = env.sd(d.x, d.y); return s > d.need && (d.max === undefined || s < d.max); });
      for (const a of st.schools) DD.steer(a, env, dt, { look: 46, lim: -16, wander: 0.7, turn: 2.1, margin: 16 });
      for (const a of st.turtles) DD.steer(a, env, dt, { look: 40, lim: -12, wander: 0.5, turn: 1.4, margin: 30 });
      DD.steer(st.whale, env, dt, { look: 130, lim: -58, wander: 0.18, turn: 0.7, margin: 30 });
      for (const b of st.boats) {
        b.v = b.v0 * (0.7 + 0.6 * Math.max(0, Math.sin(t * 2.4 + b.ph)));
        DD.steer(b, env, dt, { look: 74, lim: -30, wander: 0.3, turn: 1.4, margin: 60 });
        const phase = (t * 2.4 + b.ph) % TAU;
        if (phase < b.lp) { // 每划一桨，船两侧各留下一个水圈
          for (const s of [-1, 1]) st.rings.push({ x: b.x - Math.sin(b.h) * s * 14, y: b.y + Math.cos(b.h) * s * 14, t0: t, r0: 2, v: 9, life: 2.2, a: 0.6, lw: 1.1 });
        }
        b.lp = phase;
      }
      for (const g of st.gulls) {
        g.h += (DD.noise1(g.seed, t * 0.2) - 0.5) * 0.9 * dt;
        g.x += Math.cos(g.h) * 34 * dt; g.y += Math.sin(g.h) * 34 * dt;
        if (g.x < -40) g.x = W + 40; if (g.x > W + 40) g.x = -40;
        if (g.y < -40) g.y = H + 40; if (g.y > H + 40) g.y = -40;
      }
      st.rings = st.rings.filter(r => t - r.t0 < r.life);
    },

    drop(st, env, x, y) {
      const t = env.time;
      for (let i = 0; i < 3; i++) st.rings.push({ x, y, t0: t + i * 0.22, r0: 44, v: 46, life: 1.5, a: 0.75, lw: 2.2 });
    },

    drawUnder(ctx, st, env) {
      const t = env.time;
      whale(ctx, st.whale, t);
      for (const a of st.schools) {
        ctx.fillStyle = a.col;
        const c = Math.cos(a.h), s = Math.sin(a.h);
        for (const q of a.fish) {
          const ox = q.ox + Math.sin(t * 0.7 + q.ph) * 4, oy = q.oy + Math.cos(t * 0.9 + q.ph) * 3;
          fish(ctx, a.x + c * ox - s * oy, a.y + s * ox + c * oy, a.h + Math.sin(t * 2.6 + q.ph) * 0.16, q.L, t, q.ph);
        }
      }
      for (const a of st.turtles) turtle(ctx, a, t);
    },

    drawOver(ctx, st, env) {
      const t = env.time;
      for (const r of st.rings) {
        const age = t - r.t0;
        if (age < 0) continue;
        const k = age / r.life;
        ctx.strokeStyle = 'rgba(255,255,255,' + (r.a * (1 - k) * (1 - k)).toFixed(3) + ')'; ctx.lineWidth = r.lw;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + age * r.v, 0, TAU); ctx.stroke();
      }
      const D = st.decor;
      for (const d of D.list('pier')) pier(ctx, d);
      for (const d of D.list('swim')) swimmer(ctx, d, t);
      for (const b of st.boats) boat(ctx, b, t);
      for (const d of D.list('star')) starfish(ctx, d);
      for (const d of D.list('umb')) umbrella(ctx, d);
      for (const d of D.list('hut')) hut(ctx, d);
      for (const d of D.list('palm')) palm(ctx, d, t);
      for (const g of st.gulls) gull(ctx, g, t);
    },
  });
})();
