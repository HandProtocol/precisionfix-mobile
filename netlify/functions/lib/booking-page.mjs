// Two small server-rendered pages in the site's palette, no JS:
//   the customer's manage page (/booking/manage?t=…): the booking as it stands,
//     Cancel, and Ask for another time (cancel + back to the site's #book);
//   the owner's one-tap page (/api/booking/act?t=…&do=…): GET asks, its button
//     POSTs, the POST shows what happened. No session needed, no phone on GET.

import { config, siteName } from './config.mjs';
import { escapeHtml as e } from './html.mjs';
import { siteThemeVars } from './theme.mjs';
import { bookingRows, outcomeText, usableEmail, whenText } from './booking-email.mjs';
import { depositTerms } from './booking-deposit.mjs';
import { fmtMoney } from './stripe.mjs';
import { fmtDayLong, fmtTime } from './booking.mjs';

const T = {
  en: {
    title: 'Your booking', sent: 'Request sent. You will hear back to confirm.',
    status: { requested: 'Waiting for confirmation', confirmed: 'Confirmed', declined: 'Not confirmed', cancelled: 'Cancelled', completed: 'Done', no_show: 'Closed' },
    cancel: 'Cancel this booking', another: 'Ask for another time', back: 'Back to the site', book: 'Book again',
    cancelled_now: 'Cancelled. Book again any time.', confirm: 'Are you sure?',
    paid_now: (amt) => `Deposit received: ${amt}. Your visit is locked in.`,
    pay_due: (amt, until) => `Lock it in: pay the ${amt} deposit${until ? ` by ${until}` : ''}.`,
    pay_btn: (amt) => `Pay the ${amt} deposit`,
    pay_err: 'The payment page could not be opened just now. Try again in a minute; your time is still held.',
    cancel_kept: (amt) => `Cancelling keeps the ${amt} deposit, as noted when you paid. Are you sure?`,
  },
  es: {
    title: 'Tu reserva', sent: 'Solicitud enviada. Te confirmamos pronto.',
    status: { requested: 'Esperando confirmación', confirmed: 'Confirmada', declined: 'No confirmada', cancelled: 'Cancelada', completed: 'Terminada', no_show: 'Cerrada' },
    cancel: 'Cancelar esta reserva', another: 'Pedir otra hora', back: 'Volver al sitio', book: 'Reservar de nuevo',
    cancelled_now: 'Cancelada. Puedes reservar de nuevo cuando quieras.', confirm: '¿Seguro?',
    paid_now: (amt) => `Depósito recibido: ${amt}. Tu visita queda asegurada.`,
    pay_due: (amt, until) => `Asegura tu hora: paga el depósito de ${amt}${until ? ` antes de ${until}` : ''}.`,
    pay_btn: (amt) => `Pagar el depósito de ${amt}`,
    pay_err: 'No se pudo abrir la página de pago ahora. Intenta en un minuto; tu hora sigue apartada.',
    cancel_kept: (amt) => `Si cancelas, el depósito de ${amt} no se reembolsa, como se indicó al pagar. ¿Seguro?`,
  },
};

function amtOf(b, lang) {
  return b && b.deposit_amount ? fmtMoney(b.deposit_amount, b.deposit_currency || 'usd', lang) : '';
}

// payUrl: the Pay link while the deposit is due (and Stripe is wired);
// justPaid: back from Stripe with the deposit now paid; payError: 'stripe'
// when the Pay link could not open a payment page.
export function renderManagePage({ booking: b, token, intake = [], settings = null, sent = false, justCancelled = false, error = '', justPaid = false, payUrl = '', payError = '' }) {
  const lang = b && b.lang === 'es' ? 'es' : 'en';
  const s = T[lang];
  const active = b && (b.status === 'requested' || b.status === 'confirmed');
  const rows = b ? bookingRows(b, { lang, intake, settings }) : [];
  const amt = amtOf(b, lang);
  const due = b && b.deposit_status === 'due' && b.status === 'confirmed';
  const tz = (b && b.tz) || config.booking && config.booking.tz || 'America/Chicago';
  const until = due && b.deposit_due_by ? `${fmtDayLong(b.deposit_due_by, tz, lang)} ${lang === 'es' ? 'a las' : 'at'} ${fmtTime(b.deposit_due_by, tz, lang)}` : '';
  const payBlock = due
    ? `<div class="pay">${payError ? `<p class="muted">${e(s.pay_err)}</p>` : ''}<p>${e(s.pay_due(amt, until))}</p>${payUrl ? `<p><a class="btn" href="${e(payUrl)}">${e(s.pay_btn(amt))}</a></p>` : ''}<p class="tiny">${e(depositTerms(lang))}</p></div>`
    : '';
  const confirmText = b && b.deposit_status === 'paid' ? s.cancel_kept(amt) : s.confirm;
  const body = !b
    ? `<h1>${e(s.title)}</h1><p class="muted">${e(error || (lang === 'es' ? 'Este enlace ya no es válido.' : 'This link is not valid any more.'))}</p><p><a class="btn" href="/#book">${e(s.book)}</a></p>`
    : `${sent ? `<p class="banner">${e(s.sent)}</p>` : ''}${justCancelled ? `<p class="banner">${e(s.cancelled_now)}</p>` : ''}${justPaid ? `<p class="banner">${e(s.paid_now(amt))}</p>` : ''}
<h1>${e(s.title)}</h1>
<p class="status status--${e(b.status)}">${e(s.status[b.status] || b.status)}</p>
${payBlock}
<dl>${rows.map(([l, v]) => `<div><dt>${e(l)}</dt><dd>${e(v).replace(/\n/g, '<br>')}</dd></div>`).join('')}</dl>
${
  active
    ? `<form method="POST" action="/api/booking/manage?t=${encodeURIComponent(token)}" class="actions" onsubmit="return confirm(${e(JSON.stringify(confirmText))})">
  <input type="hidden" name="lang" value="${lang}">
  <button class="btn btn--ghost" type="submit" name="action" value="cancel">${e(s.cancel)}</button>
  <button class="btn${due && payUrl ? ' btn--ghost' : ''}" type="submit" name="action" value="rebook">${e(s.another)}</button>
</form>`
    : `<p><a class="btn" href="/#book">${e(s.book)}</a></p>`
}
<p class="tiny"><a href="/">${e(s.back)}</a></p>`;
  return pageShell({ lang, title: s.title, body });
}


// --- the owner's one-tap page --------------------------------------------------

const ADMIN_LINK = '<p class="tiny"><a href="/admin/#bookings">Open the Bookings tab</a></p>';
const NOTICE = {
  used: () => 'This link was already used. The Bookings tab shows where things stand.',
  expired: (b) => `This link expired. Confirm or decline ${b ? b.name : 'the request'} from the Bookings tab.`,
  invalid: () => 'This link is not valid.',
  handled: (b) => `${b.name}'s request is already ${String(b.status).replace('_', ' ')}. Nothing changed.`,
  error: () => 'Something went wrong. Check the Bookings tab before you try again.',
};

// state: ask | done | used | expired | invalid | handled | error
// result (done): { emailed, emailReason, sms } from applyAction
export function renderActPage({ state, action, booking: b = null, token = '', result = {}, settings = null }) {
  const name = b ? b.name : '';
  const isConfirm = action === 'confirm';
  const facts = b ? `<dl><div><dt>When</dt><dd>${e(whenText(b, 'en', settings))}</dd></div><div><dt>Service</dt><dd>${e(b.service_label)}</dd></div></dl>` : '';
  let title, body;
  if (state === 'ask' && b) {
    title = `${isConfirm ? 'Confirm' : 'Decline'} ${name}?`;
    const mailNote = usableEmail(b.email)
      ? `${name} is emailed when you tap ${isConfirm ? 'Confirm' : 'Decline'}.`
      : `${name} left no email: after you tap ${isConfirm ? 'Confirm' : 'Decline'}, you text them.`;
    const other = isConfirm ? 'decline' : 'confirm';
    body = `<h1>${e(title)}</h1>${facts}<p class="muted">${e(mailNote)}</p>
<form method="POST" action="/api/booking/act?t=${e(encodeURIComponent(token))}&amp;do=${isConfirm ? 'confirm' : 'decline'}" class="actions">
${isConfirm ? '' : `<label class="field">Reason (optional, goes to ${e(name)})<textarea name="reason" maxlength="300" rows="3"></textarea></label>`}
  <button class="btn${isConfirm ? '' : ' btn--danger'}" type="submit">${isConfirm ? 'Confirm' : 'Decline'}</button>
</form>
<p class="tiny"><a href="/api/booking/act?t=${e(encodeURIComponent(token))}&amp;do=${other}">${isConfirm ? 'Decline instead' : 'Confirm instead'}</a></p>${ADMIN_LINK}`;
  } else if (state === 'done' && b) {
    title = isConfirm ? 'Confirmed' : 'Declined';
    const digits = String(b.phone || '').replace(/[^\d+]/g, '');
    const reach = result.emailed ? '' : [
      result.sms ? `<a class="btn" href="${e(result.sms)}">Text ${e(name)}</a>` : '',
      digits ? `<a class="btn btn--ghost" href="tel:${e(digits)}">Call ${e(name)}</a>` : '',
    ].filter(Boolean).join('');
    body = `<p class="banner">${e(outcomeText(action, b, result))}</p><h1>${e(title)}</h1>${facts}${reach ? `<p class="actions">${reach}</p>` : ''}${ADMIN_LINK}`;
  } else {
    const key = NOTICE[state] && (state !== 'handled' || b) ? state : 'invalid';
    title = key === 'error' ? 'Something went wrong' : key === 'handled' ? 'Already handled' : 'Booking link';
    body = `<h1>${e(title)}</h1><p class="muted">${e(NOTICE[key](b))}</p>${ADMIN_LINK}`;
  }
  return pageShell({ lang: 'en', title, body });
}

// The page frame both pages share (and the invoice page, lib/invoice-page.mjs).
// `body` is trusted HTML built by the caller; `css` adds rules after these.
export function pageShell({ lang = 'en', title, body, css = '' }) {
  const t = config.theme;
  const fonts = config.fonts;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)} · ${e(siteName())}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="${e(t.bg)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${fonts.googleCss ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${e(fonts.googleCss)}" rel="stylesheet">` : ''}
<style>
:root{${siteThemeVars()}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:var(--font-body);line-height:1.55;min-height:100vh;display:grid;place-items:center;padding:1.5rem}
main{width:min(560px,100%);background:var(--bg-2,var(--bg));border:1px solid var(--line,rgb(128 128 128 / .3));border-radius:16px;padding:1.6rem;display:grid;gap:1rem}
.brand{display:flex;align-items:center;gap:.5rem;font-family:var(--font-display);font-size:1.05rem}
.brand svg{width:26px;height:26px;color:var(--accent)}
h1{font-family:var(--font-display);font-size:1.6rem;line-height:1.1}
.muted,.tiny{color:var(--ink-3,var(--ink));font-size:.9rem}
.banner{padding:.7rem .9rem;border-radius:10px;background:rgb(var(--accent-rgb) / .12);border-left:3px solid var(--accent);font-weight:600}
.pay{display:grid;gap:.6rem;padding:1rem 1.1rem;border-radius:12px;border:1px solid var(--accent);background:rgb(var(--accent-rgb) / .06)}
.pay p:first-child{font-weight:600}
.status{display:inline-block;font-size:.78rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:.3rem .7rem;border-radius:999px;border:1px solid var(--line-2,var(--accent));justify-self:start}
.status--confirmed{background:var(--accent);color:var(--on-accent,#fff);border-color:var(--accent)}
dl{display:grid;gap:.4rem}
dl div{display:grid;grid-template-columns:7rem minmax(0,1fr);gap:.8rem;padding:.5rem 0;border-top:1px solid var(--line,rgb(128 128 128 / .3))}
dt{font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3,var(--ink));padding-top:.2rem}
.actions{display:flex;gap:.6rem;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:.8rem 1.2rem;border-radius:999px;border:1px solid var(--accent);background:var(--accent);color:var(--on-accent,#fff);font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
.btn--ghost{background:transparent;color:var(--ink)}
.btn--danger{background:transparent;color:var(--ink);border-color:#c0392b}
label.field{display:grid;gap:.35rem;font-size:.9rem;flex:1 1 100%}
textarea{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line,rgb(128 128 128 / .4));border-radius:10px;padding:.6rem .7rem;width:100%}
a{color:var(--accent)}
@media (max-width:480px){dl div{grid-template-columns:1fr;gap:.1rem}.actions .btn{flex:1 1 100%}}
${css}
</style>
</head>
<body>
<main>
<p class="brand">${config.logo}<span>${e(siteName())}</span></p>
${body}
</main>
</body>
</html>`;
}
