// Invoices: the money math, the editor's routes, sending, paying the whole
// balance through Stripe (page, webhook, success page), by hand, void,
// refund, the reminders, the customer page and the migration. Stripe,
// Supabase and Resend are all fetch, so one fake backend scripts all three.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INVOICES, config, normalizeInvoices } from '../netlify/functions/lib/config.mjs';
import { MANUAL_METHODS, creditFor, dayOf, daysPastDue, paidAtFrom, displayStatus, draftFromBooking, dueDateFrom, normalizeItem, payHash, payToken, totalsOf } from '../netlify/functions/lib/invoice-core.mjs';
import { dueStage, runInvoiceReminders } from '../netlify/functions/lib/invoices.mjs';
import { renderInvoicePage } from '../netlify/functions/lib/invoice-page.mjs';
import { invoiceSentEmail } from '../netlify/functions/lib/invoice-email.mjs';
import { invoicesCsv } from '../netlify/functions/lib/invoice-csv.mjs';
import { handleStripeEvent } from '../netlify/functions/lib/booking-deposit.mjs';
import { remindDueDeposits } from '../netlify/functions/lib/booking-deposit.mjs';
import { signSession } from '../netlify/functions/lib/session.mjs';
import { invoicesMigrationSql, migrationSql } from '../scripts/gen-migration.mjs';
import invoiceHandler from '../netlify/functions/invoice.mjs';
import adminHandler from '../netlify/functions/admin.mjs';
import { manageToken } from '../netlify/functions/lib/booking-token.mjs';
import { hashToken } from '../netlify/functions/lib/session.mjs';

const PREFIX = config.envPrefix;
process.env[`${PREFIX}_SESSION_SECRET`] = 'invoice-test-secret';
const T = config.tables;
const EDITOR = { id: 'eeeeeeee-0000-4000-8000-000000000001', email: 'owner@example.com', role: 'owner', created_at: '2026-01-01T00:00:00Z', last_login_at: null, password_set_at: null, sessions_after: null };
const BOOKING_ID = '11111111-2222-4333-8444-555555555555';
const booking = (over = {}) => ({
  id: BOOKING_ID, status: 'completed', service_key: 'visit', service_label: 'Mobile visit', starts_at: '2026-10-20T13:00:00Z', ends_at: '2026-10-20T16:00:00Z', tz: 'America/Chicago', window: 'Morning',
  name: 'Ana', phone: '(512) 555-0100', email: 'ana@example.com', lang: 'en', address: '1 Main St', city: 'Austin', car_model: '2019 C300', vin: '',
  deposit_status: 'paid', deposit_amount: 5000, deposit_currency: 'usd', manage_token_hash: hashToken(manageToken(BOOKING_ID)), ...over,
});

function fakeBackend({ bookings = [booking()], invoices = [], stripe = null, sessionPaid = true, withEditor = true } = {}) {
  const calls = { sb: [], mail: [], stripe: [] };
  const realFetch = globalThis.fetch;
  let n = 1000;
  const api = { calls, invoices, bookings, restore() { globalThis.fetch = realFetch; for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'EMAIL_FROM', `${PREFIX}_STRIPE_SECRET_KEY`, `${PREFIX}_STRIPE_WEBHOOK_SECRET`, `${PREFIX}_BOOKING_NOTIFY`]) delete process.env[k]; } };
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://api.resend.com/')) { calls.mail.push(JSON.parse(init.body)); return ok({ id: 'em' }); }
    if (u.startsWith('https://api.stripe.com/v1')) {
      const path = u.slice('https://api.stripe.com/v1'.length);
      const body = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null;
      calls.stripe.push({ method: init.method, path, body, headers: init.headers });
      const scripted = stripe ? await stripe(path, body, init) : null;
      if (scripted) return { ok: scripted.status < 300, status: scripted.status, json: async () => scripted.body };
      if (path === '/checkout/sessions' && init.method === 'POST') return ok({ id: 'cs_inv_1', url: 'https://checkout.stripe.com/c/pay/cs_inv_1', status: 'open', payment_status: 'unpaid', amount_total: Number(body['line_items[0][price_data][unit_amount]']) });
      if (/\/checkout\/sessions\/[^/]+\/expire$/.test(path)) return ok({ id: path.split('/')[3], status: 'expired' });
      if (path.startsWith('/checkout/sessions/')) {
        const id = path.split('/').pop();
        const inv = invoices[0];
        return ok(sessionPaid ? { id, status: 'complete', payment_status: 'paid', payment_intent: 'pi_inv_1', amount_total: inv ? inv.balance : 0, metadata: { invoice_id: inv && inv.id } } : { id, status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/c/pay/' + id, amount_total: inv ? inv.balance : 0, metadata: { invoice_id: inv && inv.id } });
      }
      if (path === '/refunds') return ok({ id: 're_inv_1', status: 'succeeded' });
      return { ok: false, status: 404, json: async () => ({ error: { message: 'no such route' } }) };
    }
    const path = decodeURIComponent(u.replace(/^https:\/\/db\.test\/rest\/v1/, ''));
    const method = init.method || 'GET';
    calls.sb.push({ method, path, body: init.body ? JSON.parse(init.body) : undefined });
    if (path.startsWith(`/${T.editors}`)) return ok(withEditor ? [EDITOR] : []);
    if (path.startsWith(`/${T.content}`) || path.startsWith(`/${T.media}`) || path.startsWith(`/${T.secrets}`)) return ok([]);
    const eq = (key) => { const m = new RegExp(`[?&]${key}=eq\\.([^&]+)`).exec(path); return m ? m[1] : null; };
    if (path.startsWith(`/${T.bookings}`)) {
      const id = eq('id');
      if (method === 'PATCH') { const row = bookings.find((r) => r.id === id); if (row) Object.assign(row, JSON.parse(init.body)); return ok(row ? [row] : []); }
      if (id) return ok(bookings.filter((r) => r.id === id));
      if (eq('deposit_session_id')) return ok(bookings.filter((r) => r.deposit_session_id === eq('deposit_session_id')));
      if (/deposit_status=eq\.due&deposit_due_by=gt\./.test(path)) {
        const gt = /deposit_due_by=gt\.([^&]+)/.exec(path)[1], lte = /deposit_due_by=lte\.([^&]+)/.exec(path)[1];
        return ok(bookings.filter((r) => r.status === 'confirmed' && r.deposit_status === 'due' && r.deposit_due_by > gt && r.deposit_due_by <= lte && !r.deposit_reminder_sent_at));
      }
      return ok(bookings);
    }
    if (path.startsWith(`/${T.invoices}`)) {
      if (method === 'POST') { const row = { number: `PF-${++n}`, view_count: 0, reminders_sent: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...JSON.parse(init.body) }; invoices.push(row); return ok([row]); }
      const id = eq('id'), st = eq('status'), h = eq('pay_token_hash'), sess = eq('stripe_session_id');
      const match = (r) => (!id || r.id === id) && (!st || r.status === st) && (!h || r.pay_token_hash === h) && (!sess || r.stripe_session_id === sess);
      if (method === 'PATCH') { const row = invoices.find(match); if (row) Object.assign(row, JSON.parse(init.body)); return ok(row ? [row] : []); }
      if (method === 'DELETE') { const i = invoices.findIndex(match); const gone = i >= 0 ? invoices.splice(i, 1) : []; return ok(gone); }
      if (/status=eq\.open&due_date=lte\./.test(path)) { const lte = /due_date=lte\.([^&]+)/.exec(path)[1]; return ok(invoices.filter((r) => r.status === 'open' && r.due_date <= lte)); }
      const inList = /status=in\.\(([^)]+)\)/.exec(path);
      if (inList) return ok(invoices.filter((r) => inList[1].split(',').includes(r.status)));
      if (/booking_id=in\./.test(path)) return ok(invoices.filter((r) => r.status !== 'void'));
      return ok(invoices.filter(match));
    }
    throw new Error('unexpected fetch ' + u);
  };
  process.env.SUPABASE_URL = 'https://db.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  process.env.RESEND_API_KEY = 'r';
  process.env.EMAIL_FROM = 'Site <hi@example.com>';
  process.env[`${PREFIX}_STRIPE_SECRET_KEY`] = 'sk_test_x';
  process.env[`${PREFIX}_STRIPE_WEBHOOK_SECRET`] = 'whsec_test';
  process.env[`${PREFIX}_BOOKING_NOTIFY`] = 'owner@example.com';
  return api;
}
const cookie = () => `${config.cookie}=${signSession(EDITOR.id)}`;
const adminReq = (path, { method = 'GET', body } = {}) => new Request(`https://site.test${path}`, { method, headers: { origin: 'https://site.test', cookie: cookie(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
const pageReq = (path, headers = {}) => new Request(`https://site.test${path}`, { headers: { accept: 'text/html', ...headers } });

test('config: invoices on PrecisionFix (PF-, due on receipt, reminded 3/7/14, no tax yet); the normalizer refuses nonsense', () => {
  assert.deepEqual(INVOICES, { prefix: 'PF', dueDays: 0, reminders: [3, 7, 14], taxRate: 0, taxLabel: 'Sales tax', start: 1001 });
  assert.equal(config.tables.invoices, 'precisionfix_invoices');
  assert.equal(normalizeInvoices(null, {}), null);
  assert.throws(() => normalizeInvoices({}, null), /needs payments/);
  assert.throws(() => normalizeInvoices({ taxRate: 8.25 }, {}), /basis points/);
  assert.throws(() => normalizeInvoices({ prefix: 'pf-1' }, {}), /prefix/);
  assert.deepEqual(normalizeInvoices({ reminders: [7, 3, 7] }, {}).reminders, [3, 7]);
});

test('money: lines, tax on taxable lines only, a discount, the deposit credit never below zero', () => {
  const items = [
    normalizeItem({ kind: 'labor', label: 'Labor', qty: 1.5, unit: 15000 }),
    normalizeItem({ kind: 'part', label: 'Brake pads', qty: 2, price: '42.50' }),
    normalizeItem({ kind: 'fee', label: 'Gas surcharge', unit: 2000 }),
    normalizeItem({ kind: 'discount', label: 'Regular', unit: 1000 }),
  ];
  assert.equal(items[1].unit, 4250);
  assert.equal(items[1].taxable, true, 'parts are taxable by default');
  assert.equal(items[0].taxable, false);
  // 225.00 + 85.00 + 20.00 - 10.00 = 320.00; tax 8.25% of 85.00 = 7.01 (7.0125)
  assert.deepEqual(totalsOf(items, { taxRate: 825, credit: 5000 }), { subtotal: 32000, tax: 701, credit: 5000, total: 32701, balance: 27701 });
  assert.deepEqual(totalsOf(items, { taxRate: 0, credit: 0 }), { subtotal: 32000, tax: 0, credit: 0, total: 32000, balance: 32000 });
  assert.deepEqual(totalsOf([normalizeItem({ kind: 'fee', label: 'Look', unit: 3000 })], { credit: 5000 }), { subtotal: 3000, tax: 0, credit: 3000, total: 3000, balance: 0 });
  assert.throws(() => normalizeItem({ kind: 'part', label: '', unit: 100 }), /say what it is/);
  assert.throws(() => normalizeItem({ kind: 'part', label: 'x', qty: 0, unit: 100 }), /quantity/);
  assert.throws(() => normalizeItem({ kind: 'part', label: 'x', unit: -5 }), /price/);
});

test('credit + prefill: a paid, credited deposit comes off; a refunded one does not; labor + gas from the posted prices', () => {
  assert.equal(creditFor(booking()), 5000);
  assert.equal(creditFor(booking({ deposit_status: 'refunded' })), 0);
  assert.equal(creditFor(booking({ deposit_status: 'due' })), 0);
  const d = draftFromBooking(booking());
  assert.deepEqual(d.items, [{ kind: 'labor', label: 'Labor', qty: 1, unit: 15000, taxable: false }, { kind: 'fee', label: 'Gas surcharge', qty: 1, unit: 2000, taxable: false }]);
  assert.equal(d.credit, 5000);
  assert.equal(d.notes, '2019 C300');
  assert.equal(d.address, '1 Main St, Austin');
  assert.deepEqual(draftFromBooking(booking({ lang: 'es' })).items.map((i) => i.label), ['Mano de obra', 'Recargo de gasolina'], 'a Spanish customer gets Spanish lines');
  // an exact-time booking of 2 hours bills 2 hours
  assert.equal(draftFromBooking(booking({ window: '', starts_at: '2026-10-20T13:00:00Z', ends_at: '2026-10-20T15:00:00Z' })).items[0].qty, 2);
});

test('dates: due on receipt in the site zone; days past due; overdue is worked out, not stored', () => {
  assert.equal(dueDateFrom(new Date('2026-10-25T04:00:00Z'), 0, 'America/Chicago'), '2026-10-24');
  assert.equal(daysPastDue('2026-10-20', '2026-10-27'), 7);
  assert.equal(dayOf('2026-10-26T02:00:00Z'), '2026-10-25', 'sent at 9 PM in Austin is still the 25th');
  assert.equal(displayStatus({ status: 'open', due_date: '2026-10-20' }, '2026-10-21'), 'overdue');
  assert.equal(displayStatus({ status: 'open', due_date: '2026-10-20' }, '2026-10-20'), 'open');
  assert.equal(displayStatus({ status: 'paid', due_date: '2026-10-01' }, '2026-10-21'), 'paid');
});

test('reminder stages: one per run, the latest due; a missed day never sends two; the last one tells the owner', () => {
  const inv = { due_date: '2026-10-01', reminders_sent: {} };
  assert.equal(dueStage(inv, '2026-10-03'), null);
  assert.deepEqual(dueStage(inv, '2026-10-04'), { stage: 3, days: 3, mark: [3], last: false });
  assert.deepEqual(dueStage(inv, '2026-10-09'), { stage: 7, days: 8, mark: [3, 7], last: false });
  assert.deepEqual(dueStage({ ...inv, reminders_sent: { 3: 'x' } }, '2026-10-09'), { stage: 7, days: 8, mark: [7], last: false });
  assert.equal(dueStage({ ...inv, reminders_sent: { 3: 'x', 7: 'x' } }, '2026-10-12'), null);
  assert.equal(dueStage({ ...inv, reminders_sent: { 3: 'x', 7: 'x' } }, '2026-10-15').last, true);
  assert.equal(dueStage({ ...inv, reminders_sent: { 3: 'x', 7: 'x', 14: 'x' } }, '2026-11-30'), null);
});

test('admin: prefill from a booking → send → the customer is mailed the lines, the deposit off, the balance and a Pay link', async () => {
  const be = fakeBackend();
  try {
    const pre = await (await adminHandler(adminReq(`/api/admin/invoices/draft?booking=${BOOKING_ID}`))).json();
    assert.equal(pre.ok, true);
    assert.equal(pre.draft.credit, 5000);
    const items = [...pre.draft.items, { kind: 'part', label: 'Brake pads', qty: 1, unit: 8000 }];
    // the client's own totals are ignored: the server works them out
    const res = await adminHandler(adminReq('/api/admin/invoices', { method: 'POST', body: { ...pre.draft, items, balance: 1, total: 1, send: true } }));
    const out = await res.json();
    assert.equal(res.status, 200, JSON.stringify(out));
    const inv = be.invoices[0];
    assert.equal(inv.status, 'open');
    assert.equal(inv.booking_id, BOOKING_ID);
    assert.deepEqual([inv.subtotal, inv.credit, inv.total, inv.balance], [25000, 5000, 25000, 20000]);
    assert.equal(inv.pay_token_hash, payHash(inv.id));
    assert.match(inv.due_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(out.message, /sent for \$200\.00\. Ana has it by email/);
    assert.equal(out.invoice.url, `https://site.test/invoice?t=${payToken(inv.id)}`);
    const mail = be.calls.mail.find((m) => /^Invoice PF-/.test(m.subject));
    assert.ok(mail, 'the customer got the invoice');
    assert.deepEqual(mail.to, ['ana@example.com']);
    assert.match(mail.html, /Brake pads/);
    assert.match(mail.html, /Deposit paid/);
    assert.match(mail.html, /Pay \$200\.00/);
    assert.match(mail.text, /Balance due: \$200\.00/);
  } finally {
    be.restore();
  }
});

test('admin: a draft saves, edits, refuses a bad line, and deletes; a sent one cannot be deleted', async () => {
  const be = fakeBackend();
  try {
    const r1 = await (await adminHandler(adminReq('/api/admin/invoices', { method: 'POST', body: { name: 'Bo', items: [{ kind: 'labor', label: 'Labor', qty: 2, unit: 15000 }] } }))).json();
    assert.equal(r1.invoice.status, 'draft');
    assert.equal(r1.invoice.balance, 30000);
    assert.equal(r1.invoice.url, '', 'a draft has no customer link yet');
    const bad = await adminHandler(adminReq(`/api/admin/invoices/${r1.invoice.id}`, { method: 'PATCH', body: { action: 'save', items: [{ kind: 'part', label: '', unit: 1 }] } }));
    assert.equal(bad.status, 400);
    const r2 = await (await adminHandler(adminReq(`/api/admin/invoices/${r1.invoice.id}`, { method: 'PATCH', body: { action: 'save', items: [{ kind: 'labor', label: 'Labor', qty: 1, unit: 15000 }] } }))).json();
    assert.equal(r2.invoice.balance, 15000);
    const del = await adminHandler(adminReq(`/api/admin/invoices/${r1.invoice.id}`, { method: 'DELETE' }));
    assert.equal(del.status, 200);
    assert.equal(be.invoices.length, 0);
    const r3 = await (await adminHandler(adminReq('/api/admin/invoices', { method: 'POST', body: { name: 'Bo', email: 'bo@example.com', items: [{ kind: 'fee', label: 'Diagnosis', unit: 9000 }], send: true } }))).json();
    assert.equal((await adminHandler(adminReq(`/api/admin/invoices/${r3.invoice.id}`, { method: 'DELETE' }))).status, 409);
    const empty = await adminHandler(adminReq('/api/admin/invoices', { method: 'POST', body: { name: 'Cy', send: true } }));
    assert.equal(empty.status, 400, 'nothing to bill');
  } finally {
    be.restore();
  }
});

test('nothing owed: the deposit covers it → sent and marked paid at once (no Pay button)', async () => {
  const be = fakeBackend();
  try {
    const out = await (await adminHandler(adminReq('/api/admin/invoices', { method: 'POST', body: { name: 'Ana', email: 'ana@example.com', booking_id: BOOKING_ID, items: [{ kind: 'fee', label: 'Quick look', unit: 4000 }], send: true } }))).json();
    assert.equal(out.invoice.status, 'paid');
    assert.equal(out.invoice.paid_method, 'deposit');
    assert.equal(out.invoice.balance, 0);
    assert.match(out.message, /deposit covers it/);
    const page = await (await invoiceHandler(pageReq(`/invoice?t=${payToken(out.invoice.id)}`))).text();
    assert.doesNotMatch(page, /\/invoice\/pay/);
    assert.match(page, /Your deposit covers it/);
  } finally {
    be.restore();
  }
});

async function sentInvoice(be, over = {}) {
  const out = await (await adminHandler(adminReq('/api/admin/invoices', { method: 'POST', body: { name: 'Ana', email: 'ana@example.com', phone: '(512) 555-0100', booking_id: BOOKING_ID, items: [{ kind: 'labor', label: 'Labor', qty: 2, unit: 15000 }, { kind: 'fee', label: 'Gas surcharge', unit: 2000 }], send: true, ...over } }))).json();
  be.calls.mail.length = 0;
  be.calls.stripe.length = 0;
  return be.invoices.find((x) => x.id === out.invoice.id);
}

test('customer page: the lines, the deposit off, the balance, one Pay button; views are counted, the owner\'s are not; a bad link is a 404', async () => {
  const be = fakeBackend();
  try {
    const inv = await sentInvoice(be);
    const res = await invoiceHandler(pageReq(`/invoice?t=${payToken(inv.id)}`));
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(res.headers.get('x-robots-tag'), /noindex/);
    assert.match(html, new RegExp(inv.number));
    assert.match(html, /Labor<small>2 hr × \$150\.00<\/small>/);
    assert.match(html, /Deposit paid<\/span><span>−\$50\.00/);
    assert.match(html, /href="\/invoice\/pay\?t=[^"]+">Pay \$270\.00/);
    assert.equal(inv.view_count, 1);
    await invoiceHandler(pageReq(`/invoice?t=${payToken(inv.id)}`, { cookie: cookie() }));
    assert.equal(inv.view_count, 1, 'the owner opening it does not count');
    assert.equal((await invoiceHandler(pageReq('/invoice?t=nope-nope-nope-nope-nope'))).status, 404);
    // Spanish invoice speaks Spanish
    inv.lang = 'es';
    assert.match(await (await invoiceHandler(pageReq(`/invoice?t=${payToken(inv.id)}`))).text(), /Saldo a pagar/);
  } finally {
    be.restore();
  }
});

test('pay: /invoice/pay opens Stripe Checkout for the whole balance, tagged with the invoice; a second tap reuses the open page', async () => {
  const be = fakeBackend({ sessionPaid: false });
  try {
    const inv = await sentInvoice(be);
    const res = await invoiceHandler(pageReq(`/invoice/pay?t=${payToken(inv.id)}`));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), 'https://checkout.stripe.com/c/pay/cs_inv_1');
    const create = be.calls.stripe.find((c) => c.path === '/checkout/sessions' && c.method === 'POST');
    assert.equal(create.body['line_items[0][price_data][unit_amount]'], '27000');
    assert.equal(create.body['metadata[invoice_id]'], inv.id);
    assert.equal(create.body['client_reference_id'], inv.id);
    assert.match(create.body.success_url, /\/invoice\?t=.+&paid=1&cs=\{CHECKOUT_SESSION_ID\}$/);
    assert.equal(inv.stripe_session_id, 'cs_inv_1');
    be.calls.stripe.length = 0;
    const again = await invoiceHandler(pageReq(`/invoice/pay?t=${payToken(inv.id)}`));
    assert.equal(again.headers.get('location'), 'https://checkout.stripe.com/c/pay/cs_inv_1');
    assert.equal(be.calls.stripe.filter((c) => c.path === '/checkout/sessions' && c.method === 'POST').length, 0);
  } finally {
    be.restore();
  }
});

test('pay: the webhook marks it paid once (receipt + owner mail); a replay changes nothing; the success page says received', async () => {
  const be = fakeBackend();
  try {
    const inv = await sentInvoice(be);
    inv.stripe_session_id = 'cs_inv_1';
    const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_inv_1', payment_status: 'paid', payment_intent: 'pi_inv_1', amount_total: 27000, metadata: { invoice_id: inv.id } } } };
    const r = await handleStripeEvent(event, { origin: 'https://site.test' });
    assert.equal(r.handled, true);
    assert.equal(inv.status, 'paid');
    assert.equal(inv.paid_via, 'stripe');
    assert.equal(inv.paid_amount, 27000);
    assert.equal(inv.stripe_payment_intent, 'pi_inv_1');
    assert.deepEqual(be.calls.mail.map((m) => m.subject).sort(), [`Invoice paid: ${inv.number} · Ana ($270.00)`, `Receipt: invoice ${inv.number} is paid`].sort());
    be.calls.mail.length = 0;
    const replay = await handleStripeEvent(event, { origin: 'https://site.test' });
    assert.equal(replay.changed, false);
    assert.equal(be.calls.mail.length, 0, 'nobody mailed twice');
    const page = await (await invoiceHandler(pageReq(`/invoice?t=${payToken(inv.id)}&paid=1&cs=cs_inv_1`))).text();
    assert.match(page, /status--paid/);
    assert.doesNotMatch(page, /\/invoice\/pay/);
    // the deposit's own events still reach the deposit
    const dep = await handleStripeEvent({ type: 'checkout.session.completed', data: { object: { id: 'cs_dep', payment_status: 'paid', metadata: { booking_id: 'nope' } } } });
    assert.equal(dep.reason, 'no-booking');
  } finally {
    be.restore();
  }
});

test('pay: back from Stripe before the webhook → the page asks Stripe itself and shows it paid', async () => {
  const be = fakeBackend({ sessionPaid: true });
  try {
    const inv = await sentInvoice(be);
    const html = await (await invoiceHandler(pageReq(`/invoice?t=${payToken(inv.id)}&paid=1&cs=cs_inv_9`))).text();
    assert.equal(inv.status, 'paid');
    assert.match(html, /Payment received: \$270\.00/);
  } finally {
    be.restore();
  }
});

test('pay: the deposit was refunded after sending → the balance grows back before Stripe is asked', async () => {
  const be = fakeBackend({ sessionPaid: false });
  try {
    const inv = await sentInvoice(be);
    assert.equal(inv.balance, 27000);
    be.bookings[0].deposit_status = 'refunded';
    await invoiceHandler(pageReq(`/invoice/pay?t=${payToken(inv.id)}`));
    assert.equal(inv.balance, 32000);
    const create = be.calls.stripe.find((c) => c.path === '/checkout/sessions' && c.method === 'POST');
    assert.equal(create.body['line_items[0][price_data][unit_amount]'], '32000');
  } finally {
    be.restore();
  }
});

test('by hand: paid another way (receipt optional); void closes an open Stripe page; refund goes through Stripe and mails', async () => {
  const be = fakeBackend();
  try {
    const a = await sentInvoice(be);
    const paid = await (await adminHandler(adminReq(`/api/admin/invoices/${a.id}`, { method: 'PATCH', body: { action: 'mark_paid', method: 'zelle', receipt: false } }))).json();
    assert.equal(paid.invoice.status, 'paid');
    assert.equal(paid.invoice.paid_method, 'zelle');
    assert.equal(paid.invoice.paid_via, 'manual');
    assert.equal(be.calls.mail.length, 0, 'no receipt when asked not to');
    assert.equal((await adminHandler(adminReq(`/api/admin/invoices/${a.id}`, { method: 'PATCH', body: { action: 'refund' } }))).status, 409, 'a Zelle payment is not refunded through Stripe');

    const b = await sentInvoice(be);
    b.stripe_session_id = 'cs_old';
    const v = await (await adminHandler(adminReq(`/api/admin/invoices/${b.id}`, { method: 'PATCH', body: { action: 'void', reason: 'wrong car' } }))).json();
    assert.equal(v.invoice.status, 'void');
    assert.ok(be.calls.stripe.some((c) => c.path === '/checkout/sessions/cs_old/expire'), 'the old page is closed');
    assert.match(await (await invoiceHandler(pageReq(`/invoice?t=${payToken(b.id)}`))).text(), /Nothing is owed/);

    const c = await sentInvoice(be);
    await handleStripeEvent({ type: 'checkout.session.completed', data: { object: { id: 'cs_c', payment_status: 'paid', payment_intent: 'pi_c', amount_total: c.balance, metadata: { invoice_id: c.id } } } }, { origin: 'https://site.test' });
    be.calls.mail.length = 0;
    const rf = await (await adminHandler(adminReq(`/api/admin/invoices/${c.id}`, { method: 'PATCH', body: { action: 'refund' } }))).json();
    assert.equal(rf.invoice.status, 'refunded');
    const refundCall = be.calls.stripe.find((x) => x.path === '/refunds');
    assert.equal(refundCall.body.payment_intent, 'pi_c');
    assert.equal(refundCall.headers['Idempotency-Key'], `refund-invoice-${c.id}`);
    assert.match(be.calls.mail[0].subject, /Refund for invoice/);
  } finally {
    be.restore();
  }
});

test('editing a sent invoice closes its Stripe page so nobody pays the old amount', async () => {
  const be = fakeBackend();
  try {
    const inv = await sentInvoice(be);
    inv.stripe_session_id = 'cs_old';
    const out = await (await adminHandler(adminReq(`/api/admin/invoices/${inv.id}`, { method: 'PATCH', body: { action: 'save', items: [{ kind: 'labor', label: 'Labor', qty: 1, unit: 15000 }] } }))).json();
    assert.equal(out.invoice.balance, 10000);
    assert.equal(inv.stripe_session_id, null);
    assert.ok(be.calls.stripe.some((c) => c.path === '/checkout/sessions/cs_old/expire'));
  } finally {
    be.restore();
  }
});

test('reminders: daytime only; 3 days late → the customer; the last stage tells the owner; marks are kept', async () => {
  const be = fakeBackend();
  try {
    const inv = await sentInvoice(be);
    inv.due_date = '2026-10-01';
    // 3 AM Chicago: quiet
    assert.equal((await runInvoiceReminders({ now: new Date('2026-10-04T08:00:00Z'), origin: 'https://site.test' })).quiet, true);
    // 10 AM Chicago on the 4th: the 3-day reminder
    const r = await runInvoiceReminders({ now: new Date('2026-10-04T15:00:00Z'), origin: 'https://site.test' });
    assert.deepEqual(r, { sent: 1, due: 1 });
    assert.match(be.calls.mail[0].subject, /Reminder: invoice PF-\d+ \(\$270\.00\) is still open/);
    assert.ok(inv.reminders_sent['3']);
    be.calls.mail.length = 0;
    assert.deepEqual(await runInvoiceReminders({ now: new Date('2026-10-04T16:00:00Z'), origin: 'https://site.test' }), { sent: 0, due: 0 }, 'not twice the same day');
    inv.reminders_sent = { 3: 'x', 7: 'x' };
    await runInvoiceReminders({ now: new Date('2026-10-15T15:00:00Z'), origin: 'https://site.test' });
    assert.deepEqual(be.calls.mail.map((m) => m.to[0]).sort(), ['ana@example.com', 'owner@example.com']);
  } finally {
    be.restore();
  }
});

test('deposit: halfway through the hold the customer gets ONE Pay reminder, in daytime', async () => {
  const now = new Date('2026-10-14T18:00:00Z'); // 1 PM Chicago
  const due = booking({ status: 'confirmed', deposit_status: 'due', deposit_due_by: new Date(now.getTime() + 10 * 3600e3).toISOString(), deposit_reminder_sent_at: null });
  const be = fakeBackend({ bookings: [due] });
  try {
    const r = await remindDueDeposits({ now, origin: 'https://site.test' });
    assert.deepEqual(r, { sent: 1, due: 1 });
    assert.match(be.calls.mail[0].subject, /Your time is still held: pay the \$50 deposit/);
    assert.match(be.calls.mail[0].html, /\/booking\/pay\?t=/);
    assert.ok(due.deposit_reminder_sent_at);
    assert.deepEqual(await remindDueDeposits({ now, origin: 'https://site.test' }), { sent: 0, due: 0 });
    // at night: nothing
    due.deposit_reminder_sent_at = null;
    assert.equal((await remindDueDeposits({ now: new Date('2026-10-15T05:00:00Z') })).quiet, true);
  } finally {
    be.restore();
  }
});

test('the invoice email says "nothing more to pay" when the deposit covers it, and has no Pay button', () => {
  const inv = { id: 'x', number: 'PF-1009', name: 'Ana', email: 'a@example.com', lang: 'en', items: [{ kind: 'fee', label: 'Quick look', qty: 1, unit: 4000 }], currency: 'usd', subtotal: 4000, tax: 0, credit: 4000, total: 4000, balance: 0, tax_rate: 0, notes: '' };
  const m = invoiceSentEmail({ invoice: inv, url: 'https://x/invoice?t=y' });
  assert.match(m.html, /nothing more to pay/);
  assert.doesNotMatch(m.html, /Pay \$/);
});

test('the page renders a draft or a missing invoice as not found, never its lines', () => {
  assert.match(renderInvoicePage({ invoice: null }), /not valid any more/);
  assert.match(renderInvoicePage({ invoice: { status: 'draft', items: [{ label: 'Secret' }] } }), /not valid any more/);
});

test('migration: the invoices table, its number sequence, RLS on and no grants; the deposit reminder column; in the full migration too', () => {
  const sql = invoicesMigrationSql();
  assert.match(sql, /create sequence if not exists command\.precisionfix_invoices_number_seq start 1001/);
  assert.match(sql, /number text not null unique default \('PF-' \|\| nextval/);
  assert.match(sql, /check \(status in \('draft', 'open', 'paid', 'void', 'refunded'\)\)/);
  assert.match(sql, /booking_id uuid references command\.precisionfix_bookings\(id\) on delete set null/);
  assert.match(sql, /alter table command\.precisionfix_invoices enable row level security/);
  assert.match(sql, /revoke all on command\.precisionfix_invoices from anon, authenticated/);
  assert.match(sql, /add column if not exists deposit_reminder_sent_at timestamptz/);
  assert.match(sql, /paid_reference text not null default ''/);
  assert.match(migrationSql(), /create table if not exists command\.precisionfix_invoices/);
  assert.match(migrationSql(), /deposit_reminder_sent_at/);
});

test('paid another way: the methods for the books; the day it came in may be back-dated, never ahead', () => {
  assert.deepEqual(MANUAL_METHODS, ['cash', 'cash_app', 'zelle', 'venmo', 'card_in_person', 'check', 'paypal', 'apple_cash', 'bank_transfer', 'other']);
  const now = new Date('2026-10-25T20:00:00Z'); // 3 PM in Austin
  assert.equal(paidAtFrom('', now), now);
  assert.equal(paidAtFrom('2026-10-25', now), now);
  assert.equal(dayOf(paidAtFrom('2026-10-20', now).toISOString()), '2026-10-20');
  assert.throws(() => paidAtFrom('2026-10-26', now), /not happened yet/);
  assert.throws(() => paidAtFrom('2024-01-01', now), /more than 365 days/);
  assert.throws(() => paidAtFrom('20-10-2026', now), /Pick the day/);
});

test('paid another way: Cash App with a reference and the day it came in; an unknown method is refused; the receipt names it', async () => {
  const be = fakeBackend();
  try {
    const inv = await sentInvoice(be);
    const nope = await adminHandler(adminReq(`/api/admin/invoices/${inv.id}`, { method: 'PATCH', body: { action: 'mark_paid', method: 'bitcoin' } }));
    assert.equal(nope.status, 400);
    assert.equal(inv.status, 'open');
    const ahead = await adminHandler(adminReq(`/api/admin/invoices/${inv.id}`, { method: 'PATCH', body: { action: 'mark_paid', method: 'cash', paid_on: '2999-01-01' } }));
    assert.equal(ahead.status, 400);
    const day = dayOf(new Date(Date.now() - 2 * 86400e3).toISOString());
    const out = await (await adminHandler(adminReq(`/api/admin/invoices/${inv.id}`, { method: 'PATCH', body: { action: 'mark_paid', method: 'cash_app', reference: '  $anaruiz · brakes  ', paid_on: day } }))).json();
    assert.equal(out.invoice.status, 'paid');
    assert.equal(out.invoice.paid_method, 'cash_app');
    assert.equal(out.invoice.paid_reference, '$anaruiz · brakes');
    assert.equal(dayOf(out.invoice.paid_at), day);
    assert.match(out.message, /^Marked paid: Cash App \(\$anaruiz · brakes\)\./);
    const receipt = be.calls.mail.find((m) => /^Receipt/.test(m.subject));
    assert.match(receipt.html, /Cash App/);
    assert.doesNotMatch(receipt.html, /anaruiz/, 'the reference is for the books, not the customer');
  } finally {
    be.restore();
  }
});

test('bookkeeping CSV: sent invoices only, labor/parts/fees/discounts split, how + when paid, formula-proof text', async () => {
  const rows = [
    { number: 'PF-1001', status: 'paid', name: '=HYPERLINK("x")', email: 'a@example.com', phone: '', sent_at: '2026-10-20T15:00:00Z', due_date: '2026-10-20', paid_at: '2026-10-22T18:00:00Z', paid_via: 'manual', paid_method: 'check', paid_reference: '1042', items: [{ kind: 'labor', qty: 2, unit: 15000 }, { kind: 'part', qty: 1, unit: 8450 }, { kind: 'fee', qty: 1, unit: 2000 }, { kind: 'discount', qty: 1, unit: 1000 }], subtotal: 39450, tax: 697, credit: 5000, total: 40147, paid_amount: 35147 },
    { number: 'PF-1002', status: 'open', name: 'Bo, Jr.', items: [{ kind: 'labor', qty: 1, unit: 15000 }], subtotal: 15000, tax: 0, credit: 0, total: 15000, sent_at: '2026-10-24T15:00:00Z' },
    { number: 'PF-1003', status: 'draft', name: 'Not billed', items: [] },
    { number: 'PF-1004', status: 'paid', name: 'Cy', paid_via: 'stripe', paid_method: 'card', paid_at: '2026-10-25T01:00:00Z', stripe_payment_intent: 'pi_1', items: [], subtotal: 0, tax: 0, credit: 0, total: 9000, paid_amount: 9000, sent_at: '2026-10-24T15:00:00Z' },
  ];
  const lines = invoicesCsv(rows).trim().split('\r\n');
  assert.equal(lines.length, 4, 'header + three sent invoices, no draft');
  assert.equal(lines[0], 'Invoice,Status,Customer,Email,Phone,Issued,Due,Paid on,Paid how,Reference,Labor,Parts,Fees,Discounts,Subtotal,Tax,Deposit credit,Total,Amount received,Stripe payment,Refunded on,Void reason');
  assert.equal(lines[1], `PF-1001,paid,"'=HYPERLINK(""x"")",a@example.com,,2026-10-20,2026-10-20,2026-10-22,Check,1042,300.00,84.50,20.00,-10.00,394.50,6.97,50.00,401.47,351.47,,,`);
  assert.equal(lines[2], 'PF-1002,open,"Bo, Jr.",,,2026-10-24,,,,,150.00,0.00,0.00,0.00,150.00,0.00,0.00,150.00,,,,');
  assert.match(lines[3], /^PF-1004,paid,Cy,,,2026-10-24,,2026-10-24,"Card, through your site",,/, 'paid 8 PM in Austin on the 24th');
  assert.match(lines[3], /,pi_1,,$/);
});

test('bookkeeping CSV: the admin route downloads it, signed in only', async () => {
  const be = fakeBackend();
  try {
    await sentInvoice(be);
    const res = await adminHandler(adminReq('/api/admin/invoices/export.csv'));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="pf-invoices-\d{4}-\d{2}-\d{2}\.csv"/);
    assert.match(await res.text(), /^Invoice,Status/);
    const anon = await adminHandler(new Request('https://site.test/api/admin/invoices/export.csv'));
    assert.equal(anon.status, 401);
  } finally {
    be.restore();
  }
});
