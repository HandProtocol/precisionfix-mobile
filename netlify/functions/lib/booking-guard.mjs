// Spam rails for the public booking endpoints, on top of booking.mjs's
// honeypot, same-origin check and per-IP hourly cap:
//
//   - one upcoming request per person: the same email or phone with a
//     request or booking still ahead gets "you already have one" and its
//     link emailed again, not a second row (the form can say "send it
//     anyway" for a second car: `another`, still under the caps below)
//   - LIMITS.contactPerDay requests per email/phone a day
//   - LIMITS.sitePerDay requests a day for the whole site (a flood cannot
//     fill the owner's calendar or eat the shared email quota)
//   - the "email me my link again" and "find my booking" mails, capped per
//     booking, per email and per IP
//
// The counter is the shared command.rate_take (migration 057, applied):
// keys are sha256 hashes, never raw emails, phones or IPs. A database
// hiccup lets the request through (logged): losing a real customer costs
// more than one extra spam row, and the per-IP cap still holds.

import crypto from 'node:crypto';
import { config } from './config.mjs';
import { sb } from './db.mjs';

export const LIMITS = {
  contactPerDay: 3,
  sitePerDay: 40,
  linkPerBookingWindow: 600, // seconds between two link mails for one booking
  linkPerBookingDay: 3,
  findPerIpHour: 5,
  findPerEmailHour: 2,
  findMaxBookings: 3,
};

const HOUR = 3600, DAY = 86400;

const hash = (v) => crypto.createHash('sha256').update(`${config.slug}:${v}`).digest('hex');

async function rpcRateTake(body) {
  return sb('/rpc/rate_take', { method: 'POST', body });
}

// One hit for (bucket, key): true when it fits under `limit` in the window.
export async function take(bucket, key, windowSeconds, limit, { rpc = rpcRateTake } = {}) {
  try {
    const ok = await rpc({ p_bucket: `${config.slug}:${bucket}`, p_key: hash(key), p_window_seconds: windowSeconds, p_limit: limit });
    return ok !== false;
  } catch (err) {
    console.warn(`[${config.slug} booking-guard] rate_take ${bucket} failed, letting it through: ${err && err.message}`);
    return true;
  }
}

export const phoneDigits = (v) => String(v || '').replace(/\D/g, '').slice(-10);
export const emailKey = (v) => String(v || '').trim().toLowerCase();

// Who a request is from, for the per-person cap: the email, else the phone.
export function contactKey(row) {
  const email = emailKey(row && row.email);
  if (email) return `e:${email}`;
  const phone = phoneDigits(row && row.phone);
  return phone.length >= 7 ? `p:${phone}` : '';
}

export function sameContact(a, b) {
  const ea = emailKey(a.email), eb = emailKey(b.email);
  if (ea && eb && ea === eb) return true;
  const pa = phoneDigits(a.phone), pb = phoneDigits(b.phone);
  return pa.length >= 7 && pa === pb;
}

// The person's request or booking still ahead, if any (`bookings` are the
// site's upcoming requested / confirmed rows).
export function findDuplicate(row, bookings, now = new Date()) {
  const t = now.getTime();
  return (bookings || []).find((b) => (b.status === 'requested' || b.status === 'confirmed') && new Date(b.ends_at || b.starts_at).getTime() > t && sameContact(row, b)) || null;
}

// Gates, each one hit when allowed. `who` is contactKey(row).
export const allowRequest = async (who, opts) => (who ? await take('booking:contact', who, DAY, LIMITS.contactPerDay, opts) : true) && take('booking:site', 'all', DAY, LIMITS.sitePerDay, opts);
export const allowLinkMail = async (bookingId, opts) => (await take('booking:link', bookingId, LIMITS.linkPerBookingWindow, 1, opts)) && take('booking:link-day', bookingId, DAY, LIMITS.linkPerBookingDay, opts);
export const allowFind = async (ip, email, opts) => (await take('booking:find-ip', ip || 'none', HOUR, LIMITS.findPerIpHour, opts)) && take('booking:find-email', emailKey(email), HOUR, LIMITS.findPerEmailHour, opts);
