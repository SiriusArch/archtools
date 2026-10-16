/* ==========================================================================
   39-lib-pe-3d.js — Plan Editörü: 3B görünüm (kendi küçük WebGL çizicisi)
   Görünümler: iso (kesit alınmış izometrik · ortografik), walk (yürüyüş · perspektif, kamera planda), mass (kütle).
   Geometri plan modelinden (App.pe.derive) üretilir: döşemeler (merdiven boşluklu), açıklıklı duvarlar, kapı kanatları,
   pencere çerçeve ve camı (ikinci geçişte saydam), nesneler (birleşik parçalar), merdiven, korkuluk.
   Gölge: zemine düzlemsel izdüşüm (stencil ile tek geçiş). Dışa aktarım: canvas → PNG.
   Koordinat: dünya (x, y=yukarı, z=plan y).
   ========================================================================== */
(function () {
  const App = window.App;
  const pe = App.pe;
  const C = pe;
  const PI = Math.PI;

  /* ---------------- renk ---------------- */
  const cc = {};
  function rgb(hex) {
    if (Array.isArray(hex)) return hex;
    if (cc[hex]) return cc[hex];
    let m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    let r = [0.7, 0.7, 0.7];
    if (m) { const n = parseInt(m[1], 16); r = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
    else { m = /^#?([0-9a-f]{3})$/i.exec(hex || ''); if (m) { const s = m[1]; r = [parseInt(s[0] + s[0], 16) / 255, parseInt(s[1] + s[1], 16) / 255, parseInt(s[2] + s[2], 16) / 255]; } }
    cc[hex] = r;
    return r;
  }
  const shade = (c, f) => { const a = rgb(c); return [Math.min(1, a[0] * f), Math.min(1, a[1] * f), Math.min(1, a[2] * f)]; };
  const matC = (k, fb) => (C.MAT_BY[k] ? C.MAT_BY[k].c : fb || '#CCCCCC');

  /* ---------------- mesh ---------------- */
  const newMesh = () => ({ o: [], t: [] });
  function quad(L, p0, p1, p2, p3, n, c, a) {
    const v = (p) => { L.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], a); };
    v(p0); v(p1); v(p2); v(p0); v(p2); v(p3);
  }
  /* yönlü kutu: merkez (cx, cz), u ekseni açısı ang (derece), yarı boyutlar hl (u) ve hw (n), y0..y1.
     c: tek renk ya da { t, b, pn, nn, pu, nu } */
  function box(M, cx, cz, ang, hl, hw, y0, y1, c, alpha) {
    if (!(y1 > y0) || hl <= 0 || hw <= 0) return;
    const a = (ang * PI) / 180, ux = Math.cos(a), uz = Math.sin(a), nx = -uz, nz = ux;
    const L = alpha != null && alpha < 1 ? M.t : M.o, al = alpha == null ? 1 : alpha;
    const cs = Array.isArray(c) || typeof c === 'string' ? { t: rgb(c), b: shade(c, 0.9), pn: rgb(c), nn: rgb(c), pu: rgb(c), nu: rgb(c) } : { t: rgb(c.t), b: rgb(c.b || c.t), pn: rgb(c.pn || c.t), nn: rgb(c.nn || c.t), pu: rgb(c.pu || c.t), nu: rgb(c.nu || c.t) };
    const P = (su, sn, y) => [cx + ux * su * hl + nx * sn * hw, y, cz + uz * su * hl + nz * sn * hw];
    quad(L, P(-1, -1, y1), P(1, -1, y1), P(1, 1, y1), P(-1, 1, y1), [0, 1, 0], cs.t, al);
    quad(L, P(-1, -1, y0), P(1, -1, y0), P(1, 1, y0), P(-1, 1, y0), [0, -1, 0], cs.b, al);
    quad(L, P(-1, 1, y0), P(1, 1, y0), P(1, 1, y1), P(-1, 1, y1), [nx, 0, nz], cs.pn, al);
    quad(L, P(-1, -1, y0), P(1, -1, y0), P(1, -1, y1), P(-1, -1, y1), [-nx, 0, -nz], cs.nn, al);
    quad(L, P(1, -1, y0), P(1, 1, y0), P(1, 1, y1), P(1, -1, y1), [ux, 0, uz], cs.pu, al);
    quad(L, P(-1, -1, y0), P(-1, 1, y0), P(-1, 1, y1), P(-1, -1, y1), [-ux, 0, -uz], cs.nu, al);
  }
  function cyl(M, cx, cz, r, y0, y1, c, seg, alpha) {
    seg = seg || 14;
    const L = alpha != null && alpha < 1 ? M.t : M.o, al = alpha == null ? 1 : alpha, col = rgb(c);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * PI * 2, a1 = ((i + 1) / seg) * PI * 2, am = (a0 + a1) / 2;
      const p0 = [cx + Math.cos(a0) * r, 0, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, 0, cz + Math.sin(a1) * r];
      quad(L, [p0[0], y0, p0[2]], [p1[0], y0, p1[2]], [p1[0], y1, p1[2]], [p0[0], y1, p0[2]], [Math.cos(am), 0, Math.sin(am)], col, al);
      quad(L, [cx, y1, cz], [p0[0], y1, p0[2]], [p1[0], y1, p1[2]], [cx, y1, cz], [0, 1, 0], shade(col, 1.06), al);
    }
  }
  /* dikdörtgenden delikleri çıkar (eksen hizalı) */
  function rectSub(r, holes) {
    let list = [r];
    holes.forEach((h) => {
      const out = [];
      list.forEach((q) => {
        if (h.x1 <= q.x0 || h.x0 >= q.x1 || h.y1 <= q.y0 || h.y0 >= q.y1) { out.push(q); return; }
        if (h.y0 > q.y0) out.push({ x0: q.x0, x1: q.x1, y0: q.y0, y1: h.y0 });
        if (h.y1 < q.y1) out.push({ x0: q.x0, x1: q.x1, y0: h.y1, y1: q.y1 });
        const ya = Math.max(q.y0, h.y0), yb = Math.min(q.y1, h.y1);
        if (h.x0 > q.x0) out.push({ x0: q.x0, x1: h.x0, y0: ya, y1: yb });
        if (h.x1 < q.x1) out.push({ x0: h.x1, x1: q.x1, y0: ya, y1: yb });
      });
      list = out;
    });
    return list;
  }

  /* ---------------- nesne parçaları ---------------- */
  const TN = () => C.TONES;
  function objParts(o, E, sty, M, ey) {
    const T = TN();
    const a = o.rot, ca = Math.cos((a * PI) / 180), sa = Math.sin((a * PI) / 180);
    const W = o.w, Dd = o.d, H = o.h;
    const mc = o.fin && C.MAT_BY[o.fin] ? C.MAT_BY[o.fin].c : null;
    const fab = mc || (sty && sty.tint) || T.fabric, wood = mc || T.wood;
    // yerel (lx: w ekseni, lz: d ekseni; arka = −lz) → dünya
    const P = (lx, lz, sx, sz, y0, y1, c, al) => {
      const cx = o.x + lx * ca - lz * sa, cz = o.y + lx * sa + lz * ca;
      box(M, cx, cz, a, sx / 2, sz / 2, ey + y0, ey + y1, c, al);
    };
    const C0 = (lx, lz, r, y0, y1, c) => cyl(M, o.x + lx * ca - lz * sa, o.y + lx * sa + lz * ca, r, ey + y0, ey + y1, c);
    const k = o.k;
    const legs = (w, d, hh, inset, c) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((q) => P(q[0] * (w / 2 - inset), q[1] * (d / 2 - inset), 0.05, 0.05, 0, hh, c));
    if (/^(kanepe|koltuk|kose_kanepe)/.test(k)) {
      P(0, 0, W, Dd, 0, 0.08, T.dark);
      if (k === 'kose_kanepe') { P(0, -Dd / 2 + 0.425, W, 0.85, 0.08, 0.42, fab); P(-W / 2 + 0.425, 0, 0.85, Dd, 0.08, 0.42, fab); P(0, -Dd / 2 + 0.1, W, 0.2, 0.42, H, shade(fab, 0.94)); P(-W / 2 + 0.1, 0, 0.2, Dd, 0.42, H, shade(fab, 0.94)); return; }
      P(0, 0.05, W - 0.36, Dd - 0.2, 0.08, 0.42, fab);
      P(0, -Dd / 2 + 0.11, W - 0.36, 0.22, 0.42, H, shade(fab, 0.94));
      P(-W / 2 + 0.09, 0, 0.18, Dd, 0.08, 0.62, shade(fab, 0.88)); P(W / 2 - 0.09, 0, 0.18, Dd, 0.08, 0.62, shade(fab, 0.88));
    } else if (/^yatak/.test(k)) {
      P(0, 0, W, Dd, 0.1, 0.3, T.woodDk);
      P(0, 0.04, W - 0.08, Dd - 0.1, 0.3, H, '#F1EEE8');
      P(0, 0.04 + (Dd - 0.1) / 6, W - 0.08, (Dd - 0.1) * 0.66, H, H + 0.04, shade(fab, 1.05));
      P(0, -Dd / 2 + 0.03, W, 0.06, 0, 1.0, T.woodDk);
      const n = W > 1.3 ? 2 : 1;
      for (let i = 0; i < n; i++) P(n === 1 ? 0 : (i ? 1 : -1) * W * 0.22, -Dd / 2 + 0.32, Math.min(0.55, W / n - 0.12), 0.34, H, H + 0.14, '#FBFAF7');
      P(-W / 2 + 0.04, Dd / 2 - 0.03, 0.06, 0.06, 0, 0.1, T.woodDk); P(W / 2 - 0.04, Dd / 2 - 0.03, 0.06, 0.06, 0, 0.1, T.woodDk);
    } else if (k === 'masar' || k === 'bahce_masa') {
      C0(0, 0, Math.min(W, Dd) / 2, H - 0.04, H, mc || wood); C0(0, 0, 0.06, 0, H - 0.04, T.woodDk);
    } else if (/^(masa4|masa6|calisma|toplanti|sira|pinpon|bilardo)$/.test(k)) {
      P(0, 0, W, Dd, H - 0.05, H, k === 'bilardo' ? '#2E6B4C' : k === 'pinpon' ? '#2F5E8C' : (mc || wood));
      legs(W, Dd, H - 0.05, 0.06, T.woodDk);
      if (k === 'calisma') P(W * 0.3, 0, 0.45, Dd - 0.1, 0.1, H - 0.05, T.woodDk);
    } else if (k === 'sehpa' || k === 'yan_sehpa') {
      P(0, 0, W, Dd, H - 0.04, H, mc || wood); legs(W, Dd, H - 0.04, 0.04, T.woodDk);
    } else if (/^(sandalye|ofiskoltuk|bahce_sandalye)$/.test(k)) {
      P(0, 0, W, Dd, 0.42, 0.47, mc || fab); legs(W, Dd, 0.42, 0.03, T.dark);
      P(0, -Dd / 2 + 0.025, W, 0.05, 0.47, H, mc || fab);
    } else if (k === 'bar_tabure') {
      C0(0, 0, W / 2, 0.68, 0.75, mc || fab); C0(0, 0, 0.03, 0, 0.68, T.metal);
    } else if (k === 'puf') {
      C0(0, 0, W / 2, 0, H, mc || fab);
    } else if (k === 'hali') {
      P(0, 0, W, Dd, 0, 0.02, mc || T.rug);
    } else if (k === 'tezgah' || k === 'ada' || k === 'evye' || k === 'ocak' || k === 'bulasik') {
      const up = k === 'ocak' || k === 'evye' ? 0.012 : 0;
      P(0, 0, W, Dd, 0, H - 0.04, mc || '#E4E1DA'); P(0, 0, W + 0.01, Dd + 0.01, H - 0.04, H + up, '#5A5F66');
      if (k === 'ocak') [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((q) => C0(q[0] * W * 0.22, q[1] * Dd * 0.22, W * 0.1, H + up, H + up + 0.02, '#222'));
      if (k === 'evye') P(0, 0, W * 0.5, Dd * 0.6, H - 0.045, H + up + 0.003, '#B9C0C6');
    } else if (k === 'buzdolabi' || k === 'kurutma' || k === 'camasir') {
      P(0, 0, W, Dd, 0, H, mc || '#E9ECEF'); P(0, Dd / 2 + 0.002, W * 0.9, 0.01, H * 0.1, H * 0.9, '#C8CDD2');
      if (k === 'camasir' || k === 'kurutma') C0(0, Dd / 2 - 0.02, Math.min(W, Dd) * 0.3, H * 0.25, H * 0.75, '#8FA2B5');
    } else if (k === 'wc') {
      P(0, -Dd / 2 + 0.1, W, 0.2, 0, H, T.ceramic); C0(0, 0.1, Math.min(W, Dd - 0.2) / 2 + 0.02, 0, 0.4, T.ceramic);
    } else if (k === 'lavabo' || k === 'lavabo2') {
      P(0, 0, W, Dd, 0, 0.78, mc || '#DAD6CE'); P(0, 0, W, Dd, 0.78, H, T.ceramic); P(0, -Dd / 2 + 0.05, 0.04, 0.04, H, H + 0.2, T.metal);
    } else if (k === 'kuvet') {
      P(0, 0, W, Dd, 0, H, T.ceramic); P(0, 0, W - 0.14, Dd - 0.14, H - 0.001, H + 0.001, '#B9D4E6');
    } else if (k === 'dus') {
      P(0, 0, W, Dd, 0, 0.07, '#D8DDE0'); P(0, 0, W, Dd, 0.07, H, '#BFD9E8', 0.25);
    } else if (k === 'agac') {
      C0(0, 0, 0.12, 0, H * 0.5, T.trunk); C0(0, 0, Math.min(W, Dd) / 2, H * 0.4, H, T.leaf);
    } else if (k === 'lambader') {
      C0(0, 0, 0.12, 0, 0.03, T.dark); C0(0, 0, 0.02, 0, H * 0.85, T.metal); C0(0, 0, Math.min(W, Dd) / 2, H * 0.8, H, '#F4E8C8');
    } else if (k === 'kolon_yuvarlak' || k === 'portmanto' || k === 'kombi' || k === 'boyler' || k === 'mangal') {
      C0(0, 0, Math.min(W, Dd) / 2, 0, H, mc || (k === 'kolon_yuvarlak' ? '#CFCBC3' : wood));
    } else if (k === 'kolon') {
      P(0, 0, W, Dd, 0, H, mc || '#CFCBC3');
    } else if (/^(gardrop|kitaplik|vitrin|sifonyer|depo_dolap|reyon|ayakkabilik|tv|konsol|komodin)$/.test(k)) {
      P(0, 0, W, Dd, 0, H, mc || wood);
      P(0, Dd / 2 + 0.003, W * 0.96, 0.006, H * 0.04, H * 0.96, shade(mc || wood, 0.82));
      if (/^(gardrop|depo_dolap)$/.test(k)) P(0, Dd / 2 + 0.005, 0.01, 0.01, H * 0.35, H * 0.65, T.dark);
    } else if (k === 'ozel') {
      if (o.rd) C0(0, 0, Math.min(W, Dd) / 2, 0, H, o.col || mc || T.wood); else P(0, 0, W, Dd, 0, H, o.col || mc || T.wood);
    } else {
      const flat = C.FURN_BY[k] && C.FURN_BY[k].flat;
      P(0, 0, W, Dd, 0, flat ? Math.min(H, 0.03) : H, mc || (C.FURN_BY[k] && C.FURN_BY[k].g === 'servis' ? '#C9C6BF' : wood));
    }
  }

  /* ---------------- sahne → mesh ---------------- */
  function build(P, view) {
    const d = pe.derive(P), E = d.E;
    const M = newMesh();
    const mode = view.mode;
    const curIdx = pe.floorIndex(E, view.fid);
    const topIdx = mode === 'mass' ? E.floors.length - 1 : curIdx;
    const yaw = view.yaw || 0;
    const cdir = [Math.sin(yaw), Math.cos(yaw)];
    const cut = mode === 'iso';
    const T = TN();
    const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const ground = view.ground || '#E6E8EC';

    for (let fi = 0; fi <= topIdx; fi++) {
      const D = d.floors[fi], fl = D.f, ey = D.elev, fh = fl.h, top = ey + fh - 0.15;
      D.rooms.forEach((r) => { bounds.x0 = Math.min(bounds.x0, r.x); bounds.y0 = Math.min(bounds.y0, r.y); bounds.x1 = Math.max(bounds.x1, r.x + r.w); bounds.y1 = Math.max(bounds.y1, r.y + r.d); });
      const sty = (r) => C.STYLE_BY[pe.styleOf(E, fl, r)];
      /* döşemeler (alt kattaki merdiven boşlukları) */
      const holes = fi > 0 ? d.floors[fi - 1].stairs.map((s) => { const b = pe.stairAabb(s, d.floors[fi - 1].f.h); return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }; }) : [];
      const topVisible = fi === topIdx;
      if (mode === 'mass') {
        D.rooms.forEach((r) => {
          const lum = 0.86 + 0.07 * (fi % 2);
          const body = shade('#E7E3DA', lum);
          box(M, r.x + r.w / 2, r.y + r.d / 2, 0, (r.w + r.ins.w + r.ins.e) / 2, (r.d + r.ins.n + r.ins.s) / 2, ey - 0.15, ey + fh - 0.02, { t: shade(body, 0.8), pn: body, nn: body, pu: shade(body, 0.95), nu: shade(body, 0.95), b: body });
        });
        if (topVisible) D.rooms.forEach((r) => box(M, r.x + r.w / 2, r.y + r.d / 2, 0, (r.w + r.ins.w + r.ins.e) / 2 + 0.05, (r.d + r.ins.n + r.ins.s) / 2 + 0.05, ey + fh - 0.02, ey + fh + 0.06, '#C9C4BA'));
        continue;
      }
      D.rooms.forEach((r) => {
        const zc = matC(pe.finOf(E, fl, r, 'zemin')), tc = matC(pe.finOf(E, fl, r, 'tavan'), '#FFFFFF');
        const base = { x0: r.x - r.ins.w, y0: r.y - r.ins.n, x1: r.x + r.w + r.ins.e, y1: r.y + r.d + r.ins.s };
        rectSub(base, holes).forEach((q) => { if (q.x1 - q.x0 > 0.01 && q.y1 - q.y0 > 0.01) box(M, (q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, 0, (q.x1 - q.x0) / 2, (q.y1 - q.y0) / 2, ey - 0.15, ey, { t: zc, b: tc, pn: '#B9B6AE', nn: '#B9B6AE', pu: '#B9B6AE', nu: '#B9B6AE' }); });
        if (topVisible && !cut) box(M, (base.x0 + base.x1) / 2, (base.y0 + base.y1) / 2, 0, (base.x1 - base.x0) / 2, (base.y1 - base.y0) / 2, top, ey + fh, { t: '#CFCAC0', b: tc, pn: '#B9B6AE', nn: '#B9B6AE', pu: '#B9B6AE', nu: '#B9B6AE' });
      });
      /* duvarlar */
      D.walls.forEach((w) => {
        const nx = -w.uy, nz = w.ux, ang = (Math.atan2(w.uy, w.ux) * 180) / PI;
        const midx = (w.x1 + w.x2) / 2, midz = (w.y1 + w.y2) / 2, off = w.t / 2 + 0.2;
        const rp = D.containing(midx + nx * off, midz + nz * off), rn = D.containing(midx - nx * off, midz - nz * off);
        const inC = (rm, fb) => (rm ? matC(pe.finOf(E, fl, rm, 'duvar'), fb) : null);
        const exC = (rm) => matC(pe.finOf(E, fl, rm || rp || rn, 'disduvar'), '#D8D3C8');
        const cp = rp ? inC(rp) : exC(rn), cn = rn ? inC(rn) : exC(rp);
        const edge = w.ext ? exC(rp || rn) : shade(cp, 0.92);
        const cols = { t: edge, b: edge, pn: cp, nn: cn, pu: edge, nu: edge };
        let low = false;
        if (cut && fi === curIdx && w.ext && w.sides && w.sides[0]) {
          const out = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[w.sides[0]];
          if (out && out[0] * cdir[0] + out[1] * cdir[1] > 0.25) low = true;
        }
        const e = w.t / 2, H = top - ey;
        const wl = w.len;
        const seg = (s0, s1, y0, y1) => { if (s1 - s0 < 0.004 || y1 - y0 < 0.004) return; const sm = (s0 + s1) / 2; box(M, w.x1 + w.ux * sm, w.y1 + w.uy * sm, ang, (s1 - s0) / 2, w.t / 2, ey + y0, ey + y1, cols); };
        if (low) { seg(-e, wl + e, 0, 0.14); return; }
        const ops = D.ops.filter((o) => !o.orphan && o.wall === w.id).sort((p, q) => p.s - q.s);
        let cur = -e;
        ops.forEach((o) => {
          const s0 = Math.max(cur, o.s - o.w / 2), s1 = o.s + o.w / 2;
          seg(cur, s0, 0, H);
          const def = C.OP_BY[o.k + ':' + o.sub] || {};
          const sill = o.k === 'kapi' ? 0 : o.sill, hh = Math.min(o.h, H - sill);
          if (sill > 0.01) seg(s0, s1, 0, sill);
          seg(s0, s1, sill + hh, H);
          cur = s1;
          if (def.open) return;
          const rm = D.roomBy[o.rp || o.rn];
          const cx = o.cx, cz = o.cy, oa = ang;
          if (o.k === 'kapi') {
            const dc = o.fin ? matC(o.fin) : matC(pe.finOf(E, fl, rm, 'kapi'), '#8B6A47');
            const cl = { t: dc, b: dc, pn: dc, nn: dc, pu: shade(dc, 0.9), nu: shade(dc, 0.9) };
            if (def.leaves === 2) { [-1, 1].forEach((sg) => box(M, cx + o.ux * sg * o.w * 0.25, cz + o.uy * sg * o.w * 0.25, oa, o.w * 0.245, 0.02, ey, ey + hh - 0.02, cl)); }
            else box(M, cx + (def.slide ? nx * 0.035 : 0), cz + (def.slide ? nz * 0.035 : 0), oa, o.w / 2 - 0.02, 0.02, ey, ey + hh - 0.02, cl);
          } else {
            const fc = o.fin ? matC(o.fin) : matC(pe.finOf(E, fl, rm, 'pencere'), '#F2F2F0');
            const fr = (s, y0, y1, sw, sh) => box(M, cx + o.ux * s, cz + o.uy * s, oa, sw / 2, 0.04, ey + y0, ey + y1, fc);
            const f = 0.045, y0 = sill, y1 = sill + hh;
            fr(-o.w / 2 + f / 2, y0, y1, f); fr(o.w / 2 - f / 2, y0, y1, f);
            box(M, cx, cz, oa, o.w / 2, 0.04, ey + y0, ey + y0 + f, fc); box(M, cx, cz, oa, o.w / 2, 0.04, ey + y1 - f, ey + y1, fc);
            if (def.leaves === 2 && !def.fixed) fr(0, y0, y1, 0.05);
            if (!def.fixed && !def.slide && !def.door && def.leaves !== 2 && o.w > 1.0) fr(0, y0, y1, 0.04);
            box(M, cx, cz, oa, o.w / 2 - f, 0.006, ey + y0 + f, ey + y1 - f, '#A9CDE0', 0.3);
            if (sill > 0.3) box(M, cx + nx * 0.0, cz + nz * 0.0, oa, o.w / 2 + 0.03, w.t / 2 + 0.03, ey + sill - 0.03, ey + sill, '#F4F2EE');
          }
        });
        seg(cur, wl + e, 0, H);
      });
      /* nesneler */
      D.objs.forEach((o) => objParts(o, E, sty(D.roomBy[o.room]), M, ey));
      /* merdivenler */
      D.stairs.forEach((s) => {
        const g = pe.stairSteps(s, fh);
        const sc = shade(matC(s.fin, '#C9A878'), 1);
        g.steps.forEach((q) => {
          const lx = (q.x0 + q.x1) / 2, ly = (q.y0 + q.y1) / 2, rp = pe.rotPt(lx, ly, s.rot);
          box(M, s.x + rp[0], s.y + rp[1], s.rot, (q.x1 - q.x0) / 2, (q.y1 - q.y0) / 2, ey, ey + q.z, { t: q.landing ? shade(sc, 1.04) : sc, b: sc, pn: shade(sc, 0.86), nn: shade(sc, 0.86), pu: shade(sc, 0.8), nu: shade(sc, 0.8) });
        });
      });
      D.rails.forEach((r) => {
        const len = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
        if (len < 0.05) return;
        const ang = (Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180) / PI;
        box(M, (r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2, ang, len / 2, 0.025, ey + r.h - 0.04, ey + r.h, T.dark);
        box(M, (r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2, ang, len / 2, 0.005, ey + 0.05, ey + r.h - 0.04, '#BCD7E6', 0.3);
        const n = Math.max(1, Math.ceil(len / 1.2));
        for (let i = 0; i <= n; i++) { const f = i / n; box(M, r.x1 + (r.x2 - r.x1) * f, r.y1 + (r.y2 - r.y1) * f, 0, 0.02, 0.02, ey, ey + r.h, T.dark); }
      });
    }
    if (bounds.x0 === Infinity) { bounds.x0 = 0; bounds.y0 = 0; bounds.x1 = 8; bounds.y1 = 6; }
    // zemin
    const cx = (bounds.x0 + bounds.x1) / 2, cz = (bounds.y0 + bounds.y1) / 2;
    box(M, cx, cz, 0, 220, 220, -0.17, -0.16, ground);
    return { M: M, bounds: bounds, cx: cx, cz: cz, R: Math.max(4, Math.hypot(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0) / 2) };
  }

  /* ---------------- matris ---------------- */
  const mul = (a, b) => { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; };
  const persp = (fov, ar, n, f) => { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / ar; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f); return o; };
  const ortho = (hw, hh, n, f) => { const o = new Float32Array(16); o[0] = 1 / hw; o[5] = 1 / hh; o[10] = -2 / (f - n); o[14] = -(f + n) / (f - n); o[15] = 1; return o; };
  function lookAt(e, t) {
    let fx = t[0] - e[0], fy = t[1] - e[1], fz = t[2] - e[2];
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    let sx = fy * 0 - fz * 1, sy = fz * 0 - fx * 0, sz = fx * 1 - fy * 0; // f × up(0,1,0)
    sx = -fz; sy = 0; sz = fx;
    const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
    const ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
    const o = new Float32Array(16);
    o[0] = sx; o[4] = sy; o[8] = sz; o[1] = ux; o[5] = uy; o[9] = uz; o[2] = -fx; o[6] = -fy; o[10] = -fz; o[15] = 1;
    o[12] = -(sx * e[0] + sy * e[1] + sz * e[2]); o[13] = -(ux * e[0] + uy * e[1] + uz * e[2]); o[14] = fx * e[0] + fy * e[1] + fz * e[2];
    return o;
  }

  /* ---------------- WebGL çizici ---------------- */
  const VS = 'attribute vec3 p;attribute vec3 n;attribute vec4 c;uniform mat4 vp;uniform float sh;uniform vec3 ld;uniform float gy;varying vec4 vc;'
    + 'void main(){vec3 q=p;vec4 col;if(sh>0.5){float k=(q.y-gy)/ld.y;q=vec3(q.x-ld.x*k,gy,q.z-ld.z*k);col=vec4(0.0,0.0,0.0,0.17);}'
    + 'else{vec3 nn=normalize(n);float d=max(dot(nn,normalize(ld)),0.0);float f=max(dot(nn,normalize(vec3(-ld.x,0.2,-ld.z))),0.0);float l=min(1.0,0.52+0.70*d+0.10*f);col=vec4(c.rgb*l,c.a);}'
    + 'vc=col;gl_Position=vp*vec4(q,1.0);}';
  const FS = 'precision mediump float;varying vec4 vc;void main(){gl_FragColor=vc;}';

  function createRenderer(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl', { antialias: true, stencil: true, preserveDrawingBuffer: true, alpha: false }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) return null;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const loc = { p: gl.getAttribLocation(prog, 'p'), n: gl.getAttribLocation(prog, 'n'), c: gl.getAttribLocation(prog, 'c'), vp: gl.getUniformLocation(prog, 'vp'), sh: gl.getUniformLocation(prog, 'sh'), ld: gl.getUniformLocation(prog, 'ld'), gy: gl.getUniformLocation(prog, 'gy') };
    const bufO = gl.createBuffer(), bufT = gl.createBuffer();
    let cache = { key: null, nO: 0, nT: 0, info: null };
    const LD = [0.55, 0.8, 0.4];
    const up = (buf, arr) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW); };
    const bind = (buf) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 40, 0);
      gl.enableVertexAttribArray(loc.n); gl.vertexAttribPointer(loc.n, 3, gl.FLOAT, false, 40, 12);
      gl.enableVertexAttribArray(loc.c); gl.vertexAttribPointer(loc.c, 4, gl.FLOAT, false, 40, 24);
    };

    function frame(P, view) {
      const E = pe.get(P);
      const sector = Math.round(((view.yaw || 0) * 180) / PI / 15);
      const key = [E.rooms.length, view.mode, view.fid, sector, view.ground, P.study && P.study.pe].map((v) => (v && typeof v === 'object' ? '' : v)).join('|');
      if (cache.key !== key || cache.E !== E) {
        const b = build(P, view);
        up(bufO, b.M.o); up(bufT, b.M.t);
        cache = { key: key, E: E, nO: b.M.o.length / 10, nT: b.M.t.length / 10, info: { cx: b.cx, cz: b.cz, R: b.R, bounds: b.bounds } };
      }
      const info = cache.info;
      const W = canvas.width, H = canvas.height, ar = W / Math.max(1, H);
      gl.viewport(0, 0, W, H);
      const bg = rgb(view.bg || '#EEF0F4');
      gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clearStencil(0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      let vp, eye;
      const E0 = pe.elevOf(E, view.fid);
      if (view.mode === 'walk') {
        const c = view.cam || { x: info.cx, y: info.cz, yaw: 0, pitch: 0 };
        eye = [c.x, E0 + 1.6, c.y];
        const fy = Math.sin(c.yaw), fz = -Math.cos(c.yaw), pit = c.pitch || 0;
        const tg = [eye[0] + fy * Math.cos(pit), eye[1] + Math.sin(pit), eye[2] + fz * Math.cos(pit)];
        vp = mul(persp((view.fov || 72) * PI / 180, ar, 0.05, 600), lookAt(eye, tg));
      } else {
        const yaw = view.yaw || 0, pit = view.pitch == null ? 0.62 : view.pitch, z = view.zoom || 1;
        const R = info.R * 1.18 / z;
        const tx = info.cx + (view.tx || 0), tz = info.cz + (view.tz || 0), ty = E0 * 0.4 + 1;
        const dist = info.R * 6 + 60;
        eye = [tx + Math.sin(yaw) * Math.cos(pit) * dist, ty + Math.sin(pit) * dist, tz + Math.cos(yaw) * Math.cos(pit) * dist];
        const hh = ar >= 1 ? R : R / ar, hw = hh * ar;
        vp = mul(ortho(hw, hh, 1, dist * 2 + 300), lookAt(eye, [tx, ty, tz]));
      }
      gl.uniformMatrix4fv(loc.vp, false, vp);
      gl.uniform3f(loc.ld, LD[0], LD[1], LD[2]);
      gl.uniform1f(loc.gy, -0.158);
      gl.uniform1f(loc.sh, 0);
      gl.disable(gl.BLEND);
      if (cache.nO) { bind(bufO); gl.drawArrays(gl.TRIANGLES, 0, cache.nO); }
      // gölge
      if (view.mode !== 'walk' && cache.nO) {
        gl.uniform1f(loc.sh, 1); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, 0, 255); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
        gl.depthMask(false);
        bind(bufO); gl.drawArrays(gl.TRIANGLES, 0, cache.nO);
        gl.depthMask(true); gl.disable(gl.STENCIL_TEST); gl.uniform1f(loc.sh, 0);
      }
      if (cache.nT) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        bind(bufT); gl.drawArrays(gl.TRIANGLES, 0, cache.nT);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
      return info;
    }
    return {
      gl: gl,
      draw: frame,
      invalidate: () => { cache.key = null; },
      capture: () => canvas.toDataURL('image/png'),
      dispose: () => { try { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* yok */ } },
    };
  }

  pe.gl = { create: createRenderer, build: build, supported: () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; } } };
})();
