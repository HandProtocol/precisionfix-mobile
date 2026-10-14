// Stripe, the little of it the deposit needs: a Checkout Session (hosted
// page, no card form on the site), the session read back, a refund, and the
// webhook signature check. Plain fetch against api.stripe.com with the
// site's secret key, so tests mock fetch like they do for Supabase and
// Resend. Never throws on Stripe's own errors: { ok:false, reason }.
//
// Env (siteEnv): <PREFIX>_STRIPE_SECRET_KEY, <PREFIX>_STRIPE_WEBHOOK_SECRET.
// The keys belong to the owner's Stripe account: the money is theirs.

import crypto from 'node:crypto';
import { siteEnv } from './config.mjs';

const API = 'https://api.stripe.com/v1';
const TOLERANCE_S = 300; // a signature older than five minutes is a replay

export function stripeConfigured() {
  return Boolean(siteEnv('STRIPE_SECRET_KEY'));
}
export function stripeWebhookConfigured() {
  return Boolean(siteEnv('STRIPE_WEBHOOK_SECRET'));
}
export function stripeLiveMode() {
  return siteEnv('STRIPE_SECRET_KEY').startsWith('sk_live_');
}

// Nested objects → Stripe's bracketed form encoding: { a: { b: 1 } } → a[b]=1.
export function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? formEncode(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call(method, path, body = null, { idempotencyKey = '' } = {}) {
  if (!stripeConfigured()) return { ok: false, reason: 'stripe-unconfigured' };
  const headers = { Authorization: `Bearer ${siteEnv('STRIPE_SECRET_KEY')}`, 'Stripe-Version': '2024-06-20' };
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  try {
    const res = await fetch(`${API}${path}`, { method, headers, body: body ? formEncode(body).toString() : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || `stripe ${res.status}`;
      console.warn(`[stripe] ${method} ${path} → ${res.status}: ${msg}`);
      return { ok: false, reason: `stripe-${res.status}`, message: msg, code: data && data.error && data.error.code };
    }
    return { ok: true, data };
  } catch (err) {
    console.warn(`[stripe] ${method} ${path} failed: ${err.message}`);
    return { ok: false, reason: 'stripe-unreachable' };
  }
}

// One hosted payment page for the deposit. `expiresAt` (unix seconds, 30 min
// … 24 h ahead) makes the page itself expire with the hold.
export function createCheckoutSession({ amount, currency, name, description = '', bookingId, customerEmail = '', successUrl, cancelUrl, expiresAt = null, idempotencyKey = '' }) {
  return call(
    'POST',
    '/checkout/sessions',
    {
      mode: 'payment',
      client_reference_id: bookingId,
      customer_email: customerEmail || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: expiresAt || undefined,
      line_items: [{ quantity: 1, price_data: { currency, unit_amount: amount, product_data: { name, description: description || undefined } } }],
      metadata: { booking_id: bookingId },
      payment_intent_data: { metadata: { booking_id: bookingId }, description: name },
    },
    { idempotencyKey }
  );
}

export function getCheckoutSession(id) {
  return call('GET', `/checkout/sessions/${encodeURIComponent(id)}`);
}

// A full refund of the deposit's payment. Idempotent per booking.
export function refundPaymentIntent(paymentIntent, { bookingId = '', reason = 'requested_by_customer' } = {}) {
  return call('POST', '/refunds', { payment_intent: paymentIntent, reason, metadata: { booking_id: bookingId } }, { idempotencyKey: bookingId ? `refund-${bookingId}` : '' });
}

// Stripe-Signature: t=<unix>,v1=<hmac>[,v1=…]. HMAC-SHA256 over "<t>.<raw body>".
export function verifyWebhookSignature(rawBody, header, secret = siteEnv('STRIPE_WEBHOOK_SECRET'), now = Math.floor(Date.now() / 1000)) {
  if (!secret || !header) return false;
  const parts = Object.create(null);
  for (const kv of String(header).split(',')) {
    const i = kv.indexOf('=');
    if (i < 0) continue;
    const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    (parts[k] = parts[k] || []).push(v);
  }
  const t = Number((parts.t || [])[0]);
  if (!Number.isFinite(t) || Math.abs(now - t) > TOLERANCE_S) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  return (parts.v1 || []).some((sig) => {
    const b = Buffer.from(String(sig), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

// The header a test (or a local run) signs with: the inverse of the check.
export function signWebhook(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex')}`;
}

// "$50", "$12.50", "€20" by currency, for emails and pages.
export function fmtMoney(amount, currency = 'usd', lang = 'en') {
  const zero = ['jpy', 'krw'].includes(currency);
  const value = zero ? amount : amount / 100;
  try {
    return new Intl.NumberFormat(lang === 'es' ? 'es-MX' : 'en-US', { style: 'currency', currency: currency.toUpperCase(), currencyDisplay: 'narrowSymbol', minimumFractionDigits: zero || Number.isInteger(value) ? 0 : 2 }).format(value);
  } catch (_) {
    return `${value} ${currency.toUpperCase()}`;
  }
}
