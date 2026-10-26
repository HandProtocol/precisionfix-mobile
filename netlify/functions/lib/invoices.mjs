// Invoices (config.invoices): what happens to one at every step.
//
//   draft  the owner is still writing it (only the owner sees it)
//   open   sent: the customer has a link (/invoice?t=…) and owes the balance
//   paid   through Stripe Checkout (the webhook or the success page) or by hand
//   void   cancelled before it was paid
//   refunded   a Stripe payment given back in full
//
// The balance is paid on the owner's own Stripe account (lib/stripe.mjs), the
// same keys as the deposit; the webhook route is the deposit's
// (POST /api/booking/stripe), told apart by metadata.invoice_id. A booking's
// paid deposit is the invoice's credit (lib/invoice-core.mjs creditFor), read
// fresh whenever the totals are worked out, so a refunded deposit stops
// counting.

import { INVOICES, config } from './config.mjs';
import { bookingById } from './booking-db.mjs';
import { settingsFrom, zonedParts } from './booking.mjs';
import { loadSite } from './content.mjs';
import { createCheckoutSession, expireCheckoutSession, getCheckoutSession, refundPaymentIntent, stripeConfigured } from './stripe.mjs';
import { createInvoice, invoiceById, openPastDue, updateInvoice } from './invoice-db.mjs';
import { invoiceSmsHref, sendInvoiceEmail } from './invoice-email.mjs';
import { MANUAL_METHODS, REFERENCE_MAX, creditFor, daysPastDue, dueDateFrom, invoiceUrl, newInvoiceId, normalizeItems, payHash, todayIn, totalsOf } from './invoice-core.mjs';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const clip = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const tz = () => (config.booking && config.booking.tz) || 'America/Chicago';

export function invoicesEnabled() {
  return Boolean(INVOICES);
}
// Paying online needs the keys; without them an invoice can still be sent
// and marked paid by hand.
export function onlinePayEnabled() {
  return Boolean(INVOICES && stripeConfigured());
}

async function settingsNow() {
  try {
    const { content } = await loadSite();
    return settingsFrom(content);
  } catch (_) {
    return null;
  }
}

// The fields the owner may set, cleaned. Totals are never taken from the
// client: they are worked out here from the lines and the booking's deposit.
export function cleanFields(body) {
  const out = {};
  if (body.name !== undefined) out.name = clip(body.name, 80);
  if (body.email !== undefined) {
    out.email = clip(body.email, 120).toLowerCase();
    if (out.email && !EMAIL_RE.test(out.email)) throw bad('That email does not look right.');
  }
  if (body.phone !== undefined) out.phone = clip(body.phone, 24);
  if (body.address !== undefined) out.address = clip(body.address, 200);
  if (body.lang !== undefined) out.lang = body.lang === 'es' ? 'es' : 'en';
  if (body.notes !== undefined) out.notes = clip(body.notes, 1500);
  if (body.owner_note !== undefined) out.owner_note = clip(body.owner_note, 1000);
  if (body.items !== undefined) out.items = normalizeItems(body.items);
  if (body.tax_rate !== undefined) {
    const r = Math.round(Number(body.tax_rate));
    if (!Number.isInteger(r) || r < 0 || r > 2500) throw bad('The tax rate does not look right (8.25% is 825).');
    out.tax_rate = r;
  }
  return out;
}

// Lines + the booking's paid deposit → the money columns.
export async function priced(inv) {
  const booking = inv.booking_id ? await bookingById(inv.booking_id).catch(() => null) : null;
  const t = totalsOf(inv.items || [], { taxRate: inv.tax_rate || 0, credit: creditFor(booking) });
  return { subtotal: t.subtotal, tax: t.tax, credit: t.credit, total: t.total, balance: t.balance };
}

export async function createDraft({ body, editor }) {
  const fields = cleanFields(body);
  if (!fields.name) throw bad('Who is it for?');
  const bookingId = /^[0-9a-f-]{36}$/i.test(String(body.booking_id || '')) ? String(body.booking_id) : null;
  const booking = bookingId ? await bookingById(bookingId) : null;
  if (bookingId && !booking) throw bad('That booking is gone.', 404);
  const id = newInvoiceId();
  const row = {
    id,
    status: 'draft',
    booking_id: bookingId,
    lang: 'en',
    items: [],
    tax_rate: INVOICES.taxRate,
    currency: (config.booking && config.booking.pricing && config.booking.pricing.currency) || 'usd',
    ...fields,
    pay_token_hash: payHash(id),
    created_by: editor ? editor.id : null,
    updated_by: editor ? editor.id : null,
  };
  Object.assign(row, await priced(row));
  const stored = await createInvoice(row);
  if (!stored) throw new Error('invoice insert returned nothing');
  return stored;
}

// Edits to a draft, or to a sent invoice nobody has paid yet. A sent one
// that already has a Stripe page gets that page closed, so nobody pays the
// old amount.
export async function editInvoice({ inv, body, editor }) {
  if (!['draft', 'open'].includes(inv.status)) throw bad(`A ${inv.status} invoice cannot be changed. Make a new one.`, 409);
  const fields = cleanFields(body);
  if (fields.name === '') throw bad('Who is it for?');
  const next = { ...inv, ...fields };
  const patch = { ...fields, ...(await priced(next)), updated_by: editor ? editor.id : null };
  if (inv.status === 'open' && inv.stripe_session_id) {
    await expireSession(inv.stripe_session_id);
    patch.stripe_session_id = null;
  }
  const stored = await updateInvoice(inv.id, patch, { ifStatus: inv.status });
  if (!stored) throw bad('This invoice changed a moment ago. Reload to see where it stands.', 409);
  return stored;
}

async function expireSession(id) {
  if (!stripeConfigured() || !id) return;
  const r = await expireCheckoutSession(id);
  if (!r.ok && r.status !== 400) console.warn(`[${config.slug} invoice] could not close Stripe page ${id}: ${r.reason}`);
}

// Send (or send again): a draft becomes open with its due date; the customer
// is emailed the link. Nothing owed (the deposit covers it) → paid on the spot.
// → { invoice, emailed, emailReason, sms, url }
export async function sendInvoice({ inv, editor, origin = config.productionUrl, now = new Date() }) {
  if (!['draft', 'open'].includes(inv.status)) throw bad(`A ${inv.status} invoice is not sent again. Make a new one.`, 409);
  if (!(inv.items || []).length) throw bad('Add at least one line before you send it.');
  const money = await priced(inv);
  let stored = inv;
  if (inv.status === 'draft') {
    stored = await updateInvoice(inv.id, { ...money, status: 'open', sent_at: now.toISOString(), due_date: dueDateFrom(now, INVOICES.dueDays, tz()), reminders_sent: {}, updated_by: editor ? editor.id : null }, { ifStatus: 'draft' });
    if (!stored) throw bad('This invoice changed a moment ago. Reload to see where it stands.', 409);
  } else if (money.balance !== inv.balance || money.credit !== inv.credit) {
    stored = (await updateInvoice(inv.id, money, { ifStatus: 'open' })) || inv;
  }
  const url = invoiceUrl(stored.id, origin);
  if (stored.balance === 0) {
    const paid = await markPaid({ inv: stored, method: 'deposit', via: 'manual', amount: 0, origin, notifyOwner: false, receipt: false });
    stored = paid.invoice;
  }
  const settings = await settingsNow();
  const r = await sendInvoiceEmail('invoice', { invoice: stored, url, settings });
  if (!r.ok) console.warn(`[${config.slug} invoice] ${stored.number} not emailed: ${r.reason}`);
  return { invoice: stored, emailed: Boolean(r.ok), emailReason: r.ok ? null : r.reason, sms: r.ok ? '' : invoiceSmsHref(stored, url), url };
}

// --- paying ---------------------------------------------------------------------

// The Checkout page for an open invoice: the stored one while it is still
// open for the same amount, a fresh one otherwise. → { ok, url } | { ok:false, reason }
export async function startInvoiceCheckout({ inv, origin, token }) {
  if (!onlinePayEnabled()) return { ok: false, reason: 'pay-off' };
  if (inv.status === 'paid') return { ok: false, reason: 'already-paid' };
  if (inv.status !== 'open') return { ok: false, reason: 'not-open' };
  // the deposit may have been refunded since it was sent: the balance follows
  const money = await priced(inv);
  if (money.balance !== inv.balance || money.credit !== inv.credit) inv = (await updateInvoice(inv.id, money, { ifStatus: 'open' })) || { ...inv, ...money };
  if (inv.balance <= 0) return { ok: false, reason: 'nothing-owed' };
  const back = `${origin}/invoice?t=${token}`;
  if (inv.stripe_session_id) {
    const cur = await getCheckoutSession(inv.stripe_session_id);
    if (cur.ok && cur.data.payment_status === 'paid') {
      await markPaid({ inv, session: cur.data, origin });
      return { ok: false, reason: 'already-paid' };
    }
    if (cur.ok && cur.data.status === 'open' && cur.data.url && cur.data.amount_total === inv.balance) return { ok: true, url: cur.data.url };
    if (cur.ok && cur.data.status === 'open') await expireSession(inv.stripe_session_id);
  }
  const lang = inv.lang === 'es' ? 'es' : 'en';
  const r = await createCheckoutSession({
    amount: inv.balance,
    currency: inv.currency || 'usd',
    name: lang === 'es' ? `Factura ${inv.number} · ${config.name}` : `Invoice ${inv.number} · ${config.name}`,
    description: inv.name,
    reference: inv.id,
    metadata: { invoice_id: inv.id, invoice_number: inv.number },
    customerEmail: inv.email || '',
    successUrl: `${back}&paid=1&cs={CHECKOUT_SESSION_ID}`,
    cancelUrl: back,
    idempotencyKey: `invoice-${inv.id}-${inv.balance}-${String(inv.updated_at || '').slice(0, 19)}`,
  });
  if (!r.ok) return { ok: false, reason: r.reason, message: r.message };
  await updateInvoice(inv.id, { stripe_session_id: r.data.id }).catch((err) => console.warn(`[${config.slug} invoice] session id not stored: ${err.message}`));
  return { ok: true, url: r.data.url };
}

// Paid: through Stripe (`session`) or by hand (`method`). Conditional on the
// invoice still being open, so the webhook and the success page racing mark
// it once and mail once. → { invoice, changed }
export async function markPaid({ inv, session = null, method = '', via = '', amount = null, note = '', reference = '', paidAt = null, editor = null, origin = config.productionUrl, notifyOwner = true, receipt = true, now = new Date() }) {
  if (inv.status === 'paid') return { invoice: inv, changed: false };
  const fromStripe = Boolean(session);
  const pi = session ? (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent && session.payment_intent.id) || null : null;
  const patch = {
    status: 'paid',
    paid_at: (paidAt || now).toISOString(),
    paid_via: fromStripe ? 'stripe' : via || 'manual',
    paid_method: fromStripe ? 'card' : MANUAL_METHODS.includes(method) || method === 'deposit' ? method : 'other',
    paid_amount: fromStripe ? (Number.isInteger(session.amount_total) ? session.amount_total : inv.balance) : amount != null ? amount : inv.balance,
    stripe_payment_intent: pi,
    paid_reference: fromStripe ? '' : String(reference || '').trim().slice(0, REFERENCE_MAX),
    ...(session && session.id ? { stripe_session_id: session.id } : {}),
    ...(note ? { owner_note: [inv.owner_note, note].filter(Boolean).join('\n').slice(0, 1000) } : {}),
    ...(editor ? { updated_by: editor.id } : {}),
  };
  const stored = await updateInvoice(inv.id, patch, { ifStatus: 'open' });
  if (!stored) return { invoice: (await invoiceById(inv.id).catch(() => null)) || inv, changed: false };
  const url = invoiceUrl(stored.id, origin);
  const settings = await settingsNow();
  if (receipt) {
    const c = await sendInvoiceEmail('invoice_receipt', { invoice: stored, url, settings });
    if (!c.ok) console.warn(`[${config.slug} invoice] ${stored.number} receipt not sent: ${c.reason}`);
  }
  if (fromStripe && notifyOwner) await sendInvoiceEmail('owner_invoice_paid', { invoice: stored, links: { open: `${origin}/admin/#invoices/${stored.id}` }, settings });
  console.log(`[${config.slug} invoice] paid ${stored.number} via ${patch.paid_via}`);
  return { invoice: stored, changed: true };
}

// Back from Stripe with ?cs=: ask Stripe, mark paid if it is, so the page
// says "received" even before the webhook lands.
export async function syncInvoiceSession({ inv, sessionId, origin }) {
  if (!onlinePayEnabled() || inv.status !== 'open' || !sessionId) return { invoice: inv, changed: false };
  const r = await getCheckoutSession(sessionId);
  if (!r.ok || r.data.payment_status !== 'paid') return { invoice: inv, changed: false };
  if ((r.data.metadata && r.data.metadata.invoice_id) !== inv.id && r.data.client_reference_id !== inv.id) return { invoice: inv, changed: false };
  return markPaid({ inv, session: r.data, origin });
}

// A verified checkout.session.completed whose metadata names an invoice.
export async function handleInvoiceSession(session, { origin = config.productionUrl } = {}) {
  const id = (session.metadata && session.metadata.invoice_id) || '';
  const inv = /^[0-9a-f-]{36}$/i.test(id) ? await invoiceById(id) : null;
  if (!inv) return { handled: false, reason: 'no-invoice' };
  if (session.payment_status !== 'paid') return { handled: false, reason: 'unpaid' };
  // a page paid after the invoice was voided: the money came in, so say so
  // loudly rather than lose it; the owner refunds it from Stripe
  if (inv.status === 'void') {
    console.error(`[${config.slug} invoice] ${inv.number} was paid (${session.id}) after it was voided: refund it from Stripe`);
    return { handled: false, reason: 'void' };
  }
  const r = await markPaid({ inv, session, origin });
  return { handled: true, changed: r.changed, invoice: r.invoice };
}

// --- the owner's other actions -------------------------------------------------------

export async function voidInvoice({ inv, reason = '', editor }) {
  if (!['draft', 'open'].includes(inv.status)) throw bad(`A ${inv.status} invoice cannot be voided.${inv.status === 'paid' ? ' Refund it instead.' : ''}`, 409);
  if (inv.stripe_session_id) await expireSession(inv.stripe_session_id);
  const stored = await updateInvoice(inv.id, { status: 'void', void_reason: clip(reason, 300), stripe_session_id: null, updated_by: editor ? editor.id : null }, { ifStatus: inv.status });
  if (!stored) throw bad('This invoice changed a moment ago. Reload to see where it stands.', 409);
  return stored;
}

// A full refund of a Stripe payment. Stripe first; nothing is written if it refuses.
export async function refundInvoice({ inv, editor }) {
  if (inv.status !== 'paid') throw bad('Only a paid invoice can be refunded.', 409);
  if (inv.paid_via !== 'stripe' || !inv.stripe_payment_intent) throw bad('This one was not paid through the site, so give the money back the way it was paid, then void a corrected invoice if you need one.', 409);
  const r = await refundPaymentIntent(inv.stripe_payment_intent, { reason: 'requested_by_customer', metadata: { invoice_id: inv.id }, key: `refund-invoice-${inv.id}` });
  if (!r.ok) throw bad(`Stripe did not refund it${r.message ? `: ${r.message}` : ''}. Try again, or refund it from your Stripe dashboard.`, 502);
  const stored = await updateInvoice(inv.id, { status: 'refunded', refund_id: r.data.id, refunded_at: new Date().toISOString(), updated_by: editor ? editor.id : null }, { ifStatus: 'paid' });
  const out = stored || { ...inv, status: 'refunded' };
  const mail = await sendInvoiceEmail('invoice_refunded', { invoice: out, settings: await settingsNow() });
  return { invoice: out, emailed: Boolean(mail.ok) };
}

// The customer opened the link (the owner's own views are not counted).
export async function recordView(inv, now = new Date()) {
  if (inv.status === 'draft') return inv;
  const patch = { view_count: (inv.view_count || 0) + 1, last_viewed_at: now.toISOString(), ...(inv.first_viewed_at ? {} : { first_viewed_at: now.toISOString() }) };
  return (await updateInvoice(inv.id, patch).catch(() => null)) || inv;
}

// --- reminders (booking-reminders.mjs, hourly) ------------------------------------------

export const REMIND_HOURS = { from: 9, to: 18 }; // site-time hours a reminder may go out

// One reminder at most per invoice per run: the latest stage that is due and
// not yet sent (a missed day never sends two at once). The last stage also
// tells the owner, and the reminders stop there.
export function dueStage(inv, today, stages = INVOICES ? INVOICES.reminders : []) {
  const days = daysPastDue(inv.due_date, today);
  const sent = inv.reminders_sent || {};
  const due = stages.filter((d) => d <= days && !sent[String(d)]);
  if (!due.length) return null;
  return { stage: Math.max(...due), days, mark: due, last: Math.max(...due) === Math.max(...stages) };
}

export async function runInvoiceReminders({ now = new Date(), origin = config.productionUrl } = {}) {
  if (!INVOICES) return { sent: 0, due: 0 };
  const { hh } = zonedParts(now, tz());
  if (hh < REMIND_HOURS.from || hh >= REMIND_HOURS.to) return { sent: 0, due: 0, quiet: true };
  const today = todayIn(tz(), now);
  const rows = await openPastDue(today);
  const settings = rows.length ? await settingsNow() : null;
  let sent = 0, due = 0;
  for (const inv of rows) {
    const st = dueStage(inv, today);
    if (!st || inv.balance <= 0) continue;
    due++;
    const r = await sendInvoiceEmail('invoice_reminder', { invoice: inv, url: invoiceUrl(inv.id, origin), days: st.days, settings });
    if (r.ok) sent++;
    if (st.last) await sendInvoiceEmail('owner_invoice_overdue', { invoice: inv, links: { open: `${origin}/admin/#invoices/${inv.id}` }, days: st.days, settings });
    const marks = { ...(inv.reminders_sent || {}) };
    st.mark.forEach((d) => { marks[String(d)] = now.toISOString(); });
    await updateInvoice(inv.id, { reminders_sent: marks }).catch((err) => console.warn(`[${config.slug} invoice] reminder mark failed: ${err.message}`));
  }
  return { sent, due };
}
