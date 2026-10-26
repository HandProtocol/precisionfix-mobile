// The customer's invoice page (/invoice?t=…), server-rendered in the site's
// palette on the booking pages' frame (lib/booking-page.mjs pageShell): who
// it is from and for, the lines, the totals with the deposit taken off, and
// one Pay button for the whole balance. Prints clean (Print or save as PDF).

import { INVOICES, config, siteName } from './config.mjs';
import { escapeHtml as e, telHref } from './html.mjs';
import { pageShell } from './booking-page.mjs';
import { dayOf, displayStatus, invoiceWords, money, qtyText, rateText, todayIn } from './invoice-core.mjs';
import { fmtDate } from './invoice-email.mjs';

const CSS = `
main{width:min(720px,100%)}
.inv-head{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:flex-start}
.inv-meta{text-align:right;font-size:.9rem;color:var(--ink-3,var(--ink));line-height:1.6}
.inv-meta strong{display:block;color:var(--ink);font-family:var(--font-display);font-size:1.25rem}
.inv-parties{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.inv-party{border:1px solid var(--line,rgb(128 128 128 / .3));border-radius:12px;padding:.8rem 1rem;font-size:.92rem}
.inv-party h2{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3,var(--ink));margin-bottom:.35rem;font-weight:600}
table.inv{width:100%;border-collapse:collapse;font-size:.95rem}
table.inv th{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3,var(--ink));text-align:left;padding:.4rem 0;font-weight:600}
table.inv td{padding:.6rem 0;border-top:1px solid var(--line,rgb(128 128 128 / .3));vertical-align:top}
table.inv .num{text-align:right;white-space:nowrap;padding-left:.8rem}
table.inv small{display:block;color:var(--ink-3,var(--ink));font-size:.82rem}
.inv-tot{margin-left:auto;width:min(320px,100%);display:grid;gap:.35rem;font-size:.95rem}
.inv-tot div{display:flex;justify-content:space-between;gap:1rem}
.inv-tot .muted{color:var(--ink-3,var(--ink))}
.inv-tot .due{border-top:1px solid var(--accent);padding-top:.55rem;margin-top:.2rem;font-weight:700;font-size:1.1rem}
.inv-notes{white-space:pre-line;font-size:.92rem;padding:.7rem .9rem;border-left:3px solid var(--accent);background:rgb(var(--accent-rgb) / .06);border-radius:6px}
.status--paid{background:var(--accent);color:var(--on-accent,#fff);border-color:var(--accent)}
.status--overdue{border-color:#c0392b;color:#c0392b}
.pay .btn{font-size:1.05rem;padding:.95rem 1.5rem}
@media (max-width:560px){.inv-parties{grid-template-columns:1fr}.inv-meta{text-align:left}}
@media print{body{background:#fff;color:#000;display:block;padding:0}main{border:0;width:100%;padding:0}.pay,.noprint{display:none!important}a{color:#000}}
`;

// paid: back from Stripe and now paid; payError: the Pay link could not open
// a Stripe page. `shop`: { phone } from the site's contact section.
export function renderInvoicePage({ invoice: inv, token = '', shop = null, payEnabled = false, justPaid = false, payError = false, error = '', now = new Date() }) {
  const lang = inv && inv.lang === 'es' ? 'es' : 'en';
  const s = invoiceWords(lang);
  if (!inv || inv.status === 'draft') {
    return pageShell({ lang, title: s.invoice, body: `<h1>${e(s.invoice)}</h1><p class="muted">${e(error || s.not_found)}</p><p><a class="btn" href="/">${e(siteName())}</a></p>`, css: CSS });
  }
  const cur = inv.currency || 'usd', m = (c) => money(c, cur, lang);
  const st = displayStatus(inv, todayIn(undefined, now));
  const issued = inv.sent_at ? fmtDate(dayOf(inv.sent_at), lang) : '';
  const dueText = !inv.due_date || (INVOICES && INVOICES.dueDays === 0) ? s.due_receipt : `${s.due} ${fmtDate(inv.due_date, lang)}`;
  const phone = shop && shop.phone ? shop.phone : '';
  const host = config.productionUrl.replace(/^https?:\/\//, '');
  const lines = (inv.items || [])
    .map((it) => {
      const amt = Math.round(it.qty * it.unit) * (it.kind === 'discount' ? -1 : 1);
      const detail = it.qty === 1 && it.kind !== 'labor' ? '' : `<small>${e(qtyText(it, lang))} × ${e(m(it.unit))}</small>`;
      return `<tr><td>${e(it.label)}${detail}</td><td class="num">${e(m(amt))}</td></tr>`;
    })
    .join('');
  const taxLabel = INVOICES ? INVOICES.taxLabel : 'Sales tax';
  const open = inv.status === 'open';
  const payHref = `/invoice/pay?t=${encodeURIComponent(token)}`;
  let state = '';
  if (justPaid && inv.status === 'paid') state = `<p class="banner">${e(s.just_paid(m(inv.paid_amount != null ? inv.paid_amount : inv.total)))}</p>`;
  let action = '';
  if (open && inv.balance > 0 && payEnabled) {
    action = `<div class="pay">${payError ? `<p class="muted">${e(s.pay_err)}</p>` : ''}<p><a class="btn" href="${e(payHref)}">${e(s.pay(m(inv.balance)))}</a></p><p class="tiny">${e(s.pay_note)}</p></div>`;
  } else if (open && inv.balance > 0) {
    action = `<div class="pay"><p>${e(s.balance)}: ${e(m(inv.balance))}</p>${phone ? `<p class="tiny">${e(s.questions)} <a href="${e(telHref(phone))}">${e(phone)}</a>.</p>` : ''}</div>`;
  } else if (inv.status === 'paid') {
    const how = inv.paid_method ? s.method[inv.paid_method] || '' : '';
    action = `<p class="banner">${e(inv.balance === 0 && inv.paid_method === 'deposit' ? s.nothing_owed : s.paid_on(inv.paid_at ? fmtDate(dayOf(inv.paid_at), lang) : '', how))}</p>`;
  } else if (inv.status === 'void') {
    action = `<p class="banner">${e(s.void_note)}</p>`;
  } else if (inv.status === 'refunded') {
    action = `<p class="banner">${e(s.refunded_note(inv.refunded_at ? fmtDate(dayOf(inv.refunded_at), lang) : ''))}</p>`;
  }
  const billTo = [inv.name && `<b>${e(inv.name)}</b>`, inv.address && e(inv.address), inv.phone && e(inv.phone), inv.email && e(inv.email)].filter(Boolean).join('<br>');
  const from = [`<b>${e(siteName())}</b>`, phone && `<a href="${e(telHref(phone))}">${e(phone)}</a>`, `<a href="${e(config.productionUrl)}">${e(host)}</a>`].filter(Boolean).join('<br>');
  const body = `${state}
<div class="inv-head">
  <div><h1>${e(s.invoice)}</h1><p class="status status--${e(st)}">${e(s.status[st] || st)}</p></div>
  <p class="inv-meta"><strong>${e(inv.number)}</strong>${issued ? `${e(s.issued)} ${e(issued)}<br>` : ''}${e(dueText)}</p>
</div>
${action}
<div class="inv-parties"><div class="inv-party"><h2>${e(s.from)}</h2>${from}</div><div class="inv-party"><h2>${e(s.bill_to)}</h2>${billTo}</div></div>
<table class="inv"><thead><tr><th>${e(s.item)}</th><th class="num">${e(s.amount)}</th></tr></thead><tbody>${lines}</tbody></table>
<div class="inv-tot">
  <div class="muted"><span>${e(s.subtotal)}</span><span>${e(m(inv.subtotal))}</span></div>
  ${inv.tax ? `<div class="muted"><span>${e(s.tax(taxLabel, rateText(inv.tax_rate)))}</span><span>${e(m(inv.tax))}</span></div>` : ''}
  ${inv.credit ? `<div class="muted"><span>${e(s.credit)}</span><span>−${e(m(inv.credit))}</span></div>` : ''}
  <div class="due"><span>${e(inv.status === 'paid' ? s.paid_total : s.balance)}</span><span>${e(m(inv.status === 'paid' && inv.paid_amount != null ? inv.paid_amount : inv.balance))}</span></div>
</div>
${inv.notes ? `<p class="inv-notes">${e(inv.notes)}</p>` : ''}
<p class="actions noprint"><button class="btn btn--ghost" type="button" onclick="window.print()">${e(s.print)}</button><a class="btn btn--ghost" href="/">${e(siteName())}</a></p>`;
  return pageShell({ lang, title: `${s.invoice} ${inv.number}`, body, css: CSS });
}
