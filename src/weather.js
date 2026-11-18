// Lightning bolts out of thunderheads, and rainbows after a good rain.
import * as THREE from 'three';
import { G } from './state.js';
import { CLOUD_Y } from './consts.js';
import { rand, clamp, damp, smoothstep } from './util.js';
import { groundAt } from './island.js';

const BOLT_VS = `attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BOLT_FS = `uniform float uA; varying float vA; void main(){ float core = 1.0 - abs(vA); vec3 c = mix(vec3(0.55, 0.7, 1.4), vec3(1.6, 1.65, 1.8), smoothstep(0.35, 0.8, core)); gl_FragColor = vec4(c, smoothstep(0.0, 0.45, core) * uA); }`;

const RB_VS = `varying float vT; varying float vAng; uniform float uR0, uR1; void main(){ float r = length(position.xy); vT = clamp((r - uR0) / (uR1 - uR0), 0.0, 1.0); vAng = atan(position.y, position.x); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RB_FS = `uniform float uA; varying float vT; varying float vAng;
  vec3 hsv(float h){ vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return k; }
  void main(){
    vec3 c = hsv((1.0 - vT) * 0.78);
    float edge = sin(vT * 3.14159);
    float ends = smoothstep(0.0, 0.5, vAng) * smoothstep(3.14159, 2.64, vAng);
    gl_FragColor = vec4(c * edge * ends * uA * 0.55, 1.0);
  }`;

export function createWeather(scene, camera) {
  // ---------------------------------------------------------------- lightning
  const bolts = [];
  for (let i = 0; i < 4; i++) {
    const MAXV = 640;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXV * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(MAXV), 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({ vertexShader: BOLT_VS, fragmentShader: BOLT_FS, uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 18;
    scene.add(mesh);
    bolts.push({ mesh, geo, mat, life: 0 });
  }
  const light = new THREE.PointLight(0xd6e4ff, 0, 40, 1.6);
  scene.add(light);
  let lightT = 0;
  const view = new THREE.Vector3(), seg = new THREE.Vector3(), side = new THREE.Vector3();

  function jag(a, b, disp, iters) {
    let pts = [a, b];
    for (let it = 0; it < iters; it++) {
      const np = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        np.push(p);
        np.push(new THREE.Vector3((p.x + q.x) / 2 + rand(-disp, disp), (p.y + q.y) / 2 + rand(-disp, disp) * 0.3, (p.z + q.z) / 2 + rand(-disp, disp)));
      }
      np.push(pts[pts.length - 1]);
      pts = np; disp *= 0.55;
    }
    return pts;
  }
  function ribbon(lines, geo) {
    const pos = geo.attributes.position.array, A = geo.attributes.aA.array;
    let v = 0;
    const idx = [];
    for (const { pts, w } of lines) {
      const start = v;
      for (let i = 0; i < pts.length && v < 638; i++) {
        const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        seg.copy(q).sub(o).normalize();
        view.copy(camera.position).sub(p).normalize();
        side.crossVectors(seg, view).normalize().multiplyScalar(w * (1 - (i / pts.length) * 0.4));
        pos[v * 3] = p.x - side.x; pos[v * 3 + 1] = p.y - side.y; pos[v * 3 + 2] = p.z - side.z;
        pos[v * 3 + 3] = p.x + side.x; pos[v * 3 + 4] = p.y + side.y; pos[v * 3 + 5] = p.z + side.z;
        A[v] = -1; A[v + 1] = 1;
        if (i < pts.length - 1) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
        v += 2;
      }
      void start;
    }
    geo.setIndex(idx);
    geo.attributes.position.needsUpdate = true; geo.attributes.aA.needsUpdate = true;
    geo.setDrawRange(0, idx.length);
  }

  function strike(x0, z0, x1, z1) {
    const b = bolts.find((b) => b.life <= 0) || bolts[0];
    const gy = groundAt(x1, z1);
    const top = new THREE.Vector3(x0, CLOUD_Y + 0.5, z0), bot = new THREE.Vector3(x1, Math.max(gy, 0), z1);
    const main = jag(top, bot, top.distanceTo(bot) * 0.16, 5);
    const lines = [{ pts: main, w: 0.42 }];
    for (let k = 0; k < 3; k++) {
      const i = Math.floor(rand(2, main.length * 0.6));
      const p = main[i];
      const end = p.clone().add(new THREE.Vector3(rand(-4, 4), -rand(2.5, 5), rand(-4, 4)));
      lines.push({ pts: jag(p.clone(), end, 1.2, 3), w: 0.17 });
    }
    ribbon(lines, b.geo);
    b.life = 0.42; b.mesh.visible = true;
    light.position.set(x1, gy + 4, z1); lightT = 0.3;
    G.fx.ring(x1, Math.max(gy, 0) + 0.3, z1, [1.2, 1.25, 1.5], 7, 0.5);
    G.fx.sparkle(x1, Math.max(gy, 0) + 0.5, z1, 10, [1.1, 1.15, 1.4], 2);
    G.shared.flash.value = 0.4;
    return { x: x1, y: gy, z: z1 };
  }

  // ---------------------------------------------------------------- rainbows
  const rainbows = [];
  for (let i = 0; i < 3; i++) {
    const R0 = 6.6, R1 = 8.3;
    const geo = new THREE.RingGeometry(R0, R1, 72, 1, 0, Math.PI);
    const mat = new THREE.ShaderMaterial({ vertexShader: RB_VS, fragmentShader: RB_FS, uniforms: { uA: { value: 0 }, uR0: { value: R0 }, uR1: { value: R1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; mesh.renderOrder = 7;
    scene.add(mesh);
    rainbows.push({ mesh, mat, life: 0, max: 1, x: 0, z: 0, s: 1, got: false });
  }

  const api = {
    strike,
    rainbows,
    rainbow(x, z, size = 1) {
      const r = rainbows.find((r) => r.life <= 0);
      if (!r) return null;
      r.x = x; r.z = z; r.s = size; r.life = r.max = 11; r.got = false;
      r.mesh.position.set(x, Math.max(0, groundAt(x, z)) - 0.5, z);
      r.mesh.scale.setScalar(size);
      r.mesh.visible = true;
      return r;
    },
    clear() { for (const b of bolts) { b.life = 0; b.mesh.visible = false; } for (const r of rainbows) { r.life = 0; r.mesh.visible = false; } light.intensity = 0; G.shared.flash.value = 0; },
    update(dt) {
      for (const b of bolts) {
        if (b.life <= 0) continue;
        b.life -= dt;
        const t = 0.42 - b.life;
        b.mat.uniforms.uA.value = t < 0.07 ? 1 : t < 0.11 ? 0.15 : Math.max(0, 1 - (t - 0.11) / 0.3);
        if (b.life <= 0) b.mesh.visible = false;
      }
      lightT = Math.max(0, lightT - dt);
      light.intensity = lightT > 0 ? 60 * (lightT / 0.3) * (Math.random() < 0.8 ? 1 : 0.3) : 0;
      G.shared.flash.value = damp(G.shared.flash.value, 0, 7, dt);
      for (const r of rainbows) {
        if (r.life <= 0) continue;
        r.life -= dt;
        const age = r.max - r.life;
        const a = smoothstep(0, 1.6, age) * smoothstep(0, 2.5, r.life);
        r.mat.uniforms.uA.value = r.got ? a * 1.8 : a;
        r.mesh.rotation.y = Math.atan2(camera.position.x - r.x, camera.position.z - r.z);
        if (r.life <= 0) r.mesh.visible = false;
        const S = G.sprite;
        if (!r.got && S.active && age > 0.8 && Math.hypot(S.x - r.x, S.z - r.z) < 6 * r.s) { r.got = true; r.life = Math.min(r.life, 2.5); api.onRainbow?.(r); }
      }
    },
  };
  return api;
}
