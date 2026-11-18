// Starts every day, lets it run passively, screenshots each and reports state.
export default async function ({ page, shot, sleep, ev, args }) {
  const days = args.days ? args.days.split(',').map(Number) : [0, 1, 2, 3, 4, 5, 6];
  const skip = +(args.skip || 70);
  for (const d of days) {
    await ev((d) => window.__ch.startDay(d), d);
    await sleep(300);
    // push a few clouds together to force some rain, and pile a thunderhead on Friday
    await ev((d) => {
      const { G } = window.__ch;
      const C = G.clouds;
      if (d === 4) { C.spawn(14, -6, 8, 'water', { instant: true }); C.spawn(-9, 10, 7.5, 'water', { instant: true }); }
      if (d === 3 || d === 6) C.spawn(13, 12, 4, 'water', { instant: true });
      C.spawn(-20, 4, 3.5, 'water', { instant: true });
    }, d);
    await ev((s) => window.__ch.skip(s), skip);
    await sleep(400);
    await shot('alldays-' + d);
    const st = await ev(() => {
      const { G } = window.__ch, R = G.game.R;
      return { day: R.day.key, dayT: +G.dayT.toFixed(2), score: R.score, harv: R.harvests, lost: R.housesLost, rods: R.rodHits, smog: R.smogCleared, joy: +R.fairJoy.toFixed(2), gauge: +R.gauge.toFixed(2), burning: G.fire.burning(), clouds: G.clouds.stats(), fields: G.crops.fields.filter((f) => f.active).map((f) => [f.type, +f.moist.toFixed(2), +f.growth.toFixed(2), +f.health.toFixed(2), f.harvests]), errors: window.__errors.length };
    });
    console.log(JSON.stringify(st));
  }
}
