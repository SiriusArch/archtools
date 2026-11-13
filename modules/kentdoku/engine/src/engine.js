// archtools · Kent Dokusu - motor giriş noktası
// Uygulama paketi (klasik betik) bu ES modülünü yalnızca modül açıldığında dinamik olarak yükler:
//   import(App.config.kent.engine)
// Böylece İşlev Şeması kullanıcıları harita/3B kodunu indirmez.
export { loadArea } from './data.js';
export { buildSVG, DEFAULT_LAYERS } from './render2d.js';
export { STYLES } from './styles.js';
export * as X from './export.js';
export * as Site from './site.js';
export { createMap } from './mapview.js';

/** three.js ve 3B görünüm ayrı bir parçadır; yalnızca 3B sekmesi ya da OBJ/GLB/STL istenince yüklenir. */
export const load3d = () => import('./view3d.js');

/** Adres araması: Nominatim, olmazsa Photon. Sonuç: [{ name, label, lat, lon }] */
export async function geocode(q) {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(q);
  if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return [{ name: (+m[1]).toFixed(4) + ', ' + (+m[2]).toFixed(4), label: 'Koordinat', lat: +m[1], lon: +m[2] }];
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=tr&q=' + encodeURIComponent(q));
    if (!r.ok) throw new Error(String(r.status));
    const list = await r.json();
    return list.map((it) => ({ name: it.display_name.split(',')[0], label: it.display_name, lat: +it.lat, lon: +it.lon }));
  } catch (e) {
    const r = await fetch('https://photon.komoot.io/api/?limit=6&q=' + encodeURIComponent(q));
    if (!r.ok) throw new Error('Arama servisine ulaşılamadı');
    const j = await r.json();
    return (j.features || []).map((f) => {
      const p = f.properties || {};
      return { name: p.name || p.street || p.city || q, label: [p.name, p.district, p.city, p.state, p.country].filter(Boolean).join(', '), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
    });
  }
}
