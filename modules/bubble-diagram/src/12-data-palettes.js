/* ==========================================================================
   12-data-palettes.js — hazır renk paletleri (colorpalettes.net) · ortak veri
   Her palet 5 renktir: [numara, [hex ×5]]. Kaynak: https://colorpalettes.net/color-palette-<numara>/
   Palet kimliği 'cp<numara>' (örn. 'cp4816'). JSON'a (extensions.colorPalette) kimlik + hex birlikte yazılır;
   böylece dosya bu listeden bağımsız olarak da açılır. Tailwind'e taşırken: theme.extend.colors.palette = App.palettes.byId
   ========================================================================== */
(function () {
  const App = window.App;

  const RAW = [
    [4816, ['#2E3604', '#4E5E07', '#E19D29', '#D8D2CF', '#8D8179']],
    [4815, ['#223125', '#729969', '#A1C0C2', '#E6E7EB', '#F6F6F6']],
    [4814, ['#0B161E', '#51625C', '#A6B9BE', '#D8D2C6', '#4F6734']],
    [4813, ['#2D3939', '#5B6972', '#CFD8DF', '#9DADA3', '#273E20']],
    [4811, ['#624621', '#9F6D2D', '#F8DAB2', '#EEEBE4', '#D2D2D2']],
    [4810, ['#2B3034', '#627C8C', '#989398', '#B9C7D2', '#E93C35']],
    [4809, ['#738488', '#A6B6BA', '#D0D8DA', '#E1DDD7', '#EFECE7']],
    [4808, ['#353C52', '#554A53', '#726364', '#9A686B', '#BA897A']],
    [4807, ['#D1ECE7', '#FEE16C', '#BD7F01', '#A23D01', '#22352C']],
    [4806, ['#E0E5E8', '#DD8607', '#C25006', '#943A02', '#401600']],
    [4805, ['#102020', '#2D4C4F', '#78B4B7', '#D9E9E9', '#83241E']],
    [4804, ['#6F5B42', '#B5A892', '#D2D2D1', '#BEBBB4', '#15160A']],
    [4803, ['#020608', '#1C252B', '#486B85', '#93B4BC', '#CAD2CB']],
    [4802, ['#010A13', '#497683', '#8AB0A5', '#F5E9D4', '#82797A']],
    [4801, ['#031725', '#022E5B', '#499BED', '#A1C6F6', '#DAEAFF']],
    [4800, ['#232E20', '#D2A16E', '#B55E28', '#4F4B40', '#3F2512']],
    [4798, ['#E8E8E8', '#C1C6C9', '#AC2724', '#583E24', '#3E4524']],
    [4797, ['#D1D2D4', '#909483', '#616657', '#C19386', '#B25C40']],
    [4796, ['#FAFAFA', '#D0D2CF', '#575C55', '#86612F', '#52311B']],
    [4794, ['#E3DBD2', '#7F888D', '#324E59', '#011F28', '#000201']],
    [4793, ['#5D6474', '#A7A6B0', '#ECEDE6', '#8CA9BD', '#6498AF']],
    [4792, ['#0B4E65', '#3F7F9E', '#E2C9CA', '#D8A996', '#B47C50']],
    [4791, ['#120223', '#430357', '#6E022F', '#8C0286', '#C40361']],
    [4790, ['#CDB08E', '#BFB6A6', '#AAAAA4', '#4A4944', '#11100B']],
    [4789, ['#8A889E', '#EDD600', '#956B00', '#1A4208', '#051107']],
    [4788, ['#FDFEE8', '#90B1E6', '#4C6794', '#234485', '#000000']],
    [4787, ['#E8EDF0', '#E1E4E3', '#8FA8AE', '#425363', '#A90101']],
    [4783, ['#F7E1D3', '#AFA0A0', '#576071', '#AC6646', '#151A1E']],
    [4780, ['#C3DECE', '#91C2A6', '#165225', '#B62D4F', '#6A1823']],
    [4779, ['#E26858', '#A9A8AD', '#8B4252', '#56334B', '#272C49']],
    [4778, ['#363233', '#613708', '#895C20', '#A38976', '#CABCAC']],
    [4776, ['#54332B', '#943636', '#B26B2F', '#CEA05A', '#5F5949']],
    [4774, ['#242423', '#854D34', '#BB794C', '#DEB308', '#A59257']],
    [4773, ['#191A1E', '#61353B', '#82625A', '#85858F', '#E88538']],
    [4751, ['#4B3831', '#CA4213', '#F98C45', '#CBCBCB', '#C5E4E7']],
    [4750, ['#372E19', '#3F4321', '#93631F', '#F4C579', '#B4B4B4']],
    [4748, ['#5E0208', '#AE3433', '#C9983C', '#888C94', '#D7CCBD']],
    [4746, ['#183716', '#D52217', '#DB5559', '#F3B9CF', '#F2BD03']],
    [4742, ['#120F0A', '#3B200B', '#D76F02', '#FAA718', '#FCCF46']]
  ];

  const list = RAW.map(function (r) {
    return { id: 'cp' + r[0], n: r[0], name: 'Palet #' + r[0], url: 'https://colorpalettes.net/color-palette-' + r[0] + '/', colors: r[1].slice() };
  });
  const byId = {};
  list.forEach(function (p) { byId[p.id] = p; });

  const HEX = /^#[0-9a-f]{6}$/i;
  const rgb = function (hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  // WCAG göreli parlaklık
  const lum = function (hex) {
    const c = rgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = function (a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  App.palettes = {
    source: 'colorpalettes.net',
    list: list,
    byId: byId,
    get: function (id) { return byId[id] || null; },
    isHex: function (v) { return typeof v === 'string' && HEX.test(v); },
    contrast: contrast,
    // zemin renginin üstünde okunaklı yazı rengi: iki aday arasından kontrastı yüksek olan
    textOn: function (fill, dark, light) { return contrast(fill, dark) >= contrast(fill, light) ? dark : light; },
  };
})();
