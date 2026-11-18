// Headless harness: node tools/shot.mjs <scenario|script.mjs> [--q=high] [--w=1600 --h=900] [--t=0.4] [--lang=zh]
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')));
const scenario = process.argv[2] || 'title';
const W = +(args.w || 1600), H = +(args.h || 900);
const outDir = path.join(root, 'shots'); fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { const t = m.text(); if (!/GPU stall|Automatic fallback to software/.test(t)) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const extra = Object.entries(args).filter(([k]) => !['w', 'h', 'notest'].includes(k)).map(([k, v]) => `&${k}=${v}`).join('');
const url = pathToFileURL(path.join(root, 'cloudherd.html')).href + (args.notest ? '?x=1' : '?test') + extra;
await page.goto(url);
await page.waitForFunction('window.__ch || (window.__errors && window.__errors.length)', { timeout: 120000 });
const shot = async (name) => { await page.screenshot({ path: path.join(outDir, name + '.png') }); console.log('shot', name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, ...a) => page.evaluate(fn, ...a);

const scenarios = {
  async title() { await sleep(1500); await shot('title'); },
  async island() { await sleep(1200); await shot('island'); },
};
if (scenarios[scenario]) await scenarios[scenario]();
else { const mod = await import(pathToFileURL(path.resolve(scenario)).href); await mod.default({ page, shot, sleep, ev, args }); }

const info = await ev(() => {
  const ch = window.__ch; if (!ch) return { errors: window.__errors };
  const r = ch.G.renderer, gl = r.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { errors: window.__errors, mode: ch.G.mode, gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?', calls: r.info.render.calls, tris: r.info.render.triangles, programs: r.info.programs.length };
});
console.log(JSON.stringify(info));
if (logs.length) console.log(logs.slice(0, 40).join('\n'));
await browser.close();
