// Lightning rods: the bolt markers on rod days (Friday, Free Sky) and nowhere else, a held thunderhead
// charging the rod below it, the catch rate, the rod-day storm toast and Friday's intro text.
// node tools/shot.mjs tools/sc-rods.mjs     (--lang=zh checks the Chinese intro card only)
export default async function ({ ev, sleep, shot, args }) {
  const zh = args.lang === 'zh';
  const fail = [];
  const expect = (ok, msg) => { if (!ok) fail.push(msg); console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
  const state = () => ev(() => {
    const { G } = window.__ch;
    return {
      day: G.game.R.day?.key, rodHits: G.game.R.rodHits,
      tips: G.props.tips.map((t) => ({ live: !!t.live, near: !!t.near, scale: +t.mesh.scale.x.toFixed(2) })),
      marks: [...document.querySelectorAll('.rodmk')].map((m) => ({ op: m.parentElement.style.opacity, near: m.classList.contains('near') })),
      toasts: [...document.querySelectorAll('#toasts > *')].map((e) => e.textContent),
    };
  });
  await sleep(1200);

  // Friday's intro card names the marked rods and no longer asks for seven clouds
  await ev(() => window.__ch.toWeek()); await sleep(500);
  await ev(() => window.__ch.G.hud.on.pick(4)); await sleep(900);
  await shot(zh ? 'rods-intro-zh' : 'rods-intro');
  const intro = await ev(() => document.getElementById('panel').textContent);
  expect(zh ? intro.includes('三根避雷针') && !intro.includes('七朵') : intro.includes('marked with a bolt') && !/seven/i.test(intro), 'Friday intro names the marked rods and drops "seven"');
  if (zh) { console.log(fail.length ? 'FAILURES ' + JSON.stringify(fail) : 'ALL ROD CHECKS PASSED'); return; }

  // Friday: three live rods, three markers, none charged
  await ev(() => { const { G } = window.__ch; window.__ch.startDay(4); window.__ch.skip(20); G.sprite.reset(2, 30); });
  await sleep(1500);
  let s = await state();
  expect(s.day === 'd5' && s.tips.every((t) => t.live && !t.near), 'Friday: three rods live, none charged');
  expect(s.marks.length === 3 && s.marks.every((m) => m.op === '1' && !m.near), 'Friday: three markers showing');

  // a thunderhead held over rod 1 charges that rod and its marker only, and the rod catches its bolts
  await ev(() => {
    const { G } = window.__ch;
    for (const c of [...G.clouds.list]) if (Math.hypot(c.x - 14, c.z + 8) < 25) c.x -= 40;
    G.sprite.reset(14, -7);
    G.clouds.spawn(14, -7, 8, 'water', { instant: true });
    G.sprite.autopilot = { tx: 14, tz: -7, draw: true };
    window.__ch.skip(0.5);
  });
  s = await state();
  expect(s.tips[0].near && s.marks[0].near, 'held thunderhead: rod 1 and its marker charged');
  expect(!s.tips[1].near && !s.tips[2].near && !s.marks[1].near && !s.marks[2].near, 'held thunderhead: rods 2 and 3 not charged');
  await ev(() => { window.__ch.G.timeScale = 0.0001; }); await sleep(700);
  await shot('rods-charged');
  await ev(() => { window.__ch.G.timeScale = 1; });
  const before = s.rodHits;
  const strikes = await ev(() => {
    const { G } = window.__ch; let n = 0; const o = G.clouds.onStrike;
    G.clouds.onStrike = (c) => { n++; o(c); };
    window.__ch.skip(80);
    G.clouds.onStrike = o; G.sprite.autopilot = null;
    return n;
  });
  s = await state();
  const hits = s.rodHits - before;
  console.log(`     held over rod 1 for 80 s: ${strikes} bolts, ${hits} caught (${Math.round((100 * hits) / Math.max(1, strikes))}%, by design 80%)`);
  expect(strikes >= 12 && hits >= strikes * 0.5, 'the rod catches most of the bolts');

  // a thunderhead forming on a rod day gets the rod toast
  await ev(() => {
    const { G } = window.__ch;
    G.game.R.lastToast = {};
    G.clouds.spawn(-20, 26, 4, 'water', { instant: true });
    G.clouds.spawn(-19, 26, 3.6, 'water', { instant: true });
    G.forceMerge = true; window.__ch.skip(1.5); G.forceMerge = false;
  });
  s = await state();
  expect(s.toasts.some((t) => t.includes('Hold it over a lightning rod')), 'rod day: the storm toast points at the rods');

  // Tuesday: rods idle, markers hidden
  await ev(() => { window.__ch.startDay(1); window.__ch.skip(3); }); await sleep(800);
  s = await state();
  expect(s.tips.every((t) => !t.live && !t.near && t.scale === 1), 'Tuesday: rods idle');
  expect(s.marks.every((m) => m.op === '0'), 'Tuesday: markers hidden');

  // Free Sky: rods live again
  await ev(() => window.__ch.G.hud.on.free()); await sleep(400);
  await ev(() => { window.__ch.G.hud.on.start(); window.__ch.skip(3); }); await sleep(800);
  s = await state();
  expect(s.day === 'free' && s.tips.every((t) => t.live), 'Free Sky: rods live');
  expect(s.marks.every((m) => m.op === '1'), 'Free Sky: markers showing');

  // the title screen: nothing left charged or glowing
  await ev(() => { window.__ch.toTitle(); window.__ch.skip(0.2); }); await sleep(300);
  s = await state();
  expect(s.tips.every((t) => !t.live && !t.near), 'title: rods idle');
  console.log(fail.length ? 'FAILURES ' + JSON.stringify(fail) : 'ALL ROD CHECKS PASSED');
}
