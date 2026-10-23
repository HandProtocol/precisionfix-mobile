// Questions before booking (config.questions): a conversation per question
// between a customer (/account/) and the owner (/admin/ → Questions).
// Every message emails the other side. With questions.inboundDomain set,
// those emails carry a signed Reply-To (q.<thread>.<o|c>.<sig>@domain), so a
// reply typed in Gmail lands back in the conversation (inbound.mjs).

import crypto from 'node:crypto';
import { QUESTIONS, config } from './config.mjs';
import { sb } from './db.mjs';
import { signPayload } from './session.mjs';
import { sendEmailWithRetry } from './email.mjs';
import { ownerRecipients } from './booking-email.mjs';
import { customerReplyEmail, ownerAlertEmail } from './questions-email.mjs';

export const BODY_MAX = 5000;
export const SUBJECT_MAX = 80;
export const CAR_MAX = 120;
const NEW_PER_IP_HOUR = 5;
const MESSAGES_PER_HOUR = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => UUID_RE.test(String(v || ''));
const THREAD_COLS = 'id,customer_id,subject,car,status,owner_unread,customer_unread,last_author,last_message_at,created_at';
const MESSAGE_COLS = 'id,thread_id,author,body,via,created_at';

// Text a person typed: no control characters, at most two blank lines in a
// row, trimmed, capped.
export function cleanBody(v, max = BODY_MAX) {
  return String(v == null ? '' : v)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, max);
}
export function subjectOf(question) {
  const line = cleanBody(question).split('\n').find((l) => l.trim()) || '';
  return line.length > SUBJECT_MAX ? `${line.slice(0, SUBJECT_MAX - 1).trimEnd()}…` : line;
}

// --- reply-by-email addresses ------------------------------------------------

function addressSig(threadId, role) {
  return crypto.createHash('sha256').update(signPayload(`q:${threadId}:${role}`)).digest('hex').slice(0, 20);
}
// role 'o' = the owner replies into the thread, 'c' = the customer does.
export function replyAddress(threadId, role, domain = QUESTIONS && QUESTIONS.inboundDomain) {
  if (!domain) return '';
  return `q.${threadId}.${role}.${addressSig(threadId, role)}@${domain}`;
}
// { threadId, role } when `addr` is one of ours with a good signature, else null.
export function parseReplyAddress(addr, domain = QUESTIONS && QUESTIONS.inboundDomain) {
  const m = String(addr || '').toLowerCase().match(/<?q\.([0-9a-f-]{36})\.([oc])\.([0-9a-f]{20})@([a-z0-9.-]+)>?$/);
  if (!m || !domain || m[4] !== domain) return null;
  const want = addressSig(m[1], m[2]);
  if (!crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m[3]))) return null;
  return { threadId: m[1], role: m[2] };
}

// --- reads --------------------------------------------------------------------

export async function threadsOf(customerId) {
  return (await sb(`/{threads}?customer_id=eq.${customerId}&select=${THREAD_COLS}&order=last_message_at.desc&limit=50`)) || [];
}
export async function threadById(id) {
  if (!isUuid(id)) return null;
  const rows = await sb(`/{threads}?id=eq.${id}&select=${THREAD_COLS}`);
  return (rows && rows[0]) || null;
}
export async function messagesOf(threadId) {
  return (await sb(`/{messages}?thread_id=eq.${threadId}&select=${MESSAGE_COLS}&order=created_at.asc&limit=500`)) || [];
}
export async function markRead(threadId, who) {
  await sb(`/{threads}?id=eq.${threadId}`, { method: 'PATCH', prefer: 'return=minimal', body: who === 'owner' ? { owner_unread: false } : { customer_unread: false } });
}

// --- limits -------------------------------------------------------------------

export async function tooManyNewFromIp(ip) {
  if (!ip) return false;
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const rows = await sb(`/{threads}?request_ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}&select=id`);
  return (rows || []).length >= NEW_PER_IP_HOUR;
}
export async function tooManyMessages(customerId) {
  const threads = await threadsOf(customerId);
  if (!threads.length) return false;
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const rows = await sb(`/{messages}?thread_id=in.(${threads.map((t) => t.id).join(',')})&author=eq.customer&created_at=gte.${encodeURIComponent(since)}&select=id`);
  return (rows || []).length >= MESSAGES_PER_HOUR;
}

// --- writes -------------------------------------------------------------------

// A new conversation with its first message. Emails the owner.
export async function startThread({ customer, question, car = '', ip = '' }) {
  const body = cleanBody(question);
  const rows = await sb('/{threads}', {
    method: 'POST',
    prefer: 'return=representation',
    body: { customer_id: customer.id, subject: subjectOf(body), car: cleanBody(car, CAR_MAX), owner_unread: true, customer_unread: false, last_author: 'customer', request_ip: ip || null },
  });
  const thread = rows && rows[0];
  const sent = await postMessage({ thread, customer, author: 'customer', body, isNew: true });
  return { thread, ...sent };
}

// Adds a message and tells the other side by email. A customer writing into
// a closed conversation reopens it. Never throws on mail trouble:
// { message, emailed, reason? }.
export async function postMessage({ thread, customer, author, body, editorId = null, via = 'web', inboundId = null, isNew = false }) {
  const text = cleanBody(body);
  const rows = await sb('/{messages}', {
    method: 'POST',
    prefer: 'return=representation',
    body: { thread_id: thread.id, author, body: text, editor_id: editorId, via, inbound_id: inboundId },
  });
  const message = rows && rows[0];
  const at = (message && message.created_at) || new Date().toISOString();
  await sb(`/{threads}?id=eq.${thread.id}`, {
    method: 'PATCH',
    prefer: 'return=minimal',
    body: author === 'owner'
      ? { last_author: 'owner', last_message_at: at, customer_unread: true, owner_unread: false }
      : { last_author: 'customer', last_message_at: at, owner_unread: true, customer_unread: false, status: 'open' },
  });
  const mail = author === 'owner' ? await emailCustomer({ thread, customer, text }) : await emailOwner({ thread, customer, text, isNew });
  return { message, emailed: mail.ok, ...(mail.ok ? {} : { reason: mail.reason }) };
}

async function emailOwner({ thread, customer, text, isNew }) {
  const to = ownerRecipients();
  if (!to.length) return { ok: false, reason: 'no-owner-email' };
  const replyTo = replyAddress(thread.id, 'o') || customer.email;
  const mail = ownerAlertEmail({ customer, thread, text, isNew, adminUrl: `${config.productionUrl}/admin/#questions/${thread.id}`, byEmail: Boolean(replyAddress(thread.id, 'o')) });
  return sendEmailWithRetry({ to, ...mail, reply_to: replyTo });
}

async function emailCustomer({ thread, customer, text }) {
  const inbound = replyAddress(thread.id, 'c');
  const mail = customerReplyEmail({ customer, thread, text, url: `${config.productionUrl}/account/#t/${thread.id}`, byEmail: Boolean(inbound) });
  return sendEmailWithRetry({ to: [customer.email], ...mail, ...(inbound ? { reply_to: inbound } : {}) });
}
