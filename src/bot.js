// A test pilot. It plays the way a decent player would: pick the most urgent job,
// gather clouds while drawing, carry them over, let go. Used by the balance scripts.
import { G } from './state.js';
import { CROPS } from './crops.js';
import { LAYOUT, insideIsland } from './island.js';
import { rectDist } from './util.js';

export function createBot() {
  const B = { on: false, task: null, phase: 'gather', wait: 0, skill: 1, think: 0, log: [] };

  function jobs() {
    const out = [], R = G.game.R, day = R.day;
    for (const f of G.crops.fields) if (f.active && !f.dead) {
      const T = CROPS[f.type];
      const deficit = T.need + 0.3 - f.moist;
      if (deficit > 0) out.push({ kind: 'field', x: f.def.x, z: f.def.z, want: 3.1, urg: deficit * 3 + (1 - f.health) * 3, f });
    }
    for (const c of G.fire.clusters) if (c.n >= 2) out.push({ kind: 'fire', x: c.x, z: c.z, want: 3.6, urg: 2.5 + c.n * 0.04 });
    for (const h of G.props.houses) if (h.fire > 0 && !h.lost) out.push({ kind: 'house', x: h.x, z: h.z, want: 3.2, urg: 6 });
    if (day.fair?.wantsRain && G.game.fairActive() && !R.gaugeDone) { const S = LAYOUT.square; out.push({ kind: 'gauge', x: S.x, z: S.z, want: 4.5, urg: 4.5 }); }
    const rodGoal = day.goals.find((g) => g.type === 'rods');
    if (rodGoal && R.rodHits < rodGoal.n) {
      const tip = G.props.tips[R.rodHits % G.props.tips.length];
      out.push({ kind: 'rod', x: tip.x, z: tip.z, want: 7.6, urg: 1.6 });
    }
    for (const c of G.clouds.list) if (c.kind === 'smog' && insideIsland(c.x, c.z) > -4) out.push({ kind: 'smog', x: c.x, z: c.z, cloud: c, urg: 0.9 + (day.goals.some((g) => g.type === 'smog' && R.smogCleared < g.n) ? 0.6 : 0) });
    return out.sort((a, b) => b.urg - a.urg);
  }

  const near = (c, S, r) => Math.hypot(c.x - S.x, c.z - S.z) < r;

  B.update = (dt) => {
    if (!B.on || G.mode !== 'playing') return;
    const S = G.sprite, C = G.clouds;
    const ap = S.autopilot || (S.autopilot = { tx: S.x, tz: S.z, draw: false, gust: false });
    // a less skilled pilot flies slower, hesitates, and takes breaks
    S.maxSpeed = 90 * (0.45 + 0.55 * B.skill);
    B.think -= dt;
    if (B.wait > 0) { B.wait -= dt; ap.draw = false; return; }
    if (B.skill < 1 && Math.random() < dt * 0.12 * (1 - B.skill)) { B.wait = 1 + Math.random() * 2.5 * (1 - B.skill); return; }
    if (!B.task || B.think <= 0) {
      B.think = 3 / Math.max(0.3, B.skill);
      const js = jobs();
      // a weaker pilot does not always spot the most urgent job
      if (B.skill < 1 && js.length > 1 && Math.random() > B.skill) js.unshift(js.splice(1 + ((Math.random() * Math.min(2, js.length - 1)) | 0), 1)[0]);
      // keep the current job unless something is much more urgent
      if (!B.task || !js.length || js[0].urg > (B.task.urg || 0) + 1.5 || B.task.done) B.task = js[0] || null;
      if (B.task && B.task.kind === 'smog' && !C.list.includes(B.task.cloud)) B.task = js.find((j) => j.kind !== 'smog') || null;
    }
    const T = B.task;
    if (!T) { ap.draw = false; ap.tx = 0; ap.tz = 6; return; }
    if (T.kind === 'smog') {
      const c = T.cloud;
      if (!C.list.includes(c)) { B.task = null; return; }
      const r = Math.hypot(c.x, c.z) || 1, ox = c.x / r, oz = c.z / r;
      const px = c.x - ox * 6, pz = c.z - oz * 6;
      ap.draw = false;
      if (Math.hypot(S.x - px, S.z - pz) > 2.5) { ap.tx = px; ap.tz = pz; }
      else { ap.tx = c.x + ox * 12; ap.tz = c.z + oz * 12; ap.gust = true; }
      return;
    }
    // the cloud we are carrying: water, close to us
    let carry = null;
    for (const c of C.list) if (c.holder === S && (!carry || c.mass > carry.mass)) carry = c;
    if (B.phase === 'gather') {
      if (carry && carry.mass >= T.want) { B.phase = 'deliver'; return; }
      // next cloud to fetch: cheap to reach and not far off the way to the job
      let best = null, bs = 1e9;
      for (const c of C.list) {
        if (c === carry || c.kind === 'smog' || c.born < 0.7) continue;
        if (c.state === 'rain') continue;
        const d = Math.hypot(c.x - S.x, c.z - S.z) + 0.6 * Math.hypot(c.x - T.x, c.z - T.z) - c.mass * 2;
        if (d < bs) { bs = d; best = c; }
      }
      // nothing left to fetch: deliver what we have, except to a rod, which needs a real thunderhead
      if (!best) { if (carry && T.kind !== 'rod') B.phase = 'deliver'; else { ap.draw = !!carry; ap.tx = T.x; ap.tz = T.z; } return; }
      const d = Math.hypot(best.x - S.x, best.z - S.z);
      ap.tx = best.x; ap.tz = best.z;
      // do not grab a cloud that is busy raining where we left it
      const rainingNear = C.list.some((c) => c.state === 'rain' && Math.hypot(c.x - S.x, c.z - S.z) < 11 + c.R);
      ap.draw = carry ? true : d < S.capR + 2 && !rainingNear;
    } else {
      if (!carry) { B.phase = 'gather'; return; }
      // the job changed under us (a rod wants far more than a field): go back to gathering
      if (T.kind === 'rod' && carry.mass < T.want) { B.phase = 'gather'; return; }
      ap.draw = true;
      ap.tx = T.x; ap.tz = T.z;
      if (!T.ox) { const j = (1 - B.skill) * 6; T.ox = (Math.random() - 0.5) * j; T.oz = (Math.random() - 0.5) * j; }
      ap.tx = T.x + T.ox; ap.tz = T.z + T.oz;
      if (Math.hypot(carry.x - ap.tx, carry.z - ap.tz) < 2 && S.speed < 7) {
        // over a rod, keep holding the thunderhead so it strikes without raining itself away
        if (T.kind === 'rod' && carry.storm) {
          T.hold = (T.hold || 0) + dt;
          if (T.hits0 === undefined) T.hits0 = G.game.R.rodHits;
          if (T.hold < 16 && G.game.R.rodHits - T.hits0 < 3) return;
        }
        ap.draw = false; B.wait = T.kind === 'rod' ? 2 : 1.4; B.phase = 'gather'; T.done = true; B.task = null;
      }
    }
  };
  function rectDistAny(c) { let m = 99; for (const f of G.crops.fields) if (f.active) m = Math.min(m, rectDist(c.x, c.z, f.def)); return m; }
  B.start = (skill = 1) => { B.on = true; B.skill = skill; B.task = null; B.phase = 'gather'; G.sprite.autopilot = { tx: G.sprite.x, tz: G.sprite.z, draw: false, gust: false }; };
  B.stop = () => { B.on = false; G.sprite.autopilot = null; G.sprite.maxSpeed = 90; };
  return B;
}
