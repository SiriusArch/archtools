/* ==========================================================================
   47-ui-zoom.js — sonsuz tuval: yakınlaştır / uzaklaştır / kaydır
   Pafta (levha) tuvalin ortasındaki bir sayfadır; kullanıcı uzaklaştırıp paftanın dışındaki boş alanları keşfeder,
   daireleri oraya bırakabilir. Görünüm yalnızca arayüz durumudur (state.ui.view = null | { cx, cy, k }); projeye / JSON'a yazılmaz.
     tekerlek ........ imlecin olduğu noktaya yakınlaştır · Ctrl + tekerlek / dokunmatik yüzey kıstırma de aynı
     kaydırma ........ orta tuşla sürükle · Boşluk basılıyken sürükle · El aracı · ok tuşları (seçili grup yokken)
     dokunmatik ...... iki parmakla kıstır + sürükle
     klavye .......... + / − yakınlaştır · 0 paftaya dön
   Dönüşüm: SVG viewBox = merkez + çarpan (meet); ekran ölçeği = sfit · k, sfit = min(eleman_g / W, eleman_y / H).
   Daire sürükleme / kutu seçimi aynı kalır: dünya koordinatı svg.getScreenCTM() ile hesaplanır (42-ui-board.js).
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const geo = App.geo;
  const clamp = App.util.clamp;
  const Z = (ui.zoom = {});

  const get = () => App.store.get();
  const dispatch = (a) => App.store.dispatch(a);
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const DEFAULT = () => ({ cx: geo.W / 2, cy: geo.H / 2, k: 1 });
  Z.cur = () => get().ui.view || DEFAULT();

  /* ---------- ekran ölçüleri ---------- */
  function metrics() {
    const el = ui.svgEl;
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    return { r: r, sfit: Math.min(r.width / geo.W, r.height / geo.H) };
  }
  // şu an ekranda görünen dünya dikdörtgeni
  function visibleRect(v, m) {
    const s = m.sfit * v.k;
    const hw = m.r.width / (2 * s), hh = m.r.height / (2 * s);
    return { x0: v.cx - hw, y0: v.cy - hh, x1: v.cx + hw, y1: v.cy + hh, s: s };
  }
  Z.visible = () => { const m = metrics(); return m ? visibleRect(Z.cur(), m) : null; };

  /* ---------- daire sınırları (etiket payı dahil) ---------- */
  function bubbleBoxes(S, only) {
    const k = geo.scale(S.project.spaces);
    return S.project.spaces.filter((s) => !only || only.indexOf(s.id) >= 0).map((s) => {
      const r = geo.radius(s.area, k);
      return { x0: s.x - r - 14, y0: s.y - r - 14, x1: s.x + r + 14, y1: s.y + r + 14 + (r < 36 ? 64 : 0) };
    });
  }
  const union = (bs) => bs.reduce((u, b) => ({ x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const SHEET = () => ({ x0: 0, y0: 0, x1: geo.W, y1: geo.H });
  const inside = (b, o) => b.x0 >= o.x0 && b.y0 >= o.y0 && b.x1 <= o.x1 && b.y1 <= o.y1;

  // dikdörtgeni (dünya) ekrana sığdıran görünüm
  function fitView(b, padPx, m) {
    const bw = Math.max(b.x1 - b.x0, 1), bh = Math.max(b.y1 - b.y0, 1);
    const k = Math.min(Math.max(m.r.width - 2 * padPx, 40) / bw, Math.max(m.r.height - 2 * padPx, 40) / bh) / m.sfit;
    return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, k: clamp(k, geo.ZOOM.min, geo.ZOOM.max) };
  }

  /* ---------- görünümü değiştir ---------- */
  let anim = null;
  Z.cancel = function () { if (anim) { cancelAnimationFrame(anim.raf); anim = null; } };
  Z.animating = () => !!anim;
  Z.set = function (v) { dispatch({ type: 'UI', patch: { view: geo.normView(v) } }); };

  // hedef görünüme yumuşak geçiş (log ölçekte yakınlaştırma); null = pafta
  Z.animateTo = function (t) {
    t = t || DEFAULT();
    const a = Z.cur();
    Z.cancel();
    if (reduceMotion()) { Z.set(t); return; }
    const t0 = performance.now(), D = 260;
    anim = { raf: 0, t: t };
    const step = function (now) {
      const p = clamp((now - t0) / D, 0, 1), e = 1 - Math.pow(1 - p, 3);
      if (p >= 1) { anim = null; Z.set(t); return; }
      Z.set({ cx: a.cx + (t.cx - a.cx) * e, cy: a.cy + (t.cy - a.cy) * e, k: a.k * Math.pow(t.k / a.k, e) });
      anim.raf = requestAnimationFrame(step);
    };
    anim.raf = requestAnimationFrame(step);
  };

  // (px, py) ekran noktası sabit kalacak şekilde çarpanla yakınlaştır
  Z.zoomAt = function (px, py, f, base) {
    const m = metrics();
    const v = base || Z.cur();
    const k2 = clamp(v.k * f, geo.ZOOM.min, geo.ZOOM.max);
    if (!m) { Z.set({ cx: v.cx, cy: v.cy, k: k2 }); return; }
    const s = m.sfit * v.k, s2 = m.sfit * k2;
    const dx = px - (m.r.left + m.r.width / 2), dy = py - (m.r.top + m.r.height / 2);
    Z.set({ cx: v.cx + dx / s - dx / s2, cy: v.cy + dy / s - dy / s2, k: k2 });
  };
  // art arda basılan + / − hedefi biriktirir (animasyon sürerken hedef görünümden devam edilir)
  Z.zoomBy = function (f) { const v = anim ? anim.t : Z.cur(); Z.animateTo({ cx: v.cx, cy: v.cy, k: clamp(v.k * f, geo.ZOOM.min, geo.ZOOM.max) }); };
  Z.home = function () { Z.animateTo(null); };

  // paftayı ve tüm daireleri birlikte göster
  Z.contentRect = (S) => union(bubbleBoxes(S).concat([SHEET()]));
  Z.fitAll = function () {
    const m = metrics();
    const S = get();
    const b = Z.contentRect(S);
    if (!m || inside(b, SHEET())) { Z.home(); return; } // her şey paftanın içindeyse varsayılan görünüm
    Z.animateTo(fitView(b, 36, m));
  };

  // bu daireler tamamen görünür değilse görünüme getir (listeden seçme, "yerini göster")
  Z.reveal = function (ids) {
    const m = metrics();
    if (!m) return;
    const S = get();
    const bs = bubbleBoxes(S, ids);
    if (!bs.length) return;
    const b = union(bs), v = Z.cur(), vis = visibleRect(v, m), pad = 16 / vis.s;
    if (b.x0 >= vis.x0 + pad && b.y0 >= vis.y0 + pad && b.x1 <= vis.x1 - pad && b.y1 <= vis.y1 - pad) return;
    const f = fitView(b, 80, m);
    Z.animateTo({ cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, k: Math.min(f.k, v.k) });
  };

  // görünüm dışında kalan daire sayısı ("N daire görünüm dışında" düğmesi)
  Z.offscreen = function (S) {
    const m = metrics();
    if (!m || !S.project.spaces.length) return 0;
    const vis = visibleRect(S.ui.view || DEFAULT(), m);
    return bubbleBoxes(S).filter((b) => b.x1 < vis.x0 || b.x0 > vis.x1 || b.y1 < vis.y0 || b.y0 > vis.y1).length;
  };

  /* ---------- tekerlek ---------- */
  let wh = null;
  function flushWheel() { const w = wh; wh = null; if (w) Z.zoomAt(w.x, w.y, w.f); }
  function onWheel(e) {
    if (get().ui.module !== 'islev') return;
    e.preventDefault();
    Z.cancel();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 33; else if (e.deltaMode === 2) dy *= 400;
    const f = Math.exp(-clamp(dy, -400, 400) * (e.ctrlKey ? 0.01 : 0.0016));
    if (!wh) { wh = { x: e.clientX, y: e.clientY, f: 1 }; requestAnimationFrame(flushWheel); }
    wh.x = e.clientX; wh.y = e.clientY; wh.f *= f;
  }

  /* ---------- işaretçi: kaydırma + kıstırma (yakalama aşamasında; daire sürükleme / kutu seçiminden önce) ---------- */
  const pts = new Map();
  let pinch = null, pan = null, inBoard = false;
  Z.busy = () => !!(pan || pinch);
  Z.inBoard = () => inBoard;

  function mid2() {
    const a = Array.from(pts.values()).slice(0, 2);
    return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1 };
  }
  function startPinch() {
    const m = metrics();
    if (!m) return;
    if (ui.cancelDrag) ui.cancelDrag();
    if (pan) endPan(pan.id);
    Z.cancel();
    const c = mid2();
    pinch = { d0: c.d, mid0: { x: c.x, y: c.y }, v0: Z.cur() };
  }
  function endPan(id) {
    if (!pan) return;
    try { ui.svgEl.releasePointerCapture(id); } catch (err) {}
    pan = null;
    dispatch({ type: 'UI', patch: { pn: false } });
  }

  function capDown(e) {
    inBoard = true;
    const S = get();
    if (S.ui.module !== 'islev') return;
    if (e.pointerType === 'touch') {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && !pinch) startPinch();
      if (pinch) { e.stopPropagation(); e.preventDefault(); return; }
    }
    const want = e.button === 1 || (e.button === 0 && (S.ui.sp || S.ui.tool === 'hand'));
    if (!want) return;
    e.stopPropagation();
    e.preventDefault();
    Z.cancel();
    pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, v: Z.cur() };
    try { ui.svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    dispatch({ type: 'UI', patch: { pn: true } });
  }
  function capMove(e) {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      e.stopPropagation(); e.preventDefault();
      const m = metrics();
      if (!m) return;
      const c = mid2(), v0 = pinch.v0;
      const k2 = clamp(v0.k * c.d / pinch.d0, geo.ZOOM.min, geo.ZOOM.max);
      const s0 = m.sfit * v0.k, s2 = m.sfit * k2;
      const ex = m.r.left + m.r.width / 2, ey = m.r.top + m.r.height / 2;
      // ilk orta noktanın altındaki dünya noktası, şimdiki orta noktanın altında kalsın
      const wx = v0.cx + (pinch.mid0.x - ex) / s0, wy = v0.cy + (pinch.mid0.y - ey) / s0;
      Z.set({ cx: wx - (c.x - ex) / s2, cy: wy - (c.y - ey) / s2, k: k2 });
      return;
    }
    if (pan && e.pointerId === pan.id) {
      e.stopPropagation(); e.preventDefault();
      const m = metrics();
      if (!m) return;
      const s = m.sfit * pan.v.k;
      Z.set({ cx: pan.v.cx - (e.clientX - pan.sx) / s, cy: pan.v.cy - (e.clientY - pan.sy) / s, k: pan.v.k });
    }
  }
  function capUp(e) {
    pts.delete(e.pointerId);
    if (pinch && pts.size < 2) { pinch = null; e.stopPropagation(); }
    if (pan && e.pointerId === pan.id) { e.stopPropagation(); endPan(e.pointerId); }
    if (!pts.size && !pan) inBoard = false;
  }

  /* ---------- klavye ---------- */
  const typing = (t) => !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const boardTarget = (t) => !t || t === document.body || t === document.documentElement || t === ui.svgEl;
  document.addEventListener('keydown', function (e) {
    const S = get();
    if (S.ui.module !== 'islev' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (e.key === ' ' || e.code === 'Space') {
      if (!boardTarget(e.target)) return; // odaktaki düğme / daire kendi Boşluk davranışını korur
      e.preventDefault();
      if (!S.ui.sp) dispatch({ type: 'UI', patch: { sp: true } });
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); Z.zoomBy(1.25); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); Z.zoomBy(0.8); }
    else if (e.key === '0') { Z.home(); }
    else if (e.key.indexOf('Arrow') === 0 && boardTarget(e.target) && !ui.activeGroup(S).length) {
      const m = metrics();
      if (!m) return;
      e.preventDefault();
      const v = Z.cur(), n = (e.shiftKey ? 220 : 70) / (m.sfit * v.k);
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      Z.cancel();
      Z.set({ cx: v.cx + d[0] * n, cy: v.cy + d[1] * n, k: v.k });
    }
  });
  document.addEventListener('keyup', function (e) {
    if ((e.key === ' ' || e.code === 'Space') && get().ui.sp) dispatch({ type: 'UI', patch: { sp: false } });
  });
  window.addEventListener('blur', function () { if (get().ui.sp) dispatch({ type: 'UI', patch: { sp: false } }); });

  /* ---------- bağlama (svg ilk oluşturulduğunda bir kez) ---------- */
  function onState(state, a) {
    if (!a) return;
    if (a.type === 'SELECT' && a.id && !inBoard) Z.reveal([a.id]);
    else if (a.type === 'HIGHLIGHT' && a.pair) Z.reveal([a.pair.a, a.pair.b]);
  }
  let subscribed = false;
  Z.wire = function (el) {
    if (!el || el.__zw) return;
    el.__zw = true;
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', capDown, true);
    el.addEventListener('pointermove', capMove, true);
    el.addEventListener('pointerup', capUp, true);
    el.addEventListener('pointercancel', capUp, true);
    el.addEventListener('mousedown', function (e) { if (e.button === 1) e.preventDefault(); }); // orta tuşla otomatik kaydırma açılmasın
    if (!subscribed) { subscribed = true; App.store.subscribe(onState); }
  };

  /* ---------- arayüz: yakınlaştırma çubuğu ---------- */
  Z.bar = function (state) {
    const v = state.ui.view;
    const hand = state.ui.tool === 'hand';
    const away = Z.offscreen(state);
    const b = (icon, label, fn, pressed) => ui.glass.gbtn(icon, label, { cls: 'gz', onclick: fn, pressed: pressed, size: 17 });
    return h('div', { class: 'gzoom', role: 'toolbar', 'aria-label': 'Tuval: yakınlaştır, uzaklaştır, kaydır' },
      b('hand', hand ? 'El aracını kapat' : 'El aracı: sürükleyerek kaydır (Boşluk + sürükle de olur)', () => dispatch({ type: 'UI', patch: { tool: hand ? 'select' : 'hand' } }), hand),
      h('span', { class: 'gzoom-sep', 'aria-hidden': 'true' }),
      b('minus', 'Uzaklaştır (−)', () => Z.zoomBy(0.8)),
      h('button', { type: 'button', class: 'gz-pct mono', title: 'Paftaya dön (0)', 'aria-label': 'Yakınlaştırma yüzde ' + Math.round((v ? v.k : 1) * 100) + ', paftaya dönmek için tıkla', onclick: Z.home }, Math.round((v ? v.k : 1) * 100) + '%'),
      b('plus', 'Yakınlaştır (+)', () => Z.zoomBy(1.25)),
      h('span', { class: 'gzoom-sep', 'aria-hidden': 'true' }),
      b('expand', 'Pafta ve tüm daireleri göster', Z.fitAll),
      away ? h('button', { type: 'button', class: 'gz-away', title: 'Görünüm dışındaki daireleri göster', onclick: Z.fitAll }, away + ' daire görünüm dışında') : null);
  };

  // nokta ızgarası: paftanın dışında da tuvalin kaydığı hissedilsin (uzaklaşınca seyrekleşir)
  Z.grid = function (view) {
    if (!view) return null;
    const step = 50 * Math.pow(2, Math.max(0, Math.ceil(Math.log2(0.5 / view.k))));
    const W = geo.WORLD;
    return [
      h('defs', { key: 'ws-defs' }, h('pattern', { id: 'ws-dots', patternUnits: 'userSpaceOnUse', x: 72 - step / 2, y: 72 - step / 2, width: step, height: step },
        h('circle', { cx: step / 2, cy: step / 2, r: 1.6 * Math.max(1, step / 50 / 1.5), fill: App.PAL.ink, opacity: 0.16 }))),
      h('rect', { key: 'ws-grid', x: W.x0, y: W.y0, width: W.x1 - W.x0, height: W.y1 - W.y0, fill: 'url(#ws-dots)', 'pointer-events': 'none' }),
    ];
  };
})();
