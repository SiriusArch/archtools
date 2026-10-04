/* ==========================================================================
   37-lib-z-here.js — HERE Platform veri kaynağı (isteğe bağlı; OpenStreetMap yerine ya da yanında)
   Dosya adındaki "z", bu dosyanın 37-lib-osm.js'ten SONRA yüklenmesini sağlar (osm.* sarılır).

   RESMÎ YOL: yalnızca HERE Platform API'leri + kullanıcının KENDİ API anahtarı kullanılır.
   wego.here.com tüketici sitesidir; sayfası kazınmaz, dahili uç noktaları kullanılmaz.
   Anahtar yalnızca bu tarayıcının localStorage'ında ('archtools.here.key') tutulur; proje JSON'una,
   paylaşım bağlantısına, önbelleğe ya da herhangi bir dışa aktarmaya YAZILMAZ.

   DÜRÜSTLÜK NOTU (geliştirme ortamı): bu dosya yazılırken HERE'e CANLI ÇAĞRI YAPILAMADI (ağ kapalı, anahtar yok).
   Tüm biçimler HERE belgelerine göre ELLE yazıldı ve sentetik örneklerle (fixture) sınandı. Özellikle
   (1) vektör karo katman/özellik adları, (2) kategori kimlikleri, (3) CORS davranışı gerçek HERE ile doğrulanmadı;
   bu yüzden eşleme tabloları dosyanın üstünde tek yerde toplanmıştır ve bilinmeyen anahtarlar sessizce atlanır.
   Karolardan bina VE yol hiç gelmezse geometri için Overpass'a düşülür (kaynak 'here+osm').

   Veri modeli osm.parse çıktısıyla BİREBİR aynıdır (yerel metre, x doğu / y kuzey):
     { lat0, lon0, R, t, buildings, roads, rails, green, landuse, water, poi, transit, hereMeta }
   Kullanılan HERE hizmetleri:
     Vector Tile API v2 (OMV/MVT) · Geocoding & Search v1 (geocode, revgeocode, browse) · Isoline Routing v8
   Lisans: HERE koşulları verinin CAD/GIS'e aktarılması ve önbelleğe alınması konusunda kısıtlar içerebilir.
   ========================================================================== */
(function () {
  const App = window.App;
  const gis = App.gis;
  const osm = App.osm;
  const U = App.util;
  const here = (App.here = {});
  const D2R = Math.PI / 180;
  const r1 = (v) => Math.round(v * 10) / 10;

  here.ATTRIBUTION = '© HERE';
  here.NOTE = 'HERE verisi, kendi API anahtarınızla ve HERE hizmet koşulları çerçevesinde kullanılır. Bu koşullar verinin CAD/GIS ortamına aktarılmasını, dışa aktarılmasını ya da önbelleğe alınmasını kısıtlayabilir; dışa aktarmadan önce kendi anahtarınızın koşullarını kontrol edin. Anahtarınız yalnızca bu tarayıcıda saklanır; proje dosyasına, paylaşım bağlantısına ya da dışa aktarmalara yazılmaz.';
  if (App.KB && App.KB.SOURCES) {
    App.KB.SOURCES['HERE'] = { label: 'HERE Platform (kullanıcının kendi API anahtarıyla) — vektör karo, işlev noktaları, yürüme izolinleri · © HERE', kind: 'Ticari veri', trust: 'orta-yüksek' };
  }

  /* ==========================================================================
     ŞEMA EŞLEME TABLOLARI — HERE sürümüne göre değişebilir; düzeltme gerekirse yalnızca burası değişir.
     Varsayım: HERE Vector Tile API v2 "base" (OMV) katmanları Tilezen/OSM benzeri bir şema izler
     (roads: kind + kind_detail, buildings: height / render_height, water, landuse…). DOĞRULANMADI.
     ========================================================================== */
  // katman adı → rol (ilk eşleşen kazanır; null = yok say). Adı etiket/sınır/POI içerenler elenir.
  const LAYER_ROLES = [
    [/label|housenumber|address|boundar|admin|^places?$|^pois?$|^earth$/, null],
    [/building/, 'buildings'],
    [/^roads?$|^road_|_roads?$|street|transportation|^highways?$/, 'roads'],
    [/^transit|^rail/, 'transit'],
    [/^landuse|^landcover|^natural|^parks?$/, 'landuse'],
    [/^water|^hydro/, 'water'],
  ];

  // özellik anahtarı adayları (sıra önemli: ayrıntılı olan önce)
  const KEYS = {
    kind: ['kind_detail', 'kind', 'class', 'subclass', 'type'],
    name: ['name', 'name:tr', 'name_tr', 'name:en', 'name_en'],
    id: ['id', 'osm_id', 'building_id'],
    height: ['height', 'building:height', 'building_height', 'render_height'],
    minHeight: ['min_height', 'render_min_height', 'building:min_height'],
    levels: ['building:levels', 'building_levels', 'levels', 'building:levels:aboveground'],
    tunnel: ['is_tunnel', 'tunnel'],
    bridge: ['is_bridge', 'bridge'],
  };

  // yol kind / kind_detail → osm yol sınıfı (37-lib-osm.js ROAD ile aynı değer kümesi)
  const ROAD_MAP = {
    motorway: 'motorway', motorway_link: 'motorway', freeway: 'motorway', expressway: 'motorway',
    trunk: 'trunk', trunk_link: 'trunk', highway: 'trunk',
    primary: 'primary', primary_link: 'primary', major_road: 'secondary',
    secondary: 'secondary', secondary_link: 'secondary',
    tertiary: 'tertiary', tertiary_link: 'tertiary',
    residential: 'residential', unclassified: 'residential', minor_road: 'residential', minor: 'residential', local: 'residential', road: 'residential',
    living_street: 'living', living: 'living',
    service: 'service', driveway: 'service', parking_aisle: 'service', alley: 'service', drive_through: 'service', emergency_access: 'service',
    pedestrian: 'pedestrian', pedestrian_street: 'pedestrian', plaza: 'pedestrian',
    footway: 'footway', footpath: 'footway', corridor: 'footway', pedestrian_path: 'footway',
    cycleway: 'cycleway', bicycle: 'cycleway', bike_path: 'cycleway',
    steps: 'steps', stairs: 'steps',
    path: 'path', trail: 'path', bridleway: 'path',
    track: 'track', unpaved: 'track',
  };
  const ROAD_SKIP = { sidewalk: 1, crossing: 1, ferry: 1, aerialway: 1, ski: 1, ford: 1, construction: 1, proposed: 1, planned: 1 };
  // demiryolu / tramvay → osm rails.kind (rail, light_rail, subway, tram, narrow_gauge)
  const RAIL_MAP = { rail: 'rail', train: 'rail', light_rail: 'light_rail', subway: 'subway', metro: 'subway', tram: 'tram', tramway: 'tram', narrow_gauge: 'narrow_gauge', monorail: 'light_rail', funicular: 'narrow_gauge' };

  // arazi: kind → yeşil (osm kind adıyla) / pub = herkese açık park
  const GREEN_MAP = {
    park: 'park', urban_park: 'park', garden: 'garden', playground: 'playground', common: 'common', dog_park: 'dog_park', recreation_ground: 'recreation_ground', golf_course: 'recreation_ground',
    nature_reserve: 'nature_reserve', national_park: 'nature_reserve', forest: 'forest', wood: 'wood', woodland: 'wood', grass: 'grass', meadow: 'meadow', village_green: 'village_green',
    cemetery: 'cemetery', allotments: 'allotments', orchard: 'orchard', vineyard: 'vineyard', flowerbed: 'flowerbed', greenfield: 'greenfield', scrub: 'scrub', grassland: 'grassland', wetland: 'wetland',
  };
  const GREEN_PUB = { park: 1, garden: 1, playground: 1, common: 1 };
  const PARK_POI = { park: 'Park', garden: 'Park', playground: 'Oyun alanı', common: 'Park' };
  // arazi kullanımı: kind → osm.USE_LABEL anahtarı
  const USE_MAP = {
    residential: 'konut', commercial: 'ticari', retail: 'ticari', industrial: 'sanayi', institutional: 'kamu', education: 'kamu', school: 'kamu', university: 'kamu', college: 'kamu',
    hospital: 'kamu', military: 'kamu', religious: 'kamu', railway: 'ulasim', garages: 'ulasim', parking: 'ulasim', aerodrome: 'ulasim', construction: 'yapim', brownfield: 'yapim',
  };
  // su
  const WATER_SEA = { ocean: 1, sea: 1, bay: 1, strait: 1, gulf: 1 };
  const WATER_LINE = { river: 'river', stream: 'stream', canal: 'canal', ditch: 'stream', drain: 'stream', brook: 'stream', creek: 'stream' };

  // HERE kategori kimliği (Browse) → grup. Yalnızca ÖN EKİ bilinenler; emin olunmayanlar iddia edilmez, ad sözcüklerine bakılır.
  const CAT_PREFIX = [
    ['100-1100', 'yeme', 'Kafe'], ['100', 'yeme', null],           // 100 = yeme-içme
    ['800-8000', 'saglik', 'Sağlık'], ['800-8200', 'egitim', 'Eğitim'],
  ];
  const TRANSIT_PREFIX = '400-4100';                                // toplu taşıma
  // üst düzey kategori grupları (her biri ayrı sorgu, limit 100)
  const BROWSE_GROUPS = [
    { id: 'alisveris', cats: '600', def: 'alisveris' },
    { id: 'yeme', cats: '100', def: 'yeme' },
    { id: 'saglik-egitim', cats: '800', def: null },
    { id: 'rekreasyon', cats: '550', def: 'rekreasyon' },
    { id: 'kultur', cats: '300,200', def: 'kultur' },
    { id: 'hizmet', cats: '700', def: null },
    { id: 'ulasim', cats: '400', def: null },
  ];
  // ad / kategori adı sözcükleri (Türkçe + İngilizce; metin U.norm ile sadeleştirilmiş: ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u)
  const KW = [
    [/\b(anaokul|kindergarten|nursery)/, 'egitim', 'Anaokulu'], [/\b(kres|creche|daycare)/, 'egitim', 'Kreş'],
    [/\b(universite|university)/, 'egitim', 'Üniversite'], [/\b(kolej|college)/, 'egitim', 'Kolej'],
    [/\b(okul|school|lise\b|ilkokul|ortaokul|dershane|akademi|academy)/, 'egitim', 'Okul'],
    [/\b(hastane|hospital)/, 'saglik', 'Hastane'], [/\b(dis hekim|dentist|dental|agiz ve dis)/, 'saglik', 'Diş hekimi'],
    [/\b(klinik|clinic|poliklinik|saglik|medical|health|tip merkezi|doktor|doctor|laboratuvar|laboratory)/, 'saglik', 'Klinik'],
    [/\b(eczane|pharmacy|drugstore)/, 'gunluk', 'Eczane'], [/\b(firin|bakery|ekmek)/, 'gunluk', 'Fırın'],
    [/\b(manav|greengrocer)/, 'gunluk', 'Manav'], [/\b(kasap|butcher)/, 'gunluk', 'Kasap'],
    [/\b(bakkal|grocery|convenience|bufe|kiosk|tekel|sarkuteri|kuruyemis|pazar\b)/, 'gunluk', 'Bakkal / market'],
    [/\b((super)?market(?!ing)|migros|carrefour|bim\b|a101\b|lidl|aldi\b|tesco|rewe|edeka)/, 'gunluk', 'Market'],
    [/\b(fast food|burger|doner|pizza|kumpir|waffle)/, 'yeme', 'Fast food'],
    [/\b(kafe|cafe|kahve|coffee|pastane|patisserie|cay evi|dondurma|ice cream)/, 'yeme', 'Kafe'],
    [/\b(bar\b|pub\b|meyhane|nightclub|gece kulubu)/, 'yeme', 'Bar'],
    [/\b(restoran|restaurant|lokanta|kebap|kebab|pide\b|kofte|bistro|brasserie|steakhouse|sushi|balik)/, 'yeme', 'Restoran'],
    [/\b(cami\b|camii|mescit|mosque|kilise|church|sinagog|synagogue|temple|ibadet)/, 'kultur', 'İbadethane'],
    [/\b(muze|museum)/, 'kultur', 'Müze'], [/\b(galeri|gallery)/, 'kultur', 'Galeri'], [/\b(kutuphane|library)/, 'kultur', 'Kütüphane'],
    [/\b(sinema|cinema)/, 'kultur', 'Sinema'], [/\b(tiyatro|theat|opera|konser)/, 'kultur', 'Tiyatro'],
    [/\b(kultur|cultural|sanat|arts? cent)/, 'kultur', 'Sanat merkezi'],
    [/\b(banka|bank\b|bankasi)/, 'hizmet', 'Banka'], [/\batm\b/, 'hizmet', 'ATM'], [/\b(postane|ptt\b|post office)/, 'hizmet', 'Postane'],
    [/\b(belediye|municipal|town hall|kaymakam|valilik|vergi dairesi|nufus mudur)/, 'hizmet', 'Belediye'],
    [/\b(polis|police)/, 'hizmet', 'Polis'], [/\b(itfaiye|fire station)/, 'hizmet', 'İtfaiye'], [/\b(adliye|court)/, 'hizmet', 'Adliye'],
    [/\b(oyun alan|playground)/, 'rekreasyon', 'Oyun alanı'], [/\b(fitness|gym\b|spor salon|spor merkez)/, 'rekreasyon', 'Spor salonu'],
    [/\b(stadyum|stadium|hali saha|pitch|yuzme|swimming|havuz|tenis|tennis|basketbol|futbol|golf|spor|sport)/, 'rekreasyon', 'Spor merkezi'],
    [/\b(park\b|parki|bahce|garden|mesire)/, 'rekreasyon', 'Park'],
    [/\b(magaza|store|shop|avm|alisveris merkez|mall|butik|giyim|ayakkabi|clothing|elektronik|electronics|kitap|book|kirtasiye|optik|mobilya|furniture)/, 'alisveris', 'Mağaza'],
  ];
  const KW_EXCLUDE = /\b(otopark|parking|car park|vale)\b/;
  // toplu taşıma türü (ad / kategori adı sözcükleri; sıra önemli)
  const TRANSIT_KW = [
    [/\b(metro|subway|underground|rayli sistem)/, 'metro'], [/\b(tramvay|tram\b|light rail)/, 'tramvay'],
    [/\b(iskele|vapur|ferry|feribot|pier|deniz otobus)/, 'vapur'], [/\b(otobus|bus\b|durak|dolmus|minibus|metrobus)/, 'otobus'],
    [/\b(tren|train|rail|railway|istasyon|station|gar\b|marmaray|banliyo)/, 'tren'],
  ];

  here.MAP = { LAYER_ROLES: LAYER_ROLES, KEYS: KEYS, ROAD_MAP: ROAD_MAP, RAIL_MAP: RAIL_MAP, GREEN_MAP: GREEN_MAP, USE_MAP: USE_MAP, CAT_PREFIX: CAT_PREFIX, BROWSE_GROUPS: BROWSE_GROUPS };
  here.TILE_OPTS = { z: 16, maxTiles: 9, concurrency: 4 };
  here.TIMEOUT = { tile: 20000, api: 15000 };

  /* ==========================================================================
     AYARLAR (anahtar + kaynak seçimi) — yalnızca localStorage; her erişim try/catch
     ========================================================================== */
  const LS_KEY = 'archtools.here.key', LS_SRC = 'archtools.geo.source';
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) { /* özel pencere / kota */ } };
  const lsDel = (k) => { try { window.localStorage.removeItem(k); } catch (e) { /* yok say */ } };

  here.getKey = () => String(lsGet(LS_KEY) || '').trim();
  here.setKey = function (k) {
    k = String(k == null ? '' : k).trim();
    if (!k) lsDel(LS_KEY); else lsSet(LS_KEY, k);
    return k;
  };
  here.source = () => (lsGet(LS_SRC) === 'here' ? 'here' : 'osm');
  here.setSource = function (s) { const v = s === 'here' ? 'here' : 'osm'; lsSet(LS_SRC, v); return v; };
  here.active = () => here.source() === 'here' && !!here.getKey();
  // yalnızca biçim sezgisi (gerçek doğrulama HERE'in 401/403 yanıtıdır)
  here.keyOk = (k) => /^[A-Za-z0-9_-]{20,80}$/.test(String(k == null ? '' : k).trim());

  function needKey() {
    const k = here.getKey();
    if (!k) { const e = new Error('HERE API anahtarı girilmedi. Ayarlardan kendi HERE API anahtarınızı ekleyin.'); e.fatal = true; throw e; }
    return k;
  }
  // hata iletilerinden anahtarı temizle (savunma: iletiler zaten URL içermez)
  const redact = (m) => { const k = here.getKey(); return k ? String(m).split(k).join('…') : String(m); };

  /* ==========================================================================
     AĞ ALTYAPISI
     ========================================================================== */
  const netMsg = (e) => (osm.netMsg ? osm.netMsg(e) : String((e && e.message) || e));
  function herr(msg, fatal, status) { const e = new Error(msg); if (fatal) e.fatal = true; if (status) e.status = status; return e; }
  function httpError(status) {
    if (status === 401 || status === 403) return herr('HERE API anahtarı geçersiz ya da bu hizmet için yetkisiz', true, status);
    if (status === 429) return herr('HERE kotası doldu', true, status);
    return herr('HERE yanıtı: HTTP ' + status, false, status);
  }
  // ctx.controllers: önemli bir hata (anahtar/kota) olunca bekleyen isteklerin hepsini iptal etmek için
  function http(url, ms, ctx) {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ac && ctx) ctx.controllers.add(ac);
    const tm = setTimeout(function () { if (ac) ac.abort(); }, ms);
    const done = () => { clearTimeout(tm); if (ac && ctx) ctx.controllers.delete(ac); };
    return fetch(url, ac ? { signal: ac.signal } : undefined).then(
      (r) => { done(); return r; },
      (e) => { done(); throw herr('HERE sunucularına ulaşılamadı (' + redact(netMsg(e)) + ')', false); }
    );
  }
  const newCtx = () => ({ controllers: new Set(), aborted: false });
  function abortAll(ctx) { ctx.aborted = true; ctx.controllers.forEach((ac) => { try { ac.abort(); } catch (e) { /* yok say */ } }); }

  function jsonGet(url, ms, ctx) {
    return http(url, ms || here.TIMEOUT.api, ctx).then((r) => {
      if (!r.ok) throw httpError(r.status);
      return r.json().catch(() => { throw herr('HERE yanıtı çözülemedi (beklenmeyen biçim)', false); });
    });
  }
  const qs = (o) => Object.keys(o).filter((k) => o[k] != null).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(o[k])).replace(/%2C/gi, ',')).join('&');

  // en çok `limit` eşzamanlı; önemli (fatal) hata gelirse hemen reddeder
  function runPool(items, limit, worker, ctx) {
    return new Promise(function (resolve, reject) {
      const out = new Array(items.length);
      let next = 0, active = 0, finished = 0, dead = false;
      function pump() {
        if (dead) return;
        if (finished === items.length) { resolve(out); return; }
        while (active < limit && next < items.length && !ctx.aborted) {
          const idx = next++;
          active++;
          Promise.resolve().then(() => worker(items[idx], idx)).then(
            (v) => { out[idx] = v; },
            (e) => { out[idx] = { error: e }; if (e && e.fatal && !dead) { dead = true; abortAll(ctx); reject(e); } }
          ).then(() => { active--; finished++; pump(); });
        }
      }
      if (!items.length) { resolve(out); return; }
      pump();
    });
  }

  /* ==========================================================================
     FLEXIBLE POLYLINE (HERE) — https://github.com/heremaps/flexible-polyline
     Dizge: sürüm (varint=1) · başlık varint [bit0-3 duyarlık | bit4-6 3. boyut türü | bit7-10 3. boyut duyarlığı]
            · sonra her nokta için (enlem, boylam[, z]) FARKLARI: ×10^duyarlık yuvarla → zigzag → 5 bitlik gruplar (bit5 = devam)
     Tablo: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_
     32 bitlik taşma olmasın diye bit işlemi yerine aritmetik kullanılır.
     ========================================================================== */
  const FPL_T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const FPL_I = {};
  for (let i = 0; i < FPL_T.length; i++) FPL_I[FPL_T[i]] = i;
  const fpl = (here.fpl = {});
  fpl.THIRD = { ABSENT: 0, LEVEL: 1, ALTITUDE: 2, ELEVATION: 3 };

  function fplEncU(n) {
    let s = '';
    do { let c = n % 32; n = Math.floor(n / 32); if (n > 0) c += 32; s += FPL_T[c]; } while (n > 0);
    return s;
  }
  const fplEncS = (n) => fplEncU(n < 0 ? -2 * n - 1 : 2 * n);
  const fplRound = (v, f) => { const x = Math.abs(v) * f; const r = Math.floor(x + 0.5); return v < 0 ? -r : r; }; // 0'dan uzağa yarım yuvarlama

  function fplReader(str) {
    let pos = 0;
    return {
      eof: () => pos >= str.length,
      u: function () {
        let res = 0, mul = 1, more = true;
        while (more) {
          if (pos >= str.length) throw new Error('Flexible Polyline kesik');
          const v = FPL_I[str[pos++]];
          if (v === undefined) throw new Error('Flexible Polyline: geçersiz karakter');
          res += (v % 32) * mul; mul *= 32; more = v >= 32;
        }
        return res;
      },
    };
  }
  fpl.header = function (str) {
    const r = fplReader(String(str));
    const version = r.u(), h = r.u();
    return { version: version, precision: h % 16, thirdDim: Math.floor(h / 16) % 8, thirdPrecision: Math.floor(h / 128) % 16 };
  };
  // → [[lat, lng(, z)], …]
  fpl.decode = function (str) {
    str = String(str == null ? '' : str).trim();
    const r = fplReader(str);
    const version = r.u();
    if (version !== 1) throw new Error('Flexible Polyline sürümü desteklenmiyor: ' + version);
    const h = r.u();
    const prec = h % 16, third = Math.floor(h / 16) % 8, tprec = Math.floor(h / 128) % 16;
    const f = Math.pow(10, prec), f3 = Math.pow(10, tprec);
    const s = () => { const u = r.u(); return u % 2 === 0 ? u / 2 : -(u + 1) / 2; };
    const out = [];
    let la = 0, lo = 0, z = 0;
    while (!r.eof()) {
      la += s();
      if (r.eof()) throw new Error('Flexible Polyline kesik');
      lo += s();
      if (third) { if (r.eof()) throw new Error('Flexible Polyline kesik'); z += s(); out.push([la / f, lo / f, z / f3]); } else out.push([la / f, lo / f]);
    }
    return out;
  };
  // points: [[lat,lng(,z)]…] · 3. değer varsa türü varsayılan ALTITUDE (2)
  fpl.encode = function (points, precision, thirdDim, thirdPrecision) {
    precision = precision == null ? 5 : precision;
    const has3 = points.length > 0 && points[0].length > 2;
    thirdDim = has3 ? (thirdDim == null || thirdDim === 0 ? 2 : thirdDim) : 0;
    thirdPrecision = thirdPrecision || 0;
    if (precision < 0 || precision > 15 || thirdPrecision > 15) throw new Error('Flexible Polyline: duyarlık 0–15 olmalı');
    const f = Math.pow(10, precision), f3 = Math.pow(10, thirdPrecision);
    let s = fplEncU(1) + fplEncU(thirdPrecision * 128 + thirdDim * 16 + precision);
    let la = 0, lo = 0, z = 0;
    points.forEach((p) => {
      const a = fplRound(p[0], f), b = fplRound(p[1], f);
      s += fplEncS(a - la) + fplEncS(b - lo);
      la = a; lo = b;
      if (has3) { const c = fplRound(p[2] || 0, f3); s += fplEncS(c - z); z = c; }
    });
    return s;
  };

  /* ==========================================================================
     MAPBOX VECTOR TILE (protobuf) ÇÖZÜCÜ — bağımlılıksız
     Tile{3: Layer*} · Layer{15:version 1:name 2:Feature* 3:keys* 4:Value* 5:extent}
     Feature{1:id 2:tags(packed) 3:type 4:geometry(packed)} · Value{1:string 2:float 3:double 4:int 5:uint 6:sint 7:bool}
     Geometri: komut = (kimlik & 7) | (sayı << 3); 1 MoveTo, 2 LineTo, 7 ClosePath; parametreler zigzag farkları
     Çıktı: { layers: [{ name, extent, version, features: [{ id, type:'point'|'line'|'polygon', props,
              points | lines | polys:[{outer, inner[]}], rings (tüm halkalar, düz liste) }] }] }
     Koordinatlar karo birimindedir (0…extent, y aşağı). Poligon halkaları açık döner (ilk nokta sonda tekrarlanmaz).
     ========================================================================== */
  const mvt = (here.mvt = {});
  const TD = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  function utf8(b, s, e) {
    if (TD) return TD.decode(b.subarray(s, e));
    let out = '';
    for (let i = s; i < e;) {
      const c = b[i++];
      if (c < 0x80) out += String.fromCharCode(c);
      else if (c < 0xe0) out += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63));
      else if (c < 0xf0) out += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
      else { const cp = (((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63)) - 0x10000; out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023)); }
    }
    return out;
  }
  function Pbf(buf) { this.b = buf; this.p = 0; this.lo = 0; this.hi = 0; }
  // işaretsiz varint → Number (2^53'e kadar tam); this.lo / this.hi 64 bitin iki yarısını da tutar
  Pbf.prototype.varint = function () {
    const b = this.b;
    let lo = 0, hi = 0;
    for (let i = 0; i < 10; i++) {
      if (this.p >= b.length) throw new Error('MVT: veri kesik');
      const x = b[this.p++], v = x & 0x7f;
      if (i < 4) lo |= v << (7 * i);
      else if (i === 4) { lo |= (v & 0x0f) << 28; hi = (v >> 4) & 7; }
      else hi |= v << (7 * i - 32);
      if (!(x & 0x80)) break;
    }
    this.lo = lo >>> 0; this.hi = hi >>> 0;
    return this.hi * 4294967296 + this.lo;
  };
  Pbf.prototype.skip = function (wire) {
    if (wire === 0) this.varint();
    else if (wire === 2) { const n = this.varint(); this.p += n; }
    else if (wire === 1) this.p += 8;
    else if (wire === 5) this.p += 4;
    else throw new Error('MVT: desteklenmeyen protobuf alan türü');
    if (this.p > this.b.length) throw new Error('MVT: veri kesik');
  };
  function readMsg(r, end, onField) {
    while (r.p < end) {
      const key = r.varint(), tag = Math.floor(key / 8), wire = key % 8;
      onField(tag, wire);
    }
    if (r.p !== end) throw new Error('MVT: ileti sınırı bozuk');
  }
  function packedU(r, wire, into) {
    if (wire === 2) { const n = r.varint(), e = r.p + n; if (e > r.b.length) throw new Error('MVT: veri kesik'); while (r.p < e) into.push(r.varint()); }
    else into.push(r.varint());
  }
  function readValue(r, end) {
    let v = null;
    const dv = () => new DataView(r.b.buffer, r.b.byteOffset, r.b.byteLength);
    readMsg(r, end, function (tag, wire) {
      if (tag === 1 && wire === 2) { const n = r.varint(); v = utf8(r.b, r.p, r.p + n); r.p += n; }
      else if (tag === 2 && wire === 5) { v = dv().getFloat32(r.p, true); r.p += 4; }
      else if (tag === 3 && wire === 1) { v = dv().getFloat64(r.p, true); r.p += 8; }
      else if (tag === 4 && wire === 0) { r.varint(); v = (r.hi | 0) * 4294967296 + r.lo; }                    // int64 (iki tümleyen)
      else if (tag === 5 && wire === 0) { v = r.varint(); }                                                    // uint64
      else if (tag === 6 && wire === 0) { const u = r.varint(); v = u % 2 === 0 ? u / 2 : -(u + 1) / 2; }       // sint64 (zigzag)
      else if (tag === 7 && wire === 0) { v = r.varint() !== 0; }
      else r.skip(wire);
    });
    return v;
  }
  function readFeature(r, end) {
    const f = { id: null, tags: [], type: 0, geom: [] };
    readMsg(r, end, function (tag, wire) {
      if (tag === 1 && wire === 0) f.id = r.varint();
      else if (tag === 2 && (wire === 2 || wire === 0)) packedU(r, wire, f.tags);
      else if (tag === 3 && wire === 0) f.type = r.varint();
      else if (tag === 4 && (wire === 2 || wire === 0)) packedU(r, wire, f.geom);
      else r.skip(wire);
    });
    return f;
  }
  const ringArea = (p) => { let s = 0; for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  function decodeGeom(type, g) {
    const zz = (v) => (v % 2 === 0 ? v / 2 : -(v + 1) / 2);
    let i = 0, x = 0, y = 0, cur = null;
    const pts = [], parts = [];
    while (i < g.length) {
      const cmd = g[i++], id = cmd % 8, cnt = Math.floor(cmd / 8);
      if (id === 1) {
        for (let c = 0; c < cnt; c++) {
          if (i + 1 >= g.length + 0 && i + 1 > g.length) throw new Error('MVT: geometri kesik');
          x += zz(g[i++]); y += zz(g[i++]);
          if (type === 1) pts.push([x, y]); else { cur = [[x, y]]; parts.push(cur); }
        }
      } else if (id === 2) {
        if (!cur) throw new Error('MVT: LineTo öncesinde MoveTo yok');
        for (let c = 0; c < cnt; c++) { x += zz(g[i++]); y += zz(g[i++]); cur.push([x, y]); }
      } else if (id === 7) { /* ClosePath: nokta eklemez */ }
      else throw new Error('MVT: bilinmeyen geometri komutu');
    }
    if (type === 1) return { points: pts };
    if (type === 2) return { lines: parts.filter((l) => l.length > 1) };
    // poligon: halkaları sargı yönüne göre grupla (y aşağı koordinatta alan > 0 = dış halka)
    const polys = [], rings = [];
    parts.forEach((ring) => {
      if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
      if (ring.length < 3) return;
      const a = ringArea(ring);
      if (a === 0) return;
      rings.push(ring);
      if (a > 0 || !polys.length) polys.push({ outer: ring, inner: [] });
      else polys[polys.length - 1].inner.push(ring);
    });
    return { polys: polys, rings: rings };
  }
  function readLayer(r, end) {
    const L = { name: '', extent: 4096, version: 1, features: [] };
    const keys = [], vals = [], raw = [];
    readMsg(r, end, function (tag, wire) {
      if (tag === 15 && wire === 0) L.version = r.varint();
      else if (tag === 1 && wire === 2) { const n = r.varint(); L.name = utf8(r.b, r.p, r.p + n); r.p += n; }
      else if (tag === 2 && wire === 2) { const n = r.varint(); raw.push(readFeature(r, r.p + n)); }
      else if (tag === 3 && wire === 2) { const n = r.varint(); keys.push(utf8(r.b, r.p, r.p + n)); r.p += n; }
      else if (tag === 4 && wire === 2) { const n = r.varint(); vals.push(readValue(r, r.p + n)); }
      else if (tag === 5 && wire === 0) L.extent = r.varint();
      else r.skip(wire);
    });
    raw.forEach((f) => {
      const t = f.type === 1 ? 'point' : f.type === 2 ? 'line' : f.type === 3 ? 'polygon' : null;
      if (!t) return;
      const props = {};
      for (let i = 0; i + 1 < f.tags.length; i += 2) { const k = keys[f.tags[i]]; if (k !== undefined) props[k] = vals[f.tags[i + 1]]; }
      let g;
      try { g = decodeGeom(f.type, f.geom); } catch (e) { return; } // bozuk tek bir özellik karoyu düşürmesin
      L.features.push(Object.assign({ id: f.id, type: t, props: props }, g));
    });
    return L;
  }
  mvt.decode = function (input) {
    const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) throw new Error('MVT: sıkıştırılmış (gzip) karo çözülemedi');
    const r = new Pbf(buf);
    const layers = [];
    readMsg(r, buf.length, function (tag, wire) {
      if (tag === 3 && wire === 2) { const n = r.varint(); layers.push(readLayer(r, r.p + n)); }
      else r.skip(wire);
    });
    return { layers: layers };
  };

  /* ==========================================================================
     KARO MATEMATİĞİ (Web Mercator, XYZ)
     ========================================================================== */
  const tiles = (here.tiles = {});
  function tileXY(lat, lon, z) {
    const n = Math.pow(2, z);
    const s = Math.sin(Math.max(-85.0511, Math.min(85.0511, lat)) * D2R);
    return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
  }
  // bbox'u kaplayan karolar; çok olursa z düşürülür (en çok maxTiles). En yakın karo önce.
  tiles.list = function (lat0, lon0, R, z, maxTiles) {
    z = z == null ? 16 : z; maxTiles = maxTiles || 9;
    const dLat = R / 111320, dLon = R / (111320 * Math.max(0.05, Math.cos(lat0 * D2R)));
    let zz = z, x0, x1, y0, y1;
    for (; zz >= 6; zz--) {
      const a = tileXY(lat0 + dLat, lon0 - dLon, zz), b = tileXY(lat0 - dLat, lon0 + dLon, zz);
      x0 = Math.floor(a[0]); x1 = Math.floor(b[0]); y0 = Math.floor(a[1]); y1 = Math.floor(b[1]);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) <= maxTiles) break;
    }
    const c = tileXY(lat0, lon0, zz), out = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z: zz, x: x, y: y });
    out.sort((p, q) => Math.hypot(p.x + 0.5 - c[0], p.y + 0.5 - c[1]) - Math.hypot(q.x + 0.5 - c[0], q.y + 0.5 - c[1]));
    return out;
  };
  // karo içi (px, py) → [lat, lon]
  tiles.toLatLon = function (tile, px, py, extent) {
    const n = Math.pow(2, tile.z);
    const lon = ((tile.x + px / extent) / n) * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (tile.y + py / extent)) / n))) / D2R;
    return [lat, lon];
  };
  // karo içi (px, py) → yerel metre [x, y]  (proj = gis.makeProj(lat0, lon0))
  tiles.toLocal = function (tile, px, py, extent, proj) {
    const ll = tiles.toLatLon(tile, px, py, extent);
    return proj.fwd(ll[0], ll[1]);
  };

  /* ==========================================================================
     KARO → osm.parse BİÇİMİ
     Karo kenarı: özellikler karonun KENDİ karesine [0, extent] kırpılır (tampon bölgedeki yinelenen geometri
     böylece düşer, komşu karolar çakışmadan birbirini tamamlar); sonra kenarda kesilen parçalar birleştirilir:
       · çizgiler: uç noktalar toleransla aynı noktaya oturtulur (yürüme grafı bağlı kalsın) ve aynı özellikliler uç uca eklenir
       · bina / yeşil / arazi / su çokgenleri: ortak kenar bulunursa tek halkaya dikilir (tam bir ortak kenar yoksa ayrı kalır)
     ========================================================================== */
  function roleOf(name) {
    const n = String(name || '').toLowerCase();
    for (let i = 0; i < LAYER_ROLES.length; i++) if (LAYER_ROLES[i][0].test(n)) return LAYER_ROLES[i][1];
    return null;
  }
  const firstStr = (p, keys) => { for (let i = 0; i < keys.length; i++) { const v = p[keys[i]]; if (typeof v === 'string' && v) return v.toLowerCase(); } return ''; };
  const firstVal = (p, keys) => { for (let i = 0; i < keys.length; i++) { const v = p[keys[i]]; if (v != null && v !== '') return v; } return null; };
  const truthy = (v) => v === true || v === 1 || v === '1' || (typeof v === 'string' && /^(yes|true|tunnel|bridge|1)$/i.test(v));
  const numOf = (v) => { if (v == null || v === '') return null; const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };

  function clipEdge(pts, inside, inter) {
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const cur = pts[i], prev = pts[(i + n - 1) % n], ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) out.push(inter(prev, cur)); out.push(cur); } else if (pi) out.push(inter(prev, cur));
    }
    return out;
  }
  function clipRing(ring, E) {
    let o = clipEdge(ring, (p) => p[0] >= 0, (a, b) => [0, a[1] + ((b[1] - a[1]) * (0 - a[0])) / (b[0] - a[0])]);
    if (o.length) o = clipEdge(o, (p) => p[0] <= E, (a, b) => [E, a[1] + ((b[1] - a[1]) * (E - a[0])) / (b[0] - a[0])]);
    if (o.length) o = clipEdge(o, (p) => p[1] >= 0, (a, b) => [a[0] + ((b[0] - a[0]) * (0 - a[1])) / (b[1] - a[1]), 0]);
    if (o.length) o = clipEdge(o, (p) => p[1] <= E, (a, b) => [a[0] + ((b[0] - a[0]) * (E - a[1])) / (b[1] - a[1]), E]);
    return o;
  }
  function clipLine(pts, E) {
    const out = [];
    let cur = null;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1];
      let t0 = 0, t1 = 1, ok = true;
      const p = [-dx, dx, -dy, dy], q = [a[0], E - a[0], a[1], E - a[1]];
      for (let k = 0; k < 4 && ok; k++) {
        if (p[k] === 0) { if (q[k] < 0) ok = false; } else {
          const t = q[k] / p[k];
          if (p[k] < 0) { if (t > t1) ok = false; else if (t > t0) t0 = t; } else { if (t < t0) ok = false; else if (t < t1) t1 = t; }
        }
      }
      if (!ok) { cur = null; continue; }
      const P0 = t0 === 0 ? a : [a[0] + dx * t0, a[1] + dy * t0], P1 = t1 === 1 ? b : [a[0] + dx * t1, a[1] + dy * t1];
      if (cur && t0 === 0) cur.push(P1); else { cur = [P0, P1]; out.push(cur); }
      if (t1 < 1) cur = null;
    }
    return out;
  }
  const EPS_B = 1e-4;
  const onBorder = (p, E) => Math.abs(p[0]) < EPS_B || Math.abs(p[0] - E) < EPS_B || Math.abs(p[1]) < EPS_B || Math.abs(p[1] - E) < EPS_B;
  const inTile = (p, E) => p[0] >= 0 && p[0] <= E && p[1] >= 0 && p[1] <= E;

  function localPts(ring, toL) {
    const pts = [];
    ring.forEach((p) => {
      const q = toL(p[0], p[1]), x = r1(q[0]), y = r1(q[1]), l = pts[pts.length - 1];
      if (l && l[0] === x && l[1] === y) return;
      pts.push([x, y]);
    });
    return pts;
  }
  function ringLocal(ring, E, toL) {
    const clipped = ring.every((p) => inTile(p, E)) ? ring : clipRing(ring, E);
    if (clipped.length < 3) return null;
    let nb = 0;
    clipped.forEach((p) => { if (onBorder(p, E)) nb++; });
    const pts = localPts(clipped, toL);
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) return null;
    return { pts: pts, cut: nb >= 2 };
  }
  function lineLocal(line, E, toL) {
    const pieces = line.every((p) => inTile(p, E)) ? [line] : clipLine(line, E);
    const out = [];
    pieces.forEach((pc) => {
      const pts = localPts(pc, toL);
      if (pts.length < 2) return;
      out.push({ pts: pts, cut: onBorder(pc[0], E) || onBorder(pc[pc.length - 1], E) });
    });
    return out;
  }
  // bbox'ın çalışma noktasına uzaklığı ≤ R mi (osm 'around' ile benzer: daireyle kesişen özellik kalır)
  function nearOrigin(pts, R) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i++) { const q = pts[i]; if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    const dx = x0 > 0 ? x0 : x1 < 0 ? -x1 : 0, dy = y0 > 0 ? y0 : y1 < 0 ? -y1 : 0;
    return dx * dx + dy * dy <= R * R;
  }
  const d2 = (a, b) => (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]);

  /* ---- çizgi parçalarını birleştir: uç noktaları oturt + aynı anahtarlıları uç uca ekle ---- */
  function joinLines(items, tol) {
    const cand = items.filter((it) => it.cut), rest = items.filter((it) => !it.cut);
    if (cand.length < 2) return { items: items, joined: 0 };
    const clusters = [];
    cand.forEach((it) => {
      [0, it.pts.length - 1].forEach((ix) => {
        const p = it.pts[ix];
        let c = null;
        for (let i = 0; i < clusters.length; i++) if (d2(clusters[i].c, p) <= tol * tol) { c = clusters[i]; break; }
        if (!c) { c = { c: [p[0], p[1]], n: 0, sx: 0, sy: 0, m: [] }; clusters.push(c); }
        c.n++; c.sx += p[0]; c.sy += p[1]; c.m.push([it, ix]);
        c.c = [c.sx / c.n, c.sy / c.n];
      });
    });
    clusters.forEach((c) => { if (c.m.length > 1) { const q = [r1(c.c[0]), r1(c.c[1])]; c.m.forEach((m) => { m[0].pts[m[1]] = [q[0], q[1]]; }); } });
    let joined = 0, changed = true, guard = 0;
    let pool = cand.slice();
    while (changed && guard++ < 16) {
      changed = false;
      const map = new Map();
      pool.forEach((it) => [0, it.pts.length - 1].forEach((ix) => {
        const p = it.pts[ix], k = p[0] + '|' + p[1];
        if (!map.has(k)) map.set(k, []);
        map.get(k).push([it, ix]);
      }));
      const dead = new Set(), fresh = [];
      map.forEach((list) => {
        if (list.length !== 2) return;
        const A = list[0], B = list[1];
        if (A[0] === B[0] || dead.has(A[0]) || dead.has(B[0]) || A[0].key !== B[0].key) return;
        const ap = A[1] === 0 ? A[0].pts.slice().reverse() : A[0].pts, bp = B[1] === 0 ? B[0].pts : B[0].pts.slice().reverse();
        const m = Object.assign({}, A[0], { pts: ap.concat(bp.slice(1)) });
        dead.add(A[0]); dead.add(B[0]); fresh.push(m); joined++; changed = true;
      });
      if (changed) pool = pool.filter((it) => !dead.has(it)).concat(fresh);
    }
    return { items: rest.concat(pool), joined: joined };
  }

  /* ---- çokgen parçalarını ortak kenardan dik ---- */
  function dropCollinear(ring, tol) {
    let pts = ring.slice(), n = pts.length, changed = true;
    while (changed && pts.length > 3) {
      changed = false; n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
        if (gis.nearestOnSeg(b[0], b[1], a[0], a[1], c[0], c[1]).d < tol) { pts.splice(i, 1); changed = true; break; }
      }
    }
    return pts;
  }
  function mergePair(A, B, tol) {
    const a = gis.ccw(A), b = gis.ccw(B), n = a.length, m = b.length;
    const minLen = Math.max(2 * tol, 1);
    let hit = null, count = 0;
    for (let i = 0; i < n; i++) {
      const a0 = a[i], a1 = a[(i + 1) % n];
      if (Math.sqrt(d2(a0, a1)) < minLen) continue;
      for (let j = 0; j < m; j++) {
        const b0 = b[j], b1 = b[(j + 1) % m];
        if (d2(a0, b1) <= tol * tol && d2(a1, b0) <= tol * tol) { hit = [i, j]; count++; }
      }
    }
    if (count !== 1) return null;
    const i = hit[0], j = hit[1], out = [];
    for (let k = 1; k <= n; k++) out.push(a[(i + k) % n]);          // a1 … a0
    for (let k = 2; k <= m - 1; k++) out.push(b[(j + k) % m]);      // b2 … b(j-1)
    const merged = dropCollinear(out, 0.08);
    const area0 = Math.abs(gis.area(a)) + Math.abs(gis.area(b)), area1 = Math.abs(gis.area(merged));
    if (merged.length < 3 || Math.abs(area1 - area0) > Math.max(1, area0 * 0.03)) return null;
    return merged;
  }
  function bboxNear(a, b, tol) {
    const p = gis.bbox(a), q = gis.bbox(b);
    return !(p.x1 + tol < q.x0 || q.x1 + tol < p.x0 || p.y1 + tol < q.y0 || q.y1 + tol < p.y0);
  }
  function stitchPolys(items, tol, compat) {
    const cand = items.filter((it) => it.cut), rest = items.filter((it) => !it.cut);
    const pool = cand.slice();
    let stitched = 0, changed = true, pass = 0;
    while (changed && pass++ < 8) {
      changed = false;
      let i = 0;
      while (i < pool.length) {
        let merged = false;
        for (let j = i + 1; j < pool.length; j++) {
          if (!compat(pool[i], pool[j]) || !bboxNear(pool[i].pts, pool[j].pts, tol)) continue;
          const m = mergePair(pool[i].pts, pool[j].pts, tol);
          if (!m) continue;
          const keep = Math.abs(gis.area(pool[i].pts)) >= Math.abs(gis.area(pool[j].pts)) ? pool[i] : pool[j];
          pool[i] = Object.assign({}, keep, { pts: m });
          pool.splice(j, 1);
          stitched++; merged = true; changed = true;
          break;
        }
        if (!merged) i++;
      }
    }
    return { items: rest.concat(pool), stitched: stitched };
  }

  /* ---- özellik çıkarımı ---- */
  function roadClassOf(p) {
    const cands = [p.kind_detail, p.class, p.highway, p.type, p.kind];
    for (let i = 0; i < cands.length; i++) {
      const v = typeof cands[i] === 'string' ? cands[i].toLowerCase() : '';
      if (v && ROAD_SKIP[v]) return { skip: true };
      if (v && RAIL_MAP[v] && (p.kind === 'rail' || v === 'subway' || v === 'tram' || v === 'light_rail')) return { rail: RAIL_MAP[v] };
      if (v && ROAD_MAP[v]) return { cls: ROAD_MAP[v] };
    }
    const k = firstStr(p, ['kind']);
    if (k === 'rail') return { rail: RAIL_MAP[firstStr(p, ['kind_detail', 'class', 'subclass'])] || 'rail' };
    return { skip: true };
  }
  function buildingProps(p) {
    let h = null, lv = null;
    const hv = numOf(firstVal(p, KEYS.height)), mv = numOf(firstVal(p, KEYS.minHeight));
    if (hv != null && hv > 0 && hv < 400) h = mv != null && mv > 0 && hv > mv ? hv - mv : hv;
    const lvv = numOf(firstVal(p, KEYS.levels));
    if (lvv != null && lvv > 0 && lvv < 120) lv = Math.round(lvv);
    let kind = firstStr(p, ['kind_detail']);
    if (!kind || kind === 'building' || kind === 'yes') kind = typeof p.building === 'string' && p.building !== 'yes' ? p.building.toLowerCase() : 'yes';
    return { h: h, lv: lv, kind: kind };
  }

  function buildData(results, lat0, lon0, R, proj) {
    const d = { lat0: lat0, lon0: lon0, R: R, t: Date.now(), buildings: [], roads: [], rails: [], green: [], landuse: [], water: [], poi: [], transit: [] };
    const layerSeen = new Set(), acc = { b: [], roads: [], rails: [], green: [], use: [], water: [], wlines: [] };
    let z = null;
    results.forEach((tr) => {
      if (!tr || !tr.layers) return;
      z = tr.tile.z;
      tr.layers.forEach((layer) => {
        layerSeen.add(layer.name);
        const role = roleOf(layer.name);
        if (!role) return;
        const E = layer.extent || 4096, n = Math.pow(2, tr.tile.z);
        const toL = (px, py) => proj.fwd(Math.atan(Math.sinh(Math.PI * (1 - (2 * (tr.tile.y + py / E)) / n))) / D2R, ((tr.tile.x + px / E) / n) * 360 - 180);
        layer.features.forEach((f) => {
          const p = f.props || {};
          const nm = firstVal(p, KEYS.name);
          const name = nm == null ? '' : String(nm);
          if (role === 'buildings') {
            if (f.type !== 'polygon') return;
            if (firstStr(p, ['kind']) === 'building_part' || truthy(p.is_underground) || truthy(p.underground)) return;
            const bp = buildingProps(p), id = firstVal(p, KEYS.id);
            (f.polys || []).forEach((pg) => { const r = ringLocal(pg.outer, E, toL); if (r) acc.b.push({ pts: r.pts, cut: r.cut, id: f.id != null ? f.id : id, h: bp.h, lv: bp.lv, kind: bp.kind }); });
          } else if (role === 'roads' || role === 'transit') {
            if (f.type !== 'line') return;
            const rc = role === 'transit' ? (RAIL_MAP[firstStr(p, ['kind_detail', 'kind', 'class'])] ? { rail: RAIL_MAP[firstStr(p, ['kind_detail', 'kind', 'class'])] } : { skip: true }) : roadClassOf(p);
            if (rc.skip) return;
            const tn = truthy(firstVal(p, KEYS.tunnel)) || p.brunnel === 'tunnel' || p.structure === 'tunnel' ? 1 : 0;
            const br = truthy(firstVal(p, KEYS.bridge)) || p.brunnel === 'bridge' || p.structure === 'bridge' ? 1 : 0;
            const nf = p.foot === 'no' || p.access === 'private' || p.access === 'no' ? 1 : 0;
            (f.lines || []).forEach((ln) => lineLocal(ln, E, toL).forEach((pc) => {
              if (rc.rail) acc.rails.push({ pts: pc.pts, cut: pc.cut, kind: rc.rail, key: 'r|' + rc.rail });
              else acc.roads.push({ pts: pc.pts, cut: pc.cut, cls: rc.cls, name: name, nf: nf, br: br, tn: tn, key: rc.cls + '|' + name + '|' + nf + br + tn });
            }));
          } else if (role === 'landuse') {
            if (f.type !== 'polygon') return;
            const cands = [];
            KEYS.kind.concat(['landuse', 'leisure', 'natural']).forEach((kk) => { if (typeof p[kk] === 'string' && p[kk]) cands.push(p[kk].toLowerCase()); });
            let g = null, u = null, kd = null;
            for (let i = 0; i < cands.length && !g && !u; i++) { if (GREEN_MAP[cands[i]]) { g = GREEN_MAP[cands[i]]; kd = cands[i]; } else if (USE_MAP[cands[i]]) { u = USE_MAP[cands[i]]; kd = cands[i]; } }
            if (!g && !u) return;
            (f.polys || []).forEach((pg) => {
              const r = ringLocal(pg.outer, E, toL);
              if (!r) return;
              if (g) acc.green.push({ pts: r.pts, cut: r.cut, kind: g, pub: GREEN_PUB[g] ? 1 : 0, name: name, key: 'g|' + g + '|' + name });
              else acc.use.push({ pts: r.pts, cut: r.cut, kind: u, key: 'u|' + u });
            });
          } else if (role === 'water') {
            const kd = firstStr(p, ['kind_detail', 'kind', 'class', 'type', 'water']);
            if (f.type === 'polygon') {
              const kind = WATER_SEA[kd] ? 'sea' : kd && kd !== 'water' ? kd : 'water';
              (f.polys || []).forEach((pg) => { const r = ringLocal(pg.outer, E, toL); if (r) acc.water.push({ pts: r.pts, cut: r.cut, kind: kind, key: 'w|' + kind }); });
            } else if (f.type === 'line') {
              const kind = WATER_LINE[kd] || WATER_LINE[firstStr(p, ['kind'])] || 'stream';
              (f.lines || []).forEach((ln) => lineLocal(ln, E, toL).forEach((pc) => acc.wlines.push({ pts: pc.pts, cut: pc.cut, kind: kind, key: 'wl|' + kind })));
            }
          }
        });
      });
    });

    // karo birimi (metre) → birleştirme toleransı
    const unit = z == null ? 0.2 : (40075016.686 * Math.cos(lat0 * D2R)) / Math.pow(2, z) / 4096;
    const tol = Math.max(0.5, 3 * unit);
    const st = { lines: 0, polys: 0 };
    const near = (it) => nearOrigin(it.pts, R);
    const doLines = (arr) => { const j = joinLines(arr, tol); st.lines += j.joined; return j.items.filter(near); };
    const doPolys = (arr, compat) => { const s = stitchPolys(arr, tol, compat); st.polys += s.stitched; return s.items.filter(near); };
    const sameKey = (a, b) => a.key === b.key;

    acc.roads = doLines(acc.roads);
    acc.rails = doLines(acc.rails);
    acc.wlines = doLines(acc.wlines);
    acc.roads.forEach((r) => d.roads.push({ pts: r.pts, cls: r.cls, name: r.name, nf: r.nf, br: r.br, tn: r.tn }));
    acc.rails.forEach((r) => d.rails.push({ pts: r.pts, kind: r.kind }));
    acc.wlines.forEach((w) => d.water.push({ pts: w.pts, kind: w.kind, line: 1 }));

    // binalar: aynı kimlik varsa yalnızca kimliği aynı olanlar, yoksa komşu parçalar birleşir
    const bcompat = (a, b) => !(a.id != null && b.id != null && a.id !== b.id);
    doPolys(acc.b, bcompat).forEach((b) => {
      const c = gis.centroid(b.pts), ar = Math.abs(gis.area(b.pts));
      if (ar < 2) return;
      d.buildings.push({ pts: b.pts, h: b.h, lv: b.lv, kind: b.kind, cx: r1(c[0]), cy: r1(c[1]), area: Math.round(ar) });
    });
    doPolys(acc.green, sameKey).forEach((g) => {
      const o = { pts: g.pts, kind: g.kind, pub: g.pub };
      if (g.name) o.name = g.name;
      d.green.push(o);
      const ar = Math.abs(gis.area(g.pts));
      if (PARK_POI[g.kind] && ar > 600) {
        const c = gis.centroid(g.pts);
        addPoi(d.poi, { x: r1(c[0]), y: r1(c[1]), cat: 'rekreasyon', kind: PARK_POI[g.kind], name: g.name || '', park: 1, r: r1(Math.sqrt(ar) / 2) });
      }
    });
    doPolys(acc.use, sameKey).forEach((g) => d.landuse.push({ pts: g.pts, kind: g.kind }));
    doPolys(acc.water, sameKey).forEach((w) => d.water.push({ pts: w.pts, kind: w.kind }));

    const layers = Array.from(layerSeen);
    d.hereMeta = { layers: layers, counts: here.counts(d), z: z, tol: r1(tol), joined: st };
    return d;
  }
  here.counts = (d) => ({ buildings: d.buildings.length, roads: d.roads.length, rails: d.rails.length, green: d.green.length, landuse: d.landuse.length, water: d.water.length, poi: d.poi.length, transit: d.transit.length });

  /* ==========================================================================
     KARO ÇEKME
     ========================================================================== */
  function fetchTile(t, key, ctx) {
    const url = 'https://vector.hereapi.com/v2/vectortiles/base/mc/' + t.z + '/' + t.x + '/' + t.y + '/omv?apiKey=' + encodeURIComponent(key);
    return http(url, here.TIMEOUT.tile, ctx).then((r) => {
      if (r.status === 204) return null;                       // boş karo
      if (!r.ok) throw httpError(r.status);
      return r.arrayBuffer().then((ab) => new Uint8Array(ab));
    });
  }
  here.fetchTiles = function (lat0, lon0, R, progress) {
    let key;
    try { key = needKey(); } catch (e) { return Promise.reject(e); }
    const say = (m) => { if (progress) progress(m); };
    const opt = here.TILE_OPTS, list = tiles.list(lat0, lon0, R, opt.z, opt.maxTiles), proj = gis.makeProj(lat0, lon0);
    const ctx = newCtx();
    let done = 0;
    say('HERE vektör karoları alınıyor (0/' + list.length + ')…');
    return runPool(list, opt.concurrency || 4, (t) => fetchTile(t, key, ctx).then((buf) => {
      let res;
      if (!buf) res = { tile: t, layers: [], empty: true };
      else {
        try { res = { tile: t, layers: mvt.decode(buf).layers }; } catch (e) { res = { tile: t, error: new Error('HERE karosu çözülemedi: ' + redact(e.message)) }; }
      }
      done++; say('HERE vektör karoları alınıyor (' + done + '/' + list.length + ')…');
      return res;
    }), ctx).then((results) => {
      const ok = [], errs = [];
      results.forEach((r, i) => { if (r && r.error && !r.tile) errs.push({ tile: list[i], error: r.error }); else if (r && r.error) errs.push({ tile: r.tile, error: r.error }); else if (r) ok.push(r); });
      if (!ok.length) throw errs.length ? errs[0].error : herr('HERE karo yanıtı alınamadı', false);
      const d = buildData(ok, lat0, lon0, R, proj);
      d.hereMeta.tiles = list.length;
      d.hereMeta.failedTiles = errs.length;
      d.hereMeta.emptyTiles = ok.filter((r) => r.empty).length;
      return d;
    });
  };

  /* ==========================================================================
     GEOCODE / REVERSE (Geocoding & Search v1)
     ========================================================================== */
  here.geocode = function (q) {
    const c = osm.parseCoord(q);
    if (c) return Promise.resolve([c]);                         // koordinat girişi: ağ çağrısı yok
    let key;
    try { key = needKey(); } catch (e) { return Promise.reject(e); }
    const url = 'https://geocode.search.hereapi.com/v1/geocode?' + qs({ q: q, limit: 6, lang: 'tr', apiKey: key });
    return jsonGet(url).then((j) => {
      const items = (j && j.items) || [];
      return items.filter((x) => x && x.position && isFinite(x.position.lat) && isFinite(x.position.lng)).map((x) => {
        const a = x.address || {};
        return { lat: Number(x.position.lat), lon: Number(x.position.lng), name: a.label || x.title || '', kind: x.resultType || 'place', sub: [a.district || '', a.city || a.county || ''].filter(Boolean).join(', '), src: 'here' };
      });
    });
  };
  here.reverse = function (lat, lon) {
    let key;
    try { key = needKey(); } catch (e) { return Promise.resolve(null); }
    const url = 'https://revgeocode.search.hereapi.com/v1/revgeocode?' + qs({ at: lat + ',' + lon, lang: 'tr', apiKey: key });
    return jsonGet(url).then((j) => {
      const x = j && j.items && j.items[0];
      if (!x) return null;
      const a = x.address || {};
      const parts = [a.street ? a.street + (a.houseNumber ? ' ' + a.houseNumber : '') : '', a.district || '', a.city || a.county || ''].filter(Boolean);
      return parts.length ? parts.slice(0, 3).join(', ') : a.label ? a.label.split(',').slice(0, 3).join(',') : x.title || null;
    }).catch(() => null);
  };

  /* ==========================================================================
     BROWSE → işlev noktaları (osm.CATS) + toplu taşıma
     ========================================================================== */
  const catIds = (it) => (it.categories || []).map((c) => String((c && c.id) || '')).filter(Boolean);
  const hasPrefix = (ids, pre) => ids.some((id) => id === pre || id.indexOf(pre + '-') === 0);
  function classifyTransit(it) {
    const txt = U.norm([it.title].concat((it.categories || []).map((c) => c && c.name)).join(' '));
    for (let i = 0; i < TRANSIT_KW.length; i++) if (TRANSIT_KW[i][0].test(txt)) return TRANSIT_KW[i][1];
    return 'otobus';
  }
  // → { cat, kind, park } | null
  here.classify = function (it, groupDef) {
    const ids = catIds(it);
    const txt = U.norm([it.title].concat((it.categories || []).map((c) => c && c.name)).join(' '));
    let pre = null;
    for (let i = 0; i < CAT_PREFIX.length; i++) if (hasPrefix(ids, CAT_PREFIX[i][0])) { pre = CAT_PREFIX[i]; break; }
    if (pre && pre[0].length > 3) {
      if (pre[1] === 'yeme') return { cat: 'yeme', kind: 'Kafe' };
      const kw = KW.find((k) => k[1] === pre[1] && k[0].test(txt));
      return { cat: pre[1], kind: kw ? kw[2] : pre[2] };
    }
    if (pre && pre[1] === 'yeme') {                              // 100 = yeme-içme: "pazar köftecisi" market olmasın
      const kw = KW.find((k) => k[1] === 'yeme' && k[0].test(txt));
      return { cat: 'yeme', kind: kw ? kw[2] : 'Restoran' };
    }
    if (!KW_EXCLUDE.test(txt)) {
      for (let i = 0; i < KW.length; i++) if (KW[i][0].test(txt)) return { cat: KW[i][1], kind: KW[i][2], park: KW[i][2] === 'Park' };
    }
    if (groupDef === 'rekreasyon') return KW_EXCLUDE.test(txt) ? null : { cat: 'rekreasyon', kind: 'Park / spor' };
    if (groupDef === 'alisveris') return { cat: 'alisveris', kind: 'Mağaza' };
    if (groupDef === 'kultur') return { cat: 'kultur', kind: 'Kültür / eğlence' };
    return null;                                                 // emin olunmayan kimlik/ad: iddia etme
  };

  // aynı kategori + ad + 25 m içinde tekrarı sayma; park noktaları için yarıçap payı
  function addPoi(list, p) {
    const nm = U.norm(p.name || '');
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!nm || o.cat !== p.cat || U.norm(o.name || '') !== nm) continue;
      const lim = p.park && o.park ? 25 + (p.r || 0) + (o.r || 0) : 25;
      if (Math.hypot(o.x - p.x, o.y - p.y) <= lim) { if (p.park && o.park && (p.r || 0) > (o.r || 0)) list[i] = p; return false; }
    }
    list.push(p);
    return true;
  }
  function addTransit(list, t) {
    if (list.some((s) => s.kind === t.kind && Math.abs(s.x - t.x) < 20 && Math.abs(s.y - t.y) < 20)) return false;
    list.push(t);
    return true;
  }
  here.mergePoi = function (a, b) {
    const out = a.slice();
    b.forEach((p) => {
      // yeşil çokgenin parkı varsa, browse'taki aynı yerdeki park noktası yinelenmesin
      if (p.park && !p.r && out.some((o) => o.park && Math.hypot(o.x - p.x, o.y - p.y) <= (o.r || 0) + 60)) return;
      addPoi(out, p);
    });
    return out;
  };
  here.mergeTransit = function (a, b) { const out = a.slice(); b.forEach((t) => addTransit(out, t)); return out; };

  here.browse = function (lat0, lon0, R, progress) {
    let key;
    try { key = needKey(); } catch (e) { return Promise.reject(e); }
    const say = (m) => { if (progress) progress(m); };
    const proj = gis.makeProj(lat0, lon0), ctx = newCtx();
    const rad = Math.max(50, Math.round(R));
    const seen = new Set(), poi = [], transit = [], meta = { groups: {}, truncated: [], failed: 0 };
    let done = 0;
    say('HERE işlev noktaları alınıyor…');
    return runPool(BROWSE_GROUPS, 3, (g) => {
      const url = 'https://browse.search.hereapi.com/v1/browse?' + qs({ at: lat0.toFixed(6) + ',' + lon0.toFixed(6), in: 'circle:' + lat0.toFixed(6) + ',' + lon0.toFixed(6) + ';r=' + rad, categories: g.cats, limit: 100, lang: 'tr', apiKey: key });
      return jsonGet(url, null, ctx).then((j) => { done++; say('HERE işlev noktaları alınıyor (' + done + '/' + BROWSE_GROUPS.length + ')…'); return { g: g, items: (j && j.items) || [] }; });
    }, ctx).then((results) => {
      let okCount = 0, lastErr = null;
      results.forEach((r) => {
        if (!r || r.error) { meta.failed++; lastErr = r && r.error; return; }
        okCount++;
        meta.groups[r.g.id] = r.items.length;
        if (r.items.length >= 100) meta.truncated.push(r.g.id);
        r.items.forEach((it) => {
          if (!it || !it.position || !isFinite(it.position.lat) || !isFinite(it.position.lng)) return;
          if (it.id) { if (seen.has(it.id)) return; seen.add(it.id); }
          const q = proj.fwd(Number(it.position.lat), Number(it.position.lng)), x = r1(q[0]), y = r1(q[1]);
          const name = String(it.title || '');
          if (hasPrefix(catIds(it), TRANSIT_PREFIX)) { addTransit(transit, { x: x, y: y, kind: classifyTransit(it), name: name }); return; }
          const c = here.classify(it, r.g.def);
          if (!c) return;
          const o = { x: x, y: y, cat: c.cat, kind: c.kind, name: name };
          if (c.park) { o.park = 1; o.r = 0; }
          addPoi(poi, o);
        });
      });
      if (!okCount) throw lastErr || herr('HERE Browse yanıtı alınamadı', false);
      return { poi: poi, transit: transit, meta: meta };
    });
  };

  /* ==========================================================================
     İZOLİNLER (Isoline Routing v8) — yürüme ağı HERE yönlendirmesine aittir
     ========================================================================== */
  here.isolines = function (lat0, lon0, minutes) {
    let key;
    try { key = needKey(); } catch (e) { return Promise.reject(e); }
    const mins = Array.isArray(minutes) ? minutes : minutes ? [minutes] : [5, 10, 15];
    const proj = gis.makeProj(lat0, lon0);
    const url = 'https://isoline.router.hereapi.com/v8/isolines?' + qs({ transportMode: 'pedestrian', origin: lat0.toFixed(6) + ',' + lon0.toFixed(6), 'range[type]': 'time', 'range[values]': mins.map((m) => Math.round(m * 60)).join(','), apiKey: key });
    const ring = (s) => {
      const pts = [];
      fpl.decode(s).forEach((p) => { const q = proj.fwd(p[0], p[1]), x = r1(q[0]), y = r1(q[1]), l = pts[pts.length - 1]; if (!l || l[0] !== x || l[1] !== y) pts.push([x, y]); });
      if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      return pts;
    };
    return jsonGet(url).then((j) => {
      const out = {};
      ((j && j.isolines) || []).forEach((iso) => {
        const v = iso && iso.range && Number(iso.range.value);
        if (!isFinite(v)) return;
        const rings = [];
        ((iso.polygons) || []).forEach((pg) => { if (pg && pg.outer) { try { const r = ring(pg.outer); if (r.length >= 3) rings.push(r); } catch (e) { /* bozuk halka: atla */ } } });
        if (rings.length) out[Math.round(v / 60)] = rings;
      });
      return out;
    });
  };

  /* ==========================================================================
     TAM ÇEKİM — osm.fetchAll ile AYNI dönüş: { key, data, elev, climate, demo:false, source, iso }
     ========================================================================== */
  const base = { key: osm.key, geocode: osm.geocode, reverse: osm.reverse, fetchAll: osm.fetchAll };
  here.fetchAll = function (lat, lon, Rf, progress) {
    const say = (m) => { if (progress) progress(m); };
    try { needKey(); } catch (e) { return Promise.reject(e); }
    const ekey = base.key(lat, lon) + '#h';
    say('HERE verisi alınıyor (karolar, işlev noktaları, yürüme alanları)…');
    const soft = (p) => p.catch((e) => { if (e && e.fatal) throw e; return { __err: e }; });
    const pTiles = soft(here.fetchTiles(lat, lon, Rf, say));
    const pBrowse = soft(here.browse(lat, lon, Rf));
    const pIso = soft(here.isolines(lat, lon, [5, 10, 15]));
    const pElev = osm.fetchElevation(lat, lon, Math.min(Rf, 900), 10).catch(() => null);
    const pClim = osm.fetchClimate(lat, lon).catch(() => null);
    return Promise.all([pTiles, pBrowse, pIso]).then((res) => {
      let d = res[0].__err ? null : res[0];
      const br = res[1].__err ? null : res[1];
      const iso = res[2].__err ? null : res[2];
      const noGeom = !d || (d.buildings.length === 0 && d.roads.length === 0);
      const noPoi = !br || (br.poi.length === 0 && br.transit.length === 0);
      const tileErr = res[0].__err ? res[0].__err : null;
      const needOv = noGeom || noPoi;
      const pOv = needOv ? osm.fetchOverpass(lat, lon, Rf).then((v) => ({ v: v }), (e) => ({ e: e })) : Promise.resolve(null);
      return pOv.then((ov) => {
        let source = 'here';
        if (noGeom) {
          if (!ov || ov.e) throw new Error('HERE karolarından bina ve yol alınamadı' + (tileErr ? ' (' + redact(tileErr.message) + ')' : '') + ' ve OpenStreetMap yedeği de alınamadı' + (ov && ov.e ? ' (' + redact(netMsg(ov.e)) + ')' : '') + '.');
          const meta = d && d.hereMeta;
          d = ov.v;
          d.hereMeta = Object.assign({ layers: [], counts: null }, meta || {}, { fallback: 'overpass-geometri', tileError: tileErr ? redact(tileErr.message) : null });
          source = 'here+osm';
          if (!noPoi) { d.poi = here.mergePoi(d.poi.filter((p) => p.park), br.poi); d.transit = br.transit.slice(); }
        } else if (!noPoi) {
          d.poi = here.mergePoi(d.poi, br.poi);
          d.transit = here.mergeTransit(d.transit, br.transit);
        } else if (ov && ov.v) {
          d.poi = here.mergePoi(d.poi, ov.v.poi);
          d.transit = here.mergeTransit(d.transit, ov.v.transit);
          source = 'here+osm';
          d.hereMeta.fallback = 'overpass-poi';
        }
        if (d.hereMeta) { d.hereMeta.counts = here.counts(d); if (br) d.hereMeta.browse = br.meta; }
        say('Yükselti ve iklim verisi alınıyor…');
        return Promise.all([pElev, pClim]).then((r) => {
          const ent = { key: ekey, data: d, elev: r[0], climate: r[1], demo: false, source: source, iso: iso };
          osm.cachePut(ent);
          return ent;
        });
      });
    });
  };

  /* ==========================================================================
     osm.* SARMALAMA — 64-ctl-site.js değişmeden çalışsın
     ========================================================================== */
  if (!osm.fetchAllOsm) {
    osm.keyOsm = base.key; osm.geocodeOsm = base.geocode; osm.reverseOsm = base.reverse; osm.fetchAllOsm = base.fetchAll;
    // önbellek anahtarları OSM ve HERE verisini karıştırmasın
    osm.key = (lat, lon) => base.key(lat, lon) + (here.active() ? '#h' : '');
    osm.geocode = (q) => (here.active() ? here.geocode(q) : base.geocode(q));
    osm.reverse = (lat, lon) => (here.active() ? here.reverse(lat, lon) : base.reverse(lat, lon));
    osm.fetchAll = (lat, lon, Rf, progress) => (here.active() ? here.fetchAll(lat, lon, Rf, progress) : base.fetchAll(lat, lon, Rf, progress));
  }
  // arayüzde "veri kaynağı" etiketi için
  here.sourceLabel = (ent) => (ent && ent.source === 'here' ? 'HERE' : ent && ent.source === 'here+osm' ? 'HERE + OpenStreetMap' : ent && ent.demo ? 'Demo' : 'OpenStreetMap');
})();
