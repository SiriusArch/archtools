/* ==========================================================================
   21-lib-score.js — verimlilik skoru (canlı)
   Güçlü ilişkili daireler birbirine yaklaştıkça skor artar; ayrı tutulması
   istenen daireler uzaklaştıkça artar; üst üste binen daireler skoru düşürür.
   Skor = 100 × Σ(ağırlık × memnuniyet) / Σ(ağırlık) × (1 − örtüşme cezası)
   Ağırlıklar: güçlü 3, ayrı tut 2, zayıf 1.
   ========================================================================== */
(function () {
  const App = window.App;
  const geo = App.geo;

  function evaluate(spaces, relations, k) {
    const by = new Map();
    spaces.forEach((s) => by.set(s.id, s));
    const rad = new Map();
    spaces.forEach((s) => rad.set(s.id, geo.radius(s.area, k)));

    const pairs = [];
    let sumW = 0, sumWS = 0;
    const counts = { strong: [0, 0], weak: [0, 0], avoid: [0, 0] };

    Object.keys(relations).forEach((key) => {
      const ids = key.split('|');
      const a = by.get(ids[0]), b = by.get(ids[1]);
      if (!a || !b) return;
      const type = relations[key];
      const ra = rad.get(a.id), rb = rad.get(b.id);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const gap = d - ra - rb;
      let s, w, ok;
      if (type === 'strong') {
        w = 3;
        const tol = 8 + 0.1 * Math.min(ra, rb);
        const L = 0.6 * (ra + rb) + 40;
        s = gap <= tol ? 1 : Math.exp(-(gap - tol) / L);
        ok = s >= 0.75;
      } else if (type === 'weak') {
        w = 1;
        const tol = 0.5 * (ra + rb);
        const L = 0.9 * (ra + rb) + 60;
        s = gap <= tol ? 1 : Math.exp(-(gap - tol) / L);
        ok = s >= 0.6;
      } else if (type === 'avoid') {
        w = 2;
        const need = 0.6 * (ra + rb) + 70;
        s = gap <= 0 ? 0 : Math.min(1, gap / need);
        ok = s >= 0.7;
      } else return;
      sumW += w;
      sumWS += w * s;
      counts[type][0]++;
      if (ok) counts[type][1]++;
      pairs.push({ key: key, a: a.id, b: b.id, type: type, gap: gap, s: s, ok: ok, w: w });
    });

    // Balonların üst üste binmesi (ilişkiden bağımsız)
    const overlaps = [];
    for (let i = 0; i < spaces.length; i++) {
      for (let j = i + 1; j < spaces.length; j++) {
        const a = spaces[i], b = spaces[j];
        const ra = rad.get(a.id), rb = rad.get(b.id);
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - ra - rb;
        if (gap < -0.3 * Math.min(ra, rb)) overlaps.push({ a: a.id, b: b.id, gap: gap });
      }
    }
    const penalty = Math.min(0.25, overlaps.length * 0.04);
    const percent = sumW === 0 ? null : Math.round(100 * (sumWS / sumW) * (1 - penalty));
    return { percent: percent, pairs: pairs, counts: counts, overlaps: overlaps, penalty: penalty, radii: rad };
  }

  App.score = { evaluate: evaluate };
})();
