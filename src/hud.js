// Interface: the HUD over the island, world-anchored badges, popups, toasts,
// tutorial tips, and every menu panel.
import * as THREE from 'three';
import { G } from './state.js';
import { t, getLang } from './i18n.js';
import { fmtClock, clamp } from './util.js';
import { DAYS, FREE } from './levels.js';
import { LAYOUT, groundAt } from './island.js';
import { CROPS } from './crops.js';
import { SHOP, TOOL, tierOf, buyState, xpToNext, perkAt, anyAffordable, MAX_LEVEL } from './profile.js';

const DROP = 'M12 2.5c3.8 4.6 6.5 8.2 6.5 11.5A6.5 6.5 0 0 1 5.5 14c0-3.3 2.7-6.9 6.5-11.5z';
export const ICON = {
  drop: `<svg viewBox="0 0 24 24"><path d="${DROP}" fill="#45a2e0"/><path d="M9 14.5a3 3 0 0 0 3 3" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/></svg>`,
  wheat: `<svg viewBox="0 0 24 24"><path d="M12 22V6" stroke="#b9862e" stroke-width="1.8" stroke-linecap="round"/>${[7, 10.5, 14].map((y) => `<ellipse cx="9.3" cy="${y}" rx="2" ry="3.2" transform="rotate(-30 9.3 ${y})" fill="#f2b631"/><ellipse cx="14.7" cy="${y}" rx="2" ry="3.2" transform="rotate(30 14.7 ${y})" fill="#f2b631"/>`).join('')}<ellipse cx="12" cy="4.2" rx="1.8" ry="3" fill="#f2b631"/></svg>`,
  sunflower: `<svg viewBox="0 0 24 24">${Array.from({ length: 10 }, (_, i) => `<ellipse cx="12" cy="5" rx="2.2" ry="4" transform="rotate(${i * 36} 12 12)" fill="#ffc928"/>`).join('')}<circle cx="12" cy="12" r="4.2" fill="#7a4a20"/></svg>`,
  pumpkin: `<svg viewBox="0 0 24 24"><path d="M12 6.5c.2-2 1.2-3.2 3-3.6" stroke="#5f7a2a" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="8" cy="14" rx="5" ry="6.5" fill="#e8781c"/><ellipse cx="16" cy="14" rx="5" ry="6.5" fill="#e8781c"/><ellipse cx="12" cy="14" rx="4.6" ry="7" fill="#f28a24"/></svg>`,
  lavender: `<svg viewBox="0 0 24 24"><path d="M12 22V9M12 18l-4-6M12 18l4-6" stroke="#5f9e3a" stroke-width="1.6" fill="none" stroke-linecap="round"/>${[[12, 4], [12, 7], [7.5, 9], [16.5, 9], [7, 6.3], [17, 6.3], [12, 1.8]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.7" ry="2.3" fill="#9a7fe0"/>`).join('')}</svg>`,
  flame: `<svg viewBox="0 0 24 24"><path d="M12 2c1 3.5 5.5 6 5.5 11.5a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4.4 2.6-5.8.2 1.7 1.1 2.9 2.3 3.4C11.2 8.4 11.3 5.2 12 2z" fill="#fff"/><path d="M12 13c1 1.2 2.4 2.3 2.4 4a2.4 2.4 0 0 1-4.8 0c0-1.5.9-2.7 2.4-4z" fill="#ffd27a"/></svg>`,
  house: `<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z" fill="#fff"/></svg>`,
  tent: `<svg viewBox="0 0 24 24"><path d="M12 3 2.5 19h19z" fill="#e2574c"/><path d="M12 3 9 19h6z" fill="#fff"/><path d="M12 1v3" stroke="#6b4a35" stroke-width="1.5"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24"><path d="M13.5 2 4.5 14h6.5l-1.5 8 9.5-12.5h-6.8z" fill="#ffc928" stroke="#e08a12" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  smog: `<svg viewBox="0 0 24 24"><path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9a4.8 4.8 0 0 1-.5 9.5z" fill="#8a7f8a"/><path d="M5 21h14" stroke="#8a7f8a" stroke-width="1.6" stroke-linecap="round" opacity=".6"/></svg>`,
  barrel: `<svg viewBox="0 0 24 24"><path d="M6 4h12l1 8-1 8H6l-1-8z" fill="#b98a5c"/><path d="M5.3 8h13.4M5.3 16h13.4" stroke="#5d5348" stroke-width="1.6"/><path d="M12 9.5c1.6 1.9 2.6 3.3 2.6 4.6a2.6 2.6 0 0 1-5.2 0c0-1.3 1-2.7 2.6-4.6z" fill="#6fd3f0"/></svg>`,
  cloud: `<svg viewBox="0 0 24 24"><path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 9a4.8 4.8 0 0 1-.5 9.5z" fill="#fff" stroke="#45a2e0" stroke-width="1.5"/></svg>`,
  sun: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#ffb43b"/>${Array.from({ length: 8 }, (_, i) => `<path d="M12 2.5v3" stroke="#ffb43b" stroke-width="2" stroke-linecap="round" transform="rotate(${i * 45} 12 12)"/>`).join('')}</svg>`,
  star: (on) => `<svg viewBox="0 0 24 24" class="${on ? 'on' : ''}"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z" fill="${on ? '#f2b631' : '#c9cfd6'}" stroke="${on ? '#d8941a' : '#b4bcc6'}" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  lock: `<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2.5" fill="#23374d"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="#23374d" stroke-width="2.2" fill="none"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24"><path d="M12 2.5 18.5 12H14v9.5h-4V12H5.5z" fill="#45a2e0"/></svg>`,
  whistle: `<svg viewBox="0 0 24 24"><path d="M3 9.5h9.5a5 5 0 1 1-1.2 8.5L9 14.5H3z" fill="#45a2e0"/><circle cx="13.6" cy="14.2" r="2" fill="#fff"/><path d="M15 4.5c1.6-.8 3.4-.6 4.6.4M16.5 7c.8-.4 1.8-.3 2.4.2" stroke="#45a2e0" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
  peg: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="8" rx="8.5" ry="3" fill="none" stroke="#f2b631" stroke-width="2"/><path d="M12 8v13" stroke="#a77a4f" stroke-width="2.6" stroke-linecap="round"/><path d="M12 3.2l1.7 2.4L12 8l-1.7-2.4z" fill="#f2b631"/></svg>`,
  vane: `<svg viewBox="0 0 24 24"><path d="M12 8v14" stroke="#5d5348" stroke-width="2" stroke-linecap="round"/><path d="M4 8h13" stroke="#45a2e0" stroke-width="2.2" stroke-linecap="round"/><path d="M16 4.5 21 8l-5 3.5z" fill="#45a2e0"/><path d="M3.5 5.2 6.3 8l-2.8 2.8" stroke="#45a2e0" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="12" cy="8" r="1.9" fill="#f2b631"/></svg>`,
  bell: `<svg viewBox="0 0 24 24"><path d="M12 3a5.5 5.5 0 0 0-5.5 5.5v4L4.5 16h15l-2-3.5v-4A5.5 5.5 0 0 0 12 3z" fill="#f2b631"/><circle cx="12" cy="17.6" r="2" fill="#d8941a"/><path d="M6 20.4l-.8 1.6M12 21.4v1.3M18 20.4l.8 1.6" stroke="#45a2e0" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  embrace: `<svg viewBox="0 0 24 24"><path d="M8 15.5a3.5 3.5 0 0 1-.4-7A5 5 0 0 1 17 8.2a3.6 3.6 0 0 1-.4 7.3z" fill="#fff" stroke="#45a2e0" stroke-width="1.4"/><path d="M3 11c0 5 3.5 8.5 9 8.5s9-3.5 9-8.5" stroke="#5aae47" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  swift: `<svg viewBox="0 0 24 24"><path d="M20 3.5C12 4.5 6.5 9.5 5 19.5l2.2-1.2C8.6 13.2 12 9.4 17 7" fill="none" stroke="#45a2e0" stroke-width="2" stroke-linecap="round"/><path d="M20 3.5c-1 6-4.6 10.5-11 13" fill="none" stroke="#45a2e0" stroke-width="1.4" stroke-linecap="round" opacity=".6"/><path d="M2 9h5M1 13h4" stroke="#9fe0f5" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  lungs: `<svg viewBox="0 0 24 24"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h7" stroke="#45a2e0" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  roots: `<svg viewBox="0 0 24 24"><path d="M12 13c-4 0-6.5-2.8-6.5-6.5C9.5 6.5 12 9 12 13zM12 13c4 0 6.5-2.8 6.5-6.5C14.5 6.5 12 9 12 13z" fill="#5aae47"/><path d="M12 13v5m0 0-3.5 3.5M12 18l3.5 3.5M12 18v4" stroke="#a77a4f" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  prism: `<svg viewBox="0 0 24 24"><path d="M12 3 3 19h18z" fill="#e3f4ff" stroke="#45a2e0" stroke-width="1.4" stroke-linejoin="round"/><path d="M1 11l7 3" stroke="#9fb4c8" stroke-width="1.6"/><path d="M15 13l8-3" stroke="#e2574c" stroke-width="1.4"/><path d="M15 14l8-1" stroke="#f2b631" stroke-width="1.4"/><path d="M15 15l8 1" stroke="#5aae47" stroke-width="1.4"/><path d="M15 16l8 3" stroke="#8c74d8" stroke-width="1.4"/></svg>`,
  golden: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#f2b631" stroke="#d8941a" stroke-width="1.4"/><path d="M12 6.5c2.2 2.6 3.6 4.5 3.6 6.3a3.6 3.6 0 0 1-7.2 0c0-1.8 1.4-3.7 3.6-6.3z" fill="#fff8e0"/></svg>`,
  breezling: `<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="7" fill="#c6f7d9" stroke="#5aae47" stroke-width="1.4"/><circle cx="9.8" cy="12.4" r="1.1" fill="#23374d"/><circle cx="14.2" cy="12.4" r="1.1" fill="#23374d"/><path d="M12 6c.5-2 2-3 4-3-.3 2-1.8 3-4 3z" fill="#5aae47"/></svg>`,
  dew: `<svg viewBox="0 0 24 24"><path d="${DROP}" fill="#2fb8d8"/><path d="M9 14.5a3 3 0 0 0 3 3" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".85"/></svg>`,
  mouseL: `<svg viewBox="0 0 20 26"><rect x="1.5" y="1.5" width="17" height="23" rx="8.5" fill="#fff" stroke="#23374d" stroke-width="1.6"/><path d="M10 1.5v9M1.5 10.5h17" stroke="#23374d" stroke-width="1.4"/><path d="M10 2.3V10H2.3A8 8 0 0 1 10 2.3z" fill="#45a2e0"/></svg>`,
  mouseR: `<svg viewBox="0 0 20 26"><rect x="1.5" y="1.5" width="17" height="23" rx="8.5" fill="#fff" stroke="#23374d" stroke-width="1.6"/><path d="M10 1.5v9M1.5 10.5h17" stroke="#23374d" stroke-width="1.4"/><path d="M10 2.3V10h7.7A8 8 0 0 0 10 2.3z" fill="#5aae47"/></svg>`,
  mouse: `<svg viewBox="0 0 20 26"><rect x="1.5" y="1.5" width="17" height="23" rx="8.5" fill="#fff" stroke="#23374d" stroke-width="1.6"/><path d="M10 1.5v9M1.5 10.5h17" stroke="#23374d" stroke-width="1.4"/><path d="M10 14v5" stroke="#23374d" stroke-width="1.6" stroke-linecap="round"/></svg>`,
};
const DAY_ICON = ['drop', 'wheat', 'flame', 'tent', 'bolt', 'smog', 'barrel'];
const GOAL_ICON = { harvest: 'wheat', houses: 'house', fair: 'tent', rods: 'bolt', smog: 'smog', gauge: 'barrel' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createHud(root) {
  root.innerHTML = `
  <div class="hud" id="hud">
    <div class="goals card" id="h-goals"></div>
    <div class="top card"><div class="sunarc"><svg viewBox="0 0 120 46"><path d="M8 40 A52 34 0 0 1 112 40" fill="none" stroke="rgba(35,55,77,.22)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="1 6"/><path id="h-arcfill" d="M8 40 A52 34 0 0 1 112 40" fill="none" stroke="#ffb43b" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/><g id="h-sun"><circle r="7.5" fill="#ffb43b" stroke="#fffaf0" stroke-width="2.5"/></g></svg><div class="clock" id="h-clock">06:00</div></div>
      <div class="dayname"><span class="k" id="h-dayk"></span><b id="h-dayname"></b></div></div>
    <div class="score card"><span class="k">${t('hud.score')}</span><b id="h-score">0</b></div>
    <div class="prof card"><div class="lvb"><span class="k">${t('hud.lv')}</span><b id="h-lv">1</b></div><div><div class="xpbar" id="h-xpb"><i id="h-xp"></i></div><div class="dewc">${ICON.dew}<b id="h-dew">0</b><span id="h-dewt"></span></div></div></div>
    <div class="tools" id="h-tools"></div>
    <div class="touchpad"><button data-hud="gather" id="h-tgather">${t('hud.gatherBtn')}</button><button data-hud="gustBtn">${t('hud.gustBtn')}</button></div>
    <div class="wind card"><div class="dial"><div id="h-arrow">${ICON.arrow}</div></div><div><span class="k">${t('hud.wind')}</span><b id="h-windtxt"></b></div></div>
    <div class="ctrl card"><div class="ck" id="h-ck-move">${ICON.mouse}<span>${t('hud.move')}</span></div><div class="ck" id="h-ck-draw">${G.settings.swapButtons ? ICON.mouseR : ICON.mouseL}<span>${t('hud.draw')}</span></div><div class="ck" id="h-ck-gust">${G.settings.swapButtons ? ICON.mouseL : ICON.mouseR}<span>${t('hud.gust')}</span><div class="cd"><i id="h-gustcd"></i></div></div></div>
    <div id="marks"></div>
    <div id="pops"></div>
    <div id="toasts"></div>
    <div class="tip card" id="h-tip"><div class="step" id="h-tipstep">1</div><div id="h-tiptxt"></div></div>
    <div id="bigtitle"></div>
  </div>
  <div id="panel"></div>
  <div id="reticle"></div>`;
  const $ = (id) => root.querySelector('#' + id);
  const hudEl = $('hud'), panel = $('panel'), marks = $('marks'), pops = $('pops'), toasts = $('toasts'), reticleEl = $('reticle'), toolsEl = $('h-tools');
  // toolbar and touch buttons talk straight to main.js
  hudEl.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-hud],[data-tool]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.tool) on.tool?.(b.dataset.tool); else on[b.dataset.hud]?.();
  });
  const on = {};
  let panelKind = null, openedAt = 0;

  // ---------------------------------------------------------------- world markers
  const v3 = new THREE.Vector3();
  function project(x, y, z) {
    v3.set(x, y, z).project(G.camera);
    if (v3.z > 1) return null;
    return [(v3.x * 0.5 + 0.5) * innerWidth, (-v3.y * 0.5 + 0.5) * innerHeight];
  }
  const badges = G.crops.fields.map((f, i) => {
    const el = document.createElement('div');
    el.className = 'mk';
    el.innerHTML = `<div class="badge"><svg viewBox="0 0 46 46"><defs><clipPath id="cp${i}"><rect class="clip" x="0" y="2" width="24" height="30"/></clipPath></defs>
      <circle class="ringbg" cx="23" cy="23" r="19"/><circle class="ring" cx="23" cy="23" r="19" stroke-dasharray="119.4" stroke-dashoffset="119.4"/>
      <circle class="disc" cx="23" cy="23" r="15.5"/>
      <g transform="translate(13.5 11) scale(0.8)"><path class="drop-f" d="${DROP}" clip-path="url(#cp${i})"/><path class="drop-o" d="${DROP}"/></g>
      <g class="crop" transform="translate(29 29) scale(0.62)"><circle cx="12" cy="12" r="12" fill="#fff"/><g transform="translate(2 2) scale(0.83)" class="cropicon"></g></g></svg></div>`;
    marks.appendChild(el);
    return { el, inner: el.firstChild, ring: el.querySelector('.ring'), clip: el.querySelector('.clip'), icon: el.querySelector('.cropicon'), type: null, cls: '' };
  });
  const flagPool = [];
  function flag(i) {
    while (flagPool.length <= i) { const el = document.createElement('div'); el.className = 'mk'; el.innerHTML = '<div class="flag"></div>'; marks.appendChild(el); flagPool.push(el); }
    return flagPool[i];
  }
  const zone = document.createElement('div');
  zone.className = 'mk zone card';
  zone.innerHTML = `<div class="k"><span class="zi"></span><span class="zt"></span></div><div class="bar"><i></i></div>`;
  marks.appendChild(zone);
  const lh = document.createElement('div');
  lh.className = 'mk zone card';
  lh.innerHTML = `<div class="k">${ICON.bolt.replace('<svg', '<svg width="14" height="14"')}<span>${t('hud.lighthouse')}</span></div><div class="bar"><i></i></div>`;
  marks.appendChild(lh);

  // ---------------------------------------------------------------- panels
  const setPanel = (kind, html, dim = true) => {
    panelKind = kind;
    panel.className = kind ? 'on' + (dim ? ' dim' : '') : '';
    panel.innerHTML = html || '';
    document.body.classList.toggle('menu', !!kind || G.mode !== 'playing');
    // no auto-focus: Space is the gust key, and a focused button would catch it at sunset
    openedAt = performance.now();
  };
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    G.audio?.click();
    const act = b.dataset.act, arg = b.dataset.arg;
    on[act]?.(arg === undefined ? undefined : isNaN(+arg) ? arg : +arg);
  });
  panel.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.set) { G.settings[el.dataset.set] = +el.value; on.settings?.(el.dataset.set); }
  });

  const smallDew = ICON.dew.replace('<svg', '<svg width="14" height="14"');
  function itemDesc(id, tier) {
    const k = tier - 1;
    switch (id) {
      case 'whistle': return t('desc.whistle', { r: TOOL.whistle.r[k], cd: TOOL.whistle.cd[k] });
      case 'peg': return t('desc.peg', { n: TOOL.peg.n[k], life: TOOL.peg.life[k] });
      case 'vane': return t('desc.vane', { dur: TOOL.vane.dur[k], cd: TOOL.vane.cd[k] });
      case 'bell': return t('desc.bell', { r: TOOL.bell.r[k], cd: TOOL.bell.cd[k] });
      case 'embrace': return t('desc.embrace', { p: 18 * tier });
      case 'swift': return t('desc.swift', { p: 10 * tier });
      case 'lungs': return t('desc.lungs', { p: 25 * tier });
      case 'roots': return t('desc.roots', { p: 20 * tier });
      case 'prism': return t('desc.prism', { p: Math.min(100, 60 + 20 * tier), m: 1 + 0.5 * tier });
      case 'golden': return t('desc.golden', { p: 15 * tier });
      case 'breezling': return t('desc.breezling', { cap: TOOL.breezling.cap[k] });
    }
    return '';
  }
  const perkText = (lv) => { const p = perkAt(lv); return t('perk.' + p.key, { p: Math.round(p.v * 100) }); };
  function profileRow(withShop) {
    const P = G.profile, need = xpToNext(P.level);
    const pct = P.level >= MAX_LEVEL ? 100 : Math.round((P.xp / need) * 100);
    const shop = withShop ? `<button class="btn sun" data-act="shop" data-arg="week">${t('week.shop')}${anyAffordable() ? '<i class="dot"></i>' : ''}</button>` : '';
    return `<div class="profile-row"><div class="lvbig"><span class="k">${esc(t('prof.level', { n: P.level }))}</span><div class="xpbar big"><i style="width:${pct}%"></i></div><span class="xptxt">${esc(t('prof.xp', { a: P.xp, b: need }))}</span></div>
      <div class="dewbig">${ICON.dew}<b>${P.dew}</b></div>${shop}</div>`;
  }
  const bountyRows = (bs, reward) => bs.map((b) => `<div class="goal bonus ${b.done ? 'done' : ''} ${b.failed ? 'fail' : ''}"><div class="chk"></div><div>${esc(b.label)}</div>${reward ? `<div class="cnt rew">${smallDew}${b.dew}</div>` : `<div class="cnt">${esc(b.count || '')}</div><div class="bar"><i style="width:${Math.round(b.prog * 100)}%"></i></div>`}</div>`).join('');
  let toolKey = '';
  const goalRows = (goalsStatus, big) => goalsStatus.map((s) => `<div class="goal ${s.done && !s.failed ? 'done' : ''} ${s.failed ? 'fail' : ''}"><div class="chk"></div><div>${esc(s.label)}</div><div class="cnt">${esc(s.count || '')}</div>${big ? '' : `<div class="bar"><i style="width:${Math.round(s.prog * 100)}%"></i></div>`}</div>`).join('');
  const dayLabel = (idx) => (idx === 'free' || idx < 0 ? t('day.free') : t('day.' + idx));
  const dayName = (idx) => (idx === 'free' || idx < 0 ? t('free.name') : t(DAYS[idx].key + '.name'));

  const hud = {
    on, el: root,
    get panelOpen() { return !!panelKind; },
    get panelKind() { return panelKind; },
    setMode(m) {
      hudEl.classList.toggle('on', m === 'playing' || m === 'paused' || m === 'dusk');
      document.body.classList.toggle('menu', m !== 'playing');
      document.body.classList.toggle('aim', m === 'playing' && !G.touch);
      document.body.classList.toggle('touch', !!G.touch);
    },
    closePanel() { setPanel(null); },
    // Enter presses the panel's main button (not straight after it opens, so a held key cannot skip it)
    primary() { if (performance.now() - openedAt < 500) return; panel.querySelector('[data-focus]')?.click(); },
    showTitle() {
      const P = G.progress;
      const cont = P.unlocked > 1 && P.unlocked <= DAYS.length;
      setPanel('title', `<div class="title">
        <div class="logo">CLOUDHERD<small>牧 云</small></div>
        <div class="sub">${t('title.sub')}</div>
        <div class="row">
          <button class="btn sun" data-act="play" data-focus>${cont ? esc(t('title.continue', { day: t('day.' + (P.unlocked - 1)) })) : t('title.play')}</button>
          <button class="btn ghost" data-act="free">${t('title.free')}</button>
          <button class="btn ghost" data-act="settings" data-arg="title">${t('title.settings')}</button>
        </div>
        <div class="how">${t('title.how')}</div>
      </div>
      <div class="corner"><div class="seg"><button class="${getLang() === 'en' ? 'on' : ''}" data-act="lang" data-arg="en">EN</button><button class="${getLang() === 'zh' ? 'on' : ''}" data-act="lang" data-arg="zh">中文</button></div></div>
      <div class="credit">${t('title.credit')}</div>`, false);
    },
    showWeek() {
      const P = G.progress;
      const cards = DAYS.map((d, i) => {
        const locked = i + 1 > P.unlocked;
        const st = [0, 1, 2].map((k) => ICON.star(P.stars[i] > k)).join('');
        return `<button class="dayc ${i + 1 === P.unlocked && !P.stars[i] ? 'next' : ''}" data-act="pick" data-arg="${i}" ${locked && !G.test ? 'disabled title="' + esc(t('week.locked')) + '"' : ''}>
          ${locked ? `<span class="lock">${ICON.lock}</span>` : ''}
          <div class="dn">${t('day.' + i)}</div><div class="ic">${ICON[DAY_ICON[i]]}</div><div class="nm">${esc(t(d.key + '.name'))}</div>
          <div class="st">${st}</div></button>`;
      }).join('');
      const best = P.best.reduce((a, b) => a + b, 0);
      setPanel('week', `<div class="sheet card"><h2>${t('week.title')}</h2><p class="lead">${t('week.sub')}</p>
        ${profileRow(true)}
        <div class="days">${cards}</div>
        <div class="row" style="justify-content:space-between"><button class="btn ghost" data-act="title">${t('week.back')}</button><span class="k">${best ? esc(t('week.best', { n: best })) : ''}</span></div></div>`);
    },
    showIntro(idx) {
      const day = idx === 'free' ? FREE : DAYS[idx];
      const goals = G.game.goalsStatus().map((s) => ({ ...s, done: false, failed: false, count: '' }));
      setPanel('intro', `<div class="sheet card" style="width:min(600px,94vw)">
        <div class="intro-head"><div class="ic">${idx === 'free' ? ICON.sun : ICON[DAY_ICON[idx]]}</div><div><span class="k">${esc(dayLabel(idx))}</span><h2>${esc(dayName(idx))}</h2></div></div>
        <p class="lead">${esc(t(day.key + '.text'))}</p>
        ${goals.length ? `<div class="goal-list"><div class="k" style="margin-bottom:4px">${t('intro.goals')}</div>${goalRows(goals, true)}</div>` : ''}
        ${(() => { const bs = G.game.bountyStatus().map((b) => ({ ...b, done: false, failed: false })); return bs.length ? `<div class="goal-list"><div class="k" style="margin-bottom:4px">${t('intro.bonus')}</div>${bountyRows(bs, true)}</div>` : ''; })()}
        ${(() => {
          const tools = SHOP.filter((it) => it.kind === 'tool' && tierOf(it.id) > 0);
          const helper = tierOf('breezling') > 0;
          if (!tools.length && !helper) return '';
          return `<div class="tools-intro"><span class="k">${t('intro.tools')}</span>${tools.map((it) => `<span class="tchip">${ICON[it.id]}<kbd>${it.slot}</kbd>${esc(t('item.' + it.id))}</span>`).join('')}${helper ? `<span class="tchip">${ICON.breezling}${esc(t('intro.helper'))}</span>` : ''}</div>`;
        })()}
        <div class="row end"><button class="btn ghost" data-act="${idx === 'free' ? 'title' : 'week'}">${t('intro.back')}</button><button class="btn sun" data-act="start" data-focus>${t('intro.start')}</button></div></div>`);
    },
    showShop() {
      const P = G.profile;
      const cards = SHOP.map((it) => {
        const tier = tierOf(it.id), st = buyState(it.id);
        const tag = it.kind === 'tool' ? t('shop.tool', { k: it.slot }) : it.kind === 'helper' ? t('shop.helper') : t('shop.passive');
        const label = st === 'max' ? t('shop.max') : st === 'locked' ? t('shop.locked', { n: it.minLv }) : `${smallDew}${it.price[tier]}`;
        const pips = it.price.map((_, i) => `<i class="${i < tier ? 'on' : ''}"></i>`).join('');
        const now = tier ? `<div class="ds"><b>${t('shop.now')}:</b> ${esc(itemDesc(it.id, tier))}</div>` : `<div class="ds">${esc(itemDesc(it.id, 1))}</div>`;
        const next = tier && tier < it.price.length ? `<div class="ds nx"><b>${t('shop.next')}:</b> ${esc(itemDesc(it.id, tier + 1))}</div>` : '';
        return `<div class="item ${st}"><div class="ic">${ICON[it.id]}</div><div class="bd"><div class="nm">${esc(t('item.' + it.id))}</div><div class="tag">${esc(tag)}</div><div class="pips">${pips}</div>${now}${next}</div>
          <button class="btn small ${st === 'ok' ? 'sun' : 'ghost'}" data-act="buy" data-arg="${it.id}" ${st === 'ok' ? '' : 'disabled'}>${label}</button></div>`;
      }).join('');
      // the way out lives in the header, so it is never below the fold
      setPanel('shop', `<div class="sheet card shop"><div class="shop-head"><div><h2>${t('shop.title')}</h2><p class="lead">${t('shop.sub')}</p><span class="k">${esc(t('prof.level', { n: P.level }))} · ${esc(t('prof.xp', { a: P.xp, b: xpToNext(P.level) }))}</span></div>
        <div class="shop-side"><div class="dewbig">${ICON.dew}<b>${P.dew}</b></div><button class="btn ghost" data-act="shopBack" data-focus>${t('shop.back')}</button></div></div>
        <div class="items">${cards}</div></div>`);
    },
    shopName: (id) => t('shop.bought', { name: t('item.' + id) }),
    reticle(x, y) { reticleEl.style.transform = `translate(${x}px, ${y}px)`; },
    showPause() {
      setPanel('pause', `<div class="sheet card" style="width:min(420px,94vw);text-align:center"><h2 style="margin-bottom:18px">${t('pause.title')}</h2>
        <div style="display:grid;gap:12px"><button class="btn sun" data-act="resume" data-focus>${t('pause.resume')}</button><button class="btn ghost" data-act="restart">${t('pause.restart')}</button>
        <button class="btn ghost" data-act="settings" data-arg="pause">${t('pause.settings')}</button><button class="btn ghost" data-act="quit">${t('pause.quit')}</button></div>
        <div class="keys">${['help.move', 'help.draw', 'help.gust', 'help.rain', 'help.tools', 'help.keys'].map((k) => `<div>${esc(t(k))}</div>`).join('')}</div></div>`);
    },
    showSettings(from) {
      const S = G.settings;
      const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${(S[key] ?? false) === v ? 'on' : ''}" data-act="set" data-arg="${key}:${v}">${esc(l)}</button>`).join('')}</div>`;
      setPanel('settings', `<div class="sheet card" style="width:min(560px,94vw)"><h2>${t('set.title')}</h2>
        <div class="set">
          <span>${t('set.volume')}</span><input type="range" min="0" max="1" step="0.05" value="${S.volume}" data-set="volume">
          <span>${t('set.music')}</span><input type="range" min="0" max="1" step="0.05" value="${S.music}" data-set="music">
          <span>${t('set.ambience')}</span><input type="range" min="0" max="1" step="0.05" value="${S.ambience ?? 0.6}" data-set="ambience">
          <span>${t('set.buttons')}</span>${seg('swapButtons', [[false, t('set.btn.left')], [true, t('set.btn.right')]])}
          <span>${t('set.gather')}</span>${seg('toggleGather', [[false, t('set.hold')], [true, t('set.toggle')]])}
          <span>${t('set.quality')}</span>${seg('quality', [['low', t('set.q.low')], ['medium', t('set.q.medium')], ['high', t('set.q.high')]])}
          <span>${t('set.tilt')}</span>${seg('tilt', [[true, t('set.on')], [false, t('set.off')]])}
          <span>${t('set.relaxed')}</span>${seg('relaxed', [[true, t('set.on')], [false, t('set.off')]])}
          <span>${t('set.lang')}</span>${seg('lang', [['en', 'English'], ['zh', '中文']])}
        </div>
        <div class="row end"><button class="btn sun" data-act="settingsDone" data-arg="${from}" data-focus>${t('set.back')}</button></div></div>`);
    },
    showResults(res) {
      const idx = res.idx;
      const name = idx >= 0 ? t('day.' + idx) : t('free.name');
      const tally = [
        [t('res.harvests'), res.stats.harvests],
        [t('res.rains'), res.stats.bullseyes],
        [t('res.rainbows'), res.stats.rainbows],
        [t('res.green'), '+' + res.green],
      ];
      if (res.fairBonus) tally.push([t('res.fairBonus'), '+' + res.fairBonus]);
      const last = idx === DAYS.length - 1;
      setPanel('results', `<div class="sheet card" style="width:min(560px,94vw);text-align:center">
        <span class="k">${esc(t('res.title', { day: name }))}</span>
        <h2>${res.pass ? t('res.pass') : t('res.fail')}${res.best && res.pass ? `<span class="badge-best">${t('res.best')}</span>` : ''}</h2>
        <div class="stars" id="r-stars">${[0, 1, 2].map(() => ICON.star(false)).join('')}</div>
        <div class="big-score" id="r-score">0</div>
        ${res.pass ? '' : `<p class="lead" style="margin:10px 0 0">${t('res.failText')}</p>`}
        ${res.finale ? `<p class="lead" style="margin:12px 0 0">${t('res.finale')}<br><b>${t('res.thanks')}</b></p>` : ''}
        <div class="goal-list" style="text-align:left;margin-top:16px">${goalRows(res.goals, true)}</div>
        ${res.bounties && res.bounties.length ? `<div class="goal-list" style="text-align:left"><div class="k" style="margin-bottom:4px">${t('res.bounties')}</div>${bountyRows(res.bounties, true)}</div>` : ''}
        <div class="tally">${tally.map(([a, b]) => `<span>${esc(a)}</span><span>${esc(b)}</span>`).join('')}</div>
        ${res.earned ? `<div class="k">${t('res.earned')}${res.first ? ' · ' + esc(t('res.first')) : ''}</div><div class="earn"><span>${ICON.dew}+${res.earned.dew}</span><span>+${res.earned.xp} XP</span></div>` : ''}
        ${res.levelUps && res.levelUps.length ? `<div class="lvup">${esc(t('res.levelup', { n: res.levelUps[res.levelUps.length - 1] }))}<small>${res.levelUps.map((lv) => esc(perkText(lv))).join(' · ')}</small></div>` : ''}
        <div class="row" style="justify-content:center">
          <button class="btn ghost" data-act="week">${t('res.week')}</button>
          <button class="btn ghost" data-act="shop" data-arg="week">${t('res.shop')}${anyAffordable() ? '<i class="dot"></i>' : ''}</button>
          <button class="btn ${res.pass ? 'ghost' : 'sun'}" data-act="retry" ${res.pass ? '' : 'data-focus'}>${t('res.retry')}</button>
          ${res.pass && !last && idx >= 0 ? `<button class="btn sun" data-act="next" data-focus>${t('res.next')}</button>` : ''}
        </div></div>`);
      // count up, then the stars pop in
      const el = panel.querySelector('#r-score'), stars = panel.querySelectorAll('#r-stars svg');
      const t0 = performance.now(), dur = 1100;
      if (res.levelUps && res.levelUps.length) setTimeout(() => { if (panelKind === 'results') G.audio?.levelUp(); }, 1500);
      const tick = (now) => {
        const k = clamp((now - t0) / dur, 0, 1);
        el.textContent = Math.round(res.score * (1 - Math.pow(1 - k, 3)));
        if (k < 1 && panelKind === 'results') requestAnimationFrame(tick);
        else for (let i = 0; i < res.stars; i++) setTimeout(() => {
          const st = stars[i]; if (!st || panelKind !== 'results' || !st.isConnected) return;
          const path = st.querySelector('path'); path.setAttribute('fill', '#f2b631'); path.setAttribute('stroke', '#d8941a');
          st.classList.add('on'); G.audio?.star(i);
        }, 220 + i * 320);
      };
      requestAnimationFrame(tick);
    },

    // ---------------------------------------------------------------- moment-to-moment
    toast(text, kind = 'info') {
      const el = document.createElement('div');
      el.className = 'toast ' + kind; el.textContent = text;
      toasts.appendChild(el);
      while (toasts.children.length > 3) toasts.firstChild.remove();
      setTimeout(() => el.remove(), 3500);
    },
    pop(text, x, y, z, cls = 'good') {
      const p = project(x, y, z); if (!p) return;
      const el = document.createElement('div');
      el.className = 'pop ' + cls; el.textContent = text;
      el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px';
      pops.appendChild(el);
      setTimeout(() => el.remove(), 1450);
    },
    tip(text, step = 0) {
      const el = $('h-tip');
      if (!text) { el.classList.remove('on'); return; }
      $('h-tiptxt').textContent = text; $('h-tipstep').textContent = step + 1;
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    },
    flashTitle(text) { const el = $('bigtitle'); el.textContent = text; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); },
    setDay(idx) { $('h-dayk').textContent = dayLabel(idx); $('h-dayname').textContent = dayName(idx); },
    update(dt) {
      if (!hudEl.classList.contains('on')) return;
      const R = G.game.R;
      // clock and sun arc
      const dt01 = clamp(G.dayT, 0, 1);
      $('h-clock').textContent = R.day?.free ? '—' : fmtClock(dt01);
      const a = Math.PI * (1 - dt01);
      const sun = $('h-sun');
      sun.setAttribute('transform', `translate(${60 + Math.cos(a) * 52} ${40 - Math.sin(a) * 34})`);
      $('h-arcfill').setAttribute('stroke-dashoffset', (100 * (1 - dt01)).toFixed(1));
      // score
      const sc = $('h-score');
      if (+sc.dataset.v !== R.score) { sc.dataset.v = R.score; sc.textContent = R.score; sc.classList.add('bump'); clearTimeout(sc._t); sc._t = setTimeout(() => sc.classList.remove('bump'), 140); }
      // profile: level, experience (banked plus today's) and dewdrops
      const P = G.profile, need = xpToNext(P.level);
      $('h-lv').textContent = P.level;
      const xpNow = P.xp + R.xp;
      $('h-xp').style.width = (P.level >= MAX_LEVEL ? 100 : Math.min(100, Math.round((xpNow / need) * 100))) + '%';
      $('h-xpb').classList.toggle('full', xpNow >= need && P.level < MAX_LEVEL);
      $('h-dew').textContent = P.dew + R.dew;
      $('h-dewt').textContent = R.dew > 0 ? '+' + R.dew : '';
      // toolbar
      const slots = G.tools?.slots || [];
      const key = slots.map((sl) => sl.id + sl.tier).join(',');
      if (key !== toolKey) { toolKey = key; toolsEl.innerHTML = slots.map((sl) => `<button class="tool" data-tool="${sl.id}" title="${esc(t('item.' + sl.id))}"><span class="key">${sl.slot}</span>${ICON[sl.id]}<i class="cd"></i></button>`).join(''); }
      for (const el of toolsEl.children) {
        const sl = G.tools.slotFor(el.dataset.tool); if (!sl) continue;
        el.style.setProperty('--p', (sl.cd / sl.cdMax).toFixed(3));
        el.classList.toggle('ready', sl.cd <= 0);
      }
      $('h-tgather').classList.toggle('on', !!G.input?.touchGather);
      reticleEl.classList.toggle('on', G.sprite.drawing);
      // goals, then the day's bonus goals
      const gs = G.game.goalsStatus(), bs = G.game.bountyStatus();
      const gEl = $('h-goals');
      if (gs.length || bs.length) {
        gEl.style.display = '';
        const html = (gs.length ? `<div class="k">${t('intro.goals')}</div>` + goalRows(gs) : '') + (bs.length ? `<div class="k bk">${t('hud.bonus')}</div>` + bountyRows(bs, false) : '');
        if (gEl._h !== html) { gEl._h = html; gEl.innerHTML = html; }
      } else gEl.style.display = 'none';
      // wind
      const deg = (Math.atan2(G.wind.z, G.wind.x) * 180) / Math.PI + 90;
      $('h-arrow').style.transform = `rotate(${deg}deg)`;
      const dirs = getLang() === 'zh' ? ['东', '东南', '南', '西南', '西', '西北', '北', '东北'] : ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
      // name the wind by where it comes FROM
      const from = (Math.atan2(-G.wind.z, -G.wind.x) + Math.PI * 2) % (Math.PI * 2);
      const dname = dirs[Math.round(from / (Math.PI / 4)) % 8];
      $('h-windtxt').textContent = getLang() === 'zh' ? dname + '风' : 'from ' + dname;
      // controls
      const S = G.sprite;
      $('h-gustcd').style.width = Math.round((1 - S.gustCD / (S.gustCDMax || 0.5)) * 100) + '%';
      $('h-ck-gust').classList.toggle('on', S.gustT > 0);
      $('h-ck-draw').classList.toggle('on', S.drawing);
      $('h-ck-move').classList.toggle('on', S.speed > 6);
      // field badges
      G.crops.fields.forEach((f, i) => {
        const b = badges[i];
        if (!f.active) { b.el.style.opacity = 0; return; }
        const p = project(f.def.x, f.y + 3.2, f.def.z);
        if (!p) { b.el.style.opacity = 0; return; }
        b.el.style.opacity = 1;
        b.el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
        if (b.type !== f.type) { b.type = f.type; b.icon.innerHTML = ICON[f.type].replace(/^<svg[^>]*>|<\/svg>$/g, ''); }
        b.ring.setAttribute('stroke-dashoffset', (119.4 * (1 - clamp(f.growth, 0, 1))).toFixed(1));
        const m = clamp(f.moist, 0, 1);
        b.clip.setAttribute('y', (20.5 - 18 * m + 0.5).toFixed(2));
        const T = CROPS[f.type];
        const cls = f.dead ? 'dead' : f.health < 0.6 ? 'wilt' : f.moist < T.need ? 'thirsty' : f.growth > 0.85 ? 'ripe' : '';
        if (b.cls !== cls) { b.inner.classList.remove(b.cls || 'x'); if (cls) b.inner.classList.add(cls); b.cls = cls; }
      });
      // fire flags (clusters) and burning houses
      let fi = 0;
      const place = (kind, p) => {
        const el = flag(fi++);
        if (el.dataset.kind !== kind) { el.dataset.kind = kind; const f = el.firstChild; f.innerHTML = kind === 'house' ? ICON.house : ICON.flame; f.classList.toggle('house', kind === 'house'); }
        el.style.display = ''; el.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
      };
      for (const c of G.fire.clusters) {
        if (c.n < 4 || fi >= 3) continue;
        const p = project(c.x, groundAt(c.x, c.z) + 5, c.z); if (p) place('fire', p);
      }
      for (const h of G.props.houses) {
        if (h.fire <= 0 || h.lost) continue;
        const p = project(h.x, h.y + h.height + 2.5, h.z); if (p) place('house', p);
      }
      for (let i = fi; i < flagPool.length; i++) flagPool[i].style.display = 'none';
      // the fair / festival label over the square
      const day = R.day;
      if (day?.fair && G.game.fairActive()) {
        const Sq = LAYOUT.square;
        const p = project(Sq.x, groundAt(Sq.x, Sq.z) + 6.5, Sq.z);
        if (p) {
          zone.style.opacity = 1; zone.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`;
          const want = day.fair.wantsRain;
          const v = want ? clamp(R.gauge / day.gauge.need, 0, 1) : R.fairJoy;
          zone.querySelector('.zt').textContent = want ? t('hud.festival') : t('hud.fair');
          const zi = zone.querySelector('.zi'); const icon = want ? 'barrel' : 'tent';
          if (zi.dataset.i !== icon) { zi.dataset.i = icon; zi.innerHTML = ICON[icon].replace('<svg', '<svg width="14" height="14"'); }
          zone.querySelector('.bar i').style.width = Math.round(v * 100) + '%';
          zone.classList.toggle('low', !want && v < 0.6);
          zone.classList.toggle('rain', want);
        }
      } else zone.style.opacity = 0;
      const rodGoal = day?.goals.find((g) => g.type === 'rods');
      if (rodGoal) {
        const L = LAYOUT.lighthouse;
        const p = project(L.x, groundAt(L.x, L.z) + 14, L.z);
        if (p) { lh.style.opacity = 1; lh.style.transform = `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px)`; lh.querySelector('.bar i').style.width = Math.round(clamp(R.rodHits / rodGoal.n, 0, 1) * 100) + '%'; }
      } else lh.style.opacity = 0;
    },
    clearFx() { pops.innerHTML = ''; toasts.innerHTML = ''; hud.tip(null); },
  };
  return hud;
}
