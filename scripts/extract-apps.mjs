// Pulls the 32 working apps and the logo out of the original single-file management system page.
// Usage: node scripts/extract-apps.mjs "<path to ferentino-management-system.html>"
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2] || path.resolve('..', 'ferentino-management-system (2).html');
const html = fs.readFileSync(src, 'utf8');
const out = path.resolve('public', 'apps');
fs.mkdirSync(out, { recursive: true });

const b64 = {};
for (const m of html.matchAll(/var (APP\d+)_B64 = "([^"]+)"/g)) b64[m[1]] = m[2];

const keys = {};
for (const m of html.matchAll(/^\s*(\w+):\s*\{ src: (APP\d+)_B64,\s*title: '([^']+)'/gm)) keys[m[1]] = { app: m[2], title: m[3] };

let n = 0;
for (const [key, { app }] of Object.entries(keys)) {
  if (!b64[app]) throw new Error('missing ' + app);
  fs.writeFileSync(path.join(out, key + '.html'), Buffer.from(b64[app], 'base64'));
  n++;
}
console.log('apps written:', n);

const logo = html.match(/class="cover-logo[^"]*" src="data:image\/jpeg;base64,([^"]+)"/);
if (logo) { fs.writeFileSync(path.resolve('public', 'logo.jpg'), Buffer.from(logo[1], 'base64')); console.log('logo written'); }
