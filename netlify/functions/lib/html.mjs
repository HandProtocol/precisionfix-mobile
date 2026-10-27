// Small HTML helpers shared by the renderer.

export function escapeHtml(input) {
  return String(input == null ? '' : input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const e = escapeHtml;

// Multi-line text → paragraphs (blank line = new paragraph, single newline = <br>).
export function paragraphs(text, className) {
  const cls = className ? ` class="${className}"` : '';
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p${cls}>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// A bare 10-digit US number gains +1 so the link dials from anywhere
// (search engines and phones abroad read it as international).
function dialable(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return /^\d{10}$/.test(digits) ? `+1${digits}` : digits;
}

export function telHref(phone) {
  const digits = dialable(phone);
  return digits ? `tel:${digits}` : '';
}

export function smsHref(phone) {
  const digits = dialable(phone);
  return digits ? `sms:${digits}` : '';
}

export function instagramUrl(handle) {
  const h = String(handle || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '');
  return h ? `https://instagram.com/${encodeURIComponent(h)}` : '';
}

// <link rel="icon"> for the site's icon (config.favicon). An SVG gets its type.
export function faviconLink(href) {
  const h = String(href || '');
  if (!h) return '';
  return `<link rel="icon"${/\.svg(\?|#|$)/i.test(h) ? ' type="image/svg+xml"' : ''} href="${escapeHtml(h)}">`;
}

// The theme's font stylesheet (fonts.googleCss). A site path (/assets/fonts/…)
// is self-hosted: no request leaves the site, so no visitor IP reaches Google.
// A Google Fonts URL still works and gets its two preconnects.
export function fontLinks(css) {
  const href = String(css || '');
  if (!href) return '';
  const google = /^https:\/\/fonts\.googleapis\.com\//.test(href);
  return `${google ? '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' : ''}<link href="${escapeHtml(href)}" rel="stylesheet">`;
}

export function jsonForScript(value) {
  // Safe to embed inside <script type="application/json">.
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
