import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedMedia } from '../netlify/functions/lib/config.mjs';
import { DEFAULT_CONTENT, SECTIONS, renderPage, sanitize } from '../netlify/functions/lib/site.mjs';
import { renderAdminPage } from '../netlify/functions/lib/admin-page.mjs';
import { THEMES, THEME_IDS, pickTheme } from '../site/themes.mjs';
import { CHECKLIST } from '../site/checklist.mjs';

const ORIGIN = 'https://precisionfix.test';
const full = (extra = {}) => renderPage({ content: sanitize(DEFAULT_CONTENT), media: seedMedia(), origin: ORIGIN, ...extra });

test('renders every section, the nav, the booking form, lightbox data, JSON-LD and the owner link', () => {
  const html = full();
  for (const id of ['id="creds"', 'id="services"', 'id="why"', 'id="work"', 'id="area"', 'id="book"']) assert.ok(html.includes(id), id);
  assert.match(html, /<nav class="nav__links"[^>]*><a href="#services"[^>]*>Services<\/a><a href="#why"[^>]*>Why me<\/a><a href="#work"[^>]*>Work<\/a><a href="#area"[^>]*>Area<\/a><a href="#book"[^>]*>Book<\/a><\/nav>/);
  assert.match(html, /id="site-media"/);
  assert.match(html, /id="lightbox"/);
  assert.match(html, /href="\/admin\/"/);
  assert.match(html, /"@type":"AutoRepair"/);
  assert.match(html, /"areaServed":\[\{"@type":"City","name":"Austin"\}/);
  assert.match(html, /href="tel:5125713425"/);
  assert.match(html, /class="hero__line">Precision<\/span><span class="hero__line hero__line--alt">Fix<\/span>/);
  assert.equal(html.includes('${'), false);
});

test('the hero carries no photo: an inline SVG tachometer instead; the featured photo keeps the gallery and the share preview', () => {
  const html = full();
  const start = html.indexOf('<section class="hero"');
  const hero = html.slice(start, html.indexOf('</section>', start));
  assert.ok(hero.length > 500, 'found the hero');
  assert.equal(/<img\b/.test(hero), false, 'no <img> in the hero');
  assert.equal(/hero__img|hero__photo/.test(hero), false);
  assert.match(hero, /<figure class="hero__media hero__gauge" aria-hidden="true">\s*<svg class="gauge" viewBox="0 0 400 400"/);
  const figure = hero.slice(hero.indexOf('hero__gauge'), hero.indexOf('</figure>'));
  for (let n = 0; n <= 8; n++) assert.match(figure, new RegExp(`class="gauge__num(?: is-red)?"[^>]*>${n}<`), `numeral ${n}`);
  assert.equal((figure.match(/class="gauge__tick gauge__tick--major(?: is-red)?"/g) || []).length, 9);
  assert.equal((figure.match(/class="gauge__tick(?: is-red)?"/g) || []).length, 8, 'a half-step between each pair');
  assert.equal((figure.match(/ is-red"/g) || []).length, 6, 'red zone from 6.5: ticks 6.5, 7, 7.5, 8 and numerals 7, 8');
  assert.match(figure, /class="gauge__red"/);
  assert.match(figure, /class="gauge__needle"/);
  assert.equal(/NaN|undefined|Infinity/.test(figure), false, 'every coordinate computed');
  assert.equal(/<a\b|<button\b|tabindex/.test(figure), false, 'decorative: nothing focusable');
  // bilingual caption, like the rest of the page
  assert.match(figure, /<figcaption class="hero__cap">.*data-es="[^"]+"/s);
  // the featured photo still does its other two jobs
  assert.match(html, /<meta property="og:image" content="[^"]*porsche-911-gt3-rs[^"]*">/); // through the image CDN on a real origin
  assert.match(html.slice(html.indexOf('id="gallery"')), /porsche-911-gt3-rs/);
  // and it works in every look
  for (const id of THEME_IDS) {
    const themed = full({ url: `${ORIGIN}/?theme=${id}` });
    assert.match(themed, /class="hero__media hero__gauge"/, id);
    assert.equal(/class="hero__img"|class="hero__photo"/.test(themed), false, id);
  }
});

test('the booking section renders the engine funnel: one service, no car fields before sending, the cities, the pricing in EN and ES, the owner copy', async () => {
  const html = full();
  const { BOOKING } = await import('../netlify/functions/lib/config.mjs');
  assert.ok(BOOKING && BOOKING.mode === 'request');
  assert.match(html, /<form class="form booking" id="booking" method="POST" action="\/api\/booking" data-booking data-tz="America\/Chicago"/);
  assert.match(html, /\/booking\/booking\.css\?v=/);
  assert.match(html, /\/booking\/booking\.js\?v=/);
  // every request starts on the one service: no pick, a hidden field
  assert.match(html, /<input type="hidden" name="service" value="visit">/);
  assert.equal(html.includes('data-step="service"'), false);
  assert.equal(html.includes('name="service" value="other"'), false);
  assert.match(html, /<option value="Cedar Park">Cedar Park<\/option>/);
  // nothing about the car, and no "what is it doing", before the request is sent
  const form = html.slice(html.indexOf('<form class="form booking"'), html.indexOf('</form>'));
  const beforeSent = form.slice(0, form.indexOf('class="form__done"'));
  for (const key of ['vehicle_year', 'vehicle_make', 'vehicle_model', 'mileage', 'vin', 'car_model', 'issues']) assert.equal(beforeSent.includes(`name="${key}"`), false, key);
  assert.match(beforeSent, /<textarea name="notes" rows="4" maxlength="1500" placeholder="Where the car is parked, a gate code, the best time to reach you"/);
  assert.equal(/what is the car doing|what is it doing|symptom|diagnos/i.test(beforeSent), false);
  // the pricing, right above the button, in both languages
  const actions = form.slice(form.indexOf('<div class="form__actions"'), form.indexOf('form__submit'));
  assert.match(actions, /<div class="booking__pricing" data-booking-pricing><strong data-es="Precios">Pricing<\/strong>/);
  // no Stripe key in tests: the deposit line stays off, the hourly rate says it instead
  assert.equal(/dep[oó]sit/i.test(actions), false, 'no deposit promise without a Stripe key');
  assert.ok(actions.includes('<p data-es="El trabajo es $150.00 por hora.">Work is $150.00 per hour.</p>'), 'the hourly line');
  assert.ok(!actions.includes('A $50.00 depo') || actions.includes('<p data-es="Un depósito de $50.00 reserva su hora y cuenta para la primera hora ($150.00): $100.00 más cuando llegamos, luego $150.00 cada hora después.">A $50.00 deposit holds your time and goes toward the first hour ($150.00): $100.00 more when we arrive, then $150.00 each hour after.</p>'), 'the deposit line');
  assert.ok(actions.includes('<p data-es="Se añade un recargo de $20.00 por gasolina.">A $20.00 gas surcharge is added.</p>'), 'the surcharge line');
  assert.match(form, /<button class="btn btn--primary btn--lg form__submit" type="submit"><span data-es="Pedir esta hora">Request this time<\/span><\/button>/);
  // after sending: the fixed heading, then the car and the notice (hidden until JS has the token)
  assert.match(form, /<h3 data-es="Solicitud enviada">Request sent<\/h3>/);
  assert.match(form, /Nothing is set until the owner confirms\./);
  assert.match(form, /<legend><span data-es="¿Qué carro es\?">Which car is it\?<\/span><\/legend>/);
  assert.match(form, /<legend><span data-es="¿Qué le pasa al carro\? \(opcional\)">What is going on with the car\? \(optional\)<\/span><\/legend>/);
  assert.match(form, /is not liable for any repair made without a diagnosis by PrecisionFix first/);
  assert.equal((form.match(/<label class="choice booking__chip"><input type="checkbox" name="noticed" value="/g) || []).length, 13, 'the symptom picks');
  assert.match(form, /<button class="btn btn--ghost btn--sm booking__again" type="button" data-booking-again hidden><span data-es="Pedir otra hora">Request another time<\/span><\/button>/);
  assert.match(form, /PrecisionFix is not responsible for a self-diagnosis/);
  assert.match(form, /PrecisionFix no se hace responsable de un autodiagnóstico/);
  assert.equal(/reserved|taken|\bsíntoma/i.test(form), false);
  assert.equal((form.match(/—/g) || []).length, 0, 'no em dashes');
  assert.match(html, /<select name="slot" required><option value="morning" data-es="Mañana \(8:00 AM a 11:00 AM\)">Morning \(8:00 AM to 11:00 AM\)<\/option><option value="midday"/);
  assert.match(html, /I confirm every request by text or call/);
  assert.match(html, /<p class="booking__success" data-es="Recibido\. Te escribo o te llamo en breve para confirmar la hora\.">Got it\. I will text or call you shortly to confirm a time\.<\/p>/);
  // the small print promises the deposit, so it waits for the Stripe key too (gated in site/page.mjs noteFor)
  assert.equal(html.includes('class="form__note" data-es="No pagas nada'), false, 'no deposit small print without a Stripe key');
  assert.equal(html.includes('data-netlify'), false);
  assert.equal(html.includes('/forms/booking.html'), false);
  // the calendar settings section is in the schema with PrecisionFix's defaults
  const cal = SECTIONS.find((s) => s.key === 'calendar');
  assert.ok(cal && !cal.hidden);
  const doc = sanitize(DEFAULT_CONTENT);
  assert.equal(doc.calendar.hours.length, 6);
  assert.equal(doc.calendar.windows[1].label_es, 'Mediodía');
  assert.equal(doc.calendar.lead, '4');
});

test('every theme renders with its own data-theme, stylesheet, fonts and palette; ?theme= wins over the owner pick; bad ids fall back', () => {
  for (const id of THEME_IDS) {
    const html = full({ url: `${ORIGIN}/?theme=${id}` });
    assert.ok(html.includes(`<html lang="en" data-theme="${id}">`), id);
    assert.ok(html.includes(`/assets/themes/${id}.css?v=`), id);
    assert.ok(html.includes(THEMES[id].fonts.googleCss.replace(/&/g, '&amp;')), id);
    assert.ok(html.includes(`--bg:${THEMES[id].palette.bg}`), id);
    assert.ok(html.includes(`theme-color" content="${THEMES[id].palette.bg}"`), id);
  }
  const owner = sanitize({ ...DEFAULT_CONTENT, site: { theme: 'sunset', lang_toggle: true } });
  assert.match(renderPage({ content: owner, media: seedMedia(), origin: ORIGIN }), /data-theme="sunset"/);
  assert.match(renderPage({ content: owner, media: seedMedia(), origin: ORIGIN, url: `${ORIGIN}/?theme=terminal` }), /data-theme="terminal"/);
  assert.equal(pickTheme({ url: `${ORIGIN}/?theme=nope`, content: owner }).id, 'sunset');
  assert.equal(pickTheme({ url: 'not a url', content: {} }).id, 'redline');
  assert.equal(sanitize({ site: { theme: 'bogus' } }).site.theme, 'redline');
});

test('escapes owner text in English and Spanish, including inside data-es and form options', () => {
  const c = sanitize({
    hero: { headline: '<script>x</script>\nhi', subhead_es: '"><img src=x>' },
    brand: { name: '"><b>n</b>' },
    services: { items: [{ title: '<i>svc</i>', title_es: 'a"b' }] },
  });
  const html = renderPage({ content: c, media: seedMedia() });
  for (const bad of ['<script>x</script>', '<img src=x>', '<b>n</b>', '<i>svc</i>', 'data-es="a"b"']) assert.equal(html.includes(bad), false, bad);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-es="&quot;&gt;&lt;img src=x&gt;"/);
});

test('conversion: trust line, booking prompts after Services and the photos, what-happens-next steps, the FAQ, and the call bar', () => {
  const html = full();
  // hero: the reassurance items swap one by one, the wordmark H1 carries the eyebrow for search
  assert.match(html, /<h1 class="hero__title"><span class="hero__line">Precision<\/span><span class="hero__line hero__line--alt">Fix<\/span><span class="sr"> — Austin, TX · Mobile Mechanic<\/span><\/h1>/);
  assert.match(html, /<ul class="hero__trust"><li data-es="Cotización clara primero">Clear quote first<\/li><li data-es="No pagas hasta que confirme">Nothing to pay until I confirm<\/li>/);
  // the band sits between Services and Why me, the strip between Work and Area
  const at = (s) => html.indexOf(s);
  assert.equal(html.includes('id="cta"'), false, 'no band after Services (removed 2026-10-14)');
  assert.ok(at('id="work"') < at('cta--strip') && at('cta--strip') < at('id="area"'), 'strip after the photos');
  assert.match(html, /<a class="cta__strip reveal" href="#book">\s*<span class="cta__strip-text" data-es="¿Tu auto es el siguiente\?<br><b>Reserva una visita\.<\/b>">Your car next\?<br><b>Book a visit\.<\/b><\/span>\s*<span class="btn btn--primary"><span data-es="Elegir un horario">Pick a time<\/span><\/span>/);
  // FAQ: native <details>, between Area and Book, numbered like the other sections
  assert.ok(at('id="area"') < at('id="faq"') && at('id="faq"') < at('id="book"'), 'FAQ before the form');
  assert.equal((html.match(/<details class="faq__item reveal"/g) || []).length, DEFAULT_CONTENT.faq.items.length - 1, 'the deposit question waits for the Stripe key');
  assert.equal(html.includes('Do I need to pay to book?'), false);
  assert.match(html, /<summary class="faq__q"><span data-es="¿De verdad vienes a mí\?">Do you really come to me\?<\/span>/);
  // the steps live in the booking column
  const book = html.slice(at('id="book"'), at('<footer'));
  assert.match(book, /<h3 class="steps__title" data-es="Qué sigue">What happens next<\/h3>/);
  assert.equal((book.match(/<li class="step">/g) || []).length, 3, 'the deposit step waits for the Stripe key');
  assert.equal(/dep[oó]sit/i.test(book), false);
  assert.match(book, /<span class="step__n" aria-hidden="true">1<\/span>/);
  // the persistent CTAs stay: header button (desktop), call bar (phones), hidden behind the open menu
  assert.match(html, /<a class="btn btn--primary btn--sm nav__cta" href="#book">/);
  assert.match(html, /<div class="callbar" id="callbar"><a class="btn btn--primary " href="#book">/);
  // owner text in the prompts is escaped, in both languages
  const nasty = sanitize({ cta: { strip: '<b>x</b>\n"y"', strip_es: 'a"b' }, faq: { items: [{ q: '<q>', q_es: 'x', a: '"a"', a_es: 'y' }] } });
  const bad = renderPage({ content: nasty, media: [] });
  assert.match(bad, /&lt;b&gt;x&lt;\/b&gt;<br><b>&quot;y&quot;<\/b>/);
  assert.match(bad, /data-es="a&quot;b"/);
  assert.match(bad, /<span data-es="x">&lt;q&gt;<\/span>/);
  assert.equal(bad.includes('<q>'), false);
});

test('search: AutoRepair structured data with address, E.164 phone, opening hours and the services catalog; FAQPage; share locale tags', () => {
  const html = full();
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"AutoRepair"[\s\S]*?)<\/script>/)[1]);
  assert.equal(ld.telephone, '+15125713425');
  assert.deepEqual(ld.address, { '@type': 'PostalAddress', addressLocality: 'Austin', addressRegion: 'TX', addressCountry: 'US' });
  assert.equal(ld.openingHoursSpecification.length, 6);
  assert.deepEqual(ld.openingHoursSpecification[5], { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '09:00', closes: '15:00' });
  assert.equal(ld.hasOfferCatalog.itemListElement.length, DEFAULT_CONTENT.services.items.length);
  assert.equal(ld.hasOfferCatalog.itemListElement[1].itemOffered.name, 'Brake Service');
  assert.deepEqual(ld.areaServed[0], { '@type': 'City', name: 'Austin' });
  const faq = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?)<\/script>/)[1]);
  assert.equal(faq.mainEntity.length, DEFAULT_CONTENT.faq.items.length - 1, 'the deposit question is off the FAQPage too until the Stripe key');
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, DEFAULT_CONTENT.faq.items[0].a);
  assert.match(html, /<meta property="og:locale" content="en_US">\n<meta property="og:locale:alternate" content="es_US">/);
  assert.match(html, /<meta property="og:image:alt" content="Porsche 911 GT3 RS in the shop">/);
  // no FAQ, no FAQPage; no hours, no openingHoursSpecification; a bare phone stays a plain string
  const bare = renderPage({ content: sanitize({ faq: { items: [] }, calendar: { hours: [] }, contact: { phone: '12345', location: '' } }), media: [] });
  assert.equal(bare.includes('"FAQPage"'), false);
  assert.equal(bare.includes('openingHoursSpecification'), false);
  assert.equal(bare.includes('"PostalAddress"'), false);
  assert.match(bare, /"telephone":"\+12345"/);
});

test('emptied lists hide their sections and drop their nav links; the language switch can be turned off', () => {
  const c = sanitize({ credentials: { items: [] }, services: { items: [] }, why: { items: [] }, area: { heading: '', cities: [] }, site: { lang_toggle: false }, faq: { items: [] }, cta: { strip: '' }, booking: { steps: [] }, hero: { trust: '' } });
  const html = renderPage({ content: c, media: [] });
  for (const id of ['id="creds"', 'id="services"', 'id="why"', 'id="work"', 'id="area"', 'id="lightbox"', 'lang-toggle', 'id="faq"', 'id="cta"', 'cta--strip', 'class="steps', 'hero__trust']) assert.equal(html.includes(id), false, id);
  assert.match(html, /<nav class="nav__links"[^>]*><a href="#book"[^>]*>Book<\/a><\/nav>/);
  assert.match(html, /id="book"/);
  assert.match(html, /<input type="hidden" name="service" value="visit">/);
});

test('the Search Console code becomes a meta tag; the schema carries the hidden setup section; the admin has a Setup tab', () => {
  const c = sanitize({ seo: { google_verification: 'AbC123_-xyzXYZ' } });
  assert.match(renderPage({ content: c, media: seedMedia() }), /<meta name="google-site-verification" content="AbC123_-xyzXYZ">/);
  const setup = SECTIONS.find((s) => s.key === 'setup');
  assert.ok(setup && setup.hidden);
  assert.deepEqual(setup.fields.map((f) => f.key), CHECKLIST.map((i) => i.id));
  assert.equal(sanitize({ setup: { domain: true } }).setup.domain, true);
  const admin = renderAdminPage();
  assert.match(admin, /data-go="setup"/);
  for (const it of CHECKLIST) assert.ok(admin.includes(`data-setup="${it.id}"`), it.id);
  assert.match(admin, /Namecheap/);
  assert.equal(admin.includes('${'), false);
});

test('with a Stripe key the deposit copy comes back: the step, the question, the pricing line', () => {
  process.env.PRECISIONFIX_STRIPE_SECRET_KEY = 'sk_test_x';
  try {
    const html = full();
    assert.match(html, /<b class="step__title" data-es="Asegúralo con un depósito de \$50">Lock it in with a \$50 deposit<\/b>/);
    assert.equal((html.match(/<li class="step">/g) || []).length, 4);
    assert.ok(html.includes('Do I need to pay to book?'));
    assert.equal((html.match(/<details class="faq__item reveal"/g) || []).length, DEFAULT_CONTENT.faq.items.length);
    assert.ok(html.includes('A $50.00 deposit holds your time and goes toward the first hour ($150.00)'));
  } finally {
    delete process.env.PRECISIONFIX_STRIPE_SECRET_KEY;
  }
});
