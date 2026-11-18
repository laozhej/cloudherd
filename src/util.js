export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const saturate = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = saturate((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// frame-rate independent exponential approach
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const len2 = (x, z) => Math.sqrt(x * x + z * z);

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

export function ridged(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1);
    s += a * v * v; n += a; a *= 0.5; f *= 2.07;
  }
  return s / n;
}

export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// distance from point p to segment ab (2D, xz) plus the param t along the segment
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  const qx = ax + dx * t, qz = az + dz * t;
  return { d: Math.hypot(px - qx, pz - qz), t };
}

// signed distance from a point to a rotated rectangle (negative inside)
export function rectDist(px, pz, r) {
  const c = Math.cos(-r.rot), s = Math.sin(-r.rot);
  const lx = (px - r.x) * c - (pz - r.z) * s, lz = (px - r.x) * s + (pz - r.z) * c;
  const qx = Math.abs(lx) - r.w / 2, qz = Math.abs(lz) - r.d / 2;
  const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0);
}

// world point -> rectangle-local coordinates
export function toLocal(px, pz, r) {
  const c = Math.cos(-r.rot), s = Math.sin(-r.rot);
  return [(px - r.x) * c - (pz - r.z) * s, (px - r.x) * s + (pz - r.z) * c];
}
export function toWorld(lx, lz, r) {
  const c = Math.cos(r.rot), s = Math.sin(r.rot);
  return [r.x + lx * c - lz * s, r.z + lx * s + lz * c];
}

export const fmtClock = (t01) => {
  // the day runs from 06:00 to 18:00
  const mins = Math.round((6 + 12 * clamp(t01, 0, 1)) * 60);
  return String((mins / 60) | 0).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
};
