/* 壁纸宿主：真实桌面上运行的那一页（由 DeskWorld.app 里的 WKWebView 加载）。
 *
 * 没有模拟图标，也没有界面，只做三件事：
 *   1. 接收原生程序转来的访达数据（图标坐标），换算成这块屏幕上的坐标；
 *   2. 和当前世界里的文件对账：多出来的长出来，不见了的沉下去；
 *   3. 画——并且在没事发生时什么都不做：
 *      · 地形只在文件变动的那两三秒里重画（全分辨率、跟着屏幕刷新率），停稳后渲染循环休眠；
 *      · 纸鹤、纸船、山上的装饰各是一小块图层，位移、扇翅、冒出来都交给系统合成器，
 *        脚本只在「定下一段路线」和「文件变动」时才醒（见场景里的 layers）。
 *
 * 原生端调用：Wall.update({ raw, screen })、Wall.debug(on)、Wall.pause(on)、Wall.settle()、Wall.info()
 * 也可以直接在浏览器里打开本页，从控制台调用同样的接口来预览。
 */
(function () {
  'use strict';
  const { W, H } = DD;
  const world = DD.world, env = DD.env;
  const glc = document.getElementById('gl'), overc = document.getElementById('over');
  const groundHost = document.getElementById('ground'), skyHost = document.getElementById('sky');
  const octx = overc.getContext('2d');
  const DPR = window.devicePixelRatio || 1;
  const Q_FULL = Math.min(DPR, 2);

  // 访达的 desktop position 是图标图像的中心点（全局坐标，原点在主屏左上角，y 向下）。
  // 2026-11-10 在真实桌面上核对过：首行图标 y=78、最右一列 x=1447（1512 宽的屏），与「中心点」吻合。
  // 如果以后看到地形和图标有固定偏差，在这里校正。
  const ICON_DX = 0, ICON_DY = 0;
  const MAX_FILES = DD.MAXN - 16; // 给正在消散的旧影子留出位置

  const native = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.wall;
  const post = (type, data) => { if (native) { try { native.postMessage(Object.assign({ type }, data || {})); } catch (e) { /* 原生端不在 */ } } };
  const log = msg => { if (native) post('log', { msg: String(msg) }); else console.log('[wall]', msg); };
  window.addEventListener('error', e => log('脚本错误：' + e.message + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno));

  let G;
  try { G = DD.GL(glc, (sc, msg) => log('着色器出错：' + msg)); }
  catch (e) { log(e.message); return; }
  const sc = DD.scenes[0];
  if (!sc) { log('没有场景'); return; }
  DD.activate(sc, true);
  sc.st = (sc.init && sc.init(env)) || {};
  sc.st.ver = -1;

  let under = null, uctx = null;
  if (sc.drawUnder) { under = document.createElement('canvas'); under.width = W; under.height = H; uctx = under.getContext('2d'); }

  let debug = false, paused = false, running = false, frames = 0, terrainDraws = 0, synced = -1;

  // ---------------------------------------------------------------- 图层（交给合成器的小东西）

  const stamps = new Map();
  const tf = (x, y, rot, scale) => 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) rotate(' + (rot || 0).toFixed(4) + 'rad)' + (scale === undefined ? '' : ' scale(' + scale + ')');
  const lifeApi = {
    DPR,
    // 一组一起移动的图层（比如纸鹤的翅膀 + 身体），中心在 (0,0)。layer：'ground' 贴地的，'sky' 天上飞的
    group(w, h, layer) {
      const el = document.createElement('div');
      el.className = 'sp';
      el.style.width = w + 'px'; el.style.height = h + 'px';
      el.style.marginLeft = (-w / 2) + 'px'; el.style.marginTop = (-h / 2) + 'px';
      (layer === 'sky' ? skyHost : groundHost).appendChild(el);
      return el;
    },
    // 往一组里加一层：只画一次，draw(ctx) 以这组的中心为原点
    part(group, draw) {
      const w = parseFloat(group.style.width), h = parseFloat(group.style.height);
      const el = document.createElement('div');
      el.className = 'part';
      const c = document.createElement('canvas');
      c.width = Math.round(w * DPR); c.height = Math.round(h * DPR);
      const g = c.getContext('2d');
      g.setTransform(DPR, 0, 0, DPR, c.width / 2, c.height / 2);
      draw(g);
      el.appendChild(c); group.appendChild(el);
      return el;
    },
    // 把一个图案画成图片存起来（同一个 key 只画一次），很多图层可以共用——数量多的装饰靠它才不卡
    stamp(key, w, h, draw) {
      let url = stamps.get(key);
      if (!url) {
        const c = document.createElement('canvas');
        c.width = Math.round(w * DPR); c.height = Math.round(h * DPR);
        const g = c.getContext('2d');
        g.setTransform(DPR, 0, 0, DPR, c.width / 2, c.height / 2);
        draw(g);
        url = c.toDataURL('image/png');
        stamps.set(key, url);
      }
      return url;
    },
    // 用存好的图片做一个图层
    image(w, h, url, layer) {
      const el = this.group(w, h, layer);
      el.style.backgroundImage = 'url(' + url + ')';
      el.style.backgroundSize = '100% 100%';
      return el;
    },
    place(el, x, y, rot) { el.style.transform = tf(x, y, rot); },
    // 沿一串时间间隔相等的路点匀速走完（pts: [{x, y, r}]，可整体偏移 dx, dy）。
    // 整段都由合成器驱动，走完才回调 done——中间脚本不用醒。
    travel(el, pts, seconds, dx, dy, done) {
      const frames = pts.map(p => ({ transform: tf(p.x + (dx || 0), p.y + (dy || 0), p.r) }));
      const anim = el.animate(frames, { duration: Math.max(60, seconds * 1000), easing: 'linear', fill: 'forwards' });
      anim.onfinish = () => {
        el.style.transform = frames[frames.length - 1].transform;
        anim.cancel();
        if (done) done();
      };
      if (paused) anim.pause();
      return anim;
    },
    // 此刻实际在哪（动画走到一半时也准）
    where(el) {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { x: m.m41, y: m.m42, r: Math.atan2(m.b, m.a) };
    },
    // 就地停下（不触发 done）
    stop(el, anim) {
      const at = this.where(el);
      anim.onfinish = null;
      anim.cancel();
      el.style.transform = tf(at.x, at.y, at.r);
    },
    // 装饰：从无到有弹出来 / 缩回去后移除
    appear(el, x, y, delay, scale) {
      el.style.transform = tf(x, y, 0, 0);
      void el.offsetWidth;
      el.style.transition = 'transform .6s cubic-bezier(.3,1.5,.5,1) ' + (delay || 0).toFixed(2) + 's';
      el.style.transform = tf(x, y, 0, scale === undefined ? 1 : scale);
    },
    vanish(el) {
      const at = this.where(el);
      el.style.transition = 'transform .3s ease-in';
      el.style.transform = tf(at.x, at.y, 0, 0);
      setTimeout(() => el.remove(), 400);
    },
    // 一片纸屑：从 (x0,y0) 飞到 (x1,y1)，边转边淡出
    confetti(x0, y0, x1, y1, size, color, spin, ms) {
      const el = document.createElement('div');
      el.className = 'bit';
      el.style.width = size + 'px'; el.style.height = (size * 0.6) + 'px'; el.style.background = color;
      skyHost.appendChild(el);
      const a = el.animate([
        { transform: tf(x0, y0, 0), opacity: 1 },
        { transform: tf(x0 + (x1 - x0) * 0.8, y0 + (y1 - y0) * 0.7, spin * 0.6), opacity: 1, offset: 0.45 },
        { transform: tf(x1, y1, spin), opacity: 0 },
      ], { duration: ms, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
      a.onfinish = () => el.remove();
    },
  };
  const life = sc.layers && groundHost && skyHost ? sc.layers : null;   // 场景的「图层版」；没有就退回整屏画布
  let lifeState = null;
  // 没有 layers 的场景退回老办法：整屏画布，持续重画
  const continuous = !sc.still || (!life && !!sc.drawOver);
  DD.on((type, f) => {
    if (type !== 'drop') return;
    if (life && life.drop) life.drop(lifeState, lifeApi, env, f.x, f.y + DD.EY);
    else if (sc.drop) sc.drop(sc.st, env, f.x, f.y + DD.EY);
  });

  // ---------------------------------------------------------------- 画

  let lastT = 0, q = Q_FULL;
  let trN = 0, trSum = 0, trMax = 0, winN = 0, winSlow = 0;   // 这一次过渡的帧统计

  function moving() {
    for (const e of world.emitters) if (e.tw === 0 || Math.abs(e.tw - e.w) > 0.004 || Math.abs(e.tc - e.c) > 0.02) return true;
    return false;
  }
  function snap() { // 直接跳到停稳的状态
    for (let i = world.emitters.length - 1; i >= 0; i--) {
      const e = world.emitters[i];
      if (e.tw === 0) world.emitters.splice(i, 1); else { e.w = e.tw; e.c = e.tc; }
    }
  }
  function drawTerrain(scale) {
    const gw = Math.round(W * scale), gh = Math.round(H * scale);
    if (glc.width !== gw || glc.height !== gh) { glc.width = gw; glc.height = gh; }
    if (under) { uctx.setTransform(1, 0, 0, 1, 0, 0); uctx.clearRect(0, 0, W, H); sc.drawUnder(uctx, sc.st, env); }
    G.draw(sc, under);
    terrainDraws++;
  }
  function drawOver() { // 整屏画布：只用来画校准标记，以及没有 layers 的场景的活物；用不上时不占显存
    if (!debug && (life || !sc.drawOver)) {
      if (overc.width > 1) { overc.width = 1; overc.height = 1; overc.style.display = 'none'; }
      return;
    }
    const ow = Math.round(W * DPR), oh = Math.round(H * DPR);
    if (overc.width !== ow || overc.height !== oh) { overc.width = ow; overc.height = oh; overc.style.display = 'block'; }
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, overc.width, overc.height);
    octx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!life && sc.drawOver) sc.drawOver(octx, sc.st, env);
    if (debug) drawDebug();
  }
  function drawDebug() { // 校准标记：红圈应当正好套住图标（64 pt）
    octx.lineWidth = 1.5; octx.font = '11px Menlo, monospace'; octx.textAlign = 'left';
    for (const f of world.files) {
      octx.strokeStyle = 'rgba(255,70,70,.95)';
      octx.beginPath(); octx.arc(f.x, f.y, 32, 0, 7);
      octx.moveTo(f.x - 46, f.y); octx.lineTo(f.x + 46, f.y); octx.moveTo(f.x, f.y - 46); octx.lineTo(f.x, f.y + 46); octx.stroke();
      octx.fillStyle = '#fff'; octx.fillText(Math.round(f.x) + ',' + Math.round(f.y), f.x + 36, f.y - 36);
    }
  }
  function step(dt) {
    world.time += dt;
    DD.stepWorld(dt);
    const st = sc.st;
    if (st.ver !== world.version) { // 文件变了：读回新地形，重新摆装饰、规划航线
      if (sc.probe) env.terrain = G.probe(sc);
      if (sc.layout) sc.layout(st, env);
      st.ver = world.version;
      if (life && life.layout) life.layout(lifeState, lifeApi, env, st);
    }
    if (sc.update) sc.update(st, env, dt);
  }
  // 渲染循环只在有事可做时运行：文件变动 → wake()；地形停稳之后自己停下
  function wake() {
    if (running || paused) return;
    running = true; lastT = performance.now();
    trN = 0; trSum = 0; trMax = 0; winN = 0; winSlow = 0;
    requestAnimationFrame(frame);
  }
  function frame(now) {
    if (paused) { running = false; return; }
    const ms = Math.max(0, now - lastT);
    lastT = now; frames++;
    step(Math.min(0.05, ms / 1000));
    const mv = moving();
    if (mv) {
      if (trN > 0) { // 第一帧的间隔不算（刚醒）
        trSum += ms; trMax = Math.max(trMax, ms);
        // 这块屏幕要是带不动全分辨率（最近 20 帧里多半都超过 25 ms），这次过渡就降一档；停稳后仍补一帧全分辨率。
        // 按「慢帧的比例」而不是平均值判断：开头摆装饰的那一两帧卡顿不该连累画质。
        if (trN > 3) { winN++; if (ms > 25) winSlow++; }
        if (winN >= 20) { if (winSlow > 10 && q > 1) q = Math.max(1, q * 0.75); winN = 0; winSlow = 0; }
      }
      trN++;
      drawTerrain(q);
    } else {
      snap();
      drawTerrain(Q_FULL);
      if (trN > 2) log('过渡：' + trN + ' 帧，平均 ' + (trSum / (trN - 1)).toFixed(1) + ' ms/帧（约 ' + Math.round(1000 * (trN - 1) / Math.max(1, trSum)) + ' 帧/秒），最慢一帧 ' + trMax.toFixed(0) + ' ms，渲染 ' + Math.round(W * q) + '×' + Math.round(H * q));
      q = Q_FULL; trN = 0; trSum = 0; trMax = 0;
    }
    if (debug || (!life && sc.drawOver)) drawOver();
    if (mv || continuous) requestAnimationFrame(frame); else running = false;
  }

  // ---------------------------------------------------------------- 对账

  function parse(raw) { // "x,y;x,y;…|…"
    const pts = [];
    for (const s of String(raw).split('|')[0].split(';')) {
      if (!s) continue;
      const p = s.split(','), x = parseFloat(p[0]), y = parseFloat(p[1]);
      if (isFinite(x) && isFinite(y)) pts.push([x, y]);
    }
    return pts;
  }
  function sync(pts, quiet) {
    const files = world.files.slice(), used = new Uint8Array(pts.length), gone = [];
    let moved = 0;
    for (const f of files) { // 位置几乎没变的算同一个文件
      let best = -1, bd = 14;
      for (let i = 0; i < pts.length; i++) {
        if (used[i]) continue;
        const d = Math.hypot(pts[i][0] - f.x, pts[i][1] - f.y);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) gone.push(f);
      else { used[best] = 1; if (bd > 0.01) { DD.moveFile(f, pts[best][0], pts[best][1]); moved++; } }
    }
    for (const f of gone) DD.removeFile(f);
    let added = 0;
    for (let i = 0; i < pts.length; i++) {
      if (!used[i]) { DD.addFile('', 'txt', pts[i][0], pts[i][1], quiet ? 'quiet' : undefined); added++; }
    }
    return { added, removed: gone.length, moved };
  }

  window.Wall = {
    // raw：访达返回的全部图标坐标（全局）；screen：这块屏幕左上角的全局坐标与尺寸
    update(p) {
      const s = p.screen || { x: 0, y: 0 };
      const all = parse(p.raw), pts = [];
      for (const pt of all) {
        const x = pt[0] - s.x + ICON_DX, y = pt[1] - s.y + ICON_DY;
        if (x > -20 && x < W + 20 && y > -20 && y < H + 20) pts.push([x, y]);
      }
      const first = synced < 0;
      const r = sync(pts.slice(0, MAX_FILES), first);
      synced = pts.length;
      const changed = first || r.added + r.removed + r.moved > 0;
      if (changed) {                    // 变化不在这块屏幕上就什么都不用做
        if (document.hidden) snap();    // 桌面被盖住时发生的变化，不需要补放动画
        wake();
      }
      post('synced', { onScreen: pts.length, total: all.length, added: r.added, removed: r.removed, changed, capped: pts.length > MAX_FILES });
      return pts.length;
    },
    debug(on) { debug = !!on; drawOver(); return debug; },
    pause(on) {
      paused = !!on;
      document.body.classList.toggle('paused', paused);
      for (const a of document.getAnimations()) { if (paused) a.pause(); else a.play(); }
      if (!paused) wake();
      return paused;
    },
    settle() { snap(); step(0.001); drawTerrain(Q_FULL); drawOver(); return true; },
    info() {
      return JSON.stringify({ w: W, h: H, dpr: DPR, scene: sc.id, files: world.files.length, emitters: world.emitters.length,
        frames, terrainDraws, running, gl: glc.width + 'x' + glc.height, webgl2: G.info.webgl2, fieldTexture: G.info.fieldTexture,
        layers: document.querySelectorAll('.sp').length, anims: document.getAnimations().length, moving: moving(), hidden: document.hidden });
    },
  };

  // 先画一帧没有文件的底图，再告诉原生端可以送数据了
  if (life) lifeState = life.init(lifeApi, env);
  step(0.001); drawTerrain(Q_FULL); drawOver();
  if (continuous) wake();
  post('ready', { w: W, h: H, dpr: DPR, scene: sc.id });
  log('壁纸页就绪 ' + W + '×' + H + ' @' + DPR + 'x 场景=' + sc.id + (G.info.fieldTexture ? '' : '（这块显卡不支持半浮点贴图，用逐像素累加）'));
})();
