// Kentdoku - 3B bağlam modeli (three.js)
// Model birimi metredir. x doğu, y yukarı, z güney.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STYLES, ROAD_W, PATH_CLASSES } from './styles.js';

let renderer, scene, persp, ortho, camera, controls, container, model, sun, size = 1000, isOrtho = false, ro;

function cleanRing(ring) {
  const pts = ring.map(p => new THREE.Vector2(p[0], p[1]));
  if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop();
  return pts;
}
function shapesOf(mp) {
  const out = [];
  for (const poly of mp) {
    const outer = cleanRing(poly[0]);
    if (outer.length < 3) continue;
    const s = new THREE.Shape(outer);
    for (let i = 1; i < poly.length; i++) {
      const hole = cleanRing(poly[i]);
      if (hole.length >= 3) s.holes.push(new THREE.Path(hole));
    }
    out.push(s);
  }
  return out;
}
function extrude(mp, height, base = 0) {
  const geos = [];
  for (const s of shapesOf(mp)) {
    try {
      const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.3, height - base), bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      if (base) g.translate(0, base, 0);
      geos.push(g);
    } catch (e) { /* bozuk geometri atlanır */ }
  }
  return geos;
}
function flat(mp, y) {
  const geos = [];
  for (const s of shapesOf(mp)) {
    try {
      const g = new THREE.ShapeGeometry(s);
      g.rotateX(-Math.PI / 2);
      g.translate(0, y, 0);
      geos.push(g);
    } catch (e) { /* atla */ }
  }
  return geos;
}
function ribbon(lines, y) {
  const pos = [], nor = [], uv = [];
  for (const { coords, width } of lines) {
    const hw = width / 2;
    for (let i = 0; i < coords.length - 1; i++) {
      const [ax, ay] = coords[i], [bx, by] = coords[i + 1];
      let dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy);
      if (len < 0.01) continue;
      dx /= len; dy /= len;
      const ex = dx * hw * 0.5, ey = dy * hw * 0.5; // köşelerde boşluk kalmasın
      const px = -dy * hw, py = dx * hw;
      const A = [ax - ex + px, ay - ey + py], B = [ax - ex - px, ay - ey - py], C = [bx + ex - px, by + ey - py], D = [bx + ex + px, by + ey + py];
      for (const q of [A, B, C, A, C, D]) { pos.push(q[0], y, -q[1]); nor.push(0, 1, 0); uv.push(0, 0); }
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
function mesh(geos, color, name, opts = {}) {
  const list = geos.filter(Boolean);
  if (!list.length) return null;
  const g = list.length === 1 ? list[0] : mergeGeometries(list.map(x => (x.index ? x.toNonIndexed() : x)), false);
  list.forEach(x => x !== g && x.dispose());
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color, roughness: 0.92, metalness: 0, side: opts.flat ? THREE.DoubleSide : THREE.FrontSide,
    polygonOffset: !!opts.flat, polygonOffsetFactor: opts.offset || 0, polygonOffsetUnits: opts.offset || 0
  }));
  m.name = name;
  m.castShadow = !opts.flat;
  m.receiveShadow = true;
  return m;
}

export function init(el) {
  if (renderer) { attach(el); return; }
  container = el;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  persp = new THREE.PerspectiveCamera(35, 1, 1, 50000);
  ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -20000, 50000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b2a6, 1.25));
  sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  setCamera(false);
  ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
}

/** Görünüm DOM'dan çıkıp yeniden oluşturulduğunda tuvali yeni kapsayıcıya taşır */
export function attach(el) {
  if (!renderer || container === el) return;
  container = el;
  el.appendChild(renderer.domElement);
  if (ro) ro.disconnect();
  ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
}
export const ready = () => !!renderer;

function setCamera(o) {
  isOrtho = o;
  camera = o ? ortho : persp;
  if (controls) controls.dispose();
  controls = new OrbitControls(camera, renderer.domElement);
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.addEventListener('change', render);
  resetView();
}
export function setOrtho(o) { setCamera(o); }
export function resetView() {
  const d = size * 1.25;
  camera.position.set(d * 0.72, d * 0.62, d * 0.72);
  controls.target.set(0, 0, 0);
  if (isOrtho) { ortho.zoom = 1; }
  resize();
  controls.update();
  render();
}
function resize() {
  if (!container) return;
  const w = container.clientWidth || 800, h = container.clientHeight || 600;
  renderer.setSize(w, h, false);
  persp.aspect = w / h; persp.updateProjectionMatrix();
  const half = size * 0.78;
  ortho.left = -half * w / h; ortho.right = half * w / h; ortho.top = half; ortho.bottom = -half;
  ortho.updateProjectionMatrix();
  render();
}
export function render() { if (renderer && camera) renderer.render(scene, camera); }

export function build(data, styleKey) {
  const st = STYLES[styleKey] || STYLES.klasik;
  if (model) {
    scene.remove(model);
    model.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
  model = new THREE.Group();
  model.name = 'Kentdoku';
  const { w, h } = data.meta;
  size = Math.max(w, h);
  scene.background = null;

  const ground = new THREE.Mesh(new THREE.BoxGeometry(w, 3, h), new THREE.MeshStandardMaterial({ color: st.bg, roughness: 1 }));
  ground.position.y = -1.5; ground.name = 'Zemin'; ground.receiveShadow = true;
  model.add(ground);

  const add = m => m && model.add(m);
  add(mesh(data.green.filter(f => f.kind === 'tarim').flatMap(f => flat(f.mp, 0.02)), st.farm, 'Tarim', { flat: true, offset: -1 }));
  add(mesh(data.green.filter(f => f.kind !== 'tarim').flatMap(f => flat(f.mp, 0.04)), st.green, 'Yesil_Alan', { flat: true, offset: -2 }));
  add(mesh(data.water.flatMap(f => flat(f.mp, 0.06)), st.water, 'Su', { flat: true, offset: -3 }));

  const roadLines = data.roads.filter(r => r.subtype === 'road' && !PATH_CLASSES.has(r.cls)).map(r => ({ coords: r.coords, width: ROAD_W[r.cls] || 4 }));
  const roadColor = st.road.toUpperCase() === st.bg.toUpperCase() || st.road === '#FFFFFF' && st.bg === '#FFFFFF' ? st.casing : st.road;
  add(mesh([ribbon(roadLines, 0.09)], roadColor === st.bg ? '#CFCFCF' : roadColor, 'Yollar', { flat: true, offset: -4 }));
  const pathLines = data.roads.filter(r => r.subtype === 'road' && PATH_CLASSES.has(r.cls)).map(r => ({ coords: r.coords, width: 1.4 }));
  add(mesh([ribbon(pathLines, 0.08)], st.path, 'Yaya_Yollari', { flat: true, offset: -4 }));
  const railLines = data.roads.filter(r => r.subtype === 'rail').map(r => ({ coords: r.coords, width: 2 }));
  add(mesh([ribbon(railLines, 0.11)], st.rail, 'Rayli_Sistem', { flat: true, offset: -5 }));

  const bGeos = [];
  for (const b of data.buildings) if (!b.usesParts) bGeos.push(...extrude(b.mp, b.height));
  for (const p of data.parts) bGeos.push(...extrude(p.mp, p.height, p.minHeight));
  add(mesh(bGeos, st.b3, 'Binalar'));

  scene.add(model);
  sun.position.set(-size * 0.55, size * 0.9, size * 0.35);
  sun.target.position.set(0, 0, 0);
  const sc = sun.shadow.camera, e = size * 0.8;
  sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 1; sc.far = size * 3;
  sc.updateProjectionMatrix();
  resetView();
}

export function exportOBJ() {
  return new OBJExporter().parse(model);
}
export function exportGLB() {
  return new Promise((res, rej) => new GLTFExporter().parse(model, r => res(r), e => rej(e), { binary: true }));
}
/** 3B baskı için: yalnızca zemin ve binalar, ikili STL (birim metre) */
export async function exportSTL() {
  const { STLExporter } = await import('three/addons/exporters/STLExporter.js');
  const g = new THREE.Group();
  for (const o of model.children) if (o.name === 'Zemin' || o.name === 'Binalar') g.add(o.clone());
  g.updateMatrixWorld(true);
  return new STLExporter().parse(g, { binary: true });
}
export function snapshot() {
  render();
  return renderer.domElement.toDataURL('image/png');
}
