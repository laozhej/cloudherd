// Billboard particles in two pools (soft alpha and additive glow): puffs, steam, splashes,
// sparkles, smoke, flames, wind streaks, petals.
import * as THREE from 'three';
import { G } from './state.js';
import { rand, clamp } from './util.js';

const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
const SHAPE = { disc: 0, puff: 1, star: 2, ring: 3, streak: 4, petal: 5, flame: 6 };

const VS = /* glsl */`
attribute vec3 iPos; attribute vec4 iCol; attribute vec3 iData; // size, rot, shape
varying vec2 vUv; varying vec4 vCol; varying float vShape;
void main(){
  vUv = position.xy + 0.5; vCol = iCol; vShape = iData.z;
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float c = cos(iData.y), s = sin(iData.y);
  vec2 p = position.xy;
  if (iData.z > 3.5 && iData.z < 4.5) p.x *= 4.0;  // streaks are long
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  mv.xy += p * iData.x;
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */`
varying vec2 vUv; varying vec4 vCol; varying float vShape;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = 0.0;
  if (vShape < 0.5) a = smoothstep(1.0, 0.2, r);
  else if (vShape < 1.5) { float ang = atan(p.y, p.x); float e = 0.82 + 0.12 * sin(ang * 5.0 + vCol.a * 7.0); a = smoothstep(e, e - 0.35, r); }
  else if (vShape < 2.5) { float ang = atan(p.y, p.x); float st = pow(abs(cos(ang * 2.0)), 18.0); a = smoothstep(1.0, 0.0, r) * (0.25 + st) + smoothstep(0.3, 0.0, r); }
  else if (vShape < 3.5) a = smoothstep(0.12, 0.0, abs(r - 0.8)) ;
  else if (vShape < 4.5) a = smoothstep(0.5, 0.0, abs(p.y) * 2.0) * smoothstep(0.5, 0.2, abs(p.x));
  else if (vShape < 5.5) { vec2 q = p * vec2(1.0, 1.8); a = smoothstep(0.5, 0.42, length(q)); }
  else { vec2 q = vec2(p.x * 1.5, p.y + 0.15); float d = length(q) - 0.32 + q.y * 0.45; a = smoothstep(0.08, -0.12, d); }
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
  if (gl_FragColor.a < 0.003) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function pool(scene, additive, N, order) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.setAttribute('position', base.attributes.position);
  const iPos = new Float32Array(N * 3), iCol = new Float32Array(N * 4), iData = new Float32Array(N * 3);
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(iCol, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('iData', new THREE.InstancedBufferAttribute(iData, 3).setUsage(THREE.DynamicDrawUsage));
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = order;
  scene.add(mesh);
  // particle state
  const P = { x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N),
    life: new Float32Array(N), max: new Float32Array(N), s0: new Float32Array(N), s1: new Float32Array(N), r: new Float32Array(N), g: new Float32Array(N), b: new Float32Array(N),
    r1: new Float32Array(N), g1: new Float32Array(N), b1: new Float32Array(N), a: new Float32Array(N), grav: new Float32Array(N), drag: new Float32Array(N), shape: new Float32Array(N), rot: new Float32Array(N), spin: new Float32Array(N), fadeIn: new Float32Array(N) };
  let n = 0;
  return {
    mesh,
    emit(o) {
      if (n >= N) return;
      const i = n++;
      P.x[i] = o.x; P.y[i] = o.y; P.z[i] = o.z; P.vx[i] = o.vx || 0; P.vy[i] = o.vy || 0; P.vz[i] = o.vz || 0;
      P.life[i] = P.max[i] = o.life || 1; P.s0[i] = o.size || 1; P.s1[i] = o.size1 ?? o.size ?? 1;
      const c = o.color || [1, 1, 1], c1 = o.color1 || c;
      P.r[i] = c[0]; P.g[i] = c[1]; P.b[i] = c[2]; P.r1[i] = c1[0]; P.g1[i] = c1[1]; P.b1[i] = c1[2];
      P.a[i] = o.alpha ?? 1; P.grav[i] = o.grav || 0; P.drag[i] = o.drag || 0; P.shape[i] = SHAPE[o.shape || 'disc'];
      P.rot[i] = o.rot ?? Math.random() * 6.28; P.spin[i] = o.spin || 0; P.fadeIn[i] = o.fadeIn || 0.08;
    },
    update(dt) {
      let w = 0;
      for (let i = 0; i < n; i++) {
        P.life[i] -= dt;
        if (P.life[i] <= 0) continue;
        if (w !== i) for (const k in P) P[k][w] = P[k][i];
        const d = Math.exp(-P.drag[w] * dt);
        P.vx[w] *= d; P.vy[w] = P.vy[w] * d + P.grav[w] * dt; P.vz[w] *= d;
        P.x[w] += P.vx[w] * dt; P.y[w] += P.vy[w] * dt; P.z[w] += P.vz[w] * dt;
        P.rot[w] += P.spin[w] * dt;
        w++;
      }
      n = w;
      for (let i = 0; i < n; i++) {
        const t = 1 - P.life[i] / P.max[i];
        iPos[i * 3] = P.x[i]; iPos[i * 3 + 1] = P.y[i]; iPos[i * 3 + 2] = P.z[i];
        const fi = clamp(t / P.fadeIn[i], 0, 1), fo = clamp((1 - t) / 0.35, 0, 1);
        iCol[i * 4] = P.r[i] + (P.r1[i] - P.r[i]) * t; iCol[i * 4 + 1] = P.g[i] + (P.g1[i] - P.g[i]) * t; iCol[i * 4 + 2] = P.b[i] + (P.b1[i] - P.b[i]) * t;
        iCol[i * 4 + 3] = P.a[i] * fi * fo;
        iData[i * 3] = P.s0[i] + (P.s1[i] - P.s0[i]) * t; iData[i * 3 + 1] = P.rot[i]; iData[i * 3 + 2] = P.shape[i];
      }
      geo.instanceCount = n;
      geo.attributes.iPos.needsUpdate = true; geo.attributes.iCol.needsUpdate = true; geo.attributes.iData.needsUpdate = true;
    },
    clear() { n = 0; geo.instanceCount = 0; },
    get count() { return n; },
  };
}

export function createFx(scene) {
  const soft = pool(scene, false, 2600, 5);
  const glow = pool(scene, true, 1600, 6);
  const fx = {
    soft, glow,
    update(dt) { soft.update(dt); glow.update(dt); },
    clear() { soft.clear(); glow.clear(); },
    puff(x, y, z, n = 8, color = [1, 1, 1], spread = 2, size = 1.4) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, s = rand(0.5, 1) * spread;
        soft.emit({ x, y, z, vx: Math.cos(a) * s * 2, vy: rand(-0.5, 1.5), vz: Math.sin(a) * s * 2, life: rand(0.6, 1.1), size: size * rand(0.6, 1), size1: size * 1.8, color, alpha: 0.85, drag: 2.5, shape: 'puff' });
      }
    },
    steam(x, y, z, n = 6) {
      for (let i = 0; i < n; i++) soft.emit({ x: x + rand(-1, 1), y: y + rand(0, 0.5), z: z + rand(-1, 1), vx: G.wind.x * 1.2, vy: rand(1.5, 3.2), vz: G.wind.z * 1.2, life: rand(1.2, 2.2), size: rand(0.8, 1.4), size1: 3.2, color: [0.95, 0.96, 1], alpha: 0.55, drag: 0.6, shape: 'puff' });
    },
    splash(x, y, z, water) {
      if (water) soft.emit({ x, y: y + 0.05, z, life: 0.45, size: 0.25, size1: 0.9, color: [0.85, 0.95, 1], alpha: 0.7, shape: 'ring', rot: 0 });
      else soft.emit({ x, y: y + 0.15, z, vy: 1.2, life: 0.3, size: 0.3, size1: 0.5, color: [0.8, 0.9, 1], alpha: 0.6, grav: -9, shape: 'disc' });
    },
    sparkle(x, y, z, n = 12, color = [1, 0.85, 0.35], spread = 3) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28;
        glow.emit({ x: x + rand(-spread, spread) * 0.5, y: y + rand(0, 1), z: z + rand(-spread, spread) * 0.5, vx: Math.cos(a) * rand(0.5, 2.5), vy: rand(2, 6), vz: Math.sin(a) * rand(0.5, 2.5), life: rand(0.7, 1.4), size: rand(0.35, 0.7), size1: 0.1, color, alpha: 1, grav: -5, drag: 1.2, shape: 'star', spin: rand(-3, 3) });
      }
    },
    smoke(x, y, z, dark = 0.3, size = 1.4) {
      const c = 0.45 + (1 - dark) * 0.45;
      soft.emit({ x: x + rand(-0.4, 0.4), y, z: z + rand(-0.4, 0.4), vx: G.wind.x * G.wind.speed * 1.6 + rand(-0.3, 0.3), vy: rand(1.6, 2.8), vz: G.wind.z * G.wind.speed * 1.6 + rand(-0.3, 0.3), life: rand(2.5, 4), size: size * rand(0.7, 1), size1: size * 3.2, color: [c, c * 0.97, c * 0.95], color1: [c + 0.15, c + 0.15, c + 0.17], alpha: 0.5, drag: 0.25, shape: 'puff', fadeIn: 0.2 });
    },
    flame(x, y, z, size = 1) {
      glow.emit({ x: x + rand(-0.5, 0.5) * size, y: y + rand(0, 0.3), z: z + rand(-0.5, 0.5) * size, vx: G.wind.x * 0.8, vy: rand(2.5, 4.5), vz: G.wind.z * 0.8, life: rand(0.35, 0.7), size: size * rand(0.9, 1.5), size1: size * 0.3, color: [1.4, 0.9, 0.3], color1: [1.0, 0.25, 0.05], alpha: 0.9, drag: 1, shape: 'flame', rot: 0, fadeIn: 0.15 });
    },
    streak(x, y, z, dx, dz, speed = 20, life = 0.5, alpha = 0.55) {
      // wind lines: oriented along their direction on screen
      const cam = G.camera;
      _p1.set(x, y, z).project(cam); _p2.set(x + dx, y, z + dz).project(cam);
      glow.emit({ x, y, z, vx: dx * speed, vz: dz * speed, life, size: 0.5, size1: 0.35, color: [0.9, 0.97, 1], alpha, drag: 2.2, shape: 'streak', rot: Math.atan2(_p2.y - _p1.y, (_p2.x - _p1.x) * cam.aspect) });
    },
    petals(x, y, z, n = 10, color = [1, 0.7, 0.8]) {
      for (let i = 0; i < n; i++) soft.emit({ x: x + rand(-2, 2), y: y + rand(0, 1), z: z + rand(-2, 2), vx: rand(-1.5, 1.5), vy: rand(2, 4), vz: rand(-1.5, 1.5), life: rand(1.5, 2.5), size: 0.35, color, alpha: 1, grav: -3, drag: 1.5, shape: 'petal', spin: rand(-6, 6) });
    },
    ring(x, y, z, color = [1, 1, 1], size = 6, life = 0.6, additive = true) {
      (additive ? glow : soft).emit({ x, y, z, life, size: size * 0.2, size1: size, color, alpha: 0.8, shape: 'ring', rot: 0 });
    },
  };
  return fx;
}
