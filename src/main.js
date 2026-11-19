// CLOUDHERD - boot, render pipeline, modes and the main loop.
import * as THREE from 'three';
import { G } from './state.js';
import { createSky } from './sky.js';
import { createIsland } from './island.js';
import { createClimate } from './climate.js';
import { createPost, QUALITY } from './post.js';
import { createProps } from './props.js';
import { createClouds } from './clouds.js';
import { createSprite } from './sprite.js';
import { createInput } from './input.js';
import { createFx } from './fx.js';
import { createCrops } from './crops.js';
import { createWeather } from './weather.js';
import { createFire } from './fire.js';
import { createVillage } from './village.js';
import { createGame } from './game.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createBot } from './bot.js';
import { createTools } from './tools.js';
import { createHelper } from './helper.js';
import { freshProfile, buy, shopItem } from './profile.js';
import { DAYS } from './levels.js';
import { t, setLang, detectLang } from './i18n.js';
import { damp, clamp, lerp } from './util.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const CAM_PLAY = { pos: new THREE.Vector3(0, 98, 92), look: new THREE.Vector3(0, 0, 9) };

async function boot() {
  const canvas = document.getElementById('view');
  const bootEl = document.getElementById('boot'), bootMsg = document.getElementById('boot-msg'), bootFill = document.getElementById('boot-fill');
  const params = new URLSearchParams(location.search);
  G.test = params.has('test');
  // settings and progress
  try { Object.assign(G.settings, JSON.parse(localStorage.getItem('cloudherd.settings') || '{}')); } catch (e) { /* private mode */ }
  try { const p = JSON.parse(localStorage.getItem('cloudherd.progress') || 'null'); if (p && Array.isArray(p.stars)) Object.assign(G.progress, p); } catch (e) { /* ignore */ }
  G.profile = freshProfile();
  try { const p = JSON.parse(localStorage.getItem('cloudherd.profile') || 'null'); if (p && p.v === 1) Object.assign(G.profile, p, { owned: { ...(p.owned || {}) } }); } catch (e) { /* ignore */ }
  if (G.test) { G.progress = { unlocked: 7, stars: [0, 0, 0, 0, 0, 0, 0], best: [0, 0, 0, 0, 0, 0, 0] }; G.profile = freshProfile(); }
  G.saveProfile = () => { if (G.test) return; try { localStorage.setItem('cloudherd.profile', JSON.stringify(G.profile)); } catch (e) { /* ignore */ } };
  if (!QUALITY[G.settings.quality]) G.settings.quality = 'high';
  if (params.get('q')) G.settings.quality = params.get('q');
  G.settings.lang = setLang(params.get('lang') || G.settings.lang || detectLang());
  let hadSettings = false;
  try { hadSettings = !!localStorage.getItem('cloudherd.settings'); } catch (e) { /* storage blocked */ }
  if (!hadSettings && !params.get('lang')) G.settings.lang = setLang(detectLang());
  document.documentElement.lang = G.settings.lang === 'zh' ? 'zh-CN' : 'en';
  const saveSettings = () => { try { localStorage.setItem('cloudherd.settings', JSON.stringify(G.settings)); } catch (e) { /* ignore */ } };
  G.saveProgress = () => { if (G.test) return; try { localStorage.setItem('cloudherd.progress', JSON.stringify(G.progress)); } catch (e) { /* ignore */ } };
  const stage = async (key, pct) => { bootMsg.textContent = t(key); bootFill.style.width = pct + '%'; await nextFrame(); await nextFrame(); };

  await stage('boot.1', 8);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }); }
  catch (e) { bootMsg.textContent = t('fail.webgl'); throw e; }
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  G.renderer = renderer;
  const scene = G.scene = new THREE.Scene();
  const camera = G.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 1, 2000);
  camera.position.copy(CAM_PLAY.pos); camera.lookAt(CAM_PLAY.look);
  G.climate = createClimate();
  G.climate.reset(0.35, 0.25, 1);
  G.island = createIsland(scene);
  G.sky = createSky(scene);
  await stage('boot.2', 30);
  G.props = createProps(scene);
  G.crops = createCrops(scene);
  G.fire = createFire();
  await stage('boot.3', 55);
  G.clouds = createClouds(scene);
  G.fx = createFx(scene);
  G.weather = createWeather(scene, camera);
  G.sprite = createSprite(scene, camera);
  G.tools = createTools(scene);
  G.helper = createHelper(scene);
  G.clouds.holders = [G.sprite, G.helper];
  G.village = createVillage(scene);
  G.input = createInput(canvas);
  G.audio = createAudio();
  G.game = createGame();
  G.bot = createBot();
  const post = G.post = createPost(renderer, scene, camera);
  post.shake = 0;
  post.apply();
  addEventListener('resize', () => post.apply());
  G.hud = createHud(document.getElementById('ui'));
  G.game.wire();

  // ---------------------------------------------------------------- modes
  const setMode = (m) => { G.mode = m; G.hud.setMode(m); };
  let introIdx = 0, pausedAt = 0;
  const unlockAudio = () => G.audio.init();
  addEventListener('pointerdown', unlockAudio, { capture: true });
  addEventListener('keydown', unlockAudio, { capture: true });

  const putAway = () => { G.tools.clear(); G.helper.setup(false); };
  const toTitle = () => {
    G.game.bank(); putAway();
    G.hud.clearFx(); G.game.attract(); setMode('title'); G.hud.showTitle();
    G.sprite.active = true; G.sprite.autopilot = { tx: 0, tz: 0, draw: false, gust: false };
  };
  const toWeek = () => { G.game.bank(); if (G.mode !== 'title' && G.mode !== 'week') { putAway(); G.game.attract(); G.sprite.active = true; G.sprite.autopilot = { tx: 0, tz: 0 }; } setMode('week'); G.hud.showWeek(); };
  const toIntro = (idx) => {
    G.game.bank(); putAway();
    introIdx = idx;
    G.hud.clearFx();
    G.sprite.autopilot = null;
    G.game.begin(idx);
    G.hud.setDay(idx);
    setMode('intro'); G.hud.showIntro(idx);
  };
  const startDay = () => {
    G.hud.closePanel(); G.input.clear();
    G.game.play(); setMode('playing');
    canvas.focus?.();
  };
  const pause = () => { if (G.mode !== 'playing') return; pausedAt = performance.now(); setMode('paused'); G.hud.showPause(); G.input.clear(); };
  const resume = () => { if (G.mode !== 'paused') return; G.hud.closePanel(); setMode('playing'); };
  G.onDayEnd = (res) => { setMode('results'); G.hud.tip(null); G.hud.showResults(res); };
  let settingsFrom = 'title';

  G.hud.on.play = () => { const P = G.progress; if (P.unlocked === 1 && !P.stars[0] && !G.test) toIntro(0); else toWeek(); };
  G.hud.on.free = () => toIntro('free');
  G.hud.on.title = () => toTitle();
  G.hud.on.week = () => toWeek();
  G.hud.on.pick = (i) => toIntro(i);
  G.hud.on.start = () => startDay();
  G.hud.on.resume = () => resume();
  G.hud.on.restart = () => toIntro(introIdx);
  G.hud.on.retry = () => toIntro(introIdx);
  G.hud.on.next = () => toIntro(Math.min(DAYS.length - 1, introIdx + 1));
  G.hud.on.quit = () => (introIdx === 'free' ? toTitle() : toWeek());
  let shopFrom = 'week';
  G.hud.on.shop = (from) => { shopFrom = typeof from === 'string' ? from : 'week'; if (G.mode !== 'week' && G.mode !== 'title') toWeek(); G.profile.shopSeen = true; G.saveProfile(); G.hud.showShop(); };
  G.hud.on.buy = (id) => { if (buy(id)) { G.audio.buy(); G.hud.toast(G.hud.shopName(id), 'good'); } G.hud.showShop(); };
  G.hud.on.shopBack = () => (shopFrom === 'title' ? G.hud.showTitle() : G.hud.showWeek());
  G.hud.on.gather = () => { G.input.touchGather = !G.input.touchGather; };
  G.hud.on.gustBtn = () => { G.input.gustQueued = true; };
  G.hud.on.tool = (id) => G.tools.use(id);
  G.hud.on.settings = (from) => { if (typeof from === 'string' && from) { settingsFrom = from; G.hud.showSettings(from); return; } };
  G.hud.on.lang = (l) => { G.settings.lang = setLang(l); document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'; saveSettings(); rebuildHud(); G.hud.showTitle(); };
  G.hud.on.set = (arg) => {
    const [k, v] = String(arg).split(':');
    G.settings[k] = v === 'true' ? true : v === 'false' ? false : v;
    if (k === 'quality' || k === 'tilt') post.apply();
    if (k === 'lang') { setLang(v); document.documentElement.lang = v === 'zh' ? 'zh-CN' : 'en'; rebuildHud(); }
    if (k === 'swapButtons') rebuildHud();
    saveSettings(); G.hud.showSettings(settingsFrom);
  };
  G.hud.on.settingsDone = (from) => { saveSettings(); if (from === 'pause') G.hud.showPause(); else G.hud.showTitle(); };
  // volume sliders report through on.settings with the key name
  const settingsHook = G.hud.on.settings;
  G.hud.on.settings = (k) => { if (k === 'volume' || k === 'music' || k === 'ambience') { G.audio.setVolume(); saveSettings(); return; } settingsHook(k); };
  function rebuildHud() {
    // text is baked into the HUD markup, so rebuild it on a language change
    const on = G.hud.on;
    G.hud = createHud(document.getElementById('ui'));
    Object.assign(G.hud.on, on);
    G.hud.setMode(G.mode);
    if (G.mode !== 'title' && G.game.R.day) G.hud.setDay(introIdx);
    G.game.retip();
  }

  G.input.onMove = (x, y) => G.hud.reticle(x, y);
  G.input.onKey = (code) => {
    if (code === 'Escape' || code === 'KeyP') {
      if (G.mode === 'playing') pause();
      else if (G.mode === 'paused' && performance.now() - pausedAt > 250 && G.hud.panelKind === 'pause') resume();
    }
    if (code === 'Enter' && G.hud.panelOpen && document.activeElement?.tagName !== 'BUTTON') G.hud.primary();
    if (code === 'KeyF' && !G.hud.panelOpen) { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  addEventListener('pagehide', () => G.game.bank());

  // ---------------------------------------------------------------- prewarm every shader behind the boot screen
  await stage('boot.4', 85);
  G.game.attract();
  G.clouds.spawn(0, 0, 8, 'water', { instant: true });
  G.clouds.spawn(10, 0, 1, 'smog', { instant: true });
  G.fx.puff(0, 10, 0, 3); G.fx.sparkle(0, 10, 0, 3); G.fx.flame(0, 5, 0); G.fx.streak(0, 10, 0, 1, 0);
  G.weather.strike(0, 0, 2, 2); G.weather.rainbow(0, 0, 1);
  G.village.fair.visible = G.village.laundryGroup.visible = G.village.gauge.visible = true;
  for (const p of G.tools.pegs) p.g.visible = true;
  G.helper.setup(false);
  G.sky.update(0.3, camera);
  renderer.compile(scene, camera);
  post.render(0.016);
  G.weather.clear(); G.fx.clear();
  G.village.fair.visible = G.village.laundryGroup.visible = G.village.gauge.visible = false;
  for (const p of G.tools.pegs) p.g.visible = false;
  await stage('boot.4', 100);

  toTitle();
  bootEl.classList.add('done');
  setTimeout(() => bootEl.remove(), 900);

  // ---------------------------------------------------------------- loop
  let last = performance.now(), perfT = 0, perfN = 0, slow = 0, climateT = 0;
  const look = new THREE.Vector3().copy(CAM_PLAY.look), camPos = new THREE.Vector3().copy(CAM_PLAY.pos);
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000)); last = now;
    G.real += rdt;
    const running = G.mode !== 'paused' && G.mode !== 'boot';
    const steps = running ? Math.max(1, Math.round(G.timeScale)) : 0;
    const dt = running ? rdt * (G.timeScale < 1 ? G.timeScale : 1) : 0;
    for (let s = 0; s < steps; s++) step(dt);
    // camera
    const S = G.sprite;
    if (G.mode === 'title' || G.mode === 'week') {
      const a = G.real * 0.05;
      camPos.set(Math.sin(a) * 16, 74, 100 + Math.cos(a * 0.7) * 6); look.set(Math.sin(a) * 4, 0, 2);
    } else {
      // fixed while playing: a drifting camera moves the ground under a still pointer and feels like lag
      camPos.copy(CAM_PLAY.pos); look.copy(CAM_PLAY.look);
    }
    const k = 1 - Math.exp(-rdt * 2.2);
    camera.position.lerp(camPos, k);
    camera.userData.look = (camera.userData.look || look.clone()).lerp(look, k);
    post.shake = damp(post.shake, 0, 4, rdt);
    camera.lookAt(camera.userData.look);
    if (post.shake > 0.01) { camera.position.x += (Math.random() - 0.5) * post.shake; camera.position.y += (Math.random() - 0.5) * post.shake; }
    post.U.uFlash.value = G.shared.flash.value * 0.6;
    post.U.uWarm.value = clamp((G.dayT - 0.7) / 0.3, 0, 1) * 0.6;
    G.sky.update(G.dayT, camera);
    G.audio.update(rdt);
    G.hud.update(rdt);
    post.render(rdt);
    G.input.endFrame();
    // a machine that cannot keep up steps quality down once
    if (G.mode === 'playing' && !G.test) {
      perfT += rdt; perfN++;
      if (perfT > 4) { const fps = perfN / perfT; perfT = 0; perfN = 0; slow = fps < 38 ? slow + 1 : 0; if (slow >= 2 && G.settings.quality !== 'low') { G.settings.quality = G.settings.quality === 'high' ? 'medium' : 'low'; post.apply(); slow = 0; } }
    }
  }
  function step(dt) {
    G.time += dt; G.shared.time.value = G.time;
    G.sun01 = Math.sin(Math.PI * clamp(G.dayT, 0, 1));
    G.game.update(dt);
    // the title screen's spirit wanders on its own, herding a little
    const S = G.sprite;
    if (S.autopilot && (G.mode === 'title' || G.mode === 'week')) {
      const a = G.time * 0.23;
      S.autopilot.tx = Math.sin(a) * 30 + Math.sin(a * 2.3) * 8; S.autopilot.tz = Math.cos(a * 0.8) * 22 + 4;
      S.autopilot.draw = Math.sin(G.time * 0.4) > 0.6;
    }
    G.bot.update(dt);
    S.update(dt, G.mode === 'playing' && !G.bot.on ? G.input : null);
    G.helper.update(dt);
    G.tools.update(dt);
    // the day only moves on while it is being played; the intro card and the results hold it still
    const live = G.mode === 'playing' || G.mode === 'dusk', backdrop = G.mode === 'title' || G.mode === 'week';
    G.clouds.frozen = G.mode === 'intro';
    G.clouds.update(dt);
    G.crops.update(live ? dt : 0);
    if (live || backdrop) G.fire.update(dt);
    const dry = (G.day?.dryRate ?? 0.004) * (G.settings.relaxed ? 0.7 : 1) * (0.35 + 0.65 * G.sun01);
    G.climate.update(dt, live ? dry * (G.pace ?? 1) : backdrop ? dry * 0.3 : 0);
    G.climate.upload();
    G.props.trees.refresh();
    G.props.update(dt);
    G.village.update(dt);
    G.weather.update(dt);
    G.fx.update(dt);
  }
  requestAnimationFrame(frame);

  // test hooks
  window.__ch = {
    G, THREE,
    startDay: (i) => { toIntro(i); startDay(); },
    toWeek, toTitle, pause, resume,
    setProfile: (p) => { Object.assign(G.profile, p); G.mods = null; },
    useTool: (id) => G.tools.use(id),
    skip: (sec) => { for (let i = 0; i < sec * 30; i++) step(1 / 30); },
    // play a whole day with the bot at full speed; returns the result
    botDay: (i, skill = 1) => {
      let res = null;
      const prev = G.onDayEnd;
      G.onDayEnd = (r) => { res = r; prev(r); };
      window.__ch.startDay(i); G.bot.start(skill);
      for (let n = 0; n < 60 * 30 * 8 && !res; n++) step(1 / 30);
      G.bot.stop(); G.onDayEnd = prev;
      return res && { pass: res.pass, stars: res.stars, score: res.score, goals: res.goals.map((g) => [g.g.type, g.done, g.count]), stats: res.stats };
    },
  };
}

boot().catch((e) => { console.error(e); (window.__errors = window.__errors || []).push(String(e && e.stack || e)); const f = document.getElementById('fatal'); if (f) { f.style.display = 'block'; f.textContent += String(e && e.stack || e); } });
