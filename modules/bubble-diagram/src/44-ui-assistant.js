/* ==========================================================================
   44-ui-assistant.js — Akıllı Öneri paneli (açılır/kapanır): analiz kartları + soru-cevap
   ========================================================================== */
(function () {
  const App = window.App;
  const h = App.h;
  const ui = App.ui;
  const U = App.util;

  function srcChips(list) {
    if (!list || !list.length) return null;
    return h('div', { class: 'src-row' }, h('span', { class: 'src-lbl' }, 'Kaynak'),
      list.filter((c) => App.KB.SOURCES[c]).map((c) => h('span', { key: c, class: 'src-chip', title: App.KB.SOURCES[c].label + ' · ' + App.KB.SOURCES[c].kind + ' · güvenilirlik: ' + App.KB.SOURCES[c].trust }, c)));
  }

  function actionBtns(actions) {
    if (!actions || !actions.length) return null;
    return h('div', { class: 'act-row' }, actions.map((a, i) => h('button', { key: i, type: 'button', class: 'act-btn', onclick: () => App.ctl.runAction(a) }, a.label)));
  }

  function card(item) {
    return h('li', { key: item.id, class: 'card card-' + item.level },
      h('div', { class: 'card-top' }, h('span', { class: 'lvl lvl-' + item.level }, ui.levelLabel[item.level]), h('h3', { class: 'card-title' }, item.title)),
      item.detail ? h('p', { class: 'card-detail' }, item.detail) : null,
      srcChips(item.src),
      actionBtns(item.actions));
  }

  function renderBlock(b, i) {
    if (b.t === 'p') return h('p', { key: i, class: 'msg-p' }, b.text);
    if (b.t === 'ul') return h('ul', { key: i, class: 'msg-ul' }, b.items.map((x, j) => h('li', { key: j }, x)));
    if (b.t === 'ol') return h('ol', { key: i, class: 'msg-ol' }, b.items.map((x, j) => h('li', { key: j }, x)));
    if (b.t === 'kv') return h('dl', { key: i, class: 'msg-kv' }, b.rows.map((r, j) => [h('dt', { key: 'k' + j }, r[0]), h('dd', { key: 'v' + j, class: 'mono' }, r[1])]));
    if (b.t === 'actions') return h('div', { key: i }, actionBtns(b.actions));
    return null;
  }

  function messageView(m, i) {
    if (m.role === 'user') return h('li', { key: i, class: 'msg msg-user' }, m.text);
    return h('li', { key: i, class: 'msg msg-bot' }, m.blocks.map(renderBlock), srcChips(m.src));
  }

  ui.assistant = function (state, d) {
    const ctl = App.ctl;
    const open = state.ui.assistantOpen;
    const tab = state.ui.asTab;
    const a = d.analysis;
    const issues = a.counts.hata + a.counts.uyari;
    const type = App.kb.type(state.project.meta.buildingType);
    const variant = App.kb.variant(state.project.meta.buildingType, state.project.meta.variant);
    const nMsg = state.ui.messages.length;

    const analysis = h('div', { class: 'as-body', id: 'as-analysis' },
      h('p', { class: 'as-context' }, h('b', {}, type.label), ' · ' + variant.label + ' programına göre kontrol edildi.'),
      h('div', { class: 'as-counts' },
        h('span', { class: 'cnt cnt-hata' }, h('b', {}, String(a.counts.hata)), ' hata'),
        h('span', { class: 'cnt cnt-uyari' }, h('b', {}, String(a.counts.uyari)), ' uyarı'),
        h('span', { class: 'cnt cnt-oneri' }, h('b', {}, String(a.counts.oneri)), ' öneri')),
      h('ul', { class: 'cards' }, a.items.map(card)));

    const ask = h('div', { class: 'as-body as-ask' },
      h('ul', { class: 'msgs', 'aria-live': 'polite' },
        nMsg ? state.ui.messages.map(messageView) : h('li', { class: 'msg msg-bot' }, h('p', { class: 'msg-p' }, 'Merhaba. Mekân alanları, komşuluk ilişkileri, sirkülasyon ve yönetmelik sorularınızı yanıtlarım. Aşağıdaki sorulardan birini seçin veya kendi sorunuzu yazın.'))),
      h('div', { class: 'qchips' }, App.assistant.chips.map((c) => h('button', { key: c, type: 'button', class: 'qchip', onclick: () => ctl.ask(c) }, c))),
      h('form', { class: 'ask-form', onsubmit: (e) => { e.preventDefault(); const inp = document.getElementById('ask-input'); const v = inp.value.trim(); if (v) { ctl.ask(v); inp.value = ''; } } },
        h('label', { class: 'sr', for: 'ask-input' }, 'Asistana soru yazın'),
        h('input', { id: 'ask-input', class: 'inp', type: 'text', placeholder: 'Örn. Banyo kaç m² olmalı?', autocomplete: 'off', keep: true }),
        h('button', { type: 'submit', class: 'btn btn-blue', 'aria-label': 'Gönder' }, ui.icon('send', 18))));

    return h('aside', { class: 'assistant' + (open ? ' open' : ''), 'aria-label': 'Akıllı öneri paneli', 'aria-hidden': String(!open) },
      h('div', { class: 'as-inner' },
        h('header', { class: 'as-head' },
          h('div', {}, h('h2', { class: 'as-title' }, 'AKILLI ÖNERİ'), h('p', { class: 'as-sub' }, 'Kitap analizleri ve yönetmelik verisine dayalı asistan')),
          h('button', { type: 'button', class: 'icon-btn', onclick: ctl.toggleAssistant, 'aria-label': 'Paneli kapat', title: 'Paneli kapat' }, ui.icon('close', 18))),
        h('div', { class: 'tabs tabs-sm', role: 'tablist' },
          h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'analysis'), class: 'tab' + (tab === 'analysis' ? ' on' : ''), onclick: () => ctl.dispatch({ type: 'UI', patch: { asTab: 'analysis' } }) }, 'Analiz', issues ? h('span', { class: 'tab-n tab-n-warn' }, String(issues)) : null),
          h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'ask'), class: 'tab' + (tab === 'ask' ? ' on' : ''), onclick: () => ctl.dispatch({ type: 'UI', patch: { asTab: 'ask' } }) }, 'Soru sor')),
        tab === 'analysis' ? analysis : ask));
  };
})();
