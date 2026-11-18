// All sound is synthesised: sea and wind beds, rain that follows how much is falling,
// birds by day and crickets at dusk, one-shot effects, and a small generative tune.
import { G } from './state.js';
import { clamp, rand, pick } from './util.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function createAudio() {
  let ctx = null, master, comp, music, sfx, amb, noise, brown;
  const beds = {};
  let musicTimer = null, nextNote = 0, step = 0, bar = 0, birdT = 2, crackT = 0;
  const A = { ready: false };

  function makeNoise(type) {
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  function loop(buf, ...chain) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    let n = s; for (const c of chain) { n.connect(c); n = c; }
    s.start(ctx.currentTime + Math.random() * 0.1, Math.random() * 2);
    return s;
  }
  const g = (v = 0) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const filt = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };

  A.init = () => {
    if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = g(G.settings.volume);
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    music = g(G.settings.music * 0.55); music.connect(master);
    sfx = g(0.9); sfx.connect(master);
    amb = g(0.8); amb.connect(master);
    noise = makeNoise('white'); brown = makeNoise('brown');
    // sea: slow swells of filtered noise
    beds.sea = g(0.05); beds.seaF = filt('lowpass', 420);
    loop(brown, beds.seaF, beds.sea, amb);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09; const lg = g(0.03); lfo.connect(lg); lg.connect(beds.sea.gain); lfo.start();
    // wind around the spirit
    beds.windF = filt('bandpass', 500, 0.9); beds.wind = g(0.0);
    loop(noise, beds.windF, beds.wind, amb);
    // rain
    beds.rainF1 = filt('highpass', 900); beds.rainF2 = filt('lowpass', 6500); beds.rain = g(0);
    loop(noise, beds.rainF1, beds.rainF2, beds.rain, amb);
    // fire
    beds.fireF = filt('bandpass', 1800, 0.6); beds.fire = g(0);
    loop(noise, beds.fireF, beds.fire, amb);
    A.ready = true;
    nextNote = ctx.currentTime + 0.3;
    musicTimer = setInterval(schedule, 40);
  };
  A.setVolume = () => { if (master) master.gain.setTargetAtTime(G.settings.volume, ctx.currentTime, 0.05); if (music) music.gain.setTargetAtTime(G.settings.music * 0.55, ctx.currentTime, 0.1); };
  A.suspend = (yes) => { if (!ctx) return; if (yes) ctx.suspend(); else ctx.resume(); };

  // ---------------------------------------------------------------- per-frame beds
  let rainLvl = 0;
  A.update = (dt) => {
    if (!A.ready) return;
    const t = ctx.currentTime, S = G.sprite;
    const sp = S && (S.active || S.showIdle) ? S.speed : 0;
    beds.wind.gain.setTargetAtTime(0.012 + Math.min(sp, 30) * 0.0028 + (S?.drawing ? 0.03 : 0) + G.wind.speed * 0.012, t, 0.15);
    beds.windF.frequency.setTargetAtTime(380 + sp * 22 + (S?.drawing ? 300 : 0), t, 0.2);
    const st = G.clouds ? G.clouds.stats() : { raining: 0 };
    rainLvl += ((Math.min(1, st.raining * 0.35 + (st.drops > 0 ? 0.1 : 0))) - rainLvl) * Math.min(1, dt * 2);
    beds.rain.gain.setTargetAtTime(rainLvl * 0.16, t, 0.2);
    const burning = G.fire ? G.fire.burning() : 0;
    beds.fire.gain.setTargetAtTime(Math.min(0.09, burning * 0.0025), t, 0.3);
    // crackles
    crackT -= dt;
    if (burning > 0 && crackT <= 0) { crackT = rand(0.03, 0.18) / Math.min(3, 0.5 + burning * 0.05); crackle(Math.min(1, burning / 30)); }
    // birds in the morning and midday, crickets toward dusk
    birdT -= dt;
    if (birdT <= 0 && G.mode !== 'boot') {
      const d = G.dayT;
      if (d > 0.8) { birdT = rand(0.4, 1.2); cricket(); }
      else { birdT = rand(1.5, 5) * (d < 0.35 ? 0.6 : 1.2); if (rainLvl < 0.3) bird(); }
    }
  };

  // ---------------------------------------------------------------- voices
  function env(node, t, a, peak, d, sus = 0) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + d);
  }
  function tone(freq, t, dur, vol, type = 'sine', dest = sfx, attack = 0.005) {
    const o = ctx.createOscillator(), n = g(); o.type = type; o.frequency.value = freq;
    o.connect(n); n.connect(dest); env(n, t, attack, vol, dur); o.start(t); o.stop(t + attack + dur + 0.05);
    return o;
  }
  function pluck(freq, t, vol, dest = music) {
    // a soft kalimba: sine plus a quickly fading overtone
    tone(freq, t, 0.9, vol, 'sine', dest, 0.004);
    tone(freq * 2.01, t, 0.25, vol * 0.35, 'sine', dest, 0.002);
    tone(freq * 3.98, t, 0.08, vol * 0.12, 'triangle', dest, 0.001);
  }
  function noiseBurst(t, dur, vol, type, f, q = 1, dest = sfx, f2) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const fl = filt(type, f, q); const n = g();
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    s.connect(fl); fl.connect(n); n.connect(dest);
    env(n, t, Math.min(0.03, dur * 0.2), vol, dur);
    s.start(t, Math.random() * 2); s.stop(t + dur + 0.1);
  }
  function crackle(k) { const t = ctx.currentTime; noiseBurst(t, 0.02 + Math.random() * 0.03, 0.05 + 0.08 * k * Math.random(), 'bandpass', rand(1500, 4000), 2, amb); }
  function bird() {
    const t = ctx.currentTime + 0.05, base = rand(2400, 3800), n = (Math.random() * 4 + 2) | 0;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), v = g(); o.type = 'sine';
      const s = t + i * rand(0.07, 0.13);
      o.frequency.setValueAtTime(base * rand(0.9, 1.1), s);
      o.frequency.exponentialRampToValueAtTime(base * rand(1.2, 1.6), s + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * rand(0.8, 1), s + 0.09);
      o.connect(v); v.connect(amb); env(v, s, 0.01, 0.018, 0.09); o.start(s); o.stop(s + 0.14);
    }
  }
  function cricket() {
    const t = ctx.currentTime, f = rand(4200, 4800);
    for (let i = 0; i < 3; i++) tone(f, t + i * 0.045, 0.03, 0.008, 'sine', amb, 0.003);
  }

  // ---------------------------------------------------------------- effects
  const ok = () => A.ready && ctx.state === 'running';
  A.gust = () => { if (!ok()) return; const t = ctx.currentTime; noiseBurst(t, 0.45, 0.22, 'bandpass', 320, 1.2, sfx, 1600); noiseBurst(t + 0.05, 0.3, 0.08, 'highpass', 2500, 0.7); };
  A.merge = (mass) => {
    if (!ok()) return; const t = ctx.currentTime, f = clamp(560 - mass * 32, 180, 560);
    const o = ctx.createOscillator(), v = g(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    o.connect(v); v.connect(sfx); env(v, t, 0.01, 0.2, 0.28); o.start(t); o.stop(t + 0.35);
    tone(f * 2, t + 0.06, 0.15, 0.06);
    noiseBurst(t, 0.25, 0.05, 'lowpass', 800);
  };
  A.swell = () => { if (!ok()) return; const t = ctx.currentTime; tone(70, t, 0.9, 0.08, 'sine', sfx, 0.4); noiseBurst(t, 0.8, 0.03, 'lowpass', 300); };
  A.rainStart = () => { if (!ok()) return; noiseBurst(ctx.currentTime, 0.7, 0.05, 'highpass', 1500, 0.7); };
  A.thunder = (k = 1) => {
    if (!ok()) return; const t = ctx.currentTime;
    noiseBurst(t, 0.18, 0.5 * k, 'highpass', 1200, 0.6);
    const s = ctx.createBufferSource(); s.buffer = brown;
    const lp = filt('lowpass', 160), v = g(); s.connect(lp); lp.connect(v); v.connect(sfx);
    v.gain.setValueAtTime(0.0001, t + 0.05); v.gain.exponentialRampToValueAtTime(0.9 * k, t + 0.25);
    v.gain.exponentialRampToValueAtTime(0.35 * k, t + 0.9); v.gain.exponentialRampToValueAtTime(0.5 * k, t + 1.3); v.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    s.start(t, Math.random() * 1.5); s.stop(t + 3.4);
  };
  A.rumble = () => { if (!ok()) return; const t = ctx.currentTime; const s = ctx.createBufferSource(); s.buffer = brown; const lp = filt('lowpass', 110), v = g(); s.connect(lp); lp.connect(v); v.connect(sfx); env(v, t, 0.6, 0.35, 2.2); s.start(t, Math.random()); s.stop(t + 3); };
  const PENTA = [0, 2, 4, 7, 9];
  A.harvest = () => { if (!ok()) return; const t = ctx.currentTime; [72, 76, 79, 84].forEach((n, i) => pluck(midi(n), t + i * 0.07, 0.16, sfx)); };
  A.chime = (k = 1) => { if (!ok()) return; const t = ctx.currentTime; pluck(midi(88), t, 0.09 * k, sfx); pluck(midi(91), t + 0.09, 0.08 * k, sfx); };
  A.rainbow = () => { if (!ok()) return; const t = ctx.currentTime; [0, 2, 4, 7, 9, 12, 14, 16].forEach((d, i) => pluck(midi(76 + d), t + i * 0.055, 0.1, sfx)); };
  A.bell = () => { if (!ok()) return; const t = ctx.currentTime; for (let i = 0; i < 2; i++) { tone(1320, t + i * 0.22, 0.5, 0.07, 'sine'); tone(1320 * 2.76, t + i * 0.22, 0.2, 0.025, 'sine'); } };
  A.sad = () => { if (!ok()) return; const t = ctx.currentTime; pluck(midi(64), t, 0.1, sfx); pluck(midi(60), t + 0.16, 0.1, sfx); };
  A.poof = () => { if (!ok()) return; noiseBurst(ctx.currentTime, 0.35, 0.12, 'lowpass', 600, 0.8); };
  A.fanfare = (k = 1) => { if (!ok()) return; const t = ctx.currentTime; [67, 72, 76, 79].forEach((n, i) => pluck(midi(n), t + i * 0.09, 0.14 * k, sfx)); [72, 76, 79].forEach((n) => tone(midi(n), t + 0.4, 1.2, 0.035 * k, 'triangle', sfx, 0.05)); };
  A.star = (i) => { if (!ok()) return; pluck(midi(84 + i * 4), ctx.currentTime, 0.16, sfx); };
  A.click = () => { if (!ok()) return; tone(1800, ctx.currentTime, 0.03, 0.03, 'triangle'); };
  A.dusk = () => { if (!ok()) return; const t = ctx.currentTime; [60, 64, 67, 71].forEach((n, i) => tone(midi(n), t + i * 0.12, 2.2, 0.03, 'triangle', music, 0.3)); };

  // ---------------------------------------------------------------- music
  // F major, I-vi-IV-V, two bars each; a kalimba melody wanders the pentatonic over a soft pad
  const CHORDS = [[53, 57, 60], [50, 53, 57], [46, 50, 53], [48, 52, 55]];
  const SCALE = [65, 67, 69, 72, 74, 77, 79, 81, 84];
  let mel = 4;
  function pad(notes, t, dur) {
    for (const n of notes) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = filt('lowpass', 900), v = g();
      o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = midi(n); o2.frequency.value = midi(n) * 1.003;
      o.connect(lp); o2.connect(lp); lp.connect(v); v.connect(music);
      v.gain.setValueAtTime(0.0001, t); v.gain.linearRampToValueAtTime(0.02, t + 1.2); v.gain.setValueAtTime(0.02, t + dur - 0.8); v.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
      o.start(t); o2.start(t); o.stop(t + dur + 0.7); o2.stop(t + dur + 0.7);
    }
  }
  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const spb = 60 / 82, s16 = spb / 4;
    while (nextNote < ctx.currentTime + 0.2) {
      const t = nextNote;
      const chord = CHORDS[Math.floor(bar / 2) % 4];
      const inBar = step % 16;
      if (inBar === 0 && bar % 2 === 0) pad(chord, t, spb * 8);
      if (inBar === 0 || inBar === 8) tone(midi(chord[0] - 12), t, spb * 1.6, 0.06, 'sine', music, 0.02);
      // melody on eighths, sparse, leaning on chord tones
      const busy = G.mode === 'playing' ? 0.5 : 0.36;
      if (inBar % 2 === 0 && Math.random() < busy) {
        mel = clamp(mel + pick([-2, -1, -1, 0, 1, 1, 2]), 0, SCALE.length - 1);
        let n = SCALE[mel];
        if (inBar === 0) { const ct = chord.map((c) => c + 12).concat(chord.map((c) => c + 24)); n = ct.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a)); }
        const dusk = G.dayT > 0.82 ? -12 : 0;
        pluck(midi(n + dusk), t + (Math.random() - 0.5) * 0.01, 0.085);
        if (Math.random() < 0.15) pluck(midi(n + dusk + 12), t + s16, 0.03);
      }
      step++; if (step % 16 === 0) bar++;
      nextNote += s16;
    }
  }
  return A;
}
