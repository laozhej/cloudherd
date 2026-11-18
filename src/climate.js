// The ground's water: a moisture grid the rain fills and the sun drains, plus the
// burn and fire layers. Everything is packed into one RGBA texture every frame so
// any shader can colour itself by how wet or scorched the ground is.
import * as THREE from 'three';
import { G } from './state.js';
import { GRID, HALF, CELL } from './consts.js';
import { clamp, fbm } from './util.js';
import { masks } from './island.js';

export function createClimate() {
  const N = GRID * GRID;
  const moist = new Float32Array(N), burn = new Float32Array(N), fire = new Float32Array(N), wet = new Float32Array(N);
  const data = new Uint8Array(N * 4);
  const tex = new THREE.DataTexture(data, GRID, GRID, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  G.shared.fieldTex.value = tex;
  // the floor near water: banks stay damp whatever the sun does
  const floor = new Float32Array(N);
  for (let k = 0; k < N; k++) floor[k] = masks.near[k] * 0.62;

  let rainLog = 0; // water delivered to the ground this frame (for audio and stats)

  const api = {
    moist, burn, fire, wet, tex, floor,
    rainThisFrame: 0,
    reset(base = 0.4, spread = 0.25, seed = 1) {
      for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
        const k = j * GRID + i;
        const n = fbm(i * 0.06 + seed * 3.1, j * 0.06 + seed * 1.7, 3);
        moist[k] = Math.max(floor[k], clamp(base + (n - 0.5) * 2 * spread, 0, 1));
        burn[k] = 0; fire[k] = 0; wet[k] = 0;
      }
      api.upload();
    },
    // pour `amount` water units over a disc. Returns the share that landed on land.
    addRain(x, z, radius, amount) {
      const r = Math.max(1, radius / CELL);
      const ci = (x + HALF) / CELL - 0.5, cj = (z + HALF) / CELL - 0.5;
      const i0 = Math.max(0, Math.floor(ci - r)), i1 = Math.min(GRID - 1, Math.ceil(ci + r));
      const j0 = Math.max(0, Math.floor(cj - r)), j1 = Math.min(GRID - 1, Math.ceil(cj + r));
      // weights: soft disc, normalised so the full amount is spread over the disc area
      const area = Math.PI * r * r * 0.62;
      const per = (amount * RAIN_TO_MOIST) / area;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = i - ci, dz = j - cj, d2 = (dx * dx + dz * dz) / (r * r);
        if (d2 >= 1) continue;
        const w = (1 - d2) * (1 - d2) * 1.6;
        const k = j * GRID + i;
        moist[k] = Math.min(1.25, moist[k] + per * w);
        wet[k] = Math.min(1, wet[k] + per * w * 3);
      }
      rainLog += amount;
    },
    update(dt, dryRate) {
      for (let k = 0; k < N; k++) {
        let m = moist[k];
        // wetter ground dries a little faster at the top end, so soaking pays off but does not last forever
        m -= dt * dryRate * (m > 1 ? 1.8 : 1);
        if (m < floor[k]) m = floor[k];
        if (m < 0) m = 0;
        moist[k] = m;
        wet[k] = Math.max(0, wet[k] - dt * 0.35);
      }
      api.rainThisFrame = rainLog; rainLog = 0;
    },
    at(x, z) {
      const i = clamp(Math.floor((x + HALF) / CELL), 0, GRID - 1), j = clamp(Math.floor((z + HALF) / CELL), 0, GRID - 1);
      return moist[j * GRID + i];
    },
    idx(x, z) { return clamp(Math.floor((z + HALF) / CELL), 0, GRID - 1) * GRID + clamp(Math.floor((x + HALF) / CELL), 0, GRID - 1); },
    upload() {
      for (let k = 0, o = 0; k < N; k++, o += 4) {
        data[o] = Math.min(255, moist[k] * 204);  // 1.25 -> 255
        data[o + 1] = burn[k] * 255;
        data[o + 2] = fire[k] * 255;
        data[o + 3] = wet[k] * 255;
      }
      tex.needsUpdate = true;
    },
  };
  return api;
}

// how much moisture (summed over cells) one unit of rain water adds
export const RAIN_TO_MOIST = 30;
