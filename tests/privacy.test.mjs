import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { renderPrivacyPage, UPDATED } from '../site/privacy.mjs';
import { THEMES } from '../site/themes.mjs';
import { fontLinks } from '../netlify/functions/lib/html.mjs';
import { config } from '../netlify/functions/privacy.mjs';

const content = { brand: { name: 'PrecisionFix' }, site: { theme: 'redline', lang_toggle: true }, contact: { phone: '(512) 571-3425', email: '' } };

test('privacy page: canonical on the production address, dated, bilingual, contact from content', () => {
  const html = renderPrivacyPage({ content, url: 'https://x.test/privacy/' });
  assert.match(html, /<link rel="canonical" href="https:\/\/precisionfixmobile\.com\/privacy\/">/);
  assert.ok(html.includes(UPDATED.en) && html.includes(UPDATED.es));
  assert.match(html, /data-es="Política de privacidad">Privacy policy<\/h1>/);
  assert.ok(html.includes('Call or text (512) 571-3425.'));
  assert.equal(html.includes('Email '), false, 'no email line when the owner has not published one');
  assert.match(html, /Do Not Track/);
  assert.match(html, /class="lang-toggle"/);
});

test('privacy page: wears the chosen theme and loads nothing from Google', () => {
  const html = renderPrivacyPage({ content: { ...content, site: { theme: 'sunset' } }, url: 'https://x.test/privacy/' });
  assert.match(html, /data-theme="sunset"/);
  assert.match(html, /\/assets\/fonts\/sunset\.css/);
  assert.equal(/googleapis|gstatic/.test(html), false);
  assert.equal(html.includes('lang-toggle'), false, 'no toggle when the owner turned it off');
});

test('privacy route answers /privacy and /privacy/', () => {
  assert.deepEqual(config.path, ['/privacy', '/privacy/']);
});

test('home page footer links the privacy policy', () => {
  const src = readFileSync(new URL('../site/page.mjs', import.meta.url), 'utf8');
  assert.match(src, /href="\/privacy\/"/);
});

test('every theme points at a self-hosted font stylesheet that exists, with local font files only', () => {
  for (const t of Object.values(THEMES)) {
    assert.match(t.fonts.googleCss, /^\/assets\/fonts\/[a-z]+\.css$/, t.id);
    const file = new URL(`../public${t.fonts.googleCss}`, import.meta.url);
    assert.ok(existsSync(file), t.fonts.googleCss);
    const css = readFileSync(file, 'utf8');
    assert.equal(/https?:/.test(css), false, `${t.id} css must not reference a remote host`);
    for (const [, f] of css.matchAll(/url\((\/assets\/fonts\/files\/[^)]+)\)/g)) assert.ok(existsSync(new URL(`../public${f}`, import.meta.url)), f);
  }
});

test('fontLinks: local stylesheet gets no preconnect; a Google URL keeps its two', () => {
  assert.equal(fontLinks('/assets/fonts/redline.css'), '<link href="/assets/fonts/redline.css" rel="stylesheet">');
  const g = fontLinks('https://fonts.googleapis.com/css2?family=Inter');
  assert.match(g, /preconnect" href="https:\/\/fonts\.googleapis\.com"/);
  assert.match(g, /preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin/);
  assert.equal(fontLinks(''), '');
});
