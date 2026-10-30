/* boot.js — ilk boyamadan önce çalışır (satır içi betik kullanılmaz; katı CSP gerektirir).
   ?intro=0 → açılış animasyonu hiç görünmez. */
(function () {
  try {
    if (new URLSearchParams(location.search).get('intro') === '0') document.documentElement.setAttribute('data-intro', 'off');
  } catch (e) {}
})();
