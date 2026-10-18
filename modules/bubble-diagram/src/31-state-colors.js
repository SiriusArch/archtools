/* ==========================================================================
   31-state-colors.js — renk paleti: kategori (bölge) ve tek daire rengi
   Model:  project.colors = { v: 1, zones: { <bölge>: ref }, spaces: { <mekânId>: ref } }
           ref = { p: 'cp4816', i: 2, hex: '#E19D29' }   (p/i palet kaynağını gösterir; hex her zaman geçerli renktir)
   Öncelik: tek daire > kategori > tema varsayılanı. Özel renkler yalnızca Bauhaus ("Beni renklendir!") temasında çizilir;
   sade temada (glass) veri korunur ama gösterilmez.
   JSON uzantısı: extensions.colorPalette  (kullanılan paletlerin hex listesi dahil → dosya tek başına açılır)
   ========================================================================== */
(function () {
  const App = window.App;
  const PL = App.palettes;

  const defaults = () => ({ v: 1, zones: {}, spaces: {} });
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // geçerli bir başvuru üretir; palet bilinmiyorsa yalnızca hex kalır
  function makeRef(p, i, hex) {
    const pal = PL.get(p);
    const idx = Number(i);
    let h = PL.isHex(hex) ? hex.toUpperCase() : null;
    if (pal && idx >= 0 && idx < pal.colors.length && Math.floor(idx) === idx) h = h || pal.colors[idx];
    if (!h) return null;
    const ref = { hex: h };
    if (pal && idx >= 0 && idx < pal.colors.length && pal.colors[idx].toUpperCase() === h) { ref.p = pal.id; ref.i = idx; }
    return ref;
  }

  const on = () => App.theme.name === 'bauhaus';
  const readable = (fill) => PL.textOn(fill, App.PAL.ink, App.PAL.paper);

  /* ---------- çözümleme ---------- */
  function zoneRef(project, zone) { const c = project && project.colors; return c && c.zones && own(c.zones, zone) ? c.zones[zone] : null; }
  function spaceRef(project, id) { const c = project && project.colors; return c && c.spaces && own(c.spaces, id) ? c.spaces[id] : null; }
  const pack = (ref) => ({ fill: ref.hex, text: readable(ref.hex), custom: true, ref: ref });

  function zoneColor(project, zone) {
    const z = App.ZONES[zone] || App.ZONES.sosyal;
    const r = on() ? zoneRef(project, zone) : null;
    return r ? pack(r) : { fill: z.fill, text: z.text, custom: false, ref: null };
  }
  function spaceColor(project, s) {
    const r = on() ? spaceRef(project, s.id) : null;
    return r ? pack(r) : zoneColor(project, s.zone);
  }
  // 'space' | 'zone' | null — rengin nereden geldiği (arayüzde "özel" rozeti için)
  function sourceOf(project, s) { return spaceRef(project, s.id) ? 'space' : zoneRef(project, s.zone) ? 'zone' : null; }

  /* ---------- eylemler (reducer eklentisi) ---------- */
  function applyRefs(P, scope, keys, ref) {
    const c = P.colors || defaults();
    const bag = Object.assign({}, scope === 'zone' ? c.zones : c.spaces);
    keys.forEach((k) => { if (ref) bag[k] = ref; else delete bag[k]; });
    return Object.assign({}, c, scope === 'zone' ? { zones: bag } : { spaces: bag });
  }

  App.state.hooks.push(function (next, a) {
    const P = next.project;
    switch (a.type) {
      case 'COLOR_SET': {
        // { scope:'zone'|'space', keys:[…], ref:{p,i,hex}|null }
        const ref = a.ref ? makeRef(a.ref.p, a.ref.i, a.ref.hex) : null;
        if (a.ref && !ref) return next;
        const keys = (a.keys || []).filter((k) => (a.scope === 'zone' ? App.ZONES[k] : P.spaces.some((s) => s.id === k)));
        if (!keys.length) return next;
        const before = P.colors || defaults();
        const bag = a.scope === 'zone' ? before.zones : before.spaces;
        if (keys.every((k) => (ref ? bag[k] && bag[k].hex === ref.hex : !bag[k]))) return next; // değişiklik yok
        return App.state.withHistory(next, Object.assign({}, P, { colors: applyRefs(P, a.scope, keys, ref) }));
      }
      case 'COLOR_DISTRIBUTE': {
        // seçilen paletin renklerini projede kullanılan kategorilere sırayla dağıtır
        const pal = PL.get(a.palette);
        if (!pal) return next;
        const used = App.ZONE_ORDER.filter((z) => P.spaces.some((s) => s.zone === z));
        const zones = {};
        (used.length ? used : App.ZONE_ORDER).forEach((z, n) => { zones[z] = makeRef(pal.id, n % pal.colors.length); });
        return App.state.withHistory(next, Object.assign({}, P, { colors: Object.assign({}, P.colors || defaults(), { zones: zones, spaces: {} }) }));
      }
      case 'COLOR_RESET': {
        // 'all' | 'zones' | 'spaces'
        const c = P.colors || defaults();
        const nz = a.what === 'spaces' ? c.zones : {};
        const ns = a.what === 'zones' ? c.spaces : {};
        if (!Object.keys(c.zones).length && !Object.keys(c.spaces).length) return next;
        return App.state.withHistory(next, Object.assign({}, P, { colors: Object.assign({}, c, { zones: nz, spaces: ns }) }));
      }
      case 'REMOVE_SPACE': {
        if (!P.colors || !P.colors.spaces || !own(P.colors.spaces, a.id)) return next;
        const sp = Object.assign({}, P.colors.spaces); delete sp[a.id];
        return Object.assign({}, next, { project: Object.assign({}, P, { colors: Object.assign({}, P.colors, { spaces: sp }) }) });
      }
    }
    return next;
  });

  /* ---------- JSON: extensions.colorPalette ---------- */
  const refOut = (r) => ({ palette: r.p || null, index: r.p ? r.i : null, hex: r.hex });
  function toExt(project) {
    const c = project.colors;
    if (!c) return {};
    const ids = new Set(project.spaces.map((s) => s.id));
    const zones = {}, spaces = {}, used = new Set();
    Object.keys(c.zones || {}).forEach((z) => { if (App.ZONES[z]) { zones[z] = refOut(c.zones[z]); if (c.zones[z].p) used.add(c.zones[z].p); } });
    Object.keys(c.spaces || {}).forEach((id) => { if (ids.has(id)) { spaces[id] = refOut(c.spaces[id]); if (c.spaces[id].p) used.add(c.spaces[id].p); } });
    if (!Object.keys(zones).length && !Object.keys(spaces).length) return {};
    return {
      colorPalette: {
        version: 1, source: PL.source, appliesTo: 'bauhaus',
        palettes: Array.from(used).sort().map((id) => ({ id: id, name: PL.get(id).name, url: PL.get(id).url, colors: PL.get(id).colors.slice() })),
        zones: zones, spaces: spaces,
      },
    };
  }
  function fromExt(x, project) {
    if (!x || typeof x !== 'object') return null;
    const embedded = {};
    (Array.isArray(x.palettes) ? x.palettes : []).forEach((p) => { if (p && Array.isArray(p.colors)) embedded[p.id] = p.colors; });
    const read = (r) => {
      if (!r || typeof r !== 'object') return null;
      const col = embedded[r.palette];
      // dosyada gömülü palet varsa onun, yoksa yerleşik listenin renkleri; her durumda hex önceliklidir
      const hex = PL.isHex(r.hex) ? r.hex : col && PL.isHex(col[r.index]) ? col[r.index] : null;
      return makeRef(r.palette, r.index, hex);
    };
    const c = defaults();
    Object.keys(x.zones || {}).forEach((z) => { const r = App.ZONES[z] ? read(x.zones[z]) : null; if (r) c.zones[z] = r; });
    const ids = new Set(project.spaces.map((s) => s.id));
    Object.keys(x.spaces || {}).forEach((id) => { const r = ids.has(id) ? read(x.spaces[id]) : null; if (r) c.spaces[id] = r; });
    return c;
  }
  App.extProviders = App.extProviders || [];
  App.extProviders.push(toExt);
  App.extImporters = App.extImporters || [];
  App.extImporters.push(function (ext, project) { const c = fromExt(ext && ext.colorPalette, project); return c ? { colors: c } : {}; });

  App.colors = { defaults: defaults, makeRef: makeRef, zone: zoneColor, space: spaceColor, sourceOf: sourceOf, active: on, toExt: toExt, fromExt: fromExt };
})();
