// Self-host each theme's Google Fonts so no visitor request goes to Google
// (no third party sees the visitor's IP; see /privacy/). Keeps the latin and
// latin-ext subsets only (English + Spanish). Writes
// public/assets/fonts/<theme>.css and public/assets/fonts/files/*.woff2.
//
//   node scripts/self-host-fonts.mjs
//
// To change a theme's fonts: edit SOURCES, run this, bump assetVersion.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCES = {
  redline: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap',
  blueprint: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
  chrome: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600&display=swap',
  sunset: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Nunito:wght@400;600;700;800&display=swap',
  terminal: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap',
};
const SUBSETS = new Set(['latin', 'latin-ext']);
// a woff2-capable browser, or Google answers with ttf
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const ROOT = fileURLToPath(new URL('../public/assets/fonts/', import.meta.url));
mkdirSync(`${ROOT}files`, { recursive: true });

for (const [id, src] of Object.entries(SOURCES)) {
  const res = await fetch(src, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${id}: Google Fonts said ${res.status}`);
  const css = await res.text();
  const faces = [...css.matchAll(/\/\* ([a-z-]+) \*\/\s*(@font-face \{[^}]+\})/g)].filter((m) => SUBSETS.has(m[1]));
  if (!faces.length) throw new Error(`${id}: no latin faces in the Google CSS`);
  let out = `/* ${id}: self-hosted from Google Fonts (SIL Open Font License), latin + latin-ext. Made by scripts/self-host-fonts.mjs. */\n`;
  for (const [, subset, face] of faces) {
    const url = face.match(/url\((https:[^)]+)\)/)[1];
    const parts = new URL(url).pathname.split('/'); // /s/<family>/<version>/<file>
    const name = `${parts[2]}-${parts[4]}`;
    if (!existsSync(`${ROOT}files/${name}`)) {
      const f = await fetch(url);
      if (!f.ok) throw new Error(`${id}: ${url} said ${f.status}`);
      writeFileSync(`${ROOT}files/${name}`, Buffer.from(await f.arrayBuffer()));
    }
    out += `/* ${subset} */\n${face.replace(url, `/assets/fonts/files/${name}`)}\n`;
  }
  writeFileSync(`${ROOT}${id}.css`, out);
  console.log(`${id}: ${faces.length} faces`);
}
