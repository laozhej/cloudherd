// The rules of a day: the clock, the wind, where clouds come from, scoring,
// goals, the tutorial and every scripted moment.
import { G } from './state.js';
import { DAYS, FREE } from './levels.js';
import { LAYOUT, groundAt, insideIsland, masks } from './island.js';
import { clamp, rand, lerp, damp, smoothstep, rectDist, TAU } from './util.js';
import { RAIN_MASS, STORM_MASS, GRID } from './consts.js';
import { CROPS } from './crops.js';
import { t } from './i18n.js';

const deg = (d) => (d * Math.PI) / 180;

export function createGame() {
  const R = {
    day: null, idx: -1, state: 'idle', score: 0, harvests: 0, housesLost: 0, rodHits: 0, smogCleared: 0,
    fairJoy: 1, gauge: 0, gaugeDone: false, great: 0, lit: false, tut: -1, tutT: 0, tutDist: 0, tutPush: 0,
    spawn: {}, fireT: 0, smogT: 0, windPhase: 0, ended: false, dusk: 0, stats: null, fairWasOn: false, festWasOn: false,
    lastToast: {}, dousePending: 0, douseT: 0,
  };
  const S = () => G.sprite;

  const toast = (key, vars, kind = 'info', cooldown = 0) => {
    const now = G.time;
    if (cooldown && R.lastToast[key] && now - R.lastToast[key] < cooldown) return;
    R.lastToast[key] = now;
    G.hud?.toast(t(key, vars), kind);
  };
  const addScore = (n, x, y, z, cls) => {
    if (R.day?.free) n = Math.max(0, n);
    R.score = Math.max(0, R.score + n);
    if (x !== undefined) G.hud?.pop((n >= 0 ? '+' : '') + n, x, y, z, cls || (n >= 0 ? 'good' : 'bad'));
  };

  // ---------------------------------------------------------------- hooks
  function wire() {
    const C = G.clouds, A = G.audio, FX = G.fx;
    C.onMerge = (a, b, wasKind) => {
      A?.merge(a.mass);
      FX.puff((a.x + b.x) / 2, 12, (a.z + b.z) / 2, 6, [1, 1, 1], 1.5, 1.3);
      R.stats.merges++;
      if (G.sprite.drawing) R.stats.drawMerges++;
      R.stats.maxCloud = Math.max(R.stats.maxCloud, a.mass);
      if (a.kind === 'acid' && wasKind !== 'acid') toast('toast.acid', null, 'warn', 6);
      if (a.mass >= STORM_MASS && a.mass - b.mass < STORM_MASS) { toast('toast.storm', null, 'warn', 20); A?.rumble(); }
    };
    C.onSwell = () => A?.swell();
    C.onRainStart = (c) => { if (!(c.ep > 0)) { c.fieldWater = 0; c.ep = 0; } A?.rainStart(); };
    C.onRain = (c, w, footR, overWater) => {
      c.ep = (c.ep || 0) + w;
      if (overWater) return;
      if (c.kind === 'acid') G.crops.acid(c.x, c.z, footR, w);
      for (const f of G.crops.fields) if (f.active && rectDist(c.x, c.z, f.def) < footR * 0.5) { c.fieldWater += w; R.stats.fieldWater += w; break; }
      const day = R.day, Sq = LAYOUT.square;
      const dsq = Math.hypot(c.x - Sq.x, c.z - Sq.z);
      if (day.fair && fairActive() && dsq < Sq.r + footR * 0.7) {
        if (day.fair.wantsRain) { R.gauge += w; G.village.gaugeFill = R.gauge / day.gauge.need; }
        else { R.fairJoy = Math.max(0, R.fairJoy - w * 0.16); toast('toast.fairRain', null, 'warn', 5); }
      }
      if (day.laundry) for (const l of G.village.laundry) if (!l.wet && Math.hypot(c.x - l.x, c.z - l.z) < footR + 1) {
        l.wet = true; addScore(-30, l.x, groundAt(l.x, l.z) + 2.5, l.z); toast('toast.laundry', null, 'warn', 3); A?.sad();
      }
    };
    C.onRainEnd = (c) => {
      const ep = c.ep || 0;
      if (ep > 1.2 && c.fieldWater / ep > 0.5) { R.stats.bullseyes++; addScore(40, c.x, 14, c.z, 'bonus'); toast('toast.bullseye', null, 'good', 4); }
      c.ep = 0; c.fieldWater = 0;
      if (ep > 1.4 && G.dayT > 0.04 && G.dayT < 0.94 && c.kind === 'water' && Math.random() < 0.6) G.weather.rainbow(c.x, c.z, clamp(c.R / 4.4, 0.8, 1.5));
    };
    C.onStrike = (c) => {
      let tx, tz, rod = null;
      if (R.day.rods || R.day.free) {
        for (const tip of G.props.tips) if (Math.hypot(tip.x - c.x, tip.z - c.z) < c.R + 5 && Math.random() < 0.8) { rod = tip; break; }
      }
      if (rod) { tx = rod.x; tz = rod.z; }
      else { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * c.R * 0.7; tx = c.x + Math.cos(a) * r; tz = c.z + Math.sin(a) * r; }
      G.weather.strike(c.x + rand(-1, 1), c.z + rand(-1, 1), tx, tz);
      A?.thunder(0.9);
      G.post.shake = Math.max(G.post.shake || 0, 0.5);
      if (rod) {
        rod.glow = 1; R.rodHits++;
        G.fx.sparkle(rod.x, rod.y, rod.z, 16, [0.7, 0.85, 1.4], 2);
        addScore(80, rod.x, rod.y + 1, rod.z, 'bonus');
        toast('toast.rod', null, 'good', 2);
        const need = R.day.goals.find((g) => g.type === 'rods');
        if (need && R.rodHits >= need.n && !R.lit) { R.lit = true; G.props.lighthouseOn = true; toast('toast.lit', null, 'good'); A?.fanfare(); addScore(300); }
      } else if (insideIsland(tx, tz) > 0) {
        G.fx.puff(tx, groundAt(tx, tz) + 0.5, tz, 6, [0.5, 0.45, 0.4], 1.2, 1);
        if (G.fire.ignite(tx, tz, 1.3)) R.stats.strikeFires++;
      }
    };
    C.onSplash = (x, y, z, water) => G.fx.splash(x, y, z, water);
    C.onSmogCleared = (c) => { R.smogCleared++; addScore(40, c.x, 13, c.z, 'bonus'); G.fx.puff(c.x, 12, c.z, 8, [0.55, 0.5, 0.55], 2, 1.5); A?.poof(); };
    G.crops.onHarvest = (f, T) => {
      const pts = Math.round(T.score * (0.6 + 0.4 * f.health) / 5) * 5;
      R.harvests++; R.stats.harvests++;
      addScore(pts, f.def.x, f.y + 3, f.def.z, 'gold');
      G.fx.sparkle(f.def.x, f.y + 1, f.def.z, 26, [1.3, 1.0, 0.4], Math.max(f.def.w, f.def.d));
      if (f.type === 'lavender') G.fx.petals(f.def.x, f.y + 1, f.def.z, 14, [0.75, 0.6, 1]);
      G.village.cheer(f.def.x, f.def.z);
      A?.harvest();
    };
    G.crops.onWither = (f) => { R.stats.withered++; addScore(R.day.free ? 0 : -80, f.def.x, f.y + 3, f.def.z); toast('toast.wither', { crop: t('crop.' + f.type) }, 'bad'); A?.sad(); };
    G.fire.onHouseFire = (h) => { toast('toast.house', null, 'bad', 4); A?.bell(); };
    G.fire.onHouseSaved = (h) => { addScore(100, h.x, h.y + 4, h.z, 'bonus'); toast('toast.saved', null, 'good'); A?.chime(); };
    G.fire.onHouseLost = (h) => { R.housesLost++; addScore(R.day.free ? 0 : -250, h.x, h.y + 4, h.z); toast('toast.lost', null, 'bad'); G.village.houseLost(h); A?.sad(); };
    G.fire.onDoused = (n) => { R.dousePending += n; R.stats.doused += n; };
    G.weather.onRainbow = (r) => { R.stats.rainbows++; addScore(60, r.x, 12, r.z, 'rainbow'); G.fx.sparkle(r.x, 10, r.z, 30, [1.2, 1.1, 1.3], 6); toast('toast.rainbow', null, 'good'); A?.rainbow(); };
    G.sprite.onGust = (gx, gz, hits) => {
      A?.gust();
      R.stats.gusts++;
      const s = S();
      for (let i = 0; i < 14; i++) {
        const a = Math.atan2(gz, gx) + rand(-0.5, 0.5), d = rand(0.5, 4);
        G.fx.streak(s.x + Math.cos(a) * d, 13.6 + rand(-1.5, 1.5), s.z + Math.sin(a) * d, Math.cos(a), Math.sin(a), rand(22, 34), rand(0.35, 0.6));
      }
      if (R.tut === 4 && hits) tutNext();
    };
  }

  const fairActive = () => R.day?.fair && G.dayT >= R.day.fair.from && G.dayT <= R.day.fair.to;

  // ---------------------------------------------------------------- tutorial (Monday)
  const TUT = ['tut.move', 'tut.push', 'tut.draw', 'tut.rain', 'tut.gust', 'tut.goal'];
  function tutNext() {
    R.tut++; R.tutT = 0;
    // each step watches for something new, not for what already happened earlier in the day
    if (R.tut === 2) { R.tutMerges = R.stats.drawMerges; R.tutWater = R.stats.fieldWater; }
    if (R.tut >= TUT.length) { R.tut = -1; G.hud.tip(null); return; }
    G.hud.tip(t(TUT[R.tut]), R.tut);
    G.audio?.chime(0.5);
  }
  function tutUpdate(dt) {
    if (R.tut < 0) return;
    R.tutT += dt;
    const s = S();
    if (R.tut === 0) { R.tutDist += s.speed * dt; if (R.tutDist > 30 && R.tutT > 2) tutNext(); }
    else if (R.tut === 1) {
      for (const c of G.clouds.list) if (Math.hypot(c.x - s.x, c.z - s.z) < c.R + 3.4 && s.speed > 4) R.tutPush += dt;
      if (R.tutPush > 0.8 && R.tutT > 2) tutNext();
    } else if (R.tut === 2) { if (R.stats.drawMerges > R.tutMerges && R.tutT > 2) tutNext(); }
    else if (R.tut === 3) { if (R.stats.fieldWater - R.tutWater > 0.6 && R.tutT > 1) tutNext(); }
    else if (R.tut === 4) { if (R.tutT > 14) tutNext(); }
    else if (R.tut === 5) { if (R.tutT > 9) tutNext(); }
  }

  // ---------------------------------------------------------------- setup
  function setupWorld(day, idx) {
    R.day = day; R.idx = idx; G.day = day;
    R.score = 0; R.harvests = 0; R.housesLost = 0; R.rodHits = 0; R.smogCleared = 0; R.fairJoy = 1; R.gauge = 0; R.gaugeDone = false; R.great = 0; R.lit = false;
    R.ended = false; R.dusk = 0; R.fairWasOn = false; R.festWasOn = false; R.lastToast = {}; R.dousePending = 0; R.greatBow = false; R.tut = -1;
    R.stats = { merges: 0, drawMerges: 0, harvests: 0, fieldWater: 0, bullseyes: 0, rainbows: 0, doused: 0, withered: 0, gusts: 0, maxCloud: 0, strikeFires: 0 };
    R.windPhase = Math.random() * 10;
    G.dayT = 0;
    G.clouds.clear(); G.weather.clear(); G.fx.clear();
    const M = day.moisture;
    G.climate.reset(M.base, M.spread, idx + 3);
    if (M.forest !== undefined) {
      const tf = G.props.trees.fuel;
      for (let k = 0; k < tf.length; k++) if (tf[k] > 0.3) G.climate.moist[k] = Math.max(G.climate.floor[k], M.forest + Math.random() * 0.06);
    }
    G.fire.reset();
    G.props.trees.reset();
    G.props.lighthouseOn = false;
    for (const tip of G.props.tips) tip.mesh.visible = true;
    const plan = day.crops.slice();
    G.crops.setup(plan);
    for (const f of G.crops.fields) {
      f.growth = f.gv = day.startGrowth * (0.7 + Math.random() * 0.6);
      const m0 = day.fieldStart ?? 0.55;
      for (const k of f.cells) G.climate.moist[k] = Math.max(G.climate.moist[k], m0 + (Math.random() - 0.5) * 0.08);
    }
    G.village.setup(day);
    for (const [x, z, m] of day.startClouds) G.clouds.spawn(x, z, m, 'water', { instant: true });
    R.spawn = { lake: rand(1, 3), tarn: rand(2, 5), sea: rand(2, 5) };
    R.fireT = day.fire ? day.fire.first : 0;
    R.smogT = day.smog ? day.smog.first : 0;
    windUpdate(0, true);
    G.climate.upload();
    S().reset(2, 6);
  }

  function windUpdate(dt, snap) {
    const W = R.day.wind;
    R.windPhase += dt;
    const p = R.windPhase;
    const ang = deg(W.angle) + W.wander * (Math.sin(p * 0.045) + 0.5 * Math.sin(p * 0.13 + 1.3));
    const sp = W.speed * (0.85 + 0.2 * Math.sin(p * 0.07 + 0.4) + 0.1 * Math.sin(p * 0.23));
    G.wind.angle = ang;
    G.wind.x = Math.cos(ang); G.wind.z = Math.sin(ang);
    G.wind.speed = snap ? sp : damp(G.wind.speed, sp, 1, dt);
  }

  // ---------------------------------------------------------------- spawning
  function spawnUpdate(dt) {
    const day = R.day, C = G.clouds;
    const sun = G.sun01;
    const room = C.list.filter((c) => c.kind === 'water').length < day.maxClouds;
    for (const key of ['lake', 'tarn']) {
      const iv = day.lakes[key];
      if (!iv) continue;
      R.spawn[key] -= dt * (0.45 + 0.55 * sun);
      if (R.spawn[key] <= 0) {
        R.spawn[key] = iv * rand(0.8, 1.2);
        if (!room) continue;
        const L = LAYOUT[key];
        const a = Math.random() * TAU, r = Math.random() * L.r * 0.5;
        const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
        C.spawn(x, z, rand(0.95, 1.2), 'water');
        G.fx.steam(x, L.level + 0.3, z, 10);
      }
    }
    if (day.sea.interval) {
      R.spawn.sea -= dt;
      if (R.spawn.sea <= 0) {
        R.spawn.sea = day.sea.interval * rand(0.8, 1.25);
        if (room) {
          const up = Math.atan2(-G.wind.z, -G.wind.x) + rand(-0.85, 0.85);
          C.spawn(Math.cos(up) * 60, Math.sin(up) * 60, rand(day.sea.mass[0], day.sea.mass[1]), 'water');
        }
      }
    }
    if (day.fire && !R.great) {
      R.fireT -= dt;
      if (R.fireT <= 0) {
        R.fireT = day.fire.interval * rand(0.8, 1.2);
        const at = G.fire.spontaneous(day.fire.area);
        if (at) { toast('toast.fire', null, 'bad', 8); G.audio?.bell(); }
      }
    }
    if (day.smog) {
      R.smogT -= dt;
      if (R.smogT <= 0) {
        R.smogT = day.smog.interval * rand(0.85, 1.15) / (0.6 + 0.4 * sun);
        const p = G.props.chimneyTop;
        if (C.list.filter((c) => c.kind === 'smog').length < 7) {
          C.spawn(p.x, p.z, rand(0.9, 1.3), 'smog');
          for (let i = 0; i < 4; i++) G.fx.smoke(p.x, p.y, p.z, 0.9, 1.6);
        }
      }
    }
  }

  // ---------------------------------------------------------------- the finale's great rain
  function greatRain() {
    R.great = 0.001;
    toast('toast.great', null, 'good');
    G.audio?.fanfare();
    G.audio?.thunder(1);
    G.hud.flashTitle(t('toast.great'));
  }
  function greatUpdate(dt) {
    if (!R.great) return;
    R.great += dt;
    const g = R.great;
    // every cloud swells and pours; the whole island drinks
    if (g < 9) {
      if (Math.random() < dt * 5) {
        const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 40;
        if (G.clouds.list.length < 34) G.clouds.spawn(Math.cos(a) * r, Math.sin(a) * r, rand(3.2, 4.5), 'water');
      }
      for (const c of G.clouds.list) if (c.kind !== 'smog') c.mass = Math.max(c.mass, 3.2);
      const C = G.climate;
      for (let k = 0; k < C.moist.length; k++) C.moist[k] = Math.min(1.1, C.moist[k] + dt * 0.12);
      for (const k of G.fire.active) C.moist[k] = 1;
    }
    if (g > 9 && !R.greatBow) {
      R.greatBow = true;
      for (const f of G.crops.fields) if (f.active && !f.dead) f.growth = Math.max(f.growth, 0.999);
      G.weather.rainbow(0, 4, 4.2);
      G.audio?.rainbow();
    }
  }

  // ---------------------------------------------------------------- per frame
  function update(dt) {
    if (R.state !== 'playing' && R.state !== 'dusk' && R.state !== 'intro' && R.state !== 'attract') return;
    const day = R.day;
    windUpdate(dt);
    if (R.state === 'intro') return;
    if (R.state === 'attract') { spawnUpdate(dt); return; }
    // clock (slower while the tutorial is still teaching the basics)
    if (R.state === 'playing') {
      let rate = 1 / day.duration;
      if (day.free) rate *= 0.35;
      G.pace = R.tut >= 0 && R.tut < 4 ? 0.25 : 1;
      rate *= G.pace;
      G.dayT += dt * rate;
      if (day.free && G.dayT > 0.92) G.dayT = 0.08;
      tutUpdate(dt);
      spawnUpdate(dt);
      // fair and festival bookkeeping
      if (day.fair) {
        const on = fairActive();
        G.village.fairOn = on;
        if (on && !R.fairWasOn) { toast(day.fair.wantsRain ? 'toast.festival' : 'toast.fairStart', null, 'info'); G.audio?.fanfare(0.6); }
        if (!on && R.fairWasOn && !day.fair.wantsRain) toast('toast.fairEnd', null, 'info');
        R.fairWasOn = on;
        if (on && !day.fair.wantsRain) R.fairJoy = Math.min(1, R.fairJoy + dt * 0.006);
      }
      if (day.gauge && !R.gaugeDone && R.gauge >= day.gauge.need) { R.gaugeDone = true; toast('toast.gauge', null, 'good'); addScore(500); greatRain(); }
      greatUpdate(dt);
      // doused fire cells pay out in batches
      R.douseT -= dt;
      if (R.douseT <= 0 && R.dousePending) {
        R.douseT = 0.6;
        const c = G.fire.clusters[0];
        addScore(R.dousePending * 6, c ? c.x : undefined, 6, c ? c.z : undefined, 'bonus');
        R.dousePending = 0;
      }
      if (G.dayT >= 1 && !day.free) { G.dayT = 1; R.state = 'dusk'; R.dusk = 0; S().active = false; G.audio?.dusk(); }
    } else if (R.state === 'dusk') {
      R.dusk += dt;
      if (R.dusk > 2.2 && !R.ended) { R.ended = true; finish(); }
    }
  }

  function goalsStatus() {
    const day = R.day;
    return day.goals.map((g) => {
      let done = false, prog = 0, label = '';
      if (g.type === 'harvest') { prog = Math.min(1, R.harvests / g.n); done = R.harvests >= g.n; label = t('goal.harvest', { n: g.n }); return { g, done, prog, label, count: `${Math.min(R.harvests, g.n)}/${g.n}` }; }
      if (g.type === 'houses') { done = R.housesLost <= g.max; label = t('goal.houses'); return { g, done, prog: done ? 1 : 0, label, count: '', failed: !done }; }
      if (g.type === 'fair') { done = R.fairJoy >= g.min; label = t('goal.fair', { p: Math.round(g.min * 100) }); return { g, done, prog: R.fairJoy, label, count: Math.round(R.fairJoy * 100) + '%' }; }
      if (g.type === 'rods') { done = R.rodHits >= g.n; label = t('goal.rods', { n: g.n }); return { g, done, prog: Math.min(1, R.rodHits / g.n), label, count: `${Math.min(R.rodHits, g.n)}/${g.n}` }; }
      if (g.type === 'smog') { done = R.smogCleared >= g.n; label = t('goal.smog', { n: g.n }); return { g, done, prog: Math.min(1, R.smogCleared / g.n), label, count: `${Math.min(R.smogCleared, g.n)}/${g.n}` }; }
      if (g.type === 'gauge') { done = R.gaugeDone || R.gauge >= day.gauge.need; label = t('goal.gauge'); const p = Math.min(1, R.gauge / day.gauge.need); return { g, done, prog: p, label, count: Math.round(p * 100) + '%' }; }
      return { g, done, prog, label, count: '' };
    });
  }

  function finish() {
    const day = R.day;
    // fires put out in the last moments still pay
    if (R.dousePending) { R.score += R.dousePending * 6; R.dousePending = 0; }
    // end-of-day bonuses
    let land = 0, sum = 0;
    const C = G.climate;
    for (let k = 0; k < C.moist.length; k++) if (!masks.water[k] && masks.ground[k] > 0.4 && masks.ground[k] < 12) { land++; sum += Math.min(1, C.moist[k]); }
    const green = Math.round((sum / Math.max(1, land)) * 300);
    const fairBonus = day.fair && !day.fair.wantsRain ? Math.round(R.fairJoy * 400) : 0;
    R.score += green + fairBonus;
    const goals = goalsStatus();
    const pass = goals.every((g) => g.done);
    let stars = 0;
    if (pass) { stars = 1; if (R.score >= day.stars[0]) stars = 2; if (R.score >= day.stars[1]) stars = 3; }
    const P = G.progress;
    let best = false;
    if (R.idx >= 0) {
      if (pass) P.unlocked = Math.max(P.unlocked, Math.min(DAYS.length, R.idx + 2));
      P.stars[R.idx] = Math.max(P.stars[R.idx], stars);
      if (R.score > P.best[R.idx]) { P.best[R.idx] = R.score; best = true; }
      G.saveProgress?.();
    }
    R.state = 'results';
    G.onDayEnd?.({ pass, stars, score: R.score, goals, green, fairBonus, best, stats: R.stats, finale: !!day.finale && pass, idx: R.idx });
  }

  const api = {
    R, wire, goalsStatus, fairActive,
    begin(idx) {
      const day = idx === 'free' ? FREE : DAYS[idx];
      setupWorld(day, idx === 'free' ? -1 : idx);
      R.state = 'intro';
      S().active = false; G.pace = 1;
    },
    play() {
      R.state = 'playing';
      S().active = true;
      R.tut = -1;
      if (R.day.tutorial && !G.test && !G.progress.stars[0]) { R.tut = -1; R.tutDist = 0; R.tutPush = 0; tutNext(); }
    },
    // the title screen's living backdrop
    attract() {
      const day = { ...FREE, key: 'attract', wind: { angle: 15, speed: 0.6, wander: 0.4 }, maxClouds: 14, fire: null };
      setupWorld(day, -1);
      G.dayT = 0.32;
      R.state = 'attract';
      S().active = false;
    },
    stop() { R.state = 'idle'; G.hud?.tip(null); },
    // show the current tutorial tip again (after the HUD is rebuilt for a language change)
    retip() { if (R.tut >= 0 && R.state === 'playing') G.hud.tip(t(TUT[R.tut]), R.tut); },
    update,
  };
  return api;
}
