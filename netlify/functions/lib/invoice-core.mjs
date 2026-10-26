// Invoices, the pure part: line items in, money out. No I/O, so the editor's
// live totals (public/admin/admin.js mirrors totalsOf) and the server agree
// to the cent. Everything is integer minor units (cents).
//
// A line: { kind, label, qty, unit, taxable }
//   kind      labor | part | fee | discount     (discount subtracts)
//   qty       hours for labor, a count for parts; up to 2 decimals (1.5 h)
//   unit      cents per hour / per part / the fee itself
//   taxable   sales tax applies (config.invoices.taxRate, set per invoice);
//             parts default to taxable, labor and fees do not
// The credit is the booking's paid deposit (it "comes off the bill"); the
// balance is what the customer still owes and what the Pay button charges.

import crypto from 'node:crypto';
import { INVOICES, config } from './config.mjs';
import { hashToken, signPayload } from './session.mjs';

export const KINDS = ['labor', 'part', 'fee', 'discount'];
export const STATUSES = ['draft', 'open', 'paid', 'void', 'refunded'];
// how the owner says it was paid when it was not through the site
// Ways a customer pays outside the site's Pay button ("Paid another way"),
// most common first. The owner's words for each (and for the two the system
// sets itself) go to the editor; the customer's are in invoiceWords().
export const MANUAL_METHODS = ['cash', 'cash_app', 'zelle', 'venmo', 'card_in_person', 'check', 'paypal', 'apple_cash', 'bank_transfer', 'other'];
export const METHOD_LABELS = { cash: 'Cash', cash_app: 'Cash App', zelle: 'Zelle', venmo: 'Venmo', card_in_person: 'Card, in person', check: 'Check', paypal: 'PayPal', apple_cash: 'Apple Cash', bank_transfer: 'Bank transfer', other: 'Other', card: 'Card, through your site', deposit: 'Covered by the deposit' };
// What the owner may note per method (the check number, the Cash App note).
export const REFERENCE_MAX = 120;
// "Paid another way" may be dated back this far (money that came in before it was entered).
export const BACKDATE_DAYS = 365;
export const MAX_ITEMS = 40;
const MAX_UNIT = 10000000; // $100,000 a line is plenty for a mobile mechanic
const MAX_QTY = 1000;

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const clip = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

// "12.5" / 12.5 / "$12.50" → 1250. Owner input arrives as dollars from the
// editor, but the API speaks cents: `unit` is cents, `price` is dollars.
export function dollarsToCents(v) {
  const n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function normalizeItem(raw, i = 0) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const kind = KINDS.includes(r.kind) ? r.kind : 'part';
  const label = clip(r.label, 120);
  if (!label) throw bad(`Line ${i + 1}: say what it is.`);
  const qty = Math.round(Number(r.qty === undefined || r.qty === '' ? 1 : r.qty) * 100) / 100;
  if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) throw bad(`Line ${i + 1} (${label}): the quantity must be more than 0.`);
  const unit = r.unit !== undefined ? Math.round(Number(r.unit)) : dollarsToCents(r.price);
  if (!Number.isInteger(unit) || unit < 0 || unit > MAX_UNIT) throw bad(`Line ${i + 1} (${label}): the price does not look right.`);
  const taxable = r.taxable === undefined ? kind === 'part' : Boolean(r.taxable);
  return { kind, label, qty, unit, taxable: kind === 'discount' ? false : taxable };
}

export function normalizeItems(list) {
  const items = Array.isArray(list) ? list : [];
  if (items.length > MAX_ITEMS) throw bad(`At most ${MAX_ITEMS} lines on one invoice.`);
  return items.map(normalizeItem);
}

export const lineAmount = (it) => Math.round(it.qty * it.unit) * (it.kind === 'discount' ? -1 : 1);

// → { subtotal, tax, credit, total, balance }. Tax is on the taxable lines
// only; a discount is never taxed and simply lowers the total. The credit
// never makes the balance negative.
export function totalsOf(items, { taxRate = 0, credit = 0 } = {}) {
  const subtotal = items.reduce((s, it) => s + lineAmount(it), 0);
  const taxable = items.filter((it) => it.taxable && it.kind !== 'discount').reduce((s, it) => s + lineAmount(it), 0);
  const tax = taxRate > 0 ? Math.round((taxable * taxRate) / 10000) : 0;
  const total = Math.max(0, subtotal + tax);
  const used = Math.max(0, Math.min(credit, total));
  return { subtotal, tax, credit: used, total, balance: total - used };
}

// The booking's paid deposit is the credit, when the deposit is credited to
// the bill (config.booking.deposit.credited) and it really was paid.
export function creditFor(booking) {
  const d = config.booking && config.booking.deposit;
  if (!booking || !d || !d.credited || booking.deposit_status !== 'paid') return 0;
  return Number(booking.deposit_amount) || 0;
}

// Prefill for "Make invoice" on a booking: labor at the posted rate (an
// hour for a window booking, the booked length for an exact time), the gas
// surcharge, the car in the notes, and the paid deposit as the credit.
// The prefilled lines' words, in the invoice's language (the editor adds lines with them too).
export const LINE_LABELS = { en: { labor: 'Labor', fee: 'Gas surcharge' }, es: { labor: 'Mano de obra', fee: 'Recargo de gasolina' } };

export function draftFromBooking(booking, { pricing = config.booking && config.booking.pricing } = {}) {
  const items = [];
  const words = LINE_LABELS[booking && booking.lang === 'es' ? 'es' : 'en'];
  const hours = booking && booking.starts_at && booking.ends_at ? Math.max(1, Math.round(((new Date(booking.ends_at) - new Date(booking.starts_at)) / 3600e3) * 2) / 2) : 1;
  if (pricing && pricing.hourly) items.push({ kind: 'labor', label: words.labor, qty: booking && booking.window ? 1 : hours, unit: pricing.hourly, taxable: false });
  if (pricing && pricing.surcharge) items.push({ kind: 'fee', label: words.fee, qty: 1, unit: pricing.surcharge, taxable: false });
  const car = booking ? [booking.car_model, booking.vin ? `VIN ${booking.vin}` : ''].filter(Boolean).join(' · ') : '';
  return {
    booking_id: booking ? booking.id : null,
    name: booking ? booking.name : '',
    email: booking ? booking.email || '' : '',
    phone: booking ? booking.phone || '' : '',
    address: booking ? [booking.address, booking.city].filter(Boolean).join(', ') : '',
    lang: booking && booking.lang === 'es' ? 'es' : 'en',
    items,
    tax_rate: INVOICES ? INVOICES.taxRate : 0,
    notes: car,
    credit: creditFor(booking),
    currency: (pricing && pricing.currency) || 'usd',
  };
}

// The date it is due, as YYYY-MM-DD in the site's zone: today + dueDays.
export function dueDateFrom(now = new Date(), dueDays = INVOICES ? INVOICES.dueDays : 0, tz = (config.booking && config.booking.tz) || 'America/Chicago') {
  const d = new Date(now.getTime() + dueDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function todayIn(tz = (config.booking && config.booking.tz) || 'America/Chicago', now = new Date()) {
  return dueDateFrom(now, 0, tz);
}
// A stored timestamp's day (YYYY-MM-DD) in the site's zone, not UTC's.
export function dayOf(ts) {
  return ts ? todayIn(undefined, new Date(ts)) : '';
}
// When money paid another way came in: YYYY-MM-DD in the site's zone, today
// or up to BACKDATE_DAYS back, never ahead. Today → now; an earlier day →
// midday that day (18:00 UTC is midday in the Americas), so dayOf() gives it back.
export function paidAtFrom(ymd, now = new Date()) {
  const today = todayIn(undefined, now);
  if (!ymd || ymd === today) return now;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || Number.isNaN(Date.parse(`${ymd}T00:00:00Z`))) throw Object.assign(new Error('Pick the day the money came in.'), { status: 400 });
  if (ymd > today) throw Object.assign(new Error('That day has not happened yet.'), { status: 400 });
  if (daysPastDue(ymd, today) > BACKDATE_DAYS) throw Object.assign(new Error(`That is more than ${BACKDATE_DAYS} days ago.`), { status: 400 });
  return new Date(`${ymd}T18:00:00Z`);
}
// Whole days from the due date to `today` (both YYYY-MM-DD): +3 = three days late.
export function daysPastDue(dueDate, today) {
  if (!dueDate || !today) return 0;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000);
}

// What the owner's list and the customer page call it: overdue is an open
// invoice past its due date, never a stored status.
export function displayStatus(inv, today = todayIn()) {
  if (!inv) return 'void';
  if (inv.status === 'open' && inv.due_date && inv.due_date < today) return 'overdue';
  return inv.status;
}

// The customer's link: derived from the id with the session secret like the
// booking links (lib/booking-token.mjs), stored only as a hash.
export function payToken(id) {
  return signPayload(`invoice-pay:${id}`);
}
export function payHash(id) {
  return hashToken(payToken(id));
}
export function invoiceUrl(id, origin = config.productionUrl) {
  return `${origin}/invoice?t=${payToken(id)}`;
}
export function newInvoiceId() {
  return crypto.randomUUID();
}

// "$1,234.50": always two decimals on an invoice.
export function money(cents, currency = 'usd', lang = 'en') {
  try {
    return new Intl.NumberFormat(lang === 'es' ? 'es-MX' : 'en-US', { style: 'currency', currency: String(currency || 'usd').toUpperCase(), currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((cents || 0) / 100);
  } catch (_) {
    return `${((cents || 0) / 100).toFixed(2)} ${String(currency || 'usd').toUpperCase()}`;
  }
}
export function qtyText(it, lang = 'en') {
  const n = Number.isInteger(it.qty) ? String(it.qty) : it.qty.toFixed(2).replace(/0$/, '');
  if (it.kind === 'labor') return lang === 'es' ? `${n} h` : `${n} hr`;
  return n;
}
export function rateText(bp) {
  return `${(bp / 100).toFixed(bp % 100 ? 2 : 0).replace(/(\.\d)0$/, '$1')}%`;
}

const WORDS = {
  en: {
    invoice: 'Invoice', issued: 'Issued', due: 'Due', due_receipt: 'Due on receipt', bill_to: 'Bill to', from: 'From',
    item: 'Item', qty: 'Qty', price: 'Price', amount: 'Amount',
    subtotal: 'Subtotal', tax: (label, rate) => `${label} (${rate})`, credit: 'Deposit paid', total: 'Total', balance: 'Balance due', paid_total: 'Paid',
    status: { draft: 'Draft', open: 'Awaiting payment', overdue: 'Overdue', paid: 'Paid', void: 'Void', refunded: 'Refunded' },
    kind: { labor: 'Labor', part: 'Part', fee: 'Fee', discount: 'Discount' },
    pay: (amt) => `Pay ${amt}`,
    pay_note: 'Card, Apple Pay or Google Pay on Stripe’s secure page. The money goes straight to the shop.',
    paid_on: (when, how) => `Paid ${when}${how ? ` · ${how}` : ''}. Thank you.`,
    void_note: 'This invoice was cancelled. Nothing is owed on it.',
    refunded_note: (when) => `Refunded ${when}. The money is on its way back to your card (5 to 10 business days).`,
    nothing_owed: 'Your deposit covers it: nothing more to pay.',
    print: 'Print or save as PDF', questions: 'Questions about this invoice? Reply to the email it came in, or call',
    pay_err: 'The payment page could not be opened just now. Try again in a minute.',
    just_paid: (amt) => `Payment received: ${amt}. A receipt is on its way to your email.`,
    method: { card: 'card', cash: 'cash', cash_app: 'Cash App', zelle: 'Zelle', venmo: 'Venmo', card_in_person: 'card, in person', check: 'check', paypal: 'PayPal', apple_cash: 'Apple Cash', bank_transfer: 'bank transfer', deposit: 'the deposit', other: '' },
    not_found: 'This invoice link is not valid any more.',
  },
  es: {
    invoice: 'Factura', issued: 'Emitida', due: 'Vence', due_receipt: 'Pagadera al recibirla', bill_to: 'Para', from: 'De',
    item: 'Concepto', qty: 'Cant.', price: 'Precio', amount: 'Importe',
    subtotal: 'Subtotal', tax: (label, rate) => `${label === 'Sales tax' ? 'Impuesto' : label} (${rate})`, credit: 'Depósito pagado', total: 'Total', balance: 'Saldo a pagar', paid_total: 'Pagado',
    status: { draft: 'Borrador', open: 'Pendiente de pago', overdue: 'Vencida', paid: 'Pagada', void: 'Anulada', refunded: 'Reembolsada' },
    kind: { labor: 'Mano de obra', part: 'Pieza', fee: 'Cargo', discount: 'Descuento' },
    pay: (amt) => `Pagar ${amt}`,
    pay_note: 'Tarjeta, Apple Pay o Google Pay en la página segura de Stripe. El dinero va directo al taller.',
    paid_on: (when, how) => `Pagada el ${when}${how ? ` · ${how}` : ''}. Gracias.`,
    void_note: 'Esta factura fue anulada. No se debe nada.',
    refunded_note: (when) => `Reembolsada el ${when}. El dinero vuelve a tu tarjeta (de 5 a 10 días hábiles).`,
    nothing_owed: 'Tu depósito lo cubre: no hay nada más que pagar.',
    print: 'Imprimir o guardar como PDF', questions: '¿Preguntas sobre esta factura? Responde al correo en que llegó, o llama al',
    pay_err: 'No se pudo abrir la página de pago ahora. Intenta en un minuto.',
    just_paid: (amt) => `Pago recibido: ${amt}. Te enviamos el recibo por correo.`,
    method: { card: 'tarjeta', cash: 'efectivo', cash_app: 'Cash App', zelle: 'Zelle', venmo: 'Venmo', card_in_person: 'tarjeta, en persona', check: 'cheque', paypal: 'PayPal', apple_cash: 'Apple Cash', bank_transfer: 'transferencia bancaria', deposit: 'el depósito', other: '' },
    not_found: 'Este enlace de factura ya no es válido.',
  },
};
export const invoiceWords = (lang) => WORDS[lang === 'es' ? 'es' : 'en'];
