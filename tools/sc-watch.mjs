// Watch the bot play a day in real time; a screenshot every couple of seconds.
export default async function ({ page, shot, sleep, ev, args }) {
  const d = +(args.day ?? 1);
  await sleep(500);
  await ev((d) => { window.__ch.startDay(d); window.__ch.G.bot.start(); }, d);
  for (let i = 0; i < +(args.n || 8); i++) {
    await sleep(+(args.every || 2500));
    await shot(`watch-${i}`);
    const st = await ev(() => { const { G } = window.__ch; const b = G.bot; return { phase: b.phase, task: b.task && [b.task.kind, Math.round(b.task.x), Math.round(b.task.z), b.task.want], sprite: [Math.round(G.sprite.x), Math.round(G.sprite.z), G.sprite.drawing], clouds: G.clouds.list.map((c) => [Math.round(c.x), Math.round(c.z), +c.mass.toFixed(1), c.state[0]]).slice(0, 12), fields: G.crops.fields.filter((f) => f.active).map((f) => [+f.moist.toFixed(2), +f.health.toFixed(2)]) }; });
    console.log(i, JSON.stringify(st));
  }
}
