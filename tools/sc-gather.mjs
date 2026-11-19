// Real mouse: hold the left button to gather, drag fast across the island, let go to rain, right-click to throw.
export default async function ({ page, shot, sleep, ev }) {
  const scr = (x, y, z) => ev((x, y, z) => { const { G, THREE } = window.__ch; const v = new THREE.Vector3(x, y, z).project(G.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; }, x, y, z);
  await sleep(1200);
  await ev(() => { window.__ch.startDay(1); });
  await sleep(1500);
  const cs = await ev(() => window.__ch.G.clouds.list.slice(0, 3).map((c) => [c.x, c.z]));
  let p = await scr(cs[0][0], 13.6, cs[0][1]);
  await page.mouse.move(p[0], p[1], { steps: 8 }); await sleep(250);
  await page.mouse.down({ button: 'left' });
  for (const c of cs.slice(1)) { const q = await scr(c[0], 13.6, c[1]); await page.mouse.move(q[0], q[1], { steps: 10 }); await sleep(400); }
  const held1 = await ev(() => { const { G } = window.__ch; return G.clouds.list.filter((c) => c.holder === G.sprite).map((c) => +c.mass.toFixed(1)); });
  console.log('held after gathering:', JSON.stringify(held1));
  await shot('g-hold');
  // drag fast to the far side of the island; the clouds should keep up
  const f = await ev(() => { const d = window.__ch.G.crops.fields[3].def; return [d.x, d.z]; });
  const q = await scr(f[0], 13.6, f[1]);
  await page.mouse.move(q[0], q[1], { steps: 6 });
  await sleep(120);
  await shot('g-drag');
  const lag = await ev(() => { const { G } = window.__ch; const S = G.sprite; return { sprite: [+S.x.toFixed(1), +S.z.toFixed(1)], target: [+S.tx.toFixed(1), +S.tz.toFixed(1)], held: G.clouds.list.filter((c) => c.holder === S).map((c) => +Math.hypot(c.x - S.x, c.z - S.z).toFixed(1)) }; });
  console.log('120 ms after a fast drag:', JSON.stringify(lag));
  await sleep(600);
  await page.mouse.up({ button: 'left' });
  await sleep(1600);
  const after = await ev(() => { const { G } = window.__ch; return G.clouds.list.filter((c) => c.state !== 'idle').map((c) => [c.state, +c.mass.toFixed(1), Math.round(c.x), Math.round(c.z)]); });
  console.log('after letting go:', JSON.stringify(after));
  await shot('g-rain');
  // throw: gather a cloud, then right-click
  const c2 = await ev(() => { const { G } = window.__ch; const c = G.clouds.list.find((c) => c.state === 'idle' && c.kind === 'water'); return c ? [c.x, c.z] : null; });
  if (c2) {
    const r = await scr(c2[0], 13.6, c2[1]);
    await page.mouse.move(r[0], r[1], { steps: 8 }); await sleep(200);
    await page.mouse.down({ button: 'left' }); await sleep(500);
    await page.mouse.move(r[0] + 120, r[1], { steps: 4 }); await sleep(100);
    await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
    await sleep(80);
    console.log('thrown:', await ev(() => window.__ch.G.game.R.stats.throws), 'contextmenu-free');
    await page.mouse.up({ button: 'left' });
  }
  console.log('mode', await ev(() => window.__ch.G.mode));
}
