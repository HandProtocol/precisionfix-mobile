// Every email an invoice sends, on the booking mails' card (lib/booking-email.mjs
// mailParts), EN/ES by the invoice's language:
//   invoice            the invoice, its lines and a Pay button            → customer
//   invoice_reminder   still unpaid N days after it was due              → customer
//   invoice_receipt    paid, thank you (through the site or by hand)     → customer
//   invoice_refunded   the payment went back to the card                 → customer
//   owner_invoice_paid     paid through Stripe                           → owner
//   owner_invoice_overdue  the last reminder went out and it is still open → owner

import { INVOICES, config, siteName } from './config.mjs';
import { mailParts, ownerRecipients, usableEmail } from './booking-email.mjs';
import { sendEmail, sendEmailWithRetry } from './email.mjs';
import { escapeHtml as e } from './html.mjs';
import { dayOf, invoiceWords, money, qtyText, rateText } from './invoice-core.mjs';

const { shell, table, button, para, h1, tiny, textOf } = mailParts;

const T = {
  en: {
    sent_subject: (n, amt) => `Invoice ${n} from ${siteName()}: ${amt}`,
    sent_title: (n) => `Invoice ${n}`,
    sent_body: (name, amt) => `Thanks, ${name}. Here is the invoice for the work. The balance is ${amt}: pay it online in a minute with the button below.`,
    sent_body_zero: (name) => `Thanks, ${name}. Here is the invoice for the work. Your deposit covers it, so there is nothing more to pay.`,
    remind_subject: (n, amt) => `Reminder: invoice ${n} (${amt}) is still open`,
    remind_title: 'A friendly reminder',
    remind_body: (name, n, amt, days) => `${name}, invoice ${n} for ${amt} is still open (${days} day${days === 1 ? '' : 's'} past due). If you already paid another way, reply and let us know.`,
    receipt_subject: (n) => `Receipt: invoice ${n} is paid`,
    receipt_title: 'Paid. Thank you',
    receipt_body: (name, amt, how) => `${name}, we received ${amt}${how ? ` (${how})` : ''}. This email is your receipt.`,
    refunded_subject: (n) => `Refund for invoice ${n}`,
    refunded_title: 'Refunded',
    refunded_body: (name, amt) => `${name}, ${amt} is on its way back to your card. Banks take 5 to 10 business days to show it.`,
    view: 'View the invoice', pay: (amt) => `Pay ${amt}`,
    owner_paid_subject: (inv, amt) => `Invoice paid: ${inv.number} · ${inv.name} (${amt})`,
    owner_paid_title: 'Invoice paid',
    owner_paid_body: (inv, amt) => `${inv.name} paid ${amt} on invoice ${inv.number} through your website. Stripe pays it out to your bank.`,
    owner_overdue_subject: (inv) => `Still unpaid: ${inv.number} · ${inv.name}`,
    owner_overdue_title: 'Still unpaid',
    owner_overdue_body: (inv, amt, days) => `${inv.name} has not paid invoice ${inv.number} (${amt}), ${days} days past due. They have had every reminder the site sends; it stops here. Text or call them, or mark it paid if they paid another way.`,
    open: 'Open in the editor',
    number: 'Invoice', balance: 'Balance due', due: 'Due', who: 'Customer',
  },
  es: {
    sent_subject: (n, amt) => `Factura ${n} de ${siteName()}: ${amt}`,
    sent_title: (n) => `Factura ${n}`,
    sent_body: (name, amt) => `Gracias, ${name}. Aquí está la factura del trabajo. El saldo es ${amt}: págalo en línea en un minuto con el botón de abajo.`,
    sent_body_zero: (name) => `Gracias, ${name}. Aquí está la factura del trabajo. Tu depósito la cubre, así que no hay nada más que pagar.`,
    remind_subject: (n, amt) => `Recordatorio: la factura ${n} (${amt}) sigue pendiente`,
    remind_title: 'Un recordatorio amable',
    remind_body: (name, n, amt, days) => `${name}, la factura ${n} por ${amt} sigue pendiente (${days} día${days === 1 ? '' : 's'} de retraso). Si ya pagaste de otra forma, responde y avísanos.`,
    receipt_subject: (n) => `Recibo: la factura ${n} está pagada`,
    receipt_title: 'Pagada. Gracias',
    receipt_body: (name, amt, how) => `${name}, recibimos ${amt}${how ? ` (${how})` : ''}. Este correo es tu recibo.`,
    refunded_subject: (n) => `Reembolso de la factura ${n}`,
    refunded_title: 'Reembolsada',
    refunded_body: (name, amt) => `${name}, ${amt} vuelve a tu tarjeta. Los bancos tardan de 5 a 10 días hábiles en mostrarlo.`,
    view: 'Ver la factura', pay: (amt) => `Pagar ${amt}`,
    number: 'Factura', balance: 'Saldo a pagar', due: 'Vence', who: 'Cliente',
  },
};
const w = (lang) => T[lang === 'es' ? 'es' : 'en'];
const langOf = (inv) => (inv && inv.lang === 'es' ? 'es' : 'en');

// "October 25, 2026" from a YYYY-MM-DD, no timezone drift.
export function fmtDate(ymd, lang = 'en') {
  if (!ymd) return '';
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
}

// The lines and the totals as an email table (inline styles only).
export function invoiceTableHtml(inv, lang = langOf(inv)) {
  const s = invoiceWords(lang), th = config.theme;
  const ink = th.ink, muted = th['ink-3'] || th['ink-2'] || th.ink, line = `${th['accent-2'] || th.accent}26`;
  const cur = inv.currency || 'usd', m = (c) => money(c, cur, lang);
  const td = (x, right = false, extra = '') => `<td style="padding:9px 0;border-top:1px solid ${line};font-size:14px;line-height:1.4;color:${ink};${right ? 'text-align:right;white-space:nowrap;padding-left:12px;' : ''}${extra}">${x}</td>`;
  const lines = (inv.items || [])
    .map((it) => {
      const amt = Math.round(it.qty * it.unit) * (it.kind === 'discount' ? -1 : 1);
      const detail = it.qty === 1 && it.kind !== 'labor' ? '' : `<br><span style="font-size:12px;color:${muted};">${e(qtyText(it, lang))} × ${e(m(it.unit))}</span>`;
      return `<tr>${td(`${e(it.label)}${detail}`)}${td(e(m(amt)), true)}</tr>`;
    })
    .join('');
  const tot = (label, value, strong = false) => `<tr>${td(strong ? `<strong>${e(label)}</strong>` : e(label), false, strong ? '' : `color:${muted};`)}${td(strong ? `<strong>${e(value)}</strong>` : e(value), true)}</tr>`;
  const taxLabel = INVOICES ? INVOICES.taxLabel : 'Sales tax';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:16px 0 0;">${lines}${tot(s.subtotal, m(inv.subtotal))}${inv.tax ? tot(s.tax(taxLabel, rateText(inv.tax_rate)), m(inv.tax)) : ''}${inv.credit ? tot(s.credit, `−${m(inv.credit)}`) : ''}${tot(s.balance, m(inv.balance), true)}</table>`;
}
function invoiceText(inv, lang = langOf(inv)) {
  const s = invoiceWords(lang), m = (c) => money(c, inv.currency || 'usd', lang);
  const rows = (inv.items || []).map((it) => `${it.label}${it.qty === 1 && it.kind !== 'labor' ? '' : ` (${qtyText(it, lang)} × ${m(it.unit)})`}: ${m(Math.round(it.qty * it.unit) * (it.kind === 'discount' ? -1 : 1))}`);
  rows.push(`${s.subtotal}: ${m(inv.subtotal)}`);
  if (inv.tax) rows.push(`${s.tax(INVOICES ? INVOICES.taxLabel : 'Sales tax', rateText(inv.tax_rate))}: ${m(inv.tax)}`);
  if (inv.credit) rows.push(`${s.credit}: -${m(inv.credit)}`);
  rows.push(`${s.balance}: ${m(inv.balance)}`);
  return rows.join('\n');
}

function facts(inv, lang) {
  const s = w(lang), iw = invoiceWords(lang);
  return [
    [s.number, inv.number],
    [s.due, inv.due_date ? (INVOICES && INVOICES.dueDays === 0 && inv.sent_at && inv.due_date === dayOf(inv.sent_at) ? iw.due_receipt : fmtDate(inv.due_date, lang)) : iw.due_receipt],
  ];
}

export function invoiceSentEmail({ invoice: inv, url, settings = null }) {
  const lang = langOf(inv), s = w(lang), amt = money(inv.balance, inv.currency, lang);
  const body = inv.balance > 0 ? s.sent_body(inv.name, amt) : s.sent_body_zero(inv.name);
  const notes = inv.notes ? para(inv.notes) : '';
  const btns = inv.balance > 0 ? `${button(url, s.pay(amt))}${button(url, s.view, { ghost: true })}` : button(url, s.view, { ghost: true });
  const html = shell(`${h1(s.sent_title(inv.number))}${para(body)}${table(facts(inv, lang))}${invoiceTableHtml(inv, lang)}${notes}<p style="margin:22px 0 0;">${btns}</p>${tiny(e(invoiceWords(lang).pay_note))}`, { pre: body, lang, settings });
  return { subject: s.sent_subject(inv.number, amt), html, text: textOf(facts(inv, lang), s.sent_title(inv.number), body, invoiceText(inv, lang), inv.notes, `${s.view}: ${url}`) };
}

export function invoiceReminderEmail({ invoice: inv, url, days, settings = null }) {
  const lang = langOf(inv), s = w(lang), amt = money(inv.balance, inv.currency, lang);
  const body = s.remind_body(inv.name, inv.number, amt, days);
  const html = shell(`${h1(s.remind_title)}${para(body)}${invoiceTableHtml(inv, lang)}<p style="margin:22px 0 0;">${button(url, s.pay(amt))}${button(url, s.view, { ghost: true })}</p>`, { pre: body, lang, settings });
  return { subject: s.remind_subject(inv.number, amt), html, text: textOf(facts(inv, lang), s.remind_title, body, invoiceText(inv, lang), `${s.pay(amt)}: ${url}`) };
}

export function invoiceReceiptEmail({ invoice: inv, url, settings = null }) {
  const lang = langOf(inv), s = w(lang), amt = money(inv.paid_amount != null ? inv.paid_amount : inv.balance, inv.currency, lang);
  const how = inv.paid_method ? invoiceWords(lang).method[inv.paid_method] || '' : '';
  const body = s.receipt_body(inv.name, amt, how);
  const html = shell(`${h1(s.receipt_title)}${para(body)}${table([[s.number, inv.number]])}${invoiceTableHtml(inv, lang)}<p style="margin:22px 0 0;">${button(url, s.view, { ghost: true })}</p>`, { pre: body, lang, settings });
  return { subject: s.receipt_subject(inv.number), html, text: textOf([[s.number, inv.number]], s.receipt_title, body, invoiceText(inv, lang), `${s.view}: ${url}`) };
}

export function invoiceRefundedEmail({ invoice: inv, settings = null }) {
  const lang = langOf(inv), s = w(lang), amt = money(inv.paid_amount || 0, inv.currency, lang);
  const body = s.refunded_body(inv.name, amt);
  const html = shell(`${h1(s.refunded_title)}${para(body)}${table([[s.number, inv.number]])}`, { pre: body, lang, settings });
  return { subject: s.refunded_subject(inv.number), html, text: textOf([[s.number, inv.number]], s.refunded_title, body) };
}

function ownerFacts(inv) {
  const s = w('en');
  return [[s.who, [inv.name, inv.phone, inv.email].filter(Boolean).join(' · ')], [s.number, inv.number]];
}
export function ownerInvoicePaidEmail({ invoice: inv, links, settings = null }) {
  const s = T.en, amt = money(inv.paid_amount != null ? inv.paid_amount : inv.balance, inv.currency, 'en');
  const body = s.owner_paid_body(inv, amt);
  const html = shell(`${h1(s.owner_paid_title)}${para(body)}${table(ownerFacts(inv))}<p style="margin:22px 0 0;">${button(links.open, s.open, { ghost: true })}</p>`, { pre: body, owner: true, settings });
  return { subject: s.owner_paid_subject(inv, amt), html, text: textOf(ownerFacts(inv), s.owner_paid_title, body, `${s.open}: ${links.open}`) };
}
export function ownerInvoiceOverdueEmail({ invoice: inv, links, days, settings = null }) {
  const s = T.en, amt = money(inv.balance, inv.currency, 'en');
  const body = s.owner_overdue_body(inv, amt, days);
  const html = shell(`${h1(s.owner_overdue_title)}${para(body)}${table(ownerFacts(inv))}<p style="margin:22px 0 0;">${button(links.open, s.open)}</p>`, { pre: body, owner: true, settings });
  return { subject: s.owner_overdue_subject(inv), html, text: textOf(ownerFacts(inv), s.owner_overdue_title, body, `${s.open}: ${links.open}`) };
}

// A text the owner can send instead when the customer left no email (or the
// mail failed): the link, said plainly.
export function invoiceSmsHref(inv, url) {
  const digits = String(inv.phone || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  const lang = langOf(inv), amt = money(inv.balance, inv.currency, lang);
  const body = lang === 'es' ? `Hola ${inv.name}, aquí está tu factura ${inv.number} de ${siteName()} (${amt}). Puedes pagarla aquí: ${url}` : `Hi ${inv.name}, here is your invoice ${inv.number} from ${siteName()} (${amt}). You can pay it here: ${url}`;
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
}

// kind: invoice | invoice_reminder | invoice_receipt | invoice_refunded | owner_invoice_paid | owner_invoice_overdue
export async function sendInvoiceEmail(kind, ctx) {
  const inv = ctx.invoice;
  if (kind.startsWith('owner_')) {
    const to = ownerRecipients();
    if (!to.length) return { ok: false, reason: 'no-recipients' };
    const mail = kind === 'owner_invoice_paid' ? ownerInvoicePaidEmail(ctx) : kind === 'owner_invoice_overdue' ? ownerInvoiceOverdueEmail(ctx) : null;
    if (!mail) return { ok: false, reason: 'unknown-kind' };
    return sendEmailWithRetry({ to, ...mail, ...(usableEmail(inv.email) ? { reply_to: inv.email } : {}) });
  }
  if (!String(inv.email || '').trim()) return { ok: false, reason: 'no-customer-email' };
  if (!usableEmail(inv.email)) return { ok: false, reason: 'bad-customer-email' };
  const mail =
    kind === 'invoice' ? invoiceSentEmail(ctx)
    : kind === 'invoice_reminder' ? invoiceReminderEmail(ctx)
    : kind === 'invoice_receipt' ? invoiceReceiptEmail(ctx)
    : kind === 'invoice_refunded' ? invoiceRefundedEmail(ctx)
    : null;
  if (!mail) return { ok: false, reason: 'unknown-kind' };
  return sendEmail({ to: [inv.email.toLowerCase()], ...mail });
}
