// Clouds: soft bodies of puffs that drift with the wind, get shoved by the spirit,
// merge when pushed together, rain once they are heavy enough and turn into
// thunderheads if you overdo it. Also the rain itself.
import * as THREE from 'three';
import { G, MAX_FOOT } from './state.js';
import { CLOUD_Y, SPRITE_Y, RAIN_MASS, STORM_MASS, MAX_MASS, BOUND } from './consts.js';
import { clamp, damp, lerp, rand, smoothstep, mulberry32 } from './util.js';
import { groundAt, waterAt, insideIsland } from './island.js';

export const MAX_CLOUDS = 40;
const MAX_PUFF = 20;
const MAX_INST = MAX_CLOUDS * MAX_PUFF + 160;

export const radiusOf = (m) => 1.7 + 1.55 * Math.sqrt(Math.max(m, 0.05));
const inertiaOf = (m) => 0.65 + 0.16 * m;
const puffCount = (m) => clamp(Math.round(4 + m * 1.55), 4, MAX_PUFF);

const TINT = {
  water: new THREE.Color(1, 1, 1),
  rain: new THREE.Color(0.70, 0.75, 0.84),
  storm: new THREE.Color(0.34, 0.36, 0.47),
  smog: new THREE.Color(0.40, 0.36, 0.33),
  acid: new THREE.Color(0.62, 0.42, 0.80),
  gold: new THREE.Color(1.32, 1.0, 0.36),
  held: new THREE.Color(0.86, 0.98, 1.06),
};

const CLOUD_VS = /* glsl */`
varying vec3 vN; varying vec3 vW; varying vec3 vCol;
void main(){
  mat4 im = modelMatrix * instanceMatrix;
  vec4 wp = im * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(im) * normal);
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0);
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const CLOUD_FS = /* glsl */`
uniform vec3 uSunDir, uSunColor, uAmbient; uniform float uFlash;
varying vec3 vN; varying vec3 vW; varying vec3 vCol;
void main(){
  vec3 n = normalize(vN);
  float wrap = max(dot(n, uSunDir) * 0.55 + 0.45, 0.0);
  float under = smoothstep(${(CLOUD_Y - 2.2).toFixed(1)}, ${(CLOUD_Y + 2.6).toFixed(1)}, vW.y);
  vec3 V = normalize(cameraPosition - vW);
  float rim = pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 2.5);
  vec3 lit = vCol * (uAmbient * 1.0 + uSunColor * wrap * 0.62) * mix(0.68, 1.0, under);
  lit += uSunColor * rim * 0.12 * (0.5 + 0.5 * under);
  lit += vec3(0.85, 0.88, 1.0) * uFlash * 0.45;
  // colour above 1 in vCol means a lightning flicker inside the cloud
  lit += max(vCol - 1.0, 0.0) * vec3(0.9, 0.9, 1.0) * 2.0;
  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createClouds(scene) {
  const geo = new THREE.IcosahedronGeometry(1, G.settings.quality === 'high' ? 2 : 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSunDir: G.shared.sunDir, uSunColor: G.shared.sunColor, uAmbient: G.shared.ambient, uFlash: G.shared.flash },
    vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_INST);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, TINT.water);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);

  // ---------------------------------------------------------------- rain drops
  const MAX_DROPS = 3200;
  const dPos = new Float32Array(MAX_DROPS * 6), dCol = new Float32Array(MAX_DROPS * 6);
  const drops = new Float32Array(MAX_DROPS * 6); // x y z vx vy vz
  const dKind = new Uint8Array(MAX_DROPS); let dCount = 0;
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage));
  rainGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 3).setUsage(THREE.DynamicDrawUsage));
  const rainMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  scene.add(rainLines);

  // ---------------------------------------------------------------- rain curtains
  const CURT = 14;
  const curtGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true); curtGeo.translate(0, 0.5, 0);
  const curtains = [];
  for (let i = 0; i < CURT; i++) {
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: G.shared.time, uA: { value: 0 }, uCol: { value: new THREE.Color(0.78, 0.86, 1.0) }, uSeed: { value: i * 7.13 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime, uA, uSeed; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        float h11(float p){ return fract(sin(p * 127.1 + uSeed) * 43758.5453); }
        void main(){
          float cols = 46.0; float x = vUv.x * cols; float id = floor(x);
          float speed = 1.6 + h11(id) * 0.8;
          float y = fract(vUv.y * 2.2 + uTime * speed + h11(id + 3.1));
          float streak = smoothstep(0.0, 0.25, y) * smoothstep(0.75, 0.3, y) * smoothstep(0.5, 0.15, abs(fract(x) - 0.5));
          vec3 V = normalize(cameraPosition - vW);
          float edge = pow(clamp(1.0 - abs(dot(normalize(vN), V)), 0.0, 1.0), 1.5);
          float fade = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
          float a = (0.10 + streak * 0.55) * (0.35 + 0.65 * edge) * fade * uA;
          gl_FragColor = vec4(uCol, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(curtGeo, m); mesh.visible = false; mesh.renderOrder = 4; mesh.frustumCulled = false;
    scene.add(mesh);
    curtains.push({ mesh, m, a: 0, cloud: null });
  }
  function updateCurtains(dt) {
    // assign curtains to raining clouds, fade the rest out
    for (const k of curtains) if (k.cloud && (!list.includes(k.cloud) || k.cloud.state !== 'rain')) k.cloud = null;
    for (const c of list) {
      if (c.state !== 'rain' || curtains.some((k) => k.cloud === c)) continue;
      const free = curtains.find((k) => !k.cloud && k.a < 0.02);
      if (free) { free.cloud = c; }
    }
    for (const k of curtains) {
      const c = k.cloud;
      k.a = damp(k.a, c ? 1 : 0, c ? 3 : 2, dt);
      k.mesh.visible = k.a > 0.01;
      if (!k.mesh.visible) continue;
      if (c) {
        const r = c.R * 0.72, gy = Math.max(0, groundAt(c.x, c.z)), top = CLOUD_Y - 0.6;
        k.mesh.position.set(c.x, gy, c.z);
        k.mesh.scale.set(r, top - gy, r);
        if (c.kind === 'gold') k.m.uniforms.uCol.value.setRGB(1.0, 0.86, 0.5); else k.m.uniforms.uCol.value.setRGB(c.kind === 'acid' ? 0.8 : 0.78, c.kind === 'acid' ? 0.62 : 0.86, 1.0);
      }
      k.m.uniforms.uA.value = k.a;
    }
  }

  const list = [];
  const ghosts = []; // puffs flying into a merge partner or fading away
  let nextId = 1;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color();

  function layout(c) {
    // target offsets for each puff in unit space, rebuilt when the puff count changes
    const N = puffCount(c.mass);
    if (c.layoutN === N && c.layoutStorm === c.storm) return;
    c.layoutN = N; c.layoutStorm = c.storm;
    const rng = mulberry32(c.seed);
    for (let i = 0; i < MAX_PUFF; i++) {
      const p = c.puffs[i];
      const j1 = rng(), j2 = rng(), j3 = rng();
      if (i >= N) { p.ts = 0; continue; }
      const a = i * 2.39996 + c.seed * 0.37;
      const d = Math.sqrt((i + 0.5) / N) * 0.84;
      p.tx = Math.cos(a) * d; p.tz = Math.sin(a) * d * 0.82;
      p.ty = (1 - d) * (c.storm ? 1.25 : 0.5) + (j1 - 0.5) * 0.16 - 0.08;
      p.ts = (0.6 - d * 0.3) * (0.85 + j2 * 0.32) * (c.storm ? (d < 0.4 ? 1.2 : 1.05) : 1);
      p.wob = j3 * 6.28;
    }
  }

  function spawn(x, z, mass = 1, kind = 'water', opts = {}) {
    if (list.length >= MAX_CLOUDS) return null;
    const c = {
      id: nextId++, kind, x, z, vx: opts.vx || 0, vz: opts.vz || 0, mass,
      seed: (Math.random() * 1e6) | 0, puffs: Array.from({ length: MAX_PUFF }, () => ({ x: 0, y: 0, z: 0, s: 0, tx: 0, ty: 0, tz: 0, ts: 0, wob: 0 })),
      layoutN: -1, layoutStorm: false, storm: false,
      state: 'idle', swellT: 0, rainT: 0, strikeT: rand(2, 4),
      born: opts.instant ? 1 : 0, dying: 0, age: 0, cool: opts.instant ? 0 : 1.6,
      R: radiusOf(mass), wobV: 0, wob: opts.instant ? 0 : -0.6, dark: 0, drawn: 0, bob: Math.random() * 6.28, flick: 0,
      tint: new THREE.Color().copy(TINT[kind] || TINT.water), rainedOn: 0, rainedLand: 0, overField: -1,
    };
    layout(c);
    if (opts.instant) for (const p of c.puffs) { p.x = p.tx; p.y = p.ty; p.z = p.tz; p.s = p.ts; }
    list.push(c);
    return c;
  }

  function remove(c, fade = true) {
    const i = list.indexOf(c); if (i < 0) return;
    list.splice(i, 1);
    if (fade) for (let k = 0; k < c.layoutN; k++) {
      const p = c.puffs[k];
      ghosts.push({ x: c.x + p.x * c.R, y: CLOUD_Y + p.y * c.R, z: c.z + p.z * c.R, s: p.s * c.R * 1.05, tx: c.x + p.x * c.R * 1.4, ty: CLOUD_Y + p.y * c.R + 1, tz: c.z + p.z * c.R * 1.4, life: 1, rate: 0.9 + Math.random() * 0.5, tint: c.tint.clone() });
    }
  }

  function mergeKinds(a, b) {
    if (a === b) return a;
    if (a === 'acid' || b === 'acid') return 'acid';
    if (a === 'smog' || b === 'smog') return 'acid';
    if (a === 'gold' || b === 'gold') return 'gold';  // a golden cloud gilds whatever it joins
    return a;
  }

  function merge(a, b) {
    // a absorbs b
    const ma = a.mass, mb = b.mass, m = Math.min(MAX_MASS, ma + mb);
    const ia = inertiaOf(ma), ib = inertiaOf(mb);
    a.x = (a.x * ma + b.x * mb) / (ma + mb); a.z = (a.z * ma + b.z * mb) / (ma + mb);
    a.vx = (a.vx * ia + b.vx * ib) / (ia + ib); a.vz = (a.vz * ia + b.vz * ib) / (ia + ib);
    const wasKind = a.kind;
    a.kind = mergeKinds(a.kind, b.kind);
    a.mass = m;
    // a cloud being carried stays carried after it swallows another
    if (!a.holder && b.holder) a.holder = b.holder;
    a.wobV += 5 + mb * 1.2;
    a.cool = 0.25;
    // b's puffs fly into a
    for (let k = 0; k < b.layoutN; k++) {
      const p = b.puffs[k];
      ghosts.push({ x: b.x + p.x * b.R, y: CLOUD_Y + p.y * b.R, z: b.z + p.z * b.R, s: p.s * b.R, tx: a.x, ty: CLOUD_Y + 0.6, tz: a.z, life: 1, rate: 3.2, tint: b.tint.clone(), into: a });
    }
    const i = list.indexOf(b); if (i >= 0) list.splice(i, 1);
    api.onMerge?.(a, b, wasKind);
  }

  // a peg near this cloud, if any (pegs live in tools.js)
  function pegFor(c) {
    const P = G.tools?.pegs; if (!P) return null;
    for (const p of P) if (p.on && Math.hypot(c.x - p.x, c.z - p.z) < p.r + c.R * 0.5) return p;
    return null;
  }

  // ---------------------------------------------------------------- tethers: a ribbon of wind from each holder to what it holds
  const TSEG = 12, TMAX = 16;
  const tPos = new Float32Array(TMAX * TSEG * 2 * 3), tT = new Float32Array(TMAX * TSEG * 2), tC = new Float32Array(TMAX * TSEG * 2);
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setAttribute('aT', new THREE.BufferAttribute(tT, 1).setUsage(THREE.DynamicDrawUsage));
  tGeo.setAttribute('aC', new THREE.BufferAttribute(tC, 1).setUsage(THREE.DynamicDrawUsage));
  const tMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: G.shared.time },
    vertexShader: `attribute float aT; attribute float aC; varying float vT; varying float vC; void main(){ vT = aT; vC = aC; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; varying float vT; varying float vC;
      void main(){ float dash = 0.45 + 0.55 * smoothstep(0.2, 0.8, sin(vT * 26.0 + uTime * 10.0) * 0.5 + 0.5);
        vec3 col = mix(vec3(0.6, 0.95, 1.2), vec3(0.6, 1.25, 0.8), vC);
        gl_FragColor = vec4(col * dash * (0.35 + 0.4 * sin(vT * 3.14159)), 1.0); }`,
  });
  const tethers = new THREE.LineSegments(tGeo, tMat);
  tethers.frustumCulled = false; tethers.renderOrder = 18;
  scene.add(tethers);
  function renderTethers() {
    let n = 0;
    const t = G.time;
    for (const c of list) {
      const h = c.holder; if (!h || n >= TMAX) continue;
      const x0 = h.x, y0 = SPRITE_Y - 0.4, z0 = h.z, x1 = c.x, y1 = CLOUD_Y + 0.5, z1 = c.z;
      const helper = h.isHelper ? 1 : 0;
      let px = x0, py = y0, pz = z0;
      for (let i = 1; i <= TSEG; i++) {
        const u = i / TSEG;
        const wob = Math.sin(u * 3.14159) * (0.9 + 0.4 * Math.sin(t * 5 + c.id));
        const x = x0 + (x1 - x0) * u + Math.sin(t * 4 + u * 6 + c.id) * 0.25 * wob, y = y0 + (y1 - y0) * u + wob * 0.8, z = z0 + (z1 - z0) * u + Math.cos(t * 3.4 + u * 5) * 0.25 * wob;
        const k = (n * TSEG + i - 1) * 2;
        tPos[k * 3] = px; tPos[k * 3 + 1] = py; tPos[k * 3 + 2] = pz;
        tPos[k * 3 + 3] = x; tPos[k * 3 + 4] = y; tPos[k * 3 + 5] = z;
        tT[k] = (i - 1) / TSEG; tT[k + 1] = u; tC[k] = helper; tC[k + 1] = helper;
        px = x; py = y; pz = z;
      }
      n++;
    }
    tGeo.setDrawRange(0, n * TSEG * 2);
    tGeo.attributes.position.needsUpdate = true; tGeo.attributes.aT.needsUpdate = true; tGeo.attributes.aC.needsUpdate = true;
  }

  // ---------------------------------------------------------------- per-frame
  const _feet = [];
  function simulate(dt) {
    const S = G.sprite, day = G.day || {};
    const sun = G.sun01 ?? 1;
    const W = G.wind;
    // forces and motion
    for (const c of list) {
      c.age += dt;
      c.born = Math.min(1, c.born + dt / 2.2);
      c.cool = Math.max(0, c.cool - dt);
      const R = c.R = damp(c.R, radiusOf(c.mass), 4, dt);
      const inert = inertiaOf(c.mass);
      // ---- holding: a gathered cloud is tied to its holder (the spirit or the Breezling)
      let holder = c.holder;
      if (holder && (!holder.active || !holder.drawing || Math.hypot(c.x - holder.x, c.z - holder.z) > holder.leash + c.R)) holder = c.holder = null;
      c.thrown = Math.max(0, (c.thrown || 0) - dt);
      if (!holder && c.kind !== 'smog' && c.born > 0.5 && c.thrown <= 0) {
        for (const h of api.holders) {
          if (!h || !h.active || !h.drawing) continue;
          // a cloud that is already pouring is only picked up on purpose (gathering started on top of it)
          if (c.state === 'rain' && !h.drawStart) continue;
          if (h.canHold && !h.canHold(c)) continue;
          if (h.capacity !== undefined && list.reduce((n, o) => n + (o.holder === h ? 1 : 0), 0) >= h.capacity) continue;
          if (Math.hypot(c.x - h.x, c.z - h.z) < h.capR + c.R * 0.45) { holder = c.holder = h; c.bell = false; api.onGrab?.(c, h); break; }
        }
      }
      // let go of a cloud and it settles where it is instead of sailing on
      if (c.wasHeld && !holder) { c.vx = c.vx * 0.25 + W.x * W.speed * 0.3; c.vz = c.vz * 0.25 + W.z * W.speed * 0.3; }
      c.wasHeld = !!holder;
      let ax = 0, az = 0;
      c.drawn = Math.max(0, c.drawn - dt * 3);
      c.held = Math.max(0, (c.held || 0) - dt);
      c.called = Math.max(0, (c.called || 0) - dt);
      c.pegged = 0;
      if (holder) {
        // a stiff, damped spring: the cloud keeps up with the holder and stops when it stops
        const k = 62 / Math.sqrt(inert), dmp = 2 * Math.sqrt(k);
        ax += (holder.x - c.x) * k - (c.vx - holder.vx) * dmp;
        az += (holder.z - c.z) * k - (c.vz - holder.vz) * dmp;
        c.drawn = 1; c.held = 0.9;
      } else {
        // relax toward the wind; big clouds drift a little slower, and a cloud that is pouring all but anchors
        const drift = (1.05 - 0.035 * Math.min(c.mass, 12)) * (c.state === 'rain' ? 0.45 : 1);
        let wx = W.x * W.speed * drift, wz = W.z * W.speed * drift, relax = 0.9;
        // a peg holds the clouds around it in place and pulls them together
        const peg = pegFor(c);
        if (peg) { wx = 0; wz = 0; relax = 2.4; ax += (peg.x - c.x) * 1.8; az += (peg.z - c.z) * 1.8; c.pegged = 1; }
        if (c.called > 0 && S) {
          // the whistle calls clouds to the spirit: no wind, a strong pull that eases off on arrival
          const dx = S.x - c.x, dz = S.z - c.z, d = Math.hypot(dx, dz) || 1;
          const want = Math.min(40, d * 3.2);
          c.vx = damp(c.vx, (dx / d) * want + S.vx * 0.5, 5, dt); c.vz = damp(c.vz, (dz / d) * want + S.vz * 0.5, 5, dt);
          c.drawn = Math.max(c.drawn, 0.6);
        } else { c.vx = damp(c.vx, wx, relax, dt); c.vz = damp(c.vz, wz, relax, dt); }
      }
      if (S && S.active && !holder) {
        const dx = c.x - S.x, dz = c.z - S.z, d = Math.hypot(dx, dz) || 1e-3;
        const nx = dx / d, nz = dz / d;
        if (!S.drawing && c.held <= 0) {
          const reach = R + 3.4;
          if (d < reach) {
            const pen = (reach - d) / reach;
            const sp = Math.hypot(S.vx, S.vz);
            const toward = sp > 0.1 ? Math.max(0, (S.vx * nx + S.vz * nz) / sp) : 0;
            // a shove outward that only happens while the spirit is moving, plus a sweep along its motion
            const moving = Math.min(1, sp / 8);
            const radial = 16 * pen * pen * moving * (0.3 + 0.7 * toward) / inert;
            ax += nx * radial; az += nz * radial;
            const sweep = 3.6 * pen * Math.sqrt(toward) / inert;
            ax += (S.vx - c.vx) * sweep; az += (S.vz - c.vz) * sweep;
          }
        }
      }
      // mountains block clouds (a cloud being carried is lifted over them)
      const g = holder ? 0 : groundAt(c.x, c.z);
      if (g > CLOUD_Y - 3) {
        const e = 1.2;
        const gx = groundAt(c.x + e, c.z) - groundAt(c.x - e, c.z), gz = groundAt(c.x, c.z + e) - groundAt(c.x, c.z - e);
        const gl = Math.hypot(gx, gz) || 1;
        const k = (g - (CLOUD_Y - 3)) * 9;
        ax -= gx / gl * k; az -= gz / gl * k;
      }
      // far out at sea a cloud is gone for good: it thins out and dissolves
      const r = Math.hypot(c.x, c.z);
      if (r > BOUND + 3 && !holder) c.mass -= dt * 0.35 * (r - BOUND - 2) * 0.25;
      if (r > BOUND + 12) { ax -= (c.x / r) * 6; az -= (c.z / r) * 6; }
      c.vx += ax * dt; c.vz += az * dt;
      const sp = Math.hypot(c.vx, c.vz), cap = holder ? 100 : c.called > 0 ? 42 : c.thrown > 0 ? 40 : 16;
      if (sp > cap) { c.vx *= cap / sp; c.vz *= cap / sp; }
      c.x += c.vx * dt; c.z += c.vz * dt;
      // squash spring
      c.wobV += (-c.wob * 60 - c.wobV * 7) * dt; c.wob += c.wobV * dt;
    }
    // contacts: merge when pushed together, bump softly otherwise
    outer: for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-3;
      const touch = (a.R + b.R) * 0.6;
      if (d > touch) continue;
      const nx = dx / d, nz = dz / d;
      const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      let herded = false;
      if (S && S.active) {
        const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
        herded = Math.hypot(S.x - cx, S.z - cz) < Math.max(a.R, b.R) + 7;
      }
      // a carried cloud passes straight through one that is pouring (so a rain is never stolen by accident),
      // and the Breezling's cloud only joins plain, idle clouds (never smog, sour clouds or someone's rain)
      if ((a.state === 'rain' && b.holder && !a.holder) || (b.state === 'rain' && a.holder && !b.holder)) continue;
      const plain = (c) => c.state === 'idle' && (c.kind === 'water' || c.kind === 'gold');
      if ((a.holder?.isHelper && !b.holder && !plain(b)) || (b.holder?.isHelper && !a.holder && !plain(a))) continue;
      const wants = closing > 1.4 || a.drawn > 0.5 || b.drawn > 0.5 || herded || (a.pegged && b.pegged) || G.forceMerge;
      if (wants && a.cool <= 0 && b.cool <= 0 && a.born > 0.6 && b.born > 0.6) {
        if (a.mass >= b.mass) merge(a, b); else merge(b, a);
        i = -1; // restart the scan after a merge
        continue outer;
      } else {
        const push = (touch - d) * 1.6;
        a.vx -= nx * push * dt * 2; a.vz -= nz * push * dt * 2;
        b.vx += nx * push * dt * 2; b.vz += nz * push * dt * 2;
      }
    }
    // weather inside each cloud
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      const overWater = waterAt(c.x, c.z) !== null;
      c.storm = c.mass >= STORM_MASS && c.kind !== 'smog';
      if (c.kind === 'smog') {
        c.mass -= dt * 0.004;
        if (insideIsland(c.x, c.z) < -7) { c.mass -= dt * 0.35; if (c.mass < 0.3) { api.onSmogCleared?.(c); remove(c); continue; } }
      } else if (c.state === 'idle') {
        if (c.mass >= RAIN_MASS) { c.state = 'swell'; c.swellT = 0; api.onSwell?.(c); }
        else if (overWater && Math.hypot(c.x, c.z) < BOUND) { if (c.mass < 2.4) c.mass = Math.min(2.4, c.mass + dt * 0.012 * (day.soak ?? 1)); }
        else if (!c.holder && !c.pegged) c.mass -= dt * (day.evap ?? 0.01) * (0.35 + 0.65 * sun);
      } else if (c.state === 'swell' && !c.bell && c.mass < RAIN_MASS) {
        c.state = 'idle';
      } else if (c.state === 'swell') {
        // a cloud the spirit is drawing in holds its rain until it is let go
        if (c.drawn > 0.5) c.swellT = Math.min(c.swellT, 0.25);
        c.swellT += dt;
        c.wobV += Math.sin(c.swellT * 30) * dt * (c.drawn > 0.5 ? 12 : 30);
        if (c.swellT > 0.9) { c.state = 'rain'; c.rainT = 0; api.onRainStart?.(c); }
      } else if (c.state === 'rain' && c.drawn > 0.5) {
        c.state = 'swell'; c.swellT = 0.25;
      } else if (c.state === 'rain') {
        c.rainT += dt;
        const rate = (0.3 + 0.055 * c.mass) * (day.rainMul ?? 1) * (c.bell ? 1.3 : 1);
        const floorMass = c.bell ? 0.35 : 0.95;
        const w = Math.max(0, Math.min(c.mass - floorMass, rate * dt));
        c.mass -= w;
        const footR = c.R * 0.72;
        c.rainedOn += w;
        if (!overWater) { G.climate.addRain(c.x, c.z, footR, w * (c.kind === 'acid' ? 0.5 : 1)); c.rainedLand += w; }
        api.onRain?.(c, w, footR, overWater);
        spawnDrops(c, rate, footR, dt);
        if (c.mass <= floorMass + 0.05) { c.state = 'idle'; c.bell = false; api.onRainEnd?.(c); }
      }
      if (c.storm) {
        c.strikeT -= dt;
        if (c.strikeT <= 0) { c.strikeT = rand(2.2, 4.6) * (day.strikeMul ?? 1); api.onStrike?.(c); c.flick = 1; }
      }
      c.flick = Math.max(0, c.flick - dt * 3);
      if (c.mass < 0.3) { remove(c); continue; }
      if (Math.hypot(c.x, c.z) > BOUND + 16) { remove(c); continue; }
      // shade darkness and tint
      const target = c.kind === 'smog' ? TINT.smog : c.kind === 'acid' ? TINT.acid : c.kind === 'gold' ? TINT.gold : c.storm ? TINT.storm : c.state !== 'idle' ? TINT.rain : TINT.water;
      c.tint.lerp(target, 1 - Math.exp(-3 * dt));
      if (c.kind === 'gold' && Math.random() < dt * 7) G.fx.sparkle(c.x + rand(-c.R, c.R) * 0.7, CLOUD_Y + rand(0, c.R * 0.6), c.z + rand(-c.R, c.R) * 0.7, 1, [1.4, 1.15, 0.5], 1);
      if (c.kind === 'water' && c.state === 'idle' && c.mass > 2) c.tint.lerp(TINT.rain, (c.mass - 2) * 0.25 * dt);
      layout(c);
    }
  }
  // frozen (behind the day's intro card): the clouds hold still but keep breathing
  function update(dt) {
    if (!api.frozen) simulate(dt);
    updateDrops(dt);
    updateCurtains(dt);
    renderTethers();
    render(dt);
  }

  // ---------------------------------------------------------------- drops
  function spawnDrops(c, rate, footR, dt) {
    let n = rate * 340 * dt * (G.settings.quality === 'low' ? 0.5 : 1);
    while (n > 0 && dCount < MAX_DROPS) {
      if (n < 1 && Math.random() > n) break;
      n -= 1;
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * footR;
      const k = dCount++ * 6;
      drops[k] = c.x + Math.cos(a) * r; drops[k + 1] = CLOUD_Y - 0.6 + Math.random() * 1.2; drops[k + 2] = c.z + Math.sin(a) * r;
      drops[k + 3] = G.wind.x * G.wind.speed * 0.8 + c.vx * 0.5; drops[k + 4] = -24 - Math.random() * 6; drops[k + 5] = G.wind.z * G.wind.speed * 0.8 + c.vz * 0.5;
      dKind[dCount - 1] = c.kind === 'acid' ? 1 : c.kind === 'gold' ? 2 : 0;
    }
  }
  function updateDrops(dt) {
    let w = 0;
    for (let i = 0; i < dCount; i++) {
      const k = i * 6;
      drops[k] += drops[k + 3] * dt; drops[k + 1] += drops[k + 4] * dt; drops[k + 2] += drops[k + 5] * dt;
      const x = drops[k], y = drops[k + 1], z = drops[k + 2];
      const wl = y < 5 ? waterAt(x, z) : null;
      const floor = wl !== null ? wl : groundAt(x, z);
      if (y <= floor) {
        if (Math.random() < 0.08) api.onSplash?.(x, floor, z, wl !== null, dKind[i]);
        continue;
      }
      if (w !== i) { const o = w * 6; for (let t = 0; t < 6; t++) drops[o + t] = drops[k + t]; dKind[w] = dKind[i]; }
      w++;
    }
    dCount = w;
    for (let i = 0; i < dCount; i++) {
      const k = i * 6;
      const L = 0.045;
      dPos[k] = drops[k]; dPos[k + 1] = drops[k + 1]; dPos[k + 2] = drops[k + 2];
      dPos[k + 3] = drops[k] - drops[k + 3] * L; dPos[k + 4] = drops[k + 1] - drops[k + 4] * L; dPos[k + 5] = drops[k + 2] - drops[k + 5] * L;
      const kd = dKind[i];
      const r = kd === 1 ? 0.75 : kd === 2 ? 1.0 : 0.72, g = kd === 1 ? 0.55 : kd === 2 ? 0.86 : 0.84, b = kd === 1 ? 0.95 : kd === 2 ? 0.45 : 1.0;
      dCol[k] = r; dCol[k + 1] = g; dCol[k + 2] = b; dCol[k + 3] = r * 0.5; dCol[k + 4] = g * 0.5; dCol[k + 5] = b * 0.6;
    }
    rainGeo.setDrawRange(0, dCount * 2);
    rainGeo.attributes.position.needsUpdate = true; rainGeo.attributes.color.needsUpdate = true;
  }

  // ---------------------------------------------------------------- draw
  function render(dt) {
    let n = 0;
    const t = G.time;
    for (const c of list) {
      const R = c.R * (0.25 + 0.75 * smoothstep(0, 1, c.born));
      const sq = clamp(c.wob, -0.5, 0.6);
      const bob = Math.sin(t * 0.6 + c.bob) * 0.25;
      const flick = c.flick > 0 ? (Math.random() < 0.5 ? c.flick : 0) : 0;
      for (let k = 0; k < MAX_PUFF; k++) {
        const p = c.puffs[k];
        const lam = 3.5;
        p.x = damp(p.x, p.tx, lam, dt); p.y = damp(p.y, p.ty, lam, dt); p.z = damp(p.z, p.tz, lam, dt);
        p.s = damp(p.s, p.ts, k < c.layoutN ? 3 : 5, dt);
        if (p.s < 0.01) continue;
        const wob = 1 + Math.sin(t * 1.7 + p.wob) * 0.035;
        const s = p.s * R * wob;
        pv.set(c.x + p.x * R * (1 + sq * 0.35), CLOUD_Y + bob + p.y * R * (1 - sq * 0.5), c.z + p.z * R * (1 + sq * 0.35));
        sv.set(s * (1 + sq * 0.25), s * (1 - sq * 0.3), s * (1 + sq * 0.25));
        m4.compose(pv, q, sv);
        mesh.setMatrixAt(n, m4);
        col.copy(c.tint);
        if (c.holder) col.lerp(TINT.held, 0.5);
        if (flick) col.addScalar(flick * 1.4);
        mesh.setColorAt(n, col);
        n++;
      }
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.life -= dt * g.rate;
      if (g.life <= 0) { ghosts.splice(i, 1); continue; }
      if (g.into && list.includes(g.into)) { g.tx = g.into.x; g.tz = g.into.z; }
      g.x = damp(g.x, g.tx, 5, dt); g.y = damp(g.y, g.ty, 5, dt); g.z = damp(g.z, g.tz, 5, dt);
      const s = g.s * smoothstep(0, 0.6, g.life);
      if (n >= MAX_INST) break;
      m4.compose(pv.set(g.x, g.y, g.z), q, sv.set(s, s, s));
      mesh.setMatrixAt(n, m4); mesh.setColorAt(n, g.tint); n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // footprints for the cloud shade on the ground
    _feet.length = 0;
    for (const c of list) _feet.push(c);
    _feet.sort((a, b) => b.mass - a.mass);
    const F = G.shared.feet.value;
    let fc = 0;
    for (const c of _feet) {
      if (fc >= MAX_FOOT) break;
      const dark = clamp(0.16 + 0.045 * c.mass, 0, 0.55) * smoothstep(0, 1, c.born) * (c.kind === 'smog' ? 1.2 : 1);
      F[fc++].set(c.x, c.z, c.R * 1.0, dark);
    }
    G.shared.footCount.value = fc;
  }

  const api = {
    list, mesh, spawn, remove, merge, radiusOf, frozen: false, holders: [],
    get drops() { return dCount; },
    clear() { list.length = 0; ghosts.length = 0; dCount = 0; mesh.count = 0; rainGeo.setDrawRange(0, 0); G.shared.footCount.value = 0; for (const k of curtains) { k.cloud = null; k.a = 0; k.mesh.visible = false; } },
    update,
    // a cone of wind from the spirit
    gust(x, z, fx, fz) {
      let hits = 0;
      const M = G.mods || {};
      api.lastThrown = 0;
      for (const c of list.slice()) {
        const dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz) || 1e-3;
        // a gust while gathering throws what you are holding
        if (c.holder === G.sprite) { api.lastThrown++; c.holder = null; c.wasHeld = false; c.thrown = 0.9; c.vx = fx * 26 / inertiaOf(c.mass) * (M.gustPow || 1); c.vz = fz * 26 / inertiaOf(c.mass) * (M.gustPow || 1); hits++; continue; }
        const reach = (22 + c.R) * (M.gustRange || 1);
        if (d > reach) continue;
        const cos = (dx * fx + dz * fz) / d;
        if (cos < 0.74 && d > c.R + 1.5) continue;
        const w = Math.pow(1 - d / reach, 0.55);
        const imp = 15 * w / inertiaOf(c.mass) * (M.gustPow || 1);
        if (c.holder) { c.holder = null; c.wasHeld = false; }
        c.thrown = 0.5;
        c.vx += (fx * 0.85 + (dx / d) * 0.15) * imp; c.vz += (fz * 0.85 + (dz / d) * 0.15) * imp;
        c.wobV -= 3 * w;
        hits++;
        if (c.kind === 'smog') { c.mass -= 0.45 * w + 0.15; if (c.mass < 0.3) { api.onSmogCleared?.(c, true); remove(c); } }
      }
      return hits;
    },
    rainingNear(x, z) {
      let s = 0;
      for (const c of list) if (c.state === 'rain') { const d = Math.hypot(c.x - x, c.z - z); if (d < c.R * 0.8) s = Math.max(s, 1 - d / (c.R * 0.8) * 0.5); }
      return s;
    },
    stats() {
      let mass = 0, raining = 0, storms = 0;
      for (const c of list) { mass += c.mass; if (c.state === 'rain') raining++; if (c.storm) storms++; }
      return { n: list.length, mass, raining, storms, drops: dCount };
    },
    // hooks (set by game.js): onMerge, onSwell, onRainStart, onRain, onRainEnd, onStrike, onSplash, onSmogCleared
  };
  return api;
}
