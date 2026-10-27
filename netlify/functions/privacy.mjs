// GET /privacy/: the privacy policy (site/privacy.mjs) in the site's theme.
// Site-pack function (not in ENGINE_FILES). Cached at the CDN under the same
// tag as the home page, so a publish (theme, phone) refreshes it too.

import { config as site } from './lib/config.mjs';
import { loadSite } from './lib/content.mjs';
import { escapeHtml } from './lib/html.mjs';
import { renderPrivacyPage } from '../../site/privacy.mjs';

export default async (req) => {
  const url = new URL(req.url);
  if (url.pathname === '/privacy') return new Response(null, { status: 301, headers: { Location: `/privacy/${url.search}` } });
  try {
    const { content } = await loadSite();
    return new Response(renderPrivacyPage({ content, url }), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400, durable',
        'Netlify-Cache-Tag': site.cacheTag,
        'Netlify-Vary': 'query=theme',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  } catch (err) {
    console.error('privacy render failed:', err && err.message);
    return new Response(`<!doctype html><title>${escapeHtml(site.name)}</title><p style="font-family:system-ui;padding:2rem">Back in a moment.</p>`, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '30' },
    });
  }
};

export const config = { path: ['/privacy', '/privacy/'] };
