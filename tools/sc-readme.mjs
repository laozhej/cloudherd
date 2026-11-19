// Screenshots for the README: node tools/shot.mjs tools/sc-readme.mjs  (add --lang=zh for the Chinese HUD shot)
import fs from 'node:fs';
export default async function ({ page, sleep, ev, args }) {
  fs.mkdirSync('screenshots', { recursive: true });
  const snap = async (name) => { await page.screenshot({ path: `screenshots/${name}.png` }); console.log('saved', name); };
  const scr = (x, z) => ev((x, z) => { const { G, THREE } = window.__ch; const v = new THREE.Vector3(x, 13.6, z).project(G.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; }, x, z);
  const progress = () => ev(() => { const { G } = window.__ch; Object.assign(G.progress, { unlocked: 5, stars: [3, 3, 2, 2, 0, 0, 0] }); window.__ch.setProfile({ level: 6, xp: 120, dew: 340, owned: { whistle: 2, peg: 1, vane: 1, bell: 1, embrace: 1, swift: 1, breezling: 1 } }); });
  await sleep(2500);
  if (args.lang === 'zh') {
    await progress();
    await ev(() => { window.__ch.startDay(3); window.__ch.skip(75); window.__ch.G.sprite.x = 4; window.__ch.G.sprite.z = 4; });
    await sleep(1500); await snap('10-hud-zh'); return;
  }
  await snap('01-title');
  await progress();
  await ev(() => window.__ch.toWeek()); await sleep(800); await snap('02-week');
  await ev(() => window.__ch.G.hud.on.shop('week')); await sleep(600); await snap('11-shop');
  // tutorial with a real tip on screen
  await ev(() => { window.__ch.G.test = false; window.__ch.G.progress.stars[0] = 0; window.__ch.startDay(0); window.__ch.G.test = true; window.__ch.G.progress.stars[0] = 3; });
  await page.mouse.move(700, 500); await page.mouse.move(830, 430, { steps: 20 }); await sleep(1500); await snap('03-tutorial');
  // gathering: hold the left button over three clouds, with a rainbow behind
  await ev(() => { const { G } = window.__ch; window.__ch.startDay(1); window.__ch.skip(20); G.weather.rainbow(4, 22, 1.25); G.clouds.spawn(-14, 0, 1.1, 'water', { instant: true }); G.clouds.spawn(-6, 4, 1.2, 'water', { instant: true }); });
  await sleep(600);
  let p = await scr(-14, 0); await page.mouse.move(p[0], p[1], { steps: 6 }); await sleep(250);
  await page.mouse.down({ button: 'left' });
  p = await scr(-6, 4); await page.mouse.move(p[0], p[1], { steps: 10 }); await sleep(450);
  p = await scr(4, 10); await page.mouse.move(p[0], p[1], { steps: 10 }); await sleep(250);
  await snap('04-gather');
  await page.mouse.up({ button: 'left' });
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
  // tools: a peg over the pumpkins, the toolbar, the Breezling at work
  await ev(() => { const { G } = window.__ch; window.__ch.startDay(1); window.__ch.skip(30); });
  const f = await ev(() => { const d = window.__ch.G.crops.fields[2].def; return [d.x, d.z]; });
  p = await scr(f[0], f[1]); await page.mouse.move(p[0], p[1], { steps: 8 }); await sleep(300);
  await page.keyboard.press('Digit2'); await sleep(200);
  await ev((f) => { const { G } = window.__ch; G.clouds.spawn(f[0] - 3, f[1] - 2, 3.4, 'water', { instant: true }); window.__ch.skip(1.5); }, f);
  p = await scr(-2, 8); await page.mouse.move(p[0], p[1], { steps: 8 }); await page.keyboard.press('Digit1'); await sleep(700);
  await snap('12-tools');
  // a golden cloud pouring on a field
  await ev(() => { const { G } = window.__ch; window.__ch.startDay(3); window.__ch.skip(40); const d = G.crops.fields[4].def; const c = G.clouds.spawn(d.x, d.z, 3.4, 'gold', { instant: true }); window.__ch.skip(2); G.sprite.x = d.x - 12; G.sprite.z = d.z - 8; });
  await sleep(1500); await snap('14-golden');
  // a finished day with a level-up
  await ev(() => { window.__ch.setProfile({ level: 6, xp: 300 }); window.__ch.botDay(1, 1); });
  await sleep(2800); await snap('13-results');
}
