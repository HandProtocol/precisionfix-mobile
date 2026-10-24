// The emails a conversation sends (lib/questions.mjs, account.mjs), on the
// same themed shell as the sign-in and booking mails. Customer mails follow
// the customer's language (EN/ES); the owner's are English.

import { config, siteName } from './config.mjs';
import { emailShell } from './email.mjs';
import { escapeHtml as e, smsHref, telHref } from './html.mjs';

const T = {
  en: {
    reply_subject: (n) => `${n} answered your question`,
    reply_title: (n) => `${n} answered`,
    open: 'Open the conversation',
    by_email: 'You can also just reply to this email.',
    welcome_subject: (n) => `${n} got your question`,
    welcome_title: 'Your question is in',
    welcome_body: (who, n) => `Thanks${who ? `, ${who}` : ''}. ${n} answers here, and we email you as soon as there is a reply.`,
    welcome_btn: 'Open your conversation',
    welcome_tiny: 'The button signs you in once and works for 7 days. After that, sign in on the site with your email.',
    link_subject: (n) => `Your ${n} sign-in link`,
    link_title: 'Sign in to your conversations',
    link_body: 'Tap the button to see your questions and answers. The link works once and expires in 20 minutes.',
    link_btn: 'Sign me in',
    link_tiny: 'Didn’t ask for this? Ignore it: nothing changes.',
    paste: 'Button not working? Paste this into your browser:',
  },
  es: {
    reply_subject: (n) => `${n} respondió tu pregunta`,
    reply_title: (n) => `${n} respondió`,
    open: 'Abrir la conversación',
    by_email: 'También puedes responder a este correo.',
    welcome_subject: (n) => `${n} recibió tu pregunta`,
    welcome_title: 'Tu pregunta llegó',
    welcome_body: (who, n) => `Gracias${who ? `, ${who}` : ''}. ${n} responde aquí y te avisamos por correo en cuanto haya respuesta.`,
    welcome_btn: 'Abrir tu conversación',
    welcome_tiny: 'El botón inicia tu sesión una vez y sirve por 7 días. Después, entra en el sitio con tu correo.',
    link_subject: (n) => `Tu enlace para entrar a ${n}`,
    link_title: 'Entra a tus conversaciones',
    link_body: 'Toca el botón para ver tus preguntas y respuestas. El enlace sirve una vez y vence en 20 minutos.',
    link_btn: 'Entrar',
    link_tiny: '¿No lo pediste? Ignóralo: nada cambia.',
    paste: '¿No funciona el botón? Pega esto en tu navegador:',
  },
};
const t = (lang) => T[lang === 'es' ? 'es' : 'en'];

function colors() {
  const th = config.theme;
  return { ink: th.ink, muted: th['ink-3'] || th['ink-2'] || th.ink, accent: th.accent, accent2: th['accent-2'] || th.accent, on: th['on-accent'] || '#ffffff', bg: th.bg };
}
function h1(text) { return `<h1 style="margin:0 0 14px;font-size:22px;line-height:1.2;color:${colors().ink};">${e(text)}</h1>`; }
function para(text) { return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${colors().ink};">${e(text).replace(/\n/g, '<br>')}</p>`; }
function tiny(html) { return `<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${colors().muted};">${html}</p>`; }
function link(href, label) { return `<a href="${e(href)}" style="color:${colors().accent2};text-decoration:underline;">${e(label)}</a>`; }
function button(href, label) {
  const c = colors();
  return `<p style="margin:18px 0 0;"><a href="${e(href)}" style="display:inline-block;background:${c.accent};color:${c.on};text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px;">${e(label)}</a></p>`;
}
// The message itself, set off like a quote so it reads as theirs.
function quote(text) {
  const c = colors();
  return `<div style="margin:0 0 6px;padding:12px 14px;border-left:3px solid ${c.accent};background:${c.accent}14;border-radius:8px;font-size:15px;line-height:1.6;color:${c.ink};">${e(text).replace(/\n/g, '<br>')}</div>`;
}
function footer() {
  const host = config.productionUrl.replace(/^https?:\/\//, '');
  return `<p style="margin:0;font-size:12px;line-height:1.6;color:${colors().muted};"><strong style="color:${colors().ink};">${e(siteName())}</strong> · ${link(config.productionUrl, host)}</p>`;
}
function textOf(...parts) { return `${parts.filter(Boolean).join('\n\n')}\n`; }

// To the owner: a new question or a reply, the customer one tap away.
export function ownerAlertEmail({ customer, thread, text, isNew, adminUrl, byEmail }) {
  const who = customer.name || customer.email;
  const subject = isNew ? `New question from ${who}: ${thread.subject}` : `${who} replied: ${thread.subject}`;
  const c = colors();
  const reach = [
    customer.phone && smsHref(customer.phone) ? link(smsHref(customer.phone), `Text ${customer.phone}`) : '',
    customer.phone && telHref(customer.phone) ? link(telHref(customer.phone), 'Call') : '',
    link(`mailto:${customer.email}`, customer.email),
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const inner = `${h1(isNew ? `${who} has a question` : `${who} wrote back`)}
    ${quote(text)}
    <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:${c.muted};">${e(who)}${thread.car ? ` · ${e(thread.car)}` : ''}<br>${reach}</p>
    ${button(adminUrl, 'Reply in the editor')}
    ${tiny(byEmail ? 'Or just reply to this email: your answer goes into the conversation and the customer is told.' : `Replying to this email writes to ${e(customer.email)} directly, outside the conversation.`)}`;
  return {
    subject,
    html: emailShell(inner, { preheader: text.slice(0, 120), footer: footer() }),
    text: textOf(isNew ? `${who} has a question:` : `${who} wrote back:`, text, `Reply in the editor: ${adminUrl}`, [customer.phone ? `Phone: ${customer.phone}` : '', `Email: ${customer.email}`, thread.car ? `Car: ${thread.car}` : ''].filter(Boolean).join('\n')),
  };
}

// To the customer: the owner's answer.
export function customerReplyEmail({ customer, thread, text, url, byEmail }) {
  const s = t(customer.lang), n = siteName();
  const inner = `${h1(s.reply_title(n))}${quote(text)}${button(url, s.open)}${byEmail ? tiny(e(s.by_email)) : ''}`;
  return {
    subject: s.reply_subject(n),
    html: emailShell(inner, { preheader: text.slice(0, 120), footer: footer() }),
    text: textOf(`${s.reply_title(n)}:`, text, `${s.open}: ${url}`, byEmail ? s.by_email : ''),
  };
}

// To the customer, right after their first question: the link that signs
// them in (and proves the email is theirs).
export function customerWelcomeEmail({ customer, thread, link: href, text, byEmail }) {
  const s = t(customer.lang), n = siteName();
  const inner = `${h1(s.welcome_title)}${para(s.welcome_body(customer.name, n))}${quote(text)}${button(href, s.welcome_btn)}${tiny(`${e(s.welcome_tiny)}${byEmail ? `<br>${e(s.by_email)}` : ''}<br>${e(s.paste)}<br><span style="word-break:break-all;">${e(href)}</span>`)}`;
  return {
    subject: s.welcome_subject(n),
    html: emailShell(inner, { preheader: s.welcome_body(customer.name, n), footer: footer() }),
    text: textOf(s.welcome_body(customer.name, n), `"${thread.subject}"`, `${s.welcome_btn}: ${href}`, s.welcome_tiny, byEmail ? s.by_email : ''),
  };
}

// A plain sign-in link for a customer.
export function customerLinkEmail({ customer, link: href }) {
  const s = t(customer.lang), n = siteName();
  const inner = `${h1(s.link_title)}${para(s.link_body)}${button(href, s.link_btn)}${tiny(`${e(s.paste)}<br><span style="word-break:break-all;">${e(href)}</span><br>${e(s.link_tiny)}`)}`;
  return {
    subject: s.link_subject(n),
    html: emailShell(inner, { preheader: s.link_body, footer: footer() }),
    text: textOf(s.link_body, href, s.link_tiny),
  };
}
