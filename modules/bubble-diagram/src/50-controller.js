/* ==========================================================================
   50-controller.js — yan etkiler: dışa aktarma, dosya yükleme, animasyon, asistan eylemleri
   ========================================================================== */
(function () {
  const App = window.App;
  const U = App.util;
  const geo = App.geo;
  const ctl = (App.ctl = {});

  ctl.dispatch = (a) => App.store.dispatch(a);
  const get = () => App.store.get();
  const derived = () => App.state.derive(get());

  let toastTimer = null;
  ctl.toast = function (msg, kind) {
    ctl.dispatch({ type: 'TOAST', msg: msg, kind: kind });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ctl.dispatch({ type: 'CLEAR_TOAST' }), 3600);
  };

  // Pafta boyutu: Sığdır (görünür alana) ↔ Geniş (tam genişlik, kaydırılır); tercih tarayıcıda saklanır
  ctl.toggleBoardWide = () => { const v = !get().ui.boardWide; try { window.localStorage.setItem('archtools.boardwide', v ? '1' : '0'); } catch (e) {} ctl.dispatch({ type: 'UI', patch: { boardWide: v } }); };
  ctl.toggleAssistant = () => ctl.dispatch({ type: 'UI', patch: { assistantOpen: !get().ui.assistantOpen } });
  ctl.openAnalysis = () => ctl.dispatch({ type: 'UI', patch: { assistantOpen: true, asTab: 'analysis' } });

  ctl.focusForm = function () {
    ctl.dispatch({ type: 'UI', patch: { tab: 'spaces' } });
    setTimeout(() => { const el = document.getElementById('sp-name'); if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus(); } }, 30);
  };

  /* ---------- tema: "Beni renklendir!" ↔ "Sadeleştir" ---------- */
  const STYLE_KEY = 'archtools.style';
  ctl.applyStyle = function (name) {
    App.theme.set(name);
    document.documentElement.setAttribute('data-style', name);
    try { window.localStorage.setItem(STYLE_KEY, name); } catch (e) {}
    ctl.dispatch({ type: 'UI', patch: { style: name } });
    if (App.paintNow) App.paintNow();
  };
  let switching = false;
  ctl.toggleStyle = function (e) {
    if (switching) return;
    const next = App.theme.name === 'glass' ? 'bauhaus' : 'glass';
    const root = document.documentElement;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const btn = e && e.currentTarget;
    if (!document.startViewTransition || reduce) { ctl.applyStyle(next); return; }
    // açılan daire: düğmenin olduğu yerden tüm sayfaya yayılır
    const r = btn && btn.getBoundingClientRect ? btn.getBoundingClientRect() : { left: innerWidth / 2, top: 0, width: 0, height: 0 };
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.style.setProperty('--vt-x', x + 'px');
    root.style.setProperty('--vt-y', y + 'px');
    root.style.setProperty('--vt-r', Math.ceil(rad) + 'px');
    root.classList.add('vt-reveal');
    switching = true;
    let vt;
    try { vt = document.startViewTransition(function () { ctl.applyStyle(next); }); } catch (err) { switching = false; root.classList.remove('vt-reveal'); ctl.applyStyle(next); return; }
    const done = function () {
      switching = false;
      root.classList.remove('vt-reveal');
      // renklenirken daireler sırayla "açılır"
      root.classList.add('bloom');
      setTimeout(function () { root.classList.remove('bloom'); }, 1400);
    };
    vt.finished.then(done, done);
  };

  /* ---------- mekân ekleme formu ---------- */
  ctl.onNameInput = function (value) {
    const f = get().ui.form;
    const patch = { name: value, error: '' };
    // bilgi tabanındaki bir ada denk gelirse tipik alanı öner
    if (!f.area || f.autoFilled) {
      const v = App.kb.variant(get().project.meta.buildingType, get().project.meta.variant);
      const hit = v.entries.find((e) => U.norm(e.name) === U.norm(value));
      if (hit) { patch.area = String(App.analyze.defaultArea(hit)); patch.autoFilled = true; }
      else if (f.autoFilled) { patch.area = ''; patch.autoFilled = false; }
    }
    ctl.dispatch({ type: 'FORM', patch: patch });
  };

  ctl.addFromForm = function () {
    const f = get().ui.form;
    const name = (f.name || '').trim();
    const area = parseFloat(String(f.area).replace(',', '.'));
    if (!name) { ctl.dispatch({ type: 'FORM', patch: { error: 'Mekân adını yazın.' } }); document.getElementById('sp-name').focus(); return; }
    if (!(area > 0)) { ctl.dispatch({ type: 'FORM', patch: { error: 'Alan 0’dan büyük bir sayı olmalı (m²).' } }); document.getElementById('sp-area').focus(); return; }
    if (area > 100000) { ctl.dispatch({ type: 'FORM', patch: { error: 'Alan en fazla 100.000 m² olabilir.' } }); return; }
    ctl.dispatch({ type: 'ADD_SPACES', list: [{ name: name, area: area }] });
    ctl.dispatch({ type: 'FORM', patch: { name: '', area: '', error: '', autoFilled: false } });
    ctl.dispatch({ type: 'UI', patch: { tab: 'spaces' } });
    ctl.toast('“' + name + '” eklendi (' + U.fmt(area) + ' m²)', 'success');
    setTimeout(() => { const el = document.getElementById('sp-name'); if (el) el.focus(); }, 30);
  };

  ctl.newProject = function () {
    ctl.dispatch({ type: 'LOAD_PROJECT', project: App.state.emptyProject() });
    ctl.toast('Yeni proje açıldı. Önceki proje için Geri al’ı kullanabilirsiniz.');
  };

  ctl.loadTemplate = function (typeKey, variantKey) {
    const p = App.state.createFromTemplate(typeKey, variantKey, {});
    ctl.dispatch({ type: 'LOAD_PROJECT', project: p });
    ctl.dispatch({ type: 'UI', patch: { tab: 'spaces' } });
    ctl.toast(p.meta.name + ' programı yüklendi · ' + p.spaces.length + ' mekân', 'success');
  };

  /* ---------- otomatik yerleştirme (animasyonlu) ---------- */
  let animating = false;
  ctl.autoLayout = function () {
    const st = get();
    if (!st.project.spaces.length || animating) return;
    const k = derived().k;
    const target = App.layout.auto(st.project.spaces, st.project.relations, k, {});
    const from = {};
    st.project.spaces.forEach((s) => (from[s.id] = { x: s.x, y: s.y }));
    ctl.dispatch({ type: 'SNAPSHOT' });
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 1 : 650;
    const t0 = performance.now();
    animating = true;
    (function step(now) {
      const t = U.clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - t, 3);
      const pos = {};
      Object.keys(target).forEach((id) => { if (from[id]) pos[id] = { x: from[id].x + (target[id].x - from[id].x) * e, y: from[id].y + (target[id].y - from[id].y) * e }; });
      ctl.dispatch({ type: 'SET_POSITIONS', positions: pos });
      if (t < 1) requestAnimationFrame(step);
      else {
        animating = false;
        const pc = derived().score.percent;
        ctl.toast(pc == null ? 'Daireler yerleştirildi. İlişki ekleyerek skoru başlatın.' : 'Otomatik yerleştirme tamamlandı · verimlilik %' + pc, 'success');
      }
    })(t0);
  };

  /* ---------- dışa aktarma / kaydet / yükle ---------- */
  function report(res, okMsg) {
    ctl.dispatch({ type: 'UI', patch: { busy: null } });
    if (res && res.ok) ctl.toast(okMsg, 'success');
    else if (res && res.code === 'declined') ctl.toast('İndirme iptal edildi.');
    else ctl.toast('Dosya indirilemedi' + (res && res.message ? ': ' + res.message : '.'), 'error');
  }
  ctl.report = report;
  // label: 'PNG' | 'PDF' · make(project, derived) → Promise<{ok}>
  ctl.runExport = function (label, make) {
    const st = get();
    if (!st.project.spaces.length) { ctl.toast('Önce İşlev Şeması’na en az bir mekân ekleyin.', 'error'); return; }
    ctl.dispatch({ type: 'UI', patch: { busy: label } });
    make(st.project, derived()).then((r) => report(r, label + ' hazır')).catch((e) => report({ ok: false, message: e && e.message }));
  };
  // modül başına dışa aktarıcı: ctl.exporters[modülKimliği](kind: 'png' | 'pdf')
  ctl.exporters = {
    islev: (kind) => ctl.runExport(kind === 'png' ? 'PNG' : 'PDF', (p, d) => (kind === 'png' ? App.files.exportPNG(p, d.k, d.score) : App.files.exportPDF(p, d.k, d.score))),
  };
  const exporter = (kind) => (ctl.exporters[get().ui.module] || ctl.exporters.islev)(kind);
  ctl.exportPNG = () => exporter('png');
  ctl.exportPDF = () => exporter('pdf');
  const JSON_SUFFIX = { islev: undefined, kat: 'kat-etudu', analiz: 'mekan-analizi', arsa: 'arsa-analizi', imar: 'imar-kapasite', yer: 'yer-secimi', tasarim: 'tasarim-uretici', fizibilite: 'maliyet-fizibilite', birim: 'birim-olusturucu', vaziyet: 'vaziyet-plani', kolaj: 'kolaj' };
  ctl.saveJSON = function () {
    const st = get();
    const d = derived();
    App.files.exportJSON(st.project, d.k, d.score, d.analysis.circ, JSON_SUFFIX[st.ui.module]).then((r) => report(r, 'Proje kaydedildi (JSON)'));
  };
  ctl.pickFile = function () { const el = document.getElementById('file-load'); if (el) el.click(); };
  ctl.onFile = function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = function () {
      try {
        const project = App.files.fromJSON(String(rd.result));
        ctl.dispatch({ type: 'LOAD_PROJECT', project: project });
        ctl.toast('“' + project.meta.name + '” yüklendi · ' + project.spaces.length + ' mekân', 'success');
      } catch (err) { ctl.toast(err.message, 'error'); }
    };
    rd.onerror = function () { ctl.toast('Dosya okunamadı.', 'error'); };
    rd.readAsText(file);
    e.target.value = '';
  };

  /* ---------- asistan ---------- */
  ctl.ask = function (q) {
    const st = get();
    ctl.dispatch({ type: 'UI', patch: { assistantOpen: true, asTab: 'ask' } });
    ctl.dispatch({ type: 'CHAT_ADD', msg: { role: 'user', text: q } });
    ctl.scrollChat();
    const d = derived();
    let res;
    try { res = App.assistant.answer(q, { project: st.project, k: d.k, score: d.score, analysis: d.analysis }); }
    catch (err) { res = { blocks: [{ t: 'p', text: 'Bu soruyu yanıtlarken bir sorun oluştu. Soruyu biraz farklı yazmayı deneyin.' }], src: [] }; }
    setTimeout(() => { ctl.dispatch({ type: 'CHAT_ADD', msg: { role: 'bot', blocks: res.blocks, src: res.src } }); ctl.scrollChat(); }, 120);
  };

  ctl.scrollChat = function () {
    setTimeout(() => { const el = document.querySelector('.msgs'); if (el) el.scrollTop = el.scrollHeight; }, 40);
  };

  let hlTimer = null;
  ctl.runAction = function (a) {
    if (a.type === 'addSpaces') {
      ctl.dispatch({ type: 'ADD_SPACES', list: a.list });
      ctl.toast(a.list.length === 1 ? '“' + a.list[0].name + '” eklendi' : a.list.length + ' mekân eklendi', 'success');
    } else if (a.type === 'setArea') {
      ctl.dispatch({ type: 'UPDATE_SPACE', id: a.id, patch: { area: a.area } });
      ctl.toast('Alan ' + U.fmt(a.area) + ' m² olarak güncellendi', 'success');
    } else if (a.type === 'select') {
      ctl.dispatch({ type: 'SELECT', id: a.id });
      ctl.dispatch({ type: 'UI', patch: { tab: 'spaces' } });
      setTimeout(() => { const el = document.getElementById('row-' + a.id); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 40);
    } else if (a.type === 'locate') {
      ctl.dispatch({ type: 'SELECT', id: a.a });
      ctl.dispatch({ type: 'HIGHLIGHT', pair: { a: a.a, b: a.b } });
      clearTimeout(hlTimer);
      hlTimer = setTimeout(() => ctl.dispatch({ type: 'HIGHLIGHT', pair: null }), 3800);
    } else if (a.type === 'autolayout') ctl.autoLayout();
    else if (a.type === 'openMatrix') ctl.dispatch({ type: 'UI', patch: { tab: 'matrix' } });
    else if (a.type === 'focusForm') ctl.focusForm();
    else if (a.type === 'loadTemplate') ctl.loadTemplate(a.typeKey, a.variantKey);
  };

  /* ---------- klavye ---------- */
  ctl.onKey = function (e) {
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); ctl.dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' }); }
    else if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); ctl.dispatch({ type: 'REDO' }); }
    else if (!typing && get().ui.module === 'islev' && (e.key === 'Delete' || e.key === 'Backspace') && get().selectedId) { e.preventDefault(); ctl.dispatch({ type: 'REMOVE_SPACE', id: get().selectedId }); }
    else if (e.key === 'Escape') { if (typing && tag === 'INPUT') e.target.blur(); else if (get().selectedId) ctl.dispatch({ type: 'SELECT', id: null }); }
  };
})();
