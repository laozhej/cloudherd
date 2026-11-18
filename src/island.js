// Wrenholm: the island. Height field, coastline, river and lakes, the terrain mesh
// and every body of water. Fixed layout; the days change what happens on it.
import * as THREE from 'three';
import { G } from './state.js';
import { fbm, ridged, smoothstep, clamp, lerp, segDist, rectDist, angleDelta } from './util.js';
import { patchMaterial, GLSL_COMMON } from './shade.js';
import { GRID, HALF, CELL } from './consts.js';

export const LAYOUT = {
  mountain: { x: -27, z: -25, r: 21, h: 19 },
  hills: [
    { x: 24, z: -20, r: 15, h: 3.6 },   // Whisperwood rise
    { x: 27, z: 0, r: 7, h: 2.3 },      // windmill knoll
    { x: 41, z: 29, r: 7, h: 3.2 },     // lighthouse rock
    { x: -32, z: 30, r: 10, h: 1.8 },   // west downs
    { x: 14, z: -8, r: 4.5, h: 1.2 },   // rod knoll
  ],
  tarn: { x: -12, z: -28, r: 5.2 },
  lake: { x: -35, z: 9, r: 7.2 },
  forest: { x: 25, z: -21, r: 16 },
  village: { x: 13, z: 14, r: 9.5 },
  square: { x: 13, z: 12, r: 4.6 },
  bridge: { x: 5, z: 14 },
  windmill: { x: 27, z: 0 },
  lighthouse: { x: 41.5, z: 29.5 },
  pier: { x: 4, z: 45 },
  cannery: { x: 19, z: 37.5 },
  river: [[-7.5, -25.5], [-1, -19], [4, -11], [6, -3], [4.5, 5], [5, 14], [4, 22], [1, 30], [-2, 38], [-3.5, 47], [-4, 56]],
  fields: [
    { id: 0, x: -10, z: -9, w: 12, d: 8, rot: 0.06 },
    { id: 1, x: -21, z: 3, w: 11, d: 8.5, rot: -0.18 },
    { id: 2, x: -18, z: 21, w: 12, d: 8.5, rot: 0.16 },
    { id: 3, x: 34, z: 12, w: 10, d: 8.5, rot: -0.3 },
    { id: 4, x: 25, z: 28, w: 11.5, d: 8, rot: 0.2 },
    { id: 5, x: -12, z: 36, w: 11, d: 7, rot: -0.08 },
  ],
  rods: [{ x: 14, z: -8 }, { x: -9, z: 12 }, { x: 37, z: -4 }],
  paths: [
    [[13, 12], [9, 14], [5, 14], [0, 13], [-8, 10], [-15, 6]],
    [[0, 13], [-6, 16], [-12, 20]],
    [[-8, 10], [-9, 2], [-10, -4]],
    [[13, 12], [18, 8], [24, 3], [27, 0]],
    [[24, 3], [29, 8], [31, 11]],
    [[13, 12], [12, 20], [10, 28], [7, 36], [5, 42]],
    [[12, 20], [18, 24], [22, 27]],
    [[22, 27], [30, 29], [37, 29], [40, 29.5]],
    [[10, 28], [15, 34], [19, 39]],
    [[7, 36], [-2, 36], [-6, 36]],
  ],
};

const LH_ANG = Math.atan2(LAYOUT.lighthouse.z, LAYOUT.lighthouse.x);
const PIER_ANG = Math.atan2(LAYOUT.pier.z, LAYOUT.pier.x);

export function coastR(ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  let r = 48.5 + 2.4 * Math.sin(3 * ang + 0.6) + 1.8 * Math.sin(5 * ang - 1.2) + (fbm(c * 1.5 + 7.1, s * 1.5 + 3.3, 3) - 0.5) * 8;
  r += 6.5 * Math.exp(-(((angleDelta(ang, LH_ANG)) / 0.15) ** 2));   // the lighthouse point
  r += 2.0 * Math.exp(-(((angleDelta(ang, PIER_ANG)) / 0.25) ** 2));  // a little more beach under the pier
  return r;
}

function natural(x, z) {
  let h = 1.8 + fbm(x * 0.03 + 11.3, z * 0.03 + 4.7, 4) * 3.2;
  const M = LAYOUT.mountain;
  const dm = Math.hypot(x - M.x, z - M.z);
  if (dm < M.r) {
    const t = smoothstep(M.r, 0, dm);
    h += M.h * Math.pow(t, 1.45) * (0.7 + 0.42 * ridged(x * 0.075 + 3, z * 0.075 + 9, 4));
  }
  for (const hl of LAYOUT.hills) {
    const d = Math.hypot(x - hl.x, z - hl.z);
    if (d < hl.r) h += hl.h * Math.pow(smoothstep(hl.r, 0, d), 1.2);
  }
  return h;
}

// ---------------------------------------------------------------- river
// smooth the control polyline, then walk it downhill to get a water surface that never climbs
const river = (() => {
  const curve = new THREE.CatmullRomCurve3(LAYOUT.river.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.5);
  const N = 150;
  const pts = curve.getSpacedPoints(N).map((p) => ({ x: p.x, z: p.z, s: 0, surf: 0, w: 0 }));
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    pts[i].s = acc;
  }
  return { pts, length: acc };
})();

const zones = (() => {
  const V = LAYOUT.village;
  return {
    village: { ...V, h: natural(V.x, V.z) - 0.2 },
    fields: LAYOUT.fields.map((f) => ({ ...f, h: natural(f.x, f.z) - 0.1 })),
    tarnLevel: natural(LAYOUT.tarn.x, LAYOUT.tarn.z) - 0.8,
    lakeLevel: Math.min(natural(LAYOUT.lake.x, LAYOUT.lake.z) - 0.6, 1.6),
  };
})();
LAYOUT.tarn.level = zones.tarnLevel;
LAYOUT.lake.level = zones.lakeLevel;

// river surface: starts at the tarn, never rises, stays under the ground it crosses
{
  const P = river.pts;
  let surf = zones.tarnLevel;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const g = natural(p.x, p.z);
    const ang = Math.atan2(p.z, p.x), inland = coastR(ang) - Math.hypot(p.x, p.z);
    const target = Math.min(g - 0.55, inland < 6 ? lerp(0.0, g - 0.55, clamp(inland / 6, 0, 1)) : 99);
    surf = Math.max(0, Math.min(surf - 0.015, target));
    p.surf = surf;
    p.w = lerp(2.0, 3.4, i / (P.length - 1));
  }
  // smooth while keeping it monotonic
  for (let k = 0; k < 3; k++) for (let i = 1; i < P.length - 1; i++) P[i].surf = Math.min(P[i - 1].surf, (P[i - 1].surf + P[i].surf + P[i + 1].surf) / 3);
  // the village flattening must not lift the ground above the river
  zones.village.h = Math.max(zones.village.h, 0.8);
}

function riverQuery(x, z) {
  const P = river.pts;
  let best = 1e9, bi = 0, bt = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    // cheap reject
    if (Math.abs(x - a.x) > 8 && Math.abs(x - b.x) > 8) continue;
    if (Math.abs(z - a.z) > 8 && Math.abs(z - b.z) > 8) continue;
    const r = segDist(x, z, a.x, a.z, b.x, b.z);
    if (r.d < best) { best = r.d; bi = i; bt = r.t; }
  }
  if (best > 1e8) return null;
  const a = P[bi], b = P[bi + 1];
  return { d: best, surf: lerp(a.surf, b.surf, bt), w: lerp(a.w, b.w, bt), s: lerp(a.s, b.s, bt) };
}

// the final height field, before the grid cache
function heightRaw(x, z) {
  let h = natural(x, z);
  // village terrace
  const V = zones.village;
  const dv = Math.hypot(x - V.x, z - V.z);
  if (dv < V.r + 6) h = lerp(h, V.h, smoothstep(V.r + 6, V.r - 1, dv));
  // fields are flat
  for (const f of zones.fields) {
    const d = rectDist(x, z, f);
    if (d < 5) h = lerp(h, f.h, smoothstep(5, -0.5, d));
  }
  // lakes
  for (const L of [LAYOUT.tarn, LAYOUT.lake]) {
    const d = Math.hypot(x - L.x, z - L.z);
    if (d < L.r + 5) {
      const bowl = d < L.r ? L.level - 0.15 - 2.0 * (1 - (d / L.r) ** 2) : L.level + 0.25 + (d - L.r) * 0.55;
      h = lerp(bowl, h, smoothstep(L.r, L.r + 5, d));
    }
  }
  // river channel
  const rq = riverQuery(x, z);
  if (rq && rq.d < rq.w * 0.5 + 3) {
    const hw = rq.w * 0.5;
    const tgt = rq.d < hw ? rq.surf - 0.15 - 0.75 * (1 - (rq.d / hw) ** 2) : rq.surf + 0.1 + (rq.d - hw) * 0.55;
    h = lerp(tgt, h, smoothstep(hw, hw + 3, rq.d));
  }
  // coast
  const r = Math.hypot(x, z), ang = Math.atan2(z, x);
  const inland = coastR(ang) - r;
  if (inland < 0) h = Math.max(-9, 0.35 + inland * 0.42);
  else h = lerp(0.35 + inland * 0.2, h, smoothstep(1.0, 8, inland));
  return h;
}

// ---------------------------------------------------------------- height grid cache
const HG_N = 300, HG_EXT = 75, HG_STEP = (HG_EXT * 2) / HG_N;
const hgrid = new Float32Array((HG_N + 1) * (HG_N + 1));
for (let j = 0; j <= HG_N; j++) for (let i = 0; i <= HG_N; i++) hgrid[j * (HG_N + 1) + i] = heightRaw(-HG_EXT + i * HG_STEP, -HG_EXT + j * HG_STEP);

export function groundAt(x, z) {
  const fx = clamp((x + HG_EXT) / HG_STEP, 0, HG_N - 1e-4), fz = clamp((z + HG_EXT) / HG_STEP, 0, HG_N - 1e-4);
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, W = HG_N + 1;
  const a = hgrid[j * W + i], b = hgrid[j * W + i + 1], c = hgrid[(j + 1) * W + i], d = hgrid[(j + 1) * W + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function slopeAt(x, z) {
  const e = 0.6;
  const dx = groundAt(x + e, z) - groundAt(x - e, z), dz = groundAt(x, z + e) - groundAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// water surface height at a point, or null if it is dry land
export function waterAt(x, z) {
  for (const L of [LAYOUT.tarn, LAYOUT.lake]) if (Math.hypot(x - L.x, z - L.z) < L.r + 0.3) return L.level;
  const rq = riverQuery(x, z);
  if (rq && rq.d < rq.w * 0.5) return rq.surf;
  if (groundAt(x, z) < 0) return 0;
  return null;
}

export const isSea = (x, z) => groundAt(x, z) < -0.05 && Math.hypot(x, z) > 30;
export const insideIsland = (x, z) => coastR(Math.atan2(z, x)) - Math.hypot(x, z);

// ---------------------------------------------------------------- simulation masks (GRID x GRID)
// water: 0 land, 1 sea, 2 lake, 3 river.  near: closeness to fresh or salt water (0..1)
export const masks = (() => {
  const water = new Uint8Array(GRID * GRID), near = new Float32Array(GRID * GRID), ground = new Float32Array(GRID * GRID);
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const x = -HALF + (i + 0.5) * CELL, z = -HALF + (j + 0.5) * CELL, k = j * GRID + i;
    const g = groundAt(x, z); ground[k] = g;
    let w = 0;
    for (const L of [LAYOUT.tarn, LAYOUT.lake]) if (Math.hypot(x - L.x, z - L.z) < L.r) w = 2;
    if (!w) { const rq = riverQuery(x, z); if (rq && rq.d < rq.w * 0.5) w = 3; }
    if (!w && g < 0) w = 1;
    water[k] = w;
  }
  // distance-ish to water for the damp banks: two-pass chamfer
  const dist = new Float32Array(GRID * GRID).fill(99);
  for (let k = 0; k < GRID * GRID; k++) if (water[k]) dist[k] = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const k = j * GRID + i; let d = dist[k];
      if (i) d = Math.min(d, dist[k - 1] + 1); if (j) d = Math.min(d, dist[k - GRID] + 1);
      if (i && j) d = Math.min(d, dist[k - GRID - 1] + 1.414); if (j && i < GRID - 1) d = Math.min(d, dist[k - GRID + 1] + 1.414);
      dist[k] = d;
    }
    for (let j = GRID - 1; j >= 0; j--) for (let i = GRID - 1; i >= 0; i--) {
      const k = j * GRID + i; let d = dist[k];
      if (i < GRID - 1) d = Math.min(d, dist[k + 1] + 1); if (j < GRID - 1) d = Math.min(d, dist[k + GRID] + 1);
      if (i < GRID - 1 && j < GRID - 1) d = Math.min(d, dist[k + GRID + 1] + 1.414); if (j < GRID - 1 && i) d = Math.min(d, dist[k + GRID - 1] + 1.414);
      dist[k] = d;
    }
  }
  for (let k = 0; k < GRID * GRID; k++) near[k] = water[k] ? 1 : smoothstep(3.5, 0.5, dist[k] * CELL);
  return { water, near, ground, dist };
})();

// ---------------------------------------------------------------- meshes
function pathDist(x, z) {
  let best = 99;
  for (const p of LAYOUT.paths) for (let i = 0; i < p.length - 1; i++) {
    const r = segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
    if (r.d < best) best = r.d;
  }
  return best;
}
export { pathDist };

function buildTerrain() {
  const SIZE = 150, SEG = 200;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3), grass = new Float32Array(n);
  const c = new THREE.Color();
  const sand = new THREE.Color(0xecdcae), wetSand = new THREE.Color(0xcdb98a), rock = new THREE.Color(0x9c938a), darkRock = new THREE.Color(0x7d746d),
    snow = new THREE.Color(0xf6f8fb), seabed = new THREE.Color(0xd9c9a0);
  for (let k = 0; k < n; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    const h = groundAt(x, z);
    pos.setY(k, h);
    const sl = slopeAt(x, z);
    const r = Math.hypot(x, z), inland = coastR(Math.atan2(z, x)) - r;
    let g = 1;
    const nz = fbm(x * 0.21 + 3, z * 0.21 + 8, 2);
    c.copy(rock);
    if (h < 0.2) { c.copy(h < -1.5 ? seabed : wetSand); g = 0; }
    else if (inland < 3.2 && h < 1.6) { c.copy(sand).lerp(wetSand, smoothstep(0.9, 0.2, h) * 0.6); g = smoothstep(1.4, 3.2, inland) * 0.6; }
    // mountain rock and snow
    const rockiness = smoothstep(0.65, 1.1, sl) + smoothstep(9, 13, h);
    if (rockiness > 0) { const rc = rock.clone().lerp(darkRock, nz); c.lerp(rc, clamp(rockiness, 0, 1)); g *= 1 - clamp(rockiness, 0, 1); }
    if (h > 15.5) { c.lerp(snow, smoothstep(15.5, 17, h + nz * 1.5)); g = 0; }
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    grass[k] = g;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aGrass', new THREE.BufferAttribute(grass, 1));
  geo.computeVertexNormals();
  const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { terrain: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.castShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// fine ground detail the terrain mesh is too coarse for: R dirt paths, G muddy banks, B cobbles
function buildDetailTex() {
  const N = 512, EXT = 75, data = new Uint8Array(N * N * 4);
  const S = LAYOUT.square;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -EXT + (i + 0.5) / N * EXT * 2, z = -EXT + (j + 0.5) / N * EXT * 2;
    const k = (j * N + i) * 4;
    const h = groundAt(x, z);
    if (h < 0.25 || Math.hypot(x, z) > 62) continue;
    let mud = 0;
    for (const L of [LAYOUT.tarn, LAYOUT.lake]) { const d = Math.hypot(x - L.x, z - L.z) - L.r; mud = Math.max(mud, smoothstep(1.4, 0.5, d) * smoothstep(-1.2, -0.2, d)); }
    const rq = riverQuery(x, z);
    if (rq) { const d = rq.d - rq.w * 0.5; mud = Math.max(mud, smoothstep(1.2, 0.35, d) * smoothstep(-1, -0.2, d)); }
    const pd = pathDist(x, z);
    const path = smoothstep(1.05, 0.7, pd);
    const cob = smoothstep(S.r + 0.5, S.r, Math.hypot(x - S.x, z - S.z));
    data[k] = path * 255; data[k + 1] = mud * 255; data[k + 2] = cob * 255; data[k + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
}

// height texture for water depth (R: height mapped from [-10, 30])
function buildHeightTex() {
  const N = 256, data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -HG_EXT + (i + 0.5) / N * HG_EXT * 2, z = -HG_EXT + (j + 0.5) / N * HG_EXT * 2;
    const h = groundAt(x, z);
    const v = clamp((h + 10) / 40, 0, 1) * 65535;
    const k = (j * N + i) * 4;
    data[k] = v >> 8; data[k + 1] = v & 255; data[k + 2] = 0; data[k + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
}

const WATER_VS = /* glsl */`
varying vec3 vWPos; varying vec2 vUv2;
attribute float aFlow;
varying float vFlow;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz; vUv2 = uv; vFlow = aFlow;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const WATER_FS = /* glsl */`
uniform sampler2D uHeight; uniform float uLevel; uniform float uRiver; uniform vec3 uSunDir, uSunColor, uAmbient, uFogColor;
uniform float uFogNear, uFogFar;
varying vec3 vWPos; varying vec2 vUv2; varying float vFlow;
float groundH(vec2 xz){ vec4 t = texture2D(uHeight, (xz + 75.0) / 150.0); return (t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0 * 40.0 - 10.0; }
void main(){
  float gh = groundH(vWPos.xz);
  float level = uRiver > 0.5 ? vWPos.y : uLevel;
  float depth = max(level - gh, 0.0);
  // two scrolling ripple layers make a cheap normal
  vec2 p = vWPos.xz;
  float n1, n2;
  if (uRiver > 0.5) {
    n1 = vn2(vec2(vUv2.x * 3.0, vUv2.y * 4.0 - uTime * 1.6));
    n2 = vn2(vec2(vUv2.x * 6.0 + 3.0, vUv2.y * 9.0 - uTime * 2.3));
  } else {
    n1 = vn2(p * 0.55 + uTime * vec2(0.05, 0.03));
    n2 = vn2(p * 1.3 - uTime * vec2(0.04, 0.07) + 11.0);
  }
  vec3 nrm = normalize(vec3((n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.3, 1.0, (n2 - 0.5) * 0.5 - (n1 - 0.5) * 0.3));
  vec3 shallow = SRGB(vec3(0.38, 0.86, 0.84)), mid = SRGB(vec3(0.16, 0.64, 0.78)), deep = SRGB(vec3(0.07, 0.36, 0.62));
  if (uLevel > 0.5 || uRiver > 0.5) { shallow = SRGB(vec3(0.45, 0.82, 0.80)); mid = SRGB(vec3(0.20, 0.58, 0.68)); deep = SRGB(vec3(0.12, 0.40, 0.55)); }
  vec3 col = mix(shallow, mid, smoothstep(0.0, 1.6, depth));
  col = mix(col, deep, smoothstep(1.6, 6.5, depth));
  // light
  float diff = max(dot(nrm, uSunDir), 0.0);
  vec3 lit = col * (uAmbient * 0.9 + uSunColor * (0.35 + 0.65 * diff));
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 H = normalize(uSunDir + V);
  float spec = pow(clamp(dot(nrm, H), 0.0, 1.0), 140.0);
  lit += uSunColor * spec * 1.2 * cloudShade(vWPos.xz);
  lit *= mix(0.62, 1.0, cloudShade(vWPos.xz));
  // shore foam: bands rolling in toward the beach
  float foamBand = smoothstep(0.5, 0.95, sin(depth * 9.0 - uTime * 1.6 + n1 * 4.0) * 0.5 + 0.5) * smoothstep(1.1, 0.15, depth);
  float edge = smoothstep(0.22, 0.0, depth);
  float foam = clamp(foamBand * 0.7 + edge, 0.0, 1.0);
  if (uRiver > 0.5) foam = clamp(edge + smoothstep(0.72, 0.95, n1) * 0.35, 0.0, 1.0);
  lit = mix(lit, uSunColor * 0.9 + uAmbient * 0.5, foam * 0.85);
  lit += lit * uFlash * 0.8;
  // distance haze
  float fd = length(vWPos - cameraPosition);
  lit = mix(lit, uFogColor, smoothstep(uFogNear, uFogFar, fd));
  float alpha = uRiver > 0.5 ? smoothstep(0.0, 0.12, depth) * 0.92 + 0.08 : 1.0;
  gl_FragColor = vec4(lit, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function waterMaterial(heightTex, level, isRiver) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHeight: { value: heightTex }, uLevel: { value: level }, uRiver: { value: isRiver ? 1 : 0 },
      uSunDir: G.shared.sunDir, uSunColor: G.shared.sunColor, uAmbient: G.shared.ambient,
      uFogColor: { value: new THREE.Color(0x9fd4e8) }, uFogNear: { value: 160 }, uFogFar: { value: 520 },
      uField: G.shared.fieldTex, uFeet: G.shared.feet, uFootCount: G.shared.footCount, uFlash: G.shared.flash, uDusk: G.shared.dusk, uTime: G.shared.time,
    },
    vertexShader: WATER_VS,
    fragmentShader: '#include <common>\n' + GLSL_COMMON + WATER_FS,
    transparent: !!isRiver,
    depthWrite: !isRiver,
  });
}


function buildRiverMesh(heightTex) {
  const P = river.pts;
  const pos = [], uv = [], flow = [], idx = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = -tz, nz = tx, hw = P[i].w * 0.5 + 0.35;
    const y = P[i].surf;
    pos.push(P[i].x + nx * hw, y, P[i].z + nz * hw, P[i].x - nx * hw, y, P[i].z - nz * hw);
    uv.push(0, P[i].s / 6, 1, P[i].s / 6);
    flow.push(1, 1);
    if (i < P.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, waterMaterial(heightTex, 0, true));
  m.renderOrder = 2;
  m.position.y = 0.04;
  return m;
}

function disc(r, seg) {
  const g = new THREE.CircleGeometry(r, seg); g.rotateX(-Math.PI / 2);
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return g;
}

export function createIsland(scene) {
  G.shared.detailTex.value = buildDetailTex();
  const terrain = buildTerrain();
  scene.add(terrain);
  const heightTex = buildHeightTex();
  // the sea: a big disc, finer near the island
  const seaGeo = new THREE.PlaneGeometry(1200, 1200, 8, 8); seaGeo.rotateX(-Math.PI / 2);
  seaGeo.setAttribute('aFlow', new THREE.Float32BufferAttribute(new Float32Array(seaGeo.attributes.position.count), 1));
  const seaMat = waterMaterial(heightTex, 0, false);
  const sea = new THREE.Mesh(seaGeo, seaMat);
  scene.add(sea);
  const lakes = [];
  for (const L of [LAYOUT.tarn, LAYOUT.lake]) {
    const m = new THREE.Mesh(disc(L.r + 0.6, 48), waterMaterial(heightTex, L.level, false));
    m.position.set(L.x, L.level, L.z);
    scene.add(m); lakes.push(m);
  }
  const riverMesh = buildRiverMesh(heightTex);
  scene.add(riverMesh);
  const waterMats = [seaMat, ...lakes.map((l) => l.material), riverMesh.material];
  return {
    terrain, sea, lakes, riverMesh, heightTex, waterMats, river,
    setFog(color, near, far) { for (const m of waterMats) { m.uniforms.uFogColor.value.copy(color); m.uniforms.uFogNear.value = near; m.uniforms.uFogFar.value = far; } },
  };
}
