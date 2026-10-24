import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING, QUESTIONS, config, normalizeBooking } from '../netlify/functions/lib/config.mjs';
import { ENGINE_DEFAULTS, SECTION_KEY } from '../netlify/functions/lib/booking.mjs';
import { bookingBlock, buildBookingRow, citiesFor, intakeFor, servicesFor } from '../netlify/functions/lib/booking-form.mjs';
import { renderActPage, renderManagePage } from '../netlify/functions/lib/booking-page.mjs';

// A fixture calendar so these tests do not depend on the site pack.
const FIX = normalizeBooking({
  mode: 'request',
  tz: 'America/Chicago',
  services: (c) => [...c.services.items.map((s) => ({ key: s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), label: s.title, label_es: s.title_es || '' })), { key: 'other', label: 'Something else', label_es: 'Otra cosa' }],
  intake: [
    { key: 'vehicle_year', label: 'Year', label_es: 'Año', required: true, max: 4, pattern: '(19|20)[0-9]{2}', inputmode: 'numeric' },
    { key: 'vin', label: 'VIN', max: 17, transform: 'upper', datalist: ['WDC'] },
    { key: 'size', label: 'Size', type: 'select', options: [{ value: 's', label: 'Small', label_es: 'Chico' }, 'L'] },
    { key: 'story', label: 'Story', type: 'textarea', wide: true },
  ],
  location: { kind: 'at_customer', address: true, cities: (c) => c.area.cities.map((x) => x.name) },
  notes: { label: 'What is it doing?', label_es: '¿Qué hace?', required: true, max: 50, placeholder: 'Noises…', placeholder_es: 'Ruidos…' },
  contact: ['text', 'call'],
});
const CONTENT = {
  services: { items: [{ title: 'Brakes', title_es: 'Frenos' }, { title: 'Oil & Fluids', title_es: '' }] },
  area: { cities: [{ name: 'Austin' }, { name: 'Kyle' }, { name: '' }] },
  contact: { phone: '(512) 555-0100' },
  [SECTION_KEY]: { ...ENGINE_DEFAULTS, lead: '2' },
};
const NOW = new Date('2026-09-16T15:00:00Z'); // Wed 10:00 CDT
const GOOD = { lang: 'es', service: 'brakes', date: '2026-09-17', slot: 'morning', name: ' Ana <b>x</b> ', phone: '(512) 555-0101', email: 'Ana@Example.com', contact_pref: 'call', address: '123 Main St', city: 'Kyle', vehicle_year: '2019', vin: 'wdc123', size: 'L', story: 'long', notes: 'Rattles' };

test('services / intake / cities resolve from the content document and are validated', () => {
  assert.deepEqual(servicesFor(CONTENT, FIX).map((s) => s.key), ['brakes', 'oil-fluids', 'other']);
  assert.deepEqual(intakeFor(CONTENT, FIX).map((f) => [f.key, f.type, f.required]), [['vehicle_year', 'text', true], ['vin', 'text', false], ['size', 'select', false], ['story', 'textarea', false]]);
  assert.deepEqual(citiesFor(CONTENT, FIX), ['Austin', 'Kyle']);
  assert.deepEqual(servicesFor(CONTENT, null), []);
});

test('bookingBlock renders the four steps, fallbacks, intake, location, config json and assets; escapes owner text', () => {
  const html = bookingBlock({ content: { ...CONTENT, services: { items: [{ title: '<i>Brakes</i>', title_es: 'a"b' }] } }, now: NOW, booking: FIX, success: 'Got it <b>', success_es: 'Listo', note: 'No deposit', note_es: 'Sin depósito' });
  assert.match(html, /<link rel="stylesheet" href="\/booking\/booking\.css\?v=/);
  assert.match(html, /<form class="form booking" id="booking" method="POST" action="\/api\/booking" data-booking data-tz="America\/Chicago" data-today="2026-09-16" data-last="2026-10-16" data-mode="windows">/);
  for (const step of ['service', 'day', 'time', 'details']) assert.match(html, new RegExp(`data-step="${step}"`));
  assert.match(html, /name="bot-field"/);
  // one step back from the details (shown by the script) and from what they noticed; the car is said to come next
  assert.match(html, /data-step="details"[\s\S]*?<button class="booking__back" type="button" data-booking-back hidden><span data-es="← Atrás">← Back<\/span>/);
  assert.match(html, /data-step="issues"[\s\S]*?data-booking-back>/);
  assert.ok(html.indexOf('class="booking__next"') !== -1 && html.indexOf('class="booking__next"') < html.indexOf('form__submit'), 'the car-comes-next line sits above the submit');
  assert.match(html, /<input name="date" type="date" required min="2026-09-16" max="2026-10-16">/);
  assert.match(html, /<select name="slot" required><option value="morning" data-es="Mañana \(8:00 AM a 12:00 PM\)">Morning \(8:00 AM to 12:00 PM\)<\/option>/);
  assert.match(html, /name="service" value="i-brakes-i" required><span data-es="a&quot;b">&lt;i&gt;Brakes&lt;\/i&gt;<\/span>/);
  assert.equal(html.includes('<i>Brakes</i>'), false);
  assert.match(html, /name="vehicle_year" required maxlength="4" placeholder=""|name="vehicle_year" required maxlength="4" inputmode="numeric" pattern="\(19\|20\)\[0-9\]\{2\}"/);
  assert.match(html, /name="vin"[^>]*autocapitalize="characters" spellcheck="false" data-upper list="dl-vin"/);
  assert.match(html, /<datalist id="dl-vin"><option value="WDC"><\/datalist>/);
  assert.match(html, /<select name="size"[^>]*><option value="" data-es="Elige…">Choose…<\/option><option value="s" data-es="Chico">Small<\/option><option value="L">L<\/option><\/select>/);
  assert.match(html, /<label class="field field--wide"><span data-es="Story">Story<\/span>|<label class="field field--wide"><span>Story<\/span><textarea name="story"/);
  assert.match(html, /<input name="address" type="text" required maxlength="160"/);
  assert.match(html, /<select name="city" required><option value="Austin">Austin<\/option><option value="Kyle">Kyle<\/option><option value="Other" data-es="Otra">Other<\/option><\/select>/);
  assert.match(html, /<textarea name="notes" rows="4" required maxlength="50" placeholder="Noises…" data-es-ph="Ruidos…"><\/textarea>/);
  assert.match(html, /name="contact_pref" value="text" checked/);
  assert.match(html, /name="contact_pref" value="call"/);
  assert.equal(html.includes('value="email"'), false);
  assert.match(html, /class="form__note booking__within"/);
  assert.match(html, /<p class="form__note" data-es="Sin depósito">No deposit<\/p>/);
  // the heading after sending is fixed (never "reserved" or "taken"); the owner's line sits under it
  assert.match(html, /<h3 data-es="Solicitud enviada">Request sent<\/h3>/);
  assert.match(html, /<p class="booking__nothing" data-es="Nada queda fijado hasta que el dueño confirme\.">Nothing is set until the owner confirms\.<\/p>/);
  assert.match(html, /<p class="booking__success" data-es="Listo">Got it &lt;b&gt;<\/p>/);
  // the funnel's frame: a rail (JS fills it) beside one panel that holds every view
  assert.match(html, /<ol class="booking__rail" data-booking-rail aria-label="Steps" hidden><\/ol>/);
  assert.match(html, /<div class="booking__panel" data-booking-panel tabindex="-1">/);
  for (const view of ['time', 'details', 'sent']) assert.ok(html.includes(`data-view="${view}"`), view);
  // phone and email are each optional in the markup (one of them is required server-side)
  assert.match(html, /<input name="phone" type="tel" autocomplete="tel"/);
  assert.equal(/name="phone" type="tel" required/.test(html), false);
  // the car and the notice wait, hidden, inside the sent view
  assert.match(html, /<fieldset class="form__group booking__car" data-step="car" hidden>/);
  assert.match(html, /<input name="vin" type="text" maxlength="17"[^>]*data-upper/);
  assert.match(html, /<input name="car_model" type="text" maxlength="80"/);
  assert.match(html, /<fieldset class="form__group booking__issues" data-step="issues" hidden>/);
  assert.match(html, /<p class="booking__notice" data-es="Lo que escriba aquí nos ayuda a planear, y lo leemos\. No es un diagnóstico\. PrecisionFix no se hace responsable de un autodiagnóstico, de la opinión de otro mecánico ni de información que le hayan sugerido, y no es responsable de ninguna reparación hecha sin un diagnóstico previo de PrecisionFix\. Nuestra responsabilidad es por el trabajo que diagnosticamos nosotros primero y acordamos con usted\.">What you write here helps us plan, and we read it\. It is not a diagnosis\. PrecisionFix is not responsible for a self-diagnosis, another mechanic&#39;s opinion, or any information suggested to you, and is not liable for any repair made without a diagnosis by PrecisionFix first\. Our responsibility is for the work we diagnose ourselves first and agree with you\.<\/p>/);
  assert.match(html, /<input type="checkbox" name="self_report_ack" value="true"><span data-es="He leído el aviso anterior y estoy de acuerdo">I have read the notice above and agree<\/span>/);
  // "symptom" and "diagnos" appear nowhere on the customer side but inside that notice
  const outsideNotice = html.replace(/<p class="booking__notice"[^>]*>[^<]*<\/p>/, '');
  assert.equal(/symptom|diagnos|síntoma|reserved|taken/i.test(outsideNotice), false);
  // one service: no pick, a hidden field, the day step first
  const one = bookingBlock({ content: CONTENT, now: NOW, booking: normalizeBooking({ mode: 'request', services: [{ key: 'visit', label: 'Mobile visit' }] }) });
  assert.match(one, /<input type="hidden" name="service" value="visit">/);
  assert.equal(one.includes('data-step="service"'), false);
  assert.match(one, /<span class="form__step">01<\/span><span data-es="Día">Day<\/span>/);
  assert.match(html, /href="tel:5125550100">\(512\) 555-0100</);
  assert.match(html, /<script id="booking-config" type="application\/json">\{"tz":"America\/Chicago","today":"2026-09-16","last":"2026-10-16","mode":"windows"/);
  assert.match(html, /<script src="\/booking\/booking\.js\?v=/);
  assert.equal(html.includes('${'), false);
  // step mode lists every distinct start across the week in the fallback dropdown
  const stepHtml = bookingBlock({ content: { ...CONTENT, [SECTION_KEY]: { ...ENGINE_DEFAULTS, mode: '60', hours: [{ day: 'mon', from: '09:00', to: '11:00' }, { day: 'tue', from: '10:00', to: '12:00' }] } }, now: NOW, booking: FIX });
  assert.match(stepHtml, /<select name="slot" required><option value="09:00">9:00 AM<\/option><option value="10:00">10:00 AM<\/option><option value="11:00">11:00 AM<\/option><\/select>/);
  // no calendar → nothing
  assert.equal(bookingBlock({ content: CONTENT, booking: null }), '');
  // a single contact option is a hidden field
  assert.match(bookingBlock({ content: CONTENT, now: NOW, booking: normalizeBooking({ mode: 'request', contact: ['text'] }) }), /<input type="hidden" name="contact_pref" value="text">/);
});

test('buildBookingRow: a good request becomes a clean row (clipped, uppercased, snapshotted)', () => {
  const { row, slot, service } = buildBookingRow({ body: GOOD, content: CONTENT, now: NOW, booking: FIX });
  assert.equal(service.key, 'brakes');
  assert.equal(slot.id, 'morning');
  assert.deepEqual(row, {
    status: 'requested', service_key: 'brakes', service_label: 'Brakes',
    starts_at: '2026-09-17T14:00:00.000Z', ends_at: '2026-09-17T17:00:00.000Z', tz: 'America/Chicago', window: 'Morning',
    requested_starts_at: '2026-09-17T14:00:00.000Z', requested_ends_at: '2026-09-17T17:00:00.000Z',
    name: 'Ana <b>x</b>', phone: '(512) 555-0101', email: 'ana@example.com', lang: 'es', contact_pref: 'call',
    location_kind: 'at_customer', address: '123 Main St', city: 'Kyle',
    intake: { vehicle_year: '2019', vin: 'WDC123', size: 'L', story: 'long' }, notes: 'Rattles', source: 'site',
  });
});

test('buildBookingRow rejects bad input with a 400 in the customer language', () => {
  const rej = (patch, re, lang) => {
    try { buildBookingRow({ body: { ...GOOD, ...patch }, content: CONTENT, now: NOW, booking: FIX }); assert.fail('should throw'); }
    catch (err) { assert.equal(err.status, 400); assert.match(err.message, re, JSON.stringify(patch)); if (lang) assert.equal(err.lang, undefined); }
  };
  rej({ service: 'nope' }, /Elige un servicio/);
  rej({ service: 'nope', lang: 'en' }, /Pick a service/);
  rej({ date: '2026-09-16', slot: 'morning' }, /ya no está disponible/); // morning already past the lead time
  rej({ date: '2026-09-19' }, /ya no está disponible/); // Saturday closed
  rej({ slot: 'nope' }, /ya no está/);
  rej({ name: '  ' }, /nombre/);
  rej({ phone: '12' }, /teléfono/);
  rej({ email: 'not-an-email' }, /correo/);
  rej({ phone: '', email: '' }, /Deja un correo o un teléfono/);
  rej({ phone: '', email: '', lang: 'en' }, /Leave an email or a phone/);
  rej({ address: '' }, /A dónde/);
  rej({ city: 'Dallas' }, /ciudad/);
  rej({ vehicle_year: '' }, /Año es obligatorio/);
  rej({ vehicle_year: '1800' }, /Año no parece correcto/);
  rej({ size: 'XL' }, /Elige un valor/);
  rej({ notes: '' }, /Qué hace/);
  // contact_pref outside the offer falls back; Other is a valid city; missing email is fine
  const { row } = buildBookingRow({ body: { ...GOOD, contact_pref: 'fax', city: 'Other', email: '' }, content: CONTENT, now: NOW, booking: FIX });
  assert.equal(row.contact_pref, 'text');
  assert.equal(row.city, 'Other');
  assert.equal(row.email, '');
  // an email alone is enough too
  assert.equal(buildBookingRow({ body: { ...GOOD, phone: '' }, content: CONTENT, now: NOW, booking: FIX }).row.phone, '');
});

test('the manage page renders the booking, its status, the actions, and a 404 state', () => {
  const b = { id: 'b1', status: 'requested', service_label: 'Brakes', starts_at: '2026-09-17T14:00:00Z', ends_at: '2026-09-17T17:00:00Z', tz: 'America/Chicago', window: 'Morning', name: 'Ana', phone: '5', email: 'a@x.io', lang: 'es', contact_pref: 'call', address: '1 <b>Main</b>', city: 'Kyle', intake: {}, notes: '' };
  const html = renderManagePage({ booking: b, token: 'tok', sent: true });
  assert.match(html, /<html lang="es">/);
  assert.match(html, /Solicitud enviada/);
  assert.match(html, /class="status status--requested">Esperando confirmación</);
  assert.match(html, /jueves, 17 de septiembre · Morning \(9:00/);
  assert.match(html, /1 &lt;b&gt;Main&lt;\/b&gt;, Kyle/);
  assert.match(html, /action="\/api\/booking\/manage\?t=tok"/);
  assert.match(html, /name="action" value="cancel"/);
  assert.match(html, /name="action" value="rebook"/);
  assert.equal(html.includes('${'), false);
  // the "Are you sure?" prompt must survive HTML parsing: the attribute value, once the
  // browser decodes it, is a whole confirm() call (it used to end at the first inner quote)
  const decode = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  for (const [lang, q] of [['es', '¿Seguro?'], ['en', 'Are you sure?']]) {
    const page = renderManagePage({ booking: { ...b, lang }, token: 'tok' });
    const attr = /<form [^>]*onsubmit="([^"]*)"[^>]*>/.exec(page);
    assert.ok(attr, `${lang}: the form carries one well-formed onsubmit attribute`);
    assert.equal(decode(attr[1]), `return confirm(${JSON.stringify(q)})`);
  }
  const doneHtml = renderManagePage({ booking: { ...b, status: 'cancelled', lang: 'en' }, token: 'tok', justCancelled: true });
  assert.match(doneHtml, /Cancelled\. Book again any time\./);
  assert.equal(doneHtml.includes('value="cancel"'), false);
  const gone = renderManagePage({ booking: null, token: 'x' });
  assert.match(gone, /not valid any more/);
});

test('the one-tap page: GET asks (a button that POSTs), never acts, shows no phone; Decline asks for a reason', () => {
  const b = { id: 'b1', status: 'requested', service_label: 'Brakes <b>', starts_at: '2026-09-17T14:00:00Z', ends_at: '2026-09-17T17:00:00Z', tz: 'America/Chicago', window: 'Morning', name: 'Ana <i>', phone: '(512) 555-0101', email: '', lang: 'en', contact_pref: 'text', intake: {}, notes: '' };
  const ask = renderActPage({ state: 'ask', action: 'confirm', booking: b, token: 'tok_1' });
  assert.match(ask, /<h1>Confirm Ana &lt;i&gt;\?<\/h1>/);
  assert.match(ask, /<form method="POST" action="\/api\/booking\/act\?t=tok_1&amp;do=confirm"/);
  assert.match(ask, /<button class="btn" type="submit">Confirm<\/button>/);
  assert.match(ask, /Brakes &lt;b&gt;/);
  assert.equal(/555|sms:|tel:/.test(ask), false, 'the GET page shows no phone');
  assert.equal(ask.includes('name="reason"'), false);
  assert.match(ask, /<meta name="robots" content="noindex, nofollow">/);
  const dec = renderActPage({ state: 'ask', action: 'decline', booking: b, token: 'tok_1' });
  assert.match(dec, /<h1>Decline Ana &lt;i&gt;\?<\/h1>/);
  assert.match(dec, /action="\/api\/booking\/act\?t=tok_1&amp;do=decline"/);
  assert.match(dec, /<textarea name="reason" maxlength="300"/);
  assert.match(dec, /<button class="btn btn--danger" type="submit">Decline<\/button>/);
  assert.equal(ask.includes('${'), false);
});

test('the one-tap page after the POST words the result by case and never says "emailed" when nobody was', () => {
  const b = { id: 'b1', status: 'confirmed', service_label: 'Brakes', starts_at: '2026-09-17T14:00:00Z', ends_at: '2026-09-17T17:00:00Z', tz: 'America/Chicago', window: 'Morning', name: 'Ana', phone: '(512) 555-0101', email: 'ana@example.com', lang: 'es', contact_pref: 'text', intake: {}, notes: '' };
  const sent = renderActPage({ state: 'done', action: 'confirm', booking: b, result: { emailed: true, emailReason: null } });
  assert.match(sent, /Confirmed\. Ana has been emailed\./);
  assert.equal(sent.includes('sms:'), false);
  const none = renderActPage({ state: 'done', action: 'confirm', booking: { ...b, email: '' }, result: { emailed: false, emailReason: 'no-customer-email', sms: 'sms:5125550101?&body=Hola' } });
  assert.match(none, /Confirmed\. Ana has no email: send a text\./);
  assert.match(none, /href="sms:5125550101\?&amp;body=Hola"[^>]*>Text Ana</);
  assert.match(none, /href="tel:5125550101"/);
  assert.equal(none.includes('has been emailed'), false);
  const failed = renderActPage({ state: 'done', action: 'confirm', booking: b, result: { emailed: false, emailReason: 'email-500', sms: 'sms:5125550101?&body=x' } });
  assert.match(failed, /Confirmed, but the email to Ana did not go out: send a text\./);
  assert.equal(failed.includes('has been emailed'), false);
  const badAddr = renderActPage({ state: 'done', action: 'confirm', booking: { ...b, email: 'ana@gmail..com' }, result: { emailed: false, emailReason: 'bad-customer-email', sms: 'sms:1?&body=x' } });
  assert.match(badAddr, /Confirmed\. Ana&#39;s email address does not work: send a text\./);
  const noPhone = renderActPage({ state: 'done', action: 'decline', booking: { ...b, status: 'declined', email: '', phone: '' }, result: { emailed: false, emailReason: 'no-customer-email', sms: '' } });
  assert.match(noPhone, /Declined\. Ana has no email: reach them another way\./);
  const declined = renderActPage({ state: 'done', action: 'decline', booking: { ...b, status: 'declined' }, result: { emailed: true } });
  assert.match(declined, /Declined\. Ana has been emailed\./);
  for (const html of [sent, none, failed, declined]) assert.match(html, /href="\/admin\/#bookings"/);
});

test('the one-tap page says when a link is used, expired, not valid, or the request was already handled', () => {
  const b = { id: 'b1', status: 'confirmed', service_label: 'Brakes', starts_at: '2026-09-17T14:00:00Z', ends_at: '2026-09-17T17:00:00Z', tz: 'America/Chicago', window: '', name: 'Ana', lang: 'en', intake: {} };
  assert.match(renderActPage({ state: 'used', action: 'confirm' }), /This link was already used\./);
  assert.match(renderActPage({ state: 'expired', action: 'confirm', booking: { ...b, status: 'requested' } }), /This link expired\. Confirm or decline Ana from the Bookings tab\./);
  assert.match(renderActPage({ state: 'invalid', action: '' }), /This link is not valid\./);
  assert.match(renderActPage({ state: 'handled', action: 'decline', booking: b }), /Ana&#39;s request is already confirmed\. Nothing changed\./);
  assert.match(renderActPage({ state: 'error', action: 'confirm' }), /Something went wrong/);
  for (const st of ['used', 'expired', 'invalid', 'handled', 'error']) assert.equal(renderActPage({ state: st, action: 'confirm', booking: b }).includes('<form'), false, st);
});

// The widget's month logic, run from the real public/booking/booking.js in a bare
// context (no DOM: the script exposes its pure helpers, then stops at "no form").
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function widgetHelpers() {
  const src = readFileSync(new URL('../public/booking/booking.js', import.meta.url), 'utf8');
  const win = {};
  vm.runInNewContext(src, { window: win, document: { querySelector: () => null, documentElement: {} } });
  return win.HandBookingCal;
}

test('booking widget: opens on the first month with an open day; a month with none says so and offers the next', () => {
  const raw = widgetHelpers();
  assert.ok(raw, 'booking.js exposes window.HandBookingCal');
  // values made in the vm realm: copy them into this one before deepEqual
  const plain = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const H = Object.fromEntries(Object.entries(raw).map(([k, f]) => [k, (...a) => plain(f(...a))]));
  // month end, the rest of September is dead: open on October
  assert.equal(H.firstOpenMonth([{ date: '2026-10-01' }, { date: '2026-10-02' }], '2026-09'), '2026-10');
  assert.equal(H.firstOpenMonth([{ date: '2026-09-30' }], '2026-09'), '2026-09');
  assert.equal(H.firstOpenMonth([], '2026-09'), '2026-09');
  // which months one ranged call fully answers (the server caps a call at 62 days)
  assert.deepEqual(H.coveredMonths('2026-09-30', '2026-10-30', '2026-10-30'), ['2026-09', '2026-10']);
  assert.deepEqual(H.coveredMonths('2026-09-30', '2026-12-29', '2026-12-01'), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(H.coveredMonths('2026-09-30', '2026-12-29', '2026-11-29'), ['2026-09', '2026-10']);
  // the empty state: nothing open → "Nothing open in <month>" + "See <next>", or no next at the horizon
  assert.deepEqual(H.emptyNote({}, '2026-09', true), { key: 'none_month', next: '2026-10' });
  assert.deepEqual(H.emptyNote({ '2026-09-30': [] }, '2026-12', false), { key: 'none_left', next: '' });
  assert.equal(H.emptyNote({ '2026-09-30': [{ id: 'm' }] }, '2026-09', true), null);
  assert.equal(H.emptyNote(null, '2026-09', true), null, 'still loading is not empty');
  assert.equal(H.fill('Nothing open in {month}.', 'October'), 'Nothing open in October.');
  // where the rail stands: day and time, details, sent (the car current), then all done once shared
  assert.equal(H.railPlace('time', null), 0);
  assert.equal(H.railPlace('details', null), 1);
  assert.equal(H.railPlace('sent', null), 3);
  assert.equal(H.railPlace('sent', 'skipped'), 3);
  assert.equal(H.railPlace('sent', 'done'), 4);
});

test('the widget strings carry the empty-month wording in both languages', () => {
  const html = bookingBlock({ content: CONTENT, now: NOW, booking: FIX });
  const cfg = JSON.parse(/<script id="booking-config" type="application\/json">([^<]+)<\/script>/.exec(html)[1]);
  for (const lang of ['en', 'es']) for (const k of ['none_month', 'none_left', 'see_month']) assert.match(cfg.strings[lang][k], /\{month\}/, `${lang}.${k}`);
  assert.equal(cfg.strings.en.none_month, 'Nothing open in {month}.');
  assert.equal(cfg.strings.en.see_month, 'See {month}');
});

// --- the HTTP function, with the site's own calendar (skipped on sites without one)
import handler from '../netlify/functions/booking.mjs';
import { DEFAULT_CONTENT } from '../netlify/functions/lib/site.mjs';

// mail: optional (payload, n) => status | Promise<status> to script the provider (default 200)
function fakeBackend({ rows = [], mail = null } = {}) {
  const calls = { sb: [], mail: [], events: [] };
  const realFetch = globalThis.fetch;
  // beforePatch: a hook run just before a PATCH lands (to stage a race)
  const customers = [];
  const api = { calls, rows, customers, beforePatch: null, restore() { globalThis.fetch = realFetch; for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'EMAIL_FROM']) delete process.env[k]; } };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://api.resend.com/')) {
      const payload = JSON.parse(init.body);
      calls.mail.push(payload);
      calls.events.push(`start:${payload.to.join(',')}`);
      const status = mail ? await mail(payload, calls.mail.length) : 200;
      calls.events.push(`end:${payload.to.join(',')}`);
      return { ok: status < 300, status, json: async () => ({ id: 'em_' + calls.mail.length }), text: async () => '' };
    }
    const path = u.replace(/^https:\/\/db\.test\/rest\/v1/, '');
    calls.sb.push({ method: init.method || 'GET', path, body: init.body ? JSON.parse(init.body) : undefined });
    const table = config.tables;
    if (path.startsWith(`/${table.content}`)) return { ok: true, status: 200, json: async () => [] };
    if (path.startsWith(`/${table.media}`)) return { ok: true, status: 200, json: async () => [] };
    if (table.customers && path.startsWith(`/${table.customers}`)) {
      if (init.method === 'POST') { const c = { id: 'c-' + (customers.length + 1), ...JSON.parse(init.body) }; customers.push(c); return { ok: true, status: 201, json: async () => [c] }; }
      const email = decodeURIComponent((/[?&]email=eq\.([^&]+)/.exec(path) || [])[1] || '');
      return { ok: true, status: 200, json: async () => customers.filter((c) => c.email === email) };
    }
    if (path.startsWith(`/${table.bookings}`)) {
      if (init.method === 'POST') { const row = { id: 'b-' + (rows.length + 1), created_at: '2026-09-16T15:00:00Z', updated_at: '2026-09-16T15:00:00Z', ...JSON.parse(init.body) }; rows.push(row); return { ok: true, status: 201, json: async () => [row] }; }
      if (init.method === 'PATCH') {
        if (api.beforePatch) api.beforePatch();
        const id = /[?&]id=eq\.([^&]+)/.exec(path)[1];
        const want = /[?&]status=eq\.([^&]+)/.exec(path);
        const row = rows.find((r) => r.id === id && (!want || r.status === want[1]));
        if (!row) return { ok: true, status: 200, json: async () => [] };
        Object.assign(row, JSON.parse(init.body));
        return { ok: true, status: 200, json: async () => [row] };
      }
      if (/manage_token_hash=eq\.([^&]+)/.test(path)) { const h = /manage_token_hash=eq\.([^&]+)/.exec(path)[1]; return { ok: true, status: 200, json: async () => rows.filter((r) => r.manage_token_hash === h) }; }
      if (/request_ip=eq\./.test(path)) return { ok: true, status: 200, json: async () => rows.filter((r) => r.request_ip === '9.9.9.9') };
      return { ok: true, status: 200, json: async () => rows.filter((r) => r.status === 'requested' || r.status === 'confirmed') };
    }
    throw new Error('unexpected fetch ' + u);
  };
  process.env.SUPABASE_URL = 'https://db.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  process.env.RESEND_API_KEY = 'r';
  process.env.EMAIL_FROM = 'Site <hi@example.com>';
  return api;
}
const req = (path, { method = 'GET', body, headers = {} } = {}) =>
  new Request(`https://site.test${path}`, { method, headers: { origin: 'https://site.test', 'x-nf-client-connection-ip': '9.9.9.9', ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });

test('GET /api/booking/days lists open days with offered times and never counts', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  const be = fakeBackend();
  try {
    const res = await handler(req('/api/booking/days?from=2026-01-01&to=2026-12-31'));
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.tz, BOOKING.tz);
    assert.ok(Array.isArray(data.days));
    if (data.days.length) {
      assert.deepEqual(Object.keys(data.days[0]), ['date', 'times']);
      assert.deepEqual(Object.keys(data.days[0].times[0]), ['id', 'label', 'label_es']);
    }
    assert.equal(JSON.stringify(data).includes('requested'), false);
  } finally { be.restore(); }
});

test('POST /api/booking stores a request with hashed tokens, emails the owner (one-tap links, Reply-To) and the customer (manage link); honeypot, origin and rate limit hold', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  const be = fakeBackend();
  process.env[`${config.envPrefix}_BOOKING_NOTIFY`] = 'owner@handprotocol.org';
  try {
    const content = DEFAULT_CONTENT;
    const svc = servicesFor(content)[0];
    // find the first open day/time from the API itself
    const days = (await (await handler(req('/api/booking/days'))).json()).days;
    assert.ok(days.length, 'the site has at least one open day');
    const day = days[0], time = day.times[0];
    const intake = {};
    for (const f of intakeFor(content)) intake[f.key] = f.type === 'select' ? f.options[0].value : f.pattern ? '2019' : 'x';
    const cities = citiesFor(content);
    const body = { lang: 'en', service: svc.key, date: day.date, slot: time.id, name: 'Test Booking', phone: '512-555-0102', email: 'booking-test@handprotocol.org', contact_pref: 'text', address: '1 Test St', city: cities[0] || '', notes: 'Engine test', ...intake };
    const res = await handler(req('/api/booking', { method: 'POST', body }));
    const data = await res.json();
    assert.equal(res.status, 200, JSON.stringify(data));
    assert.equal(data.ok, true);
    assert.match(data.manage_url, /^https:\/\/site\.test\/booking\/manage\?t=[A-Za-z0-9_-]{20,}$/);
    assert.equal(data.emailed, true);
    const insert = be.calls.sb.find((c) => c.method === 'POST' && c.path.startsWith(`/${config.tables.bookings}`));
    assert.equal(insert.body.status, 'requested');
    assert.equal(insert.body.name, 'Test Booking');
    assert.match(insert.body.manage_token_hash, /^[0-9a-f]{64}$/);
    assert.match(insert.body.act_token_hash, /^[0-9a-f]{64}$/);
    assert.equal(insert.body.request_ip, '9.9.9.9');
    assert.equal(insert.body.starts_at, insert.body.requested_starts_at);
    if (QUESTIONS) {
      // the email becomes an account (unverified, nobody signed in) that the booking belongs to
      assert.equal(be.customers.length, 1);
      assert.deepEqual([be.customers[0].email, be.customers[0].name, be.customers[0].email_verified_at], ['booking-test@handprotocol.org', 'Test Booking', undefined]);
      assert.equal(insert.body.customer_id, be.customers[0].id);
      assert.equal(res.headers.get('set-cookie'), null, 'a booking signs nobody in');
    }
    assert.equal(be.calls.mail.length, 2);
    const [owner, customer] = be.calls.mail;
    assert.deepEqual(owner.to, ['owner@handprotocol.org']);
    assert.equal(owner.reply_to, 'booking-test@handprotocol.org');
    assert.match(owner.subject, /^Booking request: Test Booking · /);
    assert.match(owner.html, /\/api\/booking\/act\?t=[A-Za-z0-9_-]{20,}&amp;do=confirm/);
    assert.match(owner.text, /do=decline/);
    assert.match(owner.html, /\/admin\/#bookings/);
    assert.deepEqual(customer.to, ['booking-test@handprotocol.org']);
    assert.ok(customer.html.includes(data.manage_url), 'customer mail carries the manage link');
    assert.equal(customer.attachments, undefined);
    // honeypot: says yes, stores nothing, mails nobody
    // (the Stripe key loader may read the secrets table first; it never writes)
    const touched = () => be.calls.sb.filter((c) => !c.path.includes('_secrets')).length;
    const before = touched();
    const hp = await handler(req('/api/booking', { method: 'POST', body: { ...body, 'bot-field': 'spam' } }));
    assert.equal((await hp.json()).id, null);
    assert.equal(touched(), before);
    assert.equal(be.calls.mail.length, 2);
    // cross-origin
    const xo = await handler(req('/api/booking', { method: 'POST', body, headers: { origin: 'https://evil.test' } }));
    assert.equal(xo.status, 403);
    // validation error → 400 with the message
    const badRes = await handler(req('/api/booking', { method: 'POST', body: { ...body, service: 'nope' } }));
    assert.equal(badRes.status, 400);
    assert.match((await badRes.json()).error, /Pick a service/);
    // rate limit: the fake returns every row for this ip
    for (let i = 0; i < 6; i++) be.rows.push({ id: 'r' + i, status: 'declined', request_ip: '9.9.9.9', created_at: new Date().toISOString() });
    const rl = await handler(req('/api/booking', { method: 'POST', body }));
    assert.equal(rl.status, 429);
    // the manage page + cancel flow
    const token = /t=([^&]+)/.exec(data.manage_url)[1];
    const page = await handler(req(`/booking/manage?t=${token}&sent=1`));
    assert.equal(page.status, 200);
    const pageHtml = await page.text();
    assert.match(pageHtml, /Request sent/);
    assert.match(pageHtml, /Waiting for confirmation/);
    const mj = await (await handler(req(`/api/booking/manage?t=${token}`))).json();
    assert.equal(mj.booking.status, 'requested');
    const mails = be.calls.mail.length;
    const cancel = await handler(req(`/api/booking/manage?t=${token}`, { method: 'POST', body: { action: 'cancel' } }));
    assert.deepEqual(await cancel.json(), { ok: true, status: 'cancelled', emailed: true });
    assert.equal(be.calls.mail.length, mails + 2); // owner + customer
    assert.match(be.calls.mail[mails].subject, /^Cancelled by the customer/);
    assert.match(be.calls.sb.filter((c) => c.method === 'PATCH').at(-1).path, /&status=eq\.requested$/);
    // the owner confirmed in the meantime? A cancel that lost the race is a 409 and mails nobody
    const row = be.rows.find((r) => r.manage_token_hash && r.status === 'cancelled');
    const raceMails = be.calls.mail.length;
    row.status = 'requested';
    // simulate: the read sees "requested", the write finds "confirmed"
    be.beforePatch = () => { row.status = 'confirmed'; };
    const lost = await handler(req(`/api/booking/manage?t=${token}`, { method: 'POST', body: { action: 'cancel' } }));
    assert.equal(lost.status, 409);
    assert.equal(be.calls.mail.length, raceMails);
    assert.equal(row.status, 'confirmed');
    be.beforePatch = null;
    assert.equal((await handler(req('/booking/manage?t=nope'))).status, 404);
    assert.equal((await handler(req('/api/booking/nothing'))).status, 404);
  } finally { delete process.env[`${config.envPrefix}_BOOKING_NOTIFY`]; be.restore(); }
});

test('POST /api/booking mails the owner first and alone, retries it, and reports emailed: false when the customer mail failed', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  // owner: 503 once, then a slow success; customer: 500
  let ownerTries = 0;
  const be = fakeBackend({ mail: async (p) => { if (p.to[0] === 'owner@handprotocol.org') { if (++ownerTries === 1) return 503; await new Promise((r) => setTimeout(r, 15)); return 200; } return 500; } });
  process.env[`${config.envPrefix}_BOOKING_NOTIFY`] = 'owner@handprotocol.org';
  try {
    const content = DEFAULT_CONTENT;
    const days = (await (await handler(req('/api/booking/days'))).json()).days;
    const day = days[0];
    const intake = {};
    for (const f of intakeFor(content)) intake[f.key] = f.type === 'select' ? f.options[0].value : f.pattern ? '2019' : 'x';
    const body = { lang: 'en', service: servicesFor(content)[0].key, date: day.date, slot: day.times[0].id, name: 'Ana', phone: '512-555-0102', email: 'name@gmail..com', contact_pref: 'text', address: '1 Test St', city: citiesFor(content)[0] || '', notes: 'x', ...intake };
    const res = await handler(req('/api/booking', { method: 'POST', body }));
    const data = await res.json();
    assert.equal(res.status, 200, JSON.stringify(data));
    assert.equal(data.emailed, false, 'the bad address got nothing');
    const owner = be.calls.mail.filter((m) => m.to[0] === 'owner@handprotocol.org');
    assert.equal(owner.length, 2, 'retried once after the 503');
    assert.equal('reply_to' in owner[1], false, 'no Reply-To for an address the provider may refuse');
    assert.equal(be.calls.mail.length, 2, 'nothing sent to name@gmail..com');
    // a good address: the customer mail starts only after the owner mail finished
    be.calls.mail.length = 0; be.calls.events.length = 0;
    const res2 = await handler(req('/api/booking', { method: 'POST', body: { ...body, email: 'ana@handprotocol.org' } }));
    const data2 = await res2.json();
    assert.equal(data2.emailed, false, 'the customer mail answered 500');
    assert.deepEqual(be.calls.events, ['start:owner@handprotocol.org', 'end:owner@handprotocol.org', 'start:ana@handprotocol.org', 'end:ana@handprotocol.org']);
    assert.equal(be.calls.mail[0].reply_to, 'ana@handprotocol.org');
    // the customer's own cancel answers with emailed too
    const token = /t=([^&]+)/.exec(data2.manage_url)[1];
    const cancel = await (await handler(req(`/api/booking/manage?t=${token}`, { method: 'POST', body: { action: 'cancel' } }))).json();
    assert.deepEqual(cancel, { ok: true, status: 'cancelled', emailed: false });
  } finally { delete process.env[`${config.envPrefix}_BOOKING_NOTIFY`]; be.restore(); }
});

test('a database error on the manage page renders its own error state, never the database text', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  const realFetch = globalThis.fetch;
  const realError = console.error;
  console.error = () => {};
  globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => '{"message":"column bookings.reminder_soon_sent_at does not exist"}' });
  process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  try {
    const page = await handler(req(`/booking/manage?t=${'A'.repeat(43)}`));
    assert.equal(page.status, 500);
    assert.match(page.headers.get('content-type'), /^text\/html/);
    const text = await page.text();
    assert.match(text, /<h1>Your booking<\/h1>/);
    assert.match(text, /Something went wrong/);
    assert.equal(/reminder_soon_sent_at|does not exist/.test(text), false);
    const api = await handler(req(`/api/booking/manage?t=${'A'.repeat(43)}`));
    assert.equal(api.status, 500);
    assert.deepEqual(await api.json(), { ok: false, error: 'Something went wrong' });
    const act = await handler(req(`/api/booking/act?t=${'A'.repeat(43)}&do=confirm`));
    assert.equal(act.status, 500);
    assert.equal(/reminder_soon_sent_at|does not exist/.test(await act.text()), false);
  } finally {
    globalThis.fetch = realFetch; console.error = realError;
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

// --- the car and what they noticed, posted onto the request after it is sent
import { SELF_REPORT_VERSION, buildShare } from '../netlify/functions/lib/booking-car.mjs';
import { pricingLines } from '../netlify/functions/lib/booking-pricing.mjs';

test('buildShare: the car saves vin / car_model; issues need the ticked agreement and carry the notice version', () => {
  assert.deepEqual(buildShare({ body: { vin: ' wdc0g8db5kf123456 ', car_model: '' } }), { vin: 'WDC0G8DB5KF123456', car_model: '' });
  assert.deepEqual(buildShare({ body: { car_model: ' 2019 GLE 350 ' } }), { vin: '', car_model: '2019 GLE 350' });
  assert.deepEqual(buildShare({ body: { issues: 'A squeal at idle', self_report_ack: true } }), { issues: 'A squeal at idle', self_report_ack: true, self_report_notice: SELF_REPORT_VERSION });
  assert.deepEqual(buildShare({ body: { vin: 'WDC0G8DB5KF123456', issues: 'x', self_report_ack: 'true' } }), { vin: 'WDC0G8DB5KF123456', car_model: '', issues: 'x', self_report_ack: true, self_report_notice: SELF_REPORT_VERSION });
  const rej = (body, re, lang) => { try { buildShare({ body, lang }); assert.fail('should throw'); } catch (err) { assert.equal(err.status, 400); assert.match(err.message, re); } };
  rej({ issues: 'A noise' }, /Tick the box to send what you noticed\./);
  rej({ issues: 'A noise', self_report_ack: false }, /Tick the box/);
  rej({ issues: 'A noise' }, /Marque la casilla para enviar lo que notó\./, 'es');
  rej({ vin: 'TOO-SHORT' }, /A VIN is 17 letters and numbers\./);
  rej({ vin: 'WDC0G8DB5KF12345I' }, /17 letters/); // an I is never in a VIN
  rej({}, /Nothing to share yet\./);
  // the agreement alone, with nothing noticed, is not stored
  rej({ self_report_ack: true }, /Nothing to share/);
});

test('pricing lines: the deposit toward the first hour, the surcharge, in EN and ES; nothing when the site states none', () => {
  const b = normalizeBooking({ mode: 'request', deposit: { amount: 5000, currency: 'usd' }, pricing: { hourly: 15000, surcharge: 2000 } });
  assert.deepEqual(pricingLines(b, 'en'), ['A $50.00 deposit holds your time and goes toward the first hour ($150.00): $100.00 more when we arrive, then $150.00 each hour after.', 'A $20.00 gas surcharge is added.']);
  assert.deepEqual(pricingLines(b, 'es'), ['Un depósito de $50.00 reserva su hora y cuenta para la primera hora ($150.00): $100.00 más cuando llegamos, luego $150.00 cada hora después.', 'Se añade un recargo de $20.00 por gasolina.']);
  // no hourly rate: the plain deposit line; a deposit at or past the rate: deposit line + the rate
  assert.deepEqual(pricingLines(normalizeBooking({ mode: 'request', deposit: { amount: 5000, currency: 'usd' } }), 'en'), ['A $50.00 deposit holds your time and comes off the bill.']);
  assert.deepEqual(pricingLines(normalizeBooking({ mode: 'request', deposit: { amount: 15000, currency: 'usd' }, pricing: { hourly: 15000 } }), 'en'), ['A $150.00 deposit holds your time and comes off the bill.', 'Work is $150.00 per hour.']);
  assert.deepEqual(pricingLines(normalizeBooking({ mode: 'request' }), 'en'), []);
  // deposit: false (no Stripe key): the surcharge and the hourly rate, no deposit
  assert.deepEqual(pricingLines(b, 'en', { deposit: false }), ['A $20.00 gas surcharge is added.', 'Work is $150.00 per hour.']);
  assert.deepEqual(pricingLines(b, 'es', { deposit: false }), ['Se añade un recargo de $20.00 por gasolina.', 'El trabajo es $150.00 por hora.']);
  assert.equal(normalizeBooking({ mode: 'request', pricing: {} }).pricing, null);
});

test('POST /api/booking/manage { action: share } saves the car onto the request, refuses issues without the agreement, and saves them with it', { skip: !BOOKING && 'no calendar on this site' }, async () => {
  const be = fakeBackend();
  try {
    const content = DEFAULT_CONTENT;
    const days = (await (await handler(req('/api/booking/days'))).json()).days;
    const day = days[0];
    const intake = {};
    for (const f of intakeFor(content)) intake[f.key] = f.type === 'select' ? f.options[0].value : f.pattern ? '2019' : 'x';
    const body = { lang: 'en', service: servicesFor(content)[0].key, date: day.date, slot: day.times[0].id, name: 'Ana', phone: '', email: 'ana@handprotocol.org', contact_pref: 'text', address: '1 Test St', city: citiesFor(content)[0] || '', notes: '', ...intake };
    const data = await (await handler(req('/api/booking', { method: 'POST', body }))).json();
    assert.equal(data.ok, true, JSON.stringify(data));
    const token = /t=([^&]+)/.exec(data.manage_url)[1];
    const row = be.rows.find((r) => r.name === 'Ana');
    assert.equal(row.phone, '', 'an email alone was enough');
    // the car
    const car = await handler(req(`/api/booking/manage?t=${token}`, { method: 'POST', body: { action: 'share', vin: 'wdc0g8db5kf123456', car_model: '' } }));
    assert.deepEqual(await car.json(), { ok: true, vin: 'WDC0G8DB5KF123456', car_model: '', issues: '', self_report_ack: false, self_report_notice: '' });
    const patch = be.calls.sb.filter((c) => c.method === 'PATCH').at(-1);
    assert.match(patch.path, new RegExp(`id=eq\\.${row.id}`));
    assert.deepEqual(Object.keys(patch.body).sort(), ['car_model', 'updated_at', 'vin']);
    assert.equal(row.vin, 'WDC0G8DB5KF123456');
    assert.equal(row.status, 'requested', 'never a status change');
    const mails = be.calls.mail.length;
    // what they noticed, without the box ticked: refused, nothing written
    const patches = be.calls.sb.filter((c) => c.method === 'PATCH').length;
    const no = await handler(req(`/api/booking/manage?t=${token}`, { method: 'POST', body: { action: 'share', issues: 'A squeal when braking' } }));
    assert.equal(no.status, 400);
    assert.deepEqual(await no.json(), { ok: false, error: 'Tick the box to send what you noticed.' });
    assert.equal(be.calls.sb.filter((c) => c.method === 'PATCH').length, patches);
    assert.equal(row.issues, undefined);
    const noEs = await handler(req(`/api/booking/manage?t=${token}`, { method: 'POST', body: { action: 'share', issues: 'Un chillido', lang: 'es' } }));
    assert.match((await noEs.json()).error, /Marque la casilla/);
    // ticked: saved with the agreement and the notice's version
    const yes = await handler(req(`/api/booking/manage?t=${token}`, { method: 'POST', body: { action: 'share', issues: 'A squeal when braking', self_report_ack: true } }));
    assert.deepEqual(await yes.json(), { ok: true, vin: 'WDC0G8DB5KF123456', car_model: '', issues: 'A squeal when braking', self_report_ack: true, self_report_notice: SELF_REPORT_VERSION });
    assert.equal(row.self_report_ack, true);
    assert.equal(row.self_report_notice, SELF_REPORT_VERSION);
    assert.equal(be.calls.mail.length, mails, 'a share mails nobody');
    // the manage JSON and the manage page carry it; the owner's one-tap page carries the agreement
    const mj = await (await handler(req(`/api/booking/manage?t=${token}`))).json();
    assert.equal(mj.booking.vin, 'WDC0G8DB5KF123456');
    assert.equal(mj.booking.issues, 'A squeal when braking');
    const page = await (await handler(req(`/booking/manage?t=${token}`))).text();
    assert.match(page, /<dt>VIN<\/dt><dd>WDC0G8DB5KF123456<\/dd>/);
    assert.match(page, /<dt>What you noticed<\/dt><dd>A squeal when braking<\/dd>/);
    assert.equal(page.includes('Agreed to the self-report notice'), false, 'the customer page does not carry the owner row');
    // a bad VIN, nothing at all, and a closed request
    assert.equal((await handler(req(`/api/booking/manage?t=${token}`, { method: 'POST', body: { action: 'share', vin: 'nope' } }))).status, 400);
    assert.equal((await handler(req(`/api/booking/manage?t=${token}`, { method: 'POST', body: { action: 'share' } }))).status, 400);
    row.status = 'declined';
    const closed = await handler(req(`/api/booking/manage?t=${token}`, { method: 'POST', body: { action: 'share', car_model: '2019 GLE' } }));
    assert.equal(closed.status, 409);
    assert.equal((await handler(req(`/api/booking/manage?t=${token}`, { method: 'POST', body: { action: 'share', car_model: 'x' }, headers: { origin: 'https://evil.test' } }))).status, 403);
  } finally { be.restore(); }
});

import { withoutDepositTalk } from '../netlify/functions/lib/booking.mjs';
test('the owner\'s "what to expect" loses its deposit paragraphs until the Stripe key is set', () => {
  const text = 'Thanks!\n\nA $50 deposit is required to secure your appointment.\n\nI will text before heading your way.';
  assert.equal(withoutDepositTalk(text, false), 'Thanks!\n\nI will text before heading your way.');
  assert.equal(withoutDepositTalk(text, true), text);
  assert.equal(withoutDepositTalk('Se requiere un depósito de $50.\n\nLe llamaré antes.', false), 'Le llamaré antes.');
  assert.equal(withoutDepositTalk('', false), '');
});

import { SYMPTOMS, symptomLabels } from '../netlify/functions/lib/booking-car.mjs';
test('buildShare: picked symptoms become labels on top of the free text, in the customer language; unknown keys are dropped; picks alone need the agreement too', () => {
  assert.equal(SYMPTOMS.length, 13);
  assert.deepEqual(symptomLabels(['noise', 'nope', 'light'], 'en'), ['A warning light is on', 'A noise']);
  assert.deepEqual(buildShare({ body: { noticed: ['light', 'noise'], issues: 'Since Monday', self_report_ack: true } }), { issues: 'A warning light is on, A noise\n\nSince Monday', self_report_ack: true, self_report_notice: SELF_REPORT_VERSION });
  assert.deepEqual(buildShare({ body: { noticed: 'leak,bogus', self_report_ack: 'on' }, lang: 'es' }), { issues: 'Una fuga o un charco', self_report_ack: true, self_report_notice: SELF_REPORT_VERSION });
  assert.throws(() => buildShare({ body: { noticed: ['leak'] } }), /Tick the box/);
  assert.throws(() => buildShare({ body: { noticed: ['bogus'] } }), /Nothing to share yet/);
});
test('booking.js: a saved draft or request counts as fresh inside its window only', () => {
  const H = widgetHelpers();
  assert.equal(H.isFresh({ ts: 1000 }, 2000, 5000), true);
  assert.equal(H.isFresh({ ts: 1000 }, 7000, 5000), false);
  assert.equal(H.isFresh({ ts: 9000 }, 2000, 5000), false, 'a clock from the future is not trusted');
  assert.equal(H.isFresh(null, 2000, 5000), false);
  assert.equal(H.isFresh({}, 2000, 5000), false);
});
