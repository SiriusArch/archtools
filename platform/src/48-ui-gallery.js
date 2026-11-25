/* ==========================================================================
   48-ui-gallery.js — Araç galerisi: araçlar arası geçiş için hareketli, tam ekran menü
   Araçlar, çizim ızgarası zemini üzerinde yatay dizilmiş "paftalar"dır. Sürükleme / tekerlek / ok tuşlarıyla
   gezilir; paftalar kaydırma hızıyla kâğıt gibi bükülür, imleçle birlikte hafifçe salınır. Seçilen pafta
   ekranı kaplayacak şekilde açılır ve araca geçilir.
   - WebGL (kitaplıksız): pafta düzlemleri + perspektif zemin ızgarası. Dokular 2B tuvale çizilen, temanın
     mürekkep / kâğıt renklerini kullanan aracın küçük çizimleridir (görsel dosyası yok).
   - WebGL yoksa ya da "hareketi azalt" açıksa aynı menü sade bir liste olarak çalışır.
   - Sanal DOM dışındadır (açılış ekranı gibi document.body'ye eklenir); açık değilken hiçbir döngü çalışmaz.
   App.gallery.open(tetikleyiciEl) · App.gallery.close()
   ========================================================================== */
(function () {
  const App = window.App;
  const ASPECT = 0.625;          // pafta yükseklik / genişlik
  const GAP = 1.16;              // paftalar arası mesafe (pafta genişliği biriminde)
  const TW = 960, TH = 600;      // doku boyutu

  /* ---------------- küçük yardımcılar ---------------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeIO = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const rgb = (css) => {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = '#000'; c.fillStyle = css; const m = c.fillStyle;
    if (m[0] === '#') return [parseInt(m.slice(1, 3), 16) / 255, parseInt(m.slice(3, 5), 16) / 255, parseInt(m.slice(5, 7), 16) / 255];
    const p = m.match(/[\d.]+/g) || [0, 0, 0];
    return [p[0] / 255, p[1] / 255, p[2] / 255];
  };
  const cssVar = (n, d) => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || d;
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ---------------- pafta çizimleri (araç başına küçük bir mürekkep çizimi) ---------------- */
  function drawArt(m, i, col) {
    const cv = document.createElement('canvas');
    cv.width = TW; cv.height = TH;
    const c = cv.getContext('2d'), R = rng(i * 7919 + 13);
    c.fillStyle = col.paper; c.fillRect(0, 0, TW, TH);
    // kâğıt ızgarası
    c.fillStyle = col.soft;
    for (let x = 40; x < TW; x += 40) for (let y = 40; y < TH - 60; y += 40) c.fillRect(x - 1, y - 1, 2, 2);
    // büyük sıra numarası
    c.fillStyle = col.faint; c.font = '300 250px ' + col.display; c.textAlign = 'right'; c.textBaseline = 'top';
    c.fillText(m.n, TW - 34, 4);
    const ink = col.ink, acc = col.acc;
    c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 3;
    const cx = TW * 0.44, cy = TH * 0.46;
    const line = (a, b, d, e, w) => { c.lineWidth = w || 3; c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); };
    const disc = (x, y, r, f) => { c.beginPath(); c.arc(x, y, r, 0, 6.2832); if (f) { c.fillStyle = f; c.fill(); } else c.stroke(); };
    const box = (x, y, w, h, f) => { if (f) { c.fillStyle = f; c.fillRect(x, y, w, h); } else c.strokeRect(x, y, w, h); };
    const poly = (pts, f) => { c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); if (f) { c.fillStyle = f; c.fill(); } c.stroke(); };
    const id = m.id;
    if (id === 'islev') {
      const N = [[cx - 150, cy - 40, 92], [cx + 30, cy - 90, 66], [cx + 150, cy + 20, 78], [cx - 10, cy + 90, 56], [cx - 250, cy + 110, 40], [cx + 270, cy - 110, 34]];
      c.setLineDash([2, 12]); [[0, 1], [1, 2], [0, 3], [2, 3], [0, 4], [2, 5]].forEach((e) => line(N[e[0]][0], N[e[0]][1], N[e[1]][0], N[e[1]][1], 3)); c.setLineDash([]);
      line(N[0][0], N[0][1], N[1][0], N[1][1], 7);
      N.forEach((n, k) => { disc(n[0], n[1], n[2], k === 0 ? ink : k === 2 ? acc[0] : k === 3 ? acc[1] : k === 5 ? acc[2] : col.paper); c.lineWidth = 3; c.strokeStyle = ink; disc(n[0], n[1], n[2]); });
    } else if (id === 'kat') {
      c.lineWidth = 9; box(cx - 250, cy - 150, 500, 300);
      line(cx - 60, cy - 150, cx - 60, cy + 30, 6); line(cx - 250, cy + 30, cx + 80, cy + 30, 6); line(cx + 80, cy - 150, cx + 80, cy + 150, 6); line(cx + 80, cy - 20, cx + 250, cy - 20, 6);
      box(cx - 232, cy - 132, 150, 140, col.soft); box(cx + 98, cy - 2, 134, 134, acc[1]);
      c.strokeStyle = ink; c.lineWidth = 3; c.beginPath(); c.arc(cx - 60, cy + 30, 52, 0, 1.5708); c.stroke(); c.beginPath(); c.arc(cx + 80, cy + 76, 44, 3.1416, 4.7124); c.stroke();
      box(cx - 200, cy + 60, 90, 60); disc(cx + 10, cy - 70, 26);
    } else if (id === 'analiz') {
      for (let k = 0; k < 3; k++) { const y = cy + 110 - k * 100; poly([[cx - 220, y], [cx, y - 80], [cx + 220, y], [cx, y + 80]], k === 1 ? acc[0] : k === 2 ? col.paper : col.soft); }
      c.setLineDash([4, 10]); line(cx - 220, cy + 110, cx - 220, cy - 90, 2); line(cx + 220, cy + 110, cx + 220, cy - 90, 2); line(cx, cy + 190, cx, cy - 10, 2); c.setLineDash([]);
    } else if (id === 'arsa') {
      [230, 160, 90].forEach((r, k) => { c.setLineDash(k ? [3, 10] : []); c.lineWidth = k ? 2 : 3; disc(cx, cy, r); }); c.setLineDash([]);
      for (let k = 0; k < 8; k++) { const a = k * 0.7854 + 0.3; line(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40, cx + Math.cos(a) * (120 + R() * 110), cy + Math.sin(a) * (120 + R() * 110), k % 3 ? 3 : 8); }
      poly([[cx - 34, cy - 26], [cx + 30, cy - 34], [cx + 40, cy + 26], [cx - 28, cy + 34]], acc[2]);
      for (let k = 0; k < 9; k++) { const a = R() * 6.28, r = 70 + R() * 150; disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 7, k % 2 ? acc[0] : ink); }
    } else if (id === 'imar') {
      poly([[cx - 240, cy + 120], [cx - 180, cy - 130], [cx + 200, cy - 150], [cx + 250, cy + 100]], col.soft);
      c.setLineDash([10, 8]); poly([[cx - 180, cy + 76], [cx - 134, cy - 90], [cx + 160, cy - 106], [cx + 196, cy + 62]]); c.setLineDash([]);
      poly([[cx - 90, cy + 30], [cx - 60, cy - 60], [cx + 90, cy - 70], [cx + 110, cy + 20]], ink);
      poly([[cx - 60, cy - 60], [cx - 60, cy - 130], [cx + 90, cy - 140], [cx + 90, cy - 70]], acc[1]); poly([[cx + 90, cy - 70], [cx + 90, cy - 140], [cx + 110, cy - 50], [cx + 110, cy + 20]], col.paper);
    } else if (id === 'yer') {
      for (let x = 0; x < 9; x++) for (let y = 0; y < 5; y++) { const v = Math.max(0, 1 - Math.hypot(x - 5.4, y - 1.8) / 4 + (R() - 0.5) * 0.3); c.globalAlpha = 0.08 + v * 0.85; box(cx - 270 + x * 60, cy - 150 + y * 60, 54, 54, ink); }
      c.globalAlpha = 1; disc(cx + 54, cy - 42, 30, acc[2]); c.strokeStyle = col.paper; c.lineWidth = 5; disc(cx + 54, cy - 42, 30); c.strokeStyle = ink;
      disc(cx - 150, cy + 70, 14, acc[0]); disc(cx + 200, cy + 100, 14, acc[1]);
    } else if (id === 'tasarim') {
      for (let k = 0; k < 6; k++) { const y = cy + 150 - k * 46; poly([[cx - 250, y], [cx - 130, y - 44], [cx - 10, y], [cx - 130, y + 44]], k === 5 ? acc[0] : k % 2 ? col.soft : col.paper); }
      c.lineWidth = 8; box(cx + 60, cy - 130, 220, 260); line(cx + 170, cy - 130, cx + 170, cy + 130, 5); line(cx + 60, cy, cx + 280, cy, 5); box(cx + 150, cy - 30, 40, 60, ink);
    } else if (id === 'fizibilite') {
      [70, 130, 96, 190, 150, 240, 210].forEach((hh, k) => box(cx - 250 + k * 72, cy + 140 - hh, 48, hh, k === 5 ? acc[1] : k % 2 ? ink : col.soft));
      line(cx - 270, cy + 140, cx + 270, cy + 140, 4); c.strokeStyle = acc[2]; c.lineWidth = 6; c.beginPath(); [[-250, 90], [-150, 40], [-60, 60], [40, -30], [130, -10], [250, -120]].forEach((p, k) => (k ? c.lineTo(cx + p[0], cy + p[1]) : c.moveTo(cx + p[0], cy + p[1]))); c.stroke(); c.strokeStyle = ink;
    } else if (id === 'vaziyet') {
      c.lineWidth = 34; c.strokeStyle = col.soft; c.beginPath(); c.moveTo(cx - 300, cy + 60); c.bezierCurveTo(cx - 100, cy + 20, cx + 60, cy + 150, cx + 300, cy + 90); c.stroke(); c.strokeStyle = ink;
      box(cx - 220, cy - 150, 150, 110, ink); poly([[cx - 20, cy - 140], [cx + 130, cy - 150], [cx + 150, cy - 30], [cx + 30, cy - 10]], col.paper); box(cx + 180, cy - 120, 80, 150, acc[0]);
      for (let k = 0; k < 11; k++) disc(cx - 260 + k * 52 + R() * 14, cy + 150 + R() * 26 - 13, 15 + R() * 8, k % 4 === 0 ? acc[1] : col.soft);
      c.setLineDash([12, 9]); c.lineWidth = 3; box(cx - 280, cy - 180, 560, 380); c.setLineDash([]);
    } else if (id === 'kolaj') {
      c.save(); c.translate(cx - 110, cy - 10); c.rotate(-0.12); box(-130, -110, 260, 220, col.soft); c.strokeRect(-130, -110, 260, 220); c.restore();
      disc(cx + 90, cy - 60, 96, acc[2]); c.save(); c.translate(cx + 130, cy + 70); c.rotate(0.16); box(-110, -70, 220, 140, ink); c.restore();
      poly([[cx - 230, cy + 150], [cx - 110, cy + 20], [cx + 10, cy + 150]], acc[1]); line(cx - 260, cy - 150, cx + 40, cy - 120, 6);
    } else if (id === 'pafta') {
      c.lineWidth = 5; box(cx - 270, cy - 170, 540, 340); box(cx - 250, cy - 150, 300, 190, ink); box(cx + 70, cy - 150, 180, 90, col.soft); box(cx + 70, cy - 40, 180, 80, acc[0]);
      box(cx - 250, cy + 60, 140, 90, col.soft); box(cx - 90, cy + 60, 140, 90, acc[1]); for (let k = 0; k < 4; k++) line(cx + 76, cy + 74 + k * 22, cx + 250 - (k % 2) * 50, cy + 74 + k * 22, 4);
    } else { // kent ve tanımsız araçlar: dolu–boş kent dokusu
      c.save(); c.translate(cx, cy); c.rotate(-0.2);
      for (let x = -5; x < 5; x++) for (let y = -3; y < 3; y++) {
        if ((x === 0 && y > -2) || y === 0) continue;
        const bw = 58, bh = 62, n = 1 + Math.floor(R() * 3);
        for (let k = 0; k < n; k++) { const w = (bw - 8) / n; const hh = 18 + R() * (bh - 26); box(x * 70 + 6 + k * w, y * 76 + 8 + (R() < 0.5 ? 0 : bh - hh - 8), w - 5, hh, R() < 0.08 ? acc[Math.floor(R() * 3)] : ink); }
      }
      c.restore();
    }
    // lejant şeridi
    c.fillStyle = col.paper; c.fillRect(0, TH - 62, TW, 62); c.fillStyle = ink; c.fillRect(34, TH - 62, TW - 68, 2);
    c.textBaseline = 'middle'; c.textAlign = 'left'; c.font = '400 22px ' + col.display; c.fillText(m.label, 34, TH - 30);
    c.textAlign = 'right'; c.font = '700 15px ' + col.body; c.fillStyle = col.ink2; c.fillText('archtools · ' + m.n, TW - 34, TH - 30);
    if (m.closed) { // kapalı araç: pafta soluk, ortada "KAPALI" damgası
      c.fillStyle = 'rgba(246,247,249,.72)'; c.fillRect(0, 0, TW, TH - 62);
      c.save(); c.translate(TW / 2, (TH - 62) / 2); c.rotate(-0.12);
      c.font = '800 58px ' + col.body; c.textAlign = 'center'; c.textBaseline = 'middle';
      const tw = c.measureText('KAPALI').width + 72;
      c.lineWidth = 6; c.strokeStyle = '#C03A22'; c.strokeRect(-tw / 2, -50, tw, 100);
      c.fillStyle = '#C03A22'; c.fillText('KAPALI', 0, 2);
      c.font = '700 18px ' + col.body; c.fillStyle = ink; c.fillText('Bakımda · geçici olarak kullanılamıyor', 0, 92);
      c.restore();
    }
    return cv;
  }

  /* ---------------- WebGL ---------------- */
  const VS = 'attribute vec2 aPos;uniform float uX,uVel,uTime,uSeed,uOpen,uIntro,uAspect,uCy;uniform vec2 uTilt,uView;varying vec2 vUv;varying float vShade;' +
    'void main(){float wx=uX+aPos.x;float idle=sin(wx*2.4+uTime*.6+uSeed)*.03;float bend=uVel*sin(wx*2.83)*.38;' +
    'float z=idle+bend+uVel*sin(aPos.y*3.1+wx)*.05-wx*wx*.085;float dz=.03*2.4*cos(wx*2.4+uTime*.6+uSeed)+uVel*2.83*.38*cos(wx*2.83)-.17*wx;' +
    'vec3 w=vec3(wx,aPos.y*uAspect+sin(uTime*.5+uSeed*3.)*.012,z);float a=uTilt.x*.13,b=uTilt.y*.09;' +
    'w=vec3(w.x*cos(a)+w.z*sin(a),w.y,-w.x*sin(a)+w.z*cos(a));w=vec3(w.x,w.y*cos(b)-w.z*sin(b),w.y*sin(b)+w.z*cos(b));' +
    'w.y-=(1.-uIntro)*(1.1+uSeed*.5);float p=1./(1.-w.z*.34);vec2 clip=vec2(w.x*uView.x,w.y*uView.y+uCy)*p;clip=mix(clip,aPos*2.,uOpen);' +
    'gl_Position=vec4(clip,0.,1.);vUv=aPos+.5;vShade=mix(clamp(1.-abs(dz)*.42+dz*.14,.55,1.08),1.,uOpen);}';
  // köşe ve parça gölgelendiricideki ortak adlı uniform'lar farklı hassasiyetle bağlanamaz; bu yüzden burada F ekiyle ayrıdır
  const FS = 'precision mediump float;uniform sampler2D uTex;uniform float uVelF,uFocus,uOpenF,uAlpha,uAspectF;uniform vec3 uBg;varying vec2 vUv;varying float vShade;' +
    'float rb(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}' +
    'void main(){vec2 uv=vec2(vUv.x,1.-vUv.y);float s=uVelF*.012;vec3 c=vec3(texture2D(uTex,uv+vec2(s,0.)).r,texture2D(uTex,uv).g,texture2D(uTex,uv-vec2(s,0.)).b);' +
    'c*=vShade;c=mix(mix(c,uBg,.5),c,uFocus);vec2 p=(vUv-.5)*vec2(1.,uAspectF);float d=rb(p,vec2(.5,.5*uAspectF),mix(.04,0.,uOpenF));' +
    'float al=(1.-smoothstep(-.004,0.,d))*uAlpha;gl_FragColor=vec4(c*al,al);}';
  const GVS = 'attribute vec2 aPos;varying vec2 vP;void main(){vP=aPos*2.;gl_Position=vec4(aPos*2.,0.,1.);}';
  const GFS = 'precision mediump float;varying vec2 vP;uniform float uScroll,uHorizon,uRatio,uAlpha;uniform vec2 uTilt;uniform vec3 uInk;' +
    'void main(){float y=uHorizon-vP.y+uTilt.y*.03;if(y<.004){gl_FragColor=vec4(0.);return;}float dp=.34/y;' +
    'vec2 g=vec2((vP.x*uRatio+uTilt.x*.2)*dp*1.5+uScroll,dp*1.5);vec2 f=abs(fract(g)-.5);float w=.0045*dp+.0016;' +
    'float l=1.-smoothstep(.5-w,.5-w*.35,max(f.x,f.y));l=1.-l;float fade=clamp(y*2.6,0.,1.)*clamp(1.-dp*.045,0.,1.);float al=l*fade*uAlpha*.34;gl_FragColor=vec4(uInk*al,al);}';

  function program(gl, vs, fs) {
    const mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) || 'shader'); return o; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p: p, u: u, a: gl.getAttribLocation(p, 'aPos') };
  }

  /* ---------------- durum ---------------- */
  const G = { el: null, gl: null, open: false, mods: [], pos: 0, target: 0, vel: 0, tilt: [0, 0], tiltT: [0, 0], raf: 0, t0: 0, cur: -1 };

  function build() {
    const el = document.createElement('div');
    el.id = 'tg'; el.className = 'tg'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Araçlar');
    el.innerHTML = '<canvas class="tg-gl" aria-hidden="true"></canvas>' +
      '<div class="tg-top"><span class="tg-brand">archtools</span><span class="tg-count mono" aria-hidden="true"></span>' +
      '<button type="button" class="tg-close"><span>Kapat</span><kbd>Esc</kbd></button></div>' +
      '<div class="tg-title"><span class="tg-n mono" aria-hidden="true"></span><h2 class="tg-h"><span class="tg-hi"></span></h2><p class="tg-sub"></p>' +
      '<button type="button" class="tg-go"><span>Aracı aç</span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>' +
      '<nav class="tg-list" aria-label="Araç listesi"></nav>' +
      '<div class="tg-foot"><span class="tg-hint">Sürükleyin · kaydırın · ← → · Enter</span><span class="tg-bar" aria-hidden="true"><i></i></span></div>';
    document.body.appendChild(el);
    G.el = el;
    G.cv = el.querySelector('.tg-gl');
    G.list = el.querySelector('.tg-list');
    el.querySelector('.tg-close').onclick = close;
    el.querySelector('.tg-go').onclick = () => choose(Math.round(G.target));
    bind(el);
  }

  function initGL() {
    if (G.gl || G.noGL) return;
    try {
      const gl = G.cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
      if (!gl) throw new Error('webgl yok');
      G.prog = program(gl, VS, FS); G.grid = program(gl, GVS, GFS);
      const NX = 36, NY = 20, v = [], ix = [];
      for (let y = 0; y <= NY; y++) for (let x = 0; x <= NX; x++) v.push(x / NX - 0.5, y / NY - 0.5);
      for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { const a = y * (NX + 1) + x, b = a + NX + 1; ix.push(a, a + 1, b, a + 1, b + 1, b); }
      G.vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, G.vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
      G.ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, G.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ix), gl.STATIC_DRAW);
      G.nIx = ix.length;
      G.qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, G.qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST);
      G.gl = gl; G.tex = [];
      G.cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.gl = null; G.noGL = true; G.el.classList.add('tg-flat'); });
    } catch (e) { G.noGL = true; G.err = String((e && e.message) || e); G.el.classList.add('tg-flat'); }
  }

  function textures() {
    const gl = G.gl;
    if (!gl) return;
    const col = {
      paper: cssVar('--bg-2', '#F6F7F9'), ink: cssVar('--ink', '#17181B'), ink2: cssVar('--ink-2', '#686B73'),
      soft: cssVar('--line', 'rgba(23,24,27,.09)'), faint: cssVar('--inset-bg', 'rgba(23,24,27,.035)'),
      acc: [cssVar('--sw1', '#0477BF'), cssVar('--sw2', '#EAAE1B'), cssVar('--sw3', '#C03A22')],
      display: cssVar('--f-display', 'sans-serif'), body: cssVar('--f-body', 'sans-serif')
    };
    G.bg = rgb(cssVar('--bg', '#E4E5E9')); G.ink = rgb(col.ink);
    G.mods.forEach((m, i) => {
      const t = G.tex[i] || (G.tex[i] = gl.createTexture());
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawArt(m, i, col));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });
  }

  function layout() {
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    G.w = w; G.h = h;
    G.cardW = w < 720 ? Math.min(w * 0.8, h * 0.42 / ASPECT) : clamp(Math.min(w * 0.44, h * 0.5 / ASPECT), 300, 760);
    G.cy = w < 720 ? 0.34 : 0.26; // paftaların düşey merkezi (klip uzayı)
    if (G.cv.width !== Math.round(w * dpr) || G.cv.height !== Math.round(h * dpr)) { G.cv.width = Math.round(w * dpr); G.cv.height = Math.round(h * dpr); }
    if (G.gl) G.gl.viewport(0, 0, G.cv.width, G.cv.height);
  }

  /* ---------------- çizim döngüsü ---------------- */
  function frame(now) {
    if (!G.open) return;
    G.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (G.last || now)) / 1000); G.last = now;
    const t = (now - G.t0) / 1000;
    const prev = G.pos;
    if (G.reduce) G.pos = G.target; else G.pos += (G.target - G.pos) * (1 - Math.pow(0.0009, dt));
    const v = dt > 0 ? (G.pos - prev) / dt : 0;
    G.vel += (clamp(v * 0.22, -1.1, 1.1) - G.vel) * (1 - Math.pow(0.002, dt));
    G.tilt[0] += (G.tiltT[0] - G.tilt[0]) * (1 - Math.pow(0.02, dt)); G.tilt[1] += (G.tiltT[1] - G.tilt[1]) * (1 - Math.pow(0.02, dt));
    // sürükleme bitince en yakın paftaya otur
    if (!G.drag && G.settleAt && now > G.settleAt) { G.target = clamp(Math.round(G.target), 0, G.mods.length - 1); G.settleAt = 0; }
    const cur = clamp(Math.round(G.pos), 0, G.mods.length - 1);
    if (cur !== G.cur) setCurrent(cur);
    G.el.style.setProperty('--tg-p', String(G.mods.length > 1 ? clamp(G.pos / (G.mods.length - 1), 0, 1) : 1));
    const gl = G.gl;
    if (!gl) return;
    const intro = ease((t - 0.05) / 0.9), op = G.openAt ? easeIO((now - G.openAt) / 620) : 0;
    const sway = G.reduce ? [0, 0] : [G.tilt[0] + Math.sin(t * 0.45) * 0.12, G.tilt[1] + Math.cos(t * 0.37) * 0.1];
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    // zemin ızgarası
    gl.useProgram(G.grid.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.qb); gl.enableVertexAttribArray(G.grid.a); gl.vertexAttribPointer(G.grid.a, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(G.grid.u.uScroll, G.pos * GAP * 0.62); gl.uniform1f(G.grid.u.uHorizon, G.cy - (G.cardW * ASPECT / G.h) * 0.72);
    gl.uniform1f(G.grid.u.uRatio, G.w / G.h); gl.uniform1f(G.grid.u.uAlpha, intro * (1 - op)); gl.uniform2f(G.grid.u.uTilt, sway[0], sway[1]); gl.uniform3fv(G.grid.u.uInk, G.ink);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // paftalar: uzaktakiler önce
    const P = G.prog;
    gl.useProgram(P.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, G.ib); gl.enableVertexAttribArray(P.a); gl.vertexAttribPointer(P.a, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(P.u.uVel, G.reduce ? 0 : G.vel); gl.uniform1f(P.u.uVelF, G.reduce ? 0 : G.vel); gl.uniform1f(P.u.uAspectF, ASPECT); gl.uniform1f(P.u.uTime, G.reduce ? 0 : t); gl.uniform1f(P.u.uAspect, ASPECT); gl.uniform1f(P.u.uCy, G.cy);
    gl.uniform2f(P.u.uTilt, sway[0], sway[1]); gl.uniform2f(P.u.uView, G.cardW / (G.w / 2), G.cardW / (G.h / 2)); gl.uniform3fv(P.u.uBg, G.bg); gl.uniform1i(P.u.uTex, 0);
    const order = G.mods.map((m, i) => i).sort((a, b) => Math.abs(b - G.pos) - Math.abs(a - G.pos));
    order.forEach((i) => {
      const x = (i - G.pos) * GAP;
      if (Math.abs(x) > 4.5) return;
      const chosen = G.openAt && i === G.chosen;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.tex[i]);
      gl.uniform1f(P.u.uX, x); gl.uniform1f(P.u.uSeed, (i * 1.7) % 3);
      gl.uniform1f(P.u.uIntro, ease((t - 0.05 - Math.min(Math.abs(i - G.start), 4) * 0.07) / 0.85));
      gl.uniform1f(P.u.uFocus, 1 - clamp(Math.abs(i - G.pos), 0, 1) * 0.9);
      gl.uniform1f(P.u.uOpen, chosen ? op : 0); gl.uniform1f(P.u.uOpenF, chosen ? op : 0); gl.uniform1f(P.u.uAlpha, chosen ? 1 : 1 - op);
      gl.drawElements(gl.TRIANGLES, G.nIx, gl.UNSIGNED_SHORT, 0);
    });
  }

  function setCurrent(i) {
    G.cur = i;
    const m = G.mods[i], el = G.el;
    el.querySelector('.tg-n').textContent = m.n;
    el.querySelector('.tg-sub').textContent = m.sub.split(' · ').slice(1).join(' · ') || m.sub;
    el.querySelector('.tg-count').textContent = m.n + ' — ' + G.mods[G.mods.length - 1].n;
    const hi = el.querySelector('.tg-hi');
    hi.textContent = m.label;
    hi.classList.remove('in'); void hi.offsetWidth; hi.classList.add('in');
    el.querySelector('.tg-go').classList.toggle('here', m.id === G.active);
    el.querySelector('.tg-go').classList.toggle('closed', !!m.closed);
    el.querySelector('.tg-go').setAttribute('aria-disabled', m.closed ? 'true' : 'false');
    el.querySelector('.tg-go span').textContent = m.closed ? 'Şu an kapalı' : m.id === G.active ? 'Bu araçtasınız' : 'Aracı aç';
    Array.prototype.forEach.call(G.list.children, (b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-current', k === i ? 'true' : 'false'); });
  }

  /* ---------------- etkileşim ---------------- */
  function goTo(i) { G.target = clamp(i, 0, G.mods.length - 1); G.settleAt = 0; }
  function choose(i) {
    if (G.openAt) return;
    i = clamp(i, 0, G.mods.length - 1);
    const m = G.mods[i];
    if (m.closed) { goTo(i); const b = G.el.querySelector('.tg-go'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; } // kapalı araç açılmaz
    if (m.id === G.active) { close(); return; }
    goTo(i);
    G.chosen = i;
    const fly = G.gl && !G.reduce;
    if (fly) { G.openAt = performance.now() + 140; G.el.classList.add('going'); }
    setTimeout(function () {
      App.ctl.go(m.id, { instant: true });
      close(true);
    }, fly ? 720 : 0);
  }
  function bind(el) {
    let sx = 0, st = 0, moved = 0, lastX = 0, lastT = 0, vx = 0;
    el.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button') || G.openAt) return;
      G.drag = true; sx = lastX = e.clientX; st = G.target; moved = 0; vx = 0; lastT = e.timeStamp; G.settleAt = 0;
      el.classList.add('grab');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* yok */ }
    });
    el.addEventListener('pointermove', function (e) {
      G.tiltT = [(e.clientX / G.w - 0.5) * 2, (e.clientY / G.h - 0.5) * 2];
      if (!G.drag) return;
      const dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx));
      const dt = Math.max(1, e.timeStamp - lastT); vx = (e.clientX - lastX) / dt; lastX = e.clientX; lastT = e.timeStamp;
      let tg = st - dx / (G.cardW * GAP * 0.9);
      const n = G.mods.length - 1;
      if (tg < 0) tg *= 0.35; else if (tg > n) tg = n + (tg - n) * 0.35; // uçlarda lastik etkisi
      G.target = tg;
    });
    const up = function (e) {
      if (!G.drag) return;
      G.drag = false; el.classList.remove('grab');
      if (moved < 6) { // tıklama: pafta seçimi
        const i = Math.round(G.pos + (e.clientX - G.w / 2) / (G.cardW * GAP));
        const cyPx = G.h / 2 - G.cy * G.h / 2;
        if (i >= 0 && i < G.mods.length && Math.abs(e.clientY - cyPx) < G.cardW * ASPECT * 0.56) { if (i === Math.round(G.pos)) choose(i); else goTo(i); }
        return;
      }
      G.target = clamp(Math.round(G.target - vx * 0.35), 0, G.mods.length - 1);
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (G.openAt) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      G.target = clamp(G.target + d * (e.deltaMode ? 0.12 : 0.0022), -0.25, G.mods.length - 0.75);
      G.settleAt = performance.now() + 160;
    }, { passive: false });
    el.addEventListener('keydown', function (e) {
      const k = e.key;
      if (k === 'Escape') { e.preventDefault(); close(); }
      else if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); goTo(Math.round(G.target) + 1); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); goTo(Math.round(G.target) - 1); }
      else if (k === 'Home') { e.preventDefault(); goTo(0); }
      else if (k === 'End') { e.preventDefault(); goTo(G.mods.length - 1); }
      else if (k === 'Enter' && !e.target.closest('button')) { e.preventDefault(); choose(Math.round(G.target)); }
      else if (k === 'Tab') { // odak pencerenin içinde döner
        const f = el.querySelectorAll('button'), a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
    window.addEventListener('resize', function () { if (G.open) layout(); });
  }

  /* ---------------- aç / kapat ---------------- */
  function open(trigger) {
    if (G.open) return;
    if (!G.el) build();
    const ui = App.ui, state = App.store.get();
    G.mods = ui.MODULES; G.active = state.ui.module; G.trigger = trigger || null;
    G.reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    G.start = Math.max(0, G.mods.findIndex((m) => m.id === G.active));
    G.pos = G.target = G.start; G.vel = 0; G.cur = -1; G.openAt = 0; G.chosen = -1; G.settleAt = 0; G.drag = false; G.last = 0;
    G.tilt = [0, 0]; G.tiltT = [0, 0];
    G.list.textContent = '';
    G.mods.forEach(function (m, i) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tg-li';
      b.innerHTML = '<span class="mono"></span><b></b>';
      b.firstChild.textContent = m.n; b.lastChild.textContent = m.label;
      if (m.closed) { b.classList.add('closed'); const t = document.createElement('i'); t.className = 'tg-closed'; t.textContent = 'Kapalı'; b.appendChild(t); b.title = m.label + ' — şu an kapalı'; }
      b.onclick = function () { if (Math.round(G.target) === i) choose(i); else goTo(i); };
      b.onfocus = function () { if (!G.drag) goTo(i); };
      G.list.appendChild(b);
    });
    G.el.hidden = false; G.el.classList.remove('going', 'out'); G.el.classList.toggle('tg-reduce', G.reduce);
    initGL(); layout(); textures();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (G.open) textures(); });
    setCurrent(G.start);
    const root = document.getElementById('root');
    if (root) { root.setAttribute('inert', ''); root.setAttribute('aria-hidden', 'true'); }
    document.documentElement.classList.add('tg-lock');
    G.open = true; G.t0 = performance.now();
    requestAnimationFrame(function () { G.el.classList.add('in'); });
    G.raf = requestAnimationFrame(frame);
    try { G.list.children[G.start].focus({ preventScroll: true }); } catch (e) { /* odak yok */ }
  }
  function close(quick) {
    if (!G.open) return;
    G.open = false;
    cancelAnimationFrame(G.raf);
    const el = G.el, root = document.getElementById('root');
    if (root) { root.removeAttribute('inert'); root.removeAttribute('aria-hidden'); }
    document.documentElement.classList.remove('tg-lock');
    el.classList.add('out'); el.classList.remove('in');
    setTimeout(function () { if (!G.open) { el.hidden = true; el.classList.remove('out', 'going', 'grab'); } }, quick === true ? 260 : 360);
    if (G.trigger && quick !== true) { try { G.trigger.focus({ preventScroll: true }); } catch (e) { /* yok */ } }
  }

  App.gallery = { open: open, close: close, isOpen: function () { return G.open; }, glError: function () { return G.err || null; } };
})();
