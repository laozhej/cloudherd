// What the spirit keeps between days: experience and level, dewdrops (the currency),
// and the tools and upgrades bought in the shop. Also the numbers those upgrades change.
import { G } from './state.js';

export const MAX_LEVEL = 20;
export const xpToNext = (lv) => 90 + (lv - 1) * 50;

// one small permanent perk per level, cycling through the spirit's knacks
const PERK_CYCLE = ['reach', 'speed', 'gust', 'roots', 'dew'];
const PERK_VAL = { reach: 0.06, speed: 0.05, gust: 0.1, roots: 0.08, dew: 0.08 };
export const perkAt = (lv) => { const key = PERK_CYCLE[(lv - 2) % PERK_CYCLE.length]; return { key, v: PERK_VAL[key] }; };

// tier numbers for every tool (index 0 = tier I)
export const TOOL = {
  whistle: { r: [28, 34, 42], cd: [22, 17, 12] },
  peg: { n: [1, 2, 3], life: [60, 80, 100], cd: [4, 4, 4], r: 7 },
  vane: { dur: [10, 13, 17], cd: [38, 31, 24] },
  bell: { r: [10, 12, 14], cd: [26, 20, 14] },
  breezling: { speed: [9, 12, 16], cap: [1, 1, 2] },
};

export const SHOP = [
  { id: 'whistle', kind: 'tool', slot: 1, minLv: 1, price: [40, 110, 210] },
  { id: 'peg', kind: 'tool', slot: 2, minLv: 2, price: [70, 150, 260] },
  { id: 'vane', kind: 'tool', slot: 3, minLv: 3, price: [110, 210, 340] },
  { id: 'bell', kind: 'tool', slot: 4, minLv: 4, price: [130, 240, 380] },
  { id: 'embrace', kind: 'passive', minLv: 1, price: [35, 85, 150] },
  { id: 'swift', kind: 'passive', minLv: 1, price: [35, 85, 150] },
  { id: 'lungs', kind: 'passive', minLv: 2, price: [45, 100, 180] },
  { id: 'roots', kind: 'passive', minLv: 2, price: [55, 115, 200] },
  { id: 'prism', kind: 'passive', minLv: 3, price: [60, 125, 220] },
  { id: 'golden', kind: 'passive', minLv: 4, price: [75, 155, 270] },
  { id: 'breezling', kind: 'helper', minLv: 5, price: [200, 350, 520] },
];
export const shopItem = (id) => SHOP.find((s) => s.id === id);

export const freshProfile = () => ({ v: 1, xp: 0, level: 1, dew: 0, owned: {}, earned: 0, shopSeen: false });
export const tierOf = (id) => G.profile.owned[id] || 0;

// every multiplier the day's systems read, from level perks and owned upgrades
export function computeMods() {
  const P = G.profile;
  const m = { reach: 1, speed: 1, carry: 0.75, gustPow: 1, gustRange: 1, gustCD: 0.5, wilt: 1, grow: 1, dew: 1, rainbowChance: 0.6, rainbowDew: 1 };
  for (let lv = 2; lv <= P.level; lv++) {
    const p = perkAt(lv);
    if (p.key === 'reach') m.reach += p.v;
    else if (p.key === 'speed') m.speed += p.v;
    else if (p.key === 'gust') m.gustPow += p.v;
    else if (p.key === 'roots') { m.wilt -= p.v; m.grow += p.v * 0.5; }
    else if (p.key === 'dew') m.dew += p.v;
  }
  const t = tierOf;
  m.reach += 0.18 * t('embrace');
  m.speed += 0.1 * t('swift'); m.carry += 0.05 * t('swift');
  m.gustPow += 0.25 * t('lungs'); m.gustRange += 0.12 * t('lungs'); m.gustCD *= 1 - 0.15 * t('lungs');
  m.wilt *= 1 - 0.2 * t('roots'); m.grow += 0.06 * t('roots');
  m.rainbowChance = Math.min(1, 0.6 + 0.2 * t('prism')); m.rainbowDew = 1 + 0.5 * t('prism');
  m.dew += 0.15 * t('golden');
  m.wilt = Math.max(0.3, m.wilt);
  m.carry = Math.min(1, m.carry);
  return m;
}

// add experience; returns the levels reached on the way (for the level-up banner)
export function addXp(n) {
  const P = G.profile, ups = [];
  P.xp += Math.max(0, Math.round(n));
  while (P.level < MAX_LEVEL && P.xp >= xpToNext(P.level)) { P.xp -= xpToNext(P.level); P.level++; ups.push(P.level); }
  if (P.level >= MAX_LEVEL) P.xp = Math.min(P.xp, xpToNext(P.level));
  return ups;
}

export function buyState(id) {
  const it = shopItem(id), tier = tierOf(id);
  if (tier >= it.price.length) return 'max';
  if (G.profile.level < it.minLv) return 'locked';
  if (G.profile.dew < it.price[tier]) return 'poor';
  return 'ok';
}
export function buy(id) {
  if (buyState(id) !== 'ok') return false;
  const it = shopItem(id), tier = tierOf(id);
  G.profile.dew -= it.price[tier];
  G.profile.owned[id] = tier + 1;
  G.saveProfile?.();
  return true;
}
// is there anything the player can buy right now? (lights up the shop button)
export const anyAffordable = () => SHOP.some((it) => buyState(it.id) === 'ok');
