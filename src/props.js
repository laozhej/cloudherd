// Set dressing: trees, the village houses, windmill, lighthouse, bridge, pier, cannery,
// lightning rods, field fences and two little boats.
import * as THREE from 'three';
import { G } from './state.js';
import { Kit } from './kit.js';
import { patchMaterial } from './shade.js';
import { LAYOUT, groundAt, slopeAt, pathDist, waterAt, masks } from './island.js';
import { mulberry32, smoothstep, clamp, rectDist, fbm, lerp, toWorld, damp } from './util.js';
import { GRID, HALF, CELL } from './consts.js';

const idx = (x, z) => clamp(Math.floor((z + HALF) / CELL), 0, GRID - 1) * GRID + clamp(Math.floor((x + HALF) / CELL), 0, GRID - 1);
const pickR = (rng, a) => a[Math.floor(rng() * a.length)];

let KIT_MAT = null;
export const kitMaterial = () => KIT_MAT || (KIT_MAT = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { glow: true }));

function kitMesh(kit, x, y, z, ry = 0, shadow = true) {
  const m = new THREE.Mesh(kit.build(), kitMaterial());
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}

// keep-out test shared by the tree scatter and anything else that wants open ground
export function blocked(x, z, pad = 0) {
  const V = LAYOUT.village;
  if (Math.hypot(x - V.x, z - V.z) < V.r + 2 + pad) return true;
  for (const f of LAYOUT.fields) if (rectDist(x, z, f) < 2.2 + pad) return true;
  for (const r of LAYOUT.rods) if (Math.hypot(x - r.x, z - r.z) < 2.5 + pad) return true;
  const spots = [[LAYOUT.windmill, 4.5], [LAYOUT.lighthouse, 6.5], [LAYOUT.cannery, 6.5], [LAYOUT.pier, 5], [LAYOUT.bridge, 4]];
  for (const [p, r] of spots) if (Math.hypot(x - p.x, z - p.z) < r + pad) return true;
  if (pathDist(x, z) < 1.7 + pad) return true;
  return false;
}

// ---------------------------------------------------------------- trees
const DRY_BROAD = new THREE.Color(0xa8a052), LUSH_BROAD = new THREE.Color(0x4f9a3e), DRY_PINE = new THREE.Color(0x7f8a4e), LUSH_PINE = new THREE.Color(0x2f7048);
const CHAR = new THREE.Color(0x2a2522), TRUNK = new THREE.Color(0x7a5236), TRUNK_BURNT = new THREE.Color(0x1d1a18);

function buildTrees(scene) {
  const rng = mulberry32(7);
  const list = [];
  const F = LAYOUT.forest, M = LAYOUT.mountain;
  const step = 1.55;
  for (let z = -60; z <= 60; z += step) for (let x = -60; x <= 60; x += step) {
    const px = x + (rng() - 0.5) * step * 0.9, pz = z + (rng() - 0.5) * step * 0.9;
    const roll = rng(), roll2 = rng(), roll3 = rng();
    const h = groundAt(px, pz);
    if (h < 1.0 || h > 13.5) continue;
    if (slopeAt(px, pz) > 0.85) continue;
    if (waterAt(px, pz) !== null) continue;
    const k = idx(px, pz);
    if (masks.dist[k] < 2.0) continue;
    if (blocked(px, pz)) continue;
    const df = Math.hypot(px - F.x, pz - F.z), dm = Math.hypot(px - M.x, pz - M.z);
    let dens = 0.03 + 0.2 * smoothstep(0.6, 0.78, fbm(px * 0.06 + 5, pz * 0.06 + 2, 3));
    dens = Math.max(dens, 0.92 * smoothstep(F.r, F.r * 0.45, df));
    if (dm < M.r && h > 3.5) dens = Math.max(dens, 0.42 * smoothstep(13, 6, h));
    if (roll > dens) continue;
    const pine = h > 6 || dm < M.r * 0.9 || (df < F.r && roll2 < 0.35 + (F.z - pz) * 0.03);
    const s = (df < F.r ? 1.0 : 0.85) * lerp(0.8, 1.3, roll3);
    list.push({ x: px, z: pz, y: h - 0.1, s, pine, k, rot: rng() * 6.28, burnt: 0, tint: 0.9 + rng() * 0.2 });
  }
  const pines = list.filter((t) => t.pine), broads = list.filter((t) => !t.pine);
  // geometry
  const pk = new Kit();
  pk.cone(1.05, 1.5, 7, 0xffffff, { p: [0, 1.25, 0] }).cone(0.82, 1.3, 7, 0xffffff, { p: [0, 2.0, 0] }).cone(0.56, 1.1, 7, 0xffffff, { p: [0, 2.65, 0] });
  const pineGeo = pk.build(); pineGeo.deleteAttribute('color');
  const bk = new Kit();
  bk.ball(1.0, 0xffffff, { p: [0, 1.9, 0], s: [1, 0.86, 1] }, 1).ball(0.62, 0xffffff, { p: [0.55, 1.55, 0.2] }, 0).ball(0.55, 0xffffff, { p: [-0.5, 1.6, -0.25] }, 0);
  const broadGeo = bk.build(); broadGeo.deleteAttribute('color');
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.17, 1.2, 5); trunkGeo.translate(0, 0.6, 0);
  const mat = () => patchMaterial(new THREE.MeshLambertMaterial({ flatShading: true }));
  const pineMesh = new THREE.InstancedMesh(pineGeo, mat(), pines.length);
  const broadMesh = new THREE.InstancedMesh(broadGeo, mat(), broads.length);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, mat(), list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  const place = (mesh, i, t, sc = 1) => {
    m4.compose(pv.set(t.x, t.y, t.z), q.setFromEuler(e.set(0, t.rot, 0)), sv.set(t.s * sc, t.s * sc, t.s * sc));
    mesh.setMatrixAt(i, m4);
  };
  pines.forEach((t, i) => { t.mesh = pineMesh; t.i = i; place(pineMesh, i, t); });
  broads.forEach((t, i) => { t.mesh = broadMesh; t.i = i; place(broadMesh, i, t); });
  list.forEach((t, i) => { t.ti = i; place(trunkMesh, i, t); trunkMesh.setColorAt(i, TRUNK); });
  for (const m of [pineMesh, broadMesh, trunkMesh]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  // fuel map for the fire simulation
  const fuel = new Float32Array(GRID * GRID);
  for (const t of list) fuel[t.k] = Math.min(1, fuel[t.k] + 0.55);
  const col = new THREE.Color();
  let cursor = 0;
  const api = {
    list, fuel, pineMesh, broadMesh, trunkMesh,
    refresh(all = false) {
      const C = G.climate; if (!C) return;
      const n = all ? list.length : Math.ceil(list.length / 6);
      for (let c = 0; c < n; c++) {
        const t = list[cursor]; cursor = (cursor + 1) % list.length;
        const m = C.moist[t.k], b = C.burn[t.k];
        const dry = t.pine ? DRY_PINE : DRY_BROAD, lush = t.pine ? LUSH_PINE : LUSH_BROAD;
        col.copy(dry).lerp(lush, smoothstep(0.08, 0.72, m)).multiplyScalar(t.tint);
        if (b > 0.05) col.lerp(CHAR, smoothstep(0.05, 0.6, b));
        t.mesh.setColorAt(t.i, col);
        const burnt = b > 0.55 ? 1 : 0;
        if (burnt !== t.burnt) {
          t.burnt = burnt;
          place(t.mesh, t.i, t, burnt ? 0.55 : 1);
          t.mesh.instanceMatrix.needsUpdate = true;
          trunkMesh.setColorAt(t.ti, burnt ? TRUNK_BURNT : TRUNK); trunkMesh.instanceColor.needsUpdate = true;
        }
      }
      pineMesh.instanceColor.needsUpdate = true; broadMesh.instanceColor.needsUpdate = true;
    },
    reset() { for (const t of list) { if (t.burnt) { t.burnt = 0; place(t.mesh, t.i, t); t.mesh.instanceMatrix.needsUpdate = true; trunkMesh.setColorAt(t.ti, TRUNK); } } trunkMesh.instanceColor.needsUpdate = true; api.refresh(true); },
  };
  return api;
}

// ---------------------------------------------------------------- houses
const WALLS = [0xf3e9d2, 0xf6efe4, 0xeadcc0, 0xf2d7c4, 0xdbe8e2, 0xf3e3b5, 0xe8dff0];
const ROOFS = [0xd2643f, 0xc0533a, 0x4f6fa8, 0x5f8f5a, 0x8a5a9a, 0xb5653f, 0x3f7f8f];

function houseKit(rng, big = false) {
  const k = new Kit();
  const w = (big ? 3.4 : 2.4) + rng() * 0.8, d = 2.2 + rng() * 0.7, h = 1.7 + rng() * 0.6 + (big ? 0.5 : 0);
  const wall = pickR(rng, WALLS), roof = pickR(rng, ROOFS);
  k.box(w, h, d, wall, { p: [0, h / 2, 0] });
  k.box(w + 0.12, 0.22, d + 0.12, 0xb9a88c, { p: [0, 0.11, 0] });
  const rh = 1.05 + rng() * 0.45;
  k.prism(d + 0.55, rh, w + 0.45, roof, { p: [0, h, 0], r: [0, Math.PI / 2, 0] });
  const ds = rng() < 0.5 ? -1 : 1;
  k.box(0.55, 1.0, 0.08, 0x7a4a2a, { p: [ds * w * 0.22, 0.5, d / 2 + 0.03] });
  k.box(0.5, 0.45, 0.06, 0x34404c, { p: [-ds * w * 0.22, h * 0.58, d / 2 + 0.03], glow: 1 });
  k.box(0.06, 0.42, 0.5, 0x34404c, { p: [w / 2 + 0.03, h * 0.58, 0], glow: 1 });
  k.box(0.06, 0.42, 0.5, 0x34404c, { p: [-w / 2 - 0.03, h * 0.58, 0], glow: 1 });
  if (rng() < 0.6) k.box(0.62, 0.12, 0.24, 0xd25a5a, { p: [-ds * w * 0.22, h * 0.58 - 0.3, d / 2 + 0.14] }); // flower box
  let chimney = null;
  if (rng() < 0.75) { const cx = w * 0.28 * (rng() < 0.5 ? -1 : 1); k.box(0.38, 1.1, 0.38, 0xa0705a, { p: [cx, h + rh * 0.55, -d * 0.12] }); chimney = [cx, h + rh * 0.55 + 0.6, -d * 0.12]; }
  return { k, w, d, h: h + rh, chimney };
}

function buildHouses(scene) {
  const rng = mulberry32(31);
  const S = LAYOUT.square, V = LAYOUT.village;
  const spots = [];
  for (const [r, n, off] of [[7.4, 13, 0.1], [10.8, 17, 0.25]]) for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    const x = S.x + Math.cos(a) * r, z = S.z + Math.sin(a) * r;
    if (x < 8.6) continue;
    if (pathDist(x, z) < 2.3) continue;
    if (Math.abs(groundAt(x, z) - groundAt(S.x, S.z)) > 0.7) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 3.7)) continue;
    spots.push({ x, z, rot: Math.atan2(S.x - x, S.z - z) });
  }
  const houses = [];
  for (const s of spots) {
    const hk = houseKit(rng, houses.length === 0);
    const y = groundAt(s.x, s.z) - 0.05;
    const mesh = kitMesh(hk.k, s.x, y, s.z, s.rot);
    scene.add(mesh);
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const chim = hk.chimney ? new THREE.Vector3(s.x + hk.chimney[0] * c + hk.chimney[2] * sn, y + hk.chimney[1], s.z - hk.chimney[0] * sn + hk.chimney[2] * c) : null;
    houses.push({ x: s.x, z: s.z, y, mesh, r: Math.max(hk.w, hk.d) * 0.6, height: hk.h, chimney: chim, k: idx(s.x, s.z), fire: 0, lost: false, rot: s.rot });
  }
  return houses;
}

// ---------------------------------------------------------------- landmarks
function windmillKit() {
  const k = new Kit();
  k.cyl(2.0, 2.15, 0.6, 8, 0xb8ab98, { p: [0, 0.3, 0] });
  k.cyl(1.25, 1.85, 5.6, 8, 0xf1e6cf, { p: [0, 3.2, 0] });
  k.cone(1.6, 1.8, 8, 0xb5533c, { p: [0, 6.9, 0] });
  k.box(0.7, 1.25, 0.12, 0x7a4a2a, { p: [0, 1.15, 1.8] });
  k.box(0.42, 0.42, 0.1, 0x34404c, { p: [0, 3.9, 1.5], glow: 1 });
  k.box(0.42, 0.42, 0.1, 0x34404c, { p: [1.4, 2.6, 0.35], r: [0, Math.PI / 2, 0], glow: 1 });
  return k;
}
function bladesGeo() {
  const k = new Kit();
  k.cyl(0.3, 0.3, 0.6, 8, 0x6b4a35, { r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const arm = new Kit();
    arm.box(0.16, 4.6, 0.1, 0x7a5a3e, { p: [0, 2.4, 0] });
    arm.box(0.95, 3.4, 0.05, 0xf4ecd8, { p: [0.55, 2.8, 0.02] });
    for (let j = 0; j < 5; j++) arm.box(1.0, 0.06, 0.08, 0x7a5a3e, { p: [0.55, 1.3 + j * 0.75, 0.05] });
    k.merge(arm, { r: [0, 0, a] });
  }
  return k.build();
}
function lighthouseKit() {
  const k = new Kit();
  k.cyl(2.3, 2.5, 0.8, 10, 0xb9b2a6, { p: [0, 0.4, 0] });
  const segs = 5, H = 8;
  for (let i = 0; i < segs; i++) {
    const y0 = 0.8 + (i / segs) * H, y1 = 0.8 + ((i + 1) / segs) * H;
    const r0 = lerp(1.55, 1.05, i / segs), r1 = lerp(1.55, 1.05, (i + 1) / segs);
    k.cyl(r1, r0, y1 - y0, 12, i % 2 ? 0xc8402f : 0xf6f1e8, { p: [0, (y0 + y1) / 2, 0] });
  }
  k.cyl(1.5, 1.5, 0.22, 12, 0x3d4652, { p: [0, 8.95, 0] });
  k.cyl(0.78, 0.78, 1.1, 10, 0xffe9a8, { p: [0, 9.6, 0], glow: 1 });
  k.cone(1.05, 1.0, 10, 0xc0392b, { p: [0, 10.65, 0] });
  k.box(0.6, 1.1, 0.1, 0x6a4a35, { p: [0, 1.35, 1.45] });
  // keeper's cottage
  k.box(2.6, 1.7, 2.1, 0xf3efe6, { p: [-3.4, 0.85, -0.8] });
  k.prism(2.6, 1.0, 3.0, 0x4f6fa8, { p: [-3.4, 1.7, -0.8], r: [0, Math.PI / 2, 0] });
  k.box(0.45, 0.4, 0.06, 0x34404c, { p: [-3.4, 1.0, 0.27], glow: 1 });
  return k;
}
function canneryKit() {
  const k = new Kit();
  k.box(7.2, 2.8, 4.4, 0xcdbda4, { p: [0, 1.4, 0] });
  for (let i = 0; i < 3; i++) k.prism(4.6, 1.0, 2.4, 0x5d6b78, { p: [-2.4 + i * 2.4, 2.8, 0], r: [0, Math.PI / 2, 0] });
  k.box(1.6, 1.8, 0.1, 0x6b5a48, { p: [-1.5, 0.9, 2.22] });
  for (let i = 0; i < 3; i++) k.box(0.7, 0.5, 0.08, 0x34404c, { p: [1.0 + i * 0.95, 1.8, 2.22], glow: 1 });
  k.cyl(0.45, 0.62, 9.5, 8, 0x9a4a3a, { p: [2.6, 4.75, -1.2] });
  k.cyl(0.5, 0.5, 0.45, 8, 0xe9e2d6, { p: [2.6, 8.6, -1.2] });
  // crates and barrels by the door
  k.box(0.7, 0.7, 0.7, 0xa77a4f, { p: [-3.0, 0.35, 2.8], r: [0, 0.3, 0] });
  k.box(0.6, 0.6, 0.6, 0xb98a5c, { p: [-2.3, 0.3, 3.1] });
  k.cyl(0.32, 0.32, 0.8, 8, 0x5f7f8f, { p: [3.4, 0.4, 2.7] });
  return k;
}

function buildStatic(scene) {
  const all = new Kit();
  // windmill
  const W = LAYOUT.windmill, wy = groundAt(W.x, W.z) - 0.1;
  all.merge(windmillKit(), { p: [W.x, wy, W.z] });
  const blades = new THREE.Mesh(bladesGeo(), kitMaterial());
  blades.position.set(W.x, wy + 5.9, W.z + 1.55);
  blades.castShadow = true;
  scene.add(blades);
  // lighthouse
  const L = LAYOUT.lighthouse, ly = groundAt(L.x, L.z) - 0.2;
  all.merge(lighthouseKit(), { p: [L.x, ly, L.z], r: [0, -0.4, 0] });
  const beamGeo = new THREE.CylinderGeometry(0.4, 4.2, 30, 16, 1, true); beamGeo.translate(0, 15, 0); beamGeo.rotateZ(-Math.PI / 2 + 0.06);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOn: { value: 0 } },
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vW; void main(){ vT = clamp(position.x / 30.0, 0.0, 1.0); vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uOn; varying float vT; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 V = normalize(cameraPosition - vW); float face = pow(clamp(abs(dot(normalize(vN), V)), 0.0, 1.0), 1.5);
        gl_FragColor = vec4(vec3(1.0, 0.88, 0.6) * pow(clamp(1.0 - vT, 0.0, 1.0), 2.2) * face * 0.28 * uOn, 1.0); }`,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(L.x, ly + 9.6, L.z);
  beam.visible = false;
  scene.add(beam);
  // cannery
  const C = LAYOUT.cannery, cy = groundAt(C.x, C.z) - 0.15;
  all.merge(canneryKit(), { p: [C.x, cy, C.z], r: [0, 0.15, 0] });
  const chimneyTop = new THREE.Vector3(C.x + 2.6 * Math.cos(0.15) - 1.2 * Math.sin(0.15), cy + 9.6, C.z - 2.6 * Math.sin(0.15) - 1.2 * Math.cos(0.15));
  // bridge over the river
  const B = LAYOUT.bridge;
  const x0 = B.x - 3.8, x1 = B.x + 3.8, y0 = groundAt(x0, B.z), y1 = groundAt(x1, B.z);
  const N = 7;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N, tm = (t0 + t1) / 2;
    const ya = lerp(y0, y1, t0) + Math.sin(Math.PI * t0) * 0.7, yb = lerp(y0, y1, t1) + Math.sin(Math.PI * t1) * 0.7;
    const xm = lerp(x0, x1, tm), ym = (ya + yb) / 2 + 0.1, len = Math.hypot((x1 - x0) / N, yb - ya);
    const ang = Math.atan2(yb - ya, (x1 - x0) / N);
    all.box(len + 0.05, 0.22, 2.0, 0xa77a4f, { p: [xm, ym, B.z], r: [0, 0, ang] });
    for (const side of [-1, 1]) {
      all.box(0.14, 0.7, 0.14, 0x7a5236, { p: [lerp(x0, x1, t0), ya + 0.45, B.z + side * 0.92] });
      all.box(len, 0.1, 0.1, 0x7a5236, { p: [xm, ym + 0.62, B.z + side * 0.92], r: [0, 0, ang] });
    }
  }
  // pier
  const P = LAYOUT.pier, py = 1.0;
  all.box(1.9, 0.18, 11.5, 0xa98058, { p: [P.x, py, P.z + 4.8] });
  for (let i = 0; i < 6; i++) for (const side of [-1, 1]) all.cyl(0.13, 0.13, 3.4, 6, 0x6b4a35, { p: [P.x + side * 0.85, py - 1.6, P.z + i * 2.1] });
  for (let i = 0; i < 12; i++) all.box(1.92, 0.02, 0.06, 0x8a6442, { p: [P.x, py + 0.1, P.z - 0.6 + i * 0.95] });
  // lightning rods: pole and base (the tips are separate so they can glow)
  const tips = [];
  for (const r of LAYOUT.rods) {
    const ry = groundAt(r.x, r.z) - 0.1;
    all.box(0.7, 0.35, 0.7, 0x8f8a80, { p: [r.x, ry + 0.17, r.z] });
    all.cyl(0.06, 0.1, 6.2, 5, 0x6b5f52, { p: [r.x, ry + 3.2, r.z] });
    all.box(0.9, 0.06, 0.06, 0x6b5f52, { p: [r.x, ry + 5.4, r.z] });
    const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({ color: 0xc87a3a }));
    tip.position.set(r.x, ry + 6.4, r.z);
    scene.add(tip);
    tips.push({ mesh: tip, x: r.x, z: r.z, y: ry + 6.4, charge: 0, glow: 0 });
  }
  // fences around the fields, with a gap for the gate
  for (const f of LAYOUT.fields) {
    const fy = groundAt(f.x, f.z);
    const hw = f.w / 2 + 0.7, hd = f.d / 2 + 0.7;
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    for (let s = 0; s < 4; s++) {
      const [ax, az] = corners[s], [bx, bz] = corners[(s + 1) % 4];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 1.6));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        if (s === 2 && Math.abs((t0 + t1) / 2 - 0.5) < 0.12) continue; // gate on the south side
        const [wx, wz] = toWorld(lerp(ax, bx, t0), lerp(az, bz, t0), f);
        all.box(0.14, 0.75, 0.14, 0x9a7650, { p: [wx, fy + 0.3, wz], r: [0, -f.rot, 0] });
        const [mx, mz] = toWorld(lerp(ax, bx, (t0 + t1) / 2), lerp(az, bz, (t0 + t1) / 2), f);
        const segAng = Math.atan2(bz - az, bx - ax);
        all.box(len / n, 0.08, 0.08, 0xb08a5e, { p: [mx, fy + 0.5, mz], r: [0, -(f.rot + segAng), 0] });
      }
    }
  }
  const mesh = new THREE.Mesh(all.build(), kitMaterial());
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  return { mesh, blades, beam, beamMat, tips, chimneyTop };
}

// ---------------------------------------------------------------- boats
function boatKit(hull, sail) {
  const k = new Kit();
  k.box(0.95, 0.42, 2.2, hull, { p: [0, 0.1, 0] });
  k.prism(0.95, 0.7, 0.42, hull, { p: [0, -0.11, 1.1], r: [-Math.PI / 2, 0, 0], s: [1, 1, 1] });
  k.box(0.8, 0.06, 2.0, 0xc9a477, { p: [0, 0.32, 0] });
  k.cyl(0.05, 0.05, 2.6, 5, 0x6b4a35, { p: [0, 1.5, 0.2] });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.45, 0.25, 0, 2.7, 0.25, 0, 0.45, -0.95, 0, 0.45, 0.25, 0, 0.45, -0.95, 0, 2.7, 0.25], 3));
  tri.computeVertexNormals();
  k.add(tri, sail, { p: [0.03, 0, 0] });
  return k;
}

export function createProps(scene) {
  const trees = buildTrees(scene);
  const houses = buildHouses(scene);
  const stat = buildStatic(scene);
  const boats = [
    { ax: 8.5, az: 52, hull: 0xd0533c, sail: 0xf6efe0 },
    { ax: -0.5, az: 50.5, hull: 0x3f6fa8, sail: 0xf3e6c4 },
    { ax: 15, az: 56, hull: 0x2f8f6f, sail: 0xf6efe0 },
  ].map((b, i) => {
    const m = kitMesh(boatKit(b.hull, b.sail), b.ax, 0, b.az, 0.4 * i - 0.3);
    m.castShadow = true;
    scene.add(m);
    return { ...b, x: b.ax, z: b.az, vx: 0, vz: 0, mesh: m, phase: i * 1.7, heading: 0.4 * i - 0.3 };
  });
  let bladeAngle = 0, bladeBoost = 0, beamOn = 0, beamAngle = 0;
  return {
    trees, houses, boats, ...stat,
    lighthouseOn: false,
    // a gust or the spirit's wake can nudge things
    push(x, z, fx, fz, radius) {
      for (const b of boats) {
        const d = Math.hypot(b.x - x, b.z - z);
        if (d < radius) { const w = 1 - d / radius; b.vx += fx * w * 0.6; b.vz += fz * w * 0.6; }
      }
      const W = LAYOUT.windmill;
      const dw = Math.hypot(W.x - x, W.z - z);
      if (dw < radius + 4) bladeBoost = Math.min(6, bladeBoost + Math.hypot(fx, fz) * (1 - dw / (radius + 4)) * 0.5);
    },
    update(dt) {
      const t = G.time;
      bladeBoost = damp(bladeBoost, 0, 0.6, dt);
      bladeAngle += dt * (0.5 + G.wind.speed * 0.45 + bladeBoost);
      stat.blades.rotation.z = -bladeAngle;
      for (const b of boats) {
        b.vx += (b.ax - b.x) * 0.25 * dt; b.vz += (b.az - b.z) * 0.25 * dt;
        b.vx = damp(b.vx, 0, 0.7, dt); b.vz = damp(b.vz, 0, 0.7, dt);
        b.x += b.vx * dt; b.z += b.vz * dt;
        const sp = Math.hypot(b.vx, b.vz);
        if (sp > 0.3) b.heading = damp(b.heading, Math.atan2(b.vx, b.vz), 2, dt);
        b.mesh.position.set(b.x, 0.12 + Math.sin(t * 1.3 + b.phase) * 0.08, b.z);
        b.mesh.rotation.set(Math.sin(t * 1.1 + b.phase) * 0.05, b.heading, Math.sin(t * 0.9 + b.phase * 2) * 0.07 + clamp(sp * 0.04, 0, 0.25));
      }
      // lighthouse beam at dusk, or when the rods have charged it
      const want = this.lighthouseOn || G.shared.dusk.value > 0.35 ? 1 : 0;
      beamOn = damp(beamOn, want, 2, dt);
      stat.beam.visible = beamOn > 0.01;
      beamAngle += dt * 0.9;
      stat.beam.rotation.y = beamAngle;
      stat.beamMat.uniforms.uOn.value = beamOn;
      // rod tips: plain copper; on rod days (tip.live, set by game.js) a slow amber beacon, a blue-white
      // crackle while a thunderhead is in reach (tip.near), and a white-hot flash after each catch (tip.glow)
      stat.tips.forEach((tip, i) => {
        tip.glow = damp(tip.glow, 0, 1.5, dt);
        tip.charge = damp(tip.charge || 0, tip.near ? 1 : 0, 6, dt);
        const beacon = tip.live ? 0.5 + 0.5 * Math.sin(t * 2.4 + i * 2.1) : 0;
        const crackle = tip.charge * (0.65 + 0.35 * Math.sin(t * 31 + i * 1.7));
        const c = tip.mesh.material.color;
        c.setRGB(0.78 + tip.glow * 0.6 + beacon * 0.8 + crackle * 0.6, 0.48 + tip.glow * 0.7 + beacon * 0.62 + crackle * 0.9, 0.23 + tip.glow * 1.0 + beacon * 0.22 + crackle * 1.6);
        tip.mesh.scale.setScalar(tip.live ? 1.35 + beacon * 0.15 + crackle * 0.25 : 1);
      });
    },
  };
}
