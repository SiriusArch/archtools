/* ==========================================================================
   23-lib-match.js — kullanıcının yazdığı mekân adlarını bilgi tabanındaki
   mekânlara eşleştirir (Türkçe karakter ve ek farklarına toleranslı).
   ========================================================================== */
(function () {
  const App = window.App;
  const N = App.util.norm;

  function entryKeywords(e) {
    return e.kw.concat([e.name]).map(N).filter(Boolean);
  }

  function scoreName(nm, e) {
    let best = 0;
    entryKeywords(e).forEach((kk) => {
      if (nm === kk) best = Math.max(best, 100 + kk.length);
      else if (nm.includes(kk)) {
        // kısa anahtarlar (wc, lab) yalnızca tam sözcük olarak sayılır
        const words = nm.split(' ');
        const isWord = words.includes(kk) || kk.includes(' ');
        if (kk.length >= 4 || isWord) best = Math.max(best, kk.length + (isWord ? 2 : 0));
      } else if (kk.includes(nm) && nm.length >= 4) best = Math.max(best, nm.length * 0.5);
    });
    return best;
  }

  function matchSpaces(spaces, entries) {
    const cand = [];
    spaces.forEach((s) => {
      const nm = N(s.name);
      entries.forEach((e) => {
        const sc = scoreName(nm, e);
        if (sc > 0) cand.push({ s: s, e: e, score: sc });
      });
    });
    cand.sort((a, b) => b.score - a.score);
    const bySpace = new Map(), byEntry = new Map();
    cand.forEach((c) => {
      if (bySpace.has(c.s.id) || byEntry.has(c.e.key)) return;
      bySpace.set(c.s.id, c.e);
      byEntry.set(c.e.key, c.s);
    });
    return { bySpace: bySpace, byEntry: byEntry, missing: entries.filter((e) => !byEntry.has(e.key)) };
  }

  function zoneFor(name, typeKey, variantKey) {
    const nm = N(name);
    const v = App.kb.variant(typeKey, variantKey);
    let best = null, bs = 0;
    v.entries.forEach((e) => {
      const sc = scoreName(nm, e);
      if (sc > bs) { bs = sc; best = e; }
    });
    if (best && bs >= 4) return best.zone;
    for (let i = 0; i < App.ZONE_HINTS.length; i++) {
      const z = App.ZONE_HINTS[i];
      for (let j = 0; j < z[1].length; j++) if (nm.includes(z[1][j])) return z[0];
    }
    return 'sosyal';
  }

  // Sorguda geçen mekânı bul: önce geçerli bina tipinde, sonra tüm tiplerde
  function findEntryInText(text, typeKey, variantKey) {
    const nq = N(text);
    const words = nq.split(' ');
    const pools = [];
    const cur = App.kb.variant(typeKey, variantKey);
    pools.push({ type: App.kb.type(typeKey), variant: cur });
    App.KB.TYPES.forEach((t) => t.variants.forEach((v) => { if (v !== cur) pools.push({ type: t, variant: v }); }));
    let best = null, bs = 0;
    pools.forEach((p, idx) => {
      p.variant.entries.forEach((e) => {
        entryKeywords(e).forEach((kk) => {
          const ok = kk.includes(' ') ? nq.includes(kk) : words.includes(kk) || (kk.length >= 4 && nq.includes(kk));
          if (!ok) return;
          const sc = kk.length + (idx === 0 ? 8 : 0) + (kk.includes(' ') ? 3 : 0);
          if (sc > bs) { bs = sc; best = { entry: e, type: p.type, variant: p.variant }; }
        });
      });
    });
    return best;
  }

  App.match = { spaces: matchSpaces, zoneFor: zoneFor, findEntryInText: findEntryInText };
})();
