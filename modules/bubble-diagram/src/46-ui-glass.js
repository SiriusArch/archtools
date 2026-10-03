/* ==========================================================================
   46-ui-glass.js — "glass" teması için kabuk bileşenleri
   Üst bar (kapsül), skor kadranı, yüzen araç çubuğu ve "Beni renklendir!" anahtarı.
   Sol panel ve asistan aynı bileşenleri kullanır; görünümü CSS (styles.glass.css) belirler.
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const glass = (ui.glass = {});

  /* --- yuvarlak ikon düğmesi (etiket ipucu olarak gösterilir) --- */
  function gbtn(icon, label, opts) {
    opts = opts || {};
    return h('button', { type: 'button', class: 'gb' + (opts.cls ? ' ' + opts.cls : ''), onclick: opts.onclick, disabled: !!opts.disabled, 'aria-label': label, 'data-tip': label, title: opts.title || label, 'aria-pressed': opts.pressed == null ? null : String(!!opts.pressed) },
      ui.icon(icon, opts.size || 18),
      opts.badge ? h('span', { class: 'badge' + (opts.badgePulse ? ' pulse-badge' : '') }, opts.badge) : null);
  }

  // Sadeleştirilmiş logo: üç geometrik form, tek renk
  glass.logo = function () {
    return h('svg', { viewBox: '0 0 40 40', width: 34, height: 34, class: 'glogo', 'aria-hidden': 'true' },
      h('circle', { cx: 15, cy: 15, r: 9.5, fill: 'currentColor', opacity: 0.9 }),
      h('rect', { x: 19, y: 19, width: 17, height: 17, rx: 4, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2 }),
      h('path', { d: 'M5 36l7-12 7 12z', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linejoin': 'round', opacity: 0.55 }));
  };

  /* --- tema anahtarı: glass'ta "Beni renklendir!", Bauhaus'ta "Sadeleştir" --- */
  ui.themeToggle = function (state) {
    const toGlass = App.theme.name === 'bauhaus';
    if (toGlass) {
      return h('button', { type: 'button', class: 'btn btn-theme', onclick: App.ctl.toggleStyle, title: 'Renkleri kaldır, sade cam görünüme dön' },
        h('span', { class: 'theme-dots', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {})),
        h('span', {}, 'Sadeleştir'));
    }
    return h('button', { type: 'button', class: 'gcolor', onclick: App.ctl.toggleStyle, title: 'Şemayı Bauhaus renkleriyle boya' },
      h('span', { class: 'gcolor-dots', 'aria-hidden': 'true' }, h('i', {}), h('i', {}), h('i', {})),
      h('span', {}, 'Beni renklendir!'));
  };

  glass.header = function (state, d) {
    const ctl = App.ctl;
    const meta = state.project.meta;
    const issues = d.analysis.counts.hata + d.analysis.counts.uyari;
    return h('header', { class: 'gh' },
      h('div', { class: 'gh-brand' },
        glass.logo(),
        h('h1', { class: 'gh-title' }, 'işlev şeması')),
      h('div', { class: 'gh-name' },
        h('label', { class: 'sr', for: 'project-name' }, 'Proje adı'),
        h('input', { id: 'project-name', class: 'ginput', type: 'text', maxlength: 80, value: meta.name, keep: true, autocomplete: 'off', placeholder: 'Proje adı', onchange: (e) => ctl.dispatch({ type: 'SET_META', patch: { name: e.target.value.trim() || 'Adsız proje' } }) }),
        meta.example ? h('span', { class: 'gh-tag', title: 'Bu proje bir örnektir. Düzenlemeye başladığınızda kendi projeniz olur.' }, 'örnek') : null),
      h('div', { class: 'gh-actions', role: 'toolbar', 'aria-label': 'Proje işlemleri' },
        gbtn('newdoc', 'Yeni proje', { onclick: ctl.newProject, title: 'Boş proje başlat (geri alınabilir)' }),
        gbtn('save', 'Kaydet', { onclick: ctl.saveJSON, title: 'Projeyi bilgisayara JSON olarak indir' }),
        gbtn('open', 'Yükle', { onclick: ctl.pickFile, title: 'Kaydedilmiş JSON projesini yükle' }),
        h('span', { class: 'gh-sep', 'aria-hidden': 'true' }),
        h('div', { class: 'gseg', role: 'group', 'aria-label': 'Dışa aktar' },
          h('button', { type: 'button', onclick: ctl.exportPNG, disabled: !!state.ui.busy, title: 'Saf şemayı PNG resmi olarak indir' }, 'PNG'),
          h('button', { type: 'button', onclick: ctl.exportPDF, disabled: !!state.ui.busy, title: 'Saf şemayı A3 PDF olarak indir' }, 'PDF')),
        h('span', { class: 'gh-sep', 'aria-hidden': 'true' }),
        h('button', { type: 'button', class: 'gpill' + (state.ui.assistantOpen ? ' on' : ''), onclick: ctl.toggleAssistant, 'aria-pressed': String(!!state.ui.assistantOpen), title: 'Akıllı öneri panelini aç / kapat' },
          ui.icon('spark', 16), h('span', {}, 'Akıllı öneri'),
          issues ? h('span', { class: 'badge' + (state.ui.assistantOpen ? '' : ' pulse-badge') }, String(issues)) : null)),
      ui.themeToggle(state),
      h('input', { id: 'file-load', class: 'sr', type: 'file', accept: '.json,application/json', tabindex: -1, onchange: ctl.onFile, 'aria-label': 'Proje dosyası seç' }));
  };

  /* --- skor kadranı: kabartmalı yüz, ince ibre (referans görseldeki saat gibi) --- */
  glass.dial = function (state, d) {
    const s = d.score;
    const pc = s.percent;
    const c = s.counts;
    const issues = d.analysis.counts.hata + d.analysis.counts.uyari;
    const msg = pc == null ? 'İlişki ekleyerek skoru başlatın' : pc >= 85 ? 'Çok iyi yerleşim' : pc >= 70 ? 'İyi, birkaç ince ayar kaldı' : pc >= 40 ? 'Güçlü ilişkili daireleri yaklaştırın' : 'Güçlü bağlar çok uzak';
    const R = 44, C = 2 * Math.PI * R, sweep = C * 0.75;
    const val = pc == null ? 0 : pc;
    const ticks = [];
    for (let i = 0; i <= 10; i++) {
      const a = (-135 + i * 27) * Math.PI / 180;
      const major = i % 5 === 0;
      const r1 = 56, r2 = major ? 50 : 53;
      ticks.push(h('line', { key: 't' + i, x1: 60 + Math.sin(a) * r1, y1: 60 - Math.cos(a) * r1, x2: 60 + Math.sin(a) * r2, y2: 60 - Math.cos(a) * r2, stroke: 'currentColor', 'stroke-width': major ? 1.6 : 1, opacity: major ? 0.55 : 0.3, 'stroke-linecap': 'round' }));
    }
    const chip = (label, pair, tail, cls) => h('li', { class: 'gchip' }, h('i', { class: 'gsw ' + cls }), label + ' ', h('b', {}, pair[0] ? pair[1] + '/' + pair[0] : '0'), ' ' + tail);
    return h('section', { class: 'gdial', 'aria-label': 'Verimlilik skoru' },
      h('div', { class: 'gdial-face' },
        h('svg', { viewBox: '0 0 120 120', width: 112, height: 112, role: 'img', 'aria-label': pc == null ? 'Skor yok' : 'Verimlilik yüzde ' + pc },
          ticks,
          h('circle', { cx: 60, cy: 60, r: R, fill: 'none', stroke: 'currentColor', 'stroke-width': 3, opacity: 0.12, 'stroke-linecap': 'round', 'stroke-dasharray': sweep + ' ' + C, transform: 'rotate(135 60 60)' }),
          h('circle', { class: 'gdial-arc', cx: 60, cy: 60, r: R, fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': (sweep * val / 100) + ' ' + C, transform: 'rotate(135 60 60)' }),
          h('g', { class: 'gdial-needle', style: { transform: 'rotate(' + (-135 + 270 * val / 100) + 'deg)', transformOrigin: '60px 60px' } },
            h('line', { x1: 60, y1: 66, x2: 60, y2: 24, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' })),
          h('circle', { cx: 60, cy: 60, r: 4.5, fill: 'currentColor' }),
          h('circle', { cx: 60, cy: 60, r: 1.8, fill: 'var(--dial-pin, #fff)' }))),
      h('div', { class: 'gdial-info', 'aria-live': 'polite' },
        h('div', { class: 'gdial-num' }, pc == null ? '—' : '%' + pc),
        h('p', { class: 'gdial-msg' }, msg),
        h('ul', { class: 'gchips', 'aria-label': 'Skor ayrıntısı' },
          chip('Güçlü', c.strong, 'yakın', 'gsw-strong'),
          chip('Zayıf', c.weak, 'uygun', 'gsw-weak'),
          chip('Ayrı', c.avoid, 'uzak', 'gsw-avoid'),
          s.overlaps.length ? h('li', { class: 'gchip gchip-warn' }, 'Üst üste ', h('b', {}, String(s.overlaps.length))) : null)),
      h('button', { type: 'button', class: 'gissues' + (issues ? ' has' : ''), onclick: App.ctl.openAnalysis },
        issues ? h('b', {}, String(issues)) : ui.icon('check', 15),
        h('span', {}, issues ? 'uyarı ve öneriler' : 'kritik sorun yok')));
  };

  /* --- yüzen araç çubuğu --- */
  glass.dock = function (state, d, attn) {
    const ctl = App.ctl;
    const P = state.project;
    return h('div', { class: 'gdock', role: 'toolbar', 'aria-label': 'Yerleşim araçları' },
      h('button', { type: 'button', class: 'gpill gpill-strong' + (attn ? ' attn' : ''), onclick: ctl.autoLayout, disabled: !P.spaces.length, title: 'İlişkilere göre daireleri otomatik yerleştir' },
        ui.icon('layout', 16), h('span', {}, 'Otomatik yerleştir')),
      h('span', { class: 'gh-sep', 'aria-hidden': 'true' }),
      gbtn('undo', 'Geri al', { onclick: () => ctl.dispatch({ type: 'UNDO' }), disabled: !state.past.length, title: 'Geri al (Ctrl+Z)' }),
      gbtn('redo', 'İleri al', { onclick: () => ctl.dispatch({ type: 'REDO' }), disabled: !state.future.length, title: 'İleri al (Ctrl+Shift+Z)' }));
  };
})();
