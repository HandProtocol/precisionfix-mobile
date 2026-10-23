// Stateless HMAC session cookies + single-use login-token hashing.
//
// Env: <PREFIX>_SESSION_SECRET (falls back to a derivation of the service key)

import crypto from 'node:crypto';
import { config, siteEnv } from './config.mjs';

export const COOKIE = config.cookie;
const SESSION_DAYS = 30;

// scope '' = editors; 'customer' = customer accounts (lib/customers.mjs). A
// separate key per scope, so a customer's cookie can never pass as an editor's.
function secret(scope = '') {
  const base = siteEnv('SESSION_SECRET') || `${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}::${config.slug}`;
  return scope ? `${base}::${scope}` : base;
}

export function signSession(editorId, now = Date.now(), scope = '') {
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 24 * 3600;
  const payload = `${editorId}.${exp}`;
  const sig = crypto.createHmac('sha256', secret(scope)).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifySession(token, now = Date.now(), scope = '') {
  if (typeof token !== 'string' || token.length > 400) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  let payload;
  try {
    payload = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
  } catch (_) {
    return null;
  }
  const expected = crypto.createHmac('sha256', secret(scope)).update(payload).digest('base64url');
  const given = token.slice(dot + 1);
  if (expected.length !== given.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
    return null;
  }
  const [editorId, expStr] = payload.split('.');
  if (!editorId || !/^\d+$/.test(expStr || '')) return null;
  if (Number(expStr) * 1000 < now) return null;
  return editorId;
}

// A deterministic token for a payload (booking manage / act links): the
// same secret as sessions, so a link can be re-derived for every email.
export function signPayload(payload) {
  return crypto.createHmac('sha256', secret()).update(String(payload)).digest('base64url');
}

// Seconds since the epoch when this cookie was signed (from its expiry), or
// 0 for a cookie that does not verify. Used to refuse cookies older than a
// password change, and to call a session "fresh" right after sign-in.
export function sessionIssuedAt(token, now = Date.now(), scope = '') {
  if (!verifySession(token, now, scope)) return 0;
  const payload = Buffer.from(token.slice(0, token.lastIndexOf('.')), 'base64url').toString('utf8');
  return Number(payload.split('.')[1]) - SESSION_DAYS * 24 * 3600;
}

export function newLoginToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(value, { clear = false, name = COOKIE } = {}) {
  const maxAge = clear ? 0 : SESSION_DAYS * 24 * 3600;
  return `${name}=${clear ? '' : encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
