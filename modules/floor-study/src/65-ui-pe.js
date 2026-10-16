/* ==========================================================================
   65-ui-pe.js — Plan Editörü arayüzü: sol panel
   Sekmeler: Plan (başlangıç · seçili öğe · kat · mekân listesi · ayarlar) · Stil ve kaplama · Bulgular ve metraj.
   Pafta ve etkileşim: 65-ui-peboard.js · yan etkiler: 66-ctl-pe.js
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;
  const fmt = U.fmt;
  const st = App.study;
  const pe = App.pe;
  const fl = ui.floors;
  const ctl = () => App.ctl;

  /* ---------------- ikonlar (editöre özgü) ---------------- */
  const IC = {
    sel: ['M5 3l13 8-6 1.5L9.5 19z'],
    wall: ['M3 8h18v8H3z', 'M9 8v8M15 8v8'],
    rail: ['M3 9h18', 'M5 9v9M12 9v9M19 9v9'],
    pan: ['M12 3v18M3 12h18', 'M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3'],
    door: ['M5 21V4h9l5 2v15', 'M5 21h14', 'M13.5 13.5v.01'],
    window: ['M4 4h16v16H4z', 'M12 4v16M4 12h16'],
    stairs: ['M3 20h5v-4h4v-4h4V8h5'],
    room: ['M4 4h16v16H4z', 'M4 12h9v8'],
    sofa: ['M5 11V8a3 3 0 013-3h8a3 3 0 013 3v3', 'M3 12a2 2 0 014 0v3h10v-3a2 2 0 014 0v6H3z'],
    cam: ['M4 8h3l2-3h6l2 3h3v11H4z', { c: [12, 13, 3.5] }],
    walk: [{ c: [12, 5, 2] }, 'M12 8v6l-3 6M12 14l3 6M9 11l3-2 3 2'],
    mass: ['M5 20V9l5-4 5 4v11z', 'M15 12h4v8'],
    iso: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M12 12v9M4 7.5l8 4.5 8-4.5'],
    d2: ['M4 4h16v16H4z', 'M4 12h6M14 4v8'],
    d3: ['M12 2.5l8 4.5v10l-8 4.5-8-4.5V7z', 'M4 7l8 4.5L20 7', 'M12 11.5v10'],
    finish: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M16.5 13.5v7M13 17h7'],
    floors: ['M12 3l9 4.7-9 4.7-9-4.7z', 'M3 12l9 4.7 9-4.7'],
    flip: ['M12 4v16', 'M8 7L4 12l4 5z', 'M16 7l4 5-4 5z'],
    label: ['M5 5h14v10H11l-4 4v-4H5z'],
    star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  };
  function ic(name, size) {
    if (IC[name]) return h('svg', { viewBox: '0 0 24 24', width: size || 18, height: size || 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
      IC[name].map((d, i) => (typeof d === 'string' ? h('path', { key: i, d: d }) : h('circle', { key: i, cx: d.c[0], cy: d.c[1], r: d.c[2] }))));
    return ui.icon(name, size);
  }
  pe.ic = ic;

  /* ---------------- küçük bileşenler ---------------- */
  function numField(label, id, val, o) {
    return h('label', { class: 'nfld', for: id },
      h('span', { class: 'nfld-l' }, label),
      h('span', { class: 'nfld-c' },
        h('input', { id: id, class: 'inp mono nfld-i', type: 'number', min: o.min, max: o.max, step: o.step, value: val, keep: true, onchange: (e) => { const v = parseFloat(e.target.value); if (isFinite(v)) o.onchange(v); }, onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } }),
        h('span', { class: 'unit' }, o.unit || 'm')));
  }
  const sel = (id, value, opts, onchange, label) => h('select', { id: id, class: 'inp', value: value, 'aria-label': label || null, onchange: (e) => onchange(e.target.value) }, opts);
  const opt = (v, t) => h('option', { key: v, value: v }, t);
  const selOf = (state) => { const s = state.ui.pe.sel; return s.length === 1 ? s[0] : null; };
  const KIND = { r: 'rooms', o: 'ops', n: 'objs', m: 'stairs', g: 'rails', t: 'labels', w: 'walls' };
  const find = (E, key) => { const kd = KIND[key.charAt(0)]; const o = E[kd] && E[kd].find((q) => q.id === key.slice(2)); return o ? { kind: kd, o: o } : null; };
  const matOpts = (slot, inherit) => [opt('', inherit || 'Stile göre')].concat(pe.matsOf(slot).map((m) => opt(m.k, m.label)));
  const swatch = (m, on, onclick) => h('button', { key: m.k, type: 'button', class: 'pe-sw' + (on ? ' on' : ''), title: m.label, 'aria-label': m.label, 'aria-pressed': String(!!on), onclick: onclick },
    h('i', { class: 'pe-sw-c', style: { background: m.c } }), h('span', {}, m.label));

  /* ---------------- başlangıç ---------------- */
  function startSection(state, dd) {
    const P = state.project, E = dd.E;
    const empty = !E.rooms.length;
    return ui.section('Başlangıç', h('div', { class: 'sec-box' },
      empty ? h('p', { class: 'note' }, P.spaces.length ? 'İşlev Şeması’ndaki ' + P.spaces.length + ' mekân, ilişkilerine göre ölçülü bir plana dönüştürülebilir; ya da pafta altındaki araç çubuğundan mekân ekleyerek sıfırdan çizin.' : 'Pafta altındaki “Mekânlar” menüsünden bir mekân seçip çizime tıklayın. İşlev Şeması’nda mekân tanımlarsanız buradan plana dönüştürebilirsiniz.')
        : h('p', { class: 'note' }, E.rooms.length + ' mekân · ' + E.floors.length + ' kat · ' + dd.metrics.doors + ' kapı · ' + dd.metrics.windows + ' pencere'),
      h('div', { class: 'btn-row' },
        ui.btn(empty ? 'Programdan plan oluştur' : 'Programdan yeniden oluştur', { icon: 'layout', cls: 'btn-yellow', onclick: () => ctl().peFromProgram(), disabled: !P.spaces.length, title: 'İşlev Şeması mekânlarını ve serbest düzenini ölçülü plana dönüştürür; kapı ve pencereleri yerleştirir (geri alınabilir)' })),
      h('div', { class: 'btn-row' },
        ui.btn('Kapı ve pencere yerleştir', { icon: 'sun', onclick: () => ctl().peAutoOps(), disabled: !E.rooms.length, title: 'Bu katta giriş, iç kapılar, balkon kapıları ve pencereleri ilişkilere göre yerleştirir' }),
        ui.btn('Tüm odaları döşe', { icon: 'spark', onclick: () => ctl().peFurnish(null), disabled: !E.rooms.length, title: 'Bu katta mekân türüne uygun nesneleri yerleştirir; elle eklenenler korunur' })),
      h('div', { class: 'btn-row' },
        ui.btn('Katı temizle', { icon: 'trash', onclick: () => ctl().peClear(true), disabled: !E.rooms.length }),
        ui.btn('Hepsini temizle', { icon: 'trash', onclick: () => ctl().peClear(false), disabled: !E.rooms.length }))), null, 'pestart');
  }

  /* ---------------- seçili öğe ---------------- */
  function roomInspector(state, dd, r) {
    const E = dd.E, D = dd.floors.find((x) => x.f.id === r.f), R = D && D.roomBy[r.id];
    const snap = E.snap, u = E.unit;
    const rt = pe.ROOM_BY[r.type];
    const setR = (patch) => ctl().peSet('rooms', r.id, patch);
    const resize = (nr) => ctl().dispatch({ type: 'PE_ROOM_RESIZE', id: r.id, nr: Object.assign({ x: r.x, y: r.y, w: r.w, d: r.d }, nr) });
    const typeSel = sel('pe-rtype', r.type, pe.ROOM_GROUPS.map((g) => h('optgroup', { key: g.g, label: g.label }, pe.ROOMS.filter((q) => q.g === g.g).map((q) => opt(q.k, q.label)))), (v) => {
      const old = pe.ROOM_BY[r.type], nu = pe.ROOM_BY[v];
      setR({ type: v, name: r.name === old.label || r.name.indexOf(old.label + ' ') === 0 ? nu.label + r.name.slice(old.label.length) : r.name });
    }, 'Mekân türü');
    const sp = r.space && state.project.spaces.find((s) => s.id === r.space);
    return [
      ui.fld2('Ad', h('input', { id: 'pe-rname', class: 'inp', type: 'text', maxlength: 60, value: r.name, keep: true, onchange: (e) => { if (e.target.value.trim()) setR({ name: e.target.value.trim() }); }, onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } })),
      ui.fld2('Tür', typeSel),
      h('div', { class: 'nfld-grid' },
        numField('Genişlik', 'pe-rw', r.w, { min: pe.MIN, max: 80, step: snap, onchange: (v) => resize({ w: v }), unit: 'm' }),
        numField('Derinlik', 'pe-rd', r.d, { min: pe.MIN, max: 80, step: snap, onchange: (v) => resize({ d: v }), unit: 'm' }),
        numField('X', 'pe-rx', r.x, { step: snap, onchange: (v) => ctl().dispatch({ type: 'PE_ROOM_MOVE', id: r.id, dx: v - r.x, dy: 0 }) }),
        numField('Y', 'pe-ry', r.y, { step: snap, onchange: (v) => ctl().dispatch({ type: 'PE_ROOM_MOVE', id: r.id, dx: 0, dy: v - r.y }) })),
      R ? h('p', { class: 'note mono' }, 'Net ' + pe.fmtArea(R.area, u) + ' · ' + pe.fmtLen(R.net.w, u) + ' × ' + pe.fmtLen(R.net.d, u) + ' · öneri ≥ ' + pe.fmtArea(rt.min, u)
        + (R.area < rt.min * 0.85 ? ' (altında)' : '')) : null,
      sp ? h('p', { class: 'note' }, 'İşlev Şeması mekânı: ', h('b', {}, sp.name), ' · hedef ' + fmt(sp.area, 1) + ' m²') : null,
      ui.fld2('Stil', sel('pe-rstyle', r.style || '', [opt('', 'Kata / projeye göre')].concat(pe.STYLES.map((s) => opt(s.k, s.label))), (v) => setR({ style: v || null }), 'Oda stili')),
      ['zemin', 'duvar', 'tavan'].map((slot) => ui.fld2(pe.SLOTS.find((q) => q.k === slot).label, sel('pe-rf-' + slot, (r.fin && r.fin[slot]) || '', matOpts(slot), (v) => ctl().peFin('room', r.id, slot, v || null), slot))),
      h('div', { class: 'btn-row' },
        ui.btn('Odayı döşe', { icon: 'spark', onclick: () => ctl().peFurnish(r.id) }),
        ui.btn('Nesneleri kaldır', { icon: 'close', onclick: () => ctl().peUnfurnish(r.id) })),
      h('div', { class: 'btn-row' },
        ui.btn('90° çevir', { icon: 'rotate', onclick: () => ctl().peRotate(), title: 'Genişlik ve derinliği değiştir (R)' }),
        ui.btn('Çoğalt', { icon: 'copy', onclick: () => ctl().peDup(), title: 'Ctrl+D' }),
        ui.btn('Sil', { icon: 'trash', onclick: () => ctl().peDelSel(), title: 'Delete' })),
    ];
  }
  function objInspector(state, dd, o) {
    const E = dd.E, snap = 0.05;
    const c = pe.FURN_BY[o.k] || { label: 'Nesne' };
    const set = (patch) => ctl().peSet('objs', o.id, patch);
    return [
      ui.fld2('Nesne', o.k === 'ozel' ? h('input', { id: 'pe-oname', class: 'inp', type: 'text', maxlength: 40, value: o.name || 'Özel nesne', keep: true, onchange: (e) => set({ name: e.target.value.trim() || 'Özel nesne' }) }) : h('b', {}, c.label)),
      h('div', { class: 'nfld-grid' },
        numField('Genişlik', 'pe-ow', o.w, { min: 0.05, max: 12, step: snap, onchange: (v) => set({ w: v }) }),
        numField('Derinlik', 'pe-od', o.d, { min: 0.05, max: 12, step: snap, onchange: (v) => set({ d: v }) }),
        numField('Yükseklik', 'pe-oh', o.h, { min: 0.01, max: 8, step: snap, onchange: (v) => set({ h: v }) }),
        numField('Dönüş', 'pe-or', Math.round(o.rot), { min: 0, max: 359, step: 15, unit: '°', onchange: (v) => set({ rot: ((v % 360) + 360) % 360 }) })),
      ui.fld2('Malzeme / renk', sel('pe-ofin', o.fin || '', matOpts('kapi', 'Varsayılan'), (v) => set({ fin: v || null }), 'Nesne malzemesi')),
      o.k === 'ozel' ? ui.fld2('Renk', h('input', { id: 'pe-ocol', class: 'inp pe-col', type: 'color', value: o.col || '#B08A5E', keep: true, onchange: (e) => set({ col: e.target.value }) })) : null,
      h('div', { class: 'btn-row' },
        ui.btn('90° döndür', { icon: 'rotate', onclick: () => ctl().peRotate(), title: 'R' }),
        ui.btn('Çoğalt', { icon: 'copy', onclick: () => ctl().peDup() }),
        ui.btn('Sil', { icon: 'trash', onclick: () => ctl().peDelSel() })),
    ];
  }
  function opInspector(state, dd, o) {
    const list = o.k === 'kapi' ? pe.DOORS : pe.WINDOWS;
    const set = (patch) => ctl().peSet('ops', o.id, patch);
    const D = dd.floors.find((x) => x.f.id === o.f), dr = D && D.ops.find((q) => q.id === o.id);
    return [
      ui.fld2(o.k === 'kapi' ? 'Kapı türü' : 'Pencere türü', sel('pe-osub', o.sub, list.map((q) => opt(q.sub, q.label)), (v) => { const d = pe.OP_BY[o.k + ':' + v]; set({ sub: v, w: d.w, h: d.h, sill: d.sill }); }, 'Tür')),
      h('div', { class: 'nfld-grid' },
        numField('Genişlik', 'pe-opw', o.w, { min: 0.3, max: 8, step: 0.05, onchange: (v) => set({ w: v }) }),
        numField('Yükseklik', 'pe-oph', o.h, { min: 0.3, max: 4, step: 0.05, onchange: (v) => set({ h: v }) }),
        o.k === 'pencere' ? numField('Parapet', 'pe-ops', o.sill, { min: 0, max: 3, step: 0.05, onchange: (v) => set({ sill: v }) }) : null),
      dr && dr.orphan ? h('p', { class: 'note note-warn' }, 'Bu açıklık bir duvar üzerinde değil; duvara sürükleyin.') : null,
      ui.fld2('Doğrama', sel('pe-ofn', o.fin || '', matOpts(o.k === 'kapi' ? 'kapi' : 'pencere'), (v) => set({ fin: v || null }), 'Doğrama malzemesi')),
      h('div', { class: 'btn-row' },
        ui.btn('Yönü çevir', { icon: 'flip', onclick: () => ctl().peFlip(false), title: 'Açılma yönü (F)' }),
        ui.btn('Ayna', { icon: 'flip', onclick: () => ctl().peFlip(true), title: 'Menteşe tarafı (M)' }),
        ui.btn('Sil', { icon: 'trash', onclick: () => ctl().peDelSel() })),
    ];
  }
  function stairInspector(state, dd, s) {
    const set = (patch) => ctl().peSet('stairs', s.id, patch);
    return [
      ui.fld2('Tür', ui.segmented({ label: 'Merdiven türü', wide: true, value: s.sub, options: pe.STAIRS.map((q) => ({ v: q.sub, label: q.label.replace(' merdiven', '') })), onchange: (v) => set({ sub: v }) })),
      h('div', { class: 'nfld-grid' },
        numField('Kol genişliği', 'pe-sw', s.w, { min: 0.7, max: 3, step: 0.05, onchange: (v) => set({ w: v }) }),
        numField('Basamak (0 = oto)', 'pe-sn', s.steps || 0, { min: 0, max: 40, step: 1, unit: 'adet', onchange: (v) => set({ steps: v }) })),
      h('p', { class: 'note' }, 'Üst kat döşemesinde merdiven boşluğu otomatik açılır. Üst kata da merdiven ya da çıkış koymayı unutmayın.'),
      h('div', { class: 'btn-row' }, ui.btn('90° döndür', { icon: 'rotate', onclick: () => ctl().peRotate() }), ui.btn('Çoğalt', { icon: 'copy', onclick: () => ctl().peDup() }), ui.btn('Sil', { icon: 'trash', onclick: () => ctl().peDelSel() })),
    ];
  }
  function simpleInspector(kind, o) {
    if (kind === 'rails') return [h('div', { class: 'nfld-grid' }, numField('Yükseklik', 'pe-gh', o.h, { min: 0.6, max: 1.4, step: 0.05, onchange: (v) => ctl().peSet('rails', o.id, { h: v }) })), h('div', { class: 'btn-row' }, ui.btn('Sil', { icon: 'trash', onclick: () => ctl().peDelSel() }))];
    if (kind === 'walls') return [h('div', { class: 'nfld-grid' }, numField('Kalınlık', 'pe-wt', o.t, { min: 0.05, max: 0.6, step: 0.01, onchange: (v) => ctl().peSet('walls', o.id, { t: v }) })), h('div', { class: 'btn-row' }, ui.btn('Sil', { icon: 'trash', onclick: () => ctl().peDelSel() }))];
    return [ui.fld2('Metin', h('input', { id: 'pe-tt', class: 'inp', type: 'text', maxlength: 80, value: o.text, keep: true, onchange: (e) => ctl().peSet('labels', o.id, { text: e.target.value.trim() || 'Not' }) })), h('div', { class: 'btn-row' }, ui.btn('Sil', { icon: 'trash', onclick: () => ctl().peDelSel() }))];
  }
  const TITLE = { rooms: 'Seçili mekân', ops: 'Seçili açıklık', objs: 'Seçili nesne', stairs: 'Seçili merdiven', rails: 'Seçili korkuluk', labels: 'Seçili etiket', walls: 'Seçili duvar' };
  function selectedSection(state, dd) {
    const v = state.ui.pe, E = dd.E;
    if (v.sel.length > 1) {
      return ui.section('Seçim', h('div', { class: 'sec-box' },
        h('p', { class: 'note' }, v.sel.length + ' öğe seçili.'),
        h('div', { class: 'btn-row' }, ui.btn('Çoğalt', { icon: 'copy', onclick: () => ctl().peDup() }), ui.btn('Sil', { icon: 'trash', onclick: () => ctl().peDelSel() }), ui.btn('Seçimi bırak', { icon: 'close', onclick: () => ctl().peSel([]) }))), null, 'pesel');
    }
    const key = selOf(state), f = key && find(E, key);
    if (!f) return null;
    let body;
    if (f.kind === 'rooms') body = roomInspector(state, dd, f.o);
    else if (f.kind === 'objs') body = objInspector(state, dd, f.o);
    else if (f.kind === 'ops') body = opInspector(state, dd, f.o);
    else if (f.kind === 'stairs') body = stairInspector(state, dd, f.o);
    else body = simpleInspector(f.kind, f.o);
    return ui.section(TITLE[f.kind], h('div', { class: 'sec-box' }, body), null, 'pesel');
  }

  /* ---------------- kat ---------------- */
  function floorSection(state, dd) {
    const E = dd.E, fid = ctl().peFid(state), fl0 = E.floors.find((f) => f.id === fid), idx = pe.floorIndex(E, fid);
    const D = dd.by[fid];
    return ui.section('Kat', h('div', { class: 'sec-box' },
      h('div', { class: 'pe-floorlist', role: 'group', 'aria-label': 'Katlar' }, E.floors.map((f) => h('button', { key: f.id, type: 'button', class: 'pe-fchip' + (f.id === fid ? ' on' : ''), onclick: () => ctl().peSetFid(f.id) }, f.name))),
      ui.fld2('Kat adı', h('input', { id: 'pe-fname', class: 'inp', type: 'text', maxlength: 40, value: fl0.name, keep: true, onchange: (e) => ctl().peFloorSet(fid, { name: e.target.value.trim() || fl0.name }) })),
      h('div', { class: 'nfld-grid' },
        numField('Kat yüksekliği', 'pe-fh', fl0.h, { min: 2.2, max: 6, step: 0.05, onchange: (v) => ctl().peFloorSet(fid, { h: v }) }),
        numField('Kot', 'pe-fz', pe.r2(D.elev), { step: 0.1, onchange: () => {} })),
      ui.fld2('Kat stili', sel('pe-fstyle', fl0.style || '', [opt('', 'Projeye göre')].concat(pe.STYLES.map((s) => opt(s.k, s.label))), (v) => ctl().peFloorSet(fid, { style: v || null }), 'Kat stili')),
      h('p', { class: 'note mono' }, D.rooms.length + ' mekân · net ' + pe.fmtArea(D.rooms.reduce((t, r) => t + r.area, 0), E.unit) + ' · brüt ' + pe.fmtArea(D.rooms.reduce((t, r) => t + r.gross, 0), E.unit)),
      h('div', { class: 'btn-row' },
        ui.btn('Kat ekle', { icon: 'plus', onclick: () => ctl().peFloorAdd(false), disabled: E.floors.length >= pe.LIM.floors }),
        ui.btn('Katı kopyalayarak ekle', { icon: 'copy', onclick: () => ctl().peFloorAdd(true), disabled: E.floors.length >= pe.LIM.floors, title: 'Alttaki katın odalarını ve pencerelerini yeni kata kopyalar' }),
        ui.btn('Katı sil', { icon: 'trash', onclick: () => ctl().peFloorDel(fid), disabled: E.floors.length < 2 }))), E.floors.length + '/' + pe.LIM.floors, 'pefloor');
    void idx;
  }

  /* ---------------- mekân listesi ---------------- */
  function listSection(state, dd) {
    const fid = ctl().peFid(state), D = dd.by[fid], v = state.ui.pe, u = dd.E.unit;
    if (!D.rooms.length) return null;
    return ui.section('Mekânlar', h('ul', { class: 'rows pe-rows' }, D.rooms.map((r) => {
      const on = v.sel.indexOf('r:' + r.id) >= 0;
      const zn = App.ZONES[r.zone] || App.ZONES.sosyal;
      const bad = r.area < r.rt.min * 0.85;
      return h('li', { key: r.id, class: 'mrow' + (on ? ' on' : '') },
        h('button', { type: 'button', class: 'mrow-b', onclick: () => ctl().peSel(['r:' + r.id]), 'aria-pressed': String(on) },
          h('span', { class: 'dot', style: { background: zn.fill } }), h('span', { class: 'mrow-n' }, r.name),
          h('span', { class: 'mrow-a mono' + (bad ? ' warn' : '') }, pe.fmtArea(r.area, u))));
    })), D.rooms.length + ' mekân', 'pelist');
  }

  /* ---------------- ayarlar ---------------- */
  function settingsSection(state, dd) {
    const E = dd.E;
    return ui.section('Birim ve duvar', h('div', { class: 'sec-box' },
      ui.fld2('Birim', ui.segmented({ label: 'Birim', wide: true, value: E.unit, options: [{ v: 'm', label: 'Metre' }, { v: 'ft', label: 'Fit / inç' }], onchange: (v) => ctl().peSettings({ unit: v }) }), 'Ölçüler metre olarak saklanır; yalnızca gösterim değişir.'),
      ui.fld2('Izgara yakalama', ui.segmented({ label: 'Izgara', wide: true, value: E.snap, options: pe.SNAPS.map((q) => ({ v: q, label: q < 0.1 ? '5 cm' : q < 0.25 ? '10 cm' : q < 0.5 ? '25 cm' : '50 cm' })), onchange: (v) => ctl().peSettings({ snap: v }) })),
      h('div', { class: 'nfld-grid' },
        numField('Dış duvar', 'pe-wext', E.wall.ext, { min: 0.08, max: 0.6, step: 0.01, onchange: (v) => ctl().peSettings({ wall: { ext: v } }) }),
        numField('İç duvar', 'pe-wint', E.wall.int, { min: 0.05, max: 0.4, step: 0.01, onchange: (v) => ctl().peSettings({ wall: { int: v } }) })),
      h('p', { class: 'note' }, 'Odalar merkez çizgisiyle çizilir; komşu odaların ortak kenarı iç duvar, tek odaya ait kenar dış duvar olur. Net alan duvar kalınlığı düşülerek hesaplanır.')), null, 'peset');
  }

  /* ---------------- Plan sekmesi ---------------- */
  function planTab(state, dd) {
    return [fl.modeSection(state), startSection(state, dd), selectedSection(state, dd), floorSection(state, dd), listSection(state, dd), settingsSection(state, dd)];
  }

  /* ---------------- Stil ve kaplama sekmesi ---------------- */
  function styleTab(state, dd) {
    const E = dd.E, v = state.ui.pe, fid = ctl().peFid(state);
    const key = selOf(state), f = key && find(E, key);
    const room = f && f.kind === 'rooms' ? f.o : null;
    const scope = v.scope === 'room' && room ? 'room' : v.scope === 'floor' ? 'floor' : 'all';
    const target = scope === 'room' ? room : scope === 'floor' ? E.floors.find((q) => q.id === fid) : E;
    const scId = scope === 'room' ? room.id : fid;
    const curStyle = scope === 'room' ? room.style || E.floors.find((q) => q.id === room.f).style || E.style : scope === 'floor' ? target.style || E.style : E.style;
    const scopeSeg = ui.segmented({ label: 'Uygulama kapsamı', wide: true, value: scope, options: [{ v: 'all', label: 'Tüm proje' }, { v: 'floor', label: 'Bu kat' }, { v: 'room', label: room ? room.name : 'Seçili oda', title: room ? '' : 'Önce planda bir oda seçin' }].filter((o) => o.v !== 'room' || room), onchange: (x) => ctl().peUi({ scope: x }, true) });
    const curMat = (slot) => {
      if (target.fin && target.fin[slot]) return target.fin[slot];
      if (scope === 'room') return pe.finOf(E, E.floors.find((q) => q.id === room.f), room, slot);
      if (scope === 'floor') return pe.finOf(E, target, null, slot);
      return pe.finOf(E, null, null, slot);
    };
    return [
      ui.section('Uygulama kapsamı', h('div', { class: 'sec-box' }, scopeSeg, h('p', { class: 'note' }, 'Önceliği oda > kat > proje sırası belirler. Seçtiğiniz stil ve kaplamalar bu kapsama uygulanır.')), null, 'pescope'),
      ui.section('Stil', h('div', { class: 'pe-styles' }, pe.STYLES.map((s) => h('button', { key: s.k, type: 'button', class: 'pe-style' + (curStyle === s.k ? ' on' : ''), 'aria-pressed': String(curStyle === s.k), onclick: () => { ctl().peStyleApply(s.k, scope, scId); }, title: s.note },
        h('span', { class: 'pe-style-sw' }, ['zemin', 'duvar', 'kapi', 'pencere'].map((sl) => h('i', { key: sl, style: { background: (pe.MAT_BY[s.fin[sl]] || { c: '#ccc' }).c } })), h('i', { class: 'pe-style-tint', style: { background: s.tint } })),
        h('b', {}, s.label), h('small', {}, s.note)))), pe.STYLES.length + ' stil', 'pestyles'),
      pe.SLOTS.map((slot) => ui.section(slot.label, h('div', { class: 'sec-box' },
        h('div', { class: 'pe-swgrid' }, pe.matsOf(slot.k).map((m) => swatch(m, curMat(slot.k) === m.k, () => {
          if (scope === 'room') ctl().peFin('room', room.id, slot.k, m.k);
          else if (scope === 'floor') ctl().peFin('floor', fid, slot.k, m.k);
          else ctl().peFin('all', null, slot.k, m.k);
        }))),
        h('div', { class: 'btn-row' }, ui.btn('Stile dön', { icon: 'reset', onclick: () => ctl().peFin(scope === 'room' ? 'room' : scope === 'floor' ? 'floor' : 'all', scId, slot.k, null) }))), null, 'pef-' + slot.k)),
    ];
  }

  /* ---------------- Bulgular ve metraj ---------------- */
  function findsTab(state, dd) {
    const E = dd.E, m = dd.metrics, u = E.unit;
    const res = {
      counts: dd.findings.counts,
      items: dd.findings.items.map((f) => ({ id: f.id, level: f.sev, title: f.text, detail: null, src: null, actions: f.target ? [{ label: 'Göster', type: 'peShow', target: f.target }] : [] })),
    };
    const q = pe.takeoff(state.project);
    const rowsF = q.floors.map((r) => h('tr', { key: r.id }, h('td', {}, r.name), h('td', { class: 'mono' }, pe.fmtArea(r.net, u)), h('td', { class: 'mono' }, pe.fmtArea(r.gross, u)), h('td', { class: 'mono' }, pe.fmtLen(r.wallLen, u))));
    const kv = (a, b) => h('li', { key: a, class: 'pe-kv' }, h('span', {}, a), h('b', { class: 'mono' }, b));
    const bag = (o) => Object.keys(o).map((k) => kv((pe.OP_BY[k] && pe.OP_BY[k].label) || k, o[k].n + ' adet · ' + fmt(o[k].area, 1) + ' m²'));
    const pc = (x) => (x == null ? '—' : '%' + Math.round(x * 100));
    return [
      ui.section('Plan skoru', h('div', { class: 'sec-box' }, h('ul', { class: 'pe-kvs' },
        kv('Skor', m.score == null ? '—' : '%' + m.score), kv('Erişilebilirlik', pc(m.reach)), kv('Gün ışığı', pc(m.day)), kv('Alan uyumu', pc(m.areaFit)), kv('İlişki uyumu', pc(m.relFit)),
        m.programTotal ? kv('Programdan yerleşen', (m.programTotal - m.programMissing) + '/' + m.programTotal) : null),
      h('p', { class: 'note' }, 'Erişim: dış kapıdan her mekâna kapı / geçişle ulaşılması. Gün ışığı: yaşama mekânlarında dış duvarda pencere. Alan: mekân türünün öneri asgari net alanı (yönetmelik değildir). İlişki: işlev şemasındaki güçlü / ayrı ilişkilerin plandaki karşılığı.')), null, 'pescore'),
      ui.findingList(res, 'Erişim, gün ışığı, alan, kapı ve pencere yerleşimi, çakışma ve nesne kontrolü.'),
      ui.section('Metraj', h('div', { class: 'sec-box' },
        h('table', { class: 'pe-tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Kat'), h('th', {}, 'Net'), h('th', {}, 'Brüt'), h('th', {}, 'Duvar boyu'))), h('tbody', {}, rowsF)),
        h('p', { class: 'note mono' }, 'Dış duvar ' + pe.fmtLen(q.ext.len, u) + ' · ' + fmt(q.ext.area, 0) + ' m² cephe'),
        Object.keys(q.doors).length ? h('ul', { class: 'pe-kvs' }, bag(q.doors)) : null,
        Object.keys(q.windows).length ? h('ul', { class: 'pe-kvs' }, bag(q.windows)) : null,
        Object.keys(q.floorArea).length ? h('ul', { class: 'pe-kvs' }, Object.keys(q.floorArea).map((k) => kv('Zemin · ' + (pe.MAT_BY[k] ? pe.MAT_BY[k].label : k), fmt(q.floorArea[k], 1) + ' m²'))) : null,
        Object.keys(q.wallArea).length ? h('ul', { class: 'pe-kvs' }, Object.keys(q.wallArea).map((k) => kv('Duvar · ' + (pe.MAT_BY[k] ? pe.MAT_BY[k].label : k), fmt(q.wallArea[k], 1) + ' m²'))) : null), null, 'petake'),
    ];
  }

  fl.peSidebar = function (state) {
    const dd = pe.derive(state.project);
    const c = dd.findings.counts;
    const tabId = ['plan', 'stil', 'bulgular'].indexOf(state.ui.peTab) >= 0 ? state.ui.peTab : 'plan';
    const tabs = ui.tabsBar([
      { id: 'plan', label: 'Plan' },
      { id: 'stil', label: 'Stil ve kaplama' },
      { id: 'bulgular', label: 'Bulgular', n: c.hata + c.uyari + c.oneri || undefined, warn: c.hata + c.uyari > 0 },
    ], tabId, (id) => ctl().dispatch({ type: 'UI', patch: { peTab: id } }));
    const body = tabId === 'plan' ? planTab(state, dd) : tabId === 'stil' ? styleTab(state, dd) : findsTab(state, dd);
    return ui.sideShell('sb-kat', 'Plan editörü paneli', tabs, body);
  };

  /* kip yönlendirmesi: 'plan' kipi bu dosyadaki panel ve paftayı kullanır */
  const prevSidebar = fl.sidebar, prevBoard = fl.board;
  fl.sidebar = (state, d) => (st.modeOf(state) === 'plan' ? fl.peSidebar(state, d) : prevSidebar(state, d));
  fl.board = (state, d) => (st.modeOf(state) === 'plan' && fl.peBoard ? fl.peBoard(state, d) : prevBoard(state, d));
})();
