import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../netlify/functions/lib/blocks.mjs';
import { DEFAULT_CONTENT } from '../site/schema.mjs';
import { config } from '../netlify/functions/lib/config.mjs';

// Fixture content so these tests do not depend on the site pack's defaults.
const base = () => ({
  ...JSON.parse(JSON.stringify(DEFAULT_CONTENT)),
  brand: { name: 'Fixture', tagline: 't' },
  hero: { cta_primary: 'Book now' },
  contact: { booking_url: '', phone: '(512) 555-0100', email: 'hi@example.com', instagram: '' },
  seo: { title: 'Fixture title', description: 'Fixture description' },
});

test('primaryCta resolves booking → phone → email → anchor', () => {
  const c = base();
  c.contact.booking_url = 'https://cal.example/book';
  assert.equal(B.primaryCta(c).kind, 'book');
  c.contact.booking_url = 'javascript:alert(1)';
  assert.equal(B.primaryCta(c).kind, 'call');
  c.contact.phone = '';
  assert.equal(B.primaryCta(c).kind, 'email');
  c.contact.email = '';
  assert.deepEqual(B.primaryCta(c, { anchor: '#contact' }).href, '#contact');
});

test('ctaButton opens external booking links in a new tab and escapes labels', () => {
  const html = B.ctaButton({ kind: 'book', href: 'https://x.y/"', label: '<b>', external: true });
  assert.match(html, /target="_blank" rel="noopener"/);
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /https:\/\/x\.y\/&quot;/);
});

test('themeVars emits every token plus rgb triplets for hex values', () => {
  const vars = B.themeVars();
  assert.ok(vars.includes(`--accent:${config.theme.accent}`));
  assert.match(vars, /--accent-rgb:\d+ \d+ \d+/);
  assert.match(vars, /--font-display:/);
});

test('headTags carries canonical, og, theme-color, fonts and the theme style', () => {
  // the canonical is the production address even when another host served the page
  const html = B.headTags({ content: base(), featured: null, origin: 'https://example.test' });
  const prod = config.productionUrl.replace(/[.\/]/g, '\\$&');
  assert.match(html, new RegExp(`<link rel="canonical" href="${prod}/">`));
  assert.match(html, new RegExp(`property="og:url" content="${prod}/"`));
  assert.equal(html.includes('example.test'), false);
  assert.match(html, /property="og:site_name"/);
  assert.ok(html.includes(`name="theme-color" content="${config.theme.bg}"`));
  assert.match(html, /<style id="theme">:root\{/);
  if (config.fonts.googleCss) assert.ok(html.includes(`href="${config.fonts.googleCss}"`));
});

test('img renders srcset for uploads and none for local files', () => {
  const local = { src: '/img/placeholder/ph-01.svg', srcset: '', alt: 'a', width: 10, height: 20 };
  assert.equal(B.img(local).includes('srcset'), false);
  const up = { src: '/.netlify/images?url=x&w=1200', srcset: '/.netlify/images?url=x&w=480 480w', alt: 'a', width: 10, height: 20 };
  assert.match(B.img(up, { sizes: '50vw' }), /srcset=.* sizes="50vw"/);
  assert.match(B.img(up, { eager: true }), /fetchpriority="high"/);
});

test('footerLinks respects white-label', () => {
  assert.match(B.footerLinks(), /Made by HAND/);
  assert.match(B.footerLinks(), /Owner sign in/);
});

test('headTags: a runtime theme + fonts override the config palette; a valid verification code becomes a meta tag', async () => {
  const B = await import('../netlify/functions/lib/blocks.mjs');
  const content = { brand: { name: 'X' }, seo: { title: 'T', description: 'D', google_verification: 'abcDEF123-_xyz' } };
  const html = B.headTags({ content, featured: null, origin: 'https://x.test', theme: { bg: '#123456', ink: '#fff', accent: '#f00' }, fonts: { googleCss: 'https://fonts.googleapis.com/css2?family=Inter', display: 'Inter', body: 'Inter' } });
  assert.match(html, /--bg:#123456/);
  assert.match(html, /--font-display:Inter/);
  assert.match(html, /theme-color" content="#123456"/);
  assert.match(html, /family=Inter/);
  assert.match(html, /<meta name="google-site-verification" content="abcDEF123-_xyz">/);
  const bad = B.headTags({ content: { ...content, seo: { google_verification: '<script>' } }, featured: null });
  assert.equal(bad.includes('google-site-verification'), false);
  assert.match(B.headTags({ content, featured: null }), new RegExp(`--bg:${B.config.theme.bg}`));
  // Bing Webmaster Tools verifies the same way
  const bing = B.headTags({ content: { ...content, seo: { bing_verification: 'ABCDEF0123456789ABCDEF0123456789' } }, featured: null });
  assert.match(bing, /<meta name="msvalidate\.01" content="ABCDEF0123456789ABCDEF0123456789">/);
  assert.equal(B.headTags({ content: { ...content, seo: { bing_verification: '"><x' } }, featured: null }).includes('msvalidate'), false);
});

test('shareImage: a 1200x630 JPEG from the image CDN for uploads; the plain file for local previews', () => {
  const up = { full: '/.netlify/images?url=x', original: '/img/photos/car.jpg', srcset: 'a 480w', alt: 'Car' };
  const s = B.shareImage(up);
  assert.match(s.url, /\/\.netlify\/images\?url=%2Fimg%2Fphotos%2Fcar\.jpg&w=1200&h=630&fit=cover&fm=jpg/);
  assert.equal(s.url.startsWith(config.productionUrl), true);
  assert.deepEqual([s.width, s.height, s.alt], [1200, 630, 'Car']);
  assert.equal(B.shareImage({ full: '/img/x.svg', original: '/img/x.svg', srcset: '', alt: '' }).width, null);
  assert.equal(B.shareImage(null), null);
  const html = B.headTags({ content: base(), featured: up });
  assert.match(html, /og:image:width" content="1200"/);
  assert.match(html, /name="twitter:image"/);
  // a tag the caller passes in extra is not emitted twice
  const dup = B.headTags({ content: base(), featured: up, extra: '<meta property="og:image:alt" content="Mine">' });
  assert.equal(dup.match(/og:image:alt/g).length, 1);
});
