/* ==========================================================================
   38-lib-stock.js — Modül 11 · hazır (üretilmiş) siyah-beyaz fotoğraf kitaplığı
   C.STOCK_GROUPS, C.STOCK = [{ k, label, g, grain, draw(g, R) }], C.demoPhoto(kind, seed, size), C.stockThumb(kind)
   Her çizim 1500 × 1000 birimlik tuvalde yazılır; küçük resimler aynı kodla ölçeklenerek üretilir.
   ========================================================================== */
(function () {
  const App = window.App;
  const C = App.collage;
  const W = 1500, H = 1000;

  const gr = (v) => { v = Math.max(0, Math.min(255, Math.round(v))); return 'rgb(' + v + ',' + v + ',' + v + ')'; };
  const ga = (v, a) => { v = Math.max(0, Math.min(255, Math.round(v))); return 'rgba(' + v + ',' + v + ',' + v + ',' + a + ')'; };
  function grad(g, x0, y0, x1, y1, stops) {
    const q = g.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((s) => q.addColorStop(s[0], s[1]));
    return q;
  }
  function sky(g, a, b, to) {
    g.fillStyle = grad(g, 0, 0, 0, to || H * 0.7, [[0, gr(a)], [1, gr(b)]]);
    g.fillRect(0, 0, W, H);
  }
  function poly(g, pts, fill) {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath(); g.fill();
  }
  function ground(g, R, y) {
    y = y || H * 0.62;
    g.fillStyle = grad(g, 0, y, 0, H, [[0, gr(106)], [1, gr(44)]]);
    g.fillRect(0, y, W, H - y);
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2;
    for (let i = -8; i < 20; i++) { g.beginPath(); g.moveTo(W / 2 + i * 40, y); g.lineTo(W / 2 + i * 260, H); g.stroke(); }
    void R;
  }
  function cloud(g, R, cx, cy, rx, ry, a) {
    for (let k = 0; k < 7; k++) {
      g.fillStyle = 'rgba(255,255,255,' + (a * (0.35 + R() * 0.4)).toFixed(3) + ')';
      g.beginPath(); g.ellipse(cx + (R() - 0.5) * rx * 0.9, cy + (R() - 0.5) * ry * 0.8, rx * (0.35 + R() * 0.4), ry * (0.5 + R() * 0.5), 0, 0, Math.PI * 2); g.fill();
    }
  }
  function tree(g, R, x, y, r, tone) {
    g.fillStyle = ga(0, 0.22); g.beginPath(); g.ellipse(x + r * 0.2, y + 2, r * 0.9, r * 0.22, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = gr(tone * 0.55); g.fillRect(x - r * 0.07, y - r * 0.9, r * 0.14, r * 0.95);
    for (let k = 0; k < 9; k++) {
      const a = R() * Math.PI * 2, d = R() * r * 0.55;
      g.fillStyle = gr(tone + (R() - 0.5) * 40);
      g.beginPath(); g.arc(x + Math.cos(a) * d, y - r * 1.35 + Math.sin(a) * d * 0.8, r * (0.38 + R() * 0.3), 0, Math.PI * 2); g.fill();
    }
  }
  function ridge(g, R, base, amp, tone, rough) {
    const ph = [R() * 6, R() * 6, R() * 6];
    g.fillStyle = gr(tone);
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) {
      const y = base - amp * (0.55 * Math.sin(x / 260 + ph[0]) + 0.3 * Math.sin(x / 97 + ph[1]) + rough * 0.18 * Math.sin(x / 31 + ph[2]) + 0.4);
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  }

  /* ---------------- fotoğraf çizicileri ---------------- */
  const STOCK = [
    /* ===== Cephe ===== */
    { k: 'cephe', label: 'Betonarme cephe', g: 'cephe', ground: true, draw: function (g, R) {
      sky(g, 154, 228);
      g.fillStyle = gr(185);
      for (let x = 0; x < W; x += 60 + R() * 60) { const hh = 120 + R() * 260; g.fillRect(x, H * 0.66 - hh, 40 + R() * 70, hh); }
      g.fillStyle = gr(111); g.fillRect(180, 60, 1140, H * 0.6);
      g.fillStyle = gr(140); g.fillRect(180, 60, 1140, 22);
      const cols = 9, rows = 5, cw = 1140 / cols, rh = (H * 0.6 - 40) / rows;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = 180 + i * cw + 14, y = 100 + j * rh + 8, v = 30 + R() * 55;
        g.fillStyle = 'rgb(' + v + ',' + (v + 4) + ',' + (v + 8) + ')'; g.fillRect(x, y, cw - 28, rh - 22);
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y, (cw - 28) * 0.3, rh - 22);
      }
      g.fillStyle = 'rgba(20,22,26,.28)'; g.beginPath(); g.moveTo(180, 60); g.lineTo(520, 60); g.lineTo(180, H * 0.62); g.closePath(); g.fill();
    } },
    { k: 'kule', label: 'Yüksek yapılar', g: 'cephe', draw: function (g, R) {
      sky(g, 120, 238, H);
      cloud(g, R, 400, 160, 380, 70, 0.5); cloud(g, R, 1150, 300, 420, 70, 0.4);
      const xs = [60, 300, 560, 800, 1040, 1270];
      xs.forEach((x0, i) => {
        const w = 150 + R() * 70, hh = 480 + R() * 420, tone = 54 + R() * 70, top = H - hh;
        g.fillStyle = gr(tone); g.fillRect(x0, top, w, hh + 10);
        g.fillStyle = ga(255, 0.08); g.fillRect(x0, top, w * 0.35, hh + 10);
        g.fillStyle = ga(0, 0.28); g.fillRect(x0 + w * 0.82, top, w * 0.18, hh + 10);
        g.strokeStyle = ga(255, 0.16); g.lineWidth = 2;
        for (let y = top + 14; y < H; y += 20) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke(); }
        g.strokeStyle = ga(0, 0.25); g.lineWidth = 3;
        for (let x = x0 + 24; x < x0 + w; x += 30) { g.beginPath(); g.moveTo(x, top); g.lineTo(x, H); g.stroke(); }
        if (i % 2 === 0) { g.fillStyle = gr(tone * 0.7); g.fillRect(x0 + w * 0.48, top - 90, 6, 90); }
      });
      g.fillStyle = grad(g, 0, H * 0.55, 0, H, [[0, 'rgba(240,240,240,0)'], [1, 'rgba(240,240,240,.55)']]); g.fillRect(0, H * 0.55, W, H * 0.45);
    } },
    { k: 'cam', label: 'Cam giydirme cephe', g: 'cephe', grain: 10, draw: function (g, R) {
      g.fillStyle = grad(g, 0, 0, W, H, [[0, gr(222)], [0.5, gr(150)], [1, gr(70)]]); g.fillRect(0, 0, W, H);
      cloud(g, R, 450, 300, 600, 160, 0.7); cloud(g, R, 1100, 650, 560, 150, 0.55);
      const cw = 150, rh = 125;
      for (let i = 0; i < W / cw + 1; i++) for (let j = 0; j < H / rh + 1; j++) {
        const a = R();
        if (a > 0.62) { g.fillStyle = ga(0, (a - 0.62) * 0.8); g.fillRect(i * cw, j * rh, cw, rh); }
        else if (a < 0.1) { g.fillStyle = ga(255, 0.18); g.fillRect(i * cw, j * rh, cw, rh); }
      }
      g.strokeStyle = gr(34); g.lineWidth = 7;
      for (let x = 0; x <= W; x += cw) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y <= H; y += rh) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      poly(g, [[320, 0], [640, 0], [260, H], [-60, H]], 'rgba(255,255,255,.13)');
    } },
    { k: 'kemer', label: 'Kemerli galeri', g: 'cephe', ground: false, draw: function (g, R) {
      sky(g, 170, 225, H * 0.4);
      g.fillStyle = gr(150); g.fillRect(0, 70, W, 330);
      g.fillStyle = gr(172); g.fillRect(0, 70, W, 26); g.fillStyle = gr(120); g.fillRect(0, 380, W, 20);
      for (let i = 0; i < 12; i++) { g.fillStyle = gr(96 + R() * 30); g.fillRect(40 + i * 122, 120, 58, 210); }
      const n = 5, aw = 230, gap = (W - n * aw) / (n + 1);
      for (let i = 0; i < n; i++) {
        const x0 = gap + i * (aw + gap), top = 430, base = 880;
        g.fillStyle = grad(g, 0, top, 0, base, [[0, gr(28)], [1, gr(86)]]);
        g.beginPath(); g.moveTo(x0, base); g.lineTo(x0, top + aw / 2); g.arc(x0 + aw / 2, top + aw / 2, aw / 2, Math.PI, 0); g.lineTo(x0 + aw, base); g.closePath(); g.fill();
        g.strokeStyle = gr(206); g.lineWidth = 16;
        g.beginPath(); g.moveTo(x0, base); g.lineTo(x0, top + aw / 2); g.arc(x0 + aw / 2, top + aw / 2, aw / 2, Math.PI, 0); g.lineTo(x0 + aw, base); g.stroke();
      }
      g.fillStyle = gr(138); g.fillRect(0, 400, W, 30);
      for (let i = 0; i <= n; i++) { const x = (i === 0 ? 0 : gap + i * (aw + gap) - gap); g.fillStyle = grad(g, x, 0, x + gap, 0, [[0, gr(188)], [1, gr(110)]]); g.fillRect(x, 430, gap, 450); }
      g.fillStyle = grad(g, 0, 880, 0, H, [[0, gr(160)], [1, gr(70)]]); g.fillRect(0, 880, W, H - 880);
      g.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 5; i++) g.fillRect(gap + i * (aw + gap) + 30, 900, aw - 60, 16);
    } },
    { k: 'kafes', label: 'Çelik kafes', g: 'cephe', grain: 14, draw: function (g, R) {
      sky(g, 168, 236, H);
      cloud(g, R, 600, 360, 900, 160, 0.55);
      const truss = (y0, y1, step, tone, lw) => {
        g.strokeStyle = gr(tone); g.lineWidth = lw; g.lineCap = 'square';
        g.beginPath(); g.moveTo(0, y0); g.lineTo(W, y0); g.moveTo(0, y1); g.lineTo(W, y1); g.stroke();
        g.lineWidth = lw * 0.6;
        for (let x = -step; x < W + step; x += step) {
          g.beginPath(); g.moveTo(x, y1); g.lineTo(x + step / 2, y0); g.lineTo(x + step, y1); g.stroke();
          g.beginPath(); g.moveTo(x + step / 2, y0); g.lineTo(x + step / 2, y1); g.stroke();
        }
      };
      truss(520, 640, 120, 150, 8); truss(300, 470, 170, 52, 14);
      g.fillStyle = gr(40); g.fillRect(0, 760, W, 34);
      for (let x = 100; x < W; x += 300) { g.fillStyle = gr(48); g.fillRect(x, 794, 22, 206); }
      g.fillStyle = grad(g, 0, 794, 0, H, [[0, gr(120)], [1, gr(60)]]); g.fillRect(0, 900, W, 100);
    } },

    /* ===== Kent ===== */
    { k: 'meydan', label: 'Kolonlu meydan', g: 'kent', ground: true, draw: function (g) {
      sky(g, 154, 228);
      g.fillStyle = gr(201); g.fillRect(0, 0, W, H * 0.55);
      for (let i = 0; i < 7; i++) { const x = 90 + i * 210; g.fillStyle = i % 2 ? gr(93) : gr(116); g.fillRect(x, 80, 74, H * 0.62); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + 74, 80, 24, H * 0.62); }
      g.fillStyle = gr(74); g.fillRect(40, 60, W - 80, 34);
    } },
    { k: 'sehir', label: 'Şehir silüeti', g: 'kent', draw: function (g, R) {
      sky(g, 92, 218, H * 0.8);
      g.fillStyle = grad(g, 0, 400, 0, 760, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,.5)']]); g.fillRect(0, 400, W, 360);
      [[176, 70, 340, 25], [124, 110, 440, 22], [66, 150, 600, 20]].forEach((L, li) => {
        let x = -20;
        while (x < W) {
          const w = L[1] * (0.6 + R() * 0.9), hh = L[2] * (0.3 + R() * 0.7);
          g.fillStyle = gr(L[0]); g.fillRect(x, 780 - hh, w, hh + 220);
          if (li === 2) { g.fillStyle = ga(255, 0.6); for (let y = 780 - hh + 14; y < 770; y += 22) for (let xx = x + 8; xx < x + w - 10; xx += 16) if (R() > 0.7) g.fillRect(xx, y, 6, 9); }
          x += w + L[3] * R();
        }
      });
      g.fillStyle = grad(g, 0, 780, 0, H, [[0, gr(30)], [1, gr(10)]]); g.fillRect(0, 780, W, 220);
    } },
    { k: 'sokak', label: 'Sokak perspektifi', g: 'kent', grain: 20, draw: function (g, R) {
      sky(g, 190, 236, 480);
      const vx = 750, vy = 430;
      poly(g, [[520, 330], [980, 330], [980, 540], [520, 540]], gr(160));
      for (let k = 0; k < 4; k++) { g.fillStyle = gr(130 + R() * 40); g.fillRect(540 + k * 110, 350, 80, 170); }
      const facade = (sgn) => {
        const x0 = sgn < 0 ? 0 : W, x1 = sgn < 0 ? 520 : 980;
        const q = (u, v) => { // u: 0 dış → 1 uzak, v: 0 üst → 1 alt
          const x = x0 + (x1 - x0) * u;
          const top = -60 + (330 + 60) * u, bot = 1000 + (540 - 1000) * u;
          return [x, top + (bot - top) * v];
        };
        poly(g, [q(0, 0), q(1, 0), q(1, 1), q(0, 1)], gr(sgn < 0 ? 96 : 120));
        const nc = 9, nr = 6;
        for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) {
          const u0 = (i + 0.2) / nc, u1 = (i + 0.8) / nc, v0 = (j + 0.2) / nr, v1 = (j + 0.75) / nr;
          const a = R();
          poly(g, [q(u0, v0), q(u1, v0), q(u1, v1), q(u0, v1)], gr(a > 0.75 ? 200 : 26 + a * 50));
        }
      };
      facade(-1); facade(1);
      poly(g, [[0, 1000], [520, 540], [980, 540], [1500, 1000]], gr(70));
      poly(g, [[0, 1000], [520, 540], [560, 540], [200, 1000]], gr(130)); poly(g, [[1500, 1000], [980, 540], [940, 540], [1300, 1000]], gr(130));
      g.strokeStyle = ga(255, 0.6); g.lineWidth = 6; g.setLineDash([46, 38]);
      g.beginPath(); g.moveTo(750, 560); g.lineTo(750, 1000); g.stroke(); g.setLineDash([]);
      void vx; void vy;
    } },
    { k: 'kopru', label: 'Köprü / viyadük', g: 'kent', draw: function (g, R) {
      sky(g, 150, 232, 560);
      cloud(g, R, 500, 160, 700, 90, 0.5);
      g.fillStyle = grad(g, 0, 640, 0, H, [[0, gr(110)], [1, gr(34)]]); g.fillRect(0, 640, W, 360);
      g.strokeStyle = ga(255, 0.2); g.lineWidth = 2;
      for (let k = 0; k < 40; k++) { const y = 660 + R() * 330, x = R() * W; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40 + R() * 140, y); g.stroke(); }
      g.fillStyle = gr(48); g.fillRect(0, 300, W, 44); g.fillStyle = gr(30); g.fillRect(0, 344, W, 12);
      const n = 5, span = W / n;
      for (let i = 0; i < n; i++) {
        const x0 = i * span;
        g.fillStyle = gr(70); g.fillRect(x0 + span - 22, 356, 44, 290);
        g.strokeStyle = gr(52); g.lineWidth = 26;
        g.beginPath(); g.arc(x0 + span / 2, 356 + span * 0.18, span * 0.4, Math.PI, 0); g.stroke();
        g.fillStyle = ga(0, 0.25); g.fillRect(x0 + span - 22, 646, 44, 220);
      }
      g.fillStyle = grad(g, 0, 640, 0, 700, [[0, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 640, W, 60);
    } },

    /* ===== İç mekân ===== */
    { k: 'atrium', label: 'Atriyum (yukarı bakış)', g: 'ic', grain: 12, draw: function (g, R) {
      g.fillStyle = gr(235); g.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, n = 11;
      for (let i = 0; i < n; i++) {
        const t = i / n, t2 = (i + 1) / n;
        const w = W * (1 - t * 0.86), hh = H * (1 - t * 0.86), w2 = W * (1 - t2 * 0.86), h2 = H * (1 - t2 * 0.86);
        g.fillStyle = gr(60 + t * 120 + R() * 14);
        g.beginPath(); g.rect(cx - w / 2, cy - hh / 2, w, hh); g.rect(cx - w2 / 2, cy - h2 / 2, w2, h2); g.fill('evenodd');
        g.strokeStyle = gr(24); g.lineWidth = 6 - t * 4; g.strokeRect(cx - w / 2, cy - hh / 2, w, hh);
      }
      g.strokeStyle = gr(30); g.lineWidth = 3;
      [[0, 0], [W, 0], [W, H], [0, H]].forEach((c) => { g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(cx + (c[0] - cx) * 0.14, cy + (c[1] - cy) * 0.14); g.stroke(); });
      g.fillStyle = gr(250); g.fillRect(cx - W * 0.07, cy - H * 0.07, W * 0.14, H * 0.14);
      g.strokeStyle = ga(60, 0.8); g.lineWidth = 3;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(cx - W * 0.07 + k * W * 0.035, cy - H * 0.07); g.lineTo(cx - W * 0.07 + k * W * 0.035, cy + H * 0.07); g.stroke(); }
    } },
    { k: 'merdiven', label: 'Merdiven', g: 'ic', grain: 14, draw: function (g, R) {
      g.fillStyle = grad(g, 0, 0, W, H, [[0, gr(216)], [1, gr(120)]]); g.fillRect(0, 0, W, H);
      const n = 15;
      for (let i = 0; i < n; i++) {
        const x = 90 + i * 76, y = 880 - i * 52, w = 520 - i * 14;
        poly(g, [[x, y], [x + w, y], [x + w + 70, y - 34], [x + 70, y - 34]], gr(196 - i * 4));
        poly(g, [[x, y], [x + w, y], [x + w, y + 52], [x, y + 52]], gr(86 + R() * 12));
        poly(g, [[x + w, y], [x + w + 70, y - 34], [x + w + 70, y + 18], [x + w, y + 52]], gr(52));
      }
      g.strokeStyle = gr(24); g.lineWidth = 9;
      g.beginPath(); g.moveTo(130, 780); g.lineTo(1260, 78); g.stroke();
      g.lineWidth = 4; for (let i = 0; i < n; i += 2) { const x = 120 + i * 76, y = 770 - i * 52; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 90); g.stroke(); }
    } },

    /* ===== Doğa ===== */
    { k: 'gok', label: 'Bulutlu gökyüzü', g: 'doga', ground: true, draw: function (g, R) {
      sky(g, 154, 228);
      for (let k = 0; k < 9; k++) { const cx = R() * W, cy = 80 + R() * 380; g.fillStyle = 'rgba(255,255,255,' + (0.35 + R() * 0.3) + ')'; g.beginPath(); g.ellipse(cx, cy, 160 + R() * 220, 36 + R() * 50, 0, 0, Math.PI * 2); g.fill(); }
    } },
    { k: 'gunbatimi', label: 'Gün batımı', g: 'doga', draw: function (g, R) {
      g.fillStyle = grad(g, 0, 0, 0, H * 0.72, [[0, gr(34)], [0.55, gr(128)], [1, gr(236)]]); g.fillRect(0, 0, W, H);
      const sun = g.createRadialGradient(W * 0.62, H * 0.66, 10, W * 0.62, H * 0.66, 420);
      sun.addColorStop(0, 'rgba(255,255,255,1)'); sun.addColorStop(0.18, 'rgba(255,255,255,.85)'); sun.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sun; g.fillRect(0, 0, W, H);
      for (let k = 0; k < 7; k++) { g.fillStyle = ga(60, 0.18 + R() * 0.22); g.beginPath(); g.ellipse(R() * W, 200 + R() * 360, 220 + R() * 260, 16 + R() * 22, 0, 0, Math.PI * 2); g.fill(); }
      ridge(g, R, 800, 70, 22, 1);
      for (let x = 60; x < W; x += 110 + R() * 130) tree(g, R, x, 830 + R() * 40, 26 + R() * 24, 12);
    } },
    { k: 'dag', label: 'Dağ silsilesi', g: 'doga', draw: function (g, R) {
      sky(g, 176, 240, H);
      cloud(g, R, 900, 170, 700, 70, 0.5);
      [[560, 220, 204], [650, 190, 168], [740, 170, 132], [840, 140, 92], [930, 110, 52]].forEach((L, i) => { ridge(g, R, L[0], L[1], L[2], 0.5 + i * 0.4); g.fillStyle = grad(g, 0, L[0] - L[1], 0, L[0] + 80, [[0, 'rgba(240,240,240,0)'], [1, 'rgba(240,240,240,' + (0.42 - i * 0.07).toFixed(2) + ')']]); g.fillRect(0, L[0] - L[1], W, L[1] + 80); });
    } },
    { k: 'deniz', label: 'Deniz ufku', g: 'doga', draw: function (g, R) {
      sky(g, 168, 244, 520);
      cloud(g, R, 420, 200, 600, 70, 0.45);
      g.fillStyle = grad(g, 0, 520, 0, H, [[0, gr(150)], [1, gr(40)]]); g.fillRect(0, 520, W, 480);
      const sg = g.createLinearGradient(0, 520, 0, H); sg.addColorStop(0, 'rgba(255,255,255,.85)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sg; g.fillRect(W * 0.55, 520, 70, 480);
      for (let k = 0; k < 190; k++) { const t = R(), y = 530 + t * t * 470, len = 20 + t * 150; g.strokeStyle = ga(255, 0.12 + R() * 0.28); g.lineWidth = 1 + t * 3; const x = R() * W; g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke(); }
      g.fillStyle = gr(30); g.beginPath(); g.moveTo(1010, 520); g.lineTo(1060, 450); g.lineTo(1070, 520); g.closePath(); g.fill(); g.fillRect(990, 520, 90, 8);
      for (let x = 80; x < 460; x += 70) g.fillRect(x, 560, 12, 120);
      g.fillRect(60, 556, 420, 14);
    } },
    { k: 'park', label: 'Park ve yol', g: 'doga', draw: function (g, R) {
      sky(g, 186, 238, H * 0.5);
      g.fillStyle = grad(g, 0, 480, 0, H, [[0, gr(130)], [1, gr(70)]]); g.fillRect(0, 480, W, 520);
      g.fillStyle = gr(212);
      g.beginPath(); g.moveTo(690, 480); g.lineTo(790, 480); g.bezierCurveTo(840, 640, 1080, 760, 1260, 1000); g.lineTo(380, 1000); g.bezierCurveTo(600, 800, 740, 640, 690, 480); g.closePath(); g.fill();
      const rows = [];
      for (let k = 0; k < 22; k++) { const t = R(), side = R() > 0.5 ? 1 : -1; rows.push({ t: t, x: 750 + side * (120 + t * 560 + R() * 140), y: 500 + t * 480 }); }
      rows.sort((a, b) => a.t - b.t).forEach((q) => tree(g, R, q.x, q.y, 24 + q.t * 120, 40 + (1 - q.t) * 60 + R() * 20));
    } },
    { k: 'bahce', label: 'Avlu bahçesi', g: 'doga', draw: function (g, R) {
      sky(g, 190, 232, 360);
      g.fillStyle = gr(150); g.fillRect(0, 150, W, 380);
      for (let i = 0; i < 8; i++) { g.fillStyle = gr(60 + R() * 20); g.fillRect(80 + i * 180, 210, 90, 150); g.fillStyle = ga(255, 0.15); g.fillRect(80 + i * 180, 210, 30, 150); }
      g.fillStyle = gr(110); g.fillRect(0, 150, W, 26); g.fillRect(0, 500, W, 30);
      g.fillStyle = grad(g, 0, 530, 0, H, [[0, gr(176)], [1, gr(104)]]); g.fillRect(0, 530, W, 470);
      g.strokeStyle = ga(0, 0.22); g.lineWidth = 2;
      for (let i = -10; i < 14; i++) { g.beginPath(); g.moveTo(750 + i * 40, 530); g.lineTo(750 + i * 200, H); g.stroke(); }
      for (let j = 1; j < 8; j++) { const y = 530 + Math.pow(j / 8, 1.8) * 470; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let k = 0; k < 4; k++) { g.fillStyle = gr(40); g.fillRect(180 + k * 300, 720 + (k % 2) * 40, 150, 22); g.fillStyle = gr(60); g.fillRect(180 + k * 300, 742 + (k % 2) * 40, 150, 6); }
      tree(g, R, 750, 700, 170, 44);
    } },

    /* ===== Doku ===== */
    { k: 'tugla', label: 'Tuğla duvar', g: 'doku', grain: 24, draw: function (g, R) {
      g.fillStyle = gr(196); g.fillRect(0, 0, W, H);
      const bw = 96, bh = 34;
      for (let j = 0; j * (bh + 4) < H + bh; j++) for (let i = -1; i * (bw + 4) < W + bw; i++) {
        const x = i * (bw + 4) + (j % 2 ? bw / 2 : 0), y = j * (bh + 4);
        g.fillStyle = gr(70 + R() * 80); g.fillRect(x, y, bw, bh);
        g.fillStyle = ga(255, 0.08 + R() * 0.08); g.fillRect(x, y, bw, 6);
      }
      g.fillStyle = grad(g, 0, 0, W, H, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.4)']]); g.fillRect(0, 0, W, H);
    } },
    { k: 'ahsap', label: 'Ahşap çıta cephe', g: 'doku', grain: 16, draw: function (g, R) {
      g.fillStyle = gr(30); g.fillRect(0, 0, W, H);
      let x = 0;
      while (x < W) {
        const w = 18 + R() * 30, tone = 96 + R() * 80;
        g.fillStyle = grad(g, x, 0, x + w, 0, [[0, gr(tone + 16)], [1, gr(tone - 18)]]); g.fillRect(x, 0, w, H);
        g.strokeStyle = ga(0, 0.12); g.lineWidth = 1;
        for (let k = 0; k < 4; k++) { const gx = x + R() * w; g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx + (R() - 0.5) * 8, H); g.stroke(); }
        g.fillStyle = ga(0, 0.3); g.fillRect(x + w, 0, 5, H);
        x += w + 6;
      }
      g.fillStyle = gr(48); g.fillRect(0, 300, W, 18); g.fillRect(0, 700, W, 18);
      g.fillStyle = ga(0, 0.25); g.fillRect(0, 318, W, 12); g.fillRect(0, 718, W, 12);
    } },
    { k: 'beton', label: 'Beton yüzey', g: 'doku', grain: 30, draw: function (g, R) {
      g.fillStyle = gr(150); g.fillRect(0, 0, W, H);
      for (let k = 0; k < 160; k++) { g.fillStyle = (R() > 0.5 ? ga(255, 0.05 + R() * 0.05) : ga(0, 0.05 + R() * 0.07)); g.beginPath(); g.ellipse(R() * W, R() * H, 40 + R() * 220, 30 + R() * 160, R() * 3, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = ga(0, 0.32); g.lineWidth = 3;
      for (let x = 0; x <= W; x += 500) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y <= H; y += 333) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      for (let x = 125; x < W; x += 250) for (let y = 83; y < H; y += 166) { g.fillStyle = ga(0, 0.55); g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); g.fillStyle = ga(255, 0.2); g.beginPath(); g.arc(x - 2, y - 2, 4, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = ga(0, 0.1); g.lineWidth = 2;
      for (let k = 0; k < 40; k++) { const x = R() * W, y = R() * H * 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 14, y + 100 + R() * 300); g.stroke(); }
    } },
  ];

  C.STOCK_GROUPS = [{ g: 'cephe', label: 'Cephe' }, { g: 'kent', label: 'Kent' }, { g: 'ic', label: 'İç mekân' }, { g: 'doga', label: 'Doğa' }, { g: 'doku', label: 'Doku' }];
  C.STOCK = STOCK.map((s) => ({ k: s.k, label: s.label, g: s.g }));
  const BY = {};
  STOCK.forEach((s) => { BY[s.k] = s; });

  /* tek bir fotoğraf üret: size verilirse küçük resim boyutu (en-boy oranı 3:2) */
  C.demoPhoto = function (kind, seed, size) {
    const def = BY[kind] || BY.cephe;
    const w = size ? size.w : W, h = size ? size.h : H;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.scale(w / W, h / H);
    const R = C.rng(seed || 7);
    def.draw(g, R);
    if (def.ground) ground(g, R);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // gren
    const amt = def.grain != null ? def.grain : 26;
    const id = g.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(id, 0, 0);
    if (size) return cv.toDataURL('image/jpeg', 0.7);
    return { name: 'Örnek · ' + def.label, w: W, h: H, src: cv.toDataURL('image/jpeg', 0.85) };
  };
  const thumbs = {};
  C.stockThumb = function (kind) {
    if (!thumbs[kind]) { try { thumbs[kind] = C.demoPhoto(kind, 5, { w: 180, h: 120 }); } catch (e) { thumbs[kind] = ''; } }
    return thumbs[kind];
  };
})();
