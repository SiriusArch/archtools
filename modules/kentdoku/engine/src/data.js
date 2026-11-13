// archtools · Kent Dokusu - veri katmanı
// Kaynak: Overture Maps Foundation açık verisi (OpenStreetMap + Microsoft + Google Open Buildings
// + Esri birleşimi). PMTiles arşivleri tarayıcıdan aralık (range) istekleriyle okunur; sunucu gerekmez.

import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import * as PbfNs from 'pbf';
import * as PcNs from 'polygon-clipping';

import { asyncBufferFromUrl, parquetMetadataAsync, parquetRead } from 'hyparquet';
import { decompress as zstd } from 'fzstd';

// yalnızca ZSTD gerekir; saf JS çözücü (WebAssembly yok -> katı CSP ile uyumlu)
const compressors = { ZSTD: (input) => zstd(input) };

const Pbf = PbfNs.default || PbfNs.Pbf || PbfNs.PbfReader;

// ---------- GlobalBuildingAtlas (TUM) ----------
// 2,75 milyar bina, hepsi yükseklikli (LoD1). 5°x5° GeoParquet dosyaları; yalnızca alanı
// kesen satır grupları aralık istekleriyle okunur.
const GBA_BASE = 'https://data.source.coop/tge-labs/globalbuildingatlas-lod1/';
const gbaFiles = new Map();
function gbaTileName(lon, lat) {
  const w = Math.floor(lon / 5) * 5, n = Math.floor(lat / 5) * 5 + 5;
  const fx = v => (v < 0 ? 'w' : 'e') + String(Math.abs(v)).padStart(3, '0');
  const fy = v => (v < 0 ? 's' : 'n') + String(Math.abs(v)).padStart(2, '0');
  return `${fx(w)}_${fy(n)}_${fx(w + 5)}_${fy(n - 5)}`;
}
function gbaFile(name) {
  if (!gbaFiles.has(name)) {
    gbaFiles.set(name, (async () => {
      const file = await asyncBufferFromUrl({ url: GBA_BASE + name + '.parquet' });
      const metadata = await parquetMetadataAsync(file);
      const groups = [];
      let start = 0;
      for (const rg of metadata.row_groups) {
        const rows = Number(rg.num_rows);
        const st = {};
        for (const c of rg.columns) {
          const p = c.meta_data.path_in_schema.join('.');
          if (p.startsWith('bbox.')) st[p.slice(5)] = c.meta_data.statistics || {};
        }
        groups.push({ start, end: start + rows, st });
        start += rows;
      }
      return { file, metadata, groups };
    })().catch(e => { gbaFiles.delete(name); throw e; }));
  }
  return gbaFiles.get(name);
}
async function loadGBA(west, south, east, north) {
  const names = new Set();
  for (const lo of [west, east]) for (const la of [south, north]) names.add(gbaTileName(lo, la));
  const out = [];
  await Promise.all([...names].map(async name => {
    const { file, metadata, groups } = await gbaFile(name);
    const hitsRG = groups.filter(g => {
      const s = g.st;
      if (!s.xmin || s.xmin.min_value == null) return true;
      return s.xmin.min_value < east && s.xmax.max_value > west && s.ymin.min_value < north && s.ymax.max_value > south;
    });
    await Promise.all(hitsRG.map(g => parquetRead({
      file, metadata, compressors, rowStart: g.start, rowEnd: g.end,
      columns: ['source', 'height', 'bbox', 'geometry'], rowFormat: 'object',
      onComplete: rows => {
        for (const r of rows) {
          const b = r.bbox;
          if (b && b.xmin < east && b.xmax > west && b.ymin < north && b.ymax > south && r.geometry && r.geometry.coordinates) out.push(r);
        }
      }
    })));
  }));
  return out;
}
const pc = PcNs.default || PcNs;

const FALLBACK_RELEASE = '2026-10-21.0';
const KY = 110574; // metre / derece (enlem)

let releasePromise;
export function getRelease() {
  if (!releasePromise) {
    releasePromise = fetch('https://stac.overturemaps.org/catalog.json')
      .then(r => r.json())
      .then(j => j.latest || FALLBACK_RELEASE)
      .catch(() => FALLBACK_RELEASE);
  }
  return releasePromise;
}

const archives = {};
async function archive(theme) {
  const rel = await getRelease();
  if (!archives[theme]) archives[theme] = new PMTiles(`https://tiles.overturemaps.org/${rel}/${theme}.pmtiles`);
  return archives[theme];
}

const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z);
};
const x2lon = (x, z) => x / 2 ** z * 360 - 180;
const y2lat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * 180 / Math.PI;

// ---------- geometri yardımcıları ----------
function mpBBox(mp) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const poly of mp) for (const p of poly[0]) {
    if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0];
    if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1];
  }
  return [a, b, c, d];
}
function lineBBox(l) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of l) {
    if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0];
    if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1];
  }
  return [a, b, c, d];
}
const hits = (bb, r) => bb[0] <= r[2] && bb[2] >= r[0] && bb[1] <= r[3] && bb[3] >= r[1];

export function ringArea(ring) {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(s / 2);
}

// Cohen–Sutherland ile çoklu çizgi kırpma
function clipLine(line, r) {
  const [x0, y0, x1, y1] = r;
  const code = (x, y) => (x < x0 ? 1 : x > x1 ? 2 : 0) | (y < y0 ? 4 : y > y1 ? 8 : 0);
  const out = [];
  let cur = null;
  for (let i = 0; i < line.length - 1; i++) {
    let [ax, ay] = line[i], [bx, by] = line[i + 1];
    let ca = code(ax, ay), cb = code(bx, by), ok = false;
    const bClipped0 = cb !== 0;
    for (let k = 0; k < 8; k++) {
      if (!(ca | cb)) { ok = true; break; }
      if (ca & cb) break;
      const c = ca || cb;
      let x, y;
      if (c & 8) { x = ax + (bx - ax) * (y1 - ay) / (by - ay); y = y1; }
      else if (c & 4) { x = ax + (bx - ax) * (y0 - ay) / (by - ay); y = y0; }
      else if (c & 2) { y = ay + (by - ay) * (x1 - ax) / (bx - ax); x = x1; }
      else { y = ay + (by - ay) * (x0 - ax) / (bx - ax); x = x0; }
      if (c === ca) { ax = x; ay = y; ca = code(ax, ay); }
      else { bx = x; by = y; cb = code(bx, by); }
    }
    if (!ok) { cur = null; continue; }
    if (!cur) { cur = [[ax, ay]]; out.push(cur); }
    cur.push([bx, by]);
    if (bClipped0) cur = null;
  }
  return out.filter(l => l.length > 1);
}

const num = v => (typeof v === 'number' && isFinite(v) ? v : (v != null && v !== '' && isFinite(+v) ? +v : null));
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

function unionParts(parts) {
  if (parts.length === 1) return parts[0];
  try { return pc.union(parts[0], ...parts.slice(1)); }
  catch (e) { return parts.flat(); }
}
function clipToRect(mp, r) {
  const bb = mpBBox(mp);
  if (bb[0] >= r[0] && bb[1] >= r[1] && bb[2] <= r[2] && bb[3] <= r[3]) return mp;
  const rect = [[[[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]], [r[0], r[1]]]]];
  try { return pc.intersection(mp, rect); }
  catch (e) { return mp; }
}

/**
 * Verilen merkez ve boyut (metre) için alan verisini indirir.
 * Koordinatlar yerel metre sistemindedir: x doğu, y kuzey, orijin alan merkezi.
 */
export async function loadArea({ lat, lon, w, h }, onProgress = () => {}) {
  const kx = 111320 * Math.cos(lat * Math.PI / 180);
  const hw = w / 2, hh = h / 2;
  const west = lon - hw / kx, east = lon + hw / kx, south = lat - hh / KY, north = lat + hh / KY;
  const proj = p => [Math.round((p[0] - lon) * kx * 100) / 100, Math.round((p[1] - lat) * KY * 100) / 100];
  const rect = [-hw, -hh, hw, hh];

  const jobs = [];
  for (const [theme, z] of [['buildings', 14], ['transportation', 14], ['base', 13]]) {
    for (let x = lon2x(west, z); x <= lon2x(east, z); x++)
      for (let y = lat2y(north, z); y <= lat2y(south, z); y++) jobs.push({ theme, z, x, y });
  }
  let done = 0;
  const total = jobs.length + 1;
  const _op = onProgress;
  onProgress = d => _op(d, total);
  const gbaP = loadGBA(west, south, east, north).then(r => { onProgress(++done); return r; }, e => { console.warn('GBA okunamadı', e); onProgress(++done); return null; });
  onProgress(0);
  const tiles = await Promise.all(jobs.map(async j => {
    try {
      const a = await archive(j.theme);
      const r = await a.getZxy(j.z, j.x, j.y);
      j.vt = r && r.data ? new VectorTile(new Pbf(new Uint8Array(r.data))) : null;
    } catch (e) { j.vt = null; j.err = e; }
    onProgress(++done);
    return j;
  }));
  if (tiles.every(t => t.err)) throw new Error('Veri sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edin.');

  const polys = { building: new Map(), part: new Map(), green: new Map(), water: new Map(), landuse: new Map() };
  const roads = [], waterLines = [], stops = [];
  const addPoly = (store, id, mp, attrs) => {
    if (!mp.length || !hits(mpBBox(mp), rect)) return;
    const e = store.get(id);
    if (e) e.parts.push(mp); else store.set(id, { ...attrs, parts: [mp] });
  };
  const toMP = g => {
    const src = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
    if (!src) return null;
    return src.map(poly => poly.map(ring => ring.map(proj))).filter(poly => poly[0] && poly[0].length >= 4);
  };
  const toLines = g => {
    const src = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : null;
    return src ? src.map(l => l.map(proj)) : null;
  };

  for (const t of tiles) {
    if (!t.vt) continue;
    // karo sınırı: tampon bölgedeki çift çizgileri önlemek için
    const tl = proj([x2lon(t.x, t.z), y2lat(t.y, t.z)]), br = proj([x2lon(t.x + 1, t.z), y2lat(t.y + 1, t.z)]);
    const lineRect = [Math.max(rect[0], tl[0]), Math.max(rect[1], br[1]), Math.min(rect[2], br[0]), Math.min(rect[3], tl[1])];
    const each = (layerName, fn) => {
      const L = t.vt.layers[layerName];
      if (!L) return;
      for (let i = 0; i < L.length; i++) {
        const f = L.feature(i);
        let g;
        try { g = f.toGeoJSON(t.x, t.y, t.z).geometry; } catch (e) { continue; }
        if (g) fn(f.properties, g, i);
      }
    };

    if (t.theme === 'buildings') {
      each('building', (p, g, i) => {
        const mp = toMP(g); if (!mp) return;
        if (p.is_underground === true) return;
        addPoly(polys.building, p.id || `b${t.x}_${t.y}_${i}`, mp, {
          height: num(p.height), floors: num(p.num_floors), subtype: p.subtype || null, cls: p.class || null,
          name: p['@name'] || null, hasParts: p.has_parts === true, roofColor: p.roof_color || null
        });
      });
      each('building_part', (p, g, i) => {
        const mp = toMP(g); if (!mp) return;
        addPoly(polys.part, p.id || `p${t.x}_${t.y}_${i}`, mp, {
          buildingId: p.building_id || null, height: num(p.height), floors: num(p.num_floors), minHeight: num(p.min_height) || 0
        });
      });
    } else if (t.theme === 'transportation') {
      each('segment', (p, g) => {
        if (p.subtype !== 'road' && p.subtype !== 'rail') return;
        const lines = toLines(g); if (!lines) return;
        for (const l of lines) {
          if (!hits(lineBBox(l), lineRect)) continue;
          for (const c of clipLine(l, lineRect)) roads.push({ coords: c, subtype: p.subtype, cls: p.class || 'unknown', name: p['@name'] || null });
        }
      });
    } else {
      each('water', (p, g, i) => {
        const mp = toMP(g);
        if (mp) { addPoly(polys.water, p.id || `w${t.x}_${t.y}_${i}`, mp, { subtype: p.subtype }); return; }
        const lines = toLines(g);
        if (lines && (p.subtype === 'stream' || p.subtype === 'canal')) {
          for (const l of lines) if (hits(lineBBox(l), lineRect))
            for (const c of clipLine(l, lineRect)) waterLines.push({ coords: c, subtype: p.subtype });
        }
      });
      each('land', (p, g, i) => {
        if (!['forest', 'grass', 'shrub', 'wetland', 'tree', 'moss'].includes(p.subtype)) return;
        const mp = toMP(g); if (!mp) return;
        addPoly(polys.green, p.id || `l${t.x}_${t.y}_${i}`, mp, { kind: p.subtype === 'forest' ? 'orman' : 'cim' });
      });
      each('land_use', (p, g, i) => {
        const mp = toMP(g); if (!mp) return;
        const id = p.id || `u${t.x}_${t.y}_${i}`;
        addPoly(polys.landuse, id, mp, { subtype: p.subtype || 'other', cls: p.class || null });
        if (['park', 'horticulture', 'managed', 'recreation', 'golf', 'cemetery', 'protected'].includes(p.subtype))
          addPoly(polys.green, 'g' + id, mp, { kind: 'park' });
        else if (p.subtype === 'agriculture') addPoly(polys.green, 'g' + id, mp, { kind: 'tarim' });
      });
      each('infrastructure', (p, g) => {
        if (g.type !== 'Point') return;
        if (p.subtype !== 'transit') return;
        if (!['bus_stop', 'railway_station', 'subway_station', 'railway_halt', 'ferry_terminal', 'bus_station'].includes(p.class)) return;
        const q = proj(g.coordinates);
        if (q[0] >= lineRect[0] && q[0] < lineRect[2] && q[1] >= lineRect[1] && q[1] < lineRect[3])
          stops.push({ p: q, cls: p.class, name: p['@name'] || null });
      });
    }
  }

  // ----- sonlandırma -----
  const inRect = mp => {
    const bb = mpBBox(mp), cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
    return cx >= rect[0] && cx <= rect[2] && cy >= rect[1] && cy <= rect[3];
  };
  const partOwners = new Set();
  const parts = [];
  for (const [id, e] of polys.part) {
    const mp = unionParts(e.parts);
    if (!mp.length || !inRect(mp)) continue;
    if (e.buildingId) partOwners.add(e.buildingId);
    const height = e.height || (e.floors ? e.floors * 3.2 : null);
    if (!height) continue;
    parts.push({ id, mp, height, minHeight: Math.min(e.minHeight, height - 0.5), buildingId: e.buildingId });
  }
  const builtPartOwners = new Set(parts.map(p => p.buildingId));
  const buildings = [];
  for (const [id, e] of polys.building) {
    const mp = unionParts(e.parts);
    if (!mp.length || !inRect(mp)) continue;
    let area = 0;
    for (const poly of mp) area += ringArea(poly[0]);
    if (area < 4) continue;
    let height = e.height, est = false;
    if (!height || height < 2.5) {
      if (e.floors) height = e.floors * 3.2;
      else {
        est = true;
        const r = hash01(String(id));
        height = area < 60 ? 3.5 : area < 160 ? 6.4 + Math.round(r * 2) * 3.2 : 9.6 + Math.round(r * 3) * 3.2;
      }
    }
    buildings.push({
      id, mp, area, height: Math.round(height * 10) / 10, est, floors: e.floors, subtype: e.subtype, cls: e.cls, name: e.name,
      usesParts: e.hasParts && builtPartOwners.has(id)
    });
  }
  const finish = store => {
    const out = [];
    for (const [, e] of store) {
      const mp = clipToRect(unionParts(e.parts), rect);
      if (mp && mp.length) { const { parts: _p, ...rest } = e; out.push({ ...rest, mp }); }
    }
    return out;
  };
  const green = finish(polys.green), water = finish(polys.water), landuse = finish(polys.landuse);

  // ----- GlobalBuildingAtlas ile birleştirme -----
  const gbaRows = await gbaP;
  let finalBuildings = buildings, finalParts = parts, source = 'Overture Maps';
  const counts = { gba: 0, overture: buildings.length, eklenen: 0 };
  if (gbaRows && gbaRows.length) {
    const gb = [];
    gbaRows.forEach((r, i) => {
      const mp = toMP(r.geometry);
      if (!mp || !mp.length || !inRect(mp)) return;
      let area = 0;
      for (const poly of mp) area += ringArea(poly[0]);
      if (area < 4) return;
      let height = num(r.height), est = false;
      if (!height || height < 2 || height > 900) { est = true; height = area < 60 ? 3.5 : area < 160 ? 6.4 : 9.6; }
      gb.push({ id: 'gba' + i, mp, area, height: Math.round(height * 10) / 10, est, floors: null, subtype: null, cls: null, name: null, usesParts: false, bb: mpBBox(mp), src: 'gba' });
    });
    if (gb.length) {
      const CELL = 40, grid = new Map();
      const cells = bb => {
        const out = [];
        for (let x = Math.floor(bb[0] / CELL); x <= Math.floor(bb[2] / CELL); x++)
          for (let y = Math.floor(bb[1] / CELL); y <= Math.floor(bb[3] / CELL); y++) out.push(x + ':' + y);
        return out;
      };
      gb.forEach((b, i) => { for (const k of cells(b.bb)) { const a = grid.get(k); if (a) a.push(i); else grid.set(k, [i]); } });
      // Elle çizilmiş (ince ayrıntılı) Overture binaları korunur; yüksekliği olmayanlara
      // GBA yüksekliği aktarılır. Overture'ın boş bıraktığı yerler GBA binalarıyla doldurulur.
      const covered = new Float64Array(gb.length);
      for (const ob of buildings) {
        const bb = mpBBox(ob.mp);
        let best = -1, bestA = 0;
        const seen = new Set();
        for (const k of cells(bb)) for (const i of grid.get(k) || []) {
          if (seen.has(i)) continue; seen.add(i);
          const g = gb[i].bb;
          const ix = Math.min(bb[2], g[2]) - Math.max(bb[0], g[0]), iy = Math.min(bb[3], g[3]) - Math.max(bb[1], g[1]);
          if (ix <= 0 || iy <= 0) continue;
          covered[i] += ix * iy;
          if (ix * iy > bestA) { bestA = ix * iy; best = i; }
        }
        if (best >= 0 && ob.est && !gb[best].est) { ob.height = gb[best].height; ob.est = false; }
      }
      const extra = gb.filter((g, i) => covered[i] / Math.max(1, (g.bb[2] - g.bb[0]) * (g.bb[3] - g.bb[1])) < 0.3);
      counts.gba = gb.length; counts.eklenen = extra.length;
      finalBuildings = buildings.concat(extra);
      source = 'Overture Maps + GlobalBuildingAtlas';
    }
  }

  return {
    meta: { lat, lon, w, h, release: await getRelease(), west, east, south, north, source, counts },
    buildings: finalBuildings, parts: finalParts, roads, green, water, waterLines, landuse, stops
  };
}
