/* ==========================================================================
   41-ui-top.js — üst çubuk (proje, kaydet/yükle, dışa aktar) ve verimlilik skor şeridi
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;

  ui.header = function (state, d) {
    if (App.theme.name === 'glass') return ui.glass.header(state, d);
    const ctl = App.ctl;
    const meta = state.project.meta;
    const issues = d.analysis.counts.hata + d.analysis.counts.uyari;
    return h('header', { class: 'hdr' },
      h('div', { class: 'hdr-brand' },
        ui.logo(),
        h('div', { class: 'hdr-titles' },
          h('h1', { class: 'hdr-title' }, 'İŞLEV ŞEMASI'),
          h('p', { class: 'hdr-sub' }, 'Bubble diagram simülasyonu'))),
      h('div', { class: 'hdr-name' },
        h('label', { for: 'project-name', class: 'lbl' }, 'Proje adı'),
        h('div', { class: 'hdr-name-row' },
          h('input', { id: 'project-name', class: 'inp', type: 'text', maxlength: 80, value: meta.name, keep: true, autocomplete: 'off', onchange: (e) => ctl.dispatch({ type: 'SET_META', patch: { name: e.target.value.trim() || 'Adsız proje' } }) }),
          meta.example ? h('span', { class: 'tag-example', title: 'Bu proje bir örnektir. Düzenlemeye başladığınızda kendi projeniz olur.' }, 'ÖRNEK') : null)),
      h('div', { class: 'hdr-actions', role: 'toolbar', 'aria-label': 'Proje işlemleri' },
        ui.btn('Yeni', { icon: 'newdoc', onclick: ctl.newProject, title: 'Boş proje başlat (geri alınabilir)', labelCls: 'lbl-hide' }),
        ui.btn('Kaydet', { icon: 'save', onclick: ctl.saveJSON, title: 'Projeyi bilgisayara JSON olarak indir', labelCls: 'lbl-hide' }),
        ui.btn('Yükle', { icon: 'open', onclick: ctl.pickFile, title: 'Kaydedilmiş JSON projesini yükle', labelCls: 'lbl-hide' }),
        h('span', { class: 'sep', 'aria-hidden': 'true' }),
        ui.btn('PNG', { icon: 'image', onclick: ctl.exportPNG, title: 'Saf şemayı PNG resmi olarak indir', cls: 'btn-blue', disabled: !!state.ui.busy }),
        ui.btn('PDF', { icon: 'pdf', onclick: ctl.exportPDF, title: 'Saf şemayı A3 PDF olarak indir', cls: 'btn-blue', disabled: !!state.ui.busy }),
        h('span', { class: 'sep', 'aria-hidden': 'true' }),
        ui.btn('Akıllı öneri', { icon: 'spark', onclick: ctl.toggleAssistant, cls: 'btn-yellow', pressed: state.ui.assistantOpen, badge: issues ? String(issues) : null, badgePulse: !state.ui.assistantOpen, title: 'Akıllı öneri panelini aç / kapat' }),
        h('span', { class: 'sep', 'aria-hidden': 'true' }),
        ui.themeToggle(state)),
      h('input', { id: 'file-load', class: 'sr', type: 'file', accept: '.json,application/json', tabindex: -1, onchange: ctl.onFile, 'aria-label': 'Proje dosyası seç' }));
  };

  ui.scorebar = function (state, d) {
    if (App.theme.name === 'glass') return null; // glass temasında skor kadranı pafta bölümünün içindedir
    const s = d.score;
    const pc = s.percent;
    const level = pc == null ? 'none' : pc >= 70 ? 'good' : pc >= 40 ? 'mid' : 'low';
    const msg = pc == null ? 'İlişki ekleyerek skoru başlatın' : pc >= 85 ? 'Çok iyi yerleşim' : pc >= 70 ? 'İyi, birkaç ince ayar kaldı' : pc >= 40 ? 'Güçlü ilişkili daireleri yaklaştırın' : 'Güçlü bağlar çok uzak';
    const c = s.counts;
    const issues = d.analysis.counts.hata + d.analysis.counts.uyari;
    return h('section', { class: 'scorebar', 'aria-label': 'Verimlilik skoru' },
      h('div', { class: 'score-main score-' + level, 'aria-live': 'polite' },
        h('span', { class: 'lbl' }, 'Verimlilik skoru'),
        h('span', { class: 'score-num' }, pc == null ? '—' : '%' + pc)),
      h('div', { class: 'meter-wrap' },
        h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pc == null ? 0 : pc },
          h('div', { class: 'meter-fill meter-' + level, style: { width: (pc == null ? 0 : pc) + '%' } }),
          h('span', { class: 'tick', style: { left: '40%' } }),
          h('span', { class: 'tick', style: { left: '70%' } })),
        h('p', { class: 'meter-msg' }, msg)),
      h('ul', { class: 'chips', 'aria-label': 'Skor ayrıntısı' },
        h('li', { class: 'chip' }, h('i', { class: 'swatch sw-strong' }), 'Güçlü ', h('b', {}, c.strong[0] ? c.strong[1] + '/' + c.strong[0] : '0'), ' yakın'),
        h('li', { class: 'chip' }, h('i', { class: 'swatch sw-weak' }), 'Zayıf ', h('b', {}, c.weak[0] ? c.weak[1] + '/' + c.weak[0] : '0'), ' uygun'),
        h('li', { class: 'chip' }, h('i', { class: 'swatch sw-avoid' }), 'Ayrı ', h('b', {}, c.avoid[0] ? c.avoid[1] + '/' + c.avoid[0] : '0'), ' uzak'),
        s.overlaps.length ? h('li', { class: 'chip chip-warn' }, 'Üst üste ', h('b', {}, String(s.overlaps.length))) : null),
      h('button', { type: 'button', class: 'issues-btn' + (issues ? ' has-issues' : ''), onclick: App.ctl.openAnalysis },
        issues ? h('b', { class: 'issues-n' }, String(issues)) : ui.icon('check', 16),
        h('span', {}, issues ? ' uyarı · önerileri gör' : ' kritik sorun yok')));
  };
})();
