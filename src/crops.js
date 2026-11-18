// Fields and what grows in them. Crops grow while the soil under them is wet enough,
// wilt when it is not, and are harvested (score!) when ripe, then replanted.
import * as THREE from 'three';
import { G } from './state.js';
import { Kit } from './kit.js';
import { patchMaterial } from './shade.js';
import { LAYOUT, groundAt } from './island.js';
import { clamp, smoothstep, lerp, damp, toWorld, rectDist, mulberry32 } from './util.js';
import { GRID, HALF, CELL } from './consts.js';

export const CROPS = {
  wheat: { growTime: 38, need: 0.34, score: 100, spacing: [0.95, 1.05], young: 0x8fca52, ripe: 0xf0c44c },
  sunflower: { growTime: 48, need: 0.26, score: 120, spacing: [1.35, 1.4], young: 0x6fb244, ripe: 0x6fb244 },
  pumpkin: { growTime: 58, need: 0.46, score: 170, spacing: [1.7, 1.7], young: 0x5f9e3a, ripe: 0xf28a24 },
  lavender: { growTime: 34, need: 0.30, score: 90, spacing: [1.1, 1.2], young: 0x7fae6a, ripe: 0x9a7fe0 },
};
const BROWN = new THREE.Color(0x9c7a4a), DEAD = new THREE.Color(0x6e5a3e);

function wheatGeo() {
  const k = new Kit();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28, r = 0.08;
    k.cone(0.045, 1.0, 4, 0xffffff, { p: [Math.cos(a) * r, 0.5, Math.sin(a) * r], r: [Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18] });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.28 + 0.4, r = 0.11;
    k.ball(0.075, 0xffffff, { p: [Math.cos(a) * r, 1.0 + (i % 2) * 0.08, Math.sin(a) * r], s: [1, 2.8, 1] }, 0);
  }
  return k.build();
}
function sunStemGeo() {
  const k = new Kit();
  k.cyl(0.045, 0.065, 1.6, 5, 0x5f9e3a, { p: [0, 0.8, 0] });
  k.ball(0.22, 0x6fb244, { p: [0.18, 0.7, 0], s: [1.4, 0.25, 0.8] }, 0);
  k.ball(0.2, 0x6fb244, { p: [-0.16, 1.05, 0.05], s: [1.4, 0.25, 0.8] }, 0);
  return k.build();
}
function sunHeadGeo() {
  const k = new Kit();
  k.cyl(0.2, 0.2, 0.08, 12, 0x6a4424, { r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * 6.28;
    k.ball(0.11, 0xffc928, { p: [Math.cos(a) * 0.3, Math.sin(a) * 0.3, -0.01], s: [1.0, 1.0, 0.3], r: [0, 0, a] }, 0);
  }
  return k.build();
}
function pumpkinLeavesGeo() {
  const k = new Kit();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28;
    k.ball(0.32, 0x5f9e3a, { p: [Math.cos(a) * 0.42, 0.12, Math.sin(a) * 0.42], s: [1, 0.22, 0.8], r: [0, -a, 0] }, 0);
  }
  k.cyl(0.03, 0.03, 0.9, 4, 0x5f9e3a, { p: [0.3, 0.1, 0], r: [0, 0, Math.PI / 2] });
  return k.build();
}
function pumpkinGeo() {
  const k = new Kit();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28;
    k.ball(0.28, 0xffffff, { p: [Math.cos(a) * 0.14, 0.27, Math.sin(a) * 0.14], s: [1, 0.85, 1] }, 1);
  }
  k.cyl(0.04, 0.05, 0.18, 5, 0x6a5a2a, { p: [0, 0.55, 0] });
  return k.build();
}
function lavTuftGeo() {
  const k = new Kit();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 6.28;
    k.cone(0.04, 0.6, 3, 0x7fae6a, { p: [Math.cos(a) * 0.12, 0.28, Math.sin(a) * 0.12], r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] });
  }
  return k.build();
}
function lavSpikeGeo() {
  const k = new Kit();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 6.28, lean = 0.28;
    const x = Math.cos(a) * 0.14, z = Math.sin(a) * 0.14;
    k.cyl(0.015, 0.02, 0.6, 3, 0x7fae6a, { p: [x, 0.55, z], r: [Math.sin(a) * lean, 0, -Math.cos(a) * lean] });
    k.ball(0.07, 0x9a7fe0, { p: [x * 2.2, 0.92, z * 2.2], s: [1, 2.6, 1] }, 0);
  }
  return k.build();
}

export function createCrops(scene) {
  const soilMat = patchMaterial(new THREE.MeshLambertMaterial({ color: 0xffffff }), { soil: true });
  const plantMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  // count how many plants each field holds for each crop, so the instance pools are big enough
  const fields = LAYOUT.fields.map((def) => {
    const y = groundAt(def.x, def.z);
    const soil = new THREE.Mesh(new THREE.BoxGeometry(def.w + 0.3, 0.4, def.d + 0.3), soilMat);
    soil.position.set(def.x, y - 0.12, def.z); soil.rotation.y = -def.rot;
    soil.receiveShadow = true;
    scene.add(soil);
    // cells under the field, for its moisture
    const cells = [];
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const x = -HALF + (i + 0.5) * CELL, z = -HALF + (j + 0.5) * CELL;
      if (rectDist(x, z, def) < -0.3) cells.push(j * GRID + i);
    }
    return { def, y, soil, cells, type: null, plants: [], growth: 0, gv: 0, health: 1, hv: 1, moist: 0.4, dead: false, deadT: 0, harvests: 0, pop: 0, active: false, smog: 0, warnT: 0, acid: 0 };
  });
  const maxPlants = {};
  for (const type of Object.keys(CROPS)) {
    const [sx, sz] = CROPS[type].spacing;
    maxPlants[type] = fields.reduce((s, f) => s + Math.floor((f.def.w - 0.6) / sx) * Math.floor((f.def.d - 0.6) / sz), 0);
  }
  const mk = (geo, n) => { const m = new THREE.InstancedMesh(geo, plantMat, n); m.count = 0; m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, new THREE.Color()); scene.add(m); return m; };
  const meshes = {
    wheat: [mk(wheatGeo(), maxPlants.wheat)],
    sunflower: [mk(sunStemGeo(), maxPlants.sunflower), mk(sunHeadGeo(), maxPlants.sunflower)],
    pumpkin: [mk(pumpkinLeavesGeo(), maxPlants.pumpkin), mk(pumpkinGeo(), maxPlants.pumpkin)],
    lavender: [mk(lavTuftGeo(), maxPlants.lavender), mk(lavSpikeGeo(), maxPlants.lavender)],
  };

  function plant(f, type) {
    f.type = type; f.plants = [];
    f.active = !!type;
    f.soil.visible = true;
    if (!type) return;
    const C = CROPS[type];
    const [sx, sz] = C.spacing;
    const nx = Math.floor((f.def.w - 0.6) / sx), nz = Math.floor((f.def.d - 0.6) / sz);
    const rng = mulberry32(f.def.id * 97 + type.length);
    for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) {
      const lx = -((nx - 1) * sx) / 2 + c * sx + (rng() - 0.5) * 0.18, lz = -((nz - 1) * sz) / 2 + r * sz + (rng() - 0.5) * 0.18;
      const [x, z] = toWorld(lx, lz, f.def);
      f.plants.push({ x, z, rot: rng() * 6.28, v: 0.88 + rng() * 0.24, tilt: rng() * 6.28, idx: -1 });
    }
  }
  function assign() {
    const counts = { wheat: 0, sunflower: 0, pumpkin: 0, lavender: 0 };
    for (const f of fields) if (f.type) for (const p of f.plants) p.idx = counts[f.type]++;
    for (const t in meshes) for (const m of meshes[t]) m.count = counts[t];
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color(), col2 = new THREE.Color(), ax = new THREE.Vector3();
  let moistT = 0;

  const api = {
    fields, meshes,
    setup(plan) {
      // plan: array of crop types (or null) per field
      fields.forEach((f, i) => {
        plant(f, plan[i] || null);
        f.growth = plan.startGrowth?.[i] ?? 0.15; f.gv = f.growth; f.health = 1; f.hv = 1; f.dead = false; f.deadT = 0; f.harvests = 0; f.pop = 0; f.acid = 0; f.warnT = 0;
      });
      assign();
      api.render(0);
    },
    update(dt) {
      moistT -= dt;
      const C = G.climate;
      if (moistT <= 0) {
        moistT = 0.2;
        for (const f of fields) {
          let s = 0; for (const k of f.cells) s += Math.min(1, C.moist[k]);
          f.moist = s / f.cells.length;
          // smog parked over a field shades it
          f.smog = 0;
          for (const c of G.clouds.list) if (c.kind !== 'water' && Math.hypot(c.x - f.def.x, c.z - f.def.z) < c.R + 3) f.smog = 1;
        }
      }
      const growMul = G.day?.growMul ?? 1, wiltMul = G.day?.wiltMul ?? 1;
      for (const f of fields) {
        if (!f.active) continue;
        const T = CROPS[f.type];
        f.pop = Math.max(0, f.pop - dt * 2.5);
        if (f.dead) {
          f.deadT += dt;
          if (f.deadT > 12) {
            // the farmers replant and water the new seedlings by hand
            f.dead = false; f.growth = 0; f.gv = 0; f.health = 1; f.deadT = 0;
            for (const k of f.cells) G.climate.moist[k] = Math.max(G.climate.moist[k], 0.5);
            api.onReplant?.(f);
          }
          continue;
        }
        const m = f.moist, need = T.need;
        if (m >= need) {
          const q = 0.6 + 0.4 * smoothstep(need, need + 0.3, m);
          f.growth += (dt / T.growTime) * q * growMul * (f.smog ? 0.45 : 1) * (G.pace ?? 1);
          f.health = Math.min(1, f.health + dt * 0.09);
        } else if (m >= need - 0.12) {
          f.growth += (dt / T.growTime) * 0.12 * growMul * (G.pace ?? 1);
        } else {
          const thirst = 1 + (need - 0.12 - m) * 3;
          f.health -= (dt / 42) * thirst * wiltMul * (G.pace ?? 1);
        }
        if (f.acid > 0) { f.health -= f.acid * dt * 0.6; f.acid = Math.max(0, f.acid - dt * 1.5); }
        if (f.health <= 0) { f.health = 0; f.dead = true; f.deadT = 0; f.growth = 0; api.onWither?.(f); continue; }
        if (f.growth >= 1) {
          f.growth = 0; f.harvests++; f.pop = 1;
          api.onHarvest?.(f, T);
        }
      }
      api.render(dt);
    },
    // acid rain stings whatever it lands on
    acid(x, z, r, amount) {
      for (const f of fields) if (f.active && !f.dead && rectDist(x, z, f.def) < r * 0.8) f.acid = Math.min(1, f.acid + amount * 0.5);
    },
    render(dt) {
      const sun = G.shared.sunDir.value;
      const sunYaw = Math.atan2(sun.x, sun.z);
      for (const f of fields) {
        if (!f.active) continue;
        const T = CROPS[f.type];
        // eased visuals; a harvest snaps back to sprouts
        f.gv = f.growth < f.gv - 0.3 ? f.growth : damp(f.gv, f.growth, 6, dt || 1);
        f.hv = damp(f.hv, f.dead ? 0 : f.health, 4, dt || 1);
        const g = f.gv, wilt = 1 - smoothstep(0.15, 0.75, f.hv);
        const grow = lerp(0.2, 1.0, smoothstep(0, 0.82, g)) * (1 + f.pop * 0.25);
        const ripe = smoothstep(0.62, 0.95, g);
        col.setHex(T.young).lerp(col2.setHex(T.ripe), ripe);
        col.lerp(BROWN, wilt * 0.75);
        if (f.dead) col.copy(DEAD);
        const ms = meshes[f.type];
        for (const p of f.plants) {
          const tilt = wilt * 0.9 + (f.dead ? 0.6 : 0);
          ax.set(Math.cos(p.tilt), 0, Math.sin(p.tilt));
          q.setFromAxisAngle(ax, tilt);
          q2.setFromEuler(e.set(0, p.rot, 0)); q.multiply(q2);
          const s = grow * p.v;
          const sy = f.dead ? 0.35 : 1;
          const y = f.y + 0.05;
          if (f.type === 'wheat') {
            m4.compose(pv.set(p.x, y, p.z), q, sv.set(s, s * sy * 1.05, s));
            ms[0].setMatrixAt(p.idx, m4); ms[0].setColorAt(p.idx, col);
          } else if (f.type === 'sunflower') {
            m4.compose(pv.set(p.x, y, p.z), q, sv.set(s, s * sy, s));
            ms[0].setMatrixAt(p.idx, m4); ms[0].setColorAt(p.idx, col2.setRGB(1, 1, 1).lerp(BROWN, wilt * 0.8));
            const hs = s * smoothstep(0.35, 0.8, g) * (f.dead ? 0 : 1);
            q2.setFromEuler(e.set(-0.25 - wilt * 0.8, sunYaw, 0));
            m4.compose(pv.set(p.x, y + 1.6 * s * sy - wilt * 0.3, p.z), q2, sv.set(hs, hs, hs));
            ms[1].setMatrixAt(p.idx, m4); ms[1].setColorAt(p.idx, col2.setRGB(1, 1, 1).lerp(BROWN, wilt));
          } else if (f.type === 'pumpkin') {
            const ls = (0.45 + 0.55 * smoothstep(0, 0.5, g)) * p.v * (1 + f.pop * 0.2);
            m4.compose(pv.set(p.x, y, p.z), q2.setFromEuler(e.set(0, p.rot, 0)), sv.set(ls, ls * (f.dead ? 0.5 : 1), ls));
            ms[0].setMatrixAt(p.idx, m4); ms[0].setColorAt(p.idx, col2.setRGB(1, 1, 1).lerp(BROWN, Math.max(wilt, f.dead ? 1 : 0)));
            const ps = smoothstep(0.2, 0.95, g) * 1.25 * p.v * (f.dead ? 0 : 1) * (1 + f.pop * 0.3);
            m4.compose(pv.set(p.x + 0.1, y, p.z + 0.05), q2.setFromEuler(e.set(0, p.rot * 2, 0)), sv.set(ps, ps, ps));
            ms[1].setMatrixAt(p.idx, m4); ms[1].setColorAt(p.idx, col);
          } else if (f.type === 'lavender') {
            m4.compose(pv.set(p.x, y, p.z), q, sv.set(s * 1.1, s * sy, s * 1.1));
            ms[0].setMatrixAt(p.idx, m4); ms[0].setColorAt(p.idx, col2.setRGB(1, 1, 1).lerp(BROWN, Math.max(wilt, f.dead ? 1 : 0)));
            const ss = s * smoothstep(0.3, 0.75, g) * (f.dead ? 0.0 : 1);
            m4.compose(pv.set(p.x, y, p.z), q, sv.set(ss, ss, ss));
            ms[1].setMatrixAt(p.idx, m4); ms[1].setColorAt(p.idx, col2.setRGB(1, 1, 1).lerp(BROWN, wilt));
          }
        }
      }
      for (const t in meshes) for (const m of meshes[t]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    },
  };
  return api;
}
