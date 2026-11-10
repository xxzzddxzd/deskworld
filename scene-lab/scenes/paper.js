/* 图版：纸雕群山 —— 文件把纸垫高几层，成堆的文件叠成山
 *
 * 纸层从低到高：0–2 是水面（深浅不同的蓝绿），3 是浅滩，4 以上只有文件才垫得出来
 * （4 草绿的岸、5 沙色的坡、6 杏色的山腰、7 赭红的山顶）。
 */
(function () {
  'use strict';
  const { W, H, TAU, hash, circle } = DD;

  const WATER = 2;   // 纸船只在第 0–2 层上走

  const FRAG = `
// 不随文件变化的底纹：只算一次，存成贴图（见引擎里的 base）
vec4 base(vec2 p){
  float n=fbm(p*.0045+vec2(5.,2.));
  float n2=fbm(p*.013+vec2(1.,7.));
  return vec4((n-.5)*.9+(n2-.5)*.22+.42,0.,0.,1.);
}
#ifndef BASE_PASS
float hgt(vec2 p){return fieldF(p)*1.05+baseAt(p).x;}
vec3 pal(float b){
  if(b<.5)return vec3(.055,.165,.235);
  if(b<1.5)return vec3(.085,.265,.345);
  if(b<2.5)return vec3(.130,.380,.455);
  if(b<3.5)return vec3(.215,.510,.555);
  if(b<4.5)return vec3(.400,.640,.600);
  if(b<5.5)return vec3(.840,.725,.545);
  if(b<6.5)return vec3(.875,.590,.435);
  return vec3(.770,.430,.375);
}
float bandOf(float h){return clamp(floor(h*3.4),0.,7.);}
#ifdef PROBE
// 探针：把「这里是第几层纸」交给脚本，纸船和装饰靠它知道哪里是水、哪里是山坡
vec4 probe(vec2 p){return vec4(bandOf(hgt(p))/7.,0.,0.,1.);}
#else
vec3 shade(vec2 p){
  float h=hgt(p);float b=bandOf(h);
  vec3 c=pal(b);
  vec2 L=normalize(vec2(-.62,-.78));              // 光从左上来，上层纸把影子投在下层
  float thr=(b+1.)/3.4;
  float sh=ss(0.,.03,hgt(p+L*4.)-thr)*.45+ss(0.,.03,hgt(p+L*11.)-thr)*.32+ss(0.,.03,hgt(p+L*21.)-thr)*.23;
  c*=1.-.46*sh*step(b,6.5);
  c+=step(bandOf(hgt(p+L*2.2))+.5,b)*.075;        // 迎光的纸边提亮
  c+=(hash21(floor(p*1.7))-.5)*.04+(vnoise(vec2(p.x*.6,p.y*.04)+b*13.)-.5)*.03;  // 纸的纤维
  return c;
}
#endif
#endif
`;

  const SHADOW = 'rgba(6,26,36,.30)';
  const band = (env, x, y) => (env.terrain ? Math.round(env.terrain.sample(x, y, 0) / 255 * 7) : 0);
  const onLand = env => (x, y) => band(env, x, y) > WATER;

  // ---------------------------------------------------------------- 纸鹤与纸船的形状（局部坐标：头朝 +x）

  function craneWings(ctx, shadow, span) {
    ctx.fillStyle = shadow ? 'rgba(6,26,36,.26)' : '#fbf8ef';
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-2, -span); ctx.lineTo(-5, 0); ctx.lineTo(-2, span); ctx.closePath(); ctx.fill();
    if (!shadow) { ctx.fillStyle = '#e2ddcf'; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-2, span); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill(); }
  }
  function craneBody(ctx, shadow) {
    ctx.fillStyle = shadow ? 'rgba(6,26,36,.26)' : '#fffdf6';
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(2, -2.2); ctx.lineTo(-11, 0); ctx.lineTo(2, 2.2); ctx.closePath(); ctx.fill();
    if (!shadow) { ctx.fillStyle = '#d9534a'; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(10, -0.9); ctx.lineTo(10, 0.9); ctx.closePath(); ctx.fill(); }
  }
  function boatShape(ctx) {
    ctx.fillStyle = 'rgba(4,22,32,.34)'; ctx.beginPath(); ctx.moveTo(14, 5); ctx.lineTo(3, -1); ctx.lineTo(-8, 5); ctx.lineTo(3, 10.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fbf8ef'; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(0, -5.5); ctx.lineTo(-11, 0); ctx.lineTo(0, 5.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#dfdacb'; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(0, 5.5); ctx.lineTo(-11, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fffdf7'; ctx.beginPath(); ctx.moveTo(4.5, 0); ctx.lineTo(0, -2.8); ctx.lineTo(-4.5, 0); ctx.lineTo(0, 2.8); ctx.closePath(); ctx.fill();
  }
  // 预览页用：直接画在整屏画布上
  function crane(ctx, c, t) {
    const span = 13 * (0.72 + 0.28 * Math.sin(t * 3 + c.ph));
    for (const shadow of [true, false]) {
      ctx.save(); ctx.translate(c.x + (shadow ? 14 : 0), c.y + (shadow ? 19 : 0)); ctx.rotate(c.h);
      craneWings(ctx, shadow, span); craneBody(ctx, shadow);
      ctx.restore();
    }
  }
  function pboat(ctx, b) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.h); boatShape(ctx); ctx.restore();
  }

  // ---------------------------------------------------------------- 山上的纸片装饰（俯视，影子落向右下）
  // 每个函数都以 d.x, d.y 为中心画，d.s 是出现 / 消失时的缩放。

  function starPath(ctx, x, y, r, n, inner, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = i / (n * 2) * TAU + rot, q = i % 2 ? r * inner : r;
      if (i) ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); else ctx.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
    }
    ctx.closePath(); ctx.fill();
  }
  function pine(ctx, d) {
    const r = d.r * d.s;
    if (r < 0.4) return;
    ctx.fillStyle = SHADOW; starPath(ctx, d.x + r * 0.34, d.y + r * 0.44, r, 7, 0.6, d.rot);
    ctx.fillStyle = '#1d5b4c'; starPath(ctx, d.x, d.y, r, 7, 0.6, d.rot);
    ctx.fillStyle = '#2c7a60'; starPath(ctx, d.x - r * 0.08, d.y - r * 0.1, r * 0.62, 7, 0.6, d.rot + 0.3);
    ctx.fillStyle = '#5aa583'; starPath(ctx, d.x - r * 0.14, d.y - r * 0.18, r * 0.28, 6, 0.7, d.rot + 0.6);
  }
  function cabin(ctx, d) {
    const s = d.s;
    if (s < 0.03) return;
    ctx.save(); ctx.translate(d.x + 3 * s, d.y + 4 * s); ctx.rotate(d.rot); ctx.fillStyle = SHADOW; ctx.fillRect(-8 * s, -6 * s, 16 * s, 12 * s); ctx.restore();
    ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.scale(s, s);
    ctx.fillStyle = '#f6efdc'; ctx.fillRect(-8, -6, 16, 12);        // 屋顶迎光的一面
    ctx.fillStyle = '#d8ccb0'; ctx.fillRect(-8, 0, 16, 6);          // 背光的一面
    ctx.fillStyle = '#b9553f'; ctx.fillRect(-8, -0.9, 16, 1.8);     // 屋脊
    ctx.restore();
  }
  function pagoda(ctx, d) { // 三层叠起来的方顶，上一层的影子落在下一层上
    const s = d.s;
    if (s < 0.03) return;
    const tiers = [[11, '#8c2f2b'], [7.5, '#c2503c'], [4, '#f0cf78']];
    tiers.forEach((t, i) => {
      const q = t[0] * s, off = (2.4 + i * 0.5) * s;
      ctx.save(); ctx.translate(d.x + off, d.y + off * 1.3); ctx.rotate(d.rot); ctx.fillStyle = SHADOW; ctx.fillRect(-q, -q, q * 2, q * 2); ctx.restore();
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      ctx.fillStyle = t[1]; ctx.fillRect(-q, -q, q * 2, q * 2);
      ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.moveTo(-q, -q); ctx.lineTo(q, -q); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.moveTo(q, q); ctx.lineTo(-q, q); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
  }
  function flag(ctx, d) {
    const s = d.s;
    if (s < 0.03) return;
    ctx.fillStyle = SHADOW; ctx.beginPath(); ctx.moveTo(d.x + 3 * s, d.y + 2 * s); ctx.lineTo(d.x + 14 * s, d.y + 5 * s); ctx.lineTo(d.x + 3 * s, d.y + 8 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e2574c'; ctx.beginPath(); ctx.moveTo(d.x, d.y - 3 * s); ctx.lineTo(d.x + 11 * s, d.y); ctx.lineTo(d.x, d.y + 3 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fbf8ef'; circle(ctx, d.x, d.y, 2 * s);
  }
  const DECOR = { pine: { draw: pine, size: 36 }, cabin: { draw: cabin, size: 36 }, pagoda: { draw: pagoda, size: 44 }, flag: { draw: flag, size: 34 } };
  const BITS = ['#fbf8ef', '#f0cf78', '#e2574c', '#5aa583'];
  function bit(ctx, p, t) { // 预览页里的纸屑
    const k = (t - p.t0) / p.life;
    if (k < 0 || k > 1) return;
    const e = 1 - (1 - k) * (1 - k), x = p.x + Math.cos(p.a) * (38 + p.sp * e), y = p.y + Math.sin(p.a) * (38 + p.sp * e) + 26 * k * k;
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot + p.vr * (t - p.t0)); ctx.globalAlpha = 1 - k * k;
    ctx.fillStyle = p.col; ctx.beginPath(); ctx.moveTo(p.sz, 0); ctx.lineTo(0, p.sz * 0.55); ctx.lineTo(-p.sz, 0); ctx.lineTo(0, -p.sz * 0.55); ctx.closePath(); ctx.fill();
    ctx.restore();
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

  // ---------------------------------------------------------------- 纸船：只走水面

  const BOAT_STEER = { look: 60, wander: 0.4, turn: 1.3, margin: 40 };
  function waterSpot(env) {
    for (let i = 0; i < 80; i++) {
      const x = 60 + Math.random() * (W - 120), y = 70 + Math.random() * (H - 190);
      if (band(env, x, y) <= WATER) return [x, y];
    }
    return [W / 2, H / 2];
  }

  DD.register({
    id: 'paper', name: '纸雕群山', en: 'Papercut Peaks', accent: '#2f8791',
    short: '文件把纸垫高几层，成堆的文件叠成山。',
    tagline: '层层叠叠的纸雕地形。每个文件把纸垫高几层，成堆的文件叠成赭红的山顶；每一层都在下一层上投下影子，山上山下的东西也都是纸片。',
    rules: [
      ['1 个文件', '一座小丘，坡上长出一两棵纸松'],
      ['2–3 个相邻', '小丘连成山脊，山脚多一间小屋'],
      ['4 个以上', '层数叠到最高，山腰立起一座塔；6 个以上山顶插一面小旗'],
      ['拖走文件', '纸层一层层落回去，在新位置重新垫起，溅起一把纸屑'],
    ],
    life: ['纸鹤', '只走水面的纸船', '纸松、小屋与塔', '放下文件时的纸屑', '层与层之间的投影'],
    meta: { read: 3, cost: 1, power: 1 },
    note: '纸雕风格，所有细节也都是纸片：最像一张精心设计的壁纸，也最容易换配色。',
    R: 170, T: 0.30, grow: 0.03,
    still: true,   // 地形只在文件变动时才变：壁纸可以只在那时重画
    base: true,    // 着色器里有 base()：不随文件变的底纹，引擎只算一次
    probe: true,   // 着色器里有 probe()：引擎把地形层数读回来放在 env.terrain
    frag: FRAG,

    init(env) {
      const st = { decor: new DD.Decor(), bits: [], cranes: [], boats: [] };
      for (let i = 0; i < 3; i++) st.cranes.push({ x: hash(i, 81) * W, y: 80 + hash(i, 82) * (H - 240), h: (hash(i, 83) - 0.5) * 0.8 + (i % 2 ? Math.PI : 0), ph: i * 2.2, v: 30 + i * 6 });
      for (let i = 0; i < 2; i++) { const p = env.findSpot(-60, 80); st.boats.push({ x: p[0], y: p[1], h: hash(i, 85) * TAU, v: 9, seed: 30 + i * 6.1 }); }
      return st;
    },

    // 文件变动后重新摆装饰（此时 env.terrain 是「长好之后」的地形）
    layout(st, env) {
      const D = st.decor, P = new DD.Packer();
      D.begin();
      if (!env.terrain) return;
      const spot = (lo, hi, pad, r) => (x, y) => {
        if (!env.inside(x, y, 16)) return false;
        const b = band(env, x, y);
        return b >= lo && b <= hi && env.iconClear(x, y, pad) && P.fits(x, y, r);
      };
      for (const cl of env.clusters) { // 大件先占位置
        if (cl.n >= 4) {
          const p = around(cl.members, cl.seed + 3, 60, 62, 150, spot(5, 6, 16, 17));
          if (p) { P.add(p[0], p[1], 17); D.put('pagoda', p[0], p[1], { r: 11, rot: (hash(cl.seed, 5) - 0.5) * 0.5, delay: 1.1 }); }
        }
        if (cl.n >= 2 && cl.n <= 3) {
          const p = around(cl.members, cl.seed + 11, 50, 60, 130, spot(4, 5, 10, 12));
          if (p) { P.add(p[0], p[1], 12); D.put('cabin', p[0], p[1], { r: 8, rot: (hash(cl.seed, 7) - 0.5) * 1.2, delay: 1.0 }); }
        }
        if (cl.n >= 6) {
          const p = around(cl.members, cl.seed + 29, 80, 46, 110, spot(7, 7, 4, 9));
          if (p) { P.add(p[0], p[1], 9); D.put('flag', p[0], p[1], { r: 8, rot: 0, delay: 1.4 }); }
        }
      }
      for (const e of env.live()) { // 每个文件在岸上、坡上长几棵纸松
        const want = e.tc >= 4 ? 2 : 3;
        let n = 0;
        for (let k = 0; k < 16 && n < want; k++) {
          const a = hash(e.seed, k * 1.7 + 2) * TAU, rr = 60 + hash(e.seed, k * 2.3 + 4) * 92, r = 6 + hash(e.seed, k * 3.1 + 6) * 4.5;
          const x = e.x + Math.cos(a) * rr, y = e.y + Math.sin(a) * rr;
          if (!spot(4, 5, 5, r + 2)(x, y)) continue;
          P.add(x, y, r + 2);
          D.put('pine', x, y, { r, rot: hash(e.seed, k) * TAU, delay: 0.7 + hash(e.seed, k + 9) * 0.6 });
          n++;
        }
      }
    },

    update(st, env, dt) {
      const t = env.time;
      st.decor.step(dt, () => true);
      st.bits = st.bits.filter(p => t - p.t0 < p.life);
      // 以下是预览页里的纸鹤纸船（真实壁纸用下面的 layers）
      for (const c of st.cranes) {
        c.h += Math.sin(t * 0.17 + c.ph) * 0.06 * dt;
        c.x += Math.cos(c.h) * c.v * dt; c.y += Math.sin(c.h) * c.v * dt;
        if (c.x < -60) c.x = W + 50; if (c.x > W + 60) c.x = -50;
        if (c.y < -60) c.y = H + 50; if (c.y > H + 60) c.y = -50;
      }
      for (const b of st.boats) {
        DD.steer(b, env, dt, Object.assign({ blocked: onLand(env) }, BOAT_STEER));
        b.stuck = band(env, b.x, b.y) > WATER ? (b.stuck || 0) + dt : 0;
        if (b.stuck > 1.5) { const p = waterSpot(env); b.x = p[0]; b.y = p[1]; b.stuck = 0; }   // 被新垫起的纸层压住：换个地方
      }
    },

    drop(st, env, x, y) {
      const t = env.time;
      for (let i = 0; i < 14; i++) {
        st.bits.push({ x, y, a: i / 14 * TAU + Math.random() * 0.4, sp: 40 + Math.random() * 70, t0: t + Math.random() * 0.1, life: 1.1 + Math.random() * 0.4,
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 9, sz: 2.6 + Math.random() * 2.2, col: BITS[i % BITS.length] });
      }
    },

    drawOver(ctx, st, env) {
      const D = st.decor;
      for (const b of st.boats) pboat(ctx, b);
      for (const type of ['pine', 'cabin', 'pagoda', 'flag']) for (const d of D.list(type)) DECOR[type].draw(ctx, d);
      for (const p of st.bits) bit(ctx, p, env.time);
      for (const c of st.cranes) crane(ctx, c, env.time);
    },

    // ---------------------------------------------------------------- 壁纸模式
    // 真实壁纸不走上面的整屏画布：每样东西是一小块图层，位移、扇翅、冒出来都交给系统合成器。
    // 脚本只在「定下一段路线」和「文件变动」时才醒。
    layers: {
      init(api, env) {
        const st = { cranes: [], boats: [], decor: new Map(), env, api };
        for (let i = 0; i < 2; i++) {
          const b = { x: W * (0.3 + 0.4 * i), y: H * 0.5, h: hash(i, 85) * TAU, v: 9, seed: 30 + i * 6.1, t: i * 40, anim: null, busy: false };
          b.el = api.group(40, 36, 'ground');
          api.part(b.el, boatShape);
          b.el.style.opacity = 0;                               // 等读到地形、找到水面再出现
          st.boats.push(b);
        }
        const build = (i, shadow) => {
          const g = api.group(34, 34, 'sky');
          const wings = api.part(g, ctx => craneWings(ctx, shadow, 13));
          wings.classList.add('flap');                          // 扇翅：合成器里的缩放动画
          wings.style.animationDelay = (-i * 0.7).toFixed(2) + 's';
          api.part(g, ctx => craneBody(ctx, shadow));
          return g;
        };
        for (let i = 0; i < 3; i++) st.cranes.push({ x: hash(i, 81) * W, y: 80 + hash(i, 82) * (H - 240), h: (hash(i, 83) - 0.5) * 0.8 + (i % 2 ? Math.PI : 0), ph: i * 2.2, v: 30 + i * 6, t: i * 17 });
        st.cranes.forEach((c, i) => { c.shadow = build(i, true); });   // 影子都压在身体下面
        st.cranes.forEach((c, i) => { c.el = build(i, false); this.flyCrane(st, c); });
        return st;
      },

      // 纸鹤：一次规划最多 30 秒的路线，飞出屏幕就从另一边回来
      flyCrane(st, c) {
        const api = st.api;
        if (c.x < -60) c.x = W + 50; else if (c.x > W + 60) c.x = -50;
        if (c.y < -60) c.y = H + 50; else if (c.y > H + 60) c.y = -50;
        const pts = [{ x: c.x, y: c.y, r: c.h }];
        for (let i = 0; i < 60; i++) {
          c.t += 0.5;
          c.h += Math.sin(c.t * 0.17 + c.ph) * 0.03;
          c.x += Math.cos(c.h) * c.v * 0.5; c.y += Math.sin(c.h) * c.v * 0.5;
          pts.push({ x: c.x, y: c.y, r: c.h });
          if (c.x < -60 || c.x > W + 60 || c.y < -60 || c.y > H + 60) break;
        }
        const seconds = (pts.length - 1) * 0.5;
        api.travel(c.shadow, pts, seconds, 14, 19);
        api.travel(c.el, pts, seconds, 0, 0, () => this.flyCrane(st, c));
      },

      // 纸船：沿水面规划 24 秒的航线；如果正被纸层压着，先淡出，换到水面上再淡入
      sailBoat(st, b) {
        const api = st.api, env = st.env;
        if (!env.terrain || b.busy) return;
        if (b.anim) { const at = api.where(b.el); api.stop(b.el, b.anim); b.anim = null; b.x = at.x; b.y = at.y; b.h = at.r; }
        if (band(env, b.x, b.y) > WATER || b.el.style.opacity === '0') {
          b.busy = true;
          b.el.style.opacity = 0;
          setTimeout(() => {
            const p = waterSpot(env);
            b.x = p[0]; b.y = p[1]; b.busy = false;
            api.place(b.el, b.x, b.y, b.h);
            b.el.style.opacity = 1;
            this.sailBoat(st, b);
          }, 650);
          return;
        }
        const sim = { x: b.x, y: b.y, h: b.h, v: b.v, seed: b.seed, side: 0 };
        const pts = [{ x: sim.x, y: sim.y, r: sim.h }];
        for (let i = 0; i < 48; i++) {
          b.t += 0.5;
          DD.steer(sim, env, 0.5, Object.assign({ blocked: onLand(env), time: b.t }, BOAT_STEER));
          pts.push({ x: sim.x, y: sim.y, r: sim.h });
        }
        b.x = sim.x; b.y = sim.y; b.h = sim.h;
        b.anim = api.travel(b.el, pts, 24, 0, 0, () => { b.anim = null; this.sailBoat(st, b); });
      },

      // 文件变动之后：装饰和场景算出的清单对齐（新的冒出来，没了的缩回去），纸船重新规划航线
      layout(st, api, env, scene) {
        const want = scene.decor.items;
        for (const [key, el] of st.decor) {
          const d = want.get(key);
          if (!d || !d.keep) { api.vanish(el); st.decor.delete(key); }
        }
        for (const d of want.values()) {
          if (!d.keep || st.decor.has(d.key) || !DECOR[d.type]) continue;
          // 图案画一次存成图片，图层共用：松树很多，只备 4 种朝向、统一画成半径 10，再按各自大小缩放
          const info = DECOR[d.type];
          let url, scale = 1;
          if (d.type === 'pine') {
            const v = Math.floor(d.rot / TAU * 4) % 4;
            url = api.stamp('pine' + v, info.size, info.size, ctx => pine(ctx, { x: 0, y: 0, r: 10, rot: v * 0.22, s: 1 }));
            scale = d.r / 10;
          } else {
            url = api.stamp(d.type + ':' + d.rot.toFixed(2), info.size, info.size, ctx => info.draw(ctx, { x: 0, y: 0, r: d.r, rot: d.rot, s: 1 }));
          }
          const el = api.image(info.size, info.size, url, 'ground');
          api.appear(el, d.x, d.y, d.delay || 0, scale);
          st.decor.set(d.key, el);
        }
        for (const b of st.boats) this.sailBoat(st, b);
      },

      // 放下文件：溅起一把纸屑
      drop(st, api, env, x, y) {
        for (let i = 0; i < 14; i++) {
          const a = i / 14 * TAU + Math.random() * 0.4, far = 78 + Math.random() * 70;
          api.confetti(x + Math.cos(a) * 38, y + Math.sin(a) * 38, x + Math.cos(a) * far, y + Math.sin(a) * far + 26,
            5 + Math.random() * 4, BITS[i % BITS.length], (Math.random() - 0.5) * 14, 1100 + Math.random() * 400);
        }
      },
    },
  });
})();
