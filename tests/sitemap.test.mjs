import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config, sitemapXml } from '../netlify/functions/sitemap.mjs';

const cfg = { productionUrl: 'https://my-domain.test' };

test('sitemap lists the production address with the last publish date', async () => {
  const xml = await sitemapXml({ cfg, load: async () => ({ updated_at: '2026-10-09T15:17:38.991+00:00' }) });
  assert.match(xml, /<loc>https:\/\/my-domain\.test\/<\/loc><lastmod>2026-10-09<\/lastmod>/);
  assert.equal((xml.match(/<url>/g) || []).length, 1);
  assert.equal(config.path, '/sitemap.xml');
});

test('sitemap: a database hiccup costs the date, never the sitemap', async () => {
  const xml = await sitemapXml({ cfg, load: async () => { throw new Error('down'); } });
  assert.match(xml, /<loc>https:\/\/my-domain\.test\/<\/loc><\/url>/);
  assert.equal(xml.includes('lastmod'), false);
});

test('sitemap: extra pack pages follow the home page on the production address', async () => {
  const xml = await sitemapXml({ cfg: { ...cfg, sitemapPages: [{ path: '/privacy/', lastmod: '2026-10-27' }] }, load: async () => ({}) });
  assert.match(xml, /<loc>https:\/\/my-domain\.test\/privacy\/<\/loc><lastmod>2026-10-27<\/lastmod>/);
  assert.equal((xml.match(/<url>/g) || []).length, 2);
});
