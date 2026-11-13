// archtools · Kent Dokusu - alan seçim haritası (Leaflet sarmalayıcısı)
// Altlık: Esri sokak ve uydu karoları. (OpenStreetMap karo sunucusu Referer başlığı ister;
// site Referrer-Policy: no-referrer ile yayınlandığı için kullanılmaz.)
import L from 'leaflet';

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';

function ensureCss() {
  if (document.getElementById('kent-leaflet-css')) return;
  const l = document.createElement('link');
  l.id = 'kent-leaflet-css';
  l.rel = 'stylesheet';
  l.href = new URL('./leaflet-1.9.4.css', import.meta.url).href;
  document.head.appendChild(l);
}

export function createMap(el, o) {
  ensureCss();
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView([o.lat, o.lon], o.zoom || 15);
  map.attributionControl.setPrefix(false);
  const layers = {
    sokak: L.tileLayer(ESRI + 'World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Altlık: Esri, HERE, Garmin' }),
    uydu: L.tileLayer(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Uydu: Esri, Maxar, Earthstar Geographics' })
  };
  let base = null;
  const setBase = (k) => { if (base) map.removeLayer(base); base = layers[k] || layers.sokak; base.addTo(map); };
  setBase(o.base || 'sokak');
  const frame = L.rectangle([[0, 0], [0, 0]], { color: '#17181B', weight: 2, fillOpacity: 0.08, interactive: false }).addTo(map);
  let w = o.w || 750, h = o.h || 750;
  const upd = () => {
    const c = map.getCenter();
    const dLat = h / 2 / 110574, dLon = w / 2 / (111320 * Math.cos(c.lat * Math.PI / 180));
    frame.setBounds([[c.lat - dLat, c.lng - dLon], [c.lat + dLat, c.lng + dLon]]);
  };
  map.on('move', upd);
  map.on('moveend', () => { const c = map.getCenter(); if (o.onMove) o.onMove(c.lat, c.lng); });
  upd();
  return {
    el,
    center: () => { const c = map.getCenter(); return { lat: c.lat, lon: c.lng }; },
    setView: (lat, lon, z) => map.setView([lat, lon], z || map.getZoom()),
    setFrame: (a, b) => { w = a; h = b; upd(); },
    setBase,
    invalidate: () => map.invalidateSize(),
    remove: () => map.remove()
  };
}
