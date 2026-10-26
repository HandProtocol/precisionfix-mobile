// GET /sitemap.xml — one URL (the site is a single page) on the production
// address (config.productionUrl), so the *.netlify.app alias never advertises
// itself. <lastmod> is the day the owner last published. Submitted in Google
// Search Console and Bing Webmaster Tools (Setup tab).

import { config as site } from './lib/config.mjs';
import { loadSite } from './lib/content.mjs';

// The overrides exist for tests (no database).
export async function sitemapXml({ load = loadSite, cfg = site } = {}) {
  let lastmod = '';
  try {
    const data = await load();
    if (data && data.updated_at) lastmod = new Date(data.updated_at).toISOString().slice(0, 10);
  } catch {
    lastmod = ''; // a database hiccup costs the date, never the sitemap
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${cfg.productionUrl}/</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>
</urlset>
`;
}

export default async () =>
  new Response(await sitemapXml(), {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });

export const config = { path: '/sitemap.xml' };
