// The autopilot plays every day at full speed and reports pass rates and stars.
//   node tools/shot.mjs tools/sc-bot.mjs [--days=0,1] [--runs=3] [--skill=0.5 | --skills=1,0.5,0.25] [--verbose=1]
export default async function ({ page, shot, sleep, ev, args }) {
  const days = args.days ? args.days.split(',').map(Number) : [0, 1, 2, 3, 4, 5, 6];
  const runs = +(args.runs || 1);
  const skills = (args.skills || args.skill || '1').split(',').map(Number);
  await sleep(500);
  const table = {};
  for (const k of skills) for (const d of days) {
    const rs = [];
    for (let r = 0; r < runs; r++) rs.push(await ev((d, k) => window.__ch.botDay(d, k), d, k));
    const pass = rs.filter((r) => r && r.pass).length;
    const avg = Math.round(rs.reduce((a, r) => a + (r ? r.score : 0), 0) / rs.length);
    const stars = rs.map((r) => (r ? r.stars : 0));
    (table[d] = table[d] || {})[k] = { pass, avg, stars };
    console.log(`skill ${k} day ${d + 1}: pass ${pass}/${runs}  avg score ${avg}  stars ${stars.join(',')}`);
    if (args.verbose) for (const r of rs) console.log('   ', JSON.stringify(r && { goals: r.goals, harv: r.stats.harvests, bulls: r.stats.bullseyes, rb: r.stats.rainbows, doused: r.stats.doused, withered: r.stats.withered, merges: r.stats.merges, maxC: +r.stats.maxCloud.toFixed(1), sf: r.stats.strikeFires }));
  }
  if (skills.length > 1) {
    console.log('\nday | ' + skills.map((k) => `skill ${k}: pass / avg stars`).join(' | '));
    for (const d of days) console.log(`${d + 1}   | ` + skills.map((k) => { const c = table[d][k]; return `${c.pass}/${runs} / ${(c.stars.reduce((a, b) => a + b, 0) / runs).toFixed(1)}`; }).join(' | '));
  }
}
