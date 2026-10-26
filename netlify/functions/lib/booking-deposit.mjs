// The booking deposit (config.booking.deposit): what happens to it at every
// step. Requesting a time is free. When the owner confirms, the booking's
// deposit becomes `due` and the confirmation email carries a Pay link:
// /booking/pay?t=<manage token> opens a Stripe Checkout page (lib/stripe.mjs).
// Stripe's webhook (POST /api/booking/stripe) marks it `paid`; the success
// page checks the session itself in case the webhook is slow. Owner cancel →
// refund (`refunded`); customer cancel or no-show → `kept`; the deposit is
// credited to the bill, so completed leaves it `paid`.
//
// Without a Stripe key nothing here runs: the deposit stays `none` and the
// calendar behaves exactly as before (so the keys can arrive after deploy).

import { BOOKING, INVOICES, config, siteName } from './config.mjs';
import { handleInvoiceSession } from './invoices.mjs';
import { bookingByDepositSession, bookingById, depositsToRemind, overdueDeposits, updateBooking } from './booking-db.mjs';
import { sendBookingEmail } from './booking-email.mjs';
import { createCheckoutSession, fmtMoney, getCheckoutSession, refundPaymentIntent, stripeConfigured } from './stripe.mjs';
import { intakeFor } from './booking-form.mjs';
import { settingsFrom, zonedParts } from './booking.mjs';
import { loadSite } from './content.mjs';
import { manageToken } from './booking-token.mjs';

export const DEPOSIT = BOOKING && BOOKING.deposit ? BOOKING.deposit : null;
export const DEPOSIT_STATUSES = ['none', 'due', 'paid', 'refunded', 'kept'];

export function depositEnabled() {
  return Boolean(DEPOSIT && stripeConfigured());
}
export function depositAmountText(lang = 'en', d = DEPOSIT) {
  return d ? fmtMoney(d.amount, d.currency, lang) : '';
}
export function depositOf(b) {
  return DEPOSIT_STATUSES.includes(b && b.deposit_status) ? b.deposit_status : 'none';
}
export function payUrlFor(id, origin = config.productionUrl) {
  return `${origin}/booking/pay?t=${manageToken(id)}`;
}

// --- the patch each action adds -------------------------------------------------

// confirm, or reschedule of a request: the deposit falls due, held `holdHours`.
export function dueFields(now = new Date()) {
  if (!depositEnabled()) return {};
  return {
    deposit_status: 'due',
    deposit_amount: DEPOSIT.amount,
    deposit_currency: DEPOSIT.currency,
    deposit_due_by: new Date(now.getTime() + DEPOSIT.holdHours * 3600 * 1000).toISOString(),
    deposit_nudge_sent_at: null,
    deposit_reminder_sent_at: null,
  };
}

// What an action does to the deposit, before the status write. `by`: owner | customer.
//   owner cancel of a paid deposit  → refund happens after the write (refundIfPaid); here: nothing yet
//   owner cancel / decline of a due deposit → none (nothing was paid, nothing to chase)
//   customer cancel of a paid deposit, no-show → kept
//   customer cancel of a due deposit → none
export function depositFieldsFor({ booking, action, by = 'owner', now = new Date() }) {
  const d = depositOf(booking);
  if (action === 'confirm' && d === 'none') return dueFields(now);
  if (action === 'reschedule' && booking.status === 'requested' && d === 'none') return dueFields(now);
  if (action === 'cancel' || action === 'decline') {
    if (d === 'due') return { deposit_status: 'none', deposit_due_by: null };
    if (d === 'paid' && by === 'customer') return { deposit_status: 'kept' };
  }
  if (action === 'no_show' && d === 'paid') return { deposit_status: 'kept' };
  return {};
}

// After an owner cancel: refund a paid deposit. Returns the refreshed booking
// and whether the refund went through (false → the owner refunds by hand).
export async function refundIfPaid(booking, { reason = 'requested_by_customer' } = {}) {
  if (depositOf(booking) !== 'paid' || !booking.deposit_payment_intent) return { booking, refunded: false, needed: false };
  const r = await refundPaymentIntent(booking.deposit_payment_intent, { bookingId: booking.id, reason });
  if (!r.ok) {
    console.error(`[${config.slug} deposit] refund failed for ${booking.id}: ${r.reason} ${r.message || ''}`);
    return { booking, refunded: false, needed: true, reason: r.reason };
  }
  const updated = (await updateBooking(booking.id, { deposit_status: 'refunded', deposit_refund_id: r.data.id, deposit_refunded_at: new Date().toISOString() })) || { ...booking, deposit_status: 'refunded' };
  return { booking: updated, refunded: true, needed: true };
}

// --- checkout ----------------------------------------------------------------------

// The Checkout page for a confirmed booking whose deposit is due. Reuses the
// stored session while it is still open; a fresh one otherwise. → { ok, url }
export async function startCheckout({ booking, origin, token }) {
  if (!depositEnabled()) return { ok: false, reason: 'deposit-off' };
  if (booking.status !== 'confirmed') return { ok: false, reason: 'not-confirmed' };
  if (depositOf(booking) === 'paid') return { ok: false, reason: 'already-paid' };
  if (depositOf(booking) !== 'due') return { ok: false, reason: 'not-due' };
  const manageUrl = `${origin}/booking/manage?t=${token}`;
  if (booking.deposit_session_id) {
    const cur = await getCheckoutSession(booking.deposit_session_id);
    if (cur.ok && cur.data.status === 'open' && cur.data.url) return { ok: true, url: cur.data.url, session: cur.data };
    if (cur.ok && cur.data.payment_status === 'paid') {
      await markDepositPaid({ booking, session: cur.data, origin });
      return { ok: false, reason: 'already-paid' };
    }
  }
  const lang = booking.lang === 'es' ? 'es' : 'en';
  const amount = booking.deposit_amount || DEPOSIT.amount, currency = booking.deposit_currency || DEPOSIT.currency;
  const inHours = Math.max(0.5, Math.min(24, (new Date(booking.deposit_due_by || Date.now() + 24 * 3600e3).getTime() - Date.now()) / 3600e3));
  const r = await createCheckoutSession({
    amount,
    currency,
    name: lang === 'es' ? `Depósito · ${siteName()}` : `Deposit · ${siteName()}`,
    description: `${booking.service_label} · ${booking.name}`,
    bookingId: booking.id,
    customerEmail: booking.email || '',
    successUrl: `${manageUrl}&paid=1&cs={CHECKOUT_SESSION_ID}`,
    cancelUrl: manageUrl,
    expiresAt: Math.floor(Date.now() / 1000) + Math.round(inHours * 3600),
    idempotencyKey: `deposit-${booking.id}-${booking.deposit_session_id ? 'again' : 'first'}-${String(booking.deposit_due_by || '').slice(0, 13)}`,
  });
  if (!r.ok) return { ok: false, reason: r.reason, message: r.message };
  await updateBooking(booking.id, { deposit_session_id: r.data.id }).catch((err) => console.warn(`[${config.slug} deposit] session id not stored: ${err.message}`));
  return { ok: true, url: r.data.url, session: r.data };
}

// Idempotent: a webhook retry or the success page after the webhook changes
// nothing and mails nobody twice. Returns { booking, changed }.
export async function markDepositPaid({ booking, session, origin = config.productionUrl, content = null }) {
  if (depositOf(booking) === 'paid') return { booking, changed: false };
  const paymentIntent = session && typeof session.payment_intent === 'string' ? session.payment_intent : session && session.payment_intent && session.payment_intent.id ? session.payment_intent.id : null;
  // the write is conditional on the deposit still being due: the webhook and
  // the success page racing each other mark it once and mail once
  const stored = await updateBooking(
    booking.id,
    { deposit_status: 'paid', deposit_payment_intent: paymentIntent, deposit_paid_at: new Date().toISOString(), deposit_session_id: session && session.id ? session.id : booking.deposit_session_id || null },
    { ifDeposit: 'due' }
  );
  if (!stored) return { booking: (await bookingById(booking.id).catch(() => null)) || booking, changed: false };
  const updated = stored;
  const site = content ? { content } : await loadSite();
  const ctx = { booking: updated, origin, intake: intakeFor(site.content), settings: settingsFrom(site.content), manageUrl: `${origin}/booking/manage?t=${manageToken(updated.id)}` };
  const owner = await sendBookingEmail('owner_deposit_paid', { ...ctx, links: { open: `${origin}/admin/#bookings` } });
  const customer = await sendBookingEmail('deposit_paid', ctx);
  console.log(`[${config.slug} deposit] paid ${updated.id}: owner=${owner.ok ? 'sent' : owner.reason} customer=${customer.ok ? 'sent' : customer.reason}`);
  return { booking: updated, changed: true };
}

// The success page landed with ?cs=: ask Stripe, mark paid if it is, so the
// customer sees "Deposit received" even before the webhook fires.
export async function syncFromSession({ booking, sessionId, origin }) {
  if (!depositEnabled() || depositOf(booking) === 'paid') return { booking, changed: false };
  if (!sessionId || (booking.deposit_session_id && booking.deposit_session_id !== sessionId)) return { booking, changed: false };
  const r = await getCheckoutSession(sessionId);
  if (!r.ok || r.data.payment_status !== 'paid') return { booking, changed: false };
  if ((r.data.metadata && r.data.metadata.booking_id) !== booking.id && r.data.client_reference_id !== booking.id) return { booking, changed: false };
  return markDepositPaid({ booking, session: r.data, origin });
}

// A verified webhook event. Only checkout.session.completed with a paid
// session matters; everything else is acknowledged and ignored.
export async function handleStripeEvent(event, { origin = config.productionUrl } = {}) {
  if (!event || event.type !== 'checkout.session.completed') return { handled: false, reason: 'ignored' };
  const session = event.data && event.data.object;
  // an invoice's page (lib/invoices.mjs) shares this webhook: its metadata names the invoice
  if (session && session.metadata && session.metadata.invoice_id && INVOICES) return handleInvoiceSession(session, { origin });
  if (!session || session.payment_status !== 'paid') return { handled: false, reason: 'unpaid' };
  const id = (session.metadata && session.metadata.booking_id) || session.client_reference_id || '';
  let booking = /^[0-9a-f-]{36}$/i.test(id) ? await bookingById(id) : null;
  if (!booking && session.id) booking = await bookingByDepositSession(session.id);
  if (!booking) return { handled: false, reason: 'no-booking' };
  if (booking.deposit_session_id && session.id && booking.deposit_session_id !== session.id && depositOf(booking) === 'paid') return { handled: false, reason: 'other-session' };
  const r = await markDepositPaid({ booking, session, origin });
  return { handled: true, changed: r.changed, booking: r.booking };
}

// Hourly (booking-reminders.mjs): a confirmed booking past its hold with the
// deposit unpaid → one email to the owner. The time stays on the books: the
// owner decides whether to cancel it or text the customer.
export async function nudgeOverdueDeposits({ now = new Date(), origin = config.productionUrl } = {}) {
  if (!depositEnabled()) return { sent: 0, due: 0 };
  const rows = await overdueDeposits(now.toISOString());
  let sent = 0;
  if (!rows.length) return { sent, due: 0 };
  const { content } = await loadSite();
  const ctx = { origin, intake: intakeFor(content), settings: settingsFrom(content) };
  for (const booking of rows) {
    const r = await sendBookingEmail('owner_deposit_overdue', { ...ctx, booking, links: { open: `${origin}/admin/#bookings` } });
    if (r.ok) sent++;
    await updateBooking(booking.id, { deposit_nudge_sent_at: now.toISOString() }).catch((err) => console.warn(`[deposit] nudge mark failed: ${err.message}`));
  }
  return { sent, due: rows.length };
}

// Hourly too: halfway through the hold, a still-due deposit gets ONE email
// to the customer with the Pay button (the owner's nudge comes after the
// hold). Not between 9 PM and 8 AM site time: the next run catches it.
export const REMIND_QUIET = { before: 8, from: 21 };
export async function remindDueDeposits({ now = new Date(), origin = config.productionUrl } = {}) {
  if (!depositEnabled()) return { sent: 0, due: 0 };
  const { hh } = zonedParts(now, BOOKING.tz);
  if (hh < REMIND_QUIET.before || hh >= REMIND_QUIET.from) return { sent: 0, due: 0, quiet: true };
  const holdEnd = new Date(now.getTime() + (DEPOSIT.holdHours / 2) * 3600e3).toISOString();
  const rows = await depositsToRemind(now.toISOString(), holdEnd);
  let sent = 0;
  if (!rows.length) return { sent, due: 0 };
  const { content } = await loadSite();
  const ctx = { origin, intake: intakeFor(content), settings: settingsFrom(content) };
  for (const booking of rows) {
    const r = await sendBookingEmail('deposit_reminder', { ...ctx, booking, manageUrl: `${origin}/booking/manage?t=${manageToken(booking.id)}`, payUrl: payUrlFor(booking.id, origin) });
    if (r.ok) sent++;
    // marked either way: a customer without email is not retried every hour
    await updateBooking(booking.id, { deposit_reminder_sent_at: now.toISOString() }).catch((err) => console.warn(`[deposit] reminder mark failed: ${err.message}`));
  }
  return { sent, due: rows.length };
}

// What the customer-facing texts say about the deposit, in one place.
export function depositTerms(lang = 'en', d = DEPOSIT) {
  if (!d) return '';
  const amt = depositAmountText(lang, d);
  if (lang === 'es') return `${amt} ${d.credited ? 'se descuenta de tu cuenta' : 'es una cuota de reserva'}. Se reembolsa completo si nosotros tenemos que cancelar; si tú cancelas o no estás para la visita, no se reembolsa.`;
  return `The ${amt} ${d.credited ? 'comes off your bill' : 'is a booking fee'}. It is refunded in full if we have to cancel; if you cancel or miss the visit, it is kept.`;
}
