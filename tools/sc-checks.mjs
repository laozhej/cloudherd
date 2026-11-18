export default async function ({ page, shot, sleep, ev }) {
  await sleep(1200);
  // audio: unlock with a click, then fire every effect
  await page.mouse.click(5, 5);
  await sleep(300);
  const audio = await ev(() => {
    const A = window.__ch.G.audio; const out = { ready: A.ready };
    try { for (const k of ['gust', 'merge', 'swell', 'rainStart', 'thunder', 'rumble', 'harvest', 'chime', 'rainbow', 'bell', 'sad', 'poof', 'fanfare', 'click', 'dusk']) A[k](3); A.star(1); out.ok = true; } catch (e) { out.err = String(e); }
    return out;
  });
  console.log('audio', JSON.stringify(audio));
  // perf: a busy day, measure real frame times for 4 s
  await ev(() => { window.__ch.startDay(6); window.__ch.skip(40); const C = window.__ch.G.clouds; for (let i = 0; i < 6; i++) C.spawn(-30 + i * 10, 10, 4, 'water', { instant: true }); window.__ch.G.fire.ignite(24, -20, 3); window.__ch.G.bot.start(); });
  const perf = await ev(() => new Promise((res) => {
    const ts = []; let last = performance.now(); const t0 = last;
    const f = (now) => { ts.push(now - last); last = now; if (now - t0 < 4000) requestAnimationFrame(f); else res(ts); };
    requestAnimationFrame(f);
  }));
  perf.sort((a, b) => a - b);
  const avg = perf.reduce((a, b) => a + b, 0) / perf.length;
  console.log('frames', perf.length, 'avg ms', avg.toFixed(2), 'p50', perf[perf.length >> 1].toFixed(2), 'p95', perf[Math.floor(perf.length * 0.95)].toFixed(2));
  // cpu cost of one simulation step
  const stepMs = await ev(() => { const t = performance.now(); window.__ch.skip(2); return (performance.now() - t) / 60; });
  console.log('sim step ms', stepMs.toFixed(2));
  const info = await ev(() => { const r = window.__ch.G.renderer; const calls = []; const old = r.render.bind(r); let c = 0, tri = 0; r.info.autoReset = false; r.info.reset(); return new Promise((res) => requestAnimationFrame(() => { requestAnimationFrame(() => { const i = r.info.render; res({ calls: i.calls, tris: i.triangles }); r.info.autoReset = true; }); })); });
  console.log('per frame (all passes)', JSON.stringify(info));
  await ev(() => window.__ch.G.bot.stop());
  // progress: finishing Monday unlocks Tuesday
  const prog = await ev(() => { const { G } = window.__ch; G.progress = { unlocked: 1, stars: [0, 0, 0, 0, 0, 0, 0], best: [0, 0, 0, 0, 0, 0, 0] }; const r = window.__ch.botDay(0); return { r: r && { pass: r.pass, stars: r.stars }, progress: G.progress, mode: G.mode }; });
  console.log('progress', JSON.stringify(prog));
  await sleep(2500); await shot('chk-results');
  await ev(() => window.__ch.G.hud.on.next()); await sleep(600); await shot('chk-next');
  console.log('after next:', await ev(() => ({ mode: window.__ch.G.mode, day: window.__ch.G.game.R.day.key })));
}
