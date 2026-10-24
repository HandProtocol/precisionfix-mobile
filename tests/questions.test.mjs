import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
process.env.SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.RESEND_API_KEY = 're_test';
process.env.EMAIL_FROM = 'Shop <bookings@shop.test>';
const { config, QUESTIONS } = await import('../netlify/functions/lib/config.mjs');
process.env[`${config.envPrefix}_BOOKING_NOTIFY`] = 'owner@shop.test';
const skip = !QUESTIONS && 'this site has no config.questions';

const { COOKIE, signSession } = await import('../netlify/functions/lib/session.mjs');
const { currentEditor } = await import('../netlify/functions/lib/http.mjs');
const { CUSTOMER_COOKIE } = await import('../netlify/functions/lib/customers.mjs');
const { default: account } = await import('../netlify/functions/account.mjs');
const { default: inbound } = await import('../netlify/functions/inbound.mjs');
const { adminQuestions } = await import('../netlify/functions/lib/questions-admin.mjs');
const Q = await import('../netlify/functions/lib/questions.mjs');
const I = await import('../netlify/functions/lib/inbound.mjs');

// --- an in-memory PostgREST + Resend ------------------------------------------

const T = config.tables;
function fakeWorld() {
  const db = { [T.editors]: [{ id: 'ed1', email: 'owner@shop.test', role: 'owner' }], [T.login_tokens]: [], ...(QUESTIONS ? { [T.customers]: [], [T.customer_tokens]: [], [T.threads]: [], [T.messages]: [] } : {}) };
  const mails = [], received = {};
  let n = 0;
  const match = (r, k, v) => {
    const i = v.indexOf('.'), op = v.slice(0, i), val = decodeURIComponent(v.slice(i + 1));
    if (op === 'eq') return String(r[k]) === val;
    if (op === 'ilike') return String(r[k]).toLowerCase() === val.toLowerCase();
    if (op === 'gte') return String(r[k]) >= val;
    if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').includes(String(r[k]));
    return true;
  };
  const filt = (rows, qs) => rows.filter((r) => [...qs].every(([k, v]) => ['select', 'order', 'limit'].includes(k) || match(r, k, v)));
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    if (u.hostname === 'api.resend.com' && u.pathname.startsWith('/emails/receiving/')) {
      const got = received[decodeURIComponent(u.pathname.split('/').pop())];
      return { ok: Boolean(got), status: got ? 200 : 404, json: async () => got, text: async () => '' };
    }
    if (u.hostname === 'api.resend.com') {
      mails.push(body);
      return { ok: true, status: 200, json: async () => ({ id: `mail${mails.length}` }), text: async () => '' };
    }
    const table = u.pathname.replace('/rest/v1/', ''), rows = db[table], method = init.method || 'GET';
    assert.ok(rows, `unknown table ${table}`);
    let out = [];
    if (method === 'GET') {
      out = filt(rows, u.searchParams).map((r) => (table === T.threads ? { ...r, customer: db[T.customers].find((c) => c.id === r.customer_id) } : { ...r }));
      const order = u.searchParams.get('order');
      if (order) { const [col, dir] = order.split('.'); out.sort((a, b) => (a[col] < b[col] ? -1 : 1) * (dir === 'desc' ? -1 : 1)); }
    } else if (method === 'PATCH') {
      out = filt(rows, u.searchParams);
      out.forEach((r) => Object.assign(r, body));
    } else if (method === 'POST') {
      const row = { id: crypto.randomUUID(), created_at: new Date(Date.now() + n++).toISOString(), status: 'open', owner_unread: true, customer_unread: false, failed_logins: 0, ...body };
      rows.push(row); out = [row];
    }
    return { ok: true, status: 200, json: async () => out, text: async () => '' };
  };
  return { db, mails, received };
}

const req = (path, { method = 'GET', body, cookie = '' } = {}) => new Request(`https://shop.test${path}`, {
  method, headers: { origin: 'https://shop.test', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const cookieOf = (res) => {
  const m = (res.headers.get('set-cookie') || '').match(new RegExp(`${CUSTOMER_COOKIE}=([^;]*)`));
  return m && m[1] ? `${CUSTOMER_COOKIE}=${m[1]}` : '';
};
const call = async (path, opts) => { const res = await account(req(path, opts)); return { status: res.status, data: await res.json(), cookie: cookieOf(res) }; };
const ASK = { name: 'Ana', email: 'Ana@Example.com', phone: '512 555 0101', car: '2017 C300', question: 'Grinding noise when I brake.\nHow much for pads?', lang: 'en' };

test('ask with a new email: account, signed in, thread, owner alerted, welcome link sent', { skip }, async () => {
  const realFetch = globalThis.fetch;
  const { db, mails } = fakeWorld();
  try {
    const r = await call('/api/account/ask', { method: 'POST', body: ASK });
    assert.equal(r.status, 200);
    assert.equal(r.data.signedIn, true);
    assert.ok(r.cookie, 'customer cookie set');
    const [c] = db[T.customers];
    assert.equal(c.email, 'ana@example.com');
    assert.equal(c.email_verified_at, undefined, 'not verified yet');
    assert.equal(db[T.threads][0].subject, 'Grinding noise when I brake.');
    assert.equal(db[T.messages][0].author, 'customer');
    const owner = mails.find((m) => m.to.includes('owner@shop.test'));
    assert.match(owner.subject, /New question from Ana/);
    if (QUESTIONS.inboundDomain) {
      assert.deepEqual(Q.parseReplyAddress(owner.reply_to, QUESTIONS.inboundDomain), { threadId: db[T.threads][0].id, role: 'o' }, 'Gmail Reply comes back into the thread');
    } else {
      assert.equal(owner.reply_to, 'ana@example.com', 'no inbound domain: Gmail Reply goes to the customer');
    }
    const welcome = mails.find((m) => m.to.includes('ana@example.com'));
    assert.match(welcome.html, /\/account\/\?t=[A-Za-z0-9_-]{43}#t\//);

    const me = await call('/api/account/me', { cookie: r.cookie });
    assert.equal(me.status, 200);
    assert.equal(me.data.threads.length, 1);
    assert.equal(me.data.customer.verified, false);
  } finally { globalThis.fetch = realFetch; }
});

test('ask with a known email files it there, signs nobody in, and signs out unverified sessions', { skip }, async () => {
  const realFetch = globalThis.fetch;
  const { db, mails } = fakeWorld();
  try {
    const first = await call('/api/account/ask', { method: 'POST', body: ASK });
    const again = await call('/api/account/ask', { method: 'POST', body: { ...ASK, question: 'Also the AC.' } });
    assert.equal(again.data.signedIn, false);
    assert.equal(again.cookie, '', 'no cookie for a known email');
    assert.equal(db[T.threads].length, 2);
    assert.equal(db[T.customers].length, 1);
    assert.ok(db[T.customers][0].sessions_after, 'unverified account: sessions stamped');
    assert.equal((await call('/api/account/me', { cookie: first.cookie })).status, 401, 'the earlier unverified session is out');
    assert.ok(mails.filter((m) => m.to.includes('ana@example.com')).length >= 2, 'a link went to the inbox');
  } finally { globalThis.fetch = realFetch; }
});

test('the welcome link verifies the email; then a password can be set and used', { skip }, async () => {
  const realFetch = globalThis.fetch;
  const { db, mails } = fakeWorld();
  try {
    const asked = await call('/api/account/ask', { method: 'POST', body: ASK });
    const early = await call('/api/account/set-password', { method: 'POST', body: { password: 'pads and rotors please' }, cookie: asked.cookie });
    assert.equal(early.status, 400);
    assert.equal(early.data.needVerify, true);
    const token = mails.find((m) => m.to.includes('ana@example.com')).html.match(/\?t=([A-Za-z0-9_-]{43})/)[1];
    const v = await call('/api/account/verify', { method: 'POST', body: { token } });
    assert.equal(v.status, 200);
    assert.ok(db[T.customers][0].email_verified_at);
    assert.equal((await call('/api/account/verify', { method: 'POST', body: { token } })).status, 400, 'single use');
    const set = await call('/api/account/set-password', { method: 'POST', body: { password: 'pads and rotors please' }, cookie: v.cookie });
    assert.equal(set.status, 200);
    const wrong = await call('/api/account/password', { method: 'POST', body: { email: 'ana@example.com', password: 'nope nope nope' } });
    const unknown = await call('/api/account/password', { method: 'POST', body: { email: 'who@example.com', password: 'pads and rotors please' } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.data.error, wrong.data.error);
    const ok = await call('/api/account/password', { method: 'POST', body: { email: 'ANA@example.com', password: 'pads and rotors please' } });
    assert.equal(ok.status, 200);
    assert.ok(ok.cookie);
    assert.equal(JSON.stringify(ok.data).includes('scrypt'), false);
  } finally { globalThis.fetch = realFetch; }
});

test('cookies do not cross: a customer is not an editor, an editor is not a customer, nobody reads another thread', { skip }, async () => {
  const realFetch = globalThis.fetch;
  const { db } = fakeWorld();
  try {
    const a = await call('/api/account/ask', { method: 'POST', body: ASK });
    const b = await call('/api/account/ask', { method: 'POST', body: { ...ASK, name: 'Ben', email: 'ben@example.com' } });
    const custId = db[T.customers][0].id;
    const asEditor = new Request('https://shop.test/api/admin/site', { headers: { cookie: `${COOKIE}=${a.cookie.split('=')[1]}` } });
    assert.equal(await currentEditor(asEditor), null, 'customer cookie under the editor name');
    db[T.editors].push({ id: custId, email: 'x@shop.test', role: 'owner' });
    assert.equal(await currentEditor(asEditor), null, 'even when the ids collide');
    const editorCookie = `${CUSTOMER_COOKIE}=${encodeURIComponent(signSession('ed1'))}`;
    assert.equal((await call('/api/account/me', { cookie: editorCookie })).status, 401, 'editor cookie under the customer name');
    const anaThread = db[T.threads].find((t) => t.customer_id === custId).id;
    assert.equal((await call(`/api/account/threads/${anaThread}`, { cookie: b.cookie })).status, 404);
    assert.equal((await call(`/api/account/threads/${anaThread}`, { method: 'POST', body: { body: 'hi' }, cookie: b.cookie })).status, 404);
  } finally { globalThis.fetch = realFetch; }
});

test('the owner answers: stored, customer emailed in their language, unread flags flip', { skip }, async () => {
  const realFetch = globalThis.fetch;
  const { db, mails } = fakeWorld();
  try {
    const a = await call('/api/account/ask', { method: 'POST', body: { ...ASK, lang: 'es' } });
    const id = db[T.threads][0].id;
    const editor = { id: 'ed1', email: 'owner@shop.test', role: 'owner' };
    const list = await (await adminQuestions(req('/api/admin/questions'), editor, [])).json();
    assert.equal(list.unread, 1);
    assert.equal(list.threads[0].customer.name, 'Ana');
    await adminQuestions(req(`/api/admin/questions/${id}`), editor, [id]);
    assert.equal(db[T.threads][0].owner_unread, false, 'opening marks it read');
    const sent = await (await adminQuestions(req(`/api/admin/questions/${id}`, { method: 'POST', body: { body: 'Pads are $180 installed.' } }), editor, [id])).json();
    assert.equal(sent.emailed, true);
    const toAna = mails[mails.length - 1];
    assert.deepEqual(toAna.to, ['ana@example.com']);
    assert.match(toAna.subject, /respondió/);
    assert.match(toAna.html, /Pads are \$180 installed\./);
    assert.equal(db[T.threads][0].customer_unread, true);
    const open = await call(`/api/account/threads/${id}`, { cookie: a.cookie });
    assert.equal(open.data.messages.length, 2);
    assert.equal(open.data.messages[1].author, 'owner');
    assert.equal(db[T.threads][0].customer_unread, false, 'reading clears it');
    await adminQuestions(req(`/api/admin/questions/${id}`, { method: 'PATCH', body: { status: 'closed' } }), editor, [id]);
    await call(`/api/account/threads/${id}`, { method: 'POST', body: { body: 'Book me Friday?' }, cookie: a.cookie });
    assert.equal(db[T.threads][0].status, 'open', 'a customer reply reopens it');
  } finally { globalThis.fetch = realFetch; }
});

test('the honeypot looks done and stores nothing; empty fields are refused', { skip }, async () => {
  const realFetch = globalThis.fetch;
  const { db } = fakeWorld();
  try {
    const bot = await call('/api/account/ask', { method: 'POST', body: { ...ASK, website: 'http://spam' } });
    assert.equal(bot.status, 200);
    assert.equal(db[T.customers].length, 0);
    const noQ = await call('/api/account/ask', { method: 'POST', body: { ...ASK, question: '' } });
    assert.equal(noQ.status, 400);
    assert.equal(noQ.data.field, 'question');
  } finally { globalThis.fetch = realFetch; }
});

test('reply-by-email addresses: signed per thread and side, refused when touched', { skip }, () => {
  const id = '6f1c2a34-1111-4222-8333-444455556666';
  const addr = Q.replyAddress(id, 'o', 'in.shop.test');
  assert.match(addr, /^q\.6f1c2a34-1111-4222-8333-444455556666\.o\.[0-9a-f]{20}@in\.shop\.test$/);
  assert.deepEqual(Q.parseReplyAddress(`Shop <${addr}>`, 'in.shop.test'), { threadId: id, role: 'o' });
  assert.equal(Q.parseReplyAddress(addr.replace('.o.', '.c.'), 'in.shop.test'), null, 'side swapped');
  assert.equal(Q.parseReplyAddress(addr, 'other.test'), null, 'wrong domain');
  assert.equal(Q.replyAddress(id, 'o', ''), '', 'no inbound domain, no address');
});

test('a Gmail reply lands in the conversation; unsigned, wrong-sender and repeat mail do not', { skip: !(QUESTIONS && QUESTIONS.inboundDomain) }, async () => {
  const realFetch = globalThis.fetch, realSecret = process.env.RESEND_WEBHOOK_SECRET, realKey = process.env.RESEND_INBOUND_KEY;
  const raw = 'w'.repeat(24);
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from(raw).toString('base64')}`;
  process.env.RESEND_INBOUND_KEY = 're_test';
  try {
    const { db, mails, received } = fakeWorld();
    await call('/api/account/ask', { method: 'POST', body: ASK });
    const thread = db[T.threads][0];
    const ownerTo = mails.find((m) => m.to.includes('owner@shop.test')).reply_to;
    const hook = (data, { sign = true } = {}) => {
      const body = JSON.stringify({ type: 'email.received', data }), id = `msg_${data.email_id}`, ts = String(Math.floor(Date.now() / 1000));
      const sig = crypto.createHmac('sha256', Buffer.from(raw)).update(`${id}.${ts}.${body}`).digest('base64');
      return inbound(new Request('https://shop.test/api/inbound/resend', { method: 'POST', body, headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sign ? `v1,${sig}` : 'v1,AAAA' } }));
    };
    received.e1 = { text: 'Pads are $180, Friday works.\n\nOn Thu, Oct 23, 2026 Ana wrote:\n> How much for pads?' };
    assert.equal((await hook({ email_id: 'e1', from: 'Owner <OWNER@shop.test>', to: [`PrecisionFix <${ownerTo}>`] }, { sign: false })).status, 401);
    assert.equal(db[T.messages].length, 1);
    const res = await hook({ email_id: 'e1', from: 'Owner <OWNER@shop.test>', to: ['someone@else.test', `PrecisionFix <${ownerTo}>`] });
    assert.deepEqual(await res.json(), { ok: true });
    const msg = db[T.messages][1];
    assert.equal(msg.author, 'owner'); assert.equal(msg.via, 'email'); assert.equal(msg.body, 'Pads are $180, Friday works.');
    assert.equal(thread.customer_unread, true);
    assert.ok(mails.some((m) => m.to.includes('ana@example.com') && /\$180/.test(m.html)), 'customer emailed the answer');
    assert.equal((await (await hook({ email_id: 'e1', from: 'owner@shop.test', to: [ownerTo] })).json()).dropped, 'already stored');
    received.e2 = { text: 'free money' };
    assert.match((await (await hook({ email_id: 'e2', from: 'mallory@evil.test', to: [ownerTo] })).json()).dropped, /sender not on this side/);
    assert.equal(db[T.messages].length, 2);
  } finally {
    globalThis.fetch = realFetch;
    process.env.RESEND_WEBHOOK_SECRET = realSecret ?? ''; process.env.RESEND_INBOUND_KEY = realKey ?? '';
    if (realSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    if (realKey === undefined) delete process.env.RESEND_INBOUND_KEY;
  }
});

test('inbound: Svix signatures, quoted mail stripped, sender address pulled out', () => {
  const secret = `whsec_${Buffer.from('k'.repeat(24)).toString('base64')}`;
  const body = '{"type":"email.received"}', id = 'msg_1', ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', Buffer.from('k'.repeat(24))).update(`${id}.${ts}.${body}`).digest('base64');
  assert.equal(I.verifyWebhook({ id, timestamp: ts, signature: `v1,bad v1,${sig}`, body }, secret), true);
  assert.equal(I.verifyWebhook({ id, timestamp: ts, signature: `v1,${sig}`, body: body + ' ' }, secret), false);
  assert.equal(I.verifyWebhook({ id, timestamp: String(Number(ts) - 600), signature: `v1,${sig}`, body }, secret), false, 'too old');
  assert.equal(I.stripQuoted('Friday works.\n\nOn Thu, Oct 23, 2026 at 5:01 PM PrecisionFix <q.x@in.shop.test>\nwrote:\n> Pads are $180'), 'Friday works.');
  assert.equal(I.stripQuoted('Sí, el viernes.\n\nEl jue, 23 oct 2026 a las 17:01, PrecisionFix escribió:\n> hola'), 'Sí, el viernes.');
  assert.equal(I.stripQuoted('Thanks!\n\nSent from my iPhone'), 'Thanks!');
  assert.equal(I.stripQuoted('On it.\n> old'), 'On it.');
  assert.equal(I.bareAddress('Ana Ruiz <Ana@Example.com>'), 'ana@example.com');
  assert.equal(I.htmlToText('<p>Hi<br>there</p><blockquote>old</blockquote>').trim(), 'Hi\nthere');
});

test('cleanBody and subjectOf', () => {
  assert.equal(Q.cleanBody('  a\u0007b\r\n\n\n\n\nc  '), 'ab\n\n\nc');
  assert.equal(Q.subjectOf('\n\nfirst line\nsecond'), 'first line');
  assert.equal(Q.subjectOf('x'.repeat(200)).length, 80);
});
