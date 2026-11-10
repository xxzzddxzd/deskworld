/* 场景引擎（实验室预览页和真实壁纸共用）
 *
 * 文件 → 发射源 (emitter) → 影响场 (field) → 着色器画地形 + 画布画生物与装饰。
 * 每个场景只是对同一张影响场的不同「读法」。
 *
 * 世界坐标默认是 1440×900（实验室里那块模拟桌面）；真实壁纸在加载本文件之前
 * 设置 window.DD_WORLD = { w, h, maxn }，让世界等于屏幕的点数尺寸（1 单位 = 1 pt）。
 */
(function () {
  'use strict';

  const CFG = window.DD_WORLD || {};
  const W = CFG.w || 1440, H = CFG.h || 900, MAXN = CFG.maxn || 32, MAXR = 8, TAU = Math.PI * 2;
  const EY = 10; // 发射源比图标中心低一点，落在「图标 + 文件名」的视觉中心

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hash = (a, b) => { const x = Math.sin(a * 127.1 + (b || 0) * 311.7 + 74.7) * 43758.5453123; return x - Math.floor(x); };
  const noise1 = (seed, t) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return lerp(hash(i, seed), hash(i + 1, seed), u); };

  const world = { files: [], emitters: [], ripples: [], clusters: [], time: 0, version: 1, scene: null };
  const listeners = [];
  const DD = (window.DD = {
    W, H, TAU, EY, MAXN, clamp, lerp, ss, hash, noise1, world, scenes: [],
    register(s) { this.scenes.push(s); },
    on(fn) { listeners.push(fn); },
  });
  const emit = (type, data) => { for (const fn of listeners) fn(type, data); };

  // ---------------------------------------------------------------- 文件与发射源

  let uid = 0;
  function mkEmitter(f, w) {
    return { fid: f.id, x: f.x, y: f.y + EY, w, tw: 1, c: 1, tc: 1, seed: f.seed, kind: f.kind, age: w > 0.5 ? 60 : 0 };
  }
  function touch() { world.version++; computeClusters(); }
  function trim() { // 发射源有上限：超出时先丢最淡的旧影子
    while (world.emitters.length > MAXN) {
      let k = -1, m = 2;
      world.emitters.forEach((e, i) => { if (e.tw === 0 && e.w < m) { m = e.w; k = i; } });
      if (k < 0) break;
      world.emitters.splice(k, 1);
    }
  }

  // mode: 'instant' 直接成形；'quiet' 从无到有但不触发水花；缺省＝像用户放下一个文件
  DD.addFile = function (name, kind, x, y, mode) {
    uid++;
    const f = { id: uid, name, kind, x, y, seed: 1 + Math.floor(hash(uid * 1.37, 4.1) * 990) };
    world.files.push(f);
    world.emitters.push(mkEmitter(f, mode === 'instant' ? 1 : 0));
    trim(); touch();
    if (!mode) { DD.ripple(x, y + EY, 1); emit('drop', f); }
    return f;
  };

  DD.moveFile = function (f, x, y) {
    const e = world.emitters.find(q => q.fid === f.id);
    f.x = x; f.y = y;
    if (e && Math.hypot(e.x - x, e.y - (y + EY)) < 14) { e.x = x; e.y = y + EY; touch(); return; }
    if (e) { e.fid = 0; e.tw = 0; }            // 旧位置变成慢慢消散的影子
    world.emitters.push(mkEmitter(f, 0));      // 新位置从无到有
    trim(); touch();
    DD.ripple(x, y + EY, 1); emit('drop', f);
  };

  DD.removeFile = function (f) {
    const e = world.emitters.find(q => q.fid === f.id);
    if (e) { e.fid = 0; e.tw = 0; }
    const i = world.files.indexOf(f);
    if (i >= 0) world.files.splice(i, 1);
    touch(); emit('remove', f);
  };

  DD.clearFiles = function () {
    world.files.length = 0;
    for (const e of world.emitters) { e.fid = 0; e.tw = 0; }
    touch();
  };

  DD.ripple = function (x, y, s) {
    world.ripples.push({ x, y, t0: world.time, s });
    if (world.ripples.length > MAXR) world.ripples.shift();
  };

  DD.stepWorld = function (dt) {
    const em = world.emitters;
    for (let i = em.length - 1; i >= 0; i--) {
      const e = em[i];
      e.w += (e.tw - e.w) * (1 - Math.exp(-dt * (e.tw > e.w ? 2.4 : 3.2)));
      e.c += (e.tc - e.c) * (1 - Math.exp(-dt * 2.2));
      e.age += dt;
      if (e.tw === 0 && e.w < 0.004) em.splice(i, 1);
    }
  };

  // 相邻的文件归为一簇：簇的大小决定「沙洲 → 小岛 → 大岛」这类分级
  function computeClusters() {
    const sc = world.scene;
    const live = world.emitters.filter(e => e.tw > 0);
    const link = sc ? (sc.link || sc.R * 1.3) : 190;
    const par = live.map((_, i) => i);
    const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        if (Math.hypot(live[i].x - live[j].x, live[i].y - live[j].y) < link) par[find(i)] = find(j);
      }
    }
    const groups = new Map();
    live.forEach((e, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e); });
    world.clusters = [];
    for (const m of groups.values()) {
      let cx = 0, cy = 0, seed = 1e9;
      for (const e of m) { cx += e.x; cy += e.y; seed = Math.min(seed, e.seed); }
      cx /= m.length; cy /= m.length;
      let rad = 0;
      for (const e of m) { rad = Math.max(rad, Math.hypot(e.x - cx, e.y - cy)); e.tc = m.length; }
      world.clusters.push({ members: m, n: m.length, cx, cy, rad, seed });
    }
  }

  DD.activate = function (sc, snap) {
    world.scene = sc;
    computeClusters();
    if (snap) for (const e of world.emitters) if (e.tw > 0) e.c = e.tc;
  };

  // ---------------------------------------------------------------- 影响场（与着色器里的公式一致）

  const OUT = { f: 0, cs: 0, gx: 0, gy: 0 };
  function fieldRaw(x, y, settled) {
    const sc = world.scene, R = sc.R, G = sc.grow || 0, em = world.emitters;
    let f = 0, cs = 0, gx = 0, gy = 0;
    for (let i = 0; i < em.length; i++) {
      const e = em[i], w = settled ? e.tw : e.w;
      if (w <= 0.0005) continue;
      const c = settled ? e.tc : e.c, ri = R * (1 + G * clamp(c - 1, 0, 6));
      const dx = x - e.x, dy = y - e.y, d2 = (dx * dx + dy * dy) / (ri * ri);
      if (d2 < 1) {
        const q = 1 - d2, k = q * q * q * w;
        f += k; cs += k * c;
        const gg = -6 * q * q * w / (ri * ri);
        gx += gg * dx; gy += gg * dy;
      }
    }
    OUT.f = f; OUT.cs = cs; OUT.gx = gx; OUT.gy = gy;
    return OUT;
  }
  // 由场强换算出「离边界多远」：正＝在陆地/云/叶子里面，负＝在外面
  function iso(f) {
    const sc = world.scene;
    const a = Math.sqrt(1 - Math.cbrt(sc.T));
    const b = Math.sqrt(Math.max(0, 1 - Math.cbrt(clamp(f, 1e-6, 1))));
    return sc.R * (a - b);
  }

  const env = (DD.env = {
    W, H,
    get time() { return world.time; },
    get files() { return world.files; },
    get emitters() { return world.emitters; },
    get clusters() { return world.clusters; },
    get ripples() { return world.ripples; },
    live() { return world.emitters.filter(e => e.tw > 0); },
    field: (x, y) => fieldRaw(x, y, false).f,
    sd: (x, y) => iso(fieldRaw(x, y, false).f),
    sdS: (x, y) => iso(fieldRaw(x, y, true).f),
    lush: (x, y) => { const o = fieldRaw(x, y, false); return o.cs / Math.max(o.f, 1e-3); },
    lushS: (x, y) => { const o = fieldRaw(x, y, true); return o.cs / Math.max(o.f, 1e-3); },
    grad: (x, y) => { const o = fieldRaw(x, y, false); return [o.gx, o.gy]; },
    // 这个位置会不会被某个图标（含文件名）盖住
    iconClear(x, y, pad) {
      pad = pad || 0;
      for (const f of world.files) {
        const dx = Math.abs(x - f.x), dy = y - f.y;
        if (dx < 42 + pad && dy > -36 - pad && dy < 58 + pad) return false;
      }
      return true;
    },
    inside: (x, y, m) => x > m && x < W - m && y > m + 20 && y < H - m,
    findSpot(maxSd, m) {
      for (let i = 0; i < 50; i++) {
        const x = m + Math.random() * (W - 2 * m), y = m + 20 + Math.random() * (H - 2 * m - 100);
        if (iso(fieldRaw(x, y, true).f) < maxSd) return [x, y];
      }
      return [m + Math.random() * (W - 2 * m), m + Math.random() * (H - 2 * m)];
    },
    ripple: (x, y, s) => DD.ripple(x, y, s),
  });

  // ---------------------------------------------------------------- 画布小工具

  DD.circle = function (ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); ctx.fill(); };
  DD.rrect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };

  // 俯视的棕榈树：海岛和绿洲都用
  function fronds(ctx, r, cols) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      ctx.save(); ctx.rotate(i / n * TAU + (i % 2) * 0.14);
      const L = r * (i % 2 ? 0.84 : 1), wd = L * 0.27;
      if (cols) ctx.fillStyle = cols[i % 2];
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.45, -wd, L, 0); ctx.quadraticCurveTo(L * 0.45, wd, 0, 0); ctx.fill();
      if (cols) { ctx.strokeStyle = 'rgba(232,246,180,.38)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(L * 0.12, 0); ctx.lineTo(L * 0.9, 0); ctx.stroke(); }
      ctx.restore();
    }
  }
  DD.palm = function (ctx, x, y, r, rot, shadow) {
    if (r < 0.5) return;
    ctx.save(); ctx.translate(x + r * 0.3, y + r * 0.4); ctx.rotate(rot); ctx.fillStyle = shadow || 'rgba(40,50,30,.24)'; fronds(ctx, r, null); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); fronds(ctx, r, ['#4fae5a', '#3a9450']); ctx.fillStyle = '#8a6a3c'; DD.circle(ctx, 0, 0, r * 0.13); ctx.restore();
  };

  // 会游走、并且绕开「sd 大于 lim」区域的生物（鱼绕开陆地、骆驼绕开水……）
  // 也可以给 o.blocked(x, y)：返回 true 的地方一律不去（比如纸船不上陆地）。
  DD.steer = function (a, env, dt, o) {
    const look = o.look || 50, lim = o.lim === undefined ? 0 : o.lim, m = o.margin || 24;
    const sense = o.blocked ? (x, y) => (o.blocked(x, y) ? 999 : -999) : env.sd;
    const probe = ang => {
      const x = a.x + Math.cos(ang) * look, y = a.y + Math.sin(ang) * look;
      if (x < m || x > W - m || y < m + 16 || y > H - m) return 999;
      return sense(x, y);
    };
    const f = probe(a.h), l = probe(a.h - 0.75), r = probe(a.h + 0.75);
    // o.time：预先规划一整段路线时，由调用方给出「那一刻」的时间
    let om = (noise1(a.seed, (o.time === undefined ? env.time : o.time) * 0.35) - 0.5) * 2 * (o.wander === undefined ? 0.6 : o.wander);
    if (f > lim || l > lim || r > lim) {
      if (!a.side) a.side = l < r ? -1 : 1;
      om += a.side * (o.turn || 2) * (f > lim ? 1.5 : 0.7);
    } else a.side = 0;
    a.h += om * dt;
    a.x += Math.cos(a.h) * a.v * dt; a.y += Math.sin(a.h) * a.v * dt;
    if (!o.blocked && env.sd(a.x, a.y) > lim + 4) { // 地形长到了脚下：顺着坡往外退
      const g = env.grad(a.x, a.y), L = Math.hypot(g[0], g[1]);
      if (L > 1e-7) { a.x -= g[0] / L * 70 * dt; a.y -= g[1] / L * 70 * dt; }
    }
    a.x = clamp(a.x, -30, W + 30); a.y = clamp(a.y, -30, H + 30);
  };

  // 装饰物（树、伞、石头……）：布局变化时增删，出现与消失都有缩放过渡
  DD.Decor = class {
    constructor() { this.items = new Map(); }
    begin() { for (const d of this.items.values()) d.keep = false; }
    put(type, x, y, props) {
      const key = type + ':' + Math.round(x / 3) + ':' + Math.round(y / 3);
      let d = this.items.get(key);
      if (!d) { d = { type, x, y, s: 0, key }; this.items.set(key, d); }
      Object.assign(d, props); d.keep = true;
      return d;
    }
    step(dt, vis) {
      for (const d of this.items.values()) {
        d.age = (d.age || 0) + dt;                       // delay：等地形先长起来，再冒出来
        const tgt = d.keep && d.age >= (d.delay || 0) && vis(d) ? 1 : 0;
        d.tgt = tgt;
        d.s += (tgt - d.s) * (1 - Math.exp(-dt * (tgt ? 4.5 : 7)));
        if (!d.keep && d.s < 0.02) this.items.delete(d.key);
      }
    }
    busy() { // 还有没长完 / 没缩完的装饰
      for (const d of this.items.values()) {
        if (d.keep && (d.age || 0) < (d.delay || 0)) return true;
        if (Math.abs((d.tgt === undefined ? 1 : d.tgt) - d.s) > 0.02) return true;
      }
      return false;
    }
    list(type) { const out = []; for (const d of this.items.values()) if (d.s > 0.02 && (!type || d.type === type)) out.push(d); return out; }
  };
  // 布局时防止装饰物互相压住
  DD.Packer = class {
    constructor() { this.p = []; }
    fits(x, y, r) { for (const q of this.p) if (Math.hypot(q.x - x, q.y - y) < q.r + r) return false; return true; }
    add(x, y, r) { this.p.push({ x, y, r }); }
    take(x, y, r) { if (!this.fits(x, y, r)) return false; this.add(x, y, r); return true; }
  };

  // ---------------------------------------------------------------- WebGL
  //
  // 每个场景一段片元着色器。为了又顺又省电，画面分三步：
  //   1. 影响场贴图：把所有发射源的影响叠成一张低分辨率的图（文件多少只影响这一步）；
  //   2. 底图贴图（可选）：场景里不随文件变化的部分（比如纸雕的底纹噪声）只算一次；
  //   3. 主画面：每个像素查上面两张图再上色——所以全分辨率也能跑满刷新率。
  // 显卡不支持半浮点渲染目标时，退回到在主画面里逐像素累加（慢，但画面一样）。

  const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const COMMON = `
precision highp float;
uniform vec2 u_res; uniform vec2 u_sc; uniform float u_px; uniform float u_time; uniform vec2 u_world;
uniform int u_n; uniform vec4 u_pts[MAXN]; uniform vec4 u_aux[MAXN]; uniform vec4 u_rip[MAXR];
uniform sampler2D u_spr; uniform highp sampler2D u_field; uniform highp sampler2D u_base;
float ss(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
float hash21(vec2 p){vec3 q=fract(vec3(p.x,p.y,p.x+p.y)*vec3(.1171,.1093,.0947));q+=dot(q,q.yzx+31.17);return fract((q.x+q.y)*q.z);}
vec2 hash22(vec2 p){float n=hash21(p);return vec2(n,hash21(p+n*31.7+2.3));}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),u.x),mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+vec2(17.7,9.2);a*=.5;}return s/.9375;}
// x: 到最近细胞点的距离  y: 次近减最近（细胞边缘≈0）  z: 细胞随机数
vec3 voro(vec2 x,float t){vec2 n=floor(x),f=fract(x);float d1=9.,d2=9.,id=0.;
  for(int j=-1;j<=1;j++){for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));vec2 o=hash22(n+g);float h=o.x;
    o=.5+.4*sin(t+6.2831*o);vec2 r=g+o-f;float d=dot(r,r);
    if(d<d1){d2=d1;d1=d;id=h;}else if(d<d2){d2=d;}}}
  d1=sqrt(d1);d2=sqrt(d2);return vec3(d1,d2-d1,id);}
// 世界坐标 → 离屏贴图坐标（贴图的第 0 行是世界的最下面一行）
vec2 texUV(vec2 p){return vec2(p.x/u_world.x,1.-p.y/u_world.y);}
// 影响场，逐个发射源累加。x: 场强  yz: 梯度  w: 按簇大小加权的场强（除以 x 得到「这里属于多大的一簇」）
vec4 fieldLoop(vec2 p){float f=0.,cs=0.;vec2 g=vec2(0.);
  for(int i=0;i<MAXN;i++){if(i>=u_n)break;vec4 a=u_pts[i];
    float ri=KR*(1.+KGROW*clamp(a.w-1.,0.,6.));vec2 d=p-a.xy;float d2=dot(d,d)/(ri*ri);
    if(d2<1.){float q=1.-d2;float k=q*q*q*a.z;f+=k;cs+=k*a.w;g-=6.*q*q*a.z*d/(ri*ri);}}
  return vec4(f,g,cs);}
#ifdef FIELD_TEX
vec4 fieldAt(vec2 p){return texture2D(u_field,texUV(p));}
float fieldF(vec2 p){return texture2D(u_field,texUV(p)).x;}
#else
vec4 fieldAt(vec2 p){return fieldLoop(p);}
float fieldF(vec2 p){return fieldLoop(p).x;}
#endif
float isoDist(float f){float a=sqrt(1.-pow(KT,.33333));float b=sqrt(max(0.,1.-pow(clamp(f,1e-6,1.),.33333)));return KR*(a-b);}
#ifdef HAS_BASE
// 场景提供 base(p)：不随文件变化的那部分。baseAt 取它的值——有贴图就查贴图。
vec4 base(vec2 p);
#ifdef BASE_TEX
vec4 baseAt(vec2 p){return texture2D(u_base,texUV(p));}
#else
vec4 baseAt(vec2 p){return base(p);}
#endif
#endif
`;
  const MAIN = `
void main(){
  vec2 p=vec2(gl_FragCoord.x,u_res.y-gl_FragCoord.y)/u_sc;
#if defined(FIELD_PASS)
  gl_FragColor=fieldLoop(p);
#elif defined(BASE_PASS)
  gl_FragColor=base(p);
#elif defined(PROBE)
  gl_FragColor=probe(p);
#else
  vec3 c=shade(p);
  c+=(hash21(gl_FragCoord.xy+fract(u_time)*61.)-.5)/255.;
  gl_FragColor=vec4(clamp(c,0.,1.),1.);
#endif
}`;
  const KIND_INDEX = { folder: 0, pdf: 1, img: 2, doc: 3, sheet: 4, key: 5, txt: 6, mov: 7, zip: 8, md: 9, mp3: 10 };

  DD.GL = function (canvas, onError) {
    const opts = { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power' };
    let gl = canvas.getContext('webgl2', opts);
    const gl2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', opts);
    if (!gl) throw new Error('这个浏览器没有开启 WebGL，场景画不出来。');

    // 半浮点渲染目标：影响场和底图要存超出 0–1、精度够高的数
    let HF = null;
    if (gl2) {
      if (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')) HF = { internal: gl.RGBA16F, type: gl.HALF_FLOAT };
    } else {
      const hf = gl.getExtension('OES_texture_half_float');
      if (hf && gl.getExtension('OES_texture_half_float_linear') && gl.getExtension('EXT_color_buffer_half_float')) HF = { internal: gl.RGBA, type: hf.HALF_FLOAT_OES };
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    function setParams(filter) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    // 0 号贴图单元：场景画在二维画布上、要被着色器合成进去的东西（水下的鱼等）
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    setParams(gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const EMPTY = new Uint8Array(4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, EMPTY);
    let hasSprite = false;

    // 一张可以画进去、也可以被查的贴图。unit：创建时借用的贴图单元（不打扰 0–2 号）
    function makeTarget(w, h, internal, type, filter) {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
      setParams(filter);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      if (!ok) { gl.deleteTexture(t); gl.deleteFramebuffer(f); return null; }
      return { tex: t, fbo: f, w, h };
    }
    let fieldT = null;
    if (HF) {
      fieldT = makeTarget(Math.ceil(W / 4), Math.ceil(H / 4), HF.internal, HF.type, gl.LINEAR);
      if (!fieldT) HF = null;     // 这块显卡画不进半浮点贴图：全部退回逐像素累加
    }
    const baseT = new Map();      // 场景 id → 底图贴图
    let fieldSig = '';

    const progs = new Map();
    const pts = new Float32Array(MAXN * 4), aux = new Float32Array(MAXN * 4), rip = new Float32Array(MAXR * 4);
    const fl = n => Number(n).toFixed(5);

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    // kind: 'main' 主画面 | 'probe' 探针 | 'field' 影响场贴图 | 'base' 底图贴图
    function program(sc, kind) {
      kind = kind || 'main';
      const key = sc.id + ':' + kind;
      if (progs.has(key)) return progs.get(key);
      let pr = null;
      try {
        let head = '#define MAXN ' + MAXN + '\n#define MAXR ' + MAXR + '\n#define KR ' + fl(sc.R) + '\n#define KT ' + fl(sc.T) + '\n#define KGROW ' + fl(sc.grow || 0) + '\n';
        const useField = !!fieldT && kind !== 'field' && kind !== 'base';
        const useBase = !!sc.base && !!HF && kind !== 'field' && kind !== 'base';
        if (kind === 'field') head += '#define FIELD_PASS 1\n';
        if (kind === 'base') head += '#define BASE_PASS 1\n';
        if (kind === 'probe') head += '#define PROBE 1\n';
        if (useField) head += '#define FIELD_TEX 1\n';
        if (sc.base && kind !== 'field') head += '#define HAS_BASE 1\n';
        if (useBase) head += '#define BASE_TEX 1\n';
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, head + COMMON + (kind === 'field' ? '' : sc.frag) + MAIN));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const u = {};
        for (const k of ['res', 'sc', 'px', 'time', 'world', 'n', 'pts', 'aux', 'rip', 'spr', 'field', 'base']) u[k] = gl.getUniformLocation(p, 'u_' + k);
        pr = { p, u, a: gl.getAttribLocation(p, 'a'), useField, useBase };
      } catch (e) {
        console.error('[' + sc.id + ':' + kind + '] 着色器编译失败\n' + e.message);
        if (onError) onError(sc, e.message);
      }
      progs.set(key, pr);
      return pr;
    }

    // 把发射源装进数组。settled 为真时用「长好之后」的权重（探针用）。返回个数和一个用来判断「变没变」的签名。
    function loadEmitters(settled) {
      let n = 0, sum = 0;
      for (const e of world.emitters) {
        if (n >= MAXN) break;
        const wt = settled ? e.tw : e.w;
        if (wt <= 0.0005) continue;
        const c = settled ? e.tc : e.c;
        pts[n * 4] = e.x; pts[n * 4 + 1] = e.y; pts[n * 4 + 2] = wt; pts[n * 4 + 3] = c;
        aux[n * 4] = e.seed / 997; aux[n * 4 + 1] = KIND_INDEX[e.kind] || 0; aux[n * 4 + 2] = e.age; aux[n * 4 + 3] = 0;
        sum += e.x * 1.37 + e.y * 2.11 + wt * 977.3 + c * 131.7 + n;
        n++;
      }
      return { n, sig: n + ':' + sum.toFixed(4) };
    }

    // 画一遍全屏四边形（到当前绑定的目标上）
    function pass(pr, width, height, n, baseTex) {
      gl.viewport(0, 0, width, height);
      gl.useProgram(pr.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(pr.a);
      gl.vertexAttribPointer(pr.a, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, pr.useField ? fieldT.tex : null);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, pr.useBase && baseTex ? baseTex : null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);

      rip.fill(0);
      let r = 0;
      for (const q of world.ripples) {
        const age = world.time - q.t0;
        if (age > 5 || age < 0 || r >= MAXR) continue;
        rip[r * 4] = q.x; rip[r * 4 + 1] = q.y; rip[r * 4 + 2] = age; rip[r * 4 + 3] = q.s;
        r++;
      }
      const u = pr.u;
      gl.uniform2f(u.res, width, height);
      gl.uniform2f(u.sc, width / W, height / H);
      gl.uniform1f(u.px, width / W);
      gl.uniform1f(u.time, world.time);
      gl.uniform2f(u.world, W, H);
      gl.uniform1i(u.n, n);
      gl.uniform4fv(u.pts, pts);
      gl.uniform4fv(u.aux, aux);
      gl.uniform4fv(u.rip, rip);
      gl.uniform1i(u.spr, 0);
      gl.uniform1i(u.field, 1);
      gl.uniform1i(u.base, 2);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // 影响场贴图：发射源没变就不重画
    function updateField(sc, n, sig) {
      if (!fieldT) return;
      const key = sc.id + '|' + sig;
      if (key === fieldSig) return;
      const fp = program(sc, 'field');
      if (!fp) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fieldT.fbo);
      pass(fp, fieldT.w, fieldT.h, n, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      fieldSig = key;
    }
    // 底图贴图：每个场景只画一次
    function baseFor(sc) {
      if (!sc.base || !HF) return null;
      if (baseT.has(sc.id)) return baseT.get(sc.id);
      const k = Math.min(1, 2048 / W);
      const t = makeTarget(Math.round(W * k), Math.round(H * k), HF.internal, HF.type, gl.LINEAR);
      const bp = t && program(sc, 'base');
      if (t && bp) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
        pass(bp, t.w, t.h, 0, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      const texture = t && bp ? t.tex : null;
      baseT.set(sc.id, texture);
      return texture;
    }

    function draw(sc, under) {
      const pr = program(sc, 'main');
      if (!pr) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (under) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, under); hasSprite = true; }
      else if (hasSprite) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, EMPTY); hasSprite = false; }
      const em = loadEmitters(false);
      const baseTex = baseFor(sc);
      updateField(sc, em.n, em.sig);
      pass(pr, canvas.width, canvas.height, em.n, baseTex);
    }

    // 探针：用场景自己的着色器，在一张很小的离屏图上把「这里是什么地形」画出来读回脚本。
    // 这样活物和装饰看到的地形与屏幕上画的完全一致（噪声不用在脚本里重算一遍）。
    // 场景在着色器里提供 vec4 probe(vec2 p)，并在定义里写 probe: true。读的是「长好之后」的地形。
    let probeT = null;
    function probe(sc) {
      const pr = program(sc, 'probe');
      if (!pr) return null;
      const pw = Math.max(16, Math.round(W / 6)), ph = Math.max(16, Math.round(H / 6));
      if (!probeT) probeT = makeTarget(pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
      if (!probeT) return null;
      const em = loadEmitters(true);
      const baseTex = baseFor(sc);
      updateField(sc, em.n, 'settled:' + em.sig);
      const data = new Uint8Array(pw * ph * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, probeT.fbo);
      pass(pr, pw, ph, em.n, baseTex);
      gl.readPixels(0, 0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // 取 (x, y) 处的值（0–255）。ch：0 红 1 绿 2 蓝。
      const sample = (x, y, ch) => {
        const ix = clamp(Math.floor(x / W * pw), 0, pw - 1), iy = clamp(Math.floor((1 - y / H) * ph), 0, ph - 1);
        return data[(iy * pw + ix) * 4 + (ch || 0)];
      };
      return { w: pw, h: ph, sample };
    }

    return { gl, draw, probe, program, info: { webgl2: gl2, fieldTexture: !!fieldT } };
  };
})();
