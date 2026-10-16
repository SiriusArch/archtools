/* ==========================================================================
   38-lib-pe-model.js — Mekân Etüdü · Plan Editörü: veri modeli, türetme ve düzenleme mantığı (saf, arayüzden bağımsız)
   Veri project.study.pe içinde durur (geri al / ileri al, otomatik kayıt ve JSON akışı ortaktır). Tüm ölçüler METREdir.
   Model (merkez çizgisi esaslı): oda = merkez çizgileri x, y, w, d olan dikdörtgen; duvarlar oda kenarlarından TÜRETİLİR
   (komşu odanın ortak kenarı iç duvar, tek odalı kenar dış duvar); serbest duvarlar ayrıca saklanır.
     pe = { v, snap, unit, wall{ext,int}, style, fin{}, floors[{id,name,h,style,fin}], rooms[{id,f,type,name,x,y,w,d,style,fin,space}],
            walls[{id,f,x1,y1,x2,y2,t}], ops[{id,f,k:'kapi'|'pencere',sub,x,y,rot,w,h,sill,flip,mir,fin}],
            objs[{id,f,k,x,y,rot,w,d,h,fin,auto}], stairs[{id,f,sub,x,y,rot,w,steps}], rails[{id,f,x1,y1,x2,y2,h}],
            labels[{id,f,x,y,text}], cam{x,y,yaw,f} }
   Açıklık (kapı / pencere) duvar üzerinde bir NOKTA olarak saklanır (merkez x,y + duvar yönü rot); türetmede en yakın duvara oturtulur,
   duvar yoksa "yetim" sayılır. Oda taşınınca / boyutlanınca üzerindeki açıklıklar onunla birlikte güncellenir.
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const pe = (App.pe = App.pe || {});
  const C = pe;

  const r3 = (v) => Math.round(v * 1000) / 1000;
  const r2 = (v) => Math.round(v * 100) / 100;
  const num = (v, d) => (isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
  const nid = (p) => p + Math.random().toString(36).slice(2, 8);
  const LIM = { rooms: 260, walls: 400, ops: 900, objs: 1800, stairs: 40, rails: 120, labels: 120, floors: 6 };
  const MIN = 0.6;

  /* ---------------- varsayılanlar ve temizleme ---------------- */
  function defaults() {
    return {
      v: 1, snap: 0.1, unit: 'm', wall: { ext: 0.25, int: 0.1 }, style: 'modern', fin: {},
      floors: [{ id: 'k0', name: 'Zemin kat', h: 3, style: null, fin: {} }],
      rooms: [], walls: [], ops: [], objs: [], stairs: [], rails: [], labels: [], cam: { x: 0, y: 0, yaw: 0, f: 'k0' },
    };
  }
  const SNAPS = [0.05, 0.1, 0.25, 0.5];
  const cleanFin = (o) => {
    const out = {};
    if (o && typeof o === 'object') Object.keys(o).forEach((k) => { if (C.MAT_BY[o[k]] && C.MAT_BY[o[k]].slot === k) out[k] = o[k]; });
    return out;
  };
  function clean(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    const e = d;
    e.snap = SNAPS.indexOf(Number(raw.snap)) >= 0 ? Number(raw.snap) : d.snap;
    e.unit = raw.unit === 'ft' ? 'ft' : 'm';
    e.wall = { ext: U.clamp(num(raw.wall && raw.wall.ext, 0.25), 0.08, 0.6), int: U.clamp(num(raw.wall && raw.wall.int, 0.1), 0.05, 0.4) };
    e.style = C.STYLE_BY[raw.style] ? raw.style : d.style;
    e.fin = cleanFin(raw.fin);
    const fl = (Array.isArray(raw.floors) ? raw.floors : []).slice(0, LIM.floors).map((f, i) => ({
      id: String(f && f.id ? f.id : 'k' + i).slice(0, 12), name: String((f && f.name) || (i === 0 ? 'Zemin kat' : i + '. kat')).slice(0, 40),
      h: U.clamp(num(f && f.h, 3), 2.2, 6), style: f && C.STYLE_BY[f.style] ? f.style : null, fin: cleanFin(f && f.fin),
    }));
    if (fl.length) { const seen = new Set(); e.floors = fl.filter((f) => !seen.has(f.id) && seen.add(f.id)); }
    const fid = new Set(e.floors.map((f) => f.id));
    const f0 = e.floors[0].id;
    const fOf = (q) => (fid.has(q && q.f) ? q.f : f0);
    const list = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
    e.rooms = list(raw.rooms, LIM.rooms).filter((r) => r && isFinite(Number(r.x)) && isFinite(Number(r.y))).map((r) => {
      const t = C.ROOM_BY[r.type] ? r.type : 'salon';
      return { id: String(r.id || nid('r')), f: fOf(r), type: t, name: String(r.name || C.ROOM_BY[t].label).slice(0, 60), x: r3(num(r.x, 0)), y: r3(num(r.y, 0)), w: U.clamp(r3(num(r.w, 3)), MIN, 80), d: U.clamp(r3(num(r.d, 3)), MIN, 80),
        style: C.STYLE_BY[r.style] ? r.style : null, fin: cleanFin(r.fin), space: r.space ? String(r.space) : null };
    });
    e.walls = list(raw.walls, LIM.walls).filter((w) => w && [w.x1, w.y1, w.x2, w.y2].every((v) => isFinite(Number(v)))).map((w) => ({ id: String(w.id || nid('w')), f: fOf(w), x1: r3(Number(w.x1)), y1: r3(Number(w.y1)), x2: r3(Number(w.x2)), y2: r3(Number(w.y2)), t: U.clamp(num(w.t, e.wall.int), 0.05, 0.6) })).filter((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 0.05);
    e.ops = list(raw.ops, LIM.ops).filter((o) => o && (o.k === 'kapi' || o.k === 'pencere') && isFinite(Number(o.x)) && isFinite(Number(o.y))).map((o) => {
      const def = C.OP_BY[o.k + ':' + o.sub] || C.OP_BY[o.k + ':' + (o.k === 'kapi' ? 'tek' : 'tek')];
      return { id: String(o.id || nid('o')), f: fOf(o), k: o.k, sub: C.OP_BY[o.k + ':' + o.sub] ? o.sub : 'tek', x: r3(Number(o.x)), y: r3(Number(o.y)), rot: ((num(o.rot, 0) % 180) + 180) % 180,
        w: U.clamp(r3(num(o.w, def.w)), 0.3, 8), h: U.clamp(r3(num(o.h, def.h)), 0.3, 4), sill: U.clamp(r3(num(o.sill, def.sill)), 0, 3), flip: !!o.flip, mir: !!o.mir, fin: C.MAT_BY[o.fin] ? o.fin : null };
    });
    e.objs = list(raw.objs, LIM.objs).filter((o) => o && C.FURN_BY[o.k] && isFinite(Number(o.x)) && isFinite(Number(o.y))).map((o) => {
      const c = C.FURN_BY[o.k];
      return { id: String(o.id || nid('n')), f: fOf(o), k: o.k, x: r3(Number(o.x)), y: r3(Number(o.y)), rot: ((num(o.rot, 0) % 360) + 360) % 360, w: U.clamp(r3(num(o.w, c.w)), 0.05, 12), d: U.clamp(r3(num(o.d, c.d)), 0.05, 12), h: U.clamp(r3(num(o.h, c.h)), 0.01, 8), fin: C.MAT_BY[o.fin] ? o.fin : null, auto: !!o.auto,
        name: o.k === 'ozel' ? String(o.name || 'Özel nesne').slice(0, 40) : undefined, rd: o.k === 'ozel' && !!o.rd ? true : undefined, col: o.k === 'ozel' && /^#[0-9a-f]{6}$/i.test(o.col || '') ? o.col : undefined };
    });
    e.stairs = list(raw.stairs, LIM.stairs).filter((s) => s && isFinite(Number(s.x)) && isFinite(Number(s.y))).map((s) => ({ id: String(s.id || nid('m')), f: fOf(s), sub: ['duz', 'L', 'U'].indexOf(s.sub) >= 0 ? s.sub : 'duz', x: r3(Number(s.x)), y: r3(Number(s.y)), rot: ((num(s.rot, 0) % 360) + 360) % 360, w: U.clamp(r3(num(s.w, 1.1)), 0.7, 3), steps: s.steps ? U.clamp(Math.round(Number(s.steps)), 4, 40) : 0 }));
    e.rails = list(raw.rails, LIM.rails).filter((r) => r && [r.x1, r.y1, r.x2, r.y2].every((v) => isFinite(Number(v)))).map((r) => ({ id: String(r.id || nid('g')), f: fOf(r), x1: r3(Number(r.x1)), y1: r3(Number(r.y1)), x2: r3(Number(r.x2)), y2: r3(Number(r.y2)), h: U.clamp(num(r.h, 1.0), 0.6, 1.4) }));
    e.labels = list(raw.labels, LIM.labels).filter((l) => l && isFinite(Number(l.x)) && isFinite(Number(l.y))).map((l) => ({ id: String(l.id || nid('t')), f: fOf(l), x: r3(Number(l.x)), y: r3(Number(l.y)), text: String(l.text || 'Not').slice(0, 80) }));
    const cam = raw.cam || {};
    e.cam = { x: num(cam.x, 0), y: num(cam.y, 0), yaw: num(cam.yaw, 0), f: fid.has(cam.f) ? cam.f : f0 };
    return e;
  }

  let DEF = null;
  const get = (P) => (P && P.study && P.study.pe) || DEF || (DEF = defaults());

  /* ---------------- biçimlendirme (m / ft) ---------------- */
  function fmtLen(m, unit) {
    if (m == null || isNaN(m)) return '—';
    if (unit === 'ft') {
      const inch = Math.round((m / 0.0254));
      const ft = Math.floor(inch / 12), rest = inch % 12;
      return ft + '′' + (rest ? rest + '″' : '');
    }
    return U.fmt(m, 2) + ' m';
  }
  function fmtArea(m2, unit) {
    if (m2 == null || isNaN(m2)) return '—';
    return unit === 'ft' ? U.fmt(m2 * 10.7639, 0) + ' ft²' : U.fmt(m2, 1) + ' m²';
  }

  /* ---------------- kat yardımcıları ---------------- */
  const floorIndex = (E, id) => Math.max(0, E.floors.findIndex((f) => f.id === id));
  function elevOf(E, id) { let z = 0; for (let i = 0; i < E.floors.length && E.floors[i].id !== id; i++) z += E.floors[i].h; return z; }
  const styleOf = (E, fl, r) => (r && r.style) || (fl && fl.style) || E.style;
  function finOf(E, fl, r, slot) {
    // oda > kat > stil (oda stili) > genel
    if (r && r.fin && r.fin[slot]) return r.fin[slot];
    if (fl && fl.fin && fl.fin[slot]) return fl.fin[slot];
    if (E.fin && E.fin[slot] && !(r && r.style) && !(fl && fl.style)) return E.fin[slot];
    const st = C.STYLE_BY[styleOf(E, fl, r)] || C.STYLES[0];
    if (slot === 'zemin' && r && !(r.style) && !(fl && fl.style) && !(E.fin && E.fin.zemin)) { const rt = C.ROOM_BY[r.type]; if (rt && rt.floor) return rt.floor; }
    return st.fin[slot];
  }

  /* ---------------- duvar türetme ---------------- */
  function wallsOfRooms(rooms, cfg) {
    const groups = new Map();
    const add = (dir, coord, a, b, r, side) => {
      const key = dir + '|' + r3(coord);
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { dir: dir, coord: r3(coord), edges: [] }));
      g.edges.push({ a: r3(a), b: r3(b), room: r.id, side: side });
    };
    rooms.forEach((r) => {
      add('h', r.y, r.x, r.x + r.w, r, 'n'); add('h', r.y + r.d, r.x, r.x + r.w, r, 's');
      add('v', r.x, r.y, r.y + r.d, r, 'w'); add('v', r.x + r.w, r.y, r.y + r.d, r, 'e');
    });
    const out = [];
    groups.forEach((g) => {
      const pts = Array.from(new Set(g.edges.flatMap((e) => [e.a, e.b]))).sort((p, q) => p - q);
      const pieces = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const p = pts[i], q = pts[i + 1];
        if (q - p < 0.002) continue;
        const owners = g.edges.filter((e) => e.a <= p + 0.0015 && e.b >= q - 0.0015);
        if (!owners.length) continue;
        pieces.push({ a: p, b: q, owners: owners, cls: owners.length >= 2 ? 'int' : 'ext', sig: owners.map((o) => o.room).sort().join(',') + '|' + (owners.length >= 2 ? 'i' : 'e') });
      }
      const merged = [];
      pieces.forEach((pc) => {
        const last = merged[merged.length - 1];
        if (last && last.sig === pc.sig && Math.abs(last.b - pc.a) < 0.003) { last.b = pc.b; return; }
        merged.push({ a: pc.a, b: pc.b, owners: pc.owners, cls: pc.cls, sig: pc.sig });
      });
      merged.forEach((m) => {
        const horiz = g.dir === 'h';
        const w = { id: 'w:' + g.dir + ':' + g.coord + ':' + m.a + ':' + m.b, src: 'room', dir: g.dir, ext: m.cls === 'ext', t: m.cls === 'ext' ? cfg.ext : cfg.int,
          x1: horiz ? m.a : g.coord, y1: horiz ? g.coord : m.a, x2: horiz ? m.b : g.coord, y2: horiz ? g.coord : m.b,
          rooms: m.owners.map((o) => o.room), sides: m.owners.map((o) => o.side), nx: 0, ny: 0 };
        if (w.ext) { const sd = m.owners[0].side; w.nx = sd === 'w' ? -1 : sd === 'e' ? 1 : 0; w.ny = sd === 'n' ? -1 : sd === 's' ? 1 : 0; }
        out.push(w);
      });
    });
    return out;
  }

  /* bir katın tüm türetilmiş verisi */
  function deriveFloor(E, fl) {
    const rooms0 = E.rooms.filter((r) => r.f === fl.id);
    const walls = wallsOfRooms(rooms0, E.wall);
    E.walls.filter((w) => w.f === fl.id).forEach((w) => {
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
      walls.push({ id: w.id, src: 'free', dir: Math.abs(dy) < 1e-6 ? 'h' : Math.abs(dx) < 1e-6 ? 'v' : 'a', ext: false, t: w.t, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, rooms: [], sides: [], nx: 0, ny: 0 });
    });
    walls.forEach((w) => { w.len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1); w.ux = (w.x2 - w.x1) / (w.len || 1); w.uy = (w.y2 - w.y1) / (w.len || 1); });
    // oda net ölçüleri: her kenarda baskın duvar sınıfının yarı kalınlığı
    const acc = {};
    walls.forEach((w) => w.rooms.forEach((rid, i) => { const k = rid + ':' + w.sides[i]; const a = acc[k] || (acc[k] = { ext: 0, int: 0 }); a[w.ext ? 'ext' : 'int'] += w.len; }));
    const ins = (rid, side) => { const a = acc[rid + ':' + side]; if (!a) return E.wall.ext / 2; return (a.ext >= a.int ? E.wall.ext : E.wall.int) / 2; };
    const rooms = rooms0.map((r) => {
      const n = ins(r.id, 'n'), s = ins(r.id, 's'), w = ins(r.id, 'w'), e = ins(r.id, 'e');
      const net = { x: r.x + w, y: r.y + n, w: Math.max(0.1, r.w - w - e), d: Math.max(0.1, r.d - n - s) };
      const rt = C.ROOM_BY[r.type] || C.ROOM_BY.salon;
      return Object.assign({}, r, { net: net, area: net.w * net.d, gross: r.w * r.d, cx: r.x + r.w / 2, cy: r.y + r.d / 2, zone: rt.zone, rt: rt, ins: { n: n, s: s, w: w, e: e } });
    });
    const roomBy = {};
    rooms.forEach((r) => { roomBy[r.id] = r; });
    const containing = (x, y, tol) => {
      let best = null;
      rooms.forEach((r) => { const t = tol || 0; if (x >= r.x - t && x <= r.x + r.w + t && y >= r.y - t && y <= r.y + r.d + t && (!best || r.gross < best.gross)) best = r; });
      return best;
    };
    // açıklıkları duvara oturt
    const ops = E.ops.filter((o) => o.f === fl.id).map((o) => {
      const ang = (o.rot * Math.PI) / 180;
      let best = null;
      walls.forEach((w) => {
        const wa = ((Math.atan2(w.y2 - w.y1, w.x2 - w.x1) % Math.PI) + Math.PI) % Math.PI;
        let da = Math.abs(wa - ang); da = Math.min(da, Math.PI - da);
        if (da > 0.06) return;
        const px = o.x - w.x1, py = o.y - w.y1;
        const s = px * w.ux + py * w.uy, dist = Math.abs(-px * w.uy + py * w.ux);
        const slack = Math.max(w.t / 2, 0.05) + 0.06;
        if (dist > slack || s < -0.05 || s > w.len + 0.05) return;
        const score = dist + (s < o.w / 2 || s > w.len - o.w / 2 ? 0.2 : 0);
        if (!best || score < best.score) best = { w: w, s: s, dist: dist, score: score };
      });
      const out = Object.assign({}, o, { wall: null, orphan: true, ang: ang });
      if (best && o.w <= best.w.len + 0.02) {
        const w = best.w;
        const s = U.clamp(best.s, o.w / 2, Math.max(o.w / 2, w.len - o.w / 2));
        const cx = w.x1 + w.ux * s, cy = w.y1 + w.uy * s;
        const nx = -w.uy, ny = w.ux;
        const hw = o.w / 2;
        const side = (sgn) => containing(cx + nx * sgn * (w.t / 2 + 0.2), cy + ny * sgn * (w.t / 2 + 0.2));
        const rp = side(1), rn = side(-1);
        Object.assign(out, { wall: w.id, orphan: false, cx: cx, cy: cy, ux: w.ux, uy: w.uy, nx: nx, ny: ny, t: w.t, ext: w.ext,
          ax: cx - w.ux * hw, ay: cy - w.uy * hw, bx: cx + w.ux * hw, by: cy + w.uy * hw, rp: rp ? rp.id : null, rn: rn ? rn.id : null, s: s, wallLen: w.len });
      } else { out.cx = o.x; out.cy = o.y; out.ux = Math.cos(ang); out.uy = Math.sin(ang); out.nx = -out.uy; out.ny = out.ux; out.t = E.wall.int; out.ext = false; out.ax = o.x - out.ux * o.w / 2; out.ay = o.y - out.uy * o.w / 2; out.bx = o.x + out.ux * o.w / 2; out.by = o.y + out.uy * o.w / 2; }
      return out;
    });
    // nesne ayak izleri (döndürülmüş dikdörtgen) ve oda ataması
    const objs = E.objs.filter((o) => o.f === fl.id).map((o) => {
      const a = (o.rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      const hw = o.w / 2, hd = o.d / 2;
      const fp = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map((q) => [o.x + q[0] * ca - q[1] * sa, o.y + q[0] * sa + q[1] * ca]);
      const rm = containing(o.x, o.y);
      return Object.assign({}, o, { fp: fp, room: rm ? rm.id : null, cat: C.FURN_BY[o.k] });
    });
    const D = { f: fl, elev: elevOf(E, fl.id), rooms: rooms, roomBy: roomBy, walls: walls, ops: ops, objs: objs,
      stairs: E.stairs.filter((s) => s.f === fl.id), rails: E.rails.filter((r) => r.f === fl.id), labels: E.labels.filter((l) => l.f === fl.id), containing: containing };
    D.bounds = boundsOf(D);
    return D;
  }
  function boundsOf(D) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const acc = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    D.rooms.forEach((r) => { acc(r.x - r.ins.w, r.y - r.ins.n); acc(r.x + r.w + r.ins.e, r.y + r.d + r.ins.s); });
    D.walls.forEach((w) => { acc(w.x1, w.y1); acc(w.x2, w.y2); });
    D.objs.forEach((o) => o.fp.forEach((q) => acc(q[0], q[1])));
    D.stairs.forEach((s) => { const b = stairBox(s); acc(s.x - b.r, s.y - b.r); acc(s.x + b.r, s.y + b.r); });
    D.rails.forEach((r) => { acc(r.x1, r.y1); acc(r.x2, r.y2); });
    D.labels.forEach((l) => acc(l.x, l.y));
    if (x0 === Infinity) return { x0: 0, y0: 0, x1: 8, y1: 6, w: 8, h: 6, empty: true };
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 };
  }

  /* ---------------- merdiven geometrisi (yerel koordinat, merkez = kutu merkezi, çıkış yönü −y) ---------------- */
  const TREAD = 0.28;
  function stairSteps(s, fh) {
    const n = s.steps || Math.max(4, Math.round(fh / 0.175));
    const m = n - 1; // basamak sayısı (son rıht üst kat döşemesine biter)
    const rise = fh / n, w = s.w;
    const steps = [];
    let bw, bd;
    if (s.sub === 'L') {
      const m1 = Math.max(1, Math.floor((m - 1) / 2)), m2 = Math.max(1, m - 1 - m1);
      bw = w + m2 * TREAD; bd = w + m1 * TREAD;
      for (let i = 0; i < m1; i++) steps.push({ x0: 0, y0: bd - (i + 1) * TREAD, x1: w, y1: bd - i * TREAD, z: (i + 1) * rise, dir: [0, -1] });
      steps.push({ x0: 0, y0: 0, x1: w, y1: w, z: (m1 + 1) * rise, dir: [0, -1], landing: true });
      for (let j = 0; j < m2; j++) steps.push({ x0: w + j * TREAD, y0: 0, x1: w + (j + 1) * TREAD, y1: w, z: (m1 + 2 + j) * rise, dir: [1, 0] });
    } else if (s.sub === 'U') {
      const m1 = Math.max(1, Math.floor((m - 1) / 2)), m2 = Math.max(1, m - 1 - m1), gap = 0.1;
      const L = Math.max(m1, m2) * TREAD;
      bw = 2 * w + gap; bd = w + L;
      for (let i = 0; i < m1; i++) steps.push({ x0: 0, y0: bd - (i + 1) * TREAD, x1: w, y1: bd - i * TREAD, z: (i + 1) * rise, dir: [0, -1] });
      steps.push({ x0: 0, y0: 0, x1: bw, y1: w, z: (m1 + 1) * rise, dir: [0, -1], landing: true });
      for (let j = 0; j < m2; j++) steps.push({ x0: w + gap, y0: w + j * TREAD, x1: bw, y1: w + (j + 1) * TREAD, z: (m1 + 2 + j) * rise, dir: [0, 1] });
    } else {
      bw = w; bd = Math.max(1, m) * TREAD;
      for (let i = 0; i < m; i++) steps.push({ x0: 0, y0: bd - (i + 1) * TREAD, x1: w, y1: bd - i * TREAD, z: (i + 1) * rise, dir: [0, -1] });
    }
    steps.forEach((q) => { q.x0 -= bw / 2; q.x1 -= bw / 2; q.y0 -= bd / 2; q.y1 -= bd / 2; });
    return { steps: steps, bw: bw, bd: bd, n: n, rise: rise };
  }
  function stairBox(s) { const g = stairSteps(s, 3); return { bw: g.bw, bd: g.bd, r: Math.hypot(g.bw, g.bd) / 2 }; }
  const rotPt = (x, y, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
  function stairAabb(s, fh) {
    const g = stairSteps(s, fh || 3);
    const pts = [[-g.bw / 2, -g.bd / 2], [g.bw / 2, -g.bd / 2], [g.bw / 2, g.bd / 2], [-g.bw / 2, g.bd / 2]].map((q) => { const r = rotPt(q[0], q[1], s.rot); return [s.x + r[0], s.y + r[1]]; });
    return { x0: Math.min.apply(null, pts.map((p) => p[0])), x1: Math.max.apply(null, pts.map((p) => p[0])), y0: Math.min.apply(null, pts.map((p) => p[1])), y1: Math.max.apply(null, pts.map((p) => p[1])) };
  }

  /* ---------------- çarpışma: döndürülmüş dikdörtgenler (SAT) ---------------- */
  function satOverlap(A, B, shrink) {
    const cs = (poly) => { let cx = 0, cy = 0; poly.forEach((p) => { cx += p[0]; cy += p[1]; }); return [cx / poly.length, cy / poly.length]; };
    const sh = (poly) => { if (!shrink) return poly; const c = cs(poly); return poly.map((p) => [c[0] + (p[0] - c[0]) * (1 - shrink), c[1] + (p[1] - c[1]) * (1 - shrink)]); };
    const a = sh(A), b = sh(B);
    for (const poly of [a, b]) {
      for (let i = 0; i < 2; i++) {
        const p = poly[i], q = poly[i + 1];
        const nx = -(q[1] - p[1]), ny = q[0] - p[0];
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        a.forEach((v) => { const d = v[0] * nx + v[1] * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); });
        b.forEach((v) => { const d = v[0] * nx + v[1] * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); });
        if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return false;
      }
    }
    return true;
  }

  /* ---------------- tüm proje türetmesi ---------------- */
  let memo = { e: null, sp: null, rl: null, out: null };
  function derive(P) {
    const E = get(P);
    if (memo.e === E && memo.sp === P.spaces && memo.rl === P.relations) return memo.out;
    const out = { E: E, floors: [], by: {}, unit: E.unit };
    E.floors.forEach((fl) => { const D = deriveFloor(E, fl); out.floors.push(D); out.by[fl.id] = D; });
    analyse(P, out);
    memo = { e: E, sp: P.spaces, rl: P.relations, out: out };
    return out;
  }

  /* ---------------- çözümleme: erişim, gün ışığı, alan, ilişki, bulgular ---------------- */
  function analyse(P, out) {
    const E = out.E;
    const finds = [];
    const F = (sev, id, text, target) => finds.push({ sev: sev, id: id, text: text, target: target || null });
    const M = { rooms: 0, net: 0, gross: 0, doors: 0, windows: 0, wallLen: 0, wallArea: 0, reachOk: 0, reachTot: 0, dayOk: 0, dayTot: 0, areaOk: 0, areaTot: 0, relOk: 0, relTot: 0, orphan: 0, overlap: 0, furn: 0 };
    const spaceBy = {};
    (P.spaces || []).forEach((s) => { spaceBy[s.id] = s; });
    const linked = {};
    out.floors.forEach((D) => {
      const fh = D.f.h;
      D.rooms.forEach((r) => { if (r.space && spaceBy[r.space]) linked[r.space] = { room: r, D: D }; });
      M.rooms += D.rooms.length; D.rooms.forEach((r) => { M.net += r.area; M.gross += r.gross; });
      M.furn += D.objs.length;
      D.walls.forEach((w) => { M.wallLen += w.len; M.wallArea += w.len * fh; });
      // açıklık sayıları, yetimler
      D.ops.forEach((o) => {
        if (o.orphan) { M.orphan++; F('uyari', 'orphan:' + o.id, (o.k === 'kapi' ? 'Kapı' : 'Pencere') + ' bir duvar üzerinde değil (' + D.f.name + ').', { k: 'op', id: o.id, f: D.f.id }); return; }
        if (o.k === 'kapi') M.doors++; else M.windows++;
        M.wallArea -= o.w * Math.min(o.h, fh - o.sill);
      });
      // oda çakışması
      for (let i = 0; i < D.rooms.length; i++) for (let j = i + 1; j < D.rooms.length; j++) {
        const a = D.rooms[i], b = D.rooms[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
        if (ox > 0.05 && oy > 0.05) { M.overlap++; a.overlap = b.overlap = true; F('hata', 'ovl:' + a.id + ':' + b.id, a.name + ' ile ' + b.name + ' çakışıyor.', { k: 'room', id: a.id, f: D.f.id }); }
      }
      // bağlantı grafiği (kapı / geçiş / balkon kapısı)
      const adj = {};
      const entries = new Set();
      D.rooms.forEach((r) => { adj[r.id] = new Set(); });
      D.ops.forEach((o) => {
        if (o.orphan) return;
        const def = C.OP_BY[o.k + ':' + o.sub] || {};
        const pass = o.k === 'kapi' || def.door;
        if (!pass) return;
        if (o.rp && o.rn && o.rp !== o.rn) { adj[o.rp].add(o.rn); adj[o.rn].add(o.rp); }
        else if ((o.rp || o.rn) && !(o.rp && o.rn) && o.k === 'kapi') entries.add(o.rp || o.rn);
        else if ((o.rp || o.rn) && !(o.rp && o.rn) && def.door) entries.add(o.rp || o.rn);
      });
      D.adj = adj; D.entries = entries;
      D.rooms.forEach((r) => { r.doors = D.ops.filter((o) => !o.orphan && o.k === 'kapi' && (o.rp === r.id || o.rn === r.id)).length; });
      if (D === out.floors[0]) {
        if (D.rooms.length && !entries.size) F('oneri', 'noentry', 'Dış kapı yok: bir giriş kapısı (Dış kapı) ekleyin.', null);
        let start = new Set(entries);
        if (!start.size) D.rooms.forEach((r) => { if (r.type === 'giris' || r.type === 'hol') start.add(r.id); });
        if (start.size) {
          const seen = new Set(start), q = Array.from(start);
          while (q.length) { const c = q.shift(); adj[c].forEach((n) => { if (!seen.has(n)) { seen.add(n); q.push(n); } }); }
          D.reach = seen;
          D.rooms.forEach((r) => {
            if (r.rt.out && !r.doors && !D.ops.some((o) => !o.orphan && (o.rp === r.id || o.rn === r.id) && (C.OP_BY[o.k + ':' + o.sub] || {}).door)) return;
            M.reachTot++;
            if (seen.has(r.id)) M.reachOk++; else F('uyari', 'reach:' + r.id, r.name + ' girişten kapılarla ulaşılamıyor.', { k: 'room', id: r.id, f: D.f.id });
          });
        }
      } else {
        // üst katlar: merdivenle ya da kendi içinde bağlantı denetimi yapılmaz; kapısız odalar için uyarı
        D.rooms.forEach((r) => { if (!r.doors && D.rooms.length > 1 && !r.rt.corridor) F('uyari', 'nodoor:' + r.id, r.name + ' için kapı tanımlı değil.', { k: 'room', id: r.id, f: D.f.id }); });
      }
      // gün ışığı: yaşama mekânı dış duvarda pencere / cam kapı ister
      D.rooms.forEach((r) => {
        if (!r.rt.hab) return;
        M.dayTot++;
        const has = D.ops.some((o) => !o.orphan && o.k === 'pencere' && o.ext && (o.rp === r.id || o.rn === r.id));
        if (has) M.dayOk++;
        else {
          const extEdge = D.walls.some((w) => w.ext && w.rooms.indexOf(r.id) >= 0);
          F(extEdge ? 'uyari' : 'oneri', 'day:' + r.id, r.name + (extEdge ? ' dış duvarında pencere yok.' : ' dış duvara bakmıyor; doğal ışık alamaz.'), { k: 'room', id: r.id, f: D.f.id });
        }
      });
      // alan: öneri asgari değerler
      D.rooms.forEach((r) => {
        if (!r.rt.min) { if (r.rt.corridor && Math.min(r.net.w, r.net.d) < 1.0) F('uyari', 'narrow:' + r.id, r.name + ' en az 1,00 m genişlikte olmalı (şu an ' + U.fmt(Math.min(r.net.w, r.net.d), 2) + ' m).', { k: 'room', id: r.id, f: D.f.id }); return; }
        M.areaTot++;
        if (r.area + 0.01 >= r.rt.min) M.areaOk++;
        else F('oneri', 'min:' + r.id, r.name + ' ' + U.fmt(r.area, 1) + ' m²; öneri asgari ' + U.fmt(r.rt.min, 1) + ' m² (yönetmelik değeri değildir).', { k: 'room', id: r.id, f: D.f.id });
      });
      // kapı genişliği
      D.ops.forEach((o) => { if (!o.orphan && o.k === 'kapi' && o.w < 0.78 && !(C.OP_BY['kapi:' + o.sub] || {}).open) F('oneri', 'dw:' + o.id, 'Kapı genişliği ' + U.fmt(o.w, 2) + ' m; en az 0,80 m önerilir.', { k: 'op', id: o.id, f: D.f.id }); });
      // nesne çakışması (tezgâh üstü ocak / evye gibi bilinçli üst üste durumlar sayılmaz)
      const ONTOP = { 'tezgah>ocak': 1, 'tezgah>evye': 1, 'ada>ocak': 1, 'ada>evye': 1, 'tezgah>bulasik': 1 };
      const flat = (o) => o.cat && o.cat.flat;
      for (let i = 0; i < D.objs.length; i++) for (let j = i + 1; j < D.objs.length; j++) {
        const a = D.objs[i], b = D.objs[j];
        if (flat(a) || flat(b)) continue;
        if (ONTOP[a.k + '>' + b.k] || ONTOP[b.k + '>' + a.k]) continue;
        if (Math.abs(a.x - b.x) > (a.w + a.d + b.w + b.d) / 2) continue;
        if (satOverlap(a.fp, b.fp, 0.12)) { a.hit = b.hit = true; }
      }
      D.objs.forEach((o) => { if (o.hit) M.overlapObj = (M.overlapObj || 0) + 1; });
    });
    if (M.overlapObj) F('oneri', 'objhit', M.overlapObj + ' nesne birbiriyle çakışıyor.', null);
    // program ilişkisi (İşlev Şeması): güçlü ilişkili bağlı odalar bitişik mi
    const rel = P.relations || {};
    const ids = Object.keys(linked);
    let progMiss = 0;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const key = U.pairKey(ids[i], ids[j]);
      const t = rel[key];
      if (t !== 'strong' && t !== 'avoid') continue;
      const A = linked[ids[i]], B = linked[ids[j]];
      const adjacent = A.D === B.D && sharedLen(A.D, A.room.id, B.room.id) >= 0.6;
      if (t === 'strong') { M.relTot++; if (adjacent) M.relOk++; else F('oneri', 'rel:' + key, A.room.name + ' ↔ ' + B.room.name + ' güçlü ilişkili ama bitişik değil.', { k: 'room', id: A.room.id, f: A.D.f.id }); }
      else { M.relTot++; if (!adjacent) M.relOk++; else F('uyari', 'avoid:' + key, A.room.name + ' ile ' + B.room.name + ' ayrı tutulmalı ama bitişik.', { k: 'room', id: A.room.id, f: A.D.f.id }); }
    }
    // program kapsamı
    let missing = 0;
    (P.spaces || []).forEach((s) => { if (!linked[s.id]) missing++; });
    M.programTotal = (P.spaces || []).length; M.programMissing = missing;
    if (E.rooms.length && missing && E.rooms.some((r) => r.space)) F('oneri', 'prog', missing + ' program mekânı plana yerleştirilmedi.', null);
    // skor
    const parts = [[M.reachTot ? M.reachOk / M.reachTot : null, 0.3], [M.dayTot ? M.dayOk / M.dayTot : null, 0.25], [M.areaTot ? M.areaOk / M.areaTot : null, 0.25], [M.relTot ? M.relOk / M.relTot : null, 0.2]].filter((p) => p[0] != null);
    const wsum = parts.reduce((t, p) => t + p[1], 0);
    M.score = E.rooms.length && wsum ? Math.round((100 * parts.reduce((t, p) => t + p[0] * p[1], 0)) / wsum - Math.min(25, M.overlap * 8 + M.orphan * 4)) : null;
    if (M.score != null) M.score = U.clamp(M.score, 0, 100);
    M.reach = M.reachTot ? M.reachOk / M.reachTot : null; M.day = M.dayTot ? M.dayOk / M.dayTot : null; M.areaFit = M.areaTot ? M.areaOk / M.areaTot : null; M.relFit = M.relTot ? M.relOk / M.relTot : null;
    const order = { hata: 0, uyari: 1, oneri: 2 };
    finds.sort((a, b) => order[a.sev] - order[b.sev]);
    const counts = { hata: 0, uyari: 0, oneri: 0 };
    finds.forEach((f) => { counts[f.sev]++; });
    out.metrics = M; out.findings = { items: finds, counts: counts };
    out.linked = linked;
  }
  function sharedLen(D, a, b) {
    let t = 0;
    D.walls.forEach((w) => { if (w.rooms.indexOf(a) >= 0 && w.rooms.indexOf(b) >= 0) t += w.len; });
    return t;
  }

  /* ---------------- metraj (Fizibilite / rapor için) ---------------- */
  function takeoff(P) {
    const d = derive(P), E = d.E;
    const floorArea = {}, wallArea = {}, ext = { len: 0, area: 0 };
    const q = { floors: [], doors: {}, windows: {}, floorArea: floorArea, wallArea: wallArea, ext: ext, rooms: [] };
    d.floors.forEach((D) => {
      const row = { id: D.f.id, name: D.f.name, h: D.f.h, net: 0, gross: 0, rooms: D.rooms.length, wallLen: 0, extLen: 0, wallArea: 0 };
      D.rooms.forEach((r) => {
        row.net += r.area; row.gross += r.gross;
        const m = finOf(E, D.f, r, 'zemin'); floorArea[m] = (floorArea[m] || 0) + r.area;
        const wm = finOf(E, D.f, r, 'duvar'); wallArea[wm] = (wallArea[wm] || 0) + 2 * (r.net.w + r.net.d) * D.f.h;
        q.rooms.push({ floor: D.f.name, name: r.name, type: r.type, area: r2(r.area), zemin: m, duvar: wm });
      });
      D.walls.forEach((w) => { row.wallLen += w.len; if (w.ext) { row.extLen += w.len; ext.len += w.len; ext.area += w.len * D.f.h; } });
      D.ops.forEach((o) => { if (o.orphan) return; const bag = o.k === 'kapi' ? q.doors : q.windows; const k = o.sub; bag[k] = bag[k] || { n: 0, area: 0 }; bag[k].n++; bag[k].area += o.w * o.h; });
      q.floors.push(row);
    });
    return q;
  }

  /* ---------------- düzenleme yardımcıları (reducer kullanır) ---------------- */
  const snapV = (v, s) => r3(Math.round(v / s) * s);
  const roomLabelNo = (E, type, f) => E.rooms.filter((r) => r.type === type && r.f === f).length + 1;
  function newRoom(E, o) {
    const t = C.ROOM_BY[o.type] || C.ROOM_BY.salon;
    const n = roomLabelNo(E, t.k, o.f);
    return { id: nid('r'), f: o.f, type: t.k, name: o.name || (n > 1 ? t.label + ' ' + n : t.label), x: r3(o.x), y: r3(o.y), w: U.clamp(r3(o.w || t.def[0]), MIN, 80), d: U.clamp(r3(o.d || t.def[1]), MIN, 80), style: null, fin: {}, space: o.space || null };
  }
  const inRect = (x, y, r, pad) => x >= r.x - (pad || 0) && x <= r.x + r.w + (pad || 0) && y >= r.y - (pad || 0) && y <= r.y + r.d + (pad || 0);

  /* odayı taşı: nesne, merdiven, etiket ve yalnızca bu odaya ait duvarlardaki açıklıklar birlikte gider */
  function moveRoom(E, id, dx, dy) {
    const r = E.rooms.find((q) => q.id === id);
    if (!r) return E;
    const fl = E.floors.find((f) => f.id === r.f);
    const D = deriveFloor(E, fl);
    const exclOps = new Set();
    D.ops.forEach((o) => { if (!o.orphan) { const w = D.walls.find((q) => q.id === o.wall); if (w && w.rooms.length === 1 && w.rooms[0] === id) exclOps.add(o.id); } });
    const old = { x: r.x, y: r.y, w: r.w, d: r.d };
    const sh = (o) => Object.assign({}, o, { x: r3(o.x + dx), y: r3(o.y + dy) });
    return Object.assign({}, E, {
      rooms: E.rooms.map((q) => (q.id === id ? Object.assign({}, q, { x: r3(q.x + dx), y: r3(q.y + dy) }) : q)),
      ops: E.ops.map((o) => (exclOps.has(o.id) ? sh(o) : o)),
      objs: E.objs.map((o) => (o.f === r.f && inRect(o.x, o.y, old) ? sh(o) : o)),
      stairs: E.stairs.map((s) => (s.f === r.f && inRect(s.x, s.y, old) ? sh(s) : s)),
      labels: E.labels.map((l) => (l.f === r.f && inRect(l.x, l.y, old) ? sh(l) : l)),
    });
  }

  /* odayı yeniden boyutlandır (yeni merkez-çizgi dikdörtgeni); duvar üzerindeki açıklıklar kenarla birlikte kayar, sığmayan silinir */
  function resizeRoom(E, id, nr) {
    const r = E.rooms.find((q) => q.id === id);
    if (!r) return E;
    nr = { x: r3(nr.x), y: r3(nr.y), w: U.clamp(r3(nr.w), MIN, 80), d: U.clamp(r3(nr.d), MIN, 80) };
    const fl = E.floors.find((f) => f.id === r.f);
    const D = deriveFloor(E, fl);
    const eps = 0.02;
    const ops = [];
    E.ops.forEach((o) => {
      if (o.f !== r.f) { ops.push(o); return; }
      const d = D.ops.find((q) => q.id === o.id);
      const w = d && !d.orphan ? D.walls.find((q) => q.id === d.wall) : null;
      if (!w || w.rooms.length !== 1 || w.rooms[0] !== id) { ops.push(o); return; }
      const side = w.sides[0];
      let nx = o.x, ny = o.y;
      if (side === 'w') nx = nr.x; else if (side === 'e') nx = nr.x + nr.w; else if (side === 'n') ny = nr.y; else ny = nr.y + nr.d;
      const along = side === 'n' || side === 's';
      const lo = along ? nr.x : nr.y, hi = along ? nr.x + nr.w : nr.y + nr.d;
      let c = along ? nx : ny;
      if (o.w > hi - lo - 0.2) return; // sığmıyor → silinir
      c = U.clamp(c, lo + o.w / 2 + 0.1, hi - o.w / 2 - 0.1);
      if (along) nx = c; else ny = c;
      void eps;
      ops.push(Object.assign({}, o, { x: r3(nx), y: r3(ny) }));
    });
    return Object.assign({}, E, { rooms: E.rooms.map((q) => (q.id === id ? Object.assign({}, q, nr) : q)), ops: ops });
  }

  /* ---------------- otomatik döşeme (Odayı döşe) ----------------
     Mevcut donatı tarifini (App.study.autoFurnish) oda net alanına uygular; kapı salınım alanına düşenler atılır. */
  function furnishRoom(E, D, rid) {
    const r = D.roomBy[rid];
    if (!r || !App.study || !App.study.autoFurnish) return [];
    const ring = [[r.net.x, r.net.y], [r.net.x + r.net.w, r.net.y], [r.net.x + r.net.w, r.net.y + r.net.d], [r.net.x, r.net.y + r.net.d]];
    const it = { id: r.id, name: r.rt.label + (r.type === 'giris' ? ' giriş' : ''), zone: r.zone, area: r.area, x: r.net.x, y: r.net.y, w: r.net.w, h: r.net.d, shape: 'rect', rot: 0, cut: 0.5, ring: ring, furn: [] };
    const nm = U.norm(r.name + ' ' + r.rt.label);
    if (/ebeveyn.*banyo|dus wc|^wc|\bwc\b/.test(nm) && r.type !== 'banyo') it.name = r.type === 'wc' ? 'WC' : 'Banyo';
    if (r.type === 'acik_mutfak') it.name = 'Mutfak';
    if (r.type === 'ebeveyn') it.name = 'Ebeveyn yatak odası';
    if (r.type === 'giris') it.name = 'Giriş';
    const raw = App.study.autoFurnish(it);
    // kapı / pencere kaçış alanları
    const zones = [];
    D.ops.forEach((o) => {
      if (o.orphan || (o.rp !== rid && o.rn !== rid)) return;
      const def = C.OP_BY[o.k + ':' + o.sub] || {};
      if (o.k === 'kapi' && !def.slide) {
        const sg = o.rp === rid ? 1 : -1;
        const x0 = Math.min(o.ax, o.bx, o.ax + o.nx * sg * o.w, o.bx + o.nx * sg * o.w), x1 = Math.max(o.ax, o.bx, o.ax + o.nx * sg * o.w, o.bx + o.nx * sg * o.w);
        const y0 = Math.min(o.ay, o.by, o.ay + o.ny * sg * o.w, o.by + o.ny * sg * o.w), y1 = Math.max(o.ay, o.by, o.ay + o.ny * sg * o.w, o.by + o.ny * sg * o.w);
        zones.push([x0, y0, x1, y1]);
      } else if (o.k === 'kapi' || (o.k === 'pencere' && def.door)) {
        const sg = o.rp === rid ? 1 : -1;
        const x0 = Math.min(o.ax, o.bx, o.ax + o.nx * sg * 0.6, o.bx + o.nx * sg * 0.6), x1 = Math.max(o.ax, o.bx, o.ax + o.nx * sg * 0.6, o.bx + o.nx * sg * 0.6);
        const y0 = Math.min(o.ay, o.by, o.ay + o.ny * sg * 0.6, o.by + o.ny * sg * 0.6), y1 = Math.max(o.ay, o.by, o.ay + o.ny * sg * 0.6, o.by + o.ny * sg * 0.6);
        zones.push([x0, y0, x1, y1]);
      }
    });
    const out = [];
    raw.forEach((f) => {
      const c = C.FURN_BY[f.k];
      if (!c) return;
      const r90 = f.r % 2;
      const fw = r90 ? c.d : c.w, fd = r90 ? c.w : c.d;
      const cx = r.net.x + f.x + fw / 2, cy = r.net.y + f.y + fd / 2;
      const x0 = cx - fw / 2, x1 = cx + fw / 2, y0 = cy - fd / 2, y1 = cy + fd / 2;
      if (!c.flat && zones.some((z) => x0 < z[2] && x1 > z[0] && y0 < z[3] && y1 > z[1])) return;
      out.push({ id: nid('n'), f: D.f.id, k: f.k, x: r3(cx), y: r3(cy), rot: (f.r * 90) % 360, w: c.w, d: c.d, h: c.h, fin: null, auto: true });
    });
    return out;
  }

  /* ---------------- İşlev Şeması / serbest düzenden plan ---------------- */
  function fromProgram(P, opts) {
    opts = opts || {};
    const E0 = get(P);
    const free = P.study && P.study.free && P.study.free.shapes;
    const spaces = P.spaces || [];
    const levels = {};
    spaces.forEach((s) => { const f = free && free[s.id]; levels[s.id] = Math.min(5, (f && f.lv) || 0); });
    const nFl = Math.max(1, Math.max.apply(null, spaces.map((s) => levels[s.id] + 1).concat([1])));
    const floors = [];
    for (let i = 0; i < nFl; i++) floors.push({ id: 'k' + i, name: i === 0 ? 'Zemin kat' : i + '. kat', h: 3, style: null, fin: {} });
    const rooms = [];
    const byLv = {};
    spaces.forEach((s) => { (byLv[levels[s.id]] = byLv[levels[s.id]] || []).push(s); });
    Object.keys(byLv).forEach((lv) => {
      const list = byLv[lv];
      const havePos = list.every((s) => free && free[s.id] && isFinite(free[s.id].x));
      let rects;
      if (havePos) {
        const minX = Math.min.apply(null, list.map((s) => free[s.id].x)), minY = Math.min.apply(null, list.map((s) => free[s.id].y));
        rects = list.map((s) => ({ s: s, x: free[s.id].x - minX, y: free[s.id].y - minY, w: free[s.id].w, d: free[s.id].h }));
      } else {
        // şerit paketleme
        const tot = list.reduce((t, s) => t + s.area, 0), W = Math.max(8, Math.sqrt(tot * 1.5));
        let x = 0, y = 0, rowH = 0;
        rects = list.slice().sort((a, b) => b.area - a.area).map((s) => {
          const w = Math.max(1.6, Math.sqrt(s.area * 1.3)), d = Math.max(1.4, s.area / w);
          if (x + w > W) { x = 0; y += rowH; rowH = 0; }
          const q = { s: s, x: x, y: y, w: w, d: d };
          x += w; rowH = Math.max(rowH, d);
          return q;
        });
      }
      rects.forEach((q) => {
        const type = C.guessRoom(q.s.name, q.s.zone);
        const sn = 0.1;
        rooms.push({ id: nid('r'), f: 'k' + lv, type: type, name: q.s.name, x: snapV(q.x, sn), y: snapV(q.y, sn), w: Math.max(MIN, snapV(q.w, sn)), d: Math.max(MIN, snapV(q.d, sn)), style: null, fin: {}, space: q.s.id });
      });
    });
    return clean(Object.assign({}, E0, { floors: floors, rooms: rooms, walls: [], ops: [], objs: [], stairs: [], rails: [], labels: [], cam: { x: 0, y: 0, yaw: 0, f: 'k0' }, unit: E0.unit, snap: E0.snap, style: opts.style || E0.style }));
  }

  /* ---------------- kapı ve pencereleri otomatik yerleştir ---------------- */
  function autoOpenings(P, E, fid) {
    const fl = E.floors.find((f) => f.id === fid) || E.floors[0];
    const D = deriveFloor(E, fl);
    const ops = E.ops.filter((o) => o.f !== fl.id || false);
    const keep = E.ops.filter((o) => o.f === fl.id);
    const mk = (k, sub, x, y, rot, flip, mir) => { const d = C.OP_BY[k + ':' + sub]; return { id: nid('o'), f: fl.id, k: k, sub: sub, x: r3(x), y: r3(y), rot: rot, w: d.w, h: d.h, sill: d.sill, flip: !!flip, mir: !!mir, fin: null }; };
    const out = keep.slice();
    const has = (wallId, c) => out.some((o) => { const q = D.ops.find((z) => z.id === o.id); return q && q.wall === wallId && Math.hypot(q.cx - c[0], q.cy - c[1]) < 0.6; });
    void has;
    const rel = P.relations || {};
    const connected = {}; D.rooms.forEach((r) => { connected[r.id] = new Set(); });
    D.ops.forEach((o) => { if (!o.orphan && o.k === 'kapi' && o.rp && o.rn) { connected[o.rp].add(o.rn); connected[o.rn].add(o.rp); } });
    const circ = (r) => r.zone === 'sirkulasyon';
    const rank = (a, b) => {
      let s = 0;
      if (circ(b)) s += 6; if (b.rt.k === 'hol') s += 2;
      if (a.zone === 'ozel' && b.zone === 'ozel') s -= 2;
      if (a.space && b.space) { const t = rel[U.pairKey(a.space, b.space)]; if (t === 'strong') s += 5; else if (t === 'avoid') s -= 9; }
      if (a.rt.wet && b.zone === 'ozel') s += 1;
      return s;
    };
    const sharedWalls = (a, b) => D.walls.filter((w) => w.rooms.indexOf(a.id) >= 0 && w.rooms.indexOf(b.id) >= 0 && w.len >= 1.1).sort((p, q) => q.len - p.len);
    const rooms = D.rooms.filter((r) => !r.rt.out || true);
    // 1) dış kapı
    const ent = rooms.find((r) => r.type === 'giris') || rooms.find((r) => r.type === 'hol') || rooms.slice().sort((a, b) => b.cy - a.cy)[0];
    const hasEntry = D.ops.some((o) => !o.orphan && o.k === 'kapi' && (o.rp ? !o.rn : !!o.rn) && o.ext);
    if (ent && !hasEntry && D === deriveFloor(E, E.floors[0])) {
      const ew = D.walls.filter((w) => w.ext && w.rooms[0] === ent.id && w.len >= 1.2).sort((p, q) => (q.ny > 0 ? 1 : 0) - (p.ny > 0 ? 1 : 0) || q.len - p.len)[0];
      if (ew) out.push(mk('kapi', 'dis', (ew.x1 + ew.x2) / 2, (ew.y1 + ew.y2) / 2, ew.dir === 'h' ? 0 : 90, ew.ny > 0 || ew.nx > 0 ? false : true, false));
    }
    // 2) oda bağlantıları: her oda en uygun komşusuna kapıyla bağlanır
    const done = new Set();
    const order = rooms.slice().sort((a, b) => (circ(b) ? 1 : 0) - (circ(a) ? 1 : 0));
    order.forEach((a) => {
      if (a.rt.out || connected[a.id].size) return;
      const cands = rooms.filter((b) => b.id !== a.id && sharedWalls(a, b).length).sort((p, q) => rank(a, q) - rank(a, p));
      const b = cands[0];
      if (!b) return;
      const w = sharedWalls(a, b)[0];
      const key = U.pairKey(a.id, b.id);
      if (done.has(key)) return;
      done.add(key);
      const mid = [(w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2];
      const sub = a.rt.k === 'dolap' || a.rt.k === 'kiler' ? 'tek80' : (a.rt.wet ? 'tek80' : 'tek');
      const p = mk('kapi', sub, mid[0], mid[1], w.dir === 'h' ? 0 : 90, false, false);
      // kapı komşu mekâna değil, küçük mekânın içine açılır
      const smallerIsA = a.gross <= b.gross;
      const inward = smallerIsA ? a : b;
      const sample = [mid[0] + (w.dir === 'h' ? 0 : 0.3), mid[1] + (w.dir === 'h' ? 0.3 : 0)];
      const inA = D.containing(sample[0], sample[1]);
      p.flip = !(inA && inA.id === inward.id);
      out.push(p);
      connected[a.id].add(b.id); connected[b.id].add(a.id);
    });
    // 3) balkon / teras kapısı
    rooms.filter((r) => r.rt.out).forEach((r) => {
      if (D.ops.some((o) => !o.orphan && (o.rp === r.id || o.rn === r.id))) return;
      const nb = rooms.filter((b) => !b.rt.out && sharedWalls(r, b).length).sort((p, q) => (q.rt.hab ? 1 : 0) - (p.rt.hab ? 1 : 0) || sharedWalls(r, q)[0].len - sharedWalls(r, p)[0].len)[0];
      if (!nb) return;
      const w = sharedWalls(r, nb)[0];
      out.push(mk('pencere', nb.rt.hab && w.len >= 1.6 ? 'fransiz' : 'balkon_kapi', (w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2, w.dir === 'h' ? 0 : 90, false, false));
    });
    // 4) pencereler: yaşama / ıslak mekânların en uzun dış duvarına
    rooms.forEach((r) => {
      if (r.rt.out || r.rt.corridor || r.type === 'dolap' || r.type === 'kiler') return;
      if (D.ops.some((o) => !o.orphan && o.k === 'pencere' && o.ext && (o.rp === r.id || o.rn === r.id))) return;
      const w = D.walls.filter((q) => q.ext && q.rooms[0] === r.id && q.len >= 1.0).sort((p, q) => q.len - p.len)[0];
      if (!w) return;
      const mid = [(w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2];
      const wetSmall = r.rt.wet && r.area < 6;
      const sub = wetSmall ? 'ust' : w.len >= 3.4 ? 'surme' : w.len >= 2.2 ? 'cift' : 'tek';
      out.push(mk('pencere', r.rt.hab || !r.rt.wet ? sub : sub, mid[0], mid[1], w.dir === 'h' ? 0 : 90, false, false));
    });
    return out.concat(ops);
  }

  /* ---------------- açıklık: en yakın duvara oturtma (yerleştirme / sürükleme) ---------------- */
  function nearestWall(D, x, y, maxDist) {
    let best = null;
    D.walls.forEach((w) => {
      const px = x - w.x1, py = y - w.y1;
      const s = px * w.ux + py * w.uy;
      const dist = Math.abs(-px * w.uy + py * w.ux);
      const sc = U.clamp(s, 0, w.len);
      const dd = Math.hypot(px - w.ux * sc, py - w.uy * sc);
      void dist;
      if (dd > maxDist) return;
      if (!best || dd < best.dd) best = { wall: w, s: sc, dd: dd };
    });
    if (!best) return null;
    const w = best.wall;
    return { wall: w, s: best.s, x: w.x1 + w.ux * best.s, y: w.y1 + w.uy * best.s, rot: ((Math.atan2(w.uy, w.ux) * 180) / Math.PI + 180) % 180, dd: best.dd };
  }

  Object.assign(pe, {
    defaults: defaults, clean: clean, get: get, derive: derive, deriveFloor: deriveFloor, takeoff: takeoff, nid: nid, r3: r3, r2: r2, SNAPS: SNAPS, MIN: MIN, LIM: LIM,
    fmtLen: fmtLen, fmtArea: fmtArea, floorIndex: floorIndex, elevOf: elevOf, styleOf: styleOf, finOf: finOf,
    newRoom: newRoom, moveRoom: moveRoom, resizeRoom: resizeRoom, furnishRoom: furnishRoom, fromProgram: fromProgram, autoOpenings: autoOpenings, nearestWall: nearestWall,
    stairSteps: stairSteps, stairAabb: stairAabb, rotPt: rotPt, satOverlap: satOverlap, sharedLen: sharedLen, snapV: snapV, inRect: inRect, TREAD: TREAD,
  });
})();
