// /admin/ → Invoices (config.invoices): the routes admin.mjs delegates to.
//
//   GET    /api/admin/invoices                 the list (newest first) + what the editor needs (tax, prefill rates, Stripe on?)
//   GET    /api/admin/invoices/summary         { open, overdue, owed } for the badge and Home
//   GET    /api/admin/invoices/draft?booking=  a prefilled invoice for that booking, not saved yet
//   GET    /api/admin/invoices/export.csv      every sent invoice, for bookkeeping (lib/invoice-csv.mjs)
//   GET    /api/admin/invoices/:id             one invoice + its customer link
//   POST   /api/admin/invoices                 { booking_id?, name, email, phone, address, lang, items, tax_rate, notes, owner_note, send? } → a draft (sent at once with send: true)
//   PATCH  /api/admin/invoices/:id             { action: save | send | mark_paid | void | refund | note, … }
//   DELETE /api/admin/invoices/:id             a draft, gone

import { BOOKING, INVOICES } from './config.mjs';
import { bookingById } from './booking-db.mjs';
import { SECURITY_HEADERS, json, readJson } from './http.mjs';
import { invoicesCsv } from './invoice-csv.mjs';
import { deleteDraft, invoiceById, listInvoices, updateInvoice } from './invoice-db.mjs';
import { LINE_LABELS, MANUAL_METHODS, METHOD_LABELS, REFERENCE_MAX, displayStatus, paidAtFrom, draftFromBooking, invoiceUrl, money, todayIn } from './invoice-core.mjs';
import { createDraft, editInvoice, markPaid, onlinePayEnabled, refundInvoice, sendInvoice, voidInvoice } from './invoices.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

// What the editor shows for a row: the stored invoice, the worked-out
// status (overdue), and the customer's link.
function view(inv, origin, today = todayIn()) {
  return { ...inv, display_status: displayStatus(inv, today), url: inv.status === 'draft' ? '' : invoiceUrl(inv.id, origin) };
}

// The words the owner's toast says after a send, from what really happened.
function sentMessage(r) {
  const amt = money(r.invoice.balance, r.invoice.currency);
  const head = r.invoice.status === 'paid' ? `Invoice ${r.invoice.number} sent: the deposit covers it, so it is marked paid.` : `Invoice ${r.invoice.number} sent for ${amt}.`;
  if (r.emailed) return `${head} ${r.invoice.name} has it by email.`;
  if (r.emailReason === 'no-customer-email') return `${head} ${r.invoice.name} left no email: text them the link.`;
  return `${head} The email did not go out: text ${r.invoice.name} the link.`;
}

async function list(origin) {
  const rows = await listInvoices({ limit: 300 });
  const today = todayIn();
  const b = BOOKING && BOOKING.pricing;
  return json(200, {
    ok: true,
    invoices: rows.map((inv) => view(inv, origin, today)),
    config: {
      prefix: INVOICES.prefix,
      taxRate: INVOICES.taxRate,
      taxLabel: INVOICES.taxLabel,
      dueDays: INVOICES.dueDays,
      reminders: INVOICES.reminders,
      onlinePay: onlinePayEnabled(),
      hourly: b ? b.hourly : 0,
      surcharge: b ? b.surcharge : 0,
      currency: (b && b.currency) || 'usd',
      methods: MANUAL_METHODS,
      methodLabels: METHOD_LABELS,
      labels: LINE_LABELS,
    },
  });
}

export async function invoiceSummary() {
  const rows = await listInvoices({ statuses: ['open'], limit: 300 });
  const today = todayIn();
  const overdue = rows.filter((inv) => displayStatus(inv, today) === 'overdue');
  return { open: rows.length, overdue: overdue.length, owed: rows.reduce((s, inv) => s + (inv.balance || 0), 0), currency: (BOOKING && BOOKING.pricing && BOOKING.pricing.currency) || 'usd' };
}

async function draft(url) {
  const id = url.searchParams.get('booking') || '';
  if (!UUID_RE.test(id)) throw bad('Which booking?');
  const booking = await bookingById(id);
  if (!booking) throw bad('That booking is gone.', 404);
  return json(200, { ok: true, draft: { ...draftFromBooking(booking), booking: { id: booking.id, name: booking.name, starts_at: booking.starts_at, status: booking.status, deposit_status: booking.deposit_status, deposit_amount: booking.deposit_amount } } });
}

async function one(id) {
  const inv = await invoiceById(id);
  if (!inv) throw bad('That invoice is gone.', 404);
  return inv;
}

async function act(req, editor, inv, origin) {
  const body = await readJson(req, 64 * 1024);
  const action = String(body.action || 'save');
  if (action === 'save') {
    const stored = await editInvoice({ inv, body, editor });
    return json(200, { ok: true, invoice: view(stored, origin), message: inv.status === 'open' ? 'Saved. The link shows the new total; send it again if they should hear about it.' : 'Draft saved.' });
  }
  if (action === 'note') {
    const stored = await updateInvoice(inv.id, { owner_note: String(body.owner_note == null ? '' : body.owner_note).trim().slice(0, 1000), updated_by: editor ? editor.id : null });
    return json(200, { ok: true, invoice: view(stored || inv, origin), message: 'Note saved.' });
  }
  if (action === 'send') {
    const edited = body.items !== undefined || body.name !== undefined ? await editInvoice({ inv, body, editor }) : inv;
    const r = await sendInvoice({ inv: edited, editor, origin });
    return json(200, { ok: true, invoice: view(r.invoice, origin), emailed: r.emailed, email_reason: r.emailReason, sms: r.sms, message: sentMessage(r) });
  }
  if (action === 'mark_paid') {
    if (inv.status !== 'open') throw bad(inv.status === 'draft' ? 'Send it first, or delete the draft.' : `This invoice is already ${inv.status}.`, 409);
    if (!MANUAL_METHODS.includes(body.method)) throw bad('How did they pay? Pick one.');
    const method = body.method;
    const reference = String(body.reference == null ? '' : body.reference).trim();
    if (reference.length > REFERENCE_MAX) throw bad(`Keep the reference under ${REFERENCE_MAX} characters.`);
    const paidAt = paidAtFrom(String(body.paid_on || ''));
    const r = await markPaid({ inv, method, via: 'manual', reference, paidAt, note: body.note ? `Paid by hand: ${String(body.note).slice(0, 200)}` : '', editor, origin, receipt: body.receipt !== false });
    if (!r.changed) throw bad('This invoice changed a moment ago. Reload to see where it stands.', 409);
    return json(200, { ok: true, invoice: view(r.invoice, origin), message: `Marked paid: ${METHOD_LABELS[method]}${reference ? ` (${reference})` : ''}.${body.receipt !== false && r.invoice.email ? ` ${r.invoice.name} is emailed a receipt.` : ''}` });
  }
  if (action === 'void') {
    const stored = await voidInvoice({ inv, reason: body.reason, editor });
    return json(200, { ok: true, invoice: view(stored, origin), message: `Invoice ${stored.number} voided. The link now says nothing is owed.` });
  }
  if (action === 'refund') {
    const r = await refundInvoice({ inv, editor });
    return json(200, { ok: true, invoice: view(r.invoice, origin), message: `Refunded ${money(r.invoice.paid_amount || 0, r.invoice.currency)} to ${r.invoice.name}'s card.${r.emailed ? ' They are emailed.' : ''}` });
  }
  throw bad('Unknown action');
}

export async function adminInvoices(req, editor, parts, url) {
  if (!INVOICES) return json(404, { ok: false, error: 'No invoices on this site' });
  const origin = `${url.protocol}//${url.host}`;
  const [first] = parts;
  const m = req.method;
  if (!first && m === 'GET') return list(origin);
  if (first === 'summary' && m === 'GET') return json(200, { ok: true, ...(await invoiceSummary()) });
  if (first === 'draft' && m === 'GET') return draft(url);
  if (first === 'export.csv' && m === 'GET') {
    const name = `${INVOICES.prefix.toLowerCase()}-invoices-${todayIn()}.csv`;
    return new Response(invoicesCsv(await listInvoices({ limit: 1000 })), { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', ...SECURITY_HEADERS } });
  }
  if (!first && m === 'POST') {
    const body = await readJson(req, 64 * 1024);
    const inv = await createDraft({ body, editor });
    if (body.send) {
      const r = await sendInvoice({ inv, editor, origin });
      return json(200, { ok: true, invoice: view(r.invoice, origin), emailed: r.emailed, email_reason: r.emailReason, sms: r.sms, message: sentMessage(r) });
    }
    return json(200, { ok: true, invoice: view(inv, origin), message: `Draft ${inv.number} saved.` });
  }
  if (first && UUID_RE.test(first)) {
    const inv = await one(first);
    if (m === 'GET') return json(200, { ok: true, invoice: view(inv, origin) });
    if (m === 'PATCH') return act(req, editor, inv, origin);
    if (m === 'DELETE') {
      if (inv.status !== 'draft') throw bad('Only a draft can be deleted. Void a sent invoice instead.', 409);
      await deleteDraft(inv.id);
      return json(200, { ok: true, message: `Draft ${inv.number} deleted.` });
    }
  }
  return json(404, { ok: false, error: 'Unknown endpoint' });
}

