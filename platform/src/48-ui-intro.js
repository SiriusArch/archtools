/* ==========================================================================
   48-ui-intro.js — açılış: tel kafes küre → "archtools" yazısı → yazının içinden siteye dalış
   Akış (tek zaman çizelgesi, tek rAF döngüsü):
     1) Siyah zeminde gürültüyle dalgalanan, dönen tel kafes küre belirir.
     2) Küre şişer, sonra düğümleri "archtools" harflerinin üzerine akar; kafes çizgileri söner.
        Noktalar yazıyı oluşturduğu anda gerçek tipografi netleşir ve tuval tamamen kaybolur.
     3) Yazı, "o" harfinin boşluğu merkez alınarak izleyiciye doğru hızlanarak büyür (hafif bulanıklık);
        boşluk ekranı kaplarken zemin saydamlaşır: yazının içinden geçilip siteye girilir.
   Oturum başına bir kez gösterilir (?intro=1 ile zorlanır, ?intro=0 ile kapatılır).
   ?introslow=6 animasyonu ağır çekimde oynatır (inceleme için).
   Herhangi bir tuş / tıklama / "Geç" doğrudan (kısa) dalışa atlar. Hareket azaltma tercihinde yalnızca kısa bir solma.
   Kitaplık yok: küre 2B tuvale çizilir (katı CSP ile uyumlu, WebGL gerekmez).
   ========================================================================== */
(function () {
  const App = window.App;
  const KEY = 'archtools.intro.seen';

  // zaman çizelgesi (ms)
  const T = { orbIn: 900, swell: 1250, morph: 1750, morphDur: 1150, word: 2650, wordDur: 380, dive: 3450, diveDur: 1150, quick: 520 };

  function wantIntro() {
    try {
      const q = new URLSearchParams(location.search).get('intro');
      if (q === '0') return false;
      if (q === '1') return true;
      if (window.sessionStorage.getItem(KEY)) return false;
    } catch (e) {}
    return true;
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const seg = (t, a, d) => clamp((t - a) / d, 0, 1);
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  /* ---------------- küre: ikosfer (düğümler + kenarlar) ---------------- */
  function icosphere(sub) {
    const t = (1 + Math.sqrt(5)) / 2;
    const norm = (p) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; };
    const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
    let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let s = 0; s < sub; s++) {
      const mid = {}, NF = [];
      const m = (a, b) => {
        const k = a < b ? a + '_' + b : b + '_' + a;
        if (mid[k] == null) { mid[k] = V.length; V.push(norm([(V[a][0] + V[b][0]) / 2, (V[a][1] + V[b][1]) / 2, (V[a][2] + V[b][2]) / 2])); }
        return mid[k];
      };
      F.forEach((f) => { const a = m(f[0], f[1]), b = m(f[1], f[2]), c = m(f[2], f[0]); NF.push([f[0], a, c], [f[1], b, a], [f[2], c, b], [a, b, c]); });
      F = NF;
    }
    const seen = {}, E = [];
    F.forEach((f) => [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]].forEach((e) => { const k = e[0] < e[1] ? e[0] + '_' + e[1] : e[1] + '_' + e[0]; if (!seen[k]) { seen[k] = 1; E.push(e); } }));
    return { V: V, E: E };
  }

  /* ---------------- yazının nokta hedefleri: h1 ile birebir aynı yerde ---------------- */
  function textTargets(word, n) {
    const r = word.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const cs = getComputedStyle(word);
    const W = Math.ceil(r.width), H = Math.ceil(r.height);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    c.fillStyle = '#fff'; c.textBaseline = 'alphabetic';
    const m = c.measureText('archtools');
    const fs = parseFloat(cs.fontSize);
    const asc = m.fontBoundingBoxAscent || fs * 0.9, desc = m.fontBoundingBoxDescent || fs * 0.25;
    Array.prototype.forEach.call(word.children, (sp) => {
      const b = sp.getBoundingClientRect();
      c.fillText(sp.textContent, b.left - r.left, b.top - r.top + (b.height - (asc + desc)) / 2 + asc);
    });
    const d = c.getImageData(0, 0, W, H).data, pts = [];
    const step = Math.max(1, Math.round(Math.sqrt(W * H / 9000)));
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (d[(y * W + x) * 4 + 3] > 110) pts.push([x + r.left, y + r.top]);
    if (pts.length < 20) return null;
    const out = []; // n hedef: eşit aralıklı örnekleme (harflerin tümü dolsun)
    for (let i = 0; i < n; i++) out.push(pts[Math.floor((i + 0.5) * pts.length / n)]);
    return out;
  }

  App.intro = {
    active: false,
    // done: intro bitince çağrılır
    start: function (done) {
      const el = document.getElementById('intro');
      const root = document.getElementById('root');
      const finish = function () { if (typeof done === 'function') done(); };
      if (!el || !wantIntro() || document.hidden) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
        document.documentElement.removeAttribute('data-intro');
        finish();
        return;
      }
      const word = document.getElementById('intro-word');
      const cv = document.getElementById('intro-orb');
      const ctx = cv && cv.getContext ? cv.getContext('2d') : null;
      const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || !ctx || !word;
      const t0 = performance.now();
      let slow = 1; // ?introslow=6 → ağır çekim (yalnızca inceleme / test için)
      try { slow = clamp(Number(new URLSearchParams(location.search).get('introslow')) || 1, 1, 20); } catch (e) {}
      let closed = false, raf = 0, diveAt = T.dive, diveDur = T.diveDur, skipped = false;
      let onResize = function () {};
      App.intro.active = true;
      el.classList.add('run');
      if (root) { root.setAttribute('inert', ''); root.setAttribute('aria-hidden', 'true'); }
      const skipBtn = document.getElementById('intro-skip');
      if (skipBtn) { try { skipBtn.focus({ preventScroll: true }); } catch (e) {} }
      try { if (document.fonts && document.fonts.load) document.fonts.load('300 80px Unbounded', 'archtools'); } catch (e) {}

      function end() {
        if (closed) return;
        closed = true;
        cancelAnimationFrame(raf);
        try { window.sessionStorage.setItem(KEY, '1'); } catch (e) {}
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('resize', onResize);
        if (root) { root.removeAttribute('inert'); root.removeAttribute('aria-hidden'); }
        App.intro.active = false;
        if (el.parentNode) el.parentNode.removeChild(el);
        finish();
      }
      // atla: neredeysek oradan doğrudan (kısa) dalışa geç
      function skip() {
        if (closed) return;
        if (reduce) { end(); return; }
        const t = (performance.now() - t0) / slow;
        if (t < diveAt) { diveAt = t; diveDur = T.quick; skipped = true; }
      }
      function onKey(e) {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') { e.preventDefault(); skip(); }
      }
      function onVis() { if (document.hidden) end(); }
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('visibilitychange', onVis);
      el.addEventListener('pointerdown', skip);
      App.intro.skip = skip;

      /* ---- hareket azaltma: küre yok; yazı kısa süre görünür ve söner ---- */
      if (reduce) {
        el.classList.add('calm');
        setTimeout(function () { el.classList.add('out'); setTimeout(end, 280); }, 1100);
        return;
      }

      /* ---- sahne ---- */
      const mesh = icosphere(3); // 642 düğüm, 1920 kenar
      const N = mesh.V.length;
      const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
      let W = 0, H = 0, dpr = 1, targets = null, order = null, origin = null, cleared = false;
      onResize = function () {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth; H = window.innerHeight;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        targets = null; origin = null; // yazı konumu değişti: yeniden örneklenir
      };
      window.addEventListener('resize', onResize);
      onResize();

      function setOrigin() {
        const r = word.getBoundingClientRect(), o = word.children[5].getBoundingClientRect(); // ilk "o"nun boşluğu
        origin = [o.left + o.width / 2 - r.left, o.top + o.height / 2 - r.top];
        word.style.transformOrigin = origin[0].toFixed(1) + 'px ' + origin[1].toFixed(1) + 'px';
      }
      function prepareTargets() {
        const tg = textTargets(word, N);
        if (!tg) return;
        // soldaki düğüm soldaki harfe gitsin: iki küme de x'e göre sıralanıp eşlenir
        const vi = [], ti = [];
        for (let i = 0; i < N; i++) { vi.push(i); ti.push(i); }
        vi.sort((a, b) => px[a] - px[b]); ti.sort((a, b) => tg[a][0] - tg[b][0]);
        const r = word.getBoundingClientRect();
        targets = new Array(N); order = new Float32Array(N);
        for (let k = 0; k < N; k++) { targets[vi[k]] = tg[ti[k]]; order[vi[k]] = (tg[ti[k]][0] - r.left) / Math.max(1, r.width); }
      }

      function frame(now) {
        if (closed) return;
        raf = requestAnimationFrame(frame);
        const t = (now - t0) / slow, ts = t / 1000;
        const d = seg(t, diveAt, diveDur);

        /* 1–2) küre ve yazıya dönüşüm */
        const fade = (1 - seg(t, T.word, T.wordDur)) * (1 - seg(d, 0, 0.3));
        if (fade > 0.002) {
          const inK = easeOut(seg(t, 0, T.orbIn));
          const swell = Math.sin(seg(t, T.swell, T.morph - T.swell) * Math.PI) * 0.12;
          const R = Math.min(W, H) * 0.3 * (0.55 + 0.45 * inK) * (1 + swell);
          const yaw = ts * 0.55, pitch = 0.42 + Math.sin(ts * 0.33) * 0.22;
          const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
          const cx = W / 2, cy = H / 2, f = 3.2;
          for (let i = 0; i < N; i++) {
            const v = mesh.V[i];
            const n = 1 + 0.17 * Math.sin(3.1 * v[0] + ts * 0.9) * Math.sin(2.7 * v[1] + ts * 1.2) * Math.sin(3.3 * v[2] + ts * 0.7) + 0.07 * Math.sin(6.4 * v[0] + 5.1 * v[2] - ts * 1.6);
            const x = v[0] * n, y = v[1] * n, z = v[2] * n;
            const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
            const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
            const s = f / (f + z2);
            px[i] = cx + x1 * R * s; py[i] = cy + y2 * R * s; pz[i] = z2;
          }
          const mp = seg(t, T.morph, T.morphDur);
          if (mp > 0 && !targets) prepareTargets();
          let lineA = 1;
          if (mp > 0 && targets) {
            lineA = 1 - seg(mp, 0.05, 0.5);
            for (let i = 0; i < N; i++) {
              const e = easeIO(clamp((mp - order[i] * 0.28) / 0.72, 0, 1));
              const sw = Math.sin(e * Math.PI) * 26 * (((i * 7) % 5) / 4 - 0.5); // yolda hafif savrulma
              px[i] += (targets[i][0] - px[i]) * e + sw;
              py[i] += (targets[i][1] - py[i]) * e - Math.abs(sw) * 0.6;
            }
          }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, W, H);
          ctx.lineWidth = 1;
          if (lineA > 0.01) {
            for (let pass = 0; pass < 2; pass++) { // arka yüz sönük, ön yüz parlak: derinlik
              ctx.beginPath();
              for (let k = 0; k < mesh.E.length; k++) {
                const a = mesh.E[k][0], b = mesh.E[k][1];
                if (((pz[a] + pz[b]) > 0) === (pass === 0)) { ctx.moveTo(px[a], py[a]); ctx.lineTo(px[b], py[b]); }
              }
              ctx.strokeStyle = 'rgba(246,247,249,' + (fade * lineA * inK * (pass === 0 ? 0.26 : 0.78)).toFixed(3) + ')';
              ctx.stroke();
            }
          }
          if (mp > 0 && targets) {
            const sz = 1.2 + 0.9 * mp;
            ctx.fillStyle = 'rgba(246,247,249,' + (fade * seg(mp, 0, 0.4)).toFixed(3) + ')';
            ctx.beginPath();
            for (let i = 0; i < N; i++) ctx.rect(px[i] - sz / 2, py[i] - sz / 2, sz, sz);
            ctx.fill();
          }
          cleared = false;
        } else if (!cleared) {
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
          cleared = true; // küre tamamen yok: yalnızca tipografi kalır
        }

        /* yazı: noktalar yerine oturunca netleşir (atlandıysa hemen) */
        let wa = easeOut(seg(t, T.word, T.wordDur));
        if (skipped) wa = Math.max(wa, seg(d, 0, 0.22));

        /* 3) dalış: yazının içinden geç */
        if (d > 0) {
          if (!origin) setOrigin();
          const scale = Math.exp(Math.pow(d, 1.7) * Math.log(64));
          word.style.transform = 'scale(' + scale.toFixed(4) + ')';
          word.style.filter = 'blur(' + (d * d * 9).toFixed(2) + 'px)';
          word.style.opacity = (wa * (1 - seg(d, 0.8, 0.2))).toFixed(3);
          el.style.backgroundColor = 'rgba(8,8,10,' + (1 - easeIO(seg(d, 0.34, 0.5))).toFixed(3) + ')';
          const bl = (1 - seg(d, 0.5, 0.5)) * 14;
          el.style.backdropFilter = el.style.webkitBackdropFilter = bl > 0.2 ? 'blur(' + bl.toFixed(1) + 'px)' : 'none';
          if (skipBtn) skipBtn.style.opacity = (1 - seg(d, 0, 0.25)).toFixed(2);
          if (d >= 1) end();
        } else {
          word.style.opacity = wa.toFixed(3);
        }
      }
      raf = requestAnimationFrame(frame);
    },
  };
})();
