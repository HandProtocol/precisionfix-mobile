// The $50 deposit: config, the state machine's patches, Checkout, the
// webhook, refunds, the customer pages and the emails. Stripe, Supabase and
// Resend are all fetch, so one fake backend scripts all three.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING, config, normalizeDeposit } from '../netlify/functions/lib/config.mjs';
import { depositFieldsFor, depositOf, dueFields, depositEnabled, handleStripeEvent, markDepositPaid, nudgeOverdueDeposits, startCheckout } from '../netlify/functions/lib/booking-deposit.mjs';
import { applyAction, transition } from '../netlify/functions/lib/booking-admin.mjs';
import { createCheckoutSession, fmtMoney, formEncode, signWebhook, verifyWebhookSignature } from '../netlify/functions/lib/stripe.mjs';
import { customerCancelledEmail, customerConfirmedEmail, outcomeText } from '../netlify/functions/lib/booking-email.mjs';
import { renderManagePage } from '../netlify/functions/lib/booking-page.mjs';
import { manageToken } from '../netlify/functions/lib/booking-token.mjs';
import handler from '../netlify/functions/booking.mjs';
import { depositColumnsSql, depositMigrationSql } from '../scripts/gen-migration.mjs';

const PREFIX = config.envPrefix;
// the manage tokens are signed with the session secret: pin it so the rows built
// before fakeBackend() runs carry the same hashes the handler looks up
process.env[`${PREFIX}_SESSION_SECRET`] = 'deposit-test-secret';
const NOW = new Date('2026-10-14T18:00:00Z');
const base = {
  id: '11111111-2222-4333-8444-555555555555', status: 'confirmed', service_key: 'brake-service', service_label: 'Brake Service',
  starts_at: '2026-10-16T13:00:00Z', ends_at: '2026-10-16T16:00:00Z', tz: 'America/Chicago', window: 'Morning',
  requested_starts_at: '2026-10-16T13:00:00Z', requested_ends_at: '2026-10-16T16:00:00Z',
  name: 'Ana', phone: '(512) 555-0100', email: 'ana@example.com', lang: 'en', contact_pref: 'text', location_kind: 'at_customer',
  address: '1 Main St', city: 'Austin', intake: {}, notes: 'squeal', owner_note: '', decline_reason: '', source: 'site',
  created_at: '2026-10-14T15:00:00Z', confirmed_at: null, updated_at: '2026-10-14T15:00:00Z', updated_by: null, act_expires_at: null,
  reminder_sent_at: null, reminder_soon_sent_at: null, deposit_status: 'none', deposit_amount: null, deposit_currency: null, deposit_due_by: null,
  deposit_session_id: null, deposit_payment_intent: null, deposit_paid_at: null, deposit_refund_id: null, deposit_refunded_at: null, deposit_nudge_sent_at: null,
};
const booking = (over = {}) => ({ ...base, ...over, manage_token_hash: hash(manageToken(over.id || base.id)) });
import { hashToken as hash } from '../netlify/functions/lib/session.mjs';

// stripe: optional (path, body) => { status, body } to script Stripe (default: a session / refund that works)
// sessionPaid: what GET /checkout/sessions/:id reports (true = the customer paid)
function fakeBackend({ rows = [], stripe = null, webhookSecret = 'whsec_test', sessionPaid = true } = {}) {
  const calls = { sb: [], mail: [], stripe: [] };
  const realFetch = globalThis.fetch;
  const api = { calls, rows, restore() { globalThis.fetch = realFetch; for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'EMAIL_FROM', `${PREFIX}_STRIPE_SECRET_KEY`, `${PREFIX}_STRIPE_WEBHOOK_SECRET`, `${PREFIX}_BOOKING_NOTIFY`]) delete process.env[k]; } };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://api.resend.com/')) { calls.mail.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ id: 'em' }), text: async () => '' }; }
    if (u.startsWith('https://api.stripe.com/v1')) {
      const path = u.slice('https://api.stripe.com/v1'.length);
      const body = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null;
      calls.stripe.push({ method: init.method, path, body, headers: init.headers });
      const scripted = stripe ? await stripe(path, body, init) : null;
      if (scripted) return { ok: scripted.status < 300, status: scripted.status, json: async () => scripted.body };
      if (path === '/checkout/sessions' && init.method === 'POST') return { ok: true, status: 200, json: async () => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', status: 'open', payment_status: 'unpaid' }) };
      if (path.startsWith('/checkout/sessions/')) return { ok: true, status: 200, json: async () => (sessionPaid ? { id: path.split('/').pop(), status: 'complete', payment_status: 'paid', payment_intent: 'pi_1', metadata: { booking_id: base.id }, client_reference_id: base.id } : { id: path.split('/').pop(), status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/c/pay/' + path.split('/').pop(), metadata: { booking_id: base.id } }) };
      if (path === '/refunds') return { ok: true, status: 200, json: async () => ({ id: 're_1', status: 'succeeded' }) };
      return { ok: false, status: 404, json: async () => ({ error: { message: 'no such route' } }) };
    }
    const path = u.replace(/^https:\/\/db\.test\/rest\/v1/, '');
    calls.sb.push({ method: init.method || 'GET', path, body: init.body ? JSON.parse(init.body) : undefined });
    const T = config.tables;
    if (path.startsWith(`/${T.content}`) || path.startsWith(`/${T.media}`) || path.startsWith(`/${T.editors}`)) return { ok: true, status: 200, json: async () => [] };
    if (path.startsWith(`/${T.bookings}`)) {
      if (init.method === 'PATCH') {
        const id = decodeURIComponent(/[?&]id=eq\.([^&]+)/.exec(path)[1]);
        const st = /[?&]status=eq\.([^&]+)/.exec(path), dep = /[?&]deposit_status=eq\.([^&]+)/.exec(path);
        const row = rows.find((r) => r.id === id && (!st || r.status === st[1]) && (!dep || r.deposit_status === dep[1]));
        if (!row) return { ok: true, status: 200, json: async () => [] };
        Object.assign(row, JSON.parse(init.body));
        return { ok: true, status: 200, json: async () => [row] };
      }
      const pick = (re, key) => { const m = re.exec(path); return m ? rows.filter((r) => String(r[key]) === decodeURIComponent(m[1])) : null; };
      const byId = pick(/[?&]id=eq\.([^&]+)/, 'id'); if (byId) return { ok: true, status: 200, json: async () => byId };
      const byHash = pick(/manage_token_hash=eq\.([^&]+)/, 'manage_token_hash'); if (byHash) return { ok: true, status: 200, json: async () => byHash };
      const bySession = pick(/deposit_session_id=eq\.([^&]+)/, 'deposit_session_id'); if (bySession) return { ok: true, status: 200, json: async () => bySession };
      if (/deposit_status=eq\.due&deposit_due_by=lt\./.test(path)) { const lt = decodeURIComponent(/deposit_due_by=lt\.([^&]+)/.exec(path)[1]); return { ok: true, status: 200, json: async () => rows.filter((r) => r.status === 'confirmed' && r.deposit_status === 'due' && r.deposit_due_by < lt && !r.deposit_nudge_sent_at) }; }
      return { ok: true, status: 200, json: async () => rows };
    }
    throw new Error('unexpected fetch ' + u);
  };
  process.env.SUPABASE_URL = 'https://db.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  process.env.RESEND_API_KEY = 'r';
  process.env.EMAIL_FROM = 'Site <hi@example.com>';
  process.env[`${PREFIX}_STRIPE_SECRET_KEY`] = 'sk_test_x';
  process.env[`${PREFIX}_STRIPE_WEBHOOK_SECRET`] = webhookSecret;
  process.env[`${PREFIX}_BOOKING_NOTIFY`] = 'owner@example.com';
  return api;
}
const req = (path, { method = 'GET', body, headers = {}, raw } = {}) =>
  new Request(`https://site.test${path}`, { method, headers: { origin: 'https://site.test', accept: 'text/html', ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: raw !== undefined ? raw : body ? JSON.stringify(body) : undefined });

test('config: the site asks a $50 deposit, held 24 hours, credited to the bill; the normalizer rejects nonsense', { skip: !BOOKING && 'no calendar on this site' }, () => {
  assert.deepEqual(BOOKING.deposit, { amount: 5000, currency: 'usd', holdHours: 24, credited: true });
  assert.equal(normalizeDeposit(null), null);
  assert.deepEqual(normalizeDeposit({ amount: 2500 }), { amount: 2500, currency: 'usd', holdHours: 24, credited: true });
  assert.deepEqual(normalizeDeposit({ amount: 100, currency: 'EUR', hold_hours: 2000, credited: false }), { amount: 100, currency: 'eur', holdHours: 336, credited: false });
  assert.throws(() => normalizeDeposit({ amount: 12.5 }), /minor units/);
  assert.throws(() => normalizeDeposit({ amount: 5000, currency: 'dollars' }), /3-letter/);
  assert.equal(fmtMoney(5000, 'usd'), '$50');
  assert.equal(fmtMoney(1250, 'usd'), '$12.50');
  assert.equal(fmtMoney(5000, 'usd', 'es'), '$50');
  assert.equal(formEncode({ line_items: [{ quantity: 1, price_data: { unit_amount: 5000 } }], metadata: { booking_id: 'b' }, skip: undefined }).toString(), 'line_items%5B0%5D%5Bquantity%5D=1&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=5000&metadata%5Bbooking_id%5D=b');
});

test('without a Stripe key the deposit is off: confirm adds nothing and the calendar behaves as before', { skip: !BOOKING && 'no calendar on this site' }, () => {
  delete process.env[`${PREFIX}_STRIPE_SECRET_KEY`];
  assert.equal(depositEnabled(), false);
  assert.deepEqual(dueFields(NOW), {});
  const patch = transition(booking({ status: 'requested' }), 'confirm', {}, { now: NOW });
  assert.equal(patch.status, 'confirmed');
  assert.equal('deposit_status' in patch, false);
});

test('the state machine: confirm → due with a 24h hold; owner cancel of a due deposit → none; customer cancel / no-show of a paid one → kept; the two by-hand actions', { skip: !BOOKING && 'no calendar on this site' }, () => {
  process.env[`${PREFIX}_STRIPE_SECRET_KEY`] = 'sk_test_x';
  try {
    const due = dueFields(NOW);
    assert.deepEqual(due, { deposit_status: 'due', deposit_amount: 5000, deposit_currency: 'usd', deposit_due_by: '2026-10-15T18:00:00.000Z', deposit_nudge_sent_at: null });
    const confirmed = transition(booking({ status: 'requested' }), 'confirm', {}, { now: NOW });
    assert.equal(confirmed.deposit_status, 'due');
    assert.equal(confirmed.deposit_due_by, '2026-10-15T18:00:00.000Z');
    // a reschedule of a request confirms it, so the deposit falls due; of a confirmed booking it does not touch a paid deposit
    assert.equal(transition(booking({ status: 'requested' }), 'reschedule', { date: '2026-10-20', time: '09:00', duration: 60 }, { now: NOW, settings: { hours: {}, windows: [], mode: 'windows', blackouts: new Set() } }).deposit_status, 'due');
    assert.equal('deposit_status' in transition(booking({ deposit_status: 'paid' }), 'reschedule', { date: '2026-10-20', time: '09:00', duration: 60 }, { now: NOW, settings: { hours: {}, windows: [], mode: 'windows', blackouts: new Set() } }), false);
    assert.deepEqual(depositFieldsFor({ booking: booking({ deposit_status: 'due' }), action: 'cancel', by: 'owner' }), { deposit_status: 'none', deposit_due_by: null });
    assert.deepEqual(depositFieldsFor({ booking: booking({ deposit_status: 'paid' }), action: 'cancel', by: 'owner' }), {}); // the refund comes after the write
    assert.deepEqual(depositFieldsFor({ booking: booking({ deposit_status: 'paid' }), action: 'cancel', by: 'customer' }), { deposit_status: 'kept' });
    assert.deepEqual(depositFieldsFor({ booking: booking({ deposit_status: 'paid' }), action: 'no_show' }), { deposit_status: 'kept' });
    assert.deepEqual(depositFieldsFor({ booking: booking({ deposit_status: 'paid' }), action: 'complete' }), {});
    assert.deepEqual(depositFieldsFor({ booking: booking({ deposit_status: 'due' }), action: 'decline' }), { deposit_status: 'none', deposit_due_by: null });
    const paid = transition(booking({ deposit_status: 'due' }), 'deposit_paid', {}, { now: NOW });
    assert.equal(paid.deposit_status, 'paid');
    assert.equal(paid.deposit_payment_intent, null);
    assert.throws(() => transition(booking({ deposit_status: 'none' }), 'deposit_paid', {}, { now: NOW }), /no deposit due/);
    assert.throws(() => transition(booking({ deposit_status: 'due' }), 'deposit_refund', {}, { now: NOW }), /No deposit was paid/);
    assert.throws(() => transition(booking({ status: 'requested' }), 'deposit_refund', {}, { now: NOW }), /409|Cannot/);
  } finally { delete process.env[`${PREFIX}_STRIPE_SECRET_KEY`]; }
});

test('the Pay link opens a Checkout session for a confirmed, due booking, stores its id, reuses an open one, and says so when it is paid / off', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  const be = fakeBackend({ rows: [booking({ deposit_status: 'due', deposit_amount: 5000, deposit_currency: 'usd', deposit_due_by: '2026-10-15T18:00:00.000Z' })], sessionPaid: false });
  try {
    const token = manageToken(base.id);
    const res = await handler(req(`/booking/pay?t=${token}`));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), 'https://checkout.stripe.com/c/pay/cs_test_1');
    const call = be.calls.stripe[0];
    assert.equal(call.path, '/checkout/sessions');
    assert.equal(call.body.mode, 'payment');
    assert.equal(call.body['line_items[0][price_data][unit_amount]'], '5000');
    assert.equal(call.body['line_items[0][price_data][currency]'], 'usd');
    assert.equal(call.body['metadata[booking_id]'], base.id);
    assert.equal(call.body.customer_email, 'ana@example.com');
    assert.match(call.body.success_url, /^https:\/\/site\.test\/booking\/manage\?t=.*&paid=1&cs=\{CHECKOUT_SESSION_ID\}$/);
    assert.equal(call.body.cancel_url, `https://site.test/booking/manage?t=${token}`);
    assert.ok(Number(call.body.expires_at) <= Math.floor(Date.now() / 1000) + 24 * 3600 + 5, 'expires with the hold');
    assert.ok(call.headers['Idempotency-Key']);
    assert.equal(be.rows[0].deposit_session_id, 'cs_test_1');
    // a second click while the session is open: the same page, no second session
    const open = await handler(req(`/booking/pay?t=${token}`));
    assert.equal(open.status, 303);
    assert.equal(be.calls.stripe.filter((c) => c.path === '/checkout/sessions' && c.method === 'POST').length, 1);
    // paid elsewhere meanwhile: no page, back to the manage page with the facts
    be.rows[0].deposit_status = 'paid';
    const done = await handler(req(`/booking/pay?t=${token}`));
    assert.equal(done.status, 200);
    assert.match(await done.text(), /\$50 paid/);
    // not confirmed yet: nothing to pay
    be.rows[0].status = 'requested'; be.rows[0].deposit_status = 'none';
    assert.equal((await handler(req(`/booking/pay?t=${token}`))).status, 200);
    // a bad token
    assert.equal((await handler(req('/booking/pay?t=nope-nope-nope-nope-nope-nope'))).status, 404);
    // Stripe down: the manage page keeps the Pay button and says to try again
    be.rows[0].status = 'confirmed'; be.rows[0].deposit_status = 'due'; be.rows[0].deposit_session_id = null;
    const downBe = fakeBackend({ rows: be.rows, stripe: () => ({ status: 500, body: { error: { message: 'boom' } } }) });
    try {
      const down = await handler(req(`/booking/pay?t=${token}`));
      assert.equal(down.status, 503);
      assert.match(await down.text(), /could not be opened just now/);
    } finally { downBe.restore(); }
  } finally { be.restore(); }
});

test('the webhook: bad signature → 400 and nothing read; checkout.session.completed marks paid once, mails the customer and the owner, and a replay changes nothing', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  const be = fakeBackend({ rows: [booking({ deposit_status: 'due', deposit_amount: 5000, deposit_currency: 'usd', deposit_session_id: 'cs_test_1' })] });
  try {
    const event = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_9', metadata: { booking_id: base.id }, client_reference_id: base.id } } });
    const bad = await handler(req('/api/booking/stripe', { method: 'POST', raw: event, headers: { 'stripe-signature': 't=1,v1=00' } }));
    assert.equal(bad.status, 400);
    assert.equal(be.calls.sb.length, 0);
    const sig = signWebhook(event, 'whsec_test');
    assert.equal(verifyWebhookSignature(event, sig, 'whsec_test'), true);
    assert.equal(verifyWebhookSignature(event, sig, 'whsec_other'), false);
    assert.equal(verifyWebhookSignature(event, signWebhook(event, 'whsec_test', Math.floor(Date.now() / 1000) - 600), 'whsec_test'), false, 'a stale signature is a replay');
    const ok = await handler(req('/api/booking/stripe', { method: 'POST', raw: event, headers: { 'stripe-signature': sig } }));
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, received: true, handled: true, reason: null });
    assert.equal(be.rows[0].deposit_status, 'paid');
    assert.equal(be.rows[0].deposit_payment_intent, 'pi_9');
    assert.ok(be.rows[0].deposit_paid_at);
    assert.deepEqual(be.calls.mail.map((m) => m.to), [['owner@example.com'], ['ana@example.com']]);
    assert.match(be.calls.mail[0].subject, /^Deposit paid: Ana · Brake Service \(\$50\)/);
    assert.equal(be.calls.mail[1].subject, 'Deposit received: $50');
    assert.match(be.calls.mail[1].html, /It comes off your bill when the job is done/);
    // the same event again (Stripe retries): nothing written, nobody mailed twice
    const again = await handler(req('/api/booking/stripe', { method: 'POST', raw: event, headers: { 'stripe-signature': signWebhook(event, 'whsec_test') } }));
    assert.equal(again.status, 200);
    assert.equal(be.calls.mail.length, 2);
    // an event we do not care about is acknowledged
    const other = JSON.stringify({ type: 'payment_intent.created', data: { object: {} } });
    assert.deepEqual(await (await handler(req('/api/booking/stripe', { method: 'POST', raw: other, headers: { 'stripe-signature': signWebhook(other, 'whsec_test') } }))).json(), { ok: true, received: true, handled: false, reason: 'ignored' });
  } finally { be.restore(); }
});

test('back from Stripe: the manage page checks the session itself and shows "Deposit received"; the webhook arriving later is a no-op', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  const be = fakeBackend({ rows: [booking({ deposit_status: 'due', deposit_amount: 5000, deposit_currency: 'usd', deposit_session_id: 'cs_test_1', deposit_due_by: '2026-10-15T18:00:00.000Z' })] });
  try {
    const token = manageToken(base.id);
    const page = await handler(req(`/booking/manage?t=${token}&paid=1&cs=cs_test_1`));
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Deposit received: \$50\. Your visit is locked in\./);
    assert.match(html, /<dt>Deposit<\/dt><dd>\$50 paid<\/dd>/);
    assert.equal(be.rows[0].deposit_status, 'paid');
    assert.equal(be.calls.mail.length, 2);
    // the Pay block is gone and a cancel now warns the deposit is kept
    assert.equal(html.includes('Pay the $50 deposit'), false);
    assert.match(html, /Cancelling keeps the \$50 deposit/);
    const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_status: 'paid', payment_intent: 'pi_1', metadata: { booking_id: base.id } } } });
    await handler(req('/api/booking/stripe', { method: 'POST', raw: event, headers: { 'stripe-signature': signWebhook(event, 'whsec_test') } }));
    assert.equal(be.calls.mail.length, 2, 'no second pair of mails');
    // a session id that is not this booking's is ignored
    be.rows[0].deposit_status = 'due';
    await handler(req(`/booking/manage?t=${token}&paid=1&cs=cs_someone_else`));
    assert.equal(be.rows[0].deposit_status, 'due');
  } finally { be.restore(); }
});

test('the manage page while the deposit is due: the Pay button, the hold, the terms; and the customer cancel keeps a paid deposit and says so', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  const be = fakeBackend({ rows: [booking({ deposit_status: 'due', deposit_amount: 5000, deposit_currency: 'usd', deposit_due_by: '2026-10-15T18:00:00.000Z' })] });
  try {
    const token = manageToken(base.id);
    const html = await (await handler(req(`/booking/manage?t=${token}`))).text();
    assert.match(html, /Lock it in: pay the \$50 deposit by Thursday, October 15 at 1:00 PM\./);
    assert.match(html, new RegExp(`<a class="btn" href="https://site\\.test/booking/pay\\?t=${token}">Pay the \\$50 deposit</a>`));
    assert.match(html, /The \$50 comes off your bill\. It is refunded in full if we have to cancel; if you cancel or miss the visit, it is kept\./);
    // paid, then the customer cancels: kept, and the mail says so
    be.rows[0].deposit_status = 'paid'; be.rows[0].deposit_payment_intent = 'pi_1';
    const res = await handler(req(`/api/booking/manage?t=${token}`, { method: 'POST', body: { action: 'cancel' } }));
    assert.equal(res.status, 200);
    assert.equal(be.rows[0].status, 'cancelled');
    assert.equal(be.rows[0].deposit_status, 'kept');
    assert.equal(be.calls.stripe.filter((c) => c.path === '/refunds').length, 0, 'no refund on a customer cancel');
    const toCustomer = be.calls.mail.find((m) => m.to[0] === 'ana@example.com');
    assert.match(toCustomer.html, /As noted when you paid, the \$50 deposit is not refunded when you cancel\./);
  } finally { be.restore(); }
});

test('the owner: confirm mails the Pay link and the hold; cancel refunds a paid deposit through Stripe and the mail says so; a refused refund still cancels and tells the owner', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  const be = fakeBackend({ rows: [booking({ status: 'requested' })] });
  try {
    const r = await applyAction({ booking: be.rows[0], action: 'confirm', origin: 'https://site.test' });
    assert.equal(r.booking.status, 'confirmed');
    assert.equal(r.booking.deposit_status, 'due');
    assert.match(r.message, /^Confirmed\. Ana has been emailed\. The \$50 deposit is due within 24 hours\.$/);
    const mail = be.calls.mail[0];
    assert.equal(mail.to[0], 'ana@example.com');
    assert.match(mail.html, /Lock it in/);
    assert.match(mail.html, new RegExp(`href="https://site\\.test/booking/pay\\?t=${manageToken(base.id)}"[^>]*>Pay the \\$50 deposit</a>`));
    assert.match(mail.html, /It is held for you until [A-Z][a-z]+day, [A-Z][a-z]+ \d+ at \d+:\d\d [AP]M\./);
    assert.match(mail.text, /Pay the \$50 deposit: https:\/\/site\.test\/booking\/pay\?t=/);
    assert.ok(mail.attachments && mail.attachments.length, 'the .ics still rides along');
    // now paid; the owner cancels → refund
    Object.assign(be.rows[0], { deposit_status: 'paid', deposit_payment_intent: 'pi_1' });
    const c = await applyAction({ booking: be.rows[0], action: 'cancel', opts: { reason: 'Truck is in the shop' }, origin: 'https://site.test' });
    assert.equal(c.booking.status, 'cancelled');
    assert.equal(c.booking.deposit_status, 'refunded');
    assert.equal(c.booking.deposit_refund_id, 're_1');
    const refund = be.calls.stripe.find((x) => x.path === '/refunds');
    assert.equal(refund.body.payment_intent, 'pi_1');
    assert.equal(refund.headers['Idempotency-Key'], `refund-${base.id}`);
    assert.match(c.message, /^Cancelled\. Ana has been emailed\. The \$50 deposit is being refunded\.$/);
    const cancelMail = be.calls.mail.find((m) => m.subject === 'Your booking was cancelled');
    assert.match(cancelMail.html, /Reason: Truck is in the shop/);
    assert.match(cancelMail.html, /Your \$50 deposit is being refunded to your card; it usually shows within 5 to 10 business days\./);
  } finally { be.restore(); }
  // Stripe refuses the refund: the cancel stands, the owner is told to refund by hand, the customer is told it will be refunded
  const be2 = fakeBackend({ rows: [booking({ deposit_status: 'paid', deposit_payment_intent: 'pi_1' })], stripe: (path) => (path === '/refunds' ? { status: 402, body: { error: { message: 'charge_already_refunded' } } } : null) });
  try {
    const c = await applyAction({ booking: be2.rows[0], action: 'cancel', origin: 'https://site.test' });
    assert.equal(c.booking.status, 'cancelled');
    assert.equal(c.booking.deposit_status, 'paid');
    assert.match(c.message, /was NOT refunded \(Stripe refused\): refund it from your Stripe dashboard\./);
    assert.match(be2.calls.mail.find((m) => m.to[0] === 'ana@example.com').html, /Your \$50 deposit will be refunded\./);
  } finally { be2.restore(); }
});

test('deposit_refund by hand goes to Stripe first and mails the customer; deposit_paid by hand needs no Stripe; a deposit not paid through the site cannot be refunded from here', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  const be = fakeBackend({ rows: [booking({ deposit_status: 'paid', deposit_payment_intent: 'pi_1' })] });
  try {
    const r = await applyAction({ booking: be.rows[0], action: 'deposit_refund', origin: 'https://site.test' });
    assert.equal(r.booking.deposit_status, 'refunded');
    assert.equal(r.booking.status, 'confirmed', 'the booking itself stands');
    assert.match(r.message, /^Deposit refunded\. Ana has been emailed\.$/);
    assert.equal(be.calls.mail[0].subject, 'Your $50 deposit was refunded');
    // cash: no Stripe call
    be.rows[0].deposit_status = 'due'; be.rows[0].deposit_payment_intent = null;
    const p = await applyAction({ booking: be.rows[0], action: 'deposit_paid', origin: 'https://site.test' });
    assert.equal(p.booking.deposit_status, 'paid');
    assert.equal(p.message, 'Deposit marked as paid.');
    assert.equal(be.calls.stripe.length, 1);
    await assert.rejects(applyAction({ booking: be.rows[0], action: 'deposit_refund', origin: 'https://site.test' }), /not paid through the site/);
  } finally { be.restore(); }
});

test('the hold: once it is over and the deposit is still due, the owner is nudged once; the time stays on the books', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  const be = fakeBackend({ rows: [booking({ deposit_status: 'due', deposit_amount: 5000, deposit_currency: 'usd', deposit_due_by: '2026-10-15T18:00:00.000Z' })] });
  try {
    const early = await nudgeOverdueDeposits({ now: new Date('2026-10-15T17:00:00Z'), origin: 'https://site.test' });
    assert.deepEqual(early, { sent: 0, due: 0 });
    const late = await nudgeOverdueDeposits({ now: new Date('2026-10-15T19:00:00Z'), origin: 'https://site.test' });
    assert.deepEqual(late, { sent: 1, due: 1 });
    assert.equal(be.calls.mail[0].to[0], 'owner@example.com');
    assert.equal(be.calls.mail[0].subject, 'Unpaid deposit: Ana · Brake Service');
    assert.match(be.calls.mail[0].html, /the 24-hour hold is over\. The time is still on your books/);
    assert.equal(be.rows[0].status, 'confirmed');
    assert.ok(be.rows[0].deposit_nudge_sent_at);
    assert.deepEqual(await nudgeOverdueDeposits({ now: new Date('2026-10-15T20:00:00Z'), origin: 'https://site.test' }), { sent: 0, due: 0 });
  } finally { be.restore(); }
});

test('emails: the deposit row and block only when there is a deposit; Spanish throughout', { skip: !BOOKING && 'no calendar on this site' }, () => {
  const none = customerConfirmedEmail({ booking: booking(), manageUrl: 'https://x/m' });
  assert.equal(none.html.includes('Deposit'), false);
  const es = customerConfirmedEmail({ booking: booking({ lang: 'es', deposit_status: 'due', deposit_amount: 5000, deposit_currency: 'usd', deposit_due_by: '2026-10-15T18:00:00.000Z' }), manageUrl: 'https://x/m', payUrl: 'https://x/pay' });
  assert.match(es.html, /Asegura tu hora/);
  assert.match(es.html, /Paga el depósito de \$50 para apartar esta hora\. Te la guardamos hasta jueves, 15 de octubre a las 1:00 p\.m\./);
  assert.match(es.html, /<dd[^>]*>\$50 pendiente<\/dd>|\$50 pendiente/);
  const kept = customerCancelledEmail({ booking: booking({ lang: 'es', deposit_status: 'kept', deposit_amount: 5000, deposit_currency: 'usd' }), bookUrl: 'https://x/#book' });
  assert.match(kept.html, /el depósito de \$50 no se reembolsa cuando tú cancelas/);
  assert.equal(outcomeText('confirm', booking({ deposit_status: 'due', deposit_amount: 5000, deposit_currency: 'usd' }), { emailed: true }), 'Confirmed. Ana has been emailed. The $50 deposit is due.');
  assert.equal(outcomeText('cancel', booking({ deposit_amount: 5000, deposit_currency: 'usd' }), { emailed: true, deposit: { needed: false } }), 'Cancelled. Ana has been emailed.');
});

test('the migration: idempotent deposit columns, in the table block and on their own', { skip: !BOOKING && 'no calendar on this site' }, () => {
  const sql = depositColumnsSql();
  for (const col of ['deposit_status', 'deposit_amount', 'deposit_currency', 'deposit_due_by', 'deposit_session_id', 'deposit_payment_intent', 'deposit_paid_at', 'deposit_refund_id', 'deposit_refunded_at', 'deposit_nudge_sent_at']) assert.match(sql, new RegExp(`add column if not exists ${col} `), col);
  assert.match(sql, /check \(deposit_status in \('none', 'due', 'paid', 'refunded', 'kept'\)\)/);
  assert.match(depositMigrationSql(), /^-- PrecisionFix: booking deposit columns/);
  assert.ok(depositMigrationSql().includes(sql));
});

test('the manage page JSON and the owner list carry the deposit', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  const be = fakeBackend({ rows: [booking({ deposit_status: 'due', deposit_amount: 5000, deposit_currency: 'usd', deposit_due_by: '2026-10-15T18:00:00.000Z' })] });
  try {
    const data = await (await handler(req(`/api/booking/manage?t=${manageToken(base.id)}`, { headers: { accept: 'application/json' } }))).json();
    assert.equal(data.booking.deposit, 'due');
    assert.equal(data.booking.deposit_amount, 5000);
    assert.equal(data.booking.deposit_due_by, '2026-10-15T18:00:00.000Z');
    assert.equal(renderManagePage({ booking: booking({ deposit_status: 'refunded', deposit_amount: 5000, deposit_currency: 'usd', status: 'cancelled' }), token: 't' }).includes('$50 refunded'), true);
  } finally { be.restore(); }
});
