// The bookkeeping download (/admin/ → Invoices → Download for bookkeeping):
// one row per sent invoice, money in dollars, dates in the site's zone.
// Labor, parts, fees and discounts are split out because they are booked
// (and taxed) differently. Drafts are left out: nothing was billed.

import { METHOD_LABELS, dayOf, lineAmount } from './invoice-core.mjs';

const COLUMNS = ['Invoice', 'Status', 'Customer', 'Email', 'Phone', 'Issued', 'Due', 'Paid on', 'Paid how', 'Reference', 'Labor', 'Parts', 'Fees', 'Discounts', 'Subtotal', 'Tax', 'Deposit credit', 'Total', 'Amount received', 'Stripe payment', 'Refunded on', 'Void reason'];

const dollars = (c) => (c == null ? '' : (c / 100).toFixed(2));

// A spreadsheet runs a cell that starts with = + - @ (or a tab/CR) as a
// formula: customer-typed text gets a leading quote. Money is written by us
// and stays a plain number.
function cell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function split(items) {
  const sum = { labor: 0, part: 0, fee: 0, discount: 0 };
  for (const it of items || []) if (it.kind in sum) sum[it.kind] += lineAmount(it);
  return sum;
}

export function invoicesCsv(rows) {
  const out = [COLUMNS.join(',')];
  for (const inv of rows) {
    if (inv.status === 'draft') continue;
    const s = split(inv.items);
    const paid = inv.status === 'paid' || inv.status === 'refunded';
    const how = !paid ? '' : inv.paid_via === 'stripe' ? METHOD_LABELS.card : METHOD_LABELS[inv.paid_method] || inv.paid_method || '';
    const text = [inv.number, inv.status, inv.name, inv.email, inv.phone, dayOf(inv.sent_at), inv.due_date || '', paid ? dayOf(inv.paid_at) : '', how, inv.paid_reference || ''].map(cell);
    const money = [s.labor, s.part, s.fee, s.discount, inv.subtotal, inv.tax, inv.credit, inv.total, paid ? inv.paid_amount : null].map(dollars);
    const tail = [inv.stripe_payment_intent || '', dayOf(inv.refunded_at), inv.void_reason || ''].map(cell);
    out.push([...text, ...money, ...tail].join(','));
  }
  return out.join('\r\n') + '\r\n';
}
