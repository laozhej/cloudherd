// The Breezling: a hired little spirit that ferries small clouds to the thirstiest field.
// It holds clouds the same way the player does (it is just another holder to clouds.js).
import * as THREE from 'three';
import { G } from './state.js';
import { SPRITE_Y } from './consts.js';
import { CROPS } from './crops.js';
import { TOOL, tierOf } from './profile.js';
import { LAYOUT } from './island.js';
import { damp, clamp, rectDist } from './util.js';

export function createHelper(scene) {
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const top = (m) => { m.depthTest = false; m.depthWrite = false; return m; };
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 2), top(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 1.5, 1.05) })));
  core.renderOrder = 22; root.add(core);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(220,255,230,1)'); gr.addColorStop(0.4, 'rgba(150,255,190,0.35)'); gr.addColorStop(1, 'rgba(150,255,190,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const halo = new THREE.Sprite(top(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true })));
  halo.scale.set(3.4, 3.4, 1); halo.renderOrder = 21; root.add(halo);
  const eyeGeo = new THREE.SphereGeometry(0.09, 8, 6), eyeMat = top(new THREE.MeshBasicMaterial({ color: 0x24324a }));
  const eyes = [new THREE.Mesh(eyeGeo, eyeMat), new THREE.Mesh(eyeGeo, eyeMat)];
  for (const e of eyes) { e.renderOrder = 23; root.add(e); }
  const camRight = new THREE.Vector3(), camUp = new THREE.Vector3(), toCam = new THREE.Vector3();

  const H = {
    // holder interface read by clouds.js
    x: 6, z: 14, vx: 0, vz: 0, active: false, drawing: false, drawStart: false, capR: 6.5, leash: 15, capacity: 1, isHelper: true,
    tier: 0, speed: 15, wait: 0, target: null, think: 0, trips: 0,
    // the Breezling only ever picks up small, plain, idle clouds
    canHold: (c) => (c.kind === 'water' || c.kind === 'gold') && c.state === 'idle' && c.mass < 3,
    setup(on) {
      H.tier = on ? tierOf('breezling') : 0;
      H.active = H.tier > 0;
      root.visible = H.active;
      if (!H.active) { H.drawing = false; return; }
      const S = LAYOUT.square;
      H.x = S.x; H.z = S.z; H.vx = H.vz = 0; H.drawing = false; H.wait = 1.5; H.target = null; H.trips = 0;
      H.speed = TOOL.breezling.speed[H.tier - 1]; H.capacity = TOOL.breezling.cap[H.tier - 1];
    },
    held() { return G.clouds.list.filter((c) => c.holder === H); },
    update(dt) {
      if (!H.active) return;
      if (G.mode !== 'playing') { H.drawing = false; H.render(dt); return; }
      H.think -= dt;
      // the thirstiest field that is not already getting rain
      if (H.think <= 0) {
        H.think = 1.2;
        let best = null, bs = 0;
        for (const f of G.crops.fields) {
          if (!f.active || f.dead) continue;
          // keep fields topped up, not just rescue them
          const raining = G.clouds.list.some((cl) => cl.state === 'rain' && rectDist(cl.x, cl.z, f.def) < 3);
          const need = CROPS[f.type].need + 0.32 - f.moist;
          if (need > bs && !raining) { bs = need; best = f; }
        }
        H.target = best;
      }
      let tx = H.x, tz = H.z;
      H.drawStart = false;
      if (H.wait > 0) { H.wait -= dt; H.drawing = false; }
      else if (!H.target) {
        // nothing to do: drift around the village square
        const S = LAYOUT.square; tx = S.x + Math.sin(G.time * 0.3) * 6; tz = S.z + Math.cos(G.time * 0.37) * 5; H.drawing = false;
      } else {
        const held = H.held();
        const f = H.target.def;
        if (held.length >= H.capacity || (held.length && !nearestCloud(f))) {
          // carry to the field; fold it into a cloud already parked there, then let go over the field
          H.drawing = true;
          const park = G.clouds.list.find((cl) => !cl.holder && cl.state === 'idle' && (cl.kind === 'water' || cl.kind === 'gold') && rectDist(cl.x, cl.z, f) < 3);
          if (park) { tx = park.x; tz = park.z; }
          else {
            tx = f.x; tz = f.z;
            if (Math.hypot(held[0].x - f.x, held[0].z - f.z) < 2.2 && Math.hypot(H.vx, H.vz) < 6) { H.drawing = false; H.wait = 2.4; H.think = 0; H.trips++; }
          }
        } else {
          const cl = nearestCloud(f);
          if (!cl) { tx = f.x; tz = f.z; H.drawing = held.length > 0; }
          else {
            tx = cl.x; tz = cl.z;
            const d = Math.hypot(cl.x - H.x, cl.z - H.z);
            if (!H.drawing && d < H.capR) H.drawStart = true;
            H.drawing = held.length > 0 || d < H.capR + 1;
          }
        }
      }
      // fly
      const max = H.speed * (H.drawing ? 0.8 : 1);
      let dvx = (tx - H.x) * 4, dvz = (tz - H.z) * 4;
      const dl = Math.hypot(dvx, dvz); if (dl > max) { dvx *= max / dl; dvz *= max / dl; }
      H.vx = damp(H.vx, dvx, 6, dt); H.vz = damp(H.vz, dvz, 6, dt);
      H.x += H.vx * dt; H.z += H.vz * dt;
      H.render(dt);
    },
    render(dt) {
      const t = G.time;
      root.position.set(H.x, SPRITE_Y - 0.8 + Math.sin(t * 4.3) * 0.2, H.z);
      const cam = G.camera;
      toCam.copy(cam.position).sub(root.position).normalize();
      camRight.set(1, 0, 0).applyQuaternion(cam.quaternion); camUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
      for (let i = 0; i < 2; i++) eyes[i].position.copy(toCam).multiplyScalar(0.56).addScaledVector(camRight, (i ? 1 : -1) * 0.2).addScaledVector(camUp, 0.08);
      halo.material.opacity = 0.7 + Math.sin(t * 6) * 0.15 + (H.drawing ? 0.2 : 0);
      if (H.drawing && Math.random() < dt * 8) G.fx.sparkle(H.x, SPRITE_Y - 1, H.z, 1, [0.7, 1.3, 0.9], 1);
    },
  };
  // a small, free cloud not already sitting over the target field, closest to the helper
  function nearestCloud(f) {
    let best = null, bs = 1e9;
    for (const cl of G.clouds.list) {
      if (cl.holder || cl.kind === 'smog' || cl.kind === 'acid' || cl.state === 'rain' || cl.born < 0.7 || cl.mass >= 3) continue;
      if (rectDist(cl.x, cl.z, f) < 2) continue;
      const d = Math.hypot(cl.x - H.x, cl.z - H.z) + Math.hypot(cl.x - f.x, cl.z - f.z) * 0.5;
      if (d < bs) { bs = d; best = cl; }
    }
    return best;
  }
  return H;
}
