// Normalized site config + everything derived from it (table names, bucket,
// cookie, env names). Import THIS in engine code, never site.config.mjs.

import raw from '../../../site.config.mjs';

function must(cond, msg) {
  if (!cond) throw new Error(`site.config.mjs: ${msg}`);
}

const LOOK_ID = /^[a-z][a-z0-9_-]*$/;
const FIELD_PATH = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

// The Looks picker shown in /admin/ (lib/checklist.mjs looksHtml()): which
// content field stores the pick, and one card per look. null = no picker.
//   themes: { field: 'site.theme', options: [{ id, label, blurb,
//             swatch: { bg, accent, ink }, fontDisplay }] }
export function normalizeThemes(t, palette = {}) {
  if (!t || typeof t !== 'object') return null;
  must(FIELD_PATH.test(String(t.field || '')), 'themes.field must be "<section>.<field>"');
  const options = (Array.isArray(t.options) ? t.options : [])
    .filter((o) => o && LOOK_ID.test(String(o.id || '')) && o.label)
    .map((o) => ({
      id: String(o.id),
      label: String(o.label),
      blurb: String(o.blurb || ''),
      swatch: {
        bg: String((o.swatch && o.swatch.bg) || palette.bg || '#111111'),
        accent: String((o.swatch && o.swatch.accent) || palette.accent || '#ffffff'),
        ink: String((o.swatch && o.swatch.ink) || palette.ink || '#ffffff'),
      },
      fontDisplay: String(o.fontDisplay || ''),
    }));
  must(options.length > 0, 'themes.options needs at least one look with an id and a label');
  return { field: String(t.field), options };
}

export function normalizeConfig(c) {
  must(c && typeof c === 'object', 'must export an object');
  must(/^[a-z0-9][a-z0-9-]{1,48}$/.test(c.slug || ''), 'slug must be lowercase [a-z0-9-], 2-49 chars');
  must(c.name && String(c.name).trim(), 'name is required');
  must(c.theme && c.theme.bg && c.theme.ink && c.theme.accent, 'theme needs bg, ink, accent');
  must(c.theme.admin === undefined || (c.theme.admin && typeof c.theme.admin === 'object'), 'theme.admin must be an object of feel tokens');
  const slug = c.slug;
  const dbPrefix = slug.replace(/-/g, '_');
  const envPrefix = c.envPrefix || dbPrefix.toUpperCase();
  return {
    ...c,
    theme: { ...c.theme, admin: c.theme.admin || {} },
    slug,
    dbPrefix,
    envPrefix,
    productionUrl: String(c.productionUrl || `https://${slug}.netlify.app`).replace(/\/$/, ''),
    supabase: { projectRef: '', schema: 'command', ...(c.supabase || {}) },
    assetVersion: c.assetVersion || '1',
    fonts: { googleCss: '', display: 'system-ui, sans-serif', body: 'system-ui, sans-serif', ...(c.fonts || {}) },
    logo: c.logo || '',
    nav: Array.isArray(c.nav) ? c.nav : [],
    labels: c.labels || {},
    media: { seed: [], placeholderPalette: [], ...(c.media || {}) },
    madeBy: { label: 'Made by HAND', href: 'https://handprotocol.org', ...(c.madeBy || {}) },
    // Owner setup checklist shown as a Setup tab in /admin/ (see lib/checklist.mjs).
    checklist: Array.isArray(c.checklist) ? c.checklist : [],
    // Netlify Forms → Resend notifications (see lib/forms.mjs). null = no forms.
    forms: c.forms && typeof c.forms === 'object' ? c.forms : null,
    // Looks picker in /admin/ (see normalizeThemes above). null = no picker.
    themes: normalizeThemes(c.themes, c.theme),
    tables: {
      editors: `${dbPrefix}_editors`,
      login_tokens: `${dbPrefix}_login_tokens`,
      content: `${dbPrefix}_content`,
      media: `${dbPrefix}_media`,
      revisions: `${dbPrefix}_revisions`,
    },
    bucket: slug,
    cacheTag: slug,
    cookie: `${dbPrefix}_session`,
  };
}

export const config = normalizeConfig(raw);
export const TABLES = config.tables;
export const BUCKET = config.bucket;

// Site-scoped env var: env('SESSION_SECRET') → process.env.<PREFIX>_SESSION_SECRET
export function siteEnv(key) {
  return process.env[`${config.envPrefix}_${key}`] || '';
}

export function siteName() {
  return siteEnv('SITE_NAME') || config.name;
}

// Seed rows in the shape of a <prefix>_media row (used with no DB, and by the
// migration generator).
export function seedMedia() {
  return config.media.seed.map((m, i) => ({
    id: m.id || `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    sort: (i + 1) * 10,
    path: m.path,
    is_placeholder: Boolean(m.placeholder),
    alt: m.alt || '',
    caption: m.caption || '',
    category: m.category || '',
    featured: Boolean(m.featured),
    width: m.width || null,
    height: m.height || null,
    mime: m.mime || (m.path.endsWith('.svg') ? 'image/svg+xml' : m.path.endsWith('.png') ? 'image/png' : m.path.endsWith('.webp') ? 'image/webp' : 'image/jpeg'),
  }));
}
