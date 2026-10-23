// /admin/ → Questions (config.questions): every conversation, newest first,
// unread ones flagged; open one, answer it (the customer is emailed), close
// or reopen it.
//
//   GET   /api/admin/questions               → { threads, unread, inbound }
//   GET   /api/admin/questions/summary       → { unread }
//   GET   /api/admin/questions/:id           → { thread, customer, messages } (marks it read)
//   POST  /api/admin/questions/:id           { body } → the answer
//   PATCH /api/admin/questions/:id           { status: open | closed }

import { QUESTIONS } from './config.mjs';
import { sb } from './db.mjs';
import { json, readJson } from './http.mjs';
import { customerById } from './customers.mjs';
import { cleanBody, isUuid, markRead, messagesOf, postMessage, threadById } from './questions.mjs';

const LIST_COLS = 'id,subject,car,status,owner_unread,last_author,last_message_at,created_at,customer:{customers}(name,email,phone)';
const messageView = (m) => ({ id: m.id, author: m.author, body: m.body, via: m.via, createdAt: m.created_at });

async function list() {
  const threads = (await sb(`/{threads}?select=${LIST_COLS}&order=last_message_at.desc&limit=200`)) || [];
  return json(200, { ok: true, threads, unread: threads.filter((t) => t.owner_unread).length, inbound: Boolean(QUESTIONS.inboundDomain) });
}

async function summary() {
  const rows = (await sb('/{threads}?owner_unread=eq.true&select=id&limit=200')) || [];
  return json(200, { ok: true, unread: rows.length });
}

async function open(id) {
  const thread = await threadById(id);
  if (!thread) return json(404, { ok: false, error: 'Not found' });
  const [customer, messages] = await Promise.all([customerById(thread.customer_id), messagesOf(id)]);
  if (thread.owner_unread) await markRead(id, 'owner');
  return json(200, {
    ok: true,
    thread: { ...thread, owner_unread: false },
    customer: customer && { name: customer.name, email: customer.email, phone: customer.phone, lang: customer.lang, verified: Boolean(customer.email_verified_at) },
    messages: messages.map(messageView),
  });
}

async function answer(req, editor, id) {
  const body = await readJson(req, 16 * 1024);
  const text = cleanBody(body.body);
  if (!text) return json(400, { ok: false, error: 'Write an answer first.' });
  const thread = await threadById(id);
  if (!thread) return json(404, { ok: false, error: 'Not found' });
  const customer = await customerById(thread.customer_id);
  if (!customer) return json(404, { ok: false, error: 'That customer is gone.' });
  const r = await postMessage({ thread, customer, author: 'owner', body: text, editorId: editor.id });
  return json(200, { ok: true, message: messageView(r.message), emailed: r.emailed, reason: r.reason || null });
}

async function setStatus(req, id) {
  const body = await readJson(req, 4096);
  const status = body.status === 'closed' ? 'closed' : body.status === 'open' ? 'open' : '';
  if (!status) return json(400, { ok: false, error: 'status must be open or closed' });
  if (!(await threadById(id))) return json(404, { ok: false, error: 'Not found' });
  await sb(`/{threads}?id=eq.${id}`, { method: 'PATCH', prefer: 'return=minimal', body: { status, ...(status === 'closed' ? { owner_unread: false } : {}) } });
  return json(200, { ok: true, status });
}

export async function adminQuestions(req, editor, parts) {
  if (!QUESTIONS) return json(404, { ok: false, error: 'No questions on this site' });
  const [first] = parts;
  const m = req.method;
  if (!first && m === 'GET') return list();
  if (first === 'summary' && m === 'GET') return summary();
  if (isUuid(first) && parts.length === 1) {
    if (m === 'GET') return open(first);
    if (m === 'POST') return answer(req, editor, first);
    if (m === 'PATCH') return setStatus(req, first);
  }
  return json(404, { ok: false, error: 'Unknown endpoint' });
}
