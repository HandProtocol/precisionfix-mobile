// Customer accounts (config.questions): the people who ask before they book.
// Same two ways in as editors (lib/password.mjs, auth.mjs): a one-time email
// link, or a password once they set one. A customer's cookie is signed under
// its own scope (lib/session.mjs), so it never passes as an editor's.
//
// Trust: an account made by asking a question is signed in right away but is
// unverified until its owner opens an emailed link. A question asked with an
// email that already has an account is never signed in: it is filed under
// that account and a link goes to the inbox instead.

import { config } from './config.mjs';
import { sb } from './db.mjs';
import { hashToken, newLoginToken, parseCookies, sessionCookie, sessionIssuedAt, signSession, verifySession } from './session.mjs';

export const SCOPE = 'customer';
export const CUSTOMER_COOKIE = config.customerCookie;
export const EMAIL_RE = /^[^\s@<>",]+@[^\s@<>",]+\.[A-Za-z]{2,24}$/;
export const LINK_TTL_MIN = 20;
// The link in "we got your question": read later than a sign-in link, so it lives longer.
export const WELCOME_TTL_DAYS = 7;
const COLS = 'id,email,name,phone,lang,email_verified_at,password_set_at,created_at';

export const cleanEmail = (v) => String(v || '').trim().toLowerCase();
export const validEmail = (v) => EMAIL_RE.test(v) && v.length <= 120;

export function publicCustomer(c) {
  return { id: c.id, email: c.email, name: c.name || '', phone: c.phone || '', lang: c.lang === 'es' ? 'es' : 'en', verified: Boolean(c.email_verified_at), hasPassword: Boolean(c.password_set_at) };
}

export async function findCustomer(email, cols = COLS) {
  const rows = await sb(`/{customers}?email=eq.${encodeURIComponent(cleanEmail(email))}&select=${cols}`);
  return (rows && rows[0]) || null;
}

export async function customerById(id, cols = COLS) {
  const rows = await sb(`/{customers}?id=eq.${encodeURIComponent(id)}&select=${cols}`);
  return (rows && rows[0]) || null;
}

export async function createCustomer({ email, name = '', phone = '', lang = 'en' }) {
  const rows = await sb('/{customers}', {
    method: 'POST',
    prefer: 'return=representation',
    body: { email: cleanEmail(email), name, phone, lang: lang === 'es' ? 'es' : 'en' },
  });
  return rows && rows[0];
}

export function customerCookie(customerId) {
  return sessionCookie(signSession(customerId, Date.now(), SCOPE), { name: CUSTOMER_COOKIE });
}
export function clearCustomerCookie() {
  return sessionCookie('', { clear: true, name: CUSTOMER_COOKIE });
}
export function customerIssuedAt(req) {
  return sessionIssuedAt(parseCookies(req.headers.get('cookie'))[CUSTOMER_COOKIE], Date.now(), SCOPE);
}

// The signed-in customer, or null. A password change stamps sessions_after:
// cookies signed before it are out, like editors.
export async function currentCustomer(req) {
  const token = parseCookies(req.headers.get('cookie'))[CUSTOMER_COOKIE];
  const id = verifySession(token, Date.now(), SCOPE);
  if (!id) return null;
  const row = await customerById(id, `${COLS},sessions_after`);
  if (!row) return null;
  const { sessions_after: after, ...customer } = row;
  if (after && sessionIssuedAt(token, Date.now(), SCOPE) < Math.floor(Date.parse(after) / 1000)) return null;
  return customer;
}

// Mints a single-use link. `path` is where it lands (/account/ by default,
// with #t/<thread> to open one conversation).
export async function mintLink(customer, { origin, ttlMin = LINK_TTL_MIN, ip = '', hash = '' }) {
  const token = newLoginToken();
  await sb('/{customer_tokens}', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { customer_id: customer.id, token_hash: hashToken(token), expires_at: new Date(Date.now() + ttlMin * 60 * 1000).toISOString(), request_ip: ip || null },
  });
  return `${origin}/account/?t=${token}${hash ? `#${hash}` : ''}`;
}

export async function linksSentSince(customerId, minutes) {
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const rows = await sb(`/{customer_tokens}?customer_id=eq.${customerId}&created_at=gte.${encodeURIComponent(since)}&select=id`);
  return (rows || []).length;
}

// Spends a link: { customer } or { error }. Opening one proves the inbox, so
// it verifies the email and lifts a password lock.
export async function spendLink(token) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(String(token || ''))) return { error: 'invalid' };
  const rows = await sb(`/{customer_tokens}?token_hash=eq.${hashToken(token)}&select=id,customer_id,expires_at,used_at`);
  const row = rows && rows[0];
  if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) return { error: 'expired' };
  await sb(`/{customer_tokens}?id=eq.${row.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { used_at: new Date().toISOString() } });
  const now = new Date().toISOString();
  const before = await customerById(row.customer_id);
  if (!before) return { error: 'gone' };
  await sb(`/{customers}?id=eq.${row.customer_id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    // the first proof of the inbox also signs out any session made before it
    // (an unverified account may have been opened by someone else)
    body: { last_login_at: now, failed_logins: 0, locked_until: null, ...(before.email_verified_at ? {} : { email_verified_at: now, sessions_after: now }) },
  });
  return { customer: { ...before, email_verified_at: before.email_verified_at || now } };
}
