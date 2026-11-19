// The shop's active tools, used with keys 1-4 (or the toolbar):
//   Cloud Whistle  calls every cloud around you
//   Cloud Peg      anchors clouds over a spot so the wind cannot take them
//   Weather Vane   turns the whole sky's wind the way you are flying
//   Rain Bell      makes every cloud near you rain at once, even small ones
import * as THREE from 'three';
import { G } from './state.js';
import { CLOUD_Y } from './consts.js';
import { TOOL, SHOP, tierOf } from './profile.js';
import { groundAt, insideIsland } from './island.js';
import { clamp, damp, rand } from './util.js';

export function createTools(scene) {
  // ---------------------------------------------------------------- peg visuals: a ring in the cloud layer, a beam to the ground
  const ringGeo = new THREE.TorusGeometry(1, 0.05, 6, 48); ringGeo.rotateX(Math.PI / 2);
  const beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 8, 1, true); beamGeo.translate(0, 0.5, 0);
  const knotGeo = new THREE.OctahedronGeometry(0.55, 0);
  const pegs = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(); g.visible = false; scene.add(g);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.02, 0.55), transparent: true, opacity: 0.8, depthWrite: false, depthTest: false });
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.renderOrder = 15;
    const ring2 = new THREE.Mesh(ringGeo, ringMat); ring2.renderOrder = 15;
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.0, 0.6), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    const knot = new THREE.Mesh(knotGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.1, 0.5), transparent: true, depthWrite: false, depthTest: false }));
    knot.renderOrder = 16;
    g.add(ring, ring2, beam, knot);
    pegs.push({ g, ring, ring2, beam, knot, ringMat, beamMat, on: false, x: 0, z: 0, r: TOOL.peg.r, life: 0, max: 1, born: 0 });
  }

  // ---------------------------------------------------------------- waves: flat rings that sweep out across the cloud layer
  const waveGeo = new THREE.RingGeometry(0.92, 1, 64); waveGeo.rotateX(-Math.PI / 2);
  const waves = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(waveGeo, m); mesh.visible = false; mesh.renderOrder = 17;
    scene.add(mesh);
    waves.push({ mesh, m, t: 0, max: 1, r: 1 });
  }
  function wave(x, z, r, color, dur = 0.7) {
    const w = waves.find((q) => q.t <= 0) || waves[0];
    w.t = w.max = dur; w.r = r; w.mesh.position.set(x, CLOUD_Y - 0.6, z); w.mesh.visible = true; w.m.color.setRGB(color[0], color[1], color[2]);
  }

  const T = {
    slots: [], pegs, vane: { t: 0, max: 1, x: 1, z: 0 }, onUse: null,
    // which tools the player owns today, in key order
    setup() {
      T.slots = SHOP.filter((it) => it.kind === 'tool' && tierOf(it.id) > 0).map((it) => ({ id: it.id, slot: it.slot, tier: tierOf(it.id), cd: 0, cdMax: TOOL[it.id].cd[tierOf(it.id) - 1] }));
      T.clear();
    },
    clear() { for (const p of pegs) { p.on = false; p.g.visible = false; } for (const w of waves) { w.t = 0; w.mesh.visible = false; } T.vane.t = 0; for (const s of T.slots) s.cd = 0; },
    slotFor: (id) => T.slots.find((s) => s.id === id),
    ready: (id) => { const s = T.slotFor(id); return !!s && s.cd <= 0; },
    use(id) {
      const s = T.slotFor(id);
      if (!s || s.cd > 0 || G.mode !== 'playing' || (G.game && G.game.R.state !== 'playing')) return false;
      const S = G.sprite, k = s.tier - 1;
      let n = 0;
      if (id === 'whistle') {
        const r = TOOL.whistle.r[k];
        for (const c of G.clouds.list) {
          if (c.kind === 'smog' || c.state === 'rain' || c.holder) continue;
          if (Math.hypot(c.x - S.x, c.z - S.z) < r) { c.called = 2.2; n++; }
        }
        wave(S.x, S.z, r, [0.55, 0.85, 1.2], 0.8); wave(S.x, S.z, r * 0.6, [0.55, 0.85, 1.2], 0.55);
        G.fx.sparkle(S.x, CLOUD_Y + 1, S.z, 12, [0.75, 0.95, 1.4], 3);
        G.audio?.whistle();
      } else if (id === 'peg') {
        const max = TOOL.peg.n[k];
        let x = S.tx, z = S.tz;
        const r = Math.hypot(x, z); if (r > 60) { x *= 60 / r; z *= 60 / r; }
        // reuse the oldest peg once all of today's pegs are out
        const active = pegs.filter((p) => p.on);
        let p = pegs.slice(0, max).find((q) => !q.on);
        if (!p) { p = active.sort((a, b) => a.life - b.life)[0]; }
        Object.assign(p, { on: true, x, z, life: TOOL.peg.life[k], max: TOOL.peg.life[k], born: 0 });
        p.g.position.set(x, 0, z); p.g.visible = true;
        const gy = Math.max(0, groundAt(x, z));
        p.beam.position.y = gy; p.beam.scale.set(1, CLOUD_Y - 1 - gy, 1);
        wave(x, z, TOOL.peg.r * 1.6, [1.1, 0.9, 0.45], 0.5);
        G.audio?.peg();
        n = 1;
      } else if (id === 'vane') {
        // the wind turns to blow the way the spirit is heading (or toward the pointer, if it is ahead)
        let dx = S.fx, dz = S.fz;
        const ax = S.tx - S.x, az = S.tz - S.z, al = Math.hypot(ax, az);
        if (al > 3) { dx = ax / al; dz = az / al; }
        T.vane = { t: TOOL.vane.dur[k], max: TOOL.vane.dur[k], x: dx, z: dz };
        G.audio?.vane();
        n = 1;
      } else if (id === 'bell') {
        const r = TOOL.bell.r[k];
        for (const c of G.clouds.list) {
          if (c.kind === 'smog' || c.mass < 0.6) continue;
          if (Math.hypot(c.x - S.x, c.z - S.z) > r + c.R * 0.5) continue;
          if (c.holder) { c.holder = null; c.wasHeld = false; c.thrown = 0.8; c.vx *= 0.25; c.vz *= 0.25; }
          c.bell = true; c.drawn = 0;
          if (c.state === 'idle') { c.state = 'swell'; c.swellT = 0.7; }
          n++;
        }
        wave(S.x, S.z, r, [1.2, 1.0, 0.5], 0.7);
        G.fx.sparkle(S.x, CLOUD_Y, S.z, 14, [1.3, 1.1, 0.6], 4);
        G.audio?.rainbell();
      }
      s.cd = s.cdMax;
      T.onUse?.(id, n);
      return true;
    },
    // the wind the vane is forcing, if any
    windOverride() { return T.vane.t > 0 ? T.vane : null; },
    update(dt) {
      for (const s of T.slots) s.cd = Math.max(0, s.cd - dt);
      for (const w of waves) {
        if (w.t <= 0) continue;
        w.t -= dt;
        const k = 1 - Math.max(0, w.t) / w.max;
        w.mesh.scale.setScalar(Math.max(0.01, w.r * (0.15 + 0.85 * (1 - (1 - k) * (1 - k)))));
        w.m.opacity = (1 - k) * 0.9;
        if (w.t <= 0) w.mesh.visible = false;
      }
      const t = G.time;
      for (const p of pegs) {
        if (!p.on) continue;
        p.life -= dt; p.born = Math.min(1, p.born + dt * 3);
        if (p.life <= 0) { p.on = false; p.g.visible = false; continue; }
        const fade = clamp(p.life / 3, 0, 1) * p.born;
        const pulse = 1 + Math.sin(t * 3) * 0.04;
        p.ring.position.y = CLOUD_Y - 1.1; p.ring.scale.setScalar(p.r * pulse * (0.4 + 0.6 * p.born));
        p.ring2.position.y = CLOUD_Y - 1.1; p.ring2.scale.setScalar(p.r * 0.55 * pulse);
        p.ring.rotation.y = t * 0.6; p.ring2.rotation.y = -t * 0.9;
        p.knot.position.y = CLOUD_Y - 1 + Math.sin(t * 2) * 0.25; p.knot.rotation.y = t * 1.5;
        p.ringMat.opacity = 0.75 * fade; p.beamMat.opacity = 0.28 * fade; p.knot.material.opacity = fade;
      }
      if (T.vane.t > 0) {
        T.vane.t = Math.max(0, T.vane.t - dt);
        // streaks across the sky show the turned wind
        if (Math.random() < dt * 40) {
          const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 52;
          G.fx.streak(Math.cos(a) * r, rand(9, 15), Math.sin(a) * r, T.vane.x, T.vane.z, rand(18, 26), rand(0.5, 0.9), 0.4);
        }
      }
    },
  };
  return T;
}
