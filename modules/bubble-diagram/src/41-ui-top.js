/* ==========================================================================
   41-ui-top.js — üst çubuk: proje, kaydet/yükle, dışa aktar (ayrıntı: 46-ui-glass.js)
   ========================================================================== */
(function () {
  const App = window.App;
  const ui = App.ui;

  ui.header = function (state, d) { return ui.glass.header(state, d); };
  // skor kadranı pafta bölümünün içindedir (ui.glass.dial); ayrı bir şerit yoktur
  ui.scorebar = function () { return null; };
})();
