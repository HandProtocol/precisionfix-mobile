// Customer accounts and their questions (config.questions). The page is
// /account/ (lib/account-page.mjs + public/account/account.js).
//
//   POST /api/account/ask        { name, email, phone?, car?, question, lang, website(honeypot) }
//                                new email → account made, signed in, thread opened
//                                known email → thread filed under it, a sign-in link emailed, NOT signed in
//   POST /api/account/request    { email }             → always { ok:true } (never says who has an account)
//   POST /api/account/verify     { token }             → signs in (and verifies the email)
//   POST /api/account/password   { email, password }   → signs in, or one vague 401
//   POST /api/account/set-password { password, current? } (verified accounts only)
//   POST /api/account/logout
//   GET  /api/account/me                               → { customer, threads } or 401
//   POST /api/account/threads    { question, car? }    → a new conversation
//   GET  /api/account/threads/:id                      → { thread, messages } (theirs only)
//   POST /api/account/threads/:id { body }             → a reply
//
// Passwords follow the editor rules (auth.mjs): optional, 8 misses lock for
// 15 minutes, a link lifts the lock, a change signs out other devices, the
// current one is needed unless signed in under 15 minutes ago.

import { QUESTIONS, siteName } from './lib/config.mjs';
import { sb } from './lib/db.mjs';
import { clientIp, handleError, html, json, readJson, sameOrigin } from './lib/http.mjs';
import { hashPassword, passwordProblem, verifyPassword, PASSWORD_MAX } from './lib/password.mjs';
import { sendEmail } from './lib/email.mjs';
import { renderAccountPage } from './lib/account-page.mjs';
import {
  WELCOME_TTL_DAYS, cleanEmail, clearCustomerCookie, createCustomer, currentCustomer, customerCookie, customerIssuedAt,
  findCustomer, linksSentSince, mintLink, publicCustomer, spendLink, validEmail,
} from './lib/customers.mjs';
import { BODY_MAX, CAR_MAX, cleanBody, isUuid, markRead, messagesOf, postMessage, replyAddress, startThread, threadById, threadsOf, tooManyMessages, tooManyNewFromIp } from './lib/questions.mjs';
import { customerLinkEmail, customerWelcomeEmail } from './lib/questions-email.mjs';

const NAME_MAX = 80;
const PHONE_MAX = 40;
const MAX_LINKS_PER_HOUR = 5;
const MAX_FAILS = 8;
const LOCK_MIN = 15;
const FRESH_MIN = 15;
const WRONG = { en: 'That email and password do not match. Try again, or send yourself a sign-in link.', es: 'El correo y la contraseña no coinciden. Intenta de nuevo o envíate un enlace para entrar.' };
const nowSec = () => Math.floor(Date.now() / 1000);
const isFresh = (issued) => Boolean(issued) && nowSec() - issued >= 0 && nowSec() - issued < FRESH_MIN * 60;
const langOf = (v) => (v === 'es' ? 'es' : 'en');
const say = (lang, en, es) => (lang === 'es' ? es : en);
const threadView = (t) => ({ id: t.id, subject: t.subject, car: t.car, status: t.status, unread: t.customer_unread, lastAuthor: t.last_author, lastMessageAt: t.last_message_at, createdAt: t.created_at });
const messageView = (m) => ({ id: m.id, author: m.author, body: m.body, via: m.via, createdAt: m.created_at });

function originOf(req) {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

async function ask(req) {
  const body = await readJson(req, 16 * 1024);
  const lang = langOf(body.lang);
  if (body.website) return json(200, { ok: true, signedIn: false, emailed: true }); // honeypot: look done, do nothing
  const email = cleanEmail(body.email);
  const name = cleanBody(body.name, NAME_MAX);
  const phone = cleanBody(body.phone, PHONE_MAX);
  const question = cleanBody(body.question);
  if (!name) return json(400, { ok: false, error: say(lang, 'Add your name.', 'Escribe tu nombre.'), field: 'name' });
  if (!validEmail(email)) return json(400, { ok: false, error: say(lang, 'Enter a valid email so we can answer you.', 'Escribe un correo válido para poder responderte.'), field: 'email' });
  if (question.length < 3) return json(400, { ok: false, error: say(lang, 'Write your question.', 'Escribe tu pregunta.'), field: 'question' });
  const ip = clientIp(req);
  if (await tooManyNewFromIp(ip)) return json(429, { ok: false, error: say(lang, 'Too many questions from here in the last hour. Try again later, or call.', 'Demasiadas preguntas desde aquí en la última hora. Intenta más tarde o llama.') });

  const known = await findCustomer(email);
  const customer = known || (await createCustomer({ email, name, phone, lang }));
  if (known) {
    // Anyone may type a known email here. If the account was never verified,
    // whoever made it might not own the inbox: sign every session out before
    // this question lands in it, so only the emailed link opens it.
    const patch = { ...(known.name ? {} : { name }), ...(phone && !known.phone ? { phone } : {}), // a second ahead, so a cookie signed this very second is out too
      ...(known.email_verified_at ? {} : { sessions_after: new Date(Date.now() + 1000).toISOString() }) };
    if (Object.keys(patch).length) await sb(`/{customers}?id=eq.${known.id}`, { method: 'PATCH', prefer: 'return=minimal', body: patch });
  }
  const who = { ...customer, name: customer.name || name, phone: customer.phone || phone, lang };
  const { thread } = await startThread({ customer: who, question, car: body.car, ip });
  // The welcome link verifies the email; for a known email it is the only way in.
  const link = await mintLink(customer, { origin: originOf(req), ttlMin: WELCOME_TTL_DAYS * 24 * 60, ip, hash: `t/${thread.id}` });
  // a reply to the welcome joins the conversation too, once inbound is on
  const inbound = replyAddress(thread.id, 'c');
  const sent = await sendEmail({ to: [email], ...customerWelcomeEmail({ customer: who, thread, link, text: question, byEmail: Boolean(inbound) }), ...(inbound ? { reply_to: inbound } : {}) });
  if (!sent.ok) console.warn(`[account] welcome mail failed: ${sent.reason}`);
  if (known) return json(200, { ok: true, signedIn: false, emailed: true });
  return json(200, { ok: true, signedIn: true, customer: publicCustomer(customer), thread: threadView(thread) }, { 'Set-Cookie': customerCookie(customer.id) });
}

async function requestLink(req) {
  const body = await readJson(req, 4096);
  const email = cleanEmail(body.email);
  const lang = langOf(body.lang);
  if (!validEmail(email)) return json(400, { ok: false, error: say(lang, 'Enter a valid email.', 'Escribe un correo válido.') });
  const customer = await findCustomer(email);
  // Same answer either way: this cannot be used to learn who has an account.
  if (!customer || (await linksSentSince(customer.id, 60)) >= MAX_LINKS_PER_HOUR) return json(200, { ok: true });
  const link = await mintLink(customer, { origin: originOf(req), ip: clientIp(req), hash: String(body.hash || '').match(/^t\/[0-9a-f-]{36}$/) ? body.hash : '' });
  const sent = await sendEmail({ to: [customer.email], ...customerLinkEmail({ customer, link }) });
  if (!sent.ok) console.warn(`[account] link mail failed: ${sent.reason}`);
  return json(200, { ok: true });
}

async function verify(req) {
  const body = await readJson(req, 4096);
  const r = await spendLink(body.token);
  const lang = langOf(body.lang);
  if (r.error) return json(400, { ok: false, error: say(lang, 'This link has expired or was already used. Sign in below, or send yourself a new one.', 'Este enlace venció o ya se usó. Entra abajo o envíate uno nuevo.') });
  return json(200, { ok: true, customer: publicCustomer(r.customer) }, { 'Set-Cookie': customerCookie(r.customer.id) });
}

async function passwordSignIn(req) {
  const body = await readJson(req, 4096);
  const lang = langOf(body.lang);
  const email = cleanEmail(body.email);
  const password = String(body.password || '');
  const wrong = json(401, { ok: false, error: WRONG[lang] });
  if (!validEmail(email) || !password || password.length > PASSWORD_MAX) return wrong;
  const c = await findCustomer(email, 'id,email,name,phone,lang,email_verified_at,password_set_at,password_hash,failed_logins,locked_until');
  // Always one hash, so the time taken does not say whether the email exists.
  const ok = await verifyPassword(password, c && c.password_hash);
  if (!c || !c.password_hash) return wrong;
  if (c.locked_until && Date.parse(c.locked_until) > Date.now()) return wrong;
  if (!ok) {
    const fails = (Number(c.failed_logins) || 0) + 1;
    const lock = fails >= MAX_FAILS;
    await sb(`/{customers}?id=eq.${c.id}`, { method: 'PATCH', prefer: 'return=minimal', body: lock ? { failed_logins: 0, locked_until: new Date(Date.now() + LOCK_MIN * 60 * 1000).toISOString() } : { failed_logins: fails } });
    return wrong;
  }
  await sb(`/{customers}?id=eq.${c.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { last_login_at: new Date().toISOString(), failed_logins: 0, locked_until: null } }).catch(() => {});
  return json(200, { ok: true, customer: publicCustomer(c) }, { 'Set-Cookie': customerCookie(c.id) });
}

async function setPassword(req, customer) {
  const body = await readJson(req, 4096);
  const lang = langOf(customer.lang);
  if (!customer.email_verified_at) return json(400, { ok: false, error: say(lang, 'First open the link we emailed you, so we know the address is yours.', 'Primero abre el enlace que te enviamos, así sabemos que el correo es tuyo.'), needVerify: true });
  const password = String(body.password || '');
  const problem = passwordProblem(password, customer.email);
  if (problem) return json(400, { ok: false, error: problem });
  const rows = await sb(`/{customers}?id=eq.${customer.id}&select=id,password_hash`);
  const row = rows && rows[0];
  if (row && row.password_hash && !isFresh(customerIssuedAt(req)) && !(await verifyPassword(String(body.current || ''), row.password_hash))) {
    return json(400, { ok: false, error: say(lang, 'Your current password is not right. Forgot it? Sign out, sign in with an email link, and set a new one within 15 minutes.', 'Tu contraseña actual no es correcta. ¿La olvidaste? Sal, entra con un enlace por correo y pon una nueva en menos de 15 minutos.'), needCurrent: true });
  }
  const at = new Date(nowSec() * 1000).toISOString();
  await sb(`/{customers}?id=eq.${customer.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { password_hash: await hashPassword(password), password_set_at: at, sessions_after: at, failed_logins: 0, locked_until: null } });
  return json(200, { ok: true, customer: publicCustomer({ ...customer, password_set_at: at }) }, { 'Set-Cookie': customerCookie(customer.id) });
}

async function newThread(req, customer) {
  const body = await readJson(req, 16 * 1024);
  const lang = langOf(customer.lang);
  const question = cleanBody(body.question);
  if (question.length < 3) return json(400, { ok: false, error: say(lang, 'Write your question.', 'Escribe tu pregunta.') });
  if ((await tooManyMessages(customer.id)) || (await tooManyNewFromIp(clientIp(req)))) return json(429, { ok: false, error: say(lang, 'That is a lot of messages in an hour. Try again a bit later, or call.', 'Son muchos mensajes en una hora. Intenta un poco más tarde o llama.') });
  const { thread, emailed } = await startThread({ customer, question, car: cleanBody(body.car, CAR_MAX), ip: clientIp(req) });
  return json(200, { ok: true, thread: threadView(thread), emailed });
}

async function openThread(customer, id) {
  const thread = await threadById(id);
  if (!thread || thread.customer_id !== customer.id) return json(404, { ok: false, error: 'Not found' });
  const messages = await messagesOf(thread.id);
  if (thread.customer_unread) await markRead(thread.id, 'customer');
  return json(200, { ok: true, thread: threadView({ ...thread, customer_unread: false }), messages: messages.map(messageView) });
}

async function reply(req, customer, id) {
  const body = await readJson(req, 16 * 1024);
  const lang = langOf(customer.lang);
  const text = cleanBody(body.body);
  if (!text) return json(400, { ok: false, error: say(lang, 'Write a message first.', 'Escribe un mensaje primero.') });
  if (String(body.body || '').length > BODY_MAX * 2) return json(413, { ok: false, error: 'Too long' });
  const thread = await threadById(id);
  if (!thread || thread.customer_id !== customer.id) return json(404, { ok: false, error: 'Not found' });
  if (await tooManyMessages(customer.id)) return json(429, { ok: false, error: say(lang, 'That is a lot of messages in an hour. Try again a bit later, or call.', 'Son muchos mensajes en una hora. Intenta un poco más tarde o llama.') });
  const { message } = await postMessage({ thread, customer, author: 'customer', body: text });
  return json(200, { ok: true, message: messageView(message) });
}

export default async (req) => {
  if (!QUESTIONS) return json(404, { ok: false, error: 'Not found' });
  const url = new URL(req.url);
  try {
    if (url.pathname === '/account' || url.pathname === '/account/') {
      if (req.method !== 'GET') return json(405, { ok: false, error: 'GET only' });
      return html(200, renderAccountPage(), { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
    }
    const parts = url.pathname.replace(/^\/api\/account\/?/, '').split('/').filter(Boolean);
    const [action, id] = parts;
    if (req.method !== 'GET' && !sameOrigin(req)) return json(403, { ok: false, error: 'Cross-origin request blocked' });

    if (req.method === 'POST' && parts.length === 1) {
      if (action === 'ask') return await ask(req);
      if (action === 'request') return await requestLink(req);
      if (action === 'verify') return await verify(req);
      if (action === 'password') return await passwordSignIn(req);
      if (action === 'logout') return json(200, { ok: true }, { 'Set-Cookie': clearCustomerCookie() });
    }

    const customer = await currentCustomer(req);
    if (!customer) return json(401, { ok: false, error: 'Not signed in' });
    if (action === 'me' && req.method === 'GET') {
      const threads = await threadsOf(customer.id);
      return json(200, { ok: true, customer: { ...publicCustomer(customer), fresh: isFresh(customerIssuedAt(req)) }, threads: threads.map(threadView), site: siteName() });
    }
    if (action === 'set-password' && req.method === 'POST') return await setPassword(req, customer);
    if (action === 'threads' && !id && req.method === 'POST') return await newThread(req, customer);
    if (action === 'threads' && isUuid(id) && parts.length === 2) {
      if (req.method === 'GET') return await openThread(customer, id);
      if (req.method === 'POST') return await reply(req, customer, id);
    }
    return json(404, { ok: false, error: 'Unknown action' });
  } catch (err) {
    return handleError(err);
  }
};

export const config = { path: ['/account', '/account/', '/api/account/*'] };
