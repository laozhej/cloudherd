// Tools, the Breezling, the shop and the results payout.
export default async function ({ page, shot, sleep, ev }) {
  const scr = (x, y, z) => ev((x, y, z) => { const { G, THREE } = window.__ch; const v = new THREE.Vector3(x, y, z).project(G.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; }, x, y, z);
  await sleep(1200);
  await ev(() => window.__ch.setProfile({ level: 6, xp: 40, dew: 900, owned: { whistle: 2, peg: 2, vane: 1, bell: 1, breezling: 2, embrace: 1 } }));
  await ev(() => window.__ch.toWeek()); await sleep(600); await shot('t-week');
  await ev(() => window.__ch.G.hud.on.shop('week')); await sleep(500); await shot('t-shop');
  await ev(() => window.__ch.G.hud.on.buy('swift')); await sleep(300);
  console.log('after buying swift:', JSON.stringify(await ev(() => ({ dew: window.__ch.G.profile.dew, swift: window.__ch.G.profile.owned.swift }))));
  await ev(() => window.__ch.G.hud.on.pick(1)); await sleep(600); await shot('t-intro');
  await ev(() => window.__ch.G.hud.on.start()); await sleep(800);
  // whistle from the middle of the island
  let p = await scr(-10, 13.6, 4); await page.mouse.move(p[0], p[1], { steps: 8 }); await sleep(500);
  const before = await ev(() => window.__ch.G.clouds.list.map((c) => Math.round(Math.hypot(c.x - window.__ch.G.sprite.x, c.z - window.__ch.G.sprite.z))));
  await page.keyboard.press('Digit1'); await sleep(900);
  const after = await ev(() => window.__ch.G.clouds.list.map((c) => Math.round(Math.hypot(c.x - window.__ch.G.sprite.x, c.z - window.__ch.G.sprite.z))));
  console.log('whistle distances before', JSON.stringify(before), 'after', JSON.stringify(after));
  await shot('t-whistle');
  // a peg over the pumpkin field
  const f = await ev(() => { const d = window.__ch.G.crops.fields[2].def; return [d.x, d.z]; });
  p = await scr(f[0], 13.6, f[1]); await page.mouse.move(p[0], p[1], { steps: 8 }); await sleep(400);
  await page.keyboard.press('Digit2'); await sleep(400);
  // vane and bell
  await page.mouse.move(p[0] + 200, p[1] - 60, { steps: 6 }); await page.keyboard.press('Digit3'); await sleep(300);
  console.log('vane wind:', JSON.stringify(await ev(() => { const W = window.__ch.G.wind; return [+W.x.toFixed(2), +W.z.toFixed(2), +W.speed.toFixed(2)]; })));
  await ev(() => window.__ch.skip(6));
  await sleep(300); await shot('t-peg');
  await page.keyboard.press('Digit4'); await sleep(1500);
  console.log('after bell raining:', await ev(() => window.__ch.G.clouds.list.filter((c) => c.state !== 'idle').length));
  await shot('t-bell');
  // the Breezling over 40 s
  const fm0 = await ev(() => window.__ch.G.crops.fields.filter((f) => f.active).map((f) => +f.moist.toFixed(2)));
  await ev(() => window.__ch.skip(40));
  const fm1 = await ev(() => window.__ch.G.crops.fields.filter((f) => f.active).map((f) => +f.moist.toFixed(2)));
  console.log('field moisture with only the Breezling working:', JSON.stringify(fm0), '->', JSON.stringify(fm1), 'helper trips', await ev(() => window.__ch.G.helper.trips));
  await shot('t-helper');
  // finish the day by bot to see the payout
  const res = await ev(() => { const r = window.__ch.botDay(1, 1); return r; });
  console.log('bot day:', JSON.stringify({ pass: res.pass, stars: res.stars }));
  await sleep(2600); await shot('t-results');
  console.log('profile after:', JSON.stringify(await ev(() => window.__ch.G.profile)));
}
