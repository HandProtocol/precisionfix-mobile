// POST /api/inbound/resend: an email reply landing in a conversation
// (lib/inbound.mjs). Always answers 200 once the signature is good, so the
// provider does not retry mail that is ours to drop; 401 otherwise.

import { QUESTIONS } from './lib/config.mjs';
import { sb } from './lib/db.mjs';
import { json } from './lib/http.mjs';
import { ownerRecipients } from './lib/booking-email.mjs';
import { customerById } from './lib/customers.mjs';
import { bareAddress, fetchReceived, htmlToText, stripQuoted, verifyWebhook } from './lib/inbound.mjs';
import { parseReplyAddress, postMessage, threadById } from './lib/questions.mjs';

async function ownerAddresses() {
  const editors = (await sb('/{editors}?select=email')) || [];
  return new Set([...ownerRecipients(), ...editors.map((x) => String(x.email || '').toLowerCase())]);
}

export default async (req) => {
  if (!QUESTIONS || !QUESTIONS.inboundDomain) return json(404, { ok: false, error: 'Not found' });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' });
  const body = await req.text();
  const h = (n) => req.headers.get(n) || req.headers.get(n.replace('svix-', 'webhook-'));
  if (!verifyWebhook({ id: h('svix-id'), timestamp: h('svix-timestamp'), signature: h('svix-signature'), body })) return json(401, { ok: false });
  const drop = (why) => { console.log(`[inbound] dropped: ${why}`); return json(200, { ok: true, dropped: why }); };
  try {
    const event = JSON.parse(body);
    if (event.type !== 'email.received' || !event.data) return drop('not email.received');
    const d = event.data;
    const target = [...(d.to || []), ...(d.cc || []), ...(d.received_for || [])].map((a) => parseReplyAddress(a)).find(Boolean);
    if (!target) return drop('no conversation address');
    const thread = await threadById(target.threadId);
    if (!thread) return drop('no such conversation');
    const customer = await customerById(thread.customer_id);
    if (!customer) return drop('no customer');
    const from = bareAddress(d.from);
    const allowed = target.role === 'c' ? from === customer.email : (await ownerAddresses()).has(from);
    if (!allowed) return drop(`sender not on this side of the conversation (${target.role})`);
    const seen = await sb(`/{messages}?inbound_id=eq.${encodeURIComponent(d.email_id)}&select=id`);
    if (seen && seen.length) return drop('already stored');
    const got = await fetchReceived(d.email_id);
    if (!got.ok) { console.warn(`[inbound] could not read mail ${d.email_id}: ${got.reason}`); return json(500, { ok: false }); }
    const text = stripQuoted(got.email.text || htmlToText(got.email.html));
    if (!text) return drop('empty after removing the quoted mail');
    await postMessage({ thread, customer, author: target.role === 'c' ? 'customer' : 'owner', body: text, via: 'email', inboundId: d.email_id });
    return json(200, { ok: true });
  } catch (err) {
    console.error('[inbound] error:', err && (err.stack || err.message));
    return json(500, { ok: false });
  }
};

export const config = { path: '/api/inbound/resend' };
