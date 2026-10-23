// Replies by email into a conversation (config.questions.inboundDomain).
// Resend receives mail for that domain and POSTs an `email.received` event
// (metadata only) to /api/inbound/resend, signed the Svix way; the body is
// fetched with a full-access key. The recipient address says which thread
// and which side (lib/questions.mjs replyAddress); the sender must be that
// side's own address, or the mail is dropped.
//
// Env: RESEND_WEBHOOK_SECRET (whsec_…), RESEND_INBOUND_KEY (full access; reads received mail only)

import crypto from 'node:crypto';

const TOLERANCE_SEC = 5 * 60;

// Svix signature: base64 HMAC-SHA256 of "<id>.<timestamp>.<body>" under the
// base64 part of whsec_…; the header may carry several "v1,<sig>" values.
export function verifyWebhook({ id, timestamp, signature, body }, secret = process.env.RESEND_WEBHOOK_SECRET, now = Date.now()) {
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > TOLERANCE_SEC) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const want = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return String(signature).split(' ').some((part) => {
    const [ver, sig] = part.split(',');
    if (ver !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  });
}

// "Name <a@b.c>" or "a@b.c" → "a@b.c" (lowercase), '' when there is none.
export function bareAddress(v) {
  const s = String(v || '').trim();
  const m = s.match(/<([^<>\s]+@[^<>\s]+)>/) || s.match(/([^\s<>"]+@[^\s<>"]+)/);
  return m ? m[1].toLowerCase() : '';
}

// What the person typed, without the quoted mail under it. Covers Gmail,
// Apple Mail and Outlook in English and Spanish; anything not recognised is
// kept whole (better a long message than a lost one).
const CUTS = [
  /^\s*On\b[\s\S]{0,300}?\bwrote:\s*$/m,
  /^\s*El\b[\s\S]{0,300}?\bescribió:\s*$/m,
  /^\s*-{2,}\s*(Original Message|Mensaje original)\s*-{2,}/im,
  /^\s*_{10,}\s*$/m,
  /^\s*From:\s.+$/m,
  /^\s*De:\s.+$/m,
  /^\s*Sent from my \w+/im,
  /^\s*Enviado desde mi \w+/im,
];
export function stripQuoted(text) {
  let s = String(text || '').replace(/\r\n?/g, '\n');
  for (const re of CUTS) {
    const m = s.match(re);
    if (m) s = s.slice(0, m.index);
  }
  // trailing quoted lines ("> …") left without a header
  s = s.split('\n').filter((line, i, all) => !(line.startsWith('>') && all.slice(i).every((l) => !l.trim() || l.startsWith('>')))).join('\n');
  return s.trim();
}

// Plain text from the HTML part when a mail has no text part.
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<blockquote[\s\S]*<\/blockquote>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n');
}

export async function fetchReceived(emailId, key = process.env.RESEND_INBOUND_KEY) {
  if (!key) return { ok: false, reason: 'inbound-key-missing' };
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) return { ok: false, reason: `inbound-${res.status}` };
  return { ok: true, email: await res.json() };
}
