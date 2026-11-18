// Bundles src/main.js + three.js into one self-contained HTML file: cloudherd.html
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');

const res = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: !dev,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});

const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\/script');
const tpl = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const html = tpl.replace('/*__BUNDLE__*/', () => js);
const out = path.join(root, 'cloudherd.html');
fs.writeFileSync(out, html);
console.log(`built ${path.basename(out)}  ${(html.length / 1024).toFixed(0)} KB${dev ? '  (dev)' : ''}`);
