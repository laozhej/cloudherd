// The player: a small wind spirit with a ribbon tail. It follows the pointer,
// shoves clouds it flies into, gusts on click and draws clouds in while held.
import * as THREE from 'three';
import { G } from './state.js';
import { SPRITE_Y, CLOUD_Y } from './consts.js';
import { clamp, damp, lerp } from './util.js';

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(220,250,255,0.55)'); gr.addColorStop(0.6, 'rgba(160,230,255,0.12)'); gr.addColorStop(1, 'rgba(160,230,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createSprite(scene, camera) {
  const root = new THREE.Group();
  root.renderOrder = 20;
  scene.add(root);
  const top = (m) => { m.depthTest = false; m.depthWrite = false; return m; };
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 3), top(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 1.55, 1.6) })));
  core.renderOrder = 22;
  root.add(core);
  const halo = new THREE.Sprite(top(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x9fe9f5, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9 })));
  halo.scale.set(6, 6, 1); halo.renderOrder = 21;
  root.add(halo);
  const eyeMat = top(new THREE.MeshBasicMaterial({ color: 0x24324a }));
  const eyeGeo = new THREE.SphereGeometry(0.15, 10, 8);
  const eyes = [new THREE.Mesh(eyeGeo, eyeMat), new THREE.Mesh(eyeGeo, eyeMat)];
  for (const e of eyes) { e.renderOrder = 23; root.add(e); }
  const cheekMat = top(new THREE.MeshBasicMaterial({ color: 0xffa6b8, transparent: true, opacity: 0.75 }));
  const cheeks = [new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), cheekMat), new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), cheekMat)];
  for (const c of cheeks) { c.renderOrder = 23; root.add(c); }

  // aura ring on the cloud layer: shows the reach of the push, widens when drawing
  const ringMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: G.shared.time, uMode: { value: 0 }, uAlpha: { value: 0.5 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uMode, uAlpha; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float ring = smoothstep(0.86, 0.96, r) * smoothstep(1.0, 0.96, r);
        float dash = step(0.45, fract(a * 6.0 / 6.2832 * 4.0 + uTime * mix(0.15, -0.9, uMode)));
        float swirl = uMode * smoothstep(0.2, 0.95, r) * smoothstep(1.0, 0.9, r) * (0.5 + 0.5 * sin(a * 5.0 + r * 14.0 + uTime * 9.0)) * 0.35;
        vec3 col = mix(vec3(0.8, 0.97, 1.0), vec3(0.55, 1.0, 0.85), uMode);
        gl_FragColor = vec4(col, (ring * dash + swirl) * uAlpha);
      }`,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 19;
  scene.add(ring);

  // ribbon tail
  const TN = 34;
  const trail = Array.from({ length: TN }, () => new THREE.Vector3());
  const tPos = new Float32Array(TN * 2 * 3), tA = new Float32Array(TN * 2);
  const tIdx = [];
  for (let i = 0; i < TN - 1; i++) { const k = i * 2; tIdx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
  tGeo.setAttribute('aA', new THREE.BufferAttribute(tA, 1));
  tGeo.setIndex(tIdx);
  const tMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    vertexShader: `attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(mix(vec3(0.30, 0.78, 0.86), vec3(0.85, 0.98, 1.0), vA), vA * 0.85);
      #include <colorspace_fragment>
    }`,
  });
  const tail = new THREE.Mesh(tGeo, tMat); tail.frustumCulled = false; tail.renderOrder = 20;
  scene.add(tail);

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SPRITE_Y);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
  const camRight = new THREE.Vector3(), camUp = new THREE.Vector3(), toCam = new THREE.Vector3();

  const S = {
    x: 0, z: 10, vx: 0, vz: 0, fx: 0, fz: -1, active: false, drawing: false, gustCD: 0, gustT: 0,
    tx: 0, tz: 10, speed: 0, root, ring, maxSpeed: 30, squish: 0, autopilot: null,
    reset(x = 0, z = 10) {
      S.x = S.tx = x; S.z = S.tz = z; S.vx = S.vz = 0; S.gustCD = 0;
      for (const p of trail) p.set(x, SPRITE_Y, z);
    },
    // where the pointer points on the spirit's flight plane
    pointerTarget(px, py) {
      ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hit)) return { x: hit.x, z: hit.z };
      return null;
    },
    update(dt, input) {
      const I = input;
      let draw = false, gust = false;
      if (S.autopilot) {
        const a = S.autopilot; S.tx = a.tx; S.tz = a.tz; draw = !!a.draw; gust = !!a.gust; a.gust = false;
      } else if (S.active && I) {
        if (I.mode === 'keys') {
          const m = I.moveAxis();
          if (m.any) { S.tx = S.x + m.x * 9; S.tz = S.z + m.z * 9; } else { S.tx = S.x + S.vx * 0.05; S.tz = S.z + S.vz * 0.05; }
        } else if (I.has) {
          const t = S.pointerTarget(I.x, I.y);
          if (t) { S.tx = t.x; S.tz = t.z; }
        }
        draw = I.drawHeld(); gust = I.gustNow();
      }
      // keep the target inside the play area
      const tr = Math.hypot(S.tx, S.tz);
      if (tr > 70) { S.tx *= 70 / tr; S.tz *= 70 / tr; }
      S.drawing = S.active && draw;
      const max = S.maxSpeed * (S.drawing ? 0.62 : 1);
      let dvx = (S.tx - S.x) * 5.5, dvz = (S.tz - S.z) * 5.5;
      const dl = Math.hypot(dvx, dvz);
      if (dl > max) { dvx *= max / dl; dvz *= max / dl; }
      S.vx = damp(S.vx, dvx, 9, dt); S.vz = damp(S.vz, dvz, 9, dt);
      S.x += S.vx * dt; S.z += S.vz * dt;
      S.speed = Math.hypot(S.vx, S.vz);
      if (S.speed > 1.5) { S.fx = damp(S.fx, S.vx / S.speed, 10, dt); S.fz = damp(S.fz, S.vz / S.speed, 10, dt); const fl = Math.hypot(S.fx, S.fz) || 1; S.fx /= fl; S.fz /= fl; }
      S.gustCD = Math.max(0, S.gustCD - dt);
      S.gustT = Math.max(0, S.gustT - dt);
      if (S.active && gust && S.gustCD <= 0) {
        // gust toward where the pointer is, if it is ahead of us; otherwise along our motion
        let gx = S.fx, gz = S.fz;
        const ddx = S.tx - S.x, ddz = S.tz - S.z, dd = Math.hypot(ddx, ddz);
        if (dd > 2.5) { gx = ddx / dd; gz = ddz / dd; }
        S.fx = gx; S.fz = gz;
        S.gustCD = 0.55; S.gustT = 0.35; S.squish = 1;
        const hits = G.clouds.gust(S.x, S.z, gx, gz);
        G.props?.push(S.x, S.z, gx * 14, gz * 14, 20);
        S.onGust?.(gx, gz, hits);
      }
      // the spirit's wake also stirs boats and the windmill a little
      if (S.speed > 8 && G.props) G.props.push(S.x, S.z, S.vx * 0.05, S.vz * 0.05, 5);
      S.render(dt);
    },
    render(dt) {
      const t = G.time;
      const bob = Math.sin(t * 3.1) * 0.18;
      root.position.set(S.x, SPRITE_Y + bob, S.z);
      S.squish = damp(S.squish, 0, 6, dt);
      const st = 1 + S.squish * 0.35, sd = S.drawing ? 0.88 + Math.sin(t * 20) * 0.04 : 1;
      core.scale.set(st * sd, (1 / st) * sd, st * sd);
      halo.material.opacity = 0.75 + Math.sin(t * 5) * 0.12 + S.squish * 0.3;
      halo.scale.setScalar(5.6 + S.squish * 2.4 + (S.drawing ? 1.4 : 0));
      // face the camera: eyes on the side of the core that looks at the viewer, leaning into motion
      toCam.copy(camera.position).sub(root.position).normalize();
      camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const look = clamp(S.vx * 0.012, -0.25, 0.25), lookUp = clamp(-S.vz * 0.01, -0.2, 0.2);
      const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const e = eyes[i];
        e.position.copy(toCam).multiplyScalar(0.9).addScaledVector(camRight, side * 0.33 + look).addScaledVector(camUp, 0.12 + lookUp);
        e.scale.set(1, (S.squish > 0.3 ? 0.35 : blink) * 1.15, 1);
        e.quaternion.copy(camera.quaternion);
        const ch = cheeks[i];
        ch.position.copy(toCam).multiplyScalar(0.96).addScaledVector(camRight, side * 0.56 + look).addScaledVector(camUp, -0.14 + lookUp);
        ch.quaternion.copy(camera.quaternion);
      }
      // ring
      const want = S.drawing ? 11.5 : 4.2;
      ring.scale.setScalar(damp(ring.scale.x, want, 8, dt));
      ring.position.set(S.x, CLOUD_Y - 0.4, S.z);
      ringMat.uniforms.uMode.value = damp(ringMat.uniforms.uMode.value, S.drawing ? 1 : 0, 8, dt);
      ringMat.uniforms.uAlpha.value = S.active ? (S.drawing ? 0.75 : 0.35) : 0;
      // tail
      const head = trail[0];
      head.set(S.x, SPRITE_Y + bob, S.z);
      for (let i = TN - 1; i > 0; i--) {
        const p = trail[i], prev = trail[i - 1];
        const k = 1 - Math.exp(-dt * (26 - i * 0.45));
        p.lerp(prev, k);
        p.y += Math.sin(t * 6 + i * 0.45) * 0.012 * i;
      }
      for (let i = 0; i < TN; i++) {
        const p = trail[i], n = trail[Math.min(TN - 1, i + 1)], pr = trail[Math.max(0, i - 1)];
        let dx = n.x - pr.x, dz = n.z - pr.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const w = 0.55 * (1 - i / TN) + 0.04;
        const k = i * 6;
        tPos[k] = p.x - dz * w; tPos[k + 1] = p.y; tPos[k + 2] = p.z + dx * w;
        tPos[k + 3] = p.x + dz * w; tPos[k + 4] = p.y; tPos[k + 5] = p.z - dx * w;
        const a = (1 - i / TN) * clamp(S.speed / 12, 0.15, 1) * 0.85;
        tA[i * 2] = a; tA[i * 2 + 1] = a;
      }
      tGeo.attributes.position.needsUpdate = true; tGeo.attributes.aA.needsUpdate = true;
      root.visible = tail.visible = S.active || S.showIdle;
    },
  };
  return S;
}
