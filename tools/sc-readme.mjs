// Screenshots for the README: node tools/shot.mjs tools/sc-readme.mjs  (add --lang=zh for the Chinese HUD shot)
import fs from 'node:fs';
export default async function ({ page, sleep, ev, args }) {
  fs.mkdirSync('screenshots', { recursive: true });
  const snap = async (name) => { await page.screenshot({ path: `screenshots/${name}.png` }); console.log('saved', name); };
  await sleep(2500);
  if (args.lang === 'zh') {
    await ev(() => { window.__ch.startDay(3); window.__ch.skip(75); window.__ch.G.sprite.x = 4; window.__ch.G.sprite.z = 4; });
    await sleep(1500); await snap('10-hud-zh'); return;
  }
  await snap('01-title');
  await ev(() => window.__ch.toWeek()); await sleep(800); await snap('02-week');
  // tutorial with a real tip on screen
  await ev(() => { window.__ch.G.test = false; window.__ch.startDay(0); window.__ch.G.test = true; });
  await page.mouse.move(700, 500); await page.mouse.move(830, 430, { steps: 20 }); await sleep(1500); await snap('03-tutorial');
  // carrying clouds while drawing
  await ev(() => { const { G } = window.__ch; window.__ch.startDay(1); window.__ch.skip(20); const f = G.crops.fields[2]; G.clouds.spawn(f.def.x, f.def.z, 4.2, 'water', { instant: true }); window.__ch.skip(3); G.weather.rainbow(-8, 4, 1.25); G.sprite.autopilot = { tx: -26, tz: 2, draw: true }; G.clouds.spawn(-28, 0, 1.2, 'water', { instant: true }); G.clouds.spawn(-24, 5, 1.1, 'water', { instant: true }); G.sprite.x = -26; G.sprite.z = 2; });
  await sleep(1800); await snap('04-rain-rainbow');
  await ev(() => { window.__ch.G.sprite.autopilot = null; });
  await ev(() => { const { G } = window.__ch; window.__ch.startDay(2); window.__ch.skip(20); G.fire.ignite(20, -14, 2); G.fire.ignite(28, -24, 2); window.__ch.skip(16); G.clouds.spawn(23, -17, 4, 'water', { instant: true }); window.__ch.skip(2); G.sprite.x = 14; G.sprite.z = -8; });
  await sleep(1200); await snap('05-fire');
  await ev(() => { const { G } = window.__ch; window.__ch.startDay(3); window.__ch.skip(80); G.sprite.x = 20; G.sprite.z = 22; });
  await sleep(1500); await snap('06-fair');
  await ev(() => { const { G } = window.__ch; window.__ch.startDay(4); window.__ch.skip(30); G.clouds.spawn(12, -5, 9, 'water', { instant: true }); window.__ch.skip(2); G.sprite.x = 4; G.sprite.z = 0; });
  await sleep(1200);
  await ev(() => { const { G } = window.__ch; const c = G.clouds.list.find((c) => c.storm); G.weather.strike(c.x, c.z, 14, -8); G.props.tips[0].glow = 1; G.timeScale = 0.0001; });
  await sleep(60); await snap('07-thunderhead'); await ev(() => { window.__ch.G.timeScale = 1; });
  await ev(() => { const { G } = window.__ch; window.__ch.startDay(5); window.__ch.skip(55); const p = G.props.chimneyTop; G.clouds.spawn(p.x - 6, p.z - 10, 1.2, 'smog', { instant: true }); G.clouds.spawn(p.x - 2, p.z - 17, 3.6, 'acid', { instant: true }); G.sprite.x = p.x - 12; G.sprite.z = p.z - 6; });
  await sleep(2500); await snap('08-smog');
  await ev(() => { const { G } = window.__ch; window.__ch.startDay(6); window.__ch.skip(130); G.game.R.gauge = 99; window.__ch.skip(5); });
  await sleep(1500); await snap('09-great-rain');
}
