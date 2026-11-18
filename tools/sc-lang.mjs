export default async function ({ page, shot, sleep, ev }) {
  await sleep(1500);
  await shot('zh-title');
  await ev(() => window.__ch.toWeek()); await sleep(600); await shot('zh-week');
  await ev(() => window.__ch.G.hud.on.pick(3)); await sleep(600); await shot('zh-intro');
  await ev(() => { window.__ch.G.hud.on.start(); window.__ch.skip(70); }); await sleep(800); await shot('zh-hud');
  await ev(() => { window.__ch.G.hud.on.settings('pause'); }); await sleep(500); await shot('zh-settings');
  const miss = await ev(() => 0);
}
