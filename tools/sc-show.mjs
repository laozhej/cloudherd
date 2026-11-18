// Stages the game's key moments and screenshots each one.
export default async function ({ page, shot, sleep, ev, args }) {
  await sleep(1200);
  const only = args.only ? args.only.split(',') : null;
  const want = (k) => !only || only.includes(k);
  if (want('week')) { await ev(() => window.__ch.toWeek()); await sleep(700); await shot('s-week'); }
  if (want('tut')) {
    await ev(() => { window.__ch.G.test = false; window.__ch.startDay(0); window.__ch.G.test = true; });
    await page.mouse.move(700, 500); await sleep(400); await page.mouse.move(820, 430, { steps: 20 });
    await sleep(1500); await shot('s-tutorial');
  }
  if (want('rain')) {
    await ev(() => {
      const { G } = window.__ch; window.__ch.startDay(1); window.__ch.skip(40);
      const f = G.crops.fields[2]; G.clouds.spawn(f.def.x, f.def.z, 4.2, 'water', { instant: true });
      const g = G.crops.fields[0]; G.clouds.spawn(g.def.x + 1, g.def.z, 3.4, 'water', { instant: true });
      window.__ch.skip(2.5);
      G.weather.rainbow(-6, 2, 1.2);
      G.sprite.x = -2; G.sprite.z = 8;
    });
    await sleep(1800); await shot('s-rain');
  }
  if (want('fire')) {
    await ev(() => { const { G } = window.__ch; window.__ch.startDay(2); window.__ch.skip(20); G.fire.ignite(20, -14, 2); G.fire.ignite(28, -24, 2); window.__ch.skip(14); const c = G.clouds.spawn(22, -16, 4, 'water', { instant: true }); window.__ch.skip(2); });
    await sleep(1200); await shot('s-fire');
  }
  if (want('fair')) {
    await ev(() => { const { G } = window.__ch; window.__ch.startDay(3); window.__ch.skip(75); G.sprite.x = 20; G.sprite.z = 20; });
    await sleep(1500); await shot('s-fair');
  }
  if (want('storm')) {
    await ev(() => { const { G } = window.__ch; window.__ch.startDay(4); window.__ch.skip(30); const c = G.clouds.spawn(12, -4, 9, 'water', { instant: true }); window.__ch.skip(1.5); c.strikeT = 0.01; });
    await sleep(100); await shot('s-storm');
    await sleep(900); await shot('s-storm2');
  }
  if (want('smog')) {
    await ev(() => { const { G } = window.__ch; window.__ch.startDay(5); window.__ch.skip(50); const p = G.props.chimneyTop; G.clouds.spawn(p.x - 6, p.z - 10, 1.2, 'smog', { instant: true }); G.clouds.spawn(p.x - 4, p.z - 16, 3.5, 'acid', { instant: true }); });
    await sleep(2500); await shot('s-smog');
  }
  if (want('great')) {
    await ev(() => { const { G } = window.__ch; window.__ch.startDay(6); window.__ch.skip(130); G.game.R.gauge = 99; window.__ch.skip(0.2); window.__ch.skip(4); });
    await sleep(800); await shot('s-great');
    await ev(() => window.__ch.skip(7)); await sleep(1200); await shot('s-great2');
  }
  if (want('results')) {
    await ev(() => window.__ch.skip(200)); await sleep(2500); await shot('s-results');
  }
}
