// The invoices table (config.tables.invoices), service role only. Rows are
// shaped by scripts/gen-migration.mjs invoicesTableSql(). Every function
// here goes through lib/db.mjs sb(), so tests mock fetch.

import { sb } from './db.mjs';

const SELECT = 'id,number,status,booking_id,name,email,phone,address,lang,items,currency,tax_rate,subtotal,tax,credit,total,balance,notes,owner_note,due_date,stripe_session_id,stripe_payment_intent,paid_at,paid_via,paid_method,paid_amount,paid_reference,refund_id,refunded_at,void_reason,sent_at,view_count,first_viewed_at,last_viewed_at,reminders_sent,created_at,updated_at';

const enc = encodeURIComponent;
const one = (rows) => (rows && rows[0] ? rows[0] : null);

export async function createInvoice(row) {
  return one(await sb(`/{invoices}?select=${SELECT}`, { method: 'POST', prefer: 'return=representation', body: row }));
}

export async function invoiceById(id) {
  return one(await sb(`/{invoices}?id=eq.${enc(id)}&select=${SELECT}`));
}

export async function invoiceByPayHash(hash) {
  return one(await sb(`/{invoices}?pay_token_hash=eq.${enc(hash)}&select=${SELECT}`));
}

export async function invoiceBySession(sessionId) {
  return one(await sb(`/{invoices}?stripe_session_id=eq.${enc(sessionId)}&select=${SELECT}`));
}

// `ifStatus`: write only while the row still has the status the caller read,
// so the webhook and the success page (or two owner taps) cannot both win.
// Returns the stored row, or null when nothing matched.
export async function updateInvoice(id, patch, { ifStatus = '' } = {}) {
  return one(
    await sb(`/{invoices}?id=eq.${enc(id)}${ifStatus ? `&status=eq.${enc(ifStatus)}` : ''}&select=${SELECT}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { ...patch, updated_at: new Date().toISOString() },
    })
  );
}

export async function deleteDraft(id) {
  return one(await sb(`/{invoices}?id=eq.${enc(id)}&status=eq.draft&select=id`, { method: 'DELETE', prefer: 'return=representation' }));
}

// The owner's list, newest first. `statuses` narrows it.
export async function listInvoices({ statuses = [], limit = 200 } = {}) {
  const q = [`select=${SELECT}`, 'order=created_at.desc', `limit=${limit}`];
  if (statuses.length) q.push(`status=in.(${statuses.join(',')})`);
  return (await sb(`/{invoices}?${q.join('&')}`)) || [];
}

export async function invoicesForBookings(ids) {
  const list = (ids || []).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!list.length) return [];
  return (await sb(`/{invoices}?booking_id=in.(${list.join(',')})&status=neq.void&select=id,number,status,booking_id,balance,total,currency,due_date,paid_at&order=created_at.desc`)) || [];
}

// Open invoices due on or before `today` (YYYY-MM-DD): the reminder run
// works out which of them are due a reminder today.
export async function openPastDue(today) {
  return (await sb(`/{invoices}?status=eq.open&due_date=lte.${enc(today)}&select=${SELECT}&order=due_date.asc&limit=200`)) || [];
}
