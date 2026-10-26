// Invoices, the customer's side (config.invoices):
//
//   GET /invoice?t=[&paid=1&cs=]   the invoice page (lib/invoice-page.mjs); back from Stripe it checks the session itself
//   GET /invoice/pay?t=            303 to a Stripe Checkout page for the whole balance (lib/invoices.mjs)
//
// Stripe's webhook is the booking one (POST /api/booking/stripe): its
// checkout.session.completed carries metadata.invoice_id (lib/booking-deposit.mjs
// hands it to lib/invoices.mjs). The link is the only key: a signed token
// whose hash is on the row. Views by a signed-in editor are not counted.

import { INVOICES, config as site } from './lib/config.mjs';
import { dbConfigured } from './lib/db.mjs';
import { loadSite } from './lib/content.mjs';
import { settingsFrom } from './lib/booking.mjs';
import { currentEditor, handleError, html, json } from './lib/http.mjs';
import { hashToken } from './lib/session.mjs';
import { loadStripeKeys } from './lib/stripe.mjs';
import { invoiceByPayHash } from './lib/invoice-db.mjs';
import { onlinePayEnabled, recordView, startInvoiceCheckout, syncInvoiceSession } from './lib/invoices.mjs';
import { renderInvoicePage } from './lib/invoice-page.mjs';

const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

async function lookup(url) {
  const token = url.searchParams.get('t') || '';
  if (!TOKEN_RE.test(token) || !dbConfigured()) return { token, inv: null };
  return { token, inv: await invoiceByPayHash(hashToken(token)) };
}

async function shopOf() {
  try {
    const { content } = await loadSite();
    return settingsFrom(content).shop || null;
  } catch (_) {
    return null;
  }
}

async function page(req, url) {
  let { token, inv } = await lookup(url);
  if (!inv || inv.status === 'draft') return html(404, renderInvoicePage({ invoice: null }));
  const origin = `${url.protocol}//${url.host}`;
  let justPaid = false;
  if (url.searchParams.get('paid') === '1') {
    const r = await syncInvoiceSession({ inv, sessionId: String(url.searchParams.get('cs') || '').slice(0, 120), origin }).catch(() => ({ invoice: inv }));
    inv = r.invoice;
    justPaid = inv.status === 'paid';
  } else if (!(await currentEditor(req).catch(() => null))) {
    inv = await recordView(inv);
  }
  return html(200, renderInvoicePage({ invoice: inv, token, shop: await shopOf(), payEnabled: onlinePayEnabled(), justPaid }));
}

async function pay(req, url) {
  const { token, inv } = await lookup(url);
  if (!inv || inv.status === 'draft') return html(404, renderInvoicePage({ invoice: null }));
  const origin = `${url.protocol}//${url.host}`;
  const r = await startInvoiceCheckout({ inv, origin, token });
  if (r.ok) return new Response(null, { status: 303, headers: { Location: r.url, 'Cache-Control': 'no-store' } });
  // paid already, voided, nothing owed, Stripe not connected: the page says
  // where it stands. Stripe down: the page keeps the button and says so.
  if (['already-paid', 'not-open', 'nothing-owed', 'pay-off'].includes(r.reason)) return new Response(null, { status: 303, headers: { Location: `/invoice?t=${token}`, 'Cache-Control': 'no-store' } });
  const fresh = (await invoiceByPayHash(hashToken(token)).catch(() => null)) || inv;
  return html(503, renderInvoicePage({ invoice: fresh, token, shop: await shopOf(), payEnabled: onlinePayEnabled(), payError: true }));
}

export default async (req) => {
  if (!INVOICES) return json(404, { ok: false, error: 'No invoices on this site' });
  const url = new URL(req.url);
  if (req.method !== 'GET') return json(405, { ok: false, error: 'GET only' });
  try {
    await loadStripeKeys(); // env keys, or the ones the owner connected in /admin/ → Payments
    if (url.pathname === '/invoice/pay') return await pay(req, url);
    if (url.pathname === '/invoice') return await page(req, url);
    return json(404, { ok: false, error: 'Unknown endpoint' });
  } catch (err) {
    if (url.pathname === '/invoice' || url.pathname === '/invoice/pay') {
      console.error(`[${site.slug}] invoice page:`, err && (err.stack || err.message));
      return html(500, renderInvoicePage({ invoice: null, error: 'Something went wrong on our side. Try again in a minute, or call us.' }));
    }
    return handleError(err);
  }
};

export const config = { path: ['/invoice', '/invoice/pay'] };
