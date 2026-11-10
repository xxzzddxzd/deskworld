/* 场景实验室 · 界面与主循环 */
(function () {
  'use strict';
  const { W, H, clamp } = DD;
  const world = DD.world, env = DD.env;
  const $ = s => document.querySelector(s);
  const stageEl = $('#stage'), glc = $('#gl'), overc = $('#over'), worldEl = $('#world'), iconsEl = $('#icons');
  const infoEl = $('#info'), cardsEl = $('#cards'), capEl = $('#caption'), errEl = $('#err'), hintEl = $('#hint');
  const under = document.createElement('canvas');
  under.width = W; under.height = H;
  const uctx = under.getContext('2d'), octx = overc.getContext('2d');

  function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
  let G;
  try { G = DD.GL(glc, (sc, msg) => showErr('场景「' + sc.name + '」着色器出错：\n' + msg)); }
  catch (e) { showErr(e.message); return; }
  if (!DD.scenes.length) { showErr('没有注册任何场景'); return; }

  // ---------------------------------------------------------------- 模拟桌面上的文件

  const INITIAL = [
    ['设计稿', 'folder', 1186, 122], ['项目计划.pdf', 'pdf', 1296, 116],
    ['截图 11-08.png', 'img', 1192, 232], ['预算.xlsx', 'sheet', 1302, 228],
    ['会议纪要.docx', 'doc', 1188, 342], ['发布会.key', 'key', 1300, 338],
    ['旅行照片', 'folder', 372, 236], ['IMG_2041.jpg', 'img', 480, 282], ['行程.md', 'md', 396, 352],
    ['片头.mov', 'mov', 748, 520], ['配乐.mp3', 'mp3', 860, 556],
    ['备忘.txt', 'txt', 196, 606], ['归档.zip', 'zip', 1078, 640], ['灵感', 'folder', 668, 150],
  ];
  const POOL = [['报价单.pdf', 'pdf'], ['IMG_3310.jpg', 'img'], ['新建文件夹', 'folder'], ['周报.docx', 'doc'], ['数据.xlsx', 'sheet'],
    ['草稿.txt', 'txt'], ['录屏.mov', 'mov'], ['素材.zip', 'zip'], ['README.md', 'md'], ['播客.mp3', 'mp3'], ['路演.key', 'key']];
  const KIND = { pdf: ['#e5484d', 'PDF'], doc: ['#3b82f6', 'DOC'], sheet: ['#1fa463', 'XLS'], key: ['#f59e0b', 'KEY'], txt: ['#8b93a1', 'TXT'],
    mov: ['#8b5cf6', 'MOV'], zip: ['#a8763e', 'ZIP'], md: ['#14b8a6', 'MD'], mp3: ['#ec4899', 'MP3'] };
  const MAXFILES = 20;
  const els = new Map();
  let selected = null, cur = null, thumbTimer = 0, poolIdx = 0;

  function glyph(kind) {
    if (kind === 'folder') {
      return '<svg viewBox="0 0 64 64"><path d="M5 17a5 5 0 0 1 5-5h14.5a5 5 0 0 1 3.6 1.5l2.4 2.5H54a5 5 0 0 1 5 5v27a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill="#2f8fe0"/><path d="M5 26a5 5 0 0 1 5-5h44a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill="#62b8fb"/><path d="M5 26a5 5 0 0 1 5-5h44a5 5 0 0 1 5 5v1.5H5z" fill="#8bd0ff"/></svg>';
    }
    if (kind === 'img') {
      return '<svg viewBox="0 0 64 64"><rect x="7" y="11" width="50" height="42" rx="5" fill="#fff"/><rect x="11" y="15" width="42" height="34" rx="2.5" fill="#a5d6f6"/><circle cx="42" cy="25" r="4.5" fill="#ffe08a"/><path d="M11 46l11-14 8 9 6-6 17 12v2H11z" fill="#3f8f60"/></svg>';
    }
    const k = KIND[kind] || KIND.txt;
    return '<svg viewBox="0 0 64 64"><path d="M15 5h23l13 13v37a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4z" fill="#fdfdfd"/><path d="M38 5l13 13H42a4 4 0 0 1-4-4z" fill="#d5dbe4"/><path d="M18 26h26M18 32h26" stroke="#dfe4ea" stroke-width="2" stroke-linecap="round"/><rect x="11" y="39" width="40" height="13" fill="' + k[0] + '"/><text x="31" y="49" font-family="-apple-system,Helvetica,Arial" font-size="9" font-weight="700" text-anchor="middle" fill="#fff" letter-spacing=".5">' + k[1] + '</text></svg>';
  }

  function place(el, x, y) { el.style.transform = 'translate(' + (x - 50) + 'px,' + (y - 36) + 'px)'; }
  function toWorld(ev) { const r = stageEl.getBoundingClientRect(); return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height }; }

  function addIcon(f) {
    const el = document.createElement('div');
    el.className = 'icon';
    el.innerHTML = '<div class="glyph">' + glyph(f.kind) + '</div><div class="label"><span></span></div>';
    el.querySelector('span').textContent = f.name;
    place(el, f.x, f.y);
    iconsEl.appendChild(el);
    els.set(f.id, el);
    el.addEventListener('pointerdown', ev => startDrag(ev, f, el));
    requestAnimationFrame(() => el.classList.add('in'));
  }
  function select(f) {
    selected = f;
    for (const [id, el] of els) el.classList.toggle('sel', !!f && id === f.id);
  }
  function startDrag(ev, f, el) {
    if (ev.button) return;
    ev.preventDefault(); ev.stopPropagation();
    select(f);
    const p0 = toWorld(ev), ox = f.x - p0.x, oy = f.y - p0.y;
    let x = f.x, y = f.y, moved = false;
    el.setPointerCapture(ev.pointerId);
    el.classList.add('drag');
    const mv = e => {
      const p = toWorld(e);
      x = clamp(p.x + ox, 46, W - 46); y = clamp(p.y + oy, 66, H - 150);
      moved = true; place(el, x, y);
    };
    const up = () => {
      el.classList.remove('drag');
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      if (moved) { DD.moveFile(f, x, y); hintEl.classList.add('gone'); afterLayout(); }
    };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  stageEl.addEventListener('pointerdown', () => select(null));

  function flyTo(f, x, y) {
    const el = els.get(f.id);
    if (!el) return;
    el.classList.add('fly');
    place(el, x, y);
    DD.moveFile(f, x, y);
    setTimeout(() => el.classList.remove('fly'), 700);
    afterLayout();
  }

  const actions = {
    add() {
      if (world.files.length >= MAXFILES) return;
      const pk = POOL[poolIdx++ % POOL.length];
      let x = 0, y = 0;
      for (let i = 0; i < 80; i++) {
        x = 90 + Math.random() * (W - 180); y = 100 + Math.random() * (H - 290);
        if (world.files.every(f => Math.hypot(f.x - x, f.y - y) > 104)) break;
      }
      const f = DD.addFile(pk[0], pk[1], x, y);
      addIcon(f); select(f); afterLayout();
    },
    remove() {
      const f = selected || world.files[world.files.length - 1];
      if (!f) return;
      const el = els.get(f.id);
      if (el) el.remove();
      els.delete(f.id);
      DD.removeFile(f); select(null); afterLayout();
    },
    tidy() { // 像访达的「整理」：从右上角开始排成列
      const fs = world.files.slice().sort((a, b) => (Math.round((b.x - a.x) / 80) || (a.y - b.y)));
      fs.forEach((f, i) => {
        const col = Math.floor(i / 6), row = i % 6;
        setTimeout(() => flyTo(f, W - 78 - col * 106, 90 + row * 112), i * 60);
      });
    },
    scatter() {
      const anchors = [0, 1, 2].map(() => [170 + Math.random() * (W - 340), 160 + Math.random() * (H - 420)]);
      const placed = [];
      world.files.slice().forEach((f, i) => {
        let x = 0, y = 0;
        for (let k = 0; k < 80; k++) {
          if (Math.random() < 0.62) { const a = anchors[Math.floor(Math.random() * 3)]; x = a[0] + (Math.random() - 0.5) * 310; y = a[1] + (Math.random() - 0.5) * 270; }
          else { x = 80 + Math.random() * (W - 160); y = 90 + Math.random() * (H - 260); }
          x = clamp(x, 60, W - 60); y = clamp(y, 78, H - 170);
          if (placed.every(p => Math.hypot(p[0] - x, p[1] - y) > 100)) break;
        }
        placed.push([x, y]);
        setTimeout(() => flyTo(f, x, y), i * 55);
      });
    },
    reset() {
      for (const el of els.values()) el.remove();
      els.clear(); select(null);
      DD.clearFiles();
      for (const a of INITIAL) addIcon(DD.addFile(a[0], a[1], a[2], a[3], 'quiet'));
      afterLayout();
    },
    theater() {
      const on = document.body.classList.toggle('theater');
      $('#theaterBtn').textContent = on ? '退出预览 esc' : '沉浸预览';
    },
  };
  $('#tools').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (b && actions[b.dataset.act]) { actions[b.dataset.act](); if (b.dataset.act !== 'theater') hintEl.classList.add('gone'); }
  });
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && document.body.classList.contains('theater')) actions.theater();
    else if ((ev.key === 'Backspace' || ev.key === 'Delete') && selected) { ev.preventDefault(); actions.remove(); }
    else if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      const i = DD.scenes.indexOf(cur), n = DD.scenes.length;
      setScene(DD.scenes[(i + (ev.key === 'ArrowRight' ? 1 : n - 1)) % n]);
    }
  });

  // ---------------------------------------------------------------- 场景

  function ensure(sc) {
    if (!sc.st) { sc.st = (sc.init && sc.init(env)) || {}; sc.st.ver = -1; }
  }
  function stepScene(sc, dt) {
    const st = sc.st;
    if (st.ver !== world.version) {
      if (sc.probe) env.terrain = G.probe(sc);     // 场景要看地形：先读回「长好之后」的样子
      if (sc.layout) sc.layout(st, env);
      st.ver = world.version;
    }
    if (sc.update) sc.update(st, env, dt);
  }
  function drawScene(sc) {
    let u = null;
    if (sc.drawUnder) {
      uctx.setTransform(1, 0, 0, 1, 0, 0); uctx.clearRect(0, 0, W, H);
      sc.drawUnder(uctx, sc.st, env);
      u = under;
    }
    G.draw(sc, u);
    const k = overc.width / W;
    octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, overc.width, overc.height);
    octx.setTransform(k, 0, 0, k, 0, 0);
    if (sc.drawOver) sc.drawOver(octx, sc.st, env);
  }
  const pad = n => (n < 10 ? '0' : '') + n;

  function setScene(sc) {
    cur = sc;
    DD.activate(sc, true);
    ensure(sc);
    document.documentElement.style.setProperty('--accent', sc.accent);
    for (const c of cardsEl.children) c.classList.toggle('on', c.dataset.id === sc.id);
    renderInfo(sc);
    try { history.replaceState(null, '', '#' + sc.id); } catch (e) { /* file:// 下忽略 */ }
  }
  DD.on((type, f) => {
    if (!cur) return;
    if (type === 'drop' && cur.drop) cur.drop(cur.st, env, f.x, f.y + DD.EY);
  });

  function renderInfo(sc) {
    const i = DD.scenes.indexOf(sc) + 1, n = DD.scenes.length;
    const dots = v => '<i class="dots">' + [1, 2, 3, 4].map(k => '<b class="' + (k <= v ? 'f' : '') + '"></b>').join('') + '</i>';
    infoEl.innerHTML =
      '<div class="i-a"><div class="no"><span>Plate</span>' + pad(i) + '<em>/ ' + pad(n) + '</em></div>' +
      '<h2>' + sc.name + '</h2><div class="en">' + sc.en + '</div><p class="tag">' + sc.tagline + '</p></div>' +
      '<div class="i-b"><h3>文件 → 世界</h3><ol class="rules">' + sc.rules.map(r => '<li><b>' + r[0] + '</b><span>' + r[1] + '</span></li>').join('') + '</ol>' +
      '<h3>会动的细节</h3><p class="life">' + sc.life.join('<i>·</i>') + '</p>' +
      '<dl class="meta"><div><dt>图标可读性</dt><dd>' + dots(sc.meta.read) + '</dd></div><div><dt>实现成本</dt><dd>' + dots(sc.meta.cost) + '</dd></div><div><dt>耗电</dt><dd>' + dots(sc.meta.power) + '</dd></div></dl>' +
      (sc.note ? '<p class="note">' + sc.note + '</p>' : '') + '</div>';
    capEl.innerHTML = '图版 ' + pad(i) + '<i>—</i>' + sc.name + '<em>' + sc.en + '</em>';
    infoEl.classList.remove('swap'); void infoEl.offsetWidth; infoEl.classList.add('swap');
  }

  DD.scenes.forEach((sc, i) => {
    const b = document.createElement('button');
    b.className = 'card'; b.dataset.id = sc.id; b.style.setProperty('--i', i);
    b.innerHTML = '<canvas width="480" height="300"></canvas><div class="row"><span class="n">' + pad(i + 1) + '</span><b>' + sc.name + '</b><span class="e">' + sc.en + '</span></div><p>' + sc.short + '</p>';
    sc.thumb = b.querySelector('canvas');
    b.addEventListener('click', () => { setScene(sc); stageEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    cardsEl.appendChild(b);
  });

  // ---------------------------------------------------------------- 缩略图：用同一套管线各画一帧

  function miniIcons(x, k) {
    const rr = DD.rrect;
    for (const f of world.files) {
      const px = f.x * k, py = f.y * k, s = 64 * k;
      x.save();
      x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 3 * k * 4; x.shadowOffsetY = 1;
      if (f.kind === 'folder') { x.fillStyle = '#5db4fa'; rr(x, px - s * 0.42, py - s * 0.3, s * 0.84, s * 0.62, s * 0.1); x.fill(); }
      else if (f.kind === 'img') {
        x.fillStyle = '#fff'; rr(x, px - s * 0.4, py - s * 0.33, s * 0.8, s * 0.66, s * 0.08); x.fill();
        x.shadowColor = 'transparent'; x.fillStyle = '#8fcaf0'; x.fillRect(px - s * 0.32, py - s * 0.25, s * 0.64, s * 0.5);
      } else {
        x.fillStyle = '#fdfdfd'; rr(x, px - s * 0.31, py - s * 0.42, s * 0.62, s * 0.84, s * 0.07); x.fill();
        x.shadowColor = 'transparent'; x.fillStyle = (KIND[f.kind] || KIND.txt)[0]; x.fillRect(px - s * 0.31, py + s * 0.1, s * 0.62, s * 0.2);
      }
      x.restore();
    }
  }
  function refreshThumbs() {
    const saved = world.emitters.map(e => [e.w, e.c]);
    for (const sc of DD.scenes) {
      DD.activate(sc, true);
      for (const e of world.emitters) e.w = e.tw;     // 缩略图画「长好之后」的样子
      ensure(sc);
      if (!sc.st.warm) { for (let i = 0; i < 100; i++) { world.time += 0.05; stepScene(sc, 0.05); } sc.st.warm = true; }
      else stepScene(sc, 0.0001);
      drawScene(sc);
      const c = sc.thumb, x = c.getContext('2d');
      x.drawImage(glc, 0, 0, c.width, c.height);
      x.drawImage(overc, 0, 0, c.width, c.height);
      miniIcons(x, c.width / W);
    }
    world.emitters.forEach((e, i) => { e.w = saved[i][0]; e.c = saved[i][1]; });
    DD.activate(cur, false);
    drawScene(cur);
  }
  function afterLayout() { clearTimeout(thumbTimer); thumbTimer = setTimeout(refreshThumbs, 900); }

  // ---------------------------------------------------------------- 尺寸与主循环

  function resize() {
    const cssW = stageEl.clientWidth;
    if (!cssW) return;
    const dpr = window.devicePixelRatio || 1, q = Math.min(dpr, 1.5);
    const gw = Math.round(cssW * q), gh = Math.round(gw * H / W);
    if (glc.width !== gw) { glc.width = gw; glc.height = gh; }
    const ow = Math.round(cssW * dpr), oh = Math.round(ow * H / W);
    if (overc.width !== ow) { overc.width = ow; overc.height = oh; }
    worldEl.style.setProperty('--u', cssW / W);
    if (cur) drawScene(cur);
  }
  new ResizeObserver(resize).observe(stageEl);

  function tick(dt) {
    world.time += dt;
    DD.stepWorld(dt);
    stepScene(cur, dt);
    drawScene(cur);
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    tick(dt);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- 启动

  const d = new Date();
  $('#clock').textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + '日一二三四五六'[d.getDay()] + '  ' + pad(d.getHours()) + ':' + pad(d.getMinutes());

  for (const a of INITIAL) addIcon(DD.addFile(a[0], a[1], a[2], a[3], 'quiet'));
  resize();
  const want = (location.hash || '').slice(1);
  setScene(DD.scenes.find(s => s.id === want) || DD.scenes[0]);
  refreshThumbs();
  requestAnimationFrame(frame);

  // 调试用：在控制台里手动推进若干帧 / 切场景
  DD.debug = {
    tick(n, dt) { for (let i = 0; i < (n || 1); i++) tick(dt || 1 / 30); },
    scene(id) { const s = DD.scenes.find(q => q.id === id); if (s) setScene(s); },
    thumbs: refreshThumbs,
  };
})();
