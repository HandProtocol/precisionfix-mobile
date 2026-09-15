import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedMedia } from '../netlify/functions/lib/config.mjs';
import { DEFAULT_CONTENT, SECTIONS, renderPage, sanitize } from '../netlify/functions/lib/site.mjs';
import { renderAdminPage } from '../netlify/functions/lib/admin-page.mjs';
import { THEMES, THEME_IDS, pickTheme } from '../site/themes.mjs';
import { CHECKLIST } from '../site/checklist.mjs';

const ORIGIN = 'https://precisionfix.test';
const full = (extra = {}) => renderPage({ content: sanitize(DEFAULT_CONTENT), media: seedMedia(), origin: ORIGIN, ...extra });

test('renders every section, the nav, the booking form, lightbox data, JSON-LD and the owner link', () => {
  const html = full();
  for (const id of ['id="creds"', 'id="services"', 'id="why"', 'id="work"', 'id="area"', 'id="book"']) assert.ok(html.includes(id), id);
  assert.match(html, /<nav class="nav__links"[^>]*><a href="#services"[^>]*>Services<\/a><a href="#why"[^>]*>Why me<\/a><a href="#work"[^>]*>Work<\/a><a href="#area"[^>]*>Area<\/a><a href="#book"[^>]*>Book<\/a><\/nav>/);
  assert.match(html, /id="site-media"/);
  assert.match(html, /id="lightbox"/);
  assert.match(html, /href="\/admin\/"/);
  assert.match(html, /"@type":"AutoRepair"/);
  assert.match(html, /"areaServed":\[\{"@type":"City","name":"Austin"\}/);
  assert.match(html, /href="tel:5125713425"/);
  assert.match(html, /class="hero__line">Precision<\/span><span class="hero__line hero__line--alt">Fix<\/span>/);
  assert.equal(html.includes('${'), false);
});

test('the booking form is a Netlify form with every field the static definition and the email config list', async () => {
  const html = full();
  assert.match(html, /<form class="form" id="bookform" name="booking" method="POST" action="\/forms\/booking\.html" data-netlify="true" netlify-honeypot="bot-field">/);
  assert.match(html, /<input type="hidden" name="form-name" value="booking">/);
  const { readFileSync } = await import('node:fs');
  const staticDef = readFileSync(new URL('../public/forms/booking.html', import.meta.url), 'utf8');
  const { default: cfg } = await import('../site.config.mjs');
  const names = (s) => [...s.matchAll(/name="([a-z_-]+)"/g)].map((m) => m[1]).filter((n) => !['booking', 'form-name', 'robots'].includes(n));
  const live = new Set(names(html.slice(html.indexOf('id="bookform"'), html.indexOf('</form>'))));
  for (const n of names(staticDef)) assert.ok(live.has(n), `static form field ${n} missing from the live form`);
  for (const f of cfg.forms.booking.fields) assert.ok(live.has(f.key), `email field ${f.key} not in the form`);
  for (const s of DEFAULT_CONTENT.services.items) assert.ok(html.includes(`<option value="${s.title.replace(/&/g, '&amp;')}"`), s.title);
  assert.match(html, /<option value="Cedar Park">Cedar Park<\/option>/);
  assert.match(html, /name="vehicle_year"[^>]*required/);
  assert.match(html, /name="issue"[^>]*required/);
});

test('every theme renders with its own data-theme, stylesheet, fonts and palette; ?theme= wins over the owner pick; bad ids fall back', () => {
  for (const id of THEME_IDS) {
    const html = full({ url: `${ORIGIN}/?theme=${id}` });
    assert.ok(html.includes(`<html lang="en" data-theme="${id}">`), id);
    assert.ok(html.includes(`/assets/themes/${id}.css?v=`), id);
    assert.ok(html.includes(THEMES[id].fonts.googleCss.replace(/&/g, '&amp;')), id);
    assert.ok(html.includes(`--bg:${THEMES[id].palette.bg}`), id);
    assert.ok(html.includes(`theme-color" content="${THEMES[id].palette.bg}"`), id);
  }
  const owner = sanitize({ ...DEFAULT_CONTENT, site: { theme: 'sunset', lang_toggle: true } });
  assert.match(renderPage({ content: owner, media: seedMedia(), origin: ORIGIN }), /data-theme="sunset"/);
  assert.match(renderPage({ content: owner, media: seedMedia(), origin: ORIGIN, url: `${ORIGIN}/?theme=terminal` }), /data-theme="terminal"/);
  assert.equal(pickTheme({ url: `${ORIGIN}/?theme=nope`, content: owner }).id, 'sunset');
  assert.equal(pickTheme({ url: 'not a url', content: {} }).id, 'redline');
  assert.equal(sanitize({ site: { theme: 'bogus' } }).site.theme, 'redline');
});

test('escapes owner text in English and Spanish, including inside data-es and form options', () => {
  const c = sanitize({
    hero: { headline: '<script>x</script>\nhi', subhead_es: '"><img src=x>' },
    brand: { name: '"><b>n</b>' },
    services: { items: [{ title: '<i>svc</i>', title_es: 'a"b' }] },
  });
  const html = renderPage({ content: c, media: seedMedia() });
  for (const bad of ['<script>x</script>', '<img src=x>', '<b>n</b>', '<i>svc</i>', 'data-es="a"b"']) assert.equal(html.includes(bad), false, bad);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-es="&quot;&gt;&lt;img src=x&gt;"/);
});

test('emptied lists hide their sections and drop their nav links; the language switch can be turned off', () => {
  const c = sanitize({ credentials: { items: [] }, services: { items: [] }, why: { items: [] }, area: { heading: '', cities: [] }, site: { lang_toggle: false } });
  const html = renderPage({ content: c, media: [] });
  for (const id of ['id="creds"', 'id="services"', 'id="why"', 'id="work"', 'id="area"', 'id="lightbox"', 'lang-toggle']) assert.equal(html.includes(id), false, id);
  assert.match(html, /<nav class="nav__links"[^>]*><a href="#book"[^>]*>Book<\/a><\/nav>/);
  assert.match(html, /id="book"/);
  assert.match(html, /<option value="Something else"/);
});

test('the Search Console code becomes a meta tag; the schema carries the hidden setup section; the admin has a Setup tab', () => {
  const c = sanitize({ seo: { google_verification: 'AbC123_-xyzXYZ' } });
  assert.match(renderPage({ content: c, media: seedMedia() }), /<meta name="google-site-verification" content="AbC123_-xyzXYZ">/);
  const setup = SECTIONS.find((s) => s.key === 'setup');
  assert.ok(setup && setup.hidden);
  assert.deepEqual(setup.fields.map((f) => f.key), CHECKLIST.map((i) => i.id));
  assert.equal(sanitize({ setup: { domain: true } }).setup.domain, true);
  const admin = renderAdminPage();
  assert.match(admin, /data-tab="setup"/);
  for (const it of CHECKLIST) assert.ok(admin.includes(`data-setup="${it.id}"`), it.id);
  assert.match(admin, /Namecheap/);
  assert.equal(admin.includes('${'), false);
});
