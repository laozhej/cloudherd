// A first-time player, real mouse and clicks only (run with --notest).
export default async function ({ page, shot, sleep, ev }) {
  const scr = (x, y, z) => ev((x, y, z) => { const { G, THREE } = window.__ch; const v = new THREE.Vector3(x, y, z).project(G.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; }, x, y, z);
  const click = async (text) => {
    const el = await page.evaluateHandle((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t)), text);
    const box = await el.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await sleep(500);
  };
  const tut = () => ev(() => window.__ch.G.game.R.tut);
  await sleep(1500);
  await shot('fr-0-title');
  await click('Play the week');
  await shot('fr-1-intro');
  await click('Start the day');
  // 1: fly around
  for (const [x, y] of [[600, 400], [900, 380], [1000, 600], [700, 650]]) await page.mouse.move(x, y, { steps: 15 });
  await sleep(300);
  console.log('after flying, tut step', await tut());
  await shot('fr-2-push');
  // 2: fly into the nearest cloud
  let c = await ev(() => { const { G } = window.__ch; const c = G.clouds.list[0]; return [c.x, c.z]; });
  let p = await scr(c[0] + 8, 13.6, c[1]); await page.mouse.move(p[0], p[1], { steps: 10 }); await sleep(300);
  p = await scr(c[0] - 8, 13.6, c[1]); await page.mouse.move(p[0], p[1], { steps: 20 }); await sleep(600);
  console.log('after pushing, tut step', await tut());
  await shot('fr-3-draw');
  // 3: gather clouds: hover the lake clouds and hold the left button
  const lake = await ev(() => { const { G } = window.__ch; return [G.clouds.list.map((c) => [c.x, c.z, c.mass])]; });
  console.log('clouds', JSON.stringify(lake));
  const cs = await ev(() => window.__ch.G.clouds.list.map((c) => [c.x, c.z]));
  p = await scr(cs[0][0], 13.6, cs[0][1]); await page.mouse.move(p[0], p[1], { steps: 12 });
  await page.mouse.down({ button: 'left' });
  for (let i = 1; i < Math.min(cs.length, 4); i++) { const q = await ev((i) => { const c = window.__ch.G.clouds.list[i]; return c ? [c.x, c.z] : null; }, i); if (!q) continue; const pp = await scr(q[0], 13.6, q[1]); await page.mouse.move(pp[0], pp[1], { steps: 30 }); await sleep(900); }
  await sleep(800);
  console.log('after drawing, tut step', await tut(), 'clouds', JSON.stringify(await ev(() => window.__ch.G.clouds.list.map((c) => [Math.round(c.x), Math.round(c.z), +c.mass.toFixed(1), c.state]))));
  await shot('fr-4-carry');
  // 4: carry it over a wheat field and let go
  const f = await ev(() => { const f = window.__ch.G.crops.fields[1].def; return [f.x, f.z]; });
  p = await scr(f[0], 13.6, f[1]); await page.mouse.move(p[0], p[1], { steps: 40 }); await sleep(1500);
  await page.mouse.up({ button: 'left' });
  await sleep(2500);
  console.log('after rain, tut step', await tut());
  await shot('fr-5-rain');
  // 5: gust (right click)
  await page.mouse.move(p[0] + 200, p[1], { steps: 10 }); await page.mouse.click(p[0] + 260, p[1], { button: 'right' }); await sleep(400);
  await shot('fr-6-gust');
  await sleep(1000);
  console.log('after gust, tut step', await tut());
  await page.keyboard.press('Escape'); await sleep(500); await shot('fr-7-pause');
  console.log('mode', await ev(() => window.__ch.G.mode), 'progress', await ev(() => localStorage.getItem('cloudherd.progress')));
}
