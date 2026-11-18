// Village life: the villagers (who open umbrellas in the rain and cheer at harvests),
// the fair on the square, laundry lines, the rain gauge, chimney smoke and burnt houses.
import * as THREE from 'three';
import { G } from './state.js';
import { Kit } from './kit.js';
import { patchMaterial } from './shade.js';
import { kitMaterial } from './props.js';
import { LAYOUT, groundAt } from './island.js';
import { clamp, damp, lerp, rand, mulberry32, toWorld } from './util.js';

const CLOTHES = [0xd9534f, 0x4f7fd9, 0xf0ad4e, 0x5cb85c, 0x9b59b6, 0x2c8f8f, 0xe67e9a, 0x6d5d4b, 0xf2e3c6, 0x34495e];
const SKIN = [0xf1c8a8, 0xe0ac86, 0xc68a62, 0x9a6544, 0xf5d3b8];
const UMB = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0xff7aa8];

function riverX(z) {
  const R = LAYOUT.river;
  for (let i = 0; i < R.length - 1; i++) {
    const [ax, az] = R[i], [bx, bz] = R[i + 1];
    if (z >= az && z <= bz) return lerp(ax, bx, (z - az) / (bz - az || 1));
  }
  return z < R[0][1] ? R[0][0] : R[R.length - 1][0];
}

function stripedCone(k, r, h, a, b, p) {
  const n = 10;
  for (let i = 0; i < n; i++) {
    const g = new THREE.ConeGeometry(r, h, 3, 1, false, (i / n) * Math.PI * 2, (Math.PI * 2) / n);
    k.add(g, i % 2 ? a : b, { p });
  }
}

export function createVillage(scene) {
  const rng = mulberry32(5);
  const S = LAYOUT.square, V = LAYOUT.village;
  const sy = groundAt(S.x, S.z);

  // ---------------------------------------------------------------- villagers
  const N = 26;
  const plain = patchMaterial(new THREE.MeshLambertMaterial({ flatShading: true }));
  const bodyGeo = new THREE.CylinderGeometry(0.2, 0.28, 0.72, 6); bodyGeo.translate(0, 0.36, 0);
  const headGeo = new THREE.IcosahedronGeometry(0.19, 1); headGeo.translate(0, 0.92, 0);
  const hatGeo = new THREE.ConeGeometry(0.3, 0.22, 8); hatGeo.translate(0, 1.13, 0);
  const umbGeo = new THREE.ConeGeometry(0.72, 0.32, 8, 1, true); umbGeo.translate(0, 1.55, 0);
  const mkI = (g, n, mat = plain) => { const m = new THREE.InstancedMesh(g, mat, n); m.castShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
  const bodies = mkI(bodyGeo, N), heads = mkI(headGeo, N), hats = mkI(hatGeo, N);
  const umbMat = patchMaterial(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, flatShading: true }));
  const umbs = mkI(umbGeo, N, umbMat);
  const c = new THREE.Color();
  const folk = [];
  for (let i = 0; i < N; i++) {
    const a = rng() * 6.28, r = 2 + rng() * 6;
    const x = S.x + Math.cos(a) * r, z = S.z + Math.sin(a) * r;
    const f = { i, x, z, tx: x, tz: z, wait: rng() * 3, speed: 1.15 + rng() * 0.5, phase: rng() * 6.28, umb: 0, jump: 0, jumpN: 0, hat: rng() < 0.45, route: [], farmer: i < 8, field: -1, mode: 'wander', dance: rng() * 6.28, h: 0.9 + rng() * 0.2 };
    bodies.setColorAt(i, c.setHex(CLOTHES[(rng() * CLOTHES.length) | 0]));
    heads.setColorAt(i, c.setHex(SKIN[(rng() * SKIN.length) | 0]));
    hats.setColorAt(i, c.setHex(rng() < 0.6 ? 0xe8c872 : 0x6d4c33));
    umbs.setColorAt(i, c.setHex(UMB[(rng() * UMB.length) | 0]));
    folk.push(f);
  }

  // ---------------------------------------------------------------- fair dressing
  const fair = new THREE.Group(); fair.visible = false; scene.add(fair);
  {
    const k = new Kit();
    const tents = [[S.x - 3.4, S.z - 3.0, 0xd9534f], [S.x + 3.6, S.z - 2.6, 0x4f7fd9], [S.x + 3.2, S.z + 3.3, 0xf0ad4e], [S.x - 3.5, S.z + 3.0, 0x5cb85c]];
    for (const [x, z, col] of tents) {
      const y = groundAt(x, z);
      k.cyl(1.05, 1.05, 1.1, 10, 0xf7f1e3, { p: [x, y + 0.55, z] });
      stripedCone(k, 1.35, 1.2, col, 0xfaf6ee, [x, y + 1.7, z]);
      k.cyl(0.03, 0.03, 0.6, 4, 0x6b4a35, { p: [x, y + 2.5, z] });
      k.box(0.35, 0.2, 0.02, col, { p: [x + 0.18, y + 2.68, z] });
    }
    // maypole with ribbons
    k.cyl(0.08, 0.1, 4.4, 6, 0xf3ead6, { p: [S.x, sy + 2.2, S.z] });
    k.ball(0.25, 0xffd24a, { p: [S.x, sy + 4.5, S.z] }, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.28, L = 3.1;
      const ex = S.x + Math.cos(a) * 2.2, ez = S.z + Math.sin(a) * 2.2;
      const mx = (S.x + ex) / 2, mz = (S.z + ez) / 2;
      k.box(0.06, L, 0.02, CLOTHES[i % CLOTHES.length], { p: [mx, sy + 2.6, mz], r: [0, -a, 0.78] });
    }
    // bunting around the square
    const posts = 7, PR = S.r + 0.9;
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * 6.28, b = ((i + 1) / posts) * 6.28;
      const ax = S.x + Math.cos(a) * PR, az = S.z + Math.sin(a) * PR, bx = S.x + Math.cos(b) * PR, bz = S.z + Math.sin(b) * PR;
      const ay = groundAt(ax, az), by = groundAt(bx, bz);
      k.cyl(0.05, 0.06, 2.6, 4, 0x8a6442, { p: [ax, ay + 1.3, az] });
      for (let j = 1; j < 9; j++) {
        const t = j / 9;
        const x = lerp(ax, bx, t), z = lerp(az, bz, t), y = lerp(ay, by, t) + 2.5 - Math.sin(t * Math.PI) * 0.45;
        const tri = new THREE.BufferGeometry();
        tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.16, 0, 0, 0.16, 0, 0, 0, -0.32, 0, -0.16, 0, 0, 0, -0.32, 0, 0.16, 0, 0], 3));
        tri.computeVertexNormals();
        k.add(tri, CLOTHES[(i * 3 + j) % CLOTHES.length], { p: [x, y, z], r: [0, -Math.atan2(bz - az, bx - ax), 0] });
      }
    }
    // lanterns (glow at dusk)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28 + 0.3, x = S.x + Math.cos(a) * 4.2, z = S.z + Math.sin(a) * 4.2, y = groundAt(x, z);
      k.cyl(0.04, 0.04, 1.6, 4, 0x6b4a35, { p: [x, y + 0.8, z] });
      k.ball(0.2, 0xffb347, { p: [x, y + 1.75, z], s: [1, 1.3, 1], glow: 1 }, 1);
    }
    const m = new THREE.Mesh(k.build(), kitMaterial()); m.castShadow = true; m.receiveShadow = true;
    fair.add(m);
  }

  // ---------------------------------------------------------------- laundry lines
  const laundry = [];
  const laundryGroup = new THREE.Group(); laundryGroup.visible = false; scene.add(laundryGroup);
  {
    const spots = [[20.5, 7.5, 0.4], [21.5, 19, -0.5], [14, 23.2, 0.1]];
    for (const [x, z, rot] of spots) {
      const k = new Kit();
      const y = groundAt(x, z);
      const L = 3.6;
      for (const s of [-1, 1]) k.cyl(0.05, 0.05, 1.8, 4, 0x8a6442, { p: [s * L / 2, 0.9, 0] });
      k.box(L, 0.02, 0.02, 0xdddddd, { p: [0, 1.72, 0] });
      for (let i = 0; i < 5; i++) {
        const cx = -L / 2 + 0.45 + i * 0.68, col = CLOTHES[(i * 7 + laundry.length * 3) % CLOTHES.length];
        if (i % 2) k.box(0.45, 0.6, 0.03, col, { p: [cx, 1.4, 0] });
        else { k.box(0.5, 0.42, 0.03, col, { p: [cx, 1.5, 0] }); k.box(0.16, 0.3, 0.03, col, { p: [cx - 0.13, 1.18, 0] }); k.box(0.16, 0.3, 0.03, col, { p: [cx + 0.13, 1.18, 0] }); }
      }
      const m = new THREE.Mesh(k.build(), kitMaterial()); m.position.set(x, y, z); m.rotation.y = rot; m.castShadow = true;
      laundryGroup.add(m);
      laundry.push({ x, z, mesh: m, soaked: 0, wet: false });
    }
  }

  // ---------------------------------------------------------------- rain gauge (the festival's big barrel)
  const gauge = new THREE.Group(); gauge.visible = false; scene.add(gauge);
  const gx = S.x + 1.6, gz = S.z + 0.2, gy = groundAt(gx, gz);
  {
    const k = new Kit();
    k.cyl(1.0, 0.9, 2.2, 14, 0xa77a4f, { p: [0, 1.1, 0] });
    for (const y of [0.35, 1.1, 1.85]) k.cyl(1.03, 1.03, 0.1, 14, 0x5d5348, { p: [0, y, 0] });
    const m = new THREE.Mesh(k.build(), kitMaterial()); m.castShadow = true;
    gauge.add(m);
  }
  const gaugeWater = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.1, 14), new THREE.MeshBasicMaterial({ color: 0x6fd3f0 }));
  gaugeWater.position.y = 0.2;
  gauge.add(gaugeWater);
  gauge.position.set(gx, gy, gz);

  // ruined-house material
  const ruinMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: 0x3a3330 }));

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  let smokeT = 0;

  function routeTo(f, x, z) {
    f.route = [];
    const sideA = f.x - riverX(f.z), sideB = x - riverX(z);
    if (Math.sign(sideA) !== Math.sign(sideB)) {
      const B = LAYOUT.bridge;
      if (sideA > 0) { f.route.push([B.x + 4.2, B.z], [B.x - 4.2, B.z]); } else { f.route.push([B.x - 4.2, B.z], [B.x + 4.2, B.z]); }
    }
    f.route.push([x, z]);
    [f.tx, f.tz] = f.route.shift();
  }
  function villagePoint() {
    for (let t = 0; t < 20; t++) {
      const a = Math.random() * 6.28, r = Math.random() < 0.5 ? rand(0.5, S.r) : rand(S.r, V.r + 2);
      const x = S.x + Math.cos(a) * r, z = S.z + Math.sin(a) * r;
      if (x < 8.5) continue;
      if (G.props.houses.some((h) => Math.hypot(h.x - x, h.z - z) < h.r + 0.8)) continue;
      return [x, z];
    }
    return [S.x, S.z];
  }

  const api = {
    folk, fair, laundry, laundryGroup, gauge, gaugeWater,
    fairOn: false, gaugeFill: 0, lanternGlow: 0,
    setup(day) {
      api.fairOn = false; fair.visible = !!day.fair; laundryGroup.visible = !!day.laundry; gauge.visible = !!day.gauge;
      for (const l of laundry) { l.soaked = 0; l.wet = false; l.mesh.rotation.z = 0; }
      api.gaugeFill = 0;
      for (const h of G.props.houses) { h.mesh.material = kitMaterial(); h.mesh.scale.set(1, 1, 1); }
      const fieldsActive = G.crops.fields.filter((f) => f.active);
      folk.forEach((f, i) => {
        const [x, z] = villagePoint();
        f.x = x; f.z = z; f.route = []; f.tx = x; f.tz = z; f.wait = Math.random() * 2; f.umb = 0; f.jump = 0; f.mode = 'wander';
        f.field = f.farmer && fieldsActive.length ? fieldsActive[i % fieldsActive.length].def.id : -1;
      });
    },
    houseLost(h) { h.mesh.material = ruinMat; h.mesh.scale.set(1.05, 0.55, 1.05); },
    cheer(x, z, r = 14) { for (const f of folk) if (Math.hypot(f.x - x, f.z - z) < r || Math.random() < 0.25) { f.jump = 1; f.jumpN = 2 + ((Math.random() * 2) | 0); } },
    update(dt) {
      const t = G.time;
      const clouds = G.clouds;
      for (const f of folk) {
        // decide where to go
        if (Math.hypot(f.tx - f.x, f.tz - f.z) < 0.3) {
          if (f.route.length) { [f.tx, f.tz] = f.route.shift(); }
          else {
            f.wait -= dt;
            if (f.wait <= 0) {
              f.wait = rand(1.5, 5);
              if (api.fairOn && Math.random() < 0.85) { const a = Math.random() * 6.28, r = rand(0.8, S.r - 0.3); routeTo(f, S.x + Math.cos(a) * r, S.z + Math.sin(a) * r); }
              else if (f.field >= 0 && Math.random() < 0.7) {
                const fd = LAYOUT.fields[f.field];
                const [x, z] = toWorld(rand(-fd.w / 2, fd.w / 2) * 0.9, fd.d / 2 + 1.2, fd);
                routeTo(f, x, z);
              } else { const [x, z] = villagePoint(); routeTo(f, x, z); }
            }
          }
        }
        const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
        let moving = false;
        if (d > 0.3) {
          const sp = f.speed * (f.umb > 0.5 ? 1.25 : 1);
          f.x += (dx / d) * Math.min(d, sp * dt); f.z += (dz / d) * Math.min(d, sp * dt);
          moving = true;
        }
        const rainHere = clouds.rainingNear(f.x, f.z);
        f.umb = damp(f.umb, rainHere > 0.1 ? 1 : 0, 6, dt);
        if (f.jump > 0) { f.jump -= dt * 2.4; if (f.jump <= 0 && --f.jumpN > 0) f.jump = 1; }
        const hop = f.jump > 0 ? Math.sin(f.jump * Math.PI) * 0.6 : 0;
        const dancing = api.fairOn && !moving && Math.hypot(f.x - S.x, f.z - S.z) < S.r && f.umb < 0.5;
        const y = groundAt(f.x, f.z) + (moving ? Math.abs(Math.sin(t * 9 + f.phase)) * 0.08 : 0) + hop + (dancing ? Math.abs(Math.sin(t * 6 + f.phase)) * 0.15 : 0);
        const yaw = moving ? Math.atan2(dx, dz) : dancing ? t * 2 + f.phase : 0;
        q.setFromEuler(e.set(0, yaw, moving ? Math.sin(t * 9 + f.phase) * 0.06 : 0));
        const s = f.h;
        m4.compose(pv.set(f.x, y, f.z), q, sv.set(s, s, s));
        bodies.setMatrixAt(f.i, m4); heads.setMatrixAt(f.i, m4);
        m4.compose(pv, q, sv.set(f.hat && f.umb < 0.5 ? s : 0, s, f.hat && f.umb < 0.5 ? s : 0));
        hats.setMatrixAt(f.i, m4);
        const us = f.umb * s;
        m4.compose(pv, q, sv.set(us, Math.max(0.001, us), us));
        umbs.setMatrixAt(f.i, m4);
      }
      for (const m of [bodies, heads, hats, umbs]) m.instanceMatrix.needsUpdate = true;
      // laundry sways; soaked lines droop
      for (const l of laundry) l.mesh.rotation.z = Math.sin(t * 2 + l.x) * 0.03 * (l.wet ? 0.2 : 1) * G.wind.speed;
      // gauge water level
      gaugeWater.position.y = 0.2 + clamp(api.gaugeFill, 0, 1) * 1.85;
      gaugeWater.scale.y = 1;
      // chimney smoke, mostly morning and evening
      smokeT -= dt;
      if (smokeT <= 0) {
        smokeT = 0.35;
        const daypart = G.dayT < 0.25 || G.dayT > 0.75 ? 1 : 0.3;
        for (const h of G.props.houses) if (h.chimney && !h.lost && Math.random() < 0.35 * daypart) G.fx.smoke(h.chimney.x, h.chimney.y, h.chimney.z, 0.1, 0.55);
      }
    },
  };
  return api;
}
