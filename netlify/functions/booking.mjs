// Booking calendar, public side (config.booking in request mode):
//
//   GET  /api/booking/days?from=YYYY-MM-DD&to=YYYY-MM-DD  → open days + offered times (never other people's requests)
//   POST /api/booking                                    → store a request, email the owner + the customer
//   GET  /api/booking/manage?t=                          → the customer's booking as JSON
//   POST /api/booking/manage?t=  { action: cancel | rebook | share }      share: the car (vin / car_model) and what they noticed (issues + the agreement), after the request (lib/booking-car.mjs)
//   GET  /booking/manage?t=[&sent=1]                     → the customer's manage page (HTML)
//   GET  /api/booking/act?t=&do=confirm|decline          → owner one-tap page from the email: asks, acts on nothing
//   POST /api/booking/act?t=&do=confirm|decline          → that page's button: acts, shows the result (lib/booking-act.mjs)
//   GET  /calendar.ics?t=                                → the owner's feed of confirmed bookings (subscribe from the phone)
//   GET  /booking/pay?t=                                 → the deposit: 303 to a Stripe Checkout page (lib/booking-deposit.mjs)
//   POST /api/booking/stripe                             → Stripe's webhook (checkout.session.completed → deposit paid)
//
// Honeypot (bot-field), same-origin on POST, per-IP rate limit, every value
// clipped and checked against the pack's field list before it is stored.

import { BOOKING, QUESTIONS, config as site } from './lib/config.mjs';
import { customerForBooking } from './lib/customers.mjs';
import { loadSite } from './lib/content.mjs';
import { dbConfigured } from './lib/db.mjs';
import { openDays, settingsFrom, overlapSummary, isDateStr } from './lib/booking.mjs';
import { buildBookingRow, intakeFor } from './lib/booking-form.mjs';
import { activeBookingsBetween, bookingByManageHash, countRecentByIp, createBooking, updateBooking } from './lib/booking-db.mjs';
import { sendBookingEmail, whenText } from './lib/booking-email.mjs';
import { renderManagePage } from './lib/booking-page.mjs';
import crypto from 'node:crypto';
import { actHash, actToken as actTokenFor, feedTokenOk, manageHash, manageToken } from './lib/booking-token.mjs';
import { bookingIcs, icsCalendarFor } from './lib/booking-email.mjs';
import { listBookings } from './lib/booking-db.mjs';
import { addDays, zonedParts, zonedToUtc } from './lib/booking.mjs';
import { hashToken } from './lib/session.mjs';
import { clientIp, handleError, html, json, readJson, sameOrigin } from './lib/http.mjs';
import { ownerActPage, ownerActPost } from './lib/booking-act.mjs';
import { buildShare, carWords } from './lib/booking-car.mjs';
import { depositEnabled, depositFieldsFor, depositOf, handleStripeEvent, startCheckout, syncFromSession } from './lib/booking-deposit.mjs';
import { loadStripeKeys, stripeWebhookConfigured, verifyWebhookSignature } from './lib/stripe.mjs';

const MAX_PER_IP_PER_HOUR = 6;
const ACT_DAYS = 7;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

// JSON or a classic form post (the no-JS path) → a plain object.
async function readBody(req) {
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) return readJson(req, 64 * 1024);
  const text = await req.text();
  if (text.length > 64 * 1024) throw Object.assign(new Error('Payload too large'), { status: 413 });
  const out = {};
  for (const [k, v] of new URLSearchParams(text)) out[k] = v;
  return out;
}
function wantsHtml(req) {
  return !(req.headers.get('content-type') || '').includes('application/json') && (req.headers.get('accept') || '').includes('text/html');
}

// --- days -------------------------------------------------------------------------

async function days(url) {
  const { content } = await loadSite();
  const settings = settingsFrom(content);
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const r = openDays({ settings, from: isDateStr(from) ? from : '', to: isDateStr(to) ? to : '', tz: BOOKING.tz });
  return json(200, { ok: true, tz: BOOKING.tz, mode: settings.mode, today: r.today, last: r.last, days: r.days.map((d) => ({ date: d.date, times: d.times.map((t) => ({ id: t.id, label: t.label, label_es: t.label_es })) })) });
}

// --- create -----------------------------------------------------------------------

async function create(req, url) {
  const body = await readBody(req);
  const lang = body.lang === 'es' ? 'es' : 'en';
  if (!sameOrigin(req)) return json(403, { ok: false, error: 'Cross-origin request blocked' });
  // Honeypot: bots fill every field. Say yes, store nothing.
  if (String(body['bot-field'] || '').trim()) return json(200, { ok: true, id: null });
  if (!dbConfigured()) return json(503, { ok: false, error: lang === 'es' ? 'Las reservas no están disponibles ahora. Llámanos.' : 'Booking is not available right now. Call us.' });
  const ip = clientIp(req) || null;
  const recent = await countRecentByIp(ip, new Date(Date.now() - 3600 * 1000).toISOString());
  if (recent >= MAX_PER_IP_PER_HOUR) return json(429, { ok: false, error: lang === 'es' ? 'Demasiadas solicitudes. Intenta más tarde o llámanos.' : 'Too many requests. Try again later, or call us.' });

  const { content } = await loadSite();
  const { row, settings } = buildBookingRow({ body, content });
  // A booking with an email belongs to that customer's account; a failure
  // here never costs the request.
  const customerId = QUESTIONS && row.email
    ? await customerForBooking(row).catch((err) => { console.warn(`[${site.slug} booking] no customer account: ${err && err.message}`); return null; })
    : null;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const booking = await createBooking({
    id,
    created_at: createdAt,
    ...row,
    ...(customerId ? { customer_id: customerId } : {}),
    manage_token_hash: manageHash(id),
    act_token_hash: actHash(id, createdAt),
    act_expires_at: new Date(Date.now() + ACT_DAYS * 86400000).toISOString(),
    request_ip: ip,
  });
  if (!booking) throw new Error('booking insert returned nothing');

  const origin = `${url.protocol}//${url.host}`;
  const intake = intakeFor(content);
  const manageUrl = `${origin}/booking/manage?t=${manageToken(id)}`;
  const actToken = actTokenFor(id, createdAt);
  const others = await activeBookingsBetween(booking.starts_at, booking.ends_at).catch(() => []);
  const overlap = overlapSummary([...others.filter((o) => o.id !== booking.id), booking])[booking.id] || { requested: 0, confirmed: [] };
  // The owner notice first and alone (with retries inside): it is the mail
  // that matters, and the shared sender's rate limit must not make the two
  // race. Then the customer's copy.
  const owner = await sendBookingEmail('owner_new', {
    booking, origin, intake, settings, overlap,
    links: { confirm: `${origin}/api/booking/act?t=${actToken}&do=confirm`, decline: `${origin}/api/booking/act?t=${actToken}&do=decline`, open: `${origin}/admin/#bookings` },
  });
  const customer = await sendBookingEmail('received', { booking, origin, intake, settings, manageUrl, confirmWithin: settings.confirmWithin[booking.lang] || settings.confirmWithin.en });
  console.log(`[${site.slug} booking] new ${booking.id}: owner=${owner.ok ? 'sent' : owner.reason} (tries ${owner.tries || 1}) customer=${customer.ok ? 'sent' : customer.reason}`);
  if (wantsHtml(req)) return new Response(null, { status: 303, headers: { Location: `${manageUrl}&sent=1` } });
  return json(200, {
    ok: true,
    id: booking.id,
    when: { en: whenText(booking, 'en', settings), es: whenText(booking, 'es', settings) },
    service: booking.service_label,
    manage_url: manageUrl,
    emailed: customer.ok,
  });
}

// --- manage (customer) --------------------------------------------------------------

async function manageLookup(url) {
  const token = url.searchParams.get('t') || '';
  if (!TOKEN_RE.test(token) || !dbConfigured()) return { token, booking: null };
  return { token, booking: await bookingByManageHash(hashToken(token)) };
}

const MANAGE_ERROR = 'Something went wrong on our side. Try again in a minute, or call us.';
// The manage page's own error state: a broken database never shows as raw JSON.
function managePageError(err) {
  console.error(`[${site.slug}] manage page:`, err && (err.stack || err.message));
  return html(500, renderManagePage({ booking: null, error: MANAGE_ERROR }));
}

async function managePage(req, url) {
  try {
    let { token, booking } = await manageLookup(url);
    const { content } = booking ? await loadSite() : { content: null };
    const origin = `${url.protocol}//${url.host}`;
    // Back from Stripe with ?paid=1&cs=: check the session ourselves so the
    // page says "received" even when the webhook has not landed yet.
    let justPaid = false;
    if (booking && url.searchParams.get('paid') === '1') {
      const r = await syncFromSession({ booking, sessionId: String(url.searchParams.get('cs') || '').slice(0, 120), origin }).catch(() => ({ booking, changed: false }));
      booking = r.booking;
      justPaid = depositOf(booking) === 'paid';
    }
    return html(booking ? 200 : 404, renderManagePage({ booking, token, intake: content ? intakeFor(content) : [], settings: content ? settingsFrom(content) : null, sent: url.searchParams.get('sent') === '1', justPaid, payUrl: booking && depositOf(booking) === 'due' && depositEnabled() ? `${origin}/booking/pay?t=${token}` : '' }));
  } catch (err) {
    return managePageError(err);
  }
}

async function manageJson(url) {
  const { booking } = await manageLookup(url);
  if (!booking) return json(404, { ok: false, error: 'Not found' });
  const { content } = await loadSite();
  const settings = settingsFrom(content);
  const { id, status, service_label, starts_at, ends_at, window, lang } = booking;
  return json(200, { ok: true, booking: { id, status, service_label, starts_at, ends_at, window, lang, when: whenText(booking, lang, settings), deposit: depositOf(booking), deposit_amount: booking.deposit_amount || null, deposit_due_by: booking.deposit_due_by || null, vin: booking.vin || '', car_model: booking.car_model || '', issues: booking.issues || '', self_report_ack: Boolean(booking.self_report_ack) } });
}

// --- the deposit ------------------------------------------------------------------------

// The customer's Pay link: a fresh (or still open) Stripe Checkout page.
async function payPage(req, url) {
  try {
    const { token, booking } = await manageLookup(url);
    if (!booking) return html(404, renderManagePage({ booking: null, token }));
    const origin = `${url.protocol}//${url.host}`;
    const r = await startCheckout({ booking, origin, token });
    if (r.ok) return new Response(null, { status: 303, headers: { Location: r.url, 'Cache-Control': 'no-store' } });
    // paid already, not confirmed, deposit off, or Stripe down: the manage
    // page says where things stand (and keeps the Pay button when it is just Stripe)
    const { content } = await loadSite();
    const fresh = r.reason === 'already-paid' ? (await bookingByManageHash(hashToken(token))) || booking : booking;
    return html(r.reason === 'already-paid' || r.reason === 'not-confirmed' || r.reason === 'not-due' || r.reason === 'deposit-off' ? 200 : 503, renderManagePage({ booking: fresh, token, intake: intakeFor(content), settings: settingsFrom(content), payUrl: '', payError: ['already-paid', 'not-confirmed', 'not-due', 'deposit-off'].includes(r.reason) ? '' : 'stripe' }));
  } catch (err) {
    return managePageError(err);
  }
}

// Stripe → us. Signature first; a bad one is a 400 and nothing is read.
// Everything verified is answered 200 so Stripe stops retrying; the work is
// idempotent, so a replay changes nothing.
async function stripeWebhook(req, url) {
  if (!stripeWebhookConfigured()) return json(503, { ok: false, error: 'Webhook secret not set' });
  const raw = await req.text();
  if (raw.length > 256 * 1024) return json(413, { ok: false, error: 'Payload too large' });
  if (!verifyWebhookSignature(raw, req.headers.get('stripe-signature') || '')) return json(400, { ok: false, error: 'Bad signature' });
  let event;
  try {
    event = JSON.parse(raw);
  } catch (_) {
    return json(400, { ok: false, error: 'Bad JSON' });
  }
  const origin = `${url.protocol}//${url.host}`;
  const r = await handleStripeEvent(event, { origin }).catch((err) => {
    console.error(`[${site.slug} deposit] webhook ${event && event.type}:`, err && (err.stack || err.message));
    return { handled: false, reason: 'error' };
  });
  // a handler error is a 500 so Stripe retries later; the rest is 200
  return json(r.reason === 'error' ? 500 : 200, { ok: r.reason !== 'error', received: true, handled: Boolean(r.handled), reason: r.reason || null });
}

async function manageAct(req, url) {
  if (!sameOrigin(req)) return json(403, { ok: false, error: 'Cross-origin request blocked' });
  const body = await readBody(req);
  const { token, booking } = await manageLookup(url);
  if (!booking) return wantsHtml(req) ? html(404, renderManagePage({ booking: null, token })) : json(404, { ok: false, error: 'Not found' });
  const action = String(body.action || '');
  const active = booking.status === 'requested' || booking.status === 'confirmed';
  if (!['cancel', 'rebook', 'share'].includes(action)) return json(400, { ok: false, error: 'Unknown action' });
  if (action === 'share') return shareCar({ booking, body, active });
  const { content } = await loadSite();
  const intake = intakeFor(content), settings = settingsFrom(content);
  let updated = booking, emailed = false;
  if (active) {
    // a paid deposit is kept when the customer cancels (said before they paid)
    updated = await updateBooking(booking.id, { status: 'cancelled', ...depositFieldsFor({ booking, action: 'cancel', by: 'customer' }) }, { ifStatus: booking.status });
    if (!updated) {
      // the owner acted between our read and our write: say so, mail nobody
      const now = (await bookingByManageHash(hashToken(token))) || booking;
      return wantsHtml(req) ? html(409, renderManagePage({ booking: now, token, intake, settings })) : json(409, { ok: false, error: 'This booking changed a moment ago. Reload the page.', status: now.status });
    }
    const origin = `${url.protocol}//${url.host}`;
    await sendBookingEmail('owner_cancelled', { booking: updated, origin, intake, settings, links: { open: `${origin}/admin/#bookings` } });
    emailed = Boolean((await sendBookingEmail('cancelled', { booking: updated, origin, intake, settings })).ok);
  }
  if (action === 'rebook') return new Response(null, { status: 303, headers: { Location: '/#book' } });
  if (wantsHtml(req)) return html(200, renderManagePage({ booking: updated, token, intake, settings, justCancelled: active }));
  return json(200, { ok: true, status: updated.status, emailed });
}

// The car and what they noticed, posted onto the request after it is sent
// (the funnel's last step; the booking link could do the same). Never a
// status change, never an email: the owner sees it on the one-tap page and
// in the Bookings tab. Issues without the ticked agreement are a 400.
async function shareCar({ booking, body, active }) {
  const lang = body.lang === 'es' ? 'es' : booking.lang === 'es' ? 'es' : 'en';
  if (!active) return json(409, { ok: false, error: carWords(lang).not_active });
  const patch = buildShare({ body, lang });
  const updated = await updateBooking(booking.id, patch);
  if (!updated) throw new Error('share update returned nothing');
  return json(200, { ok: true, vin: updated.vin || '', car_model: updated.car_model || '', issues: updated.issues || '', self_report_ack: Boolean(updated.self_report_ack), self_report_notice: updated.self_report_notice || '' });
}

// --- the owner's calendar feed ------------------------------------------------------

async function feed(url) {
  if (!feedTokenOk(url.searchParams.get('t'))) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!dbConfigured()) return new Response('Not available', { status: 503 });
  const { content } = await loadSite();
  const settings = settingsFrom(content);
  const intake = intakeFor(content);
  const tz = BOOKING.tz;
  const today = zonedParts(new Date(), tz).date;
  const rows = await listBookings({ statuses: ['confirmed', 'completed'], from: zonedToUtc(addDays(today, -30), 0, tz).toISOString(), to: zonedToUtc(addDays(today, settings.horizonDays + 60), 0, tz).toISOString(), limit: 500 });
  const origin = `${url.protocol}//${url.host}`;
  const body = icsCalendarFor(rows.map((b) => bookingIcs(b, { origin, forOwner: true, intake, settings })));
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' } });
}

// --- router -------------------------------------------------------------------------

export default async (req) => {
  if (!BOOKING) return json(404, { ok: false, error: 'No booking calendar on this site' });
  const url = new URL(req.url);
  const m = req.method;
  try {
    await loadStripeKeys(); // env keys, or the ones the owner connected in /admin/ → Payments
    if (url.pathname === '/booking/manage') return m === 'GET' ? await managePage(req, url) : json(405, { ok: false, error: 'GET only' });
    if (url.pathname === '/booking/pay') return m === 'GET' ? await payPage(req, url) : json(405, { ok: false, error: 'GET only' });
    if (url.pathname === '/calendar.ics') return m === 'GET' ? await feed(url) : json(405, { ok: false, error: 'GET only' });
    const sub = url.pathname.replace(/^\/api\/booking\/?/, '').replace(/\/$/, '');
    if (sub === 'stripe') return m === 'POST' ? await stripeWebhook(req, url) : json(405, { ok: false, error: 'POST only' });
    if (sub === 'days' && m === 'GET') return await days(url);
    if (sub === '' && m === 'POST') return await create(req, url);
    if (sub === 'manage' && m === 'GET') return await manageJson(url);
    if (sub === 'manage' && m === 'POST') return await manageAct(req, url).catch((err) => (wantsHtml(req) ? managePageError(err) : handleError(err)));
    if (sub === 'act' && m === 'GET') return await ownerActPage(req, url);
    if (sub === 'act' && m === 'POST') return await ownerActPost(req, url);
    return json(404, { ok: false, error: 'Unknown endpoint' });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: ['/api/booking', '/api/booking/*', '/booking/manage', '/booking/pay', '/calendar.ics'] };
