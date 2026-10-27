// PrecisionFix renderer: (content, media, origin, url) → full HTML.
//
// One semantic structure, five themes: the markup below is identical for
// every theme; <html data-theme="…"> plus /assets/themes/<id>.css turns it
// into Redline, Blueprint, Chrome & Carbon, Sunset Garage or Diagnostic.
// Small decoration slots (class "decor decor--…") are rendered always and
// switched on by the theme that uses them.
//
// Bilingual: any element with data-es swaps to Spanish when the visitor's
// browser prefers it or they tap EN / ES (site.js). Owner text goes through
// e() every time, English and Spanish alike.
//
// The #book section renders the engine's booking calendar (site/booking.mjs
// → lib/booking-form.mjs bookingBlock()): service → day → time → details,
// stored as a request the owner confirms in /admin/.

import * as B from '../netlify/functions/lib/blocks.mjs';
import { toView } from '../netlify/functions/lib/content.mjs';
import { config } from '../netlify/functions/lib/config.mjs';
import { stripeConfigured } from '../netlify/functions/lib/stripe.mjs';
import { pickTheme } from './themes.mjs';

const { e } = B;

// Text with line breaks, escaped.
const brs = (s) => e(s).replace(/\n/g, '<br>');
// <tag data-es="…">en</tag> — the Spanish twin rides along as an attribute.
const bi = (tag, en, es, cls = '', attrs = '') =>
  `<${tag}${cls ? ` class="${cls}"` : ''}${es ? ` data-es="${brs(es)}"` : ''}${attrs ? ` ${attrs}` : ''}>${brs(en)}</${tag}>`;

function httpsUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
  } catch (_) {
    return '';
  }
}

function heroTitle(headline) {
  const lines = String(headline || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((l, i) => `<span class="hero__line${i ? ' hero__line--alt' : ''}">${e(l)}</span>`).join('');
}

// "Line one\nLine two" → line one, a break, line two in <b> (the accent
// colour). Owner text is escaped; the <br> and <b> are ours. Used for the
// booking prompts' headlines, in the markup and inside data-es alike.
function mark(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  const [first, ...rest] = lines;
  return rest.length ? `${e(first)}<br><b>${e(rest.join(' '))}</b>` : e(first);
}

// "a · b · c" (EN) + "x · y · z" (ES) → <li data-es="x">a</li>… so each item
// swaps on its own; a missing Spanish item keeps the English.
function dots(en, es, cls) {
  const split = (s) => String(s || '').split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean);
  const a = split(en), b = split(es);
  if (!a.length) return '';
  return `<ul class="${cls}">${a.map((x, i) => `<li${b[i] ? ` data-es="${e(b[i])}"` : ''}>${e(x)}</li>`).join('')}</ul>`;
}

// Copy that promises the deposit (a step, a question) stays off the page until
// the site carries a Stripe key: the flow never asks for a deposit before then.
// Matched on the words, not a flag, so the owner's own edits are covered too.
const DEPOSIT_WORDS = /dep[oó]sit/i;
export function depositCopy(it) {
  return [it.title, it.body, it.q, it.a].some((t) => DEPOSIT_WORDS.test(t || ''));
}
export const showDepositCopy = () => stripeConfigured();
// The small print under the button too: dropped while it promises a deposit.
const noteFor = (t) => (showDepositCopy() || !DEPOSIT_WORDS.test(t || '') ? t : '');
export const faqItems = (c) => c.faq.items.filter((it) => it.q && it.a && (showDepositCopy() || !depositCopy(it)));

function faq(c) {
  return faqItems(c)
    .map(
      (it, i) => `<details class="faq__item reveal" style="--d:${i * 40}ms">
  <summary class="faq__q">${bi('span', it.q, it.q_es)}<span class="faq__mark" aria-hidden="true"></span></summary>
  ${bi('p', it.a, it.a_es, 'faq__a')}
</details>`
    )
    .join('\n');
}

function steps(c) {
  const items = (c.booking.steps || []).filter((s) => s.title && (showDepositCopy() || !depositCopy(s)));
  if (!items.length) return '';
  return `<div class="steps reveal">
  ${c.booking.steps_heading ? bi('h3', c.booking.steps_heading, c.booking.steps_heading_es, 'steps__title') : ''}
  <ol class="steps__list">${items
    .map(
      (s, i) => `<li class="step"><span class="step__n" aria-hidden="true">${i + 1}</span><div class="step__text">${bi('b', s.title, s.title_es, 'step__title')}${s.body ? bi('span', s.body, s.body_es, 'step__body') : ''}</div></li>`
    )
    .join('')}</ol>
</div>`;
}

// Opening hours for the structured data, from the owner's calendar hours
// (engine section `calendar`, defaults in site/booking.mjs).
const DAYS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
function openingHours(c) {
  const hours = (c.calendar && c.calendar.hours) || [];
  const ok = (t) => /^\d{2}:\d{2}$/.test(String(t || ''));
  const out = hours
    .filter((h) => DAYS[h.day] && ok(h.from) && ok(h.to))
    .map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAYS[h.day], opens: h.from, closes: h.to }));
  return out.length ? out : undefined;
}

// "(512) 571-3425" → "+15125713425" (schema.org wants E.164 when it can get it).
function e164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return digits ? `+${digits}` : undefined;
}

// "Austin, TX" → { addressLocality, addressRegion }.
function postalAddress(location) {
  const [city, region] = String(location || '').split(',').map((s) => s.trim());
  if (!city) return undefined;
  return { '@type': 'PostalAddress', addressLocality: city, ...(region ? { addressRegion: region } : {}), addressCountry: 'US' };
}

function credentials(c) {
  return c.credentials.items
    .map(
      (it, i) => `<li class="cred reveal" style="--d:${i * 70}ms">
  ${it.icon ? `<span class="cred__icon" aria-hidden="true">${e(it.icon)}</span>` : ''}
  ${bi('h3', it.title, it.title_es, 'cred__title')}
  ${it.body ? bi('p', it.body, it.body_es, 'cred__body') : ''}
</li>`
    )
    .join('\n');
}

function services(c) {
  return c.services.items
    .map(
      (s, i) => `<li class="service reveal" style="--d:${i * 50}ms">
  <span class="service__n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
  <div class="service__text">
    ${bi('h3', s.title, s.title_es, 'service__title')}
    ${s.detail ? bi('p', s.detail, s.detail_es, 'service__detail') : ''}
  </div>
  <span class="service__arrow" aria-hidden="true"></span>
</li>`
    )
    .join('\n');
}

function reasons(c) {
  return c.why.items
    .map(
      (r, i) => `<article class="reason reveal" style="--d:${i * 90}ms">
  <span class="reason__n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
  ${bi('h3', r.title, r.title_es, 'reason__title')}
  ${bi('p', r.body, r.body_es, 'reason__body')}
</article>`
    )
    .join('\n');
}

function tile(m, i) {
  const cap = m.caption ? `<span class="tile__cap">${e(m.caption)}</span>` : '';
  return `<figure class="tile reveal" style="--w:${m.width};--h:${m.height};--d:${(i % 5) * 60}ms" data-i="${i}">
  <button class="tile__btn" type="button" data-lightbox="${i}" aria-label="Open photo${m.alt ? `: ${e(m.alt)}` : ''}">
    ${B.img(m, { sizes: '(min-width: 1000px) 33vw, (min-width: 640px) 50vw, 100vw' })}
  </button>
  <figcaption class="tile__meta"><span class="tile__n">${String(i + 1).padStart(2, '0')}</span>${m.alt ? `<b class="tile__title">${e(m.alt)}</b>` : ''}${cap}</figcaption>
</figure>`;
}

function readout(c, cities) {
  const rows = [
    ['STATUS', 'MOBILE · SAME-DAY'],
    ['CERT', c.hero.badge || c.brand.name],
    ['AREA', cities.slice(0, 3).map((x) => x.name).join(' · ') || c.contact.location],
    ['LANG', 'EN · ES'],
  ];
  return `<dl class="decor decor--readout" aria-hidden="true">${rows.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}<div class="readout__cursor"><dt>&gt;</dt><dd><i></i></dd></div></dl>`;
}

// The hero's visual: a tachometer drawn in SVG, no photo (the client did not
// want the Porsche photo leading the page). 0 to 8 (×1000 RPM) across
// 240°, red zone from 6.5. Every part carries a class and takes its colour
// from --g-* variables, so each look restyles the same drawing
// (assets/site.css + assets/themes/*.css). The needle points right at rest
// and is turned by CSS (--g-idle), so reduced-motion gets a still dial.
const GAUGE = { cx: 200, cy: 200, from: 150, perUnit: 30, max: 8, redFrom: 6.5, r: 168 };

function gauge() {
  const { cx, cy, from, perUnit, max, redFrom, r } = GAUGE;
  const n2 = (x) => Number(x.toFixed(2));
  const at = (value, radius) => {
    const a = ((from + value * perUnit) * Math.PI) / 180;
    return [n2(cx + radius * Math.cos(a)), n2(cy + radius * Math.sin(a))];
  };
  const arc = (v0, v1, cls) => {
    const [x0, y0] = at(v0, r), [x1, y1] = at(v1, r);
    return `<path class="${cls}" d="M${x0} ${y0}A${r} ${r} 0 ${(v1 - v0) * perUnit > 180 ? 1 : 0} 1 ${x1} ${y1}"/>`;
  };
  const ticks = [];
  for (let half = 0; half <= max * 2; half++) {
    const v = half / 2, major = half % 2 === 0;
    const [x0, y0] = at(v, major ? r - 20 : r - 11), [x1, y1] = at(v, r);
    ticks.push(`<line class="gauge__tick${major ? ' gauge__tick--major' : ''}${v >= redFrom ? ' is-red' : ''}" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`);
  }
  const nums = [];
  for (let v = 0; v <= max; v++) {
    const [x, y] = at(v, r - 42);
    nums.push(`<text class="gauge__num${v >= redFrom ? ' is-red' : ''}" x="${x}" y="${y}">${v}</text>`);
  }
  return `<figure class="hero__media hero__gauge" aria-hidden="true">
      <svg class="gauge" viewBox="0 0 400 400" focusable="false">
        <circle class="gauge__bezel" cx="${cx}" cy="${cy}" r="190"/>
        <circle class="gauge__face" cx="${cx}" cy="${cy}" r="181"/>
        ${arc(0, max, 'gauge__track')}
        ${arc(redFrom, max, 'gauge__red')}
        ${ticks.join('')}
        ${nums.join('')}
        <text class="gauge__unit" x="${cx}" y="${cy + 62}">RPM ×1000</text>
        <g class="gauge__needle"><path d="M${cx - 30} ${cy - 3.2}L${cx + 146} ${cy - 0.9}L${cx + 146} ${cy + 0.9}L${cx - 30} ${cy + 3.2}Z"/></g>
        <circle class="gauge__hub" cx="${cx}" cy="${cy}" r="12"/>
        <circle class="gauge__pin" cx="${cx}" cy="${cy}" r="4"/>
      </svg>
      <figcaption class="hero__cap"><span class="decor decor--plate">FIG. 01</span>${bi('span', 'Dealership-level diagnostics, in your driveway', 'Diagnóstico de nivel concesionario, en tu cochera')}</figcaption>
    </figure>`;
}

function navLinks(nav) {
  const ES = { services: 'Servicios', why: 'Por qué yo', work: 'Trabajos', area: 'Zona', book: 'Reservar', creds: 'Credenciales' };
  return nav.map((n) => `<a href="#${e(n.id)}"${ES[n.id] ? ` data-es="${e(ES[n.id])}"` : ''}>${e(n.label)}</a>`).join('');
}

export function renderPage({ content, media, origin = '', url }) {
  const c = content;
  const T = pickTheme({ url, content: c });
  const views = media.map(toView);
  const featured = views.find((m) => m.featured) || views[0] || null;
  const tel = B.telHref(c.contact.phone);
  const sms = c.contact.sms ? B.smsHref(c.contact.phone) : '';
  const mail = c.contact.email ? `mailto:${c.contact.email}` : '';
  const ig = B.instagramUrl(c.contact.instagram);
  const fb = httpsUrl(c.contact.facebook_url);
  const review = httpsUrl(c.contact.google_review_url);
  const cities = c.area.cities.filter((x) => x.name);
  const v = e(config.assetVersion);

  const faqList = faqItems(c);
  const has = {
    creds: c.credentials.items.length > 0,
    services: c.services.items.length > 0,
    why: c.why.items.length > 0,
    area: Boolean(c.area.heading || cities.length),
    work: views.length > 0,
    faq: faqList.length > 0,
    book: true,
    strip: Boolean(c.cta.strip),
  };
  const nav = config.nav.filter((n) => has[n.id] !== false);
  let n = 0;
  const num = () => String(++n).padStart(2, '0');

  const bookBtn = (cls) => `<a class="btn btn--primary ${cls}" href="#book">${bi('span', c.hero.cta_primary || 'Book a visit', c.hero.cta_primary_es)}</a>`;
  const callBtn = (cls) => (tel ? `<a class="btn btn--ghost ${cls}" href="${e(tel)}">${B.ICONS.phone}${bi('span', c.hero.cta_secondary || 'Call / Text', c.hero.cta_secondary_es)}</a>` : '');
  const langToggle = c.site.lang_toggle
    ? `<button class="lang-toggle" type="button" aria-pressed="false" aria-label="EN ES: ver en español"><span class="lang-toggle__a">EN</span> <span class="lang-toggle__b">ES</span></button>`
    : '';

  const jsonLd = B.jsonLd(c, origin, featured, {
    '@type': 'AutoRepair',
    telephone: e164(c.contact.phone),
    address: postalAddress(c.contact.location),
    areaServed: cities.map((x) => ({ '@type': 'City', name: x.name })),
    openingHoursSpecification: openingHours(c),
    hasOfferCatalog: c.services.items.length
      ? {
          '@type': 'OfferCatalog',
          name: c.services.heading || 'Services',
          itemListElement: c.services.items.filter((s) => s.title).map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.title, ...(s.detail ? { description: s.detail } : {}) } })),
        }
      : undefined,
    sameAs: [ig, fb].filter(Boolean),
    knowsLanguage: ['en', 'es'],
    priceRange: '$$',
  });
  const faqLd = has.faq
    ? `<script type="application/ld+json">${B.jsonForScript({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqList.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: it.a } })),
      })}</script>`
    : '';
  const headExtra = `<link rel="stylesheet" href="/assets/themes/${e(T.id)}.css?v=${v}">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="es_US">`;
  // The wordmark stays the visual H1; the eyebrow rides inside it for screen
  // readers and search ("Precision Fix — Austin, TX · Mobile Mechanic").
  const h1Suffix = c.hero.eyebrow ? `<span class="sr"> — ${e(c.hero.eyebrow)}</span>` : '';

  return `<!DOCTYPE html>
<html lang="en" data-theme="${e(T.id)}">
<head>
${B.headTags({ content: c, featured, origin, theme: T.palette, fonts: T.fonts, extra: headExtra })}
${jsonLd}
${faqLd}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<header class="nav" id="nav">
  <div class="wrap nav__row">
    <a class="nav__brand" href="#top" aria-label="${e(c.brand.name)}, home">${B.logo()}<span class="nav__name">${e(c.brand.name)}</span></a>
    <nav class="nav__links" aria-label="Sections">${navLinks(nav)}</nav>
    <div class="nav__tools">
      ${langToggle}
      ${bookBtn('btn--sm nav__cta')}
      <button class="nav__toggle" id="navtoggle" type="button" aria-expanded="false" aria-controls="menu"><span></span><span></span><span class="sr">Menu</span></button>
    </div>
  </div>
</header>
<div class="menu__scrim" id="menuscrim" hidden></div>
<div class="menu" id="menu" hidden>
  <nav aria-label="Sections">${navLinks(nav)}</nav>
  ${tel ? `<div class="menu__cta"><a class="btn btn--ghost" href="${e(tel)}">${B.ICONS.phone}${bi('span', 'Call', 'Llamar')}</a>${sms ? `<a class="btn btn--ghost" href="${e(sms)}">${B.ICONS.message}${bi('span', 'Text', 'Texto')}</a>` : ''}</div>` : ''}
</div>

<main id="main">
<section class="hero" id="top">
  <div class="hero__bg" aria-hidden="true">
    <div class="hero__veil"></div>
    <div class="hero__fx"><i></i><i></i><i></i></div>
  </div>
  <div class="wrap hero__grid">
    <div class="hero__copy">
      ${c.hero.eyebrow ? bi('p', c.hero.eyebrow, c.hero.eyebrow_es, 'eyebrow hero__eyebrow') : ''}
      <h1 class="hero__title">${heroTitle(c.hero.headline || c.brand.name)}${h1Suffix}</h1>
      ${c.hero.subhead ? bi('p', c.hero.subhead, c.hero.subhead_es, 'hero__sub') : ''}
      <div class="hero__cta">${bookBtn('btn--lg')}${callBtn('btn--lg')}</div>
      ${dots(c.hero.trust, c.hero.trust_es, 'hero__trust')}
      ${c.hero.badge ? bi('p', c.hero.badge, c.hero.badge_es, 'hero__badge') : ''}
      <ul class="decor decor--stickers" aria-hidden="true"><li>${e(c.contact.location || 'Austin, TX')}</li><li>EN · ES</li><li data-es="Voy a ti">I come to you</li></ul>
    </div>
    ${gauge()}
    ${readout(c, cities)}
  </div>
  <p class="hero__scroll" aria-hidden="true"><span data-es="Desliza">Scroll</span><i></i></p>
</section>

${
  has.creds
    ? `<section class="section creds" id="creds">
  <div class="wrap">
    <header class="section__head reveal"><p class="eyebrow">${num()}</p>${bi('h2', c.credentials.heading, c.credentials.heading_es)}</header>
    <ul class="creds__grid">${credentials(c)}</ul>
  </div>
</section>`
    : ''
}

${
  has.services
    ? `<section class="section services" id="services">
  <div class="wrap">
    <header class="section__head reveal">
      <p class="eyebrow">${num()}</p>
      ${bi('h2', c.services.heading, c.services.heading_es)}
      ${c.services.subhead ? bi('p', c.services.subhead, c.services.subhead_es, 'lede') : ''}
    </header>
    <ol class="services__list">${services(c)}</ol>
  </div>
</section>`
    : ''
}

${
  has.why
    ? `<section class="section why" id="why">
  <div class="wrap why__inner">
    <header class="section__head reveal"><p class="eyebrow">${num()}</p>${bi('h2', c.why.heading, c.why.heading_es)}</header>
    <div class="why__grid">${reasons(c)}</div>
  </div>
</section>`
    : ''
}

${
  has.work
    ? `<section class="section work" id="work">
  <div class="wrap">
    <header class="section__head reveal">
      <p class="eyebrow">${num()}</p>
      ${bi('h2', c.work.heading, c.work.heading_es)}
      ${c.work.subhead ? bi('p', c.work.subhead, c.work.subhead_es, 'lede') : ''}
    </header>
    <div class="gallery" id="gallery">${views.map(tile).join('\n')}</div>
  </div>
</section>`
    : ''
}

${
  has.strip
    ? `<section class="cta cta--strip" aria-label="${e(c.booking.heading || 'Book a visit')}">
  <div class="wrap">
    <a class="cta__strip reveal" href="#book">
      <span class="cta__strip-text"${c.cta.strip_es ? ` data-es="${mark(c.cta.strip_es)}"` : ''}>${mark(c.cta.strip)}</span>
      <span class="btn btn--primary">${bi('span', c.cta.strip_button || c.hero.cta_primary || 'Book a visit', c.cta.strip_button_es || c.hero.cta_primary_es)}</span>
    </a>
  </div>
</section>`
    : ''
}

${
  has.area
    ? `<section class="section area" id="area">
  <div class="wrap area__inner">
    <header class="section__head reveal">
      <p class="eyebrow">${num()}</p>
      ${bi('h2', c.area.heading, c.area.heading_es)}
      ${c.area.body ? bi('p', c.area.body, c.area.body_es, 'lede') : ''}
    </header>
    ${cities.length ? `<ul class="area__tags reveal">${cities.map((x, i) => `<li style="--d:${i * 40}ms">${e(x.name)}</li>`).join('')}</ul>` : ''}
    <div class="decor decor--radar" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
  </div>
</section>`
    : ''
}

${
  has.faq
    ? `<section class="section faq" id="faq">
  <div class="wrap faq__inner">
    <header class="section__head reveal"><p class="eyebrow">${num()}</p>${bi('h2', c.faq.heading, c.faq.heading_es)}</header>
    <div class="faq__list">${faq(c)}</div>
  </div>
</section>`
    : ''
}

<section class="section book" id="book">
  <div class="wrap book__grid">
    <div class="book__copy">
      <header class="section__head reveal">
        <p class="eyebrow">${num()}</p>
        ${bi('h2', c.booking.heading, c.booking.heading_es)}
        ${c.booking.intro ? bi('p', c.booking.intro, c.booking.intro_es, 'lede') : ''}
      </header>
      <div class="contact reveal">
        ${bi('h3', c.contact.heading, c.contact.heading_es, 'contact__title')}
        ${c.contact.body ? bi('p', c.contact.body, c.contact.body_es, 'contact__body') : ''}
        ${tel ? `<a class="contact__phone" href="${e(tel)}">${e(c.contact.phone)}</a>` : ''}
        <div class="contact__actions">
          ${config.questions ? `<a class="btn btn--primary" href="/account/">${B.ICONS.message}${bi('span', 'Ask a question', 'Haz una pregunta')}</a>` : ''}
          ${tel ? `<a class="btn btn--ghost" href="${e(tel)}">${B.ICONS.phone}${bi('span', 'Call', 'Llamar')}</a>` : ''}
          ${sms ? `<a class="btn btn--ghost" href="${e(sms)}">${B.ICONS.message}${bi('span', 'Text', 'Texto')}</a>` : ''}
          ${mail ? `<a class="btn btn--ghost" href="${e(mail)}">${B.ICONS.mail}<span>Email</span></a>` : ''}
        </div>
        <dl class="contact__meta">
          ${c.contact.hours ? `<div><dt data-es="Horario">Hours</dt>${bi('dd', c.contact.hours, c.contact.hours_es)}</div>` : ''}
          ${c.contact.location ? `<div><dt data-es="Base">Based in</dt><dd>${e(c.contact.location)}</dd></div>` : ''}
          ${ig ? `<div><dt>Instagram</dt><dd><a href="${e(ig)}" rel="noopener" target="_blank">@${e(c.contact.instagram.replace(/^@/, ''))}</a></dd></div>` : ''}
          ${fb ? `<div><dt>Facebook</dt><dd><a href="${e(fb)}" rel="noopener" target="_blank" data-es="Página">Page</a></dd></div>` : ''}
          ${review ? `<div><dt>Google</dt><dd><a href="${e(review)}" rel="noopener" target="_blank" data-es="Deja una reseña">Leave a review</a></dd></div>` : ''}
        </dl>
      </div>
      ${steps(c)}
    </div>
    <div class="book__form reveal">${B.bookingBlock({ content: c, success: c.booking.success, success_es: c.booking.success_es, note: noteFor(c.booking.note), note_es: noteFor(c.booking.note_es) })}</div>
  </div>
</section>
</main>

<footer class="foot">
  <div class="wrap foot__inner">
    <a class="foot__brand" href="#top">${B.logo()}<span>${e(c.brand.name)}</span></a>
    ${c.brand.tagline ? bi('p', c.brand.tagline, c.brand.tagline_es, 'foot__tag') : ''}
    <p class="foot__note">${e(c.footer.note.replace('{year}', B.year()))}</p>
    <p class="foot__links"><a href="/privacy/" data-es="Política de privacidad">Privacy policy</a></p>
    ${B.footerLinks()}
  </div>
</footer>

<div class="callbar" id="callbar">${bookBtn('')}${tel ? `<a class="btn btn--ghost" href="${e(tel)}">${B.ICONS.phone}${bi('span', 'Call', 'Llamar')}</a>` : ''}</div>
${has.work ? B.lightboxHtml() : ''}
${B.mediaJson(views)}
${B.siteScript()}
</body>
</html>`;
}
