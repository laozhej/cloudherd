// Wildfire on the simulation grid: dry, wooded cells catch, spread downwind,
// burn out to ash, and go out under rain. Houses can catch too.
import { G } from './state.js';
import { GRID, HALF, CELL } from './consts.js';
import { clamp, smoothstep, rand } from './util.js';
import { masks } from './island.js';
import { LAYOUT } from './island.js';
import { rectDist } from './util.js';

const NB = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

export function createFire() {
  const N = GRID * GRID;
  const fuel0 = new Float32Array(N), fuel = new Float32Array(N);
  const active = new Set();
  let built = false;
  const cx = (k) => -HALF + ((k % GRID) + 0.5) * CELL, cz = (k) => -HALF + (Math.floor(k / GRID) + 0.5) * CELL;

  const woods = []; // cells dense enough with trees to catch on their own
  function buildFuel() {
    const trees = G.props.trees.fuel;
    // blur the tree map so a wood reads as one continuous stand of fuel
    const blur = new Float32Array(N);
    for (let j = 1; j < GRID - 1; j++) for (let i = 1; i < GRID - 1; i++) {
      const k = j * GRID + i; const v = trees[k];
      if (!v) continue;
      blur[k] += v * 0.9;
      for (const [di, dj] of NB) blur[(j + dj) * GRID + i + di] += v * 0.3;
    }
    for (let k = 0; k < N; k++) {
      const land = !masks.water[k] && masks.ground[k] > 0.6 && masks.ground[k] < 13;
      fuel0[k] = land ? clamp(blur[k] + 0.22, 0, 1) : 0;
    }
    // the village square does not burn; fields burn a little
    for (let k = 0; k < N; k++) {
      if (!fuel0[k]) continue;
      const x = cx(k), z = cz(k);
      const S = LAYOUT.square;
      if (Math.hypot(x - S.x, z - S.z) < S.r + 1) fuel0[k] = 0;
      for (const f of LAYOUT.fields) if (rectDist(x, z, f) < 0) fuel0[k] = 0.35;
      if (trees[k] >= 0.5 && fuel0[k] > 0.6) woods.push(k);
    }
    built = true;
  }

  let emitBudget = 0, clusterT = 0;
  const api = {
    active, fuel, clusters: [],
    reset() {
      if (!built) buildFuel();
      fuel.set(fuel0); active.clear();
      const C = G.climate; C.fire.fill(0); C.burn.fill(0);
      for (const h of G.props.houses) { h.fire = 0; h.lost = false; h.saved = 0; }
      api.clusters = [];
    },
    ignite(x, z, r = 1.2) {
      const C = G.climate;
      let n = 0;
      const i0 = Math.floor((x - r + HALF) / CELL), i1 = Math.floor((x + r + HALF) / CELL), j0 = Math.floor((z - r + HALF) / CELL), j1 = Math.floor((z + r + HALF) / CELL);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
        const k = j * GRID + i;
        if (fuel[k] < 0.08 || C.moist[k] > 0.45 || C.fire[k] > 0) continue;
        C.fire[k] = 0.15; active.add(k); n++;
      }
      // a house hit directly
      for (const h of G.props.houses) if (!h.lost && h.fire <= 0 && Math.hypot(h.x - x, h.z - z) < h.r + r) { h.fire = 0.02; n++; api.onHouseFire?.(h); }
      return n;
    },
    // pick a dry, wooded spot (optionally inside an area) and set it alight
    spontaneous(area) {
      const C = G.climate;
      const pool = woods.filter((k) => C.moist[k] < 0.24 && C.fire[k] === 0 && fuel[k] > 0.5 && (!area || Math.hypot(cx(k) - area.x, cz(k) - area.z) < area.r));
      if (!pool.length) return null;
      const k = pool[(Math.random() * pool.length) | 0];
      const x = cx(k), z = cz(k);
      return api.ignite(x, z, 1.0) ? { x, z } : null;
    },
    update(dt) {
      const C = G.climate, W = G.wind;
      const spread = G.day?.fire?.spread ?? G.day?.fireSpread ?? 0.07;
      const ignite = [];
      let outNow = 0;
      for (const k of active) {
        let f = C.fire[k];
        const m = C.moist[k];
        if (m > 0.42) {
          f -= dt * 2.8;
          if (Math.random() < dt * 6) G.fx.steam(cx(k), masks.ground[k] + 0.4, cz(k), 1);
        } else {
          f = Math.min(1, f + dt * 0.75);
          fuel[k] -= dt * 0.09 * f;
          C.burn[k] = Math.min(1, C.burn[k] + dt * 0.14 * f);
          C.moist[k] = Math.max(0, m - dt * 0.04);
          if (f > 0.45) {
            const i = k % GRID, j = (k / GRID) | 0;
            for (const [di, dj] of NB) {
              const ni = i + di, nj = j + dj;
              if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) continue;
              const n = nj * GRID + ni;
              if (C.fire[n] > 0 || fuel[n] < 0.06) continue;
              const dry = smoothstep(0.42, 0.06, C.moist[n]);
              if (dry <= 0) continue;
              const dl = Math.hypot(di, dj);
              const wind = 1 + 1.7 * Math.max(0, (di * W.x + dj * W.z) / dl) * Math.min(1.5, W.speed);
              const p = spread * (0.35 + 0.65 * fuel[n]) * dry * wind * (dl > 1 ? 0.7 : 1) * dt;
              if (Math.random() < p) ignite.push(n);
            }
          }
        }
        if (f <= 0 || fuel[k] <= 0) { C.fire[k] = 0; active.delete(k); if (f <= 0) outNow++; continue; }
        C.fire[k] = f;
      }
      for (const n of ignite) if (!C.fire[n]) { C.fire[n] = 0.12; active.add(n); }
      if (outNow) api.onDoused?.(outNow);
      // houses
      for (const h of G.props.houses) {
        if (h.lost) continue;
        const m = C.moist[h.k];
        if (h.fire <= 0) {
          // flames lick the walls
          if (C.fire[h.k] > 0.5 || neighborsBurning(h.k)) { if (m < 0.42) { h.fire = 0.02; api.onHouseFire?.(h); } }
          continue;
        }
        if (m > 0.42) { h.fire -= dt * 0.45; if (h.fire <= 0) { h.fire = 0; api.onHouseSaved?.(h); } }
        else { h.fire += dt / 24; if (h.fire >= 1) { h.lost = true; h.fire = 0; api.onHouseLost?.(h); } }
      }
      // flames and smoke, on a budget
      emitBudget += dt * 90;
      if (active.size && emitBudget > 1) {
        const arr = Array.from(active);
        let n = Math.min(Math.floor(emitBudget), 40);
        emitBudget -= n;
        while (n-- > 0) {
          const k = arr[(Math.random() * arr.length) | 0];
          const f = C.fire[k];
          const x = cx(k) + rand(-0.5, 0.5), z = cz(k) + rand(-0.5, 0.5), y = masks.ground[k];
          const tall = G.props.trees.fuel[k] > 0.3 ? 1.6 : 0.6;
          if (f > 0.2) G.fx.flame(x, y + tall * Math.random(), z, 0.8 + f * 0.6 * tall);
          if (Math.random() < 0.3) G.fx.smoke(x, y + 1.5, z, 0.75, 1.2);
        }
      } else if (!active.size) emitBudget = 0;
      for (const h of G.props.houses) if (h.fire > 0 && Math.random() < dt * 22) {
        G.fx.flame(h.x + rand(-1, 1), h.y + rand(0.5, h.height), h.z + rand(-1, 1), 1.1);
        if (Math.random() < 0.4) G.fx.smoke(h.x, h.y + h.height, h.z, 0.8, 1.4);
      }
      // clusters for the HUD markers
      clusterT -= dt;
      if (clusterT <= 0) {
        clusterT = 0.4;
        const B = 14, map = new Map();
        for (const k of active) { if (C.fire[k] < 0.2) continue; const key = (((k % GRID) / B) | 0) + ',' + ((((k / GRID) | 0) / B) | 0); const c = map.get(key) || { x: 0, z: 0, n: 0 }; c.x += cx(k); c.z += cz(k); c.n++; map.set(key, c); }
        api.clusters = [...map.values()].map((c) => ({ x: c.x / c.n, z: c.z / c.n, n: c.n })).sort((a, b) => b.n - a.n).slice(0, 5);
      }
    },
    burning() { return active.size; },
  };
  function neighborsBurning(k) {
    const C = G.climate, i = k % GRID, j = (k / GRID) | 0;
    for (const [di, dj] of NB) { const ni = i + di, nj = j + dj; if (ni >= 0 && nj >= 0 && ni < GRID && nj < GRID && C.fire[nj * GRID + ni] > 0.6) return true; }
    return false;
  }
  return api;
}
